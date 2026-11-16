import nodemailer from "nodemailer";
import type { Settings } from "./config.js";
import { escapeHtml } from "./text.js";
import type { MatchResult } from "./types.js";

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  remotive: "Remotive",
  remoteok: "Remote OK",
  weworkremotely: "We Work Remotely",
};

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function ago(iso: string | undefined, now: Date): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const h = Math.max(0, Math.round((now.getTime() - t) / 3_600_000));
  if (h < 1) return "just posted";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

function tidyLocation(loc: string): string {
  const parts = [...new Set(loc.split(/\s*·\s*/).filter(Boolean))];
  const s = parts.slice(0, 3).join(" · ");
  return parts.length > 3 ? `${s} +${parts.length - 3} more` : s;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
}

export function renderDigest(matches: MatchResult[], profileName: string, opts: { now?: Date; moreCount?: number } = {}): Digest {
  const now = opts.now ?? new Date();
  const n = matches.length;
  const more = opts.moreCount ?? 0;
  const top = matches[0]?.job;
  const companies = [...new Set(matches.map((m) => m.job.company))];
  const subject =
    n === 1 && top
      ? `New job match: ${top.title} at ${top.company}`
      : `${n} new job matches — ${companies.slice(0, 2).join(", ")}${companies.length > 2 ? " & more" : ""}`;

  const when = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const cards = matches
    .map((m, i) => {
      const j = m.job;
      const tag =
        m.locationClass === "remote-india"
          ? `<span style="background:#e7f5ec;color:#1d6b3a;border-radius:4px;padding:2px 6px;font-size:12px;">Remote · India</span>`
          : `<span style="background:#eef2fb;color:#2c4a8a;border-radius:4px;padding:2px 6px;font-size:12px;">On-site / Hybrid</span>`;
      const meta = [escapeHtml(tidyLocation(j.location)), ago(j.postedAt, now), SOURCE_LABEL[j.source] ?? j.source]
        .filter(Boolean)
        .join(" &nbsp;·&nbsp; ");
      return `
      <tr><td style="padding:14px 0;border-top:${i === 0 ? "none" : "1px solid #ececec"};">
        <div style="font-size:16px;font-weight:600;color:#111;line-height:1.35;">
          <a href="${escapeHtml(j.url)}" style="color:#111;text-decoration:none;">${escapeHtml(j.title)}</a>
        </div>
        <div style="font-size:14px;color:#333;margin:3px 0 6px;">${escapeHtml(j.company)} &nbsp;${tag}</div>
        <div style="font-size:12px;color:#777;margin-bottom:6px;">${meta}</div>
        <div style="font-size:13px;color:#555;line-height:1.45;">${escapeHtml(m.reasons.join(" · "))}</div>
        <div style="margin-top:8px;">
          <a href="${escapeHtml(j.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:13px;padding:7px 14px;border-radius:6px;">View &amp; apply</a>
          <span style="font-size:12px;color:#999;margin-left:8px;">match score ${Math.round(m.score)}</span>
        </div>
      </td></tr>`;
    })
    .join("");

  const moreNote = more > 0 ? `<p style="font-size:13px;color:#777;">+${more} more matches will come in the next email.</p>` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:10px;padding:24px 24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td>
          <div style="font-size:13px;color:#888;">Job Finder · ${escapeHtml(when)} IST</div>
          <h1 style="font-size:20px;margin:6px 0 4px;color:#111;">Hi ${escapeHtml(firstName(profileName))}, ${n} new ${n === 1 ? "role matches" : "roles match"} your profile</h1>
          <p style="font-size:14px;color:#555;margin:0 0 8px;">Full-stack / backend / frontend roles in India or remote-India, sorted by fit. Each job is sent only once.</p>
        </td></tr>
        ${cards}
        <tr><td style="padding:16px 0 4px;border-top:1px solid #ececec;">
          ${moreNote}
          <p style="font-size:12px;color:#999;margin:0;">Matched automatically from public company job boards — check the posting before applying. Listings from Remotive, Remote OK and We Work Remotely link back to the original source.</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text =
    `Hi ${firstName(profileName)}, ${n} new job ${n === 1 ? "match" : "matches"} (${when} IST)\n\n` +
    matches
      .map((m, i) => {
        const j = m.job;
        return `${i + 1}. ${j.title} — ${j.company}\n   ${tidyLocation(j.location)}${j.postedAt ? ` · ${ago(j.postedAt, now)}` : ""}\n   ${m.reasons.join(" · ")}\n   ${j.url}`;
      })
      .join("\n\n") +
    (more > 0 ? `\n\n+${more} more matches in the next email.` : "") +
    "\n\n— Job Finder";

  return { subject, html, text };
}

export function createMailer(s: Settings) {
  const transport = nodemailer.createTransport({
    host: s.smtp.host,
    port: s.smtp.port,
    secure: s.smtp.secure,
    auth: { user: s.smtp.user, pass: s.smtp.pass },
  });
  return {
    verify: () => transport.verify(),
    async send(msg: { to: string[]; bcc?: string[]; subject: string; html: string; text: string }) {
      const info = await transport.sendMail({
        from: s.mailFrom.includes("<") ? s.mailFrom : `Job Finder <${s.mailFrom}>`,
        to: msg.to,
        bcc: msg.bcc?.length ? msg.bcc : undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      return info.messageId as string;
    },
    close: () => transport.close(),
  };
}

export type Mailer = ReturnType<typeof createMailer>;

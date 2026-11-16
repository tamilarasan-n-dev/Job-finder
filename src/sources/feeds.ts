/**
 * Remote-job aggregator feeds. Most listings here are worldwide/US, so the
 * location filter in the matcher drops anything not explicitly open to India.
 */
import { XMLParser } from "fast-xml-parser";
import { get, getJson } from "../http.js";
import { htmlToText } from "../text.js";
import type { Job } from "../types.js";

// ───────────── Remotive ─────────────
// GET https://remotive.com/api/remote-jobs?category=software-dev
// Their terms ask for a link back to the original listing — we always link to job.url.

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  description?: string;
  category?: string;
}

export function parseRemotive(data: { jobs?: RemotiveJob[] }): Job[] {
  return (data.jobs ?? []).map((j) => ({
    id: `remotive:${j.id}`,
    source: "remotive",
    externalId: String(j.id),
    title: j.title.trim(),
    company: j.company_name,
    location: `Remote · ${j.candidate_required_location || "Worldwide"}`,
    remote: true,
    url: j.url,
    postedAt: j.publication_date ? toIso(j.publication_date) : undefined,
    description: htmlToText(j.description),
    department: j.category,
  }));
}

export async function fetchRemotive(): Promise<Job[]> {
  return parseRemotive(await getJson("https://remotive.com/api/remote-jobs?category=software-dev"));
}

// ───────────── RemoteOK ─────────────
// GET https://remoteok.com/api  — first element is a legal notice, not a job.

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  date?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  tags?: string[];
}

export function parseRemoteOk(data: RemoteOkJob[]): Job[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((j) => j.id !== undefined && j.position)
    .map((j) => ({
      id: `remoteok:${j.id}`,
      source: "remoteok" as const,
      externalId: String(j.id),
      title: String(j.position).trim(),
      company: j.company ?? "Unknown",
      location: `Remote · ${j.location || "Worldwide"}`,
      remote: true,
      url: j.url || `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
      postedAt: j.date,
      description: [htmlToText(j.description), (j.tags ?? []).join(", ")].filter(Boolean).join("\n"),
    }));
}

export async function fetchRemoteOk(): Promise<Job[]> {
  return parseRemoteOk(await getJson("https://remoteok.com/api"));
}

// ───────────── We Work Remotely (RSS) ─────────────
// GET https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss (+ back-end, front-end)

const WWR_FEEDS = [
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
];

interface RssItem {
  title?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  region?: string;
  description?: string;
}

export function parseWwr(xml: string): Job[] {
  const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const raw = doc.rss?.channel?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items
    .filter((i) => i.title && i.link)
    .map((i) => {
      // WWR titles look like "Company: Job Title"
      const t = String(i.title);
      const idx = t.indexOf(":");
      const company = idx > 0 ? t.slice(0, idx).trim() : "Unknown";
      const title = idx > 0 ? t.slice(idx + 1).trim() : t.trim();
      const guid = typeof i.guid === "string" ? i.guid : i.guid?.["#text"];
      const link = String(i.link);
      return {
        id: `weworkremotely:${guid ?? link}`,
        source: "weworkremotely" as const,
        externalId: guid ?? link,
        title,
        company,
        location: `Remote · ${i.region || "Anywhere"}`,
        remote: true,
        url: link,
        postedAt: i.pubDate ? toIso(i.pubDate) : undefined,
        description: htmlToText(i.description),
      };
    });
}

export async function fetchWwr(): Promise<Job[]> {
  const out: Job[] = [];
  for (const url of WWR_FEEDS) {
    out.push(...parseWwr(await get(url, { accept: "application/rss+xml, application/xml, text/xml" })));
  }
  return out;
}

function toIso(s: string): string | undefined {
  // Remotive gives "2026-11-15T10:12:33" without zone → treat as UTC.
  const d = new Date(/T\d\d:\d\d(:\d\d)?$/.test(s) ? `${s}Z` : s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

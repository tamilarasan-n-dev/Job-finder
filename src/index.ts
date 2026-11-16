import cron from "node-cron";
import { loadCompanies, loadProfile, loadSettings, smtpProblems } from "./config.js";
import { createMailer, renderDigest, type Mailer } from "./email.js";
import { log } from "./log.js";
import { runOnce, sendHeartbeat } from "./run.js";
import { fetchCompany } from "./sources/ats.js";
import { Store } from "./store.js";
import { mapLimit } from "./http.js";
import type { MatchResult } from "./types.js";

const HELP = `job-finder — hourly job alerts

Usage: node dist/index.js <command> [--dry-run]

  daemon       Run on CRON_SCHEDULE (default hourly) until stopped. Used by Docker/systemd.
  run          Run once now and email new matches. Add --dry-run to print instead of emailing.
  verify       Check every board in config/companies.yaml and report wrong slugs.
  test-email   Send a sample email to MAIL_TO to check SMTP settings.
  heartbeat    Send the daily health summary to ADMIN_EMAIL now.
`;

function mailerOrExit(settings: ReturnType<typeof loadSettings>): Mailer {
  const problems = smtpProblems(settings);
  if (problems.length) {
    log.error("Email is not configured — fill in .env", { problems });
    process.exit(2);
  }
  return createMailer(settings);
}

async function main() {
  const [cmd = "help", ...rest] = process.argv.slice(2);
  const dryRun = rest.includes("--dry-run");
  const settings = loadSettings();

  // Fail fast on config errors before doing anything else.
  const profile = loadProfile(settings.configDir);
  const companies = loadCompanies(settings.configDir);

  switch (cmd) {
    case "run": {
      const store = new Store(settings.dbPath);
      const mailer = dryRun ? null : mailerOrExit(settings);
      try {
        await runOnce(settings, store, mailer, { dryRun });
      } finally {
        store.close();
        mailer?.close();
      }
      return;
    }

    case "daemon": {
      const store = new Store(settings.dbPath);
      const mailer = mailerOrExit(settings);
      try {
        await mailer.verify();
        log.info("SMTP connection OK");
      } catch (e) {
        log.error("SMTP login failed — check SMTP_* in .env", { error: (e as Error).message });
        process.exit(2);
      }
      if (!cron.validate(settings.cron)) {
        log.error(`Invalid CRON_SCHEDULE "${settings.cron}"`);
        process.exit(2);
      }

      let running = false;
      const tick = async () => {
        if (running) {
          log.warn("previous run still in progress — skipping this tick");
          return;
        }
        running = true;
        try {
          await runOnce(settings, store, mailer);
        } catch {
          /* already logged + alerted */
        } finally {
          running = false;
        }
      };

      cron.schedule(settings.cron, tick, { timezone: settings.timezone, noOverlap: true });
      log.info(`scheduled: "${settings.cron}" (${settings.timezone})`, {
        profile: profile.name,
        companies: companies.length,
        to: settings.mailTo,
      });

      if (settings.heartbeatCron) {
        if (!cron.validate(settings.heartbeatCron)) {
          log.error(`Invalid HEARTBEAT_CRON "${settings.heartbeatCron}"`);
          process.exit(2);
        }
        cron.schedule(
          settings.heartbeatCron,
          () => sendHeartbeat(settings, store, mailer).catch((e) => log.error("heartbeat failed", { error: (e as Error).message })),
          { timezone: settings.timezone },
        );
        log.info(`heartbeat: "${settings.heartbeatCron}" → ${settings.adminEmail || "(ADMIN_EMAIL not set — disabled)"}`);
      }

      if (settings.runOnStart) await tick();

      const stop = () => {
        log.info("shutting down");
        store.close();
        mailer.close();
        process.exit(0);
      };
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
      return; // cron keeps the process alive
    }

    case "verify": {
      log.info(`checking ${companies.length} boards…`);
      const rows = await mapLimit(companies, 6, async (c) => {
        try {
          const jobs = await fetchCompany(c);
          return { c, ok: true, n: jobs.length, err: "" };
        } catch (e) {
          const err = (e as { status?: number }).status === 404 ? "NOT FOUND — fix or remove this slug" : (e as Error).message;
          return { c, ok: false, n: 0, err };
        }
      });
      for (const r of rows) {
        console.log(`${r.ok ? "✔" : "✘"} ${r.c.ats.padEnd(15)} ${r.c.slug.padEnd(16)} ${r.c.name.padEnd(22)} ${r.ok ? `${r.n} open jobs` : r.err}`);
      }
      const bad = rows.filter((r) => !r.ok).length;
      console.log(`\n${rows.length - bad}/${rows.length} boards OK`);
      process.exitCode = bad ? 1 : 0;
      return;
    }

    case "test-email": {
      const mailer = mailerOrExit(settings);
      const sample: MatchResult = {
        job: {
          id: "sample:1",
          source: "greenhouse",
          externalId: "1",
          title: "Software Engineer I — Full Stack (sample)",
          company: "Example Labs",
          location: "Chennai, Tamil Nadu, India",
          remote: false,
          url: "https://example.com/jobs/1",
          postedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          description: "",
        },
        score: 88,
        locationClass: "india-onsite",
        reasons: ["Full-stack role", "Early-career level", "Skills: React, Node.js, PostgreSQL, Redis", "Location: Chennai"],
      };
      const d = renderDigest([sample], profile.name);
      const id = await mailer.send({ to: settings.mailTo, bcc: settings.mailBcc, subject: `[TEST] ${d.subject}`, html: d.html, text: d.text });
      log.info("test email sent", { messageId: id, to: settings.mailTo });
      mailer.close();
      return;
    }

    case "heartbeat": {
      const store = new Store(settings.dbPath);
      const mailer = mailerOrExit(settings);
      await sendHeartbeat(settings, store, mailer);
      store.close();
      mailer.close();
      return;
    }

    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  log.error((e as Error).message);
  process.exit(1);
});

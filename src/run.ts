import { loadCompanies, loadProfile, smtpProblems, type Settings } from "./config.js";
import { renderDigest, type Mailer } from "./email.js";
import { log } from "./log.js";
import { matchJobs } from "./matcher.js";
import { fetchAll } from "./sources/index.js";
import type { Store } from "./store.js";
import { escapeHtml } from "./text.js";
import type { MatchResult } from "./types.js";

export interface RunResult {
  fetched: number;
  matched: number;
  newMatches: MatchResult[];
  emailed: number;
  sourcesOk: number;
  sourcesFailed: number;
}

export async function runOnce(
  settings: Settings,
  store: Store,
  mailer: Mailer | null,
  opts: { dryRun?: boolean } = {},
): Promise<RunResult> {
  const runId = store.startRun();
  const started = Date.now();
  // Config is re-read every run so edits to profile/companies apply without a restart.
  const profile = loadProfile(settings.configDir);
  const companies = loadCompanies(settings.configDir);

  let fetched = 0;
  let matched = 0;
  let emailed = 0;
  let newMatches: MatchResult[] = [];
  let outcomes: Awaited<ReturnType<typeof fetchAll>>["outcomes"] = [];
  try {
    const res = await fetchAll(companies, settings.feeds);
    outcomes = res.outcomes;
    fetched = res.jobs.length;

    const { matches, rejected } = matchJobs(res.jobs, profile);
    matched = matches.length;
    newMatches = store.filterNew(matches);
    log.info("run: matched", { fetched, matched, new: newMatches.length, rejected });

    const okCount = outcomes.filter((o) => o.ok).length;
    if (okCount === 0 && outcomes.length > 0) {
      throw new Error("Every source failed — check the VM's internet access");
    }

    const batch = newMatches.slice(0, settings.maxJobsPerEmail);
    const remaining = newMatches.length - batch.length;

    if (batch.length === 0) {
      log.info("run: no new matches — no email sent");
    } else if (opts.dryRun || !mailer) {
      log.info(`run: DRY RUN — would email ${batch.length} job(s)`);
      for (const m of batch) {
        console.log(`  [${Math.round(m.score)}] ${m.job.title} — ${m.job.company} | ${m.job.location}\n        ${m.reasons.join(" · ")}\n        ${m.job.url}`);
      }
    } else {
      const digest = renderDigest(batch, profile.name, { moreCount: remaining });
      const id = await mailer.send({ to: settings.mailTo, bcc: settings.mailBcc, ...digest });
      store.markEmailed(batch); // only after a successful send
      emailed = batch.length;
      log.info("run: email sent", { jobs: emailed, messageId: id, to: settings.mailTo, bcc: settings.mailBcc.length });
    }

    store.finishRun(runId, { fetched, matched, newMatches: newMatches.length, emailed, outcomes });
    log.info(`run: done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return {
      fetched,
      matched,
      newMatches,
      emailed,
      sourcesOk: okCount,
      sourcesFailed: outcomes.length - okCount,
    };
  } catch (e) {
    const msg = (e as Error).message;
    store.finishRun(runId, { fetched, matched, newMatches: newMatches.length, emailed, outcomes, error: msg });
    log.error("run failed", { error: msg });
    if (mailer && !opts.dryRun && settings.adminEmail) {
      await mailer
        .send({
          to: [settings.adminEmail],
          subject: "⚠️ Job Finder run failed",
          text: `The ${new Date().toISOString()} run failed:\n\n${msg}\n\nCheck logs: docker compose logs --tail=200 job-finder`,
          html: `<p>The run at ${new Date().toISOString()} failed:</p><pre>${escapeHtml(msg)}</pre><p>Check logs: <code>docker compose logs --tail=200 job-finder</code></p>`,
        })
        .catch((err) => log.error("could not send failure alert", { error: (err as Error).message }));
    }
    throw e;
  }
}

/** Daily "I'm alive" summary for the admin (you), independent of matches. */
export async function sendHeartbeat(settings: Settings, store: Store, mailer: Mailer): Promise<void> {
  if (!settings.adminEmail) return;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const s = store.runStats(since);
  const failed = s.last?.failedSources ?? [];
  const lines = [
    `Runs in the last 24h: ${s.runs} (${s.errored} failed)`,
    `Jobs emailed in the last 24h: ${s.emailed}`,
    `Jobs emailed all-time: ${s.totalEmailedAllTime}`,
    s.last ? `Last run: fetched ${s.last.fetched} jobs, ${s.last.matched} matched, ${s.last.sources_ok} sources OK, ${s.last.sources_failed} failed` : "No completed runs yet",
    ...(failed.length ? ["", "Failing sources on last run:", ...failed.map((f) => `  • ${f.source}: ${f.error}`)] : []),
  ];
  const healthy = s.runs > 0 && s.errored < s.runs;
  await mailer.send({
    to: [settings.adminEmail],
    subject: `${healthy ? "✅" : "⚠️"} Job Finder daily check — ${s.runs} runs, ${s.emailed} jobs sent`,
    text: lines.join("\n"),
    html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace">${escapeHtml(lines.join("\n"))}</pre>`,
  });
  log.info("heartbeat sent", { to: settings.adminEmail });
}

export { smtpProblems };

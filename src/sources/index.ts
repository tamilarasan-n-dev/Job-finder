import { HttpError, mapLimit } from "../http.js";
import { log } from "../log.js";
import type { CompanyConfig, FetchOutcome, Job } from "../types.js";
import { fetchCompany } from "./ats.js";
import { fetchRemoteOk, fetchRemotive, fetchWwr } from "./feeds.js";

export interface FeedToggles {
  remotive: boolean;
  remoteok: boolean;
  weworkremotely: boolean;
}

interface Task {
  label: string;
  run: () => Promise<Job[]>;
}

function describe(e: unknown): string {
  if (e instanceof HttpError) {
    return e.status === 404 ? "404 — board not found (wrong slug?)" : `HTTP ${e.status}`;
  }
  if (e instanceof Error) {
    if (e.name === "TimeoutError") return "timed out";
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return cause?.code || cause?.message ? `${e.message} (${cause.code ?? cause.message})` : e.message;
  }
  return String(e);
}

export async function fetchAll(companies: CompanyConfig[], feeds: FeedToggles): Promise<{ jobs: Job[]; outcomes: FetchOutcome[] }> {
  const tasks: Task[] = companies.map((c) => ({ label: `${c.ats}/${c.slug} (${c.name})`, run: () => fetchCompany(c) }));
  if (feeds.remotive) tasks.push({ label: "feed/remotive", run: fetchRemotive });
  if (feeds.remoteok) tasks.push({ label: "feed/remoteok", run: fetchRemoteOk });
  if (feeds.weworkremotely) tasks.push({ label: "feed/weworkremotely", run: fetchWwr });

  const results = await mapLimit(tasks, 6, async (t) => {
    const start = Date.now();
    try {
      const jobs = await t.run();
      log.debug(`fetched ${t.label}`, { count: jobs.length });
      return { jobs, outcome: { source: t.label, ok: true, count: jobs.length, ms: Date.now() - start } };
    } catch (e) {
      const error = describe(e);
      log.warn(`fetch failed: ${t.label}`, { error });
      return { jobs: [] as Job[], outcome: { source: t.label, ok: false, count: 0, error, ms: Date.now() - start } };
    }
  });

  const seen = new Set<string>();
  const jobs: Job[] = [];
  for (const r of results) {
    for (const j of r.jobs) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      jobs.push(j);
    }
  }
  return { jobs, outcomes: results.map((r) => r.outcome) };
}

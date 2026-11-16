import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fingerprint } from "./text.js";
import type { FetchOutcome, MatchResult } from "./types.js";

/**
 * Remembers which jobs were already emailed so each one is sent once.
 * A job is only marked emailed AFTER the SMTP send succeeds, so a failed
 * send is retried on the next run.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS emailed_jobs (
        id          TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        title       TEXT NOT NULL,
        company     TEXT NOT NULL,
        location    TEXT NOT NULL,
        url         TEXT NOT NULL,
        score       INTEGER NOT NULL,
        emailed_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_emailed_fp ON emailed_jobs(fingerprint, emailed_at);
      CREATE TABLE IF NOT EXISTS runs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at    TEXT NOT NULL,
        finished_at   TEXT,
        fetched       INTEGER DEFAULT 0,
        matched       INTEGER DEFAULT 0,
        new_matches   INTEGER DEFAULT 0,
        emailed       INTEGER DEFAULT 0,
        sources_ok    INTEGER DEFAULT 0,
        sources_failed INTEGER DEFAULT 0,
        error         TEXT,
        outcomes_json TEXT
      );
    `);
  }

  /**
   * Keep matches not emailed before. Also skips a job whose company+title was
   * emailed within `repostWindowDays` (same role re-posted, or listed on two sources).
   */
  filterNew(matches: MatchResult[], repostWindowDays = 30): MatchResult[] {
    const byId = this.db.prepare("SELECT 1 FROM emailed_jobs WHERE id = ?");
    const byFp = this.db.prepare("SELECT 1 FROM emailed_jobs WHERE fingerprint = ? AND emailed_at >= ?");
    const since = new Date(Date.now() - repostWindowDays * 86_400_000).toISOString();
    const seenFp = new Set<string>();
    return matches.filter((m) => {
      if (byId.get(m.job.id)) return false;
      const fp = fingerprint(m.job.company, m.job.title);
      if (seenFp.has(fp) || byFp.get(fp, since)) return false;
      seenFp.add(fp);
      return true;
    });
  }

  markEmailed(matches: MatchResult[], at = new Date()): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO emailed_jobs (id, fingerprint, title, company, location, url, score, emailed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.exec("BEGIN");
    try {
      for (const m of matches) {
        const j = m.job;
        stmt.run(j.id, fingerprint(j.company, j.title), j.title, j.company, j.location, j.url, Math.round(m.score), at.toISOString());
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  startRun(): number {
    const r = this.db.prepare("INSERT INTO runs (started_at) VALUES (?)").run(new Date().toISOString());
    return Number(r.lastInsertRowid);
  }

  finishRun(
    id: number,
    s: { fetched: number; matched: number; newMatches: number; emailed: number; outcomes: FetchOutcome[]; error?: string },
  ): void {
    this.db
      .prepare(
        `UPDATE runs SET finished_at = ?, fetched = ?, matched = ?, new_matches = ?, emailed = ?,
           sources_ok = ?, sources_failed = ?, error = ?, outcomes_json = ? WHERE id = ?`,
      )
      .run(
        new Date().toISOString(),
        s.fetched,
        s.matched,
        s.newMatches,
        s.emailed,
        s.outcomes.filter((o) => o.ok).length,
        s.outcomes.filter((o) => !o.ok).length,
        s.error ?? null,
        JSON.stringify(s.outcomes),
        id,
      );
  }

  /** Summary of runs since `sinceIso`, for the heartbeat email. */
  runStats(sinceIso: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS runs,
                COALESCE(SUM(emailed), 0) AS emailed,
                COALESCE(SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errored,
                MAX(finished_at) AS last_finished
           FROM runs WHERE started_at >= ?`,
      )
      .get(sinceIso) as { runs: number; emailed: number; errored: number; last_finished: string | null };
    const last = this.db
      .prepare("SELECT fetched, matched, sources_ok, sources_failed, outcomes_json FROM runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get() as { fetched: number; matched: number; sources_ok: number; sources_failed: number; outcomes_json: string } | undefined;
    const total = this.db.prepare("SELECT COUNT(*) AS n FROM emailed_jobs").get() as { n: number };
    return {
      ...row,
      totalEmailedAllTime: total.n,
      last: last
        ? { ...last, failedSources: (JSON.parse(last.outcomes_json) as FetchOutcome[]).filter((o) => !o.ok) }
        : undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}

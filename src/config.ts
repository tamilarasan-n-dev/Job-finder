import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { Ats, CompanyConfig } from "./types.js";

// ───────────────────────── Profile ─────────────────────────

export interface WeightedPattern {
  pattern: RegExp;
  weight: number;
  label: string;
}

export interface Profile {
  name: string;
  minScore: number;
  maxAgeDays: number;
  maxYearsRequired: number;
  location: {
    allowRemoteIndia: boolean;
    allowAsiaRemote: boolean;
    preferredCities: WeightedPattern[];
  };
  titles: {
    include: WeightedPattern[];
    exclude: RegExp[];
    juniorSignals: WeightedPattern[];
  };
  maxSkillPoints: number;
  skills: WeightedPattern[];
  experienceFitBonus: number;
}

class ConfigError extends Error {}

function re(src: unknown, where: string): RegExp {
  if (typeof src !== "string" || !src) throw new ConfigError(`${where}: expected a regex string`);
  try {
    return new RegExp(src, "i");
  } catch (e) {
    throw new ConfigError(`${where}: invalid regex "${src}" (${(e as Error).message})`);
  }
}

function num(v: unknown, where: string, fallback?: number): number {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "number" || Number.isNaN(v)) throw new ConfigError(`${where}: expected a number`);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ConfigError(`${where}: expected a list`);
  return v;
}

function weighted(v: unknown, where: string, weightKey: "weight" | "bonus"): WeightedPattern[] {
  return list(v, where).map((item, i) => {
    const o = item as Record<string, unknown>;
    const w = `${where}[${i}]`;
    return {
      pattern: re(o.pattern, `${w}.pattern`),
      weight: num(o[weightKey], `${w}.${weightKey}`),
      label: typeof o.label === "string" ? o.label : typeof o.name === "string" ? o.name : String(o.pattern),
    };
  });
}

export function parseProfile(raw: unknown): Profile {
  const o = (raw ?? {}) as Record<string, any>;
  const loc = (o.location ?? {}) as Record<string, unknown>;
  const titles = (o.titles ?? {}) as Record<string, unknown>;
  const profile: Profile = {
    name: typeof o.name === "string" ? o.name : "Candidate",
    minScore: num(o.minScore, "minScore", 45),
    maxAgeDays: num(o.maxAgeDays, "maxAgeDays", 21),
    maxYearsRequired: num(o.maxYearsRequired, "maxYearsRequired", 3),
    location: {
      allowRemoteIndia: loc.allowRemoteIndia !== false,
      allowAsiaRemote: loc.allowAsiaRemote === true,
      preferredCities: weighted(loc.preferredCities, "location.preferredCities", "bonus"),
    },
    titles: {
      include: weighted(titles.include, "titles.include", "weight"),
      exclude: list(titles.exclude, "titles.exclude").map((p, i) => re(p, `titles.exclude[${i}]`)),
      juniorSignals: weighted(titles.juniorSignals, "titles.juniorSignals", "bonus"),
    },
    maxSkillPoints: num(o.maxSkillPoints, "maxSkillPoints", 40),
    skills: weighted(o.skills, "skills", "weight"),
    experienceFitBonus: num(o.experienceFitBonus, "experienceFitBonus", 10),
  };
  if (profile.titles.include.length === 0) {
    throw new ConfigError("titles.include: add at least one title pattern");
  }
  return profile;
}

// ───────────────────────── Companies ─────────────────────────

const ATS: readonly Ats[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable"];

export function parseCompanies(raw: unknown): CompanyConfig[] {
  const o = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const out: CompanyConfig[] = [];
  list(o.companies, "companies").forEach((item, i) => {
    const c = item as Record<string, unknown>;
    const where = `companies[${i}]`;
    if (typeof c.name !== "string" || !c.name) throw new ConfigError(`${where}.name is required`);
    if (typeof c.slug !== "string" || !c.slug) throw new ConfigError(`${where}.slug is required`);
    if (!ATS.includes(c.ats as Ats)) {
      throw new ConfigError(`${where}.ats must be one of ${ATS.join(", ")} (got "${String(c.ats)}")`);
    }
    const key = `${c.ats}:${c.slug.toLowerCase()}`;
    if (seen.has(key)) return; // silently skip duplicates
    seen.add(key);
    if (c.enabled === false) return;
    out.push({ name: c.name, ats: c.ats as Ats, slug: c.slug });
  });
  return out;
}

// ───────────────────────── Environment ─────────────────────────

export interface Settings {
  configDir: string;
  dbPath: string;
  cron: string;
  timezone: string;
  runOnStart: boolean;
  maxJobsPerEmail: number;
  feeds: { remotive: boolean; remoteok: boolean; weworkremotely: boolean };
  heartbeatCron: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  mailFrom: string;
  mailTo: string[];
  mailBcc: string[];
  adminEmail: string;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function emails(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const port = Number(env.SMTP_PORT ?? 587);
  return {
    configDir: resolve(env.CONFIG_DIR ?? "config"),
    dbPath: resolve(env.DB_PATH ?? "data/job-finder.db"),
    cron: env.CRON_SCHEDULE || "0 * * * *",
    timezone: env.TZ || "Asia/Kolkata",
    runOnStart: bool(env.RUN_ON_START, true),
    maxJobsPerEmail: Number(env.MAX_JOBS_PER_EMAIL ?? 30) || 30,
    feeds: {
      remotive: bool(env.FEED_REMOTIVE, true),
      remoteok: bool(env.FEED_REMOTEOK, true),
      weworkremotely: bool(env.FEED_WEWORKREMOTELY, true),
    },
    heartbeatCron: env.HEARTBEAT_CRON ?? "",
    smtp: {
      host: env.SMTP_HOST ?? "",
      port,
      secure: bool(env.SMTP_SECURE, port === 465),
      user: env.SMTP_USER ?? "",
      pass: env.SMTP_PASS ?? "",
    },
    mailFrom: env.MAIL_FROM || env.SMTP_USER || "",
    mailTo: emails(env.MAIL_TO),
    mailBcc: emails(env.MAIL_BCC),
    adminEmail: env.ADMIN_EMAIL ?? "",
  };
}

/** Problems that block sending email. Empty list = ready. */
export function smtpProblems(s: Settings): string[] {
  const p: string[] = [];
  if (!s.smtp.host) p.push("SMTP_HOST is not set");
  if (!s.smtp.user) p.push("SMTP_USER is not set");
  if (!s.smtp.pass) p.push("SMTP_PASS is not set");
  if (!s.mailFrom) p.push("MAIL_FROM is not set");
  if (s.mailTo.length === 0) p.push("MAIL_TO is not set");
  return p;
}

function readYaml(path: string): unknown {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`Could not read ${path}: ${(e as Error).message}`);
  }
}

export function loadProfile(configDir: string): Profile {
  return parseProfile(readYaml(resolve(configDir, "profile.yaml")));
}

export function loadCompanies(configDir: string): CompanyConfig[] {
  return parseCompanies(readYaml(resolve(configDir, "companies.yaml")));
}

export { ConfigError };

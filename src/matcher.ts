import type { Profile } from "./config.js";
import { classifyLocation } from "./location.js";
import type { Job, MatchResult } from "./types.js";

export type RejectReason = "location" | "title-excluded" | "title-no-match" | "too-old" | "experience" | "low-score";

export interface Evaluation {
  match?: MatchResult;
  rejected?: RejectReason;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };

/**
 * Pull the experience requirement out of a job description.
 * Looks at phrases like "3+ years", "2-4 yrs of experience", "minimum of five years".
 * Returns the smallest "minimum" found near the word experience, or undefined.
 */
export function extractYears(text: string): { min: number; max?: number } | undefined {
  const t = text.toLowerCase().replace(/[–—]/g, "-");
  const rx =
    /(?:minimum(?: of)?|at least|min\.?)?\s*\b(\d{1,2}|one|two|three|four|five|six|seven|eight|ten)\s*(\+|plus)?\s*(?:(?:-|to)\s*(\d{1,2})\s*)?(?:years?|yrs?)\b(?:[^.\n]{0,40}?\bexperience|\s+of\b|\s*\+?\s*(?:of\s+)?(?:professional|industry|relevant|hands-on|work))/g;
  // "Experience: 2-4 years", "experience of 3+ yrs"
  const rx2 = /\bexperience\s*(?:of|:|-|required:?)?\s*(\d{1,2})\s*(\+)?\s*(?:(?:-|to)\s*(\d{1,2})\s*)?(?:years?|yrs?)\b/g;
  let best: { min: number; max?: number } | undefined;
  for (const m of [...t.matchAll(rx), ...t.matchAll(rx2)]) {
    const a = m[1]!;
    const min = /^\d+$/.test(a) ? Number(a) : WORDS[a]!;
    const max = m[3] ? Number(m[3]) : undefined;
    if (min > 20 || (max !== undefined && max > 25)) continue; // "20 years of company history" etc.
    if (!best || min < best.min) best = { min, max };
  }
  return best;
}

export function evaluate(job: Job, p: Profile, now: Date = new Date()): Evaluation {
  // 1) Location gate: India on-site or remote-India only.
  const locationClass = classifyLocation(job.location, job.remote, { allowAsia: p.location.allowAsiaRemote });
  if (locationClass === "other") return { rejected: "location" };
  if (locationClass === "remote-india" && !p.location.allowRemoteIndia) return { rejected: "location" };

  // 2) Title gates.
  const title = job.title;
  if (p.titles.exclude.some((rx) => rx.test(title))) return { rejected: "title-excluded" };
  const titleHits = p.titles.include.filter((w) => w.pattern.test(title));
  if (titleHits.length === 0) return { rejected: "title-no-match" };

  // 3) Freshness gate (only when the source provides a date).
  if (job.postedAt) {
    const t = Date.parse(job.postedAt);
    if (!Number.isNaN(t) && now.getTime() - t > p.maxAgeDays * 86_400_000) return { rejected: "too-old" };
  }

  // 4) Experience gate.
  const years = extractYears(job.description);
  if (years && years.min > p.maxYearsRequired) return { rejected: "experience" };

  // 5) Score.
  const reasons: string[] = [];
  let score = 0;

  const bestTitle = titleHits.reduce((a, b) => (b.weight > a.weight ? b : a));
  score += bestTitle.weight;
  reasons.push(bestTitle.label);

  for (const s of p.titles.juniorSignals) {
    if (s.pattern.test(title)) {
      score += s.weight;
      reasons.push(s.label);
      break;
    }
  }

  const haystack = `${title}\n${job.description}`;
  const skillHits = p.skills.filter((s) => s.pattern.test(haystack));
  const skillPoints = Math.min(
    p.maxSkillPoints,
    skillHits.reduce((sum, s) => sum + s.weight, 0),
  );
  score += skillPoints;
  if (skillHits.length) reasons.push(`Skills: ${skillHits.map((s) => s.label).join(", ")}`);

  // No description (e.g. SmartRecruiters list API): give a neutral skill credit
  // so a good title alone can still pass, and say so.
  if (!job.description.trim()) {
    score += 10;
    reasons.push("No description in feed — matched on title");
  }

  if (years) {
    const fits = years.min <= 2 && (years.max === undefined || years.max >= 1);
    if (fits) {
      score += p.experienceFitBonus;
      reasons.push(`Experience ${years.min}${years.max ? `–${years.max}` : "+"} yrs fits`);
    } else {
      reasons.push(`Asks ${years.min}+ yrs`);
    }
  }

  for (const c of p.location.preferredCities) {
    if (c.pattern.test(job.location)) {
      score += c.weight;
      reasons.push(`Location: ${c.label}`);
      break;
    }
  }
  if (locationClass === "remote-india") reasons.push("Remote (India)");

  if (score < p.minScore) return { rejected: "low-score" };
  return { match: { job, score, locationClass, reasons, minYears: years?.min } };
}

export function matchJobs(jobs: Job[], p: Profile, now?: Date) {
  const matches: MatchResult[] = [];
  const rejected: Record<RejectReason, number> = {
    location: 0,
    "title-excluded": 0,
    "title-no-match": 0,
    "too-old": 0,
    experience: 0,
    "low-score": 0,
  };
  for (const job of jobs) {
    const r = evaluate(job, p, now);
    if (r.match) matches.push(r.match);
    else if (r.rejected) rejected[r.rejected]++;
  }
  matches.sort((a, b) => b.score - a.score || (Date.parse(b.job.postedAt ?? "") || 0) - (Date.parse(a.job.postedAt ?? "") || 0));
  return { matches, rejected };
}

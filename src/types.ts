export type Ats =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable";

export type FeedSource = "remotive" | "remoteok" | "weworkremotely";

export type SourceName = Ats | FeedSource;

/** A job posting normalised from any source. */
export interface Job {
  /** Stable unique key: `${source}:${externalId}` */
  id: string;
  source: SourceName;
  externalId: string;
  title: string;
  company: string;
  /** Human-readable location as given by the source, e.g. "Bengaluru, India" or "Remote - India". */
  location: string;
  /** True when the source explicitly marks the role remote. */
  remote: boolean;
  url: string;
  /** ISO timestamp when posted/updated, if the source provides one. */
  postedAt?: string;
  /** Plain-text description (may be empty for sources that don't include it). */
  description: string;
  department?: string;
}

export type LocationClass = "india-onsite" | "remote-india" | "other";

export interface MatchResult {
  job: Job;
  score: number;
  locationClass: LocationClass;
  reasons: string[];
  /** Minimum years of experience found in the description, if any. */
  minYears?: number;
}

export interface CompanyConfig {
  name: string;
  ats: Ats;
  /** Board slug / account id on the ATS. */
  slug: string;
  enabled?: boolean;
}

export interface FetchOutcome {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
  ms: number;
}

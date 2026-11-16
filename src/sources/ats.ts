/**
 * Public ATS job-board APIs. All are unauthenticated read-only endpoints that
 * companies publish for their own careers pages.
 *
 * Each source has a pure `parse*` function (unit-tested with fixtures) and a
 * thin fetcher.
 */
import { getJson } from "../http.js";
import { htmlToText } from "../text.js";
import type { CompanyConfig, Job } from "../types.js";

const enc = encodeURIComponent;

// ───────────── Greenhouse ─────────────
// GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true

interface GhJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string | null }[];
  departments?: { name?: string }[];
  content?: string;
}

export function parseGreenhouse(data: { jobs?: GhJob[] }, company: string): Job[] {
  return (data.jobs ?? []).map((j) => {
    const offices = (j.offices ?? []).map((o) => o.location || o.name).filter(Boolean) as string[];
    const location = [...new Set([j.location?.name, ...offices].filter(Boolean))].join(" · ");
    return {
      id: `greenhouse:${j.id}`,
      source: "greenhouse",
      externalId: String(j.id),
      title: j.title.trim(),
      company,
      location,
      remote: /remote/i.test(location),
      url: j.absolute_url,
      postedAt: j.first_published ?? j.updated_at,
      description: htmlToText(j.content),
      department: j.departments?.[0]?.name,
    };
  });
}

// ───────────── Lever ─────────────
// GET https://api.lever.co/v0/postings/{slug}?mode=json

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  country?: string;
  categories?: { location?: string; allLocations?: string[]; team?: string; commitment?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
}

export function parseLever(data: LeverPosting[], company: string): Job[] {
  if (!Array.isArray(data)) return [];
  return data.map((p) => {
    const locs = p.categories?.allLocations?.length ? p.categories.allLocations : [p.categories?.location];
    let location = locs.filter(Boolean).join(" · ");
    if (p.country && !location.toLowerCase().includes(p.country.toLowerCase())) {
      location = [location, p.country === "IN" ? "India" : p.country].filter(Boolean).join(", ");
    }
    const remote = p.workplaceType === "remote" || /remote/i.test(location);
    if (remote && !/remote/i.test(location)) location = `Remote · ${location}`;
    const lists = (p.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content)}`).join("\n");
    return {
      id: `lever:${p.id}`,
      source: "lever",
      externalId: p.id,
      title: p.text.trim(),
      company,
      location,
      remote,
      url: p.hostedUrl,
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n").trim(),
      department: p.categories?.team,
    };
  });
}

// ───────────── Ashby ─────────────
// GET https://api.ashbyhq.com/posting-api/job-board/{slug}

interface AshbyAddress {
  postalAddress?: { addressLocality?: string; addressRegion?: string; addressCountry?: string };
}
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string; address?: AshbyAddress }[];
  address?: AshbyAddress;
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl: string;
  department?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

function ashbyAddr(a?: AshbyAddress): string {
  const p = a?.postalAddress;
  return [p?.addressLocality, p?.addressRegion, p?.addressCountry].filter(Boolean).join(", ");
}

export function parseAshby(data: { jobs?: AshbyJob[] }, company: string): Job[] {
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const parts = [j.location, ashbyAddr(j.address)];
      for (const s of j.secondaryLocations ?? []) parts.push(s.location, ashbyAddr(s.address));
      const uniq = [...new Set(parts.filter((x): x is string => !!x))];
      const remote = !!j.isRemote || j.workplaceType === "Remote" || uniq.some((x) => /remote/i.test(x));
      return {
        id: `ashby:${j.id}`,
        source: "ashby",
        externalId: j.id,
        title: j.title.trim(),
        company,
        location: (remote && !uniq.some((x) => /remote/i.test(x)) ? ["Remote", ...uniq] : uniq).join(" · "),
        remote,
        url: j.jobUrl,
        postedAt: j.publishedAt,
        description: j.descriptionPlain ?? htmlToText(j.descriptionHtml),
        department: j.department,
      };
    });
}

// ───────────── SmartRecruiters ─────────────
// GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N
// (list endpoint has no description; title + location are enough to filter)

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  department?: { label?: string };
  company?: { identifier?: string; name?: string };
}

export function parseSmartRecruiters(data: { content?: SrPosting[] }, company: string, slug: string): Job[] {
  return (data.content ?? []).map((p) => {
    const l = p.location ?? {};
    const country = l.country?.toLowerCase() === "in" ? "India" : l.country;
    let location = l.fullLocation || [l.city, l.region, country].filter(Boolean).join(", ");
    if (l.remote && !/remote/i.test(location)) location = `Remote · ${location}`;
    if (country === "India" && !/india/i.test(location)) location += ", India";
    return {
      id: `smartrecruiters:${p.id}`,
      source: "smartrecruiters",
      externalId: p.id,
      title: p.name.trim(),
      company,
      location,
      remote: !!l.remote,
      url: `https://jobs.smartrecruiters.com/${enc(p.company?.identifier ?? slug)}/${enc(p.id)}`,
      postedAt: p.releasedDate,
      description: "",
      department: p.department?.label,
    };
  });
}

// ───────────── Workable ─────────────
// GET https://apply.workable.com/api/v1/widget/accounts/{slug}

interface WorkableJob {
  title: string;
  shortcode: string;
  url?: string;
  shortlink?: string;
  application_url?: string;
  city?: string;
  state?: string;
  country?: string;
  telecommuting?: boolean;
  published_on?: string;
  created_at?: string;
  department?: string;
  locations?: { city?: string; region?: string; country?: string }[];
  description?: string;
}

export function parseWorkable(data: { jobs?: WorkableJob[] }, company: string, slug: string): Job[] {
  return (data.jobs ?? []).map((j) => {
    const locs = j.locations?.length ? j.locations : [{ city: j.city, region: j.state, country: j.country }];
    let location = locs
      .map((l) => [l.city, l.region, l.country].filter(Boolean).join(", "))
      .filter(Boolean)
      .join(" · ");
    if (j.telecommuting) location = `Remote · ${location}`;
    return {
      id: `workable:${slug}:${j.shortcode}`,
      source: "workable",
      externalId: j.shortcode,
      title: j.title.trim(),
      company,
      location,
      remote: !!j.telecommuting,
      url: j.url || j.shortlink || `https://apply.workable.com/${enc(slug)}/j/${enc(j.shortcode)}/`,
      postedAt: j.published_on ?? j.created_at,
      description: htmlToText(j.description),
      department: j.department,
    };
  });
}

// ───────────── Dispatcher ─────────────

export async function fetchCompany(c: CompanyConfig): Promise<Job[]> {
  const s = enc(c.slug);
  switch (c.ats) {
    case "greenhouse":
      return parseGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`), c.name);
    case "lever":
      return parseLever(await getJson(`https://api.lever.co/v0/postings/${s}?mode=json`), c.name);
    case "ashby":
      return parseAshby(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${s}`), c.name);
    case "workable":
      return parseWorkable(await getJson(`https://apply.workable.com/api/v1/widget/accounts/${s}`), c.name, c.slug);
    case "smartrecruiters": {
      const all: Job[] = [];
      // Paginate; cap at 1000 postings to stay polite.
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = await getJson<{ content?: SrPosting[]; totalFound?: number }>(
          `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100&offset=${offset}`,
        );
        all.push(...parseSmartRecruiters(page, c.name, c.slug));
        if (!page.content?.length || offset + 100 >= (page.totalFound ?? 0)) break;
      }
      return all;
    }
  }
}

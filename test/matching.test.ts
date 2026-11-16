import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/config.js";
import { classifyLocation } from "../src/location.js";
import { evaluate, extractYears, matchJobs } from "../src/matcher.js";
import type { Job } from "../src/types.js";

const profile = loadProfile("config");
const NOW = new Date("2026-11-16T06:00:00Z");

function job(p: Partial<Job>): Job {
  return {
    id: `t:${Math.random()}`,
    source: "greenhouse",
    externalId: "x",
    title: "Software Engineer",
    company: "Acme",
    location: "Bengaluru, India",
    remote: false,
    url: "https://example.com",
    postedAt: "2026-11-15T00:00:00Z",
    description: "",
    ...p,
  };
}

describe("classifyLocation", () => {
  const c = (l: string, r = false, allowAsia = false) => classifyLocation(l, r, { allowAsia });
  it.each([
    ["Bengaluru, Karnataka, India", "india-onsite"],
    ["Chennai", "india-onsite"],
    ["Hybrid - Gurgaon", "india-onsite"],
    ["Remote - India", "remote-india"],
    ["Remote (IN)", "remote-india"],
    ["Remote · India, Philippines", "remote-india"],
    ["Remote", "other"],
    ["Remote · Worldwide", "other"],
    ["Indianapolis, IN, US", "other"], // IN = Indiana here
    ["Carmel, IN, United States", "other"],
    ["Bangalore, IN", "india-onsite"],
    ["San Francisco, CA", "other"],
    ["Remote · APAC", "other"],
  ])("%s → %s", (loc, want) => {
    expect(c(loc)).toBe(want);
  });

  it("does not treat Indiana / Indianapolis as India by name", () => {
    expect(c("Indiana")).toBe("other");
    expect(c("Indianapolis")).toBe("other");
  });

  it("APAC remote only counts when allowAsia is on", () => {
    expect(c("Remote · APAC", false, true)).toBe("remote-india");
  });

  it("uses the source's remote flag", () => {
    expect(c("India", true)).toBe("remote-india");
  });
});

describe("extractYears", () => {
  it.each([
    ["We need 3+ years of experience with Node.js", 3, undefined],
    ["2-4 years of experience in backend development", 2, 4],
    ["Minimum of five years experience building APIs", 5, undefined],
    ["1 to 3 yrs of hands-on work with React", 1, 3],
    ["0–2 years experience", 0, 2],
    ["Experience: 2-5 years", 2, 5],
    ["Requires 1+ years of professional experience; 5+ years preferred", 1, undefined],
  ])("%s", (text, min, max) => {
    const y = extractYears(text);
    expect(y?.min).toBe(min);
    if (max !== undefined) expect(y?.max).toBe(max);
  });

  it("ignores non-experience numbers", () => {
    expect(extractYears("We have been around for 10 years and serve 3 million users.")).toBeUndefined();
    expect(extractYears("")).toBeUndefined();
  });
});

describe("evaluate (Syed's profile)", () => {
  const goodDesc =
    "We're looking for an engineer with 1-3 years of experience. Stack: React, Next.js, Node.js, PostgreSQL, Redis, BullMQ. Build real-time dashboards with WebSockets.";

  it("accepts a junior full-stack role in Chennai with a high score", () => {
    const r = evaluate(job({ title: "Full Stack Engineer (SDE-1)", location: "Chennai, India", description: goodDesc }), profile, NOW);
    expect(r.match).toBeDefined();
    expect(r.match!.score).toBeGreaterThan(80);
    expect(r.match!.reasons.join(" ")).toMatch(/Chennai/);
  });

  it("accepts remote-India backend roles", () => {
    const r = evaluate(job({ title: "Backend Engineer", location: "Remote - India", remote: true, description: goodDesc }), profile, NOW);
    expect(r.match?.locationClass).toBe("remote-india");
  });

  it.each([
    ["Senior Software Engineer", "title-excluded"],
    ["Staff Backend Engineer", "title-excluded"],
    ["Software Engineer III", "title-excluded"],
    ["SDE 3 - Platform", "title-excluded"],
    ["Engineering Manager", "title-excluded"],
    ["Software Engineering Intern", "title-excluded"],
    ["Android Developer", "title-excluded"],
    [".NET Developer", "title-excluded"],
    ["QA Automation Engineer", "title-excluded"],
    ["Site Reliability Engineer", "title-excluded"],
    ["Account Executive", "title-no-match"],
    ["Product Designer", "title-no-match"],
  ])("rejects %s (%s)", (title, reason) => {
    expect(evaluate(job({ title, description: goodDesc }), profile, NOW).rejected).toBe(reason);
  });

  it("rejects non-India locations", () => {
    expect(evaluate(job({ title: "Full Stack Engineer", location: "Berlin, Germany", description: goodDesc }), profile, NOW).rejected).toBe("location");
    expect(evaluate(job({ title: "Full Stack Engineer", location: "Remote", remote: true, description: goodDesc }), profile, NOW).rejected).toBe("location");
  });

  it("rejects jobs asking for more than 3 years", () => {
    const r = evaluate(job({ title: "Backend Engineer", description: "5+ years of experience with Node.js and PostgreSQL" }), profile, NOW);
    expect(r.rejected).toBe("experience");
  });

  it("rejects stale postings", () => {
    const r = evaluate(job({ title: "Backend Engineer", postedAt: "2026-09-01T00:00:00Z", description: goodDesc }), profile, NOW);
    expect(r.rejected).toBe("too-old");
  });

  it("rejects weak matches (generic SWE, unrelated stack)", () => {
    const r = evaluate(job({ title: "Software Engineer", description: "Work on our Scala and Spark data platform with Hadoop." }), profile, NOW);
    expect(r.rejected).toBe("low-score");
  });

  it("lets a strong title through when the feed has no description", () => {
    const r = evaluate(job({ title: "Full Stack Developer", description: "" }), profile, NOW);
    expect(r.match).toBeDefined();
  });

  it("sorts best matches first", () => {
    const { matches } = matchJobs(
      [
        job({ title: "Software Developer", location: "Pune, India", description: "Node.js and React, 1-2 years of experience" }),
        job({ title: "Full Stack Engineer I", location: "Chennai, India", description: goodDesc }),
      ],
      profile,
      NOW,
    );
    expect(matches[0]!.job.title).toBe("Full Stack Engineer I");
  });
});

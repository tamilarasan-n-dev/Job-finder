import { describe, expect, it } from "vitest";
import { parseAshby, parseGreenhouse, parseLever, parseSmartRecruiters, parseWorkable } from "../src/sources/ats.js";
import { parseRemoteOk, parseRemotive, parseWwr } from "../src/sources/feeds.js";
import { htmlToText } from "../src/text.js";
import * as fx from "./fixtures.js";

describe("htmlToText", () => {
  it("decodes Greenhouse's escaped HTML", () => {
    const t = htmlToText(fx.greenhouse.jobs[0]!.content);
    expect(t).toContain("Build product with React , Node.js & PostgreSQL.");
    expect(t).toContain("• 1-3 years of experience");
    expect(t).not.toMatch(/<|&lt;/);
  });
});

describe("parsers", () => {
  it("greenhouse", () => {
    const jobs = parseGreenhouse(fx.greenhouse, "Acme");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      id: "greenhouse:7001",
      title: "Software Engineer I, Full Stack",
      company: "Acme",
      url: "https://job-boards.greenhouse.io/acme/jobs/7001",
      postedAt: "2026-11-15T09:30:00Z",
    });
    expect(jobs[0]!.location).toContain("Bengaluru");
    expect(jobs[1]!.remote).toBe(true);
  });

  it("lever", () => {
    const jobs = parseLever(fx.lever, "Beta");
    expect(jobs[0]).toMatchObject({ id: "lever:a1b2c3", remote: true, title: "Backend Developer - Node.js" });
    expect(jobs[0]!.location).toMatch(/Remote/);
    expect(jobs[0]!.location).toMatch(/India/);
    expect(jobs[0]!.description).toContain("0-2 years of experience");
  });

  it("ashby skips unlisted jobs and merges locations", () => {
    const jobs = parseAshby(fx.ashby, "Gamma");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.location).toContain("Chennai");
    expect(jobs[0]!.location).toContain("Bengaluru");
  });

  it("smartrecruiters builds public URLs and expands country code", () => {
    const jobs = parseSmartRecruiters(fx.smartrecruiters, "Delta", "Delta1");
    expect(jobs[0]!.url).toBe("https://jobs.smartrecruiters.com/Delta1/744000111");
    expect(jobs[0]!.location).toMatch(/Chennai.*India/);
  });

  it("workable", () => {
    const jobs = parseWorkable(fx.workable, "Epsilon", "epsilon");
    expect(jobs[0]).toMatchObject({ id: "workable:epsilon:ABC123", location: "Noida, Uttar Pradesh, India" });
  });

  it("remotive", () => {
    const jobs = parseRemotive(fx.remotive);
    expect(jobs[0]!.location).toBe("Remote · India");
    expect(jobs[0]!.postedAt).toBe("2026-11-15T10:00:00.000Z");
  });

  it("remoteok drops the legal notice row", () => {
    const jobs = parseRemoteOk(fx.remoteok);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.title).toBe("Full Stack Developer");
  });

  it("weworkremotely RSS", () => {
    const jobs = parseWwr(fx.wwrXml);
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({ company: "Iota", title: "Full-Stack Engineer (India)", location: "Remote · India" });
    expect(jobs[0]!.description).toContain("Node.js & Postgres");
  });
});

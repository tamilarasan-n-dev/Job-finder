import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings } from "../src/config.js";
import { renderDigest, type Mailer } from "../src/email.js";
import { runOnce } from "../src/run.js";
import { Store } from "../src/store.js";
import * as fx from "./fixtures.js";

// Route every outbound request to a fixture, so the whole pipeline runs offline.
function fakeFetch(failing: string[] = []) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (failing.some((f) => url.includes(f))) return new Response("nope", { status: 404 });
    if (url.includes("greenhouse.io")) return json(fx.greenhouse);
    if (url.includes("api.lever.co")) return json(fx.lever);
    if (url.includes("ashbyhq.com")) return json(fx.ashby);
    if (url.includes("smartrecruiters.com")) return json(fx.smartrecruiters);
    if (url.includes("workable.com")) return json(fx.workable);
    if (url.includes("remotive.com")) return json(fx.remotive);
    if (url.includes("remoteok.com")) return json(fx.remoteok);
    if (url.includes("weworkremotely.com")) return new Response(fx.wwrXml, { status: 200 });
    return new Response("unknown", { status: 404 });
  });
}

function fakeMailer() {
  const sent: { to: string[]; bcc?: string[]; subject: string; html: string; text: string }[] = [];
  const mailer = {
    verify: async () => true,
    send: async (m: (typeof sent)[number]) => {
      sent.push(m);
      return "<id@test>";
    },
    close: () => {},
  } as unknown as Mailer;
  return { mailer, sent };
}

const dir = mkdtempSync(join(tmpdir(), "jf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("runOnce end-to-end (offline)", () => {
  let n = 0;
  const settingsFor = () =>
    loadSettings({
      CONFIG_DIR: "config",
      DB_PATH: join(dir, `db-${n++}.sqlite`),
      MAIL_TO: "friend@example.com",
      MAIL_BCC: "me@example.com",
      ADMIN_EMAIL: "me@example.com",
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T06:00:00Z"));
  });

  it("emails India/remote-India matches once, then stays quiet", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const s = settingsFor();
    const store = new Store(s.dbPath);
    const { mailer, sent } = fakeMailer();

    const r1 = await runOnce(s, store, mailer);
    expect(r1.emailed).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["friend@example.com"]);
    expect(sent[0]!.bcc).toEqual(["me@example.com"]);

    const titles = r1.newMatches.map((m) => m.job.title);
    // Wanted
    expect(titles).toContain("Software Engineer I, Full Stack"); // Bengaluru
    expect(titles).toContain("Backend Developer - Node.js"); // remote India
    expect(titles).toContain("Frontend Engineer (React / Next.js)"); // Chennai
    expect(titles).toContain("Software Developer - MERN"); // Chennai, SR
    expect(titles).toContain("Node.js Developer"); // Remotive, India
    expect(titles).toContain("Full-Stack Engineer (India)"); // WWR India
    // Not wanted
    expect(titles).not.toContain("Senior Backend Engineer");
    expect(titles).not.toContain("Backend Engineer"); // San Francisco
    expect(titles).not.toContain("Product Designer");
    expect(titles).not.toContain("Sales Manager");
    const ids = r1.newMatches.map((m) => m.job.id);
    expect(ids.some((id) => id.startsWith("workable:") && id.endsWith(":ABC123"))).toBe(true); // Noida
    expect(ids).not.toContain("remoteok:123"); // worldwide remote
    expect(ids.some((id) => id.includes("theta-co"))).toBe(false); // WWR "Anywhere in the World"
    expect(ids).not.toContain("remotive:992"); // USA only
    // Strong skill match ranks first; Chennai roles carry the location bonus
    expect(r1.newMatches[0]!.job.title).toBe("Software Engineer I, Full Stack");
    const chennai = r1.newMatches.find((m) => m.job.title.startsWith("Frontend Engineer"))!;
    expect(chennai.reasons).toContain("Location: Chennai");

    const r2 = await runOnce(s, store, mailer);
    expect(r2.newMatches).toHaveLength(0);
    expect(sent).toHaveLength(1); // no second email
    store.close();
  });

  it("does not mark jobs as sent when the email fails, so they retry next run", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const s = settingsFor();
    const store = new Store(s.dbPath);
    const failing = {
      verify: async () => true,
      send: async () => {
        throw new Error("SMTP down");
      },
      close: () => {},
    } as unknown as Mailer;
    await expect(runOnce(s, store, failing)).rejects.toThrow("SMTP down");

    const { mailer, sent } = fakeMailer();
    const r = await runOnce(s, store, mailer);
    expect(r.emailed).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
    store.close();
  });

  it("keeps going when some boards 404, and alerts admin when all sources fail", async () => {
    vi.stubGlobal("fetch", fakeFetch(["greenhouse.io"]));
    const s = settingsFor();
    const store = new Store(s.dbPath);
    const { mailer, sent } = fakeMailer();
    const r = await runOnce(s, store, mailer);
    expect(r.sourcesFailed).toBeGreaterThan(0);
    expect(r.sourcesOk).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 404 })));
    await expect(runOnce(s, store, mailer)).rejects.toThrow(/Every source failed/);
    expect(sent.at(-1)!.to).toEqual(["me@example.com"]);
    expect(sent.at(-1)!.subject).toMatch(/failed/);
    store.close();
  });

  it("dry run sends nothing and records nothing", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const s = settingsFor();
    const store = new Store(s.dbPath);
    const r = await runOnce(s, store, null, { dryRun: true });
    expect(r.newMatches.length).toBeGreaterThan(0);
    const again = await runOnce(s, store, null, { dryRun: true });
    expect(again.newMatches.length).toBe(r.newMatches.length);
    store.close();
  });
});

describe("renderDigest", () => {
  it("escapes HTML and includes every job link", () => {
    const d = renderDigest(
      [
        {
          job: {
            id: "x:1",
            source: "lever",
            externalId: "1",
            title: "Engineer <script>alert(1)</script>",
            company: "A&B",
            location: "Chennai, India",
            remote: false,
            url: "https://jobs.lever.co/ab/1",
            description: "",
          },
          score: 70,
          locationClass: "india-onsite",
          reasons: ["Full-stack role"],
        },
      ],
      "Syed Abdul Rahman",
    );
    expect(d.subject).toBe("New job match: Engineer <script>alert(1)</script> at A&B");
    expect(d.html).not.toContain("<script>");
    expect(d.html).toContain("A&amp;B");
    expect(d.html).toContain("https://jobs.lever.co/ab/1");
    expect(d.html).toContain("Hi Syed");
    expect(d.text).toContain("https://jobs.lever.co/ab/1");
  });
});

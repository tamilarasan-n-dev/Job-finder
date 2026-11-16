# job-finder

Hourly job alerts. Every hour it pulls openings from public company job boards and remote-job feeds, keeps the ones that fit the profile in `config/profile.yaml`, and emails the **new** matches. If there's nothing new, it sends nothing.

- **Who it's for:** Syed Abdul Rahman — full-stack (React/Next.js, Node, PostgreSQL, Redis), ~1–2 yrs, Chennai.
- **Where:** jobs located in India, or remote and open to India. Worldwide-remote and US/EU-only roles are dropped.
- **Recipients:** `MAIL_TO` gets the digest; `MAIL_BCC` gets a silent copy; `ADMIN_EMAIL` gets failure alerts and a daily health check.

## How it works

```
every hour ──► fetch ──► normalise ──► filter + score ──► drop already-sent ──► email ──► remember sent
               30 company boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable)
               + Remotive, Remote OK, We Work Remotely feeds
```

- **Each job is emailed once.** Sent jobs are stored in SQLite (`/app/data` volume). The same company + title is also skipped for 30 days, so re-posts and cross-posts don't repeat.
- **Failures don't lose jobs.** Jobs are marked sent only after the email goes through. If SMTP fails, they're retried on the next run.
- **One bad board doesn't stop the run.** It's logged and skipped. If *every* source fails (e.g. the VM lost internet), `ADMIN_EMAIL` gets an alert.
- **At most `MAX_JOBS_PER_EMAIL` per email** (default 30). Any extra matches go in the next hour's email.

### How scoring works

A job must pass all the gates first:

| Gate | Rule |
|---|---|
| Location | Indian city/state/country, or remote + India. "Indiana / IN, US" doesn't count. |
| Title | Must match a role pattern (full-stack, backend, frontend, SDE, Node/React…). Senior/Staff/Lead/Manager, level III+, interns, mobile, QA, DevOps, data, sales… are excluded. |
| Freshness | Posted within `maxAgeDays` (21), when the source gives a date. |
| Experience | Dropped if the description asks for more than `maxYearsRequired` (3) years minimum. |

Then it gets points: the best title match (15–35), early-career level (+4 to +12), skill overlap with the profile (capped at 40), an experience range that fits (+10), and the preferred city (Chennai +15, Bengaluru/Tamil Nadu +4). A job must reach `minScore` (45) to be sent. Every email shows why each job matched.

To tune it, edit `config/profile.yaml` and `config/companies.yaml` on the VM. Changes apply on the next run, with no rebuild or restart needed.

## Deploy from a phone (no SSH)

`scripts/gcp-startup.sh` deploys itself on every boot using settings from the VM's metadata, so the whole setup is done from the Google Cloud console:

1. **VM → Edit → Metadata → Add item** for each key: `jf-smtp-user`, `jf-smtp-pass`, `jf-mail-to` (required), and optionally `jf-mail-bcc`, `jf-admin-email`, `jf-smtp-host` (default `smtp.gmail.com`), `jf-smtp-port` (default `465`).
2. **Edit → Automation → Startup script**, paste:
   ```
   curl -fsSL https://raw.githubusercontent.com/tamilarasan-n-dev/Job-finder/main/scripts/gcp-startup.sh | bash
   ```
3. **Save**, then **Reset** the VM. Watch progress under **Logs → Serial port 1**. Look for `[job-finder]` lines ending in `running ✔`.

To pull new code or apply changed settings, just **Reset** the VM again. Metadata values are visible to anyone with access to your Cloud project.

## Deploy over SSH (Google Cloud VM)

**1. Create the VM.** An e2-micro or e2-small running Debian/Ubuntu is plenty, since the container is capped at 256 MB. No inbound ports are needed.

**2. Get the code onto it.**
```bash
git clone https://github.com/<you>/job-finder.git && cd job-finder
```

**3. Configure and launch.**
```bash
bash scripts/deploy.sh      # first run creates .env and stops
nano .env                   # SMTP + MAIL_TO / MAIL_BCC / ADMIN_EMAIL
bash scripts/deploy.sh      # installs Docker if needed, builds, checks boards, sends a test email, starts
```

> **Google Cloud blocks outbound port 25.** Use port **587** or **465**. For Gmail, use `smtp.gmail.com:465` with an [App Password](https://myaccount.google.com/apppasswords) (2-Step Verification must be on). Your normal password won't work.

**4. Check on it.**
```bash
docker compose logs -f job-finder                     # live logs
docker compose run --rm job-finder run --dry-run      # see what would be emailed right now
docker compose run --rm job-finder verify             # check every company board
docker compose run --rm job-finder test-email         # SMTP check
docker compose run --rm job-finder heartbeat          # send health summary now
```

**Update after code changes:** `git pull && bash scripts/deploy.sh` (set `SKIP_TEST_EMAIL=1` to skip the test mail).

## Adding companies

Find the board slug in a job URL and add a line to `config/companies.yaml`:

| ATS | Job URL looks like | Entry |
|---|---|---|
| Greenhouse | `job-boards.greenhouse.io/postman/jobs/…` | `{ name: Postman, ats: greenhouse, slug: postman }` |
| Lever | `jobs.lever.co/mindtickle/…` | `{ name: Mindtickle, ats: lever, slug: mindtickle }` |
| Ashby | `jobs.ashbyhq.com/supabase/…` | `{ name: Supabase, ats: ashby, slug: supabase }` |
| SmartRecruiters | `jobs.smartrecruiters.com/Flywire1/…` | `{ name: Flywire, ats: smartrecruiters, slug: Flywire1 }` |
| Workable | `apply.workable.com/acme/…` | `{ name: Acme, ats: workable, slug: acme }` |

Then run `verify`. Companies with custom careers pages (Workday, Keka, Zoho Recruit, their own site) aren't supported, and neither are LinkedIn and Naukri: they block automated access, and their terms forbid it.

## Local development

```bash
npm install
npm test               # 58 tests, fully offline (APIs mocked with fixtures)
npm run build
cp .env.example .env   # then: set -a; . ./.env; set +a
npm run dry-run
```

Node ≥ 22.13 (uses the built-in `node:sqlite`, so there are no native modules to compile).

```
src/
  index.ts          CLI: daemon | run [--dry-run] | verify | test-email | heartbeat
  run.ts            one run: fetch → match → dedupe → email → record
  sources/ats.ts    Greenhouse, Lever, Ashby, SmartRecruiters, Workable
  sources/feeds.ts  Remotive, Remote OK, We Work Remotely
  location.ts       India / remote-India classifier
  matcher.ts        gates + scoring + experience extraction
  store.ts          SQLite: sent jobs, run history
  email.ts          HTML + text digest, SMTP
config/
  profile.yaml      who we're matching for
  companies.yaml    which boards to scan
```

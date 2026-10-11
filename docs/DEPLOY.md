# Deploying CHIRON (Vercel + Supabase, no accounts)

A shared URL for a handful of testers. Each browser is an anonymous visitor; all data lives in one
Supabase project, scoped by visitor id on the server. Background: DECISIONS D16.

## 1. Supabase

1. **Create a project** at supabase.com → New project. Any region near your testers; note the
   database password (CHIRON doesn't use it).
2. **Run the SQL**: SQL Editor → New query → paste all of [`SUPABASE.sql`](SUPABASE.sql) → Run.
   It creates the `docs` and `events` tables (RLS on, no policies) and the private bucket.
3. **Check the bucket**: Storage → you should see **`chiron-files`**, marked *Private*. (If the SQL
   couldn't create it, create it by hand with exactly that name, Public **off**, file size limit
   60 MB.)
4. **Find the keys**: Project Settings → API Keys (older dashboards: Settings → API).
   - **Project URL** (`https://<ref>.supabase.co`) → `SUPABASE_URL`. Also shown under Data API.
   - **service_role** key (legacy tab) or a **Secret key** (`sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY`.
     This key bypasses RLS: server only, never shared.
   - You do **not** need the anon / publishable key. CHIRON never uses it.

## 2. Vercel environment variables

Settings → Environment Variables. Add each to **Production and Preview**, mark the secret ones
**Sensitive**, then **redeploy** (deployments only see variables that existed when they were built).

| Name | Secret? | Example | Notes |
|---|---|---|---|
| `LLM_API_KEY` | **yes** | `AIza…` | Gemini or Anthropic key |
| `SUPABASE_URL` | no | `https://abcd1234.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | `eyJhbGciOi…` or `sb_secret_…` | |
| `COOKIE_SECRET` | **yes** | 43 random characters | signs the access cookie; generate below |
| `ACCESS_CODES` | yes-ish | `ruby,aidan,mentor1` | one code per tester or group; empty = no gate |
| `INTERNAL_PASSWORD` | **yes** | any long phrase | optional; for `/internal/summary` |
| `LLM_RATE_LIMIT_PER_HOUR` | no | `60` | optional; default 60 model calls per visitor per hour |

Generate `COOKIE_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

None of these may have a `NEXT_PUBLIC_` prefix. The build fails if a secret's name or value shows
up in browser code (`scripts/check-client-secrets.mjs`), and a production or preview build without
the two Supabase variables fails on purpose (it would otherwise lose every write).

**Function duration**: model routes set `maxDuration = 300` seconds. With Fluid compute (on by
default for new Vercel projects) that is the Hobby maximum and the Pro default; Pro allows up to
800. Check Settings → Functions that Fluid compute is enabled — without it Hobby caps at 60 s and
planning a hard problem can time out.

**Preview deployments** are behind Vercel Authentication by default; send testers the production URL.

## 3. Local

```bash
npm install
```

```bash
npm run dev
```

With no Supabase variables, data goes to `data/visitors/<visitor-id>/` (the same isolation as
production). `ACCESS_CODES` unset = no code screen. Checks:

```bash
npm run check
```

```bash
npm run test:e2e
```

To try the Supabase store locally, put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` — it then uses the real project.

## 4. Two-minute check after deploying

1. **Browser A** (normal window): open the URL → code screen → enter a code → the home page shows
   one course, *AE 3120 — Structural Mechanics* (every new visitor gets this demo).
2. Create a course "Isolation test", paste a short problem (e.g. *Solve 2x + 3 = 11 for x*), wait for
   the setup and for **Next step** to unlock, press it once. Copy the page URL.
3. **Browser B** (private window, or another browser): enter a code. The home page shows only the
   demo course — not "Isolation test". Paste A's URL: nothing of A's loads.
4. **In A**: open the course's material panel and upload a PDF (a few MB is fine; up to 60 MB).
   It should render; click a page and ask about it.
5. **In A**: open the demo course and run Problem 7.18: hint → next step → *I got it* → type a line
   in *Check my work*.
6. In Supabase → Table Editor → `docs`, rows have two different `visitor_id`s; Storage →
   `chiron-files` has a folder per visitor.

If something fails: Vercel → the deployment → Logs. A missing variable shows a clear message there.

## 5. What testers should know

- There's no account. Your work is tied to **this browser**: clearing cookies, a private window,
  or another device starts fresh, and the old work can't be recovered from the app.
- Everyone gets the same demo course to try first.
- There's a limit of about 60 tutor requests per hour; if you hit it, the app says when it resets.

## 6. Not verified without a real Supabase project / Vercel deployment

- The Supabase store was tested against an **in-memory mock of supabase-js**, not a real project
  (no Docker or Supabase CLI here). The SQL, the RLS behaviour, PostgREST filters on `uuid`/`bigint`
  columns, and Storage calls are untested against the real service.
- **Direct uploads**: the browser `PUT`s the file to the signed upload URL with a raw body. This
  matches supabase-js's own `uploadToSignedUrl`, but hasn't run against real Storage.
- **PDF viewing** follows a 302 to a signed Storage URL; pdf.js needs Storage's CORS headers for
  that (Supabase sends them by default). Untested on a real project.
- Vercel-specific behaviour (startup failure without Supabase, the 300 s duration, proxy on Vercel).

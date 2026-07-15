# Paisa — Personal Finance Manager (expenses + investments + AI insights)

A React + Vite personal finance app with **email/password + Google login** and **cross-device sync** via Supabase (free tier), built and deployed automatically by GitHub Actions. Upload bank-statement CSVs, auto-categorize, track subscriptions, budgets and trends — and import your **Groww stocks & mutual-fund holdings** for a full portfolio view with optional **weekly AI-powered analysis**. Your data lives in your own Supabase project, gated behind your login, isolated per-account by Row-Level Security.

Until you add Supabase keys, the app runs in **local-only mode** (data stays in that browser) so it still works out of the box.

---

## Setup: accounts + cloud sync (~10 minutes, one time)

### 1. Create a Supabase project
- Go to https://supabase.com -> sign in -> **New project**.
- Pick a name and a strong database password. Choose the region closest to you.
- Wait ~2 min for it to provision.

### 2. Create the data table + security rules
In the project, open **SQL Editor** -> **New query**, paste this, and click **Run**:

```sql
create table if not exists paisa_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  txns jsonb default '[]',
  income jsonb default '{}',
  budgets jsonb default '{}',
  updated_at timestamptz default now()
);

alter table paisa_data enable row level security;

create policy "own rows - select" on paisa_data
  for select using (auth.uid() = user_id);
create policy "own rows - insert" on paisa_data
  for insert with check (auth.uid() = user_id);
create policy "own rows - update" on paisa_data
  for update using (auth.uid() = user_id);
```

This guarantees each account can only ever read or write its own row -- even though the app code is public.

### 3. Enable login providers
- **Authentication -> Providers -> Email**: ensure enabled. For easiest start, turn **"Confirm email"** off so you can sign in immediately. Leave it on if you prefer email verification.
- **Authentication -> Providers -> Google**: toggle on. You'll need a Google OAuth client:
  - https://console.cloud.google.com -> APIs & Services -> Credentials -> **Create Credentials -> OAuth client ID** -> *Web application*.
  - Under **Authorized redirect URIs**, add the callback URL Supabase shows on the Google provider page (like `https://<project-ref>.supabase.co/auth/v1/callback`).
  - Copy the **Client ID** and **Client secret** into Supabase's Google provider settings -> Save.

### 4. Allow your site's URL
**Authentication -> URL Configuration**:
- **Site URL**: `https://<your-username>.github.io/Paisa/`
- Add the same under **Redirect URLs**.
- (For local testing also add `http://localhost:8000`.)

### 5. Give the app your keys (as GitHub secrets — nothing in the code)
In Supabase: **Project Settings -> API**. Copy the **Project URL** and the **anon public** key.
Then in GitHub: repo **Settings -> Secrets and variables -> Actions -> New repository secret**, add:

| Secret name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |

The deploy workflow injects them at build time — no keys live in the source. (Note: the anon key still ships inside the built JS, which is by design and safe; Row-Level Security is what protects the data. Keeping it out of the repo is hygiene, not secrecy.) For local development, copy `.env.example` to `.env` and fill in the same two values. Without keys the app runs in local-only mode.

### 6. Push to GitHub
Push to `main`. GitHub Actions builds the app and deploys it to Pages automatically (see **Development & deployment** below). Open `https://<your-username>.github.io/Paisa/` -- you'll get a login screen. Create an account or use Google, and you're synced across iPad, phone and laptop.

---

## How sync works
- On first login, any data already in that browser (your May 2026 data) is **migrated up** to your cloud row automatically.
- After that, every change saves locally instantly and pushes to the cloud within a second. The account menu (top-right avatar) shows **Synced / Syncing / Offline**.
- localStorage is kept as an offline cache, so the app still opens if the network is flaky.

## Development & deployment

The app is a standard **Vite + React** project:

```bash
npm install     # once
npm run dev     # local dev server with hot reload
npm run build   # production build into dist/
```

**Deployment is fully automated.** Every push to `main` triggers `.github/workflows/deploy.yml`, which runs `npm ci && npm run build` on GitHub's servers and publishes `dist/` to GitHub Pages — no local build needed, so you can work entirely from an iPad.

**One-time setting**: Repo -> **Settings -> Pages** -> Source: **GitHub Actions** (instead of "Deploy from a branch"). Without this the new builds won't go live.

Code layout: `src/lib.js` (pure logic — parsing, categorization, portfolio, storage, Supabase), `src/App.jsx` (all React components), `src/main.jsx` (entry), `src/styles.css` (design system), `supabase/functions/` (edge functions, deployed separately via the Supabase CLI).

## Privacy
Data lives only in your Supabase project, behind your login, isolated per-user by Row-Level Security. The anon key is meant to be public; it cannot bypass those rules. Use a strong, unique password -- this is bank-derived data.

## CSV format
Date + Description/Narration + Amount (or Withdrawal/Deposit columns). HDFC CSV export works as-is.

---

## Portfolio (Groww stocks + mutual funds)

The **📈 Portfolio** tab imports Groww holdings statements directly — no conversion needed:

- **Stocks**: Groww → Profile → Reports → *Stocks holdings statement* (.xlsx)
- **Mutual funds**: Groww → Profile → Reports → *Mutual funds holdings statement* (.xlsx)

Drop either file in; the app detects which one it is, shows current value / unrealised P&L per holding, asset-allocation charts, best & worst performers, concentration warnings, and a value-over-time trend (one point per imported statement — import weekly to build the trend).

### Enable cloud sync for the portfolio (one line of SQL)

If you set up `paisa_data` before v2.2.0, add the new column in the Supabase **SQL Editor**:

```sql
alter table paisa_data add column if not exists portfolio jsonb default '{}';
```

Without it the portfolio still works, but stays on the device you imported it on.

---

## AI portfolio insights (deep, twice a month, powered by Claude)

Optional: a Supabase **Edge Function** (`supabase/functions/portfolio-insights`) that runs on the **1st and 15th of every month**, reads your holdings, and builds a full fundamental dossier per stock — **live price & 52-week range, P/E, P/B, dividend yield, ROE, margins, revenue/earnings growth, debt/equity, 6-month momentum, analyst targets** (Yahoo Finance) plus **recent headlines** (Google News). It then asks **Claude (Opus)** — with live **web search** enabled so it can verify the latest quarterly results and news itself — for a deep review: a portfolio verdict, a per-holding thesis status (**Strong / Holding up / Weakening / Broken**) with the numbers that matter, a mutual-fund check, a dated watch list for the fortnight, and up to 4 ranked actions to consider. The latest report appears at the top of the Portfolio tab.

### 1. Create the insights table

SQL Editor → run:

```sql
create table if not exists paisa_insights (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table paisa_insights enable row level security;

create policy "own insights - select" on paisa_insights
  for select using (auth.uid() = user_id);
-- no insert/update policies: only the edge function (service role) writes
```

### 2. Deploy the function

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and an [Anthropic API key](https://platform.claude.com/):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set CRON_SECRET=<any-long-random-string>
supabase functions deploy portfolio-insights --no-verify-jwt
```

### 3. Schedule it (1st & 15th of every month)

SQL Editor → run (enables pg_cron + pg_net and schedules 08:00 IST on the 1st and 15th):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'portfolio-insights',
  '30 2 1,15 * *',  -- 02:30 UTC = 08:00 IST on the 1st and 15th
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/portfolio-insights',
    headers := jsonb_build_object('x-cron-secret', '<same-CRON_SECRET-as-above>')
  );
  $$
);
```

If you previously scheduled the old weekly job, remove it first: `select cron.unschedule('weekly-portfolio-insights');`

To test immediately without waiting for the 1st/15th:

```bash
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/portfolio-insights" \
  -H "x-cron-secret: <your-CRON_SECRET>"
```

**Cost**: each report is a single deep Claude (Opus) call with extended thinking and up to 12 web searches — roughly ₹25–40 per report, so about ₹50–80 per user per month at two reports. Yahoo Finance and Google News lookups are free and best-effort — if either is unreachable, Claude still analyzes from your statement data plus its own web searches.

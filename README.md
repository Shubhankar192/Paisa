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

### 5. Paste your keys into the app
In Supabase: **Project Settings -> API**. Copy the **Project URL** and the **anon public** key (safe to expose -- RLS protects the data).
Open `src/lib.js`, near the top find the `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants and replace the default strings with your values (or set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars at build time).

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

## AI portfolio insights (weekly, powered by Claude)

Optional: a Supabase **Edge Function** (`supabase/functions/weekly-portfolio-insights`) that runs weekly, reads your holdings, pulls **live prices** (Yahoo Finance) and **recent news** (Google News) for each stock, and asks **Claude** for a fundamentals-grounded review — portfolio health, holding-level notes tied to real news, watch items, and rebalancing considerations. The latest report appears at the top of the Portfolio tab.

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
supabase functions deploy weekly-portfolio-insights --no-verify-jwt
```

### 3. Schedule it weekly

SQL Editor → run (enables pg_cron + pg_net and schedules Sunday 7 AM IST):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-portfolio-insights',
  '30 1 * * 0',  -- 01:30 UTC = 07:00 IST every Sunday
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/weekly-portfolio-insights',
    headers := jsonb_build_object('x-cron-secret', '<same-CRON_SECRET-as-above>')
  );
  $$
);
```

To test immediately without waiting for Sunday:

```bash
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/weekly-portfolio-insights" \
  -H "x-cron-secret: <your-CRON_SECRET>"
```

**Cost**: one weekly Claude call per user analyzing a typical portfolio costs a few rupees a month. Yahoo Finance and Google News lookups are free and best-effort — if either is unreachable, the analysis still runs from your statement data.

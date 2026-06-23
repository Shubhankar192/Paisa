# Paisa — Expense Tracker (with accounts + cloud sync)

A single-file expense tracker with **email/password + Google login** and **cross-device sync** via Supabase (free tier). Upload bank-statement CSVs, auto-categorize, track subscriptions, budgets and trends. Your data lives in your own Supabase project, gated behind your login, isolated per-account by Row-Level Security.

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
Open `index.html`, near the top of the app script find:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY_HERE";
```

Replace the two strings with your values.

### 6. Push to GitHub
Commit `index.html` (and `.nojekyll`) to the repo root, push. Open `https://<your-username>.github.io/Paisa/` -- you'll get a login screen. Create an account or use Google, and you're synced across iPad, phone and laptop.

---

## How sync works
- On first login, any data already in that browser (your May 2026 data) is **migrated up** to your cloud row automatically.
- After that, every change saves locally instantly and pushes to the cloud within a second. The account menu (top-right avatar) shows **Synced / Syncing / Offline**.
- localStorage is kept as an offline cache, so the app still opens if the network is flaky.

## Deploy basics (GitHub Pages)
Repo -> **Settings -> Pages** -> Source: **Deploy from a branch** -> `main` / root -> Save.

## Privacy
Data lives only in your Supabase project, behind your login, isolated per-user by Row-Level Security. The anon key is meant to be public; it cannot bypass those rules. Use a strong, unique password -- this is bank-derived data.

## CSV format
Date + Description/Narration + Amount (or Withdrawal/Deposit columns). HDFC CSV export works as-is.

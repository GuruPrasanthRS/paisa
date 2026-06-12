# Paisa — Deploy Guide (15 minutes)

---

## STEP 1 — Create the Supabase table (do this first)

1. Go to your Supabase project → click **SQL Editor** in the left sidebar
2. Click **New query**
3. Paste this SQL and click **Run**:

```sql
create table expenses (
  id          bigserial primary key,
  date        date not null,
  time        text not null,
  amount      numeric not null,
  mode        text not null check (mode in ('upi','cash')),
  description text not null,
  category    text not null,
  note        text default '',
  created_at  timestamptz default now()
);

alter table expenses enable row level security;

create policy "Allow all" on expenses
  for all using (true) with check (true);
```

4. You should see **Success. No rows returned** — that means it worked.

---

## STEP 2 — Upload to GitHub

1. Go to github.com → click **New repository**
2. Name it `paisa-expense-tracker` → click **Create repository**
3. Click **uploading an existing file**
4. Drag and drop ALL files from this folder
5. Click **Commit changes**

---

## STEP 3 — Deploy on Vercel

1. Go to vercel.com → Sign in with GitHub
2. Click **Add New → Project**
3. Find `paisa-expense-tracker` → click **Import**
4. Leave all settings default → click **Deploy**
5. In ~30 seconds you get a live link like `paisa-expense-tracker.vercel.app`

---

## STEP 4 — Install on phone (Android)

1. Open Chrome → go to your Vercel link
2. Tap **3 dots menu** → **Add to Home screen** → **Add**
3. It now lives on your home screen like a real app

## STEP 4b — Install on laptop

1. Open Chrome → go to your Vercel link
2. Click the install icon in the address bar (monitor with +)
3. Click **Install**

---

## That's it!

Both phone and laptop now share the same data via Supabase.
Log on your phone → instantly visible on your laptop.

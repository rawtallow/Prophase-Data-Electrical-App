# Prophase Portal — Deployment Guide

This is the hosted, multi-user version of your quoting / job log / payroll / clients / spare
parts tool, with real logins and three account types: **Admin**, **Manager**, and **Employee**.

It's a Next.js app that needs a Postgres database and needs to be deployed to Vercel. That
takes about 15 minutes of clicking through the steps below. I can't do these steps for you —
they involve creating accounts/agreements on your behalf, which I'm not able to do — but
they're straightforward.

## What each role can do

- **Admin** — everything, plus managing user accounts (Users page).
- **Manager** — everything Admin can do, except managing user accounts.
- **Employee** — Dashboard (simplified), Job Log (view jobs, update status/schedule/notes —
  no pricing), Spare Parts (view + use/deduct stock, can't edit costs or delete), Clients
  (view contact info + each client's asset register, read-only). No access to Quotes,
  Payroll, Owner Draws, Users, or Backup.

## 1. Push this folder to GitHub

1. Go to [github.com/new](https://github.com/new) and create a new **private** repository
   (e.g. `prophase-portal`).
2. Upload this entire `prophase-portal` folder to it (drag-and-drop on the GitHub web UI
   works fine, or use `git init` / `git add` / `git commit` / `git push` if you're
   comfortable with the command line).

## 2. Import it into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and make sure you're in your
   **rawtallow-9690's projects** team (same one your website is already on).
2. Click **Import** next to the `prophase-portal` GitHub repo.
3. Framework should auto-detect as **Next.js**. Click **Deploy** — it will fail on the
   first try because there's no database yet. That's expected; continue to step 3.

## 3. Add a Postgres database

1. In the new project, go to the **Storage** tab.
2. Click **Create Database** → choose **Postgres** (this is powered by Neon and has a free
   tier that's plenty for this app).
3. Follow the prompts to create it and **connect it to this project**. Vercel will
   automatically add a `DATABASE_URL` (or `POSTGRES_URL`) environment variable for you —
   the app already looks for either name.

## 4. Load the database schema

1. Still in the Storage tab, open the new database and find its **Query** / SQL editor tab
   (Neon's dashboard has one built in).
2. Open `lib/schema.sql` from this project, copy its full contents, paste into the query
   editor, and run it. This creates all the tables.

## 5. Add the session secret

1. In the Vercel project, go to **Settings → Environment Variables**.
2. Add a new variable named `SESSION_SECRET`. For the value, generate a random string —
   easiest way: on your own computer, run this in a terminal (Mac Terminal / Windows
   PowerShell with Node installed):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste the output as the value. Apply it to **Production** (and Preview, if you want
   preview deployments to work too).

## 6. Redeploy

1. Go to the **Deployments** tab and redeploy the latest one (or just push any small change
   to GitHub, which triggers a new deploy automatically).
2. Once it's live, open the URL Vercel gives you (e.g. `prophase-portal.vercel.app`).

## 7. Create your Admin account

1. Visiting the site for the first time will send you to `/setup` automatically (since no
   accounts exist yet). Create your Admin account there with your name, email, and a
   password.
2. From then on, go to **Users** (visible only to Admins) to create Manager and Employee
   accounts for your team — you set their temporary password there and share it with them
   directly.

## Notes

- There's no "forgot password" flow yet — if someone forgets their password, an Admin resets
  it from the Users page.
- The **Backup** page (Admin/Manager) lets you export everything to a JSON file, and restore
  from one. It does not touch user accounts/logins.
- If anything looks broken after deploying, the most common cause is a missing or
  misnamed database environment variable — double check Settings → Environment Variables
  against what `lib/db.js` looks for (`DATABASE_URL` or `POSTGRES_URL`).

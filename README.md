# CA Driver's License Knowledge Test Prep

A minimal question-drilling web app for the California DL knowledge test.
996 bilingual (EN / 简体中文) questions, sign images, wrong-answer review,
bookmarks, and **cross-device progress sync**.

## How progress sync works

You enter a personal **passphrase** in Settings. The same passphrase on your
phone and your laptop maps to the same saved progress in the cloud, so your
progress follows you across devices. The raw passphrase is never stored — the
server hashes it (HMAC-SHA256 + a secret salt) to form the storage key.

If cloud storage isn't configured, the app still works fully and saves progress
in the browser's localStorage (single-device only). So you can deploy first and
add cloud sync later.

---

## Deploy to Vercel (with cloud sync)

### 1. Push to GitHub

```bash
cd P.CA-CMV-Prep
git init
git add .
git commit -m "CA DL prep app"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/ca-dl-prep.git
git push -u origin main
```

### 2. Import into Vercel

Go to https://vercel.com/new, import the repo. Framework auto-detects as
**Next.js**. Click Deploy. It will work immediately in **Local** mode.

### 3. Add a Redis store for cloud sync

In your Vercel project: **Storage → Create Database → Upstash (Redis / KV)**
(Vercel Marketplace). Create it and **connect it to this project**. The app
supports both REST-style Upstash credentials (`UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`, or the older `KV_REST_API_URL` /
`KV_REST_API_TOKEN`) and connection-string style variables from newer Vercel
Redis integrations (`REDIS_URL`, `KV_URL`, or custom-prefixed `...REDIS_URL`).

The Upstash free tier is far more than enough for personal use.

### 4. Add a secret salt (recommended)

Project **Settings → Environment Variables**, add:

```
APP_SECRET = <any long random string>
```

This salts the passphrase hash. Keep it constant — if you change it later, old
passphrases will map to new (empty) keys.

### 5. Redeploy

**Deployments → ⋯ → Redeploy** so the new env vars take effect. Open the app,
go to **settings**, enter your passphrase, tap **Save & sync**. The status dot
turns green ("Cloud sync active"). Enter the same passphrase on your phone and
your progress is shared.

---

## Run locally

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

For local cloud-sync testing, create `.env.local`:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
APP_SECRET=some-long-random-string
```

Or use a Redis connection string instead:

```
REDIS_URL=rediss://default:password@host:6379
APP_SECRET=some-long-random-string
```

---

## Features

- **All / Wrong / ★ Bookmarked** tabs. Wrong answers auto-collect into a review
  book; getting one right later removes it. Tap ☆ to bookmark any question.
- **Sequential mode** remembers your last position and resumes there on any
  device.
- **Bilingual** — English (the actual test language) with 简体中文 underneath.
- **Sign questions** show the corresponding road-sign image.
- Minimal design, dark-mode aware, mobile-friendly.

## Data

`public/data/questions-all.json` — 996 questions. Sign images in
`public/images/signs/`. To update questions, replace the JSON (keep the same
shape) and redeploy.

# WaiTech Auto Publisher 2026

Device-independent, cloud-ready automation that watches a Blogger RSS feed
and automatically publishes new (or intentionally republished) posts to a
Facebook Page through Buffer's GraphQL API.

```
Blogger  →  Cloud Scheduler  →  RSS detection  →  New/Republish decision
   →  Database/idempotency  →  Caption  →  Feature image
   →  Buffer  →  Facebook  →  Publication record
```

Runs in the cloud on a 5-minute schedule via GitHub Actions. **Your
computer does not need to be on.**

## Status

This is v2.0.0 — a cloud-hardened evolution of the original, already-verified
local publisher. The core pipeline (Blogger extraction → caption → Buffer →
Facebook) is unchanged from the version that successfully created a real,
live Facebook post. See `CHANGELOG.md` for the full list of what changed.

## Project structure

```
waitech-auto-publisher/
├── .github/workflows/auto-publisher.yml   # cloud scheduler (GitHub Actions)
├── src/
│   ├── index.js               # main publisher pipeline
│   ├── blogger.js             # Blogger RSS + feature image extraction
│   ├── caption.js             # Facebook caption generation
│   ├── database.js            # publication history + republish strategy
│   ├── bufferClient.js        # Buffer GraphQL client (createPost mutation)
│   ├── lock.js                # file-based concurrency lock
│   ├── retry.js                # transient-failure retry helper
│   ├── health-check.js        # lightweight health/status check
│   ├── buffer-schema-test.js  # schema test — always dry-run, never live
│   └── publish-test.js        # integration test — dry-run by default
├── scheduler.js                # local scheduler (Windows/any machine)
├── start-background.vbs        # Windows: run scheduler.js hidden in background
├── data/published.json         # publication history (tracked in git for the cloud DB strategy)
├── .env.example                 # template — copy to .env locally
└── .gitignore
```

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and set BUFFER_ACCESS_TOKEN (and optionally BUFFER_CHANNEL_ID, BLOGGER_RSS)
```

Run once:

```bash
npm start
```

Run continuously (local scheduler, checks every `SCHEDULER_INTERVAL_MINUTES`, default 5):

```bash
npm run scheduler
```

On Windows, `start-background.vbs` launches `scheduler.js` hidden in the
background, logging to `scheduler.log` — unchanged from the original setup,
kept for local/manual use.

### Safe testing

```bash
npm run test:schema        # always dry-run — validates the Buffer request shape, never sends it
DRY_RUN=true npm start      # runs the full pipeline, sends nothing to Buffer, writes nothing to the database
npm run health              # checks env vars + Blogger RSS reachability
```

Only one command can ever create a real Facebook post, and it requires two
explicit confirmations:

```bash
LIVE=true node src/publish-test.js --confirm
```

## Cloud deployment (GitHub Actions)

See `DEPLOYMENT.md` for full step-by-step instructions. Summary:

1. Push this repository to GitHub.
2. Add repository secrets: `BUFFER_ACCESS_TOKEN`, `BUFFER_CHANNEL_ID` (optional), `BLOGGER_RSS` (optional).
3. The workflow in `.github/workflows/auto-publisher.yml` runs automatically every 5 minutes.
4. After each real publish, the workflow commits the updated `data/published.json` back to the repo — this is how state survives GitHub Actions' ephemeral runners without adding an external database.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BUFFER_ACCESS_TOKEN` | Yes | — | Buffer API token. Never commit it. |
| `BUFFER_CHANNEL_ID` | No | `6a7de7afb2d9d577436e52b5` | Buffer channel/profile ID |
| `BLOGGER_RSS` | No | WaiTech Solution feed | Blogger RSS feed URL |
| `DRY_RUN` | No | `false` | `true` = full pipeline, nothing sent/saved |
| `SCHEDULER_INTERVAL_MINUTES` | No | `5` | Local `scheduler.js` only; the cloud interval is set by the cron expression in the workflow file |

## Republish strategy

Each publication record stores the post's Blogger `id` alongside the
`sourcePublishedAt` (Blogger's own pubDate for that post at the time we
published it):

- **New post** (id not seen before) → publish.
- **Routine re-check** (id seen before, Blogger's pubDate unchanged) → skip. This is what makes 5-minute polling safe — nothing about the feed changed.
- **Intentional republish** (id seen before, but Blogger's pubDate has changed) → publish again, and update the stored record.
- **Legacy records** written before this version (plain id strings, no stored date) → always skip, preserving the original duplicate-protection behavior exactly for old data.

In practice: to intentionally republish a post on Facebook, update its
publish date in Blogger. Editing the content without changing the date will
not trigger a republish.

## Idempotency / concurrency

- A file lock (`data/publisher.lock`) prevents two overlapping runs on the
  same machine from both publishing.
- The GitHub Actions workflow uses `concurrency:` to serialize cloud runs,
  since each run is a fresh, isolated VM.
- A post is only ever marked as published **after** Buffer confirms
  success — a failed or ambiguous request never gets recorded, so the next
  cycle will naturally retry it.

## Known limitations

- **No Buffer idempotency key.** If a network failure happens *after*
  Buffer has already created the post but *before* the response reaches
  this app, a retry could theoretically create a duplicate. Retries are
  therefore limited to failures where no response was received at all
  (see `src/retry.js`).
- **GitHub Actions scheduled runs are best-effort.** GitHub does not
  guarantee cron timing precision during platform-wide load; a 5-minute
  schedule may occasionally run a few minutes late.
- **Republish detection depends on Blogger's pubDate changing.** If a post
  is edited without its publish date changing, it will not be treated as
  a republish.
- **Single Facebook Page / single Buffer channel.** Multi-channel support
  was not part of the original scope and is not implemented.

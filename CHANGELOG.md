# Changelog

## 2.0.0 — Cloud-ready production release

### Fixed
- `rss-parser` was used by `blogger.js`, `buffer-schema-test.js`, and
  `publish-test.js` but was missing from `package.json` and not installed —
  the project could not start at all. Added as a declared dependency.
- `markAsPublished(id, metadata)` in `index.js` passed a metadata object
  that `database.js` silently discarded, so `title`, `bufferPostId`, and
  `publishedAt` were never actually saved. `database.js` now stores the
  full record.

### Added
- `src/bufferClient.js` — shared Buffer GraphQL client (mutation string and
  `CreatePostInput` shape are unchanged from the verified working version).
- `src/retry.js` — retry helper for transient (thrown) network failures.
  Never retries after a response has been received, to avoid duplicate
  posts against Buffer's non-idempotent API.
- `src/lock.js` — file-based concurrency lock preventing two overlapping
  local runs from both publishing the same post.
- `src/health-check.js` — lightweight pass/fail health check (env vars +
  Blogger RSS reachability).
- `database.js`: `getPublicationDecision(id, sourcePublishedAt)` —
  implements the new-post / routine-skip / intentional-republish strategy
  (see README "Republish strategy"). Legacy records are unaffected and
  always resolve to the original skip behavior.
- `DRY_RUN` environment variable — runs the full pipeline without sending
  anything to Buffer or writing to the database.
- `.github/workflows/auto-publisher.yml` — GitHub Actions cloud scheduler,
  runs every 5 minutes, commits the updated publication database back to
  the repo, uses `concurrency:` to prevent overlapping cloud runs.
- `.gitignore`, `.env.example`.
- `SCHEDULER_INTERVAL_MINUTES` — makes the local scheduler interval
  configurable (defaults to 5 minutes, unchanged from before).
- `README.md`, `CHANGELOG.md`, `DEPLOYMENT.md`.
- `npm` scripts: `scheduler`, `test:schema`, `test:integration`, `health`.
- `engines.node >=18` in `package.json` (required for global `fetch`).

### Changed
- `src/buffer-schema-test.js` — now purely offline/dry-run. It validates
  the `CreatePostInput` shape without ever sending a request to Buffer
  (previously it fired a real, unconditional live post).
- `src/publish-test.js` — now dry-run by default. Creating a real Facebook
  post requires both `LIVE=true` and the `--confirm` CLI flag.
- `scheduler.js` — interval is now configurable via
  `SCHEDULER_INTERVAL_MINUTES`; logic otherwise unchanged.
- `index.js` — now wraps the run in the concurrency lock, uses the shared
  `bufferClient`, resolves publish/skip/republish via
  `getPublicationDecision`, and supports `DRY_RUN`. The exact log lines
  for the duplicate-skip path (`POST ALREADY PUBLISHED.` /
  `Nothing sent to Buffer.`) are unchanged, since existing tooling/tests
  depend on them.
- `blogger.js` — added a 15s request timeout and a retry wrapper around
  the RSS network fetch only. Extraction/parsing logic is untouched.

### Removed
- `src/code scheduler.js` — proven byte-for-byte (whitespace-only)
  duplicate of `scheduler.js`.
- `data/database.js` — proven byte-for-byte duplicate of `src/database.js`,
  and the wrong location for code (`data/` now holds only data files).
- `axios` dependency — confirmed unused anywhere in the codebase (all
  HTTP calls use the native `fetch` global).

### Unchanged (verified working baseline — preserved exactly)
- Blogger RSS extraction logic and its image-fallback order
  (`media:content` → `media:thumbnail` → `enclosure` → first `<img>`).
- Caption format and content (`caption.js`).
- Buffer `CreatePostInput` field structure, `shareNow` / `automatic`,
  `metadata.facebook.type: "post"`, image asset shape.
- `PostActionPayload` union handling (`PostActionSuccess` + all error
  branches).

## 1.0.0 — Original local baseline

Verified working: Blogger RSS + feature image extraction, caption
generation, JSON-file duplicate protection, Buffer GraphQL `createPost`
mutation, a real Facebook post created through Buffer, and a working
5-minute Windows local scheduler.

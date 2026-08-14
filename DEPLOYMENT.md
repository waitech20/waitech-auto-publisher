# Deployment guide — GitHub Actions

## Why GitHub Actions

This project is a small, stateless Node.js script that needs to run on a
short interval and make a couple of outbound HTTPS calls. GitHub Actions
was chosen over Cloudflare Workers / Vercel Cron / Render / Railway
because:

- It's free for a public (or a normal-usage private) repository at a
  5-minute schedule.
- It runs plain Node.js exactly as written — no code changes needed to
  fit a different runtime (Workers, for example, do not support the
  Node.js `fs` module that `database.js` relies on).
- Secrets management (GitHub Secrets) is built in.
- The existing local `data/published.json` file-based database can keep
  working almost unchanged — see "Database strategy" below — instead of
  requiring a new hosted database service.

## Database strategy

GitHub Actions runners are ephemeral (a fresh VM every run), so a database
file written during a run would normally be lost. Instead of introducing
Supabase/Postgres or another external service, the workflow uses the
**commit-back pattern**:

1. The runner checks out the repository (including the current
   `data/published.json`).
2. `src/index.js` runs normally, reading/writing that file exactly as it
   already does locally.
3. If the file changed (a real post was published), the workflow commits
   and pushes it back to the repository using the built-in
   `GITHUB_TOKEN`.

This keeps `database.js` completely unchanged in its storage mechanism,
avoids adding new infrastructure or credentials, and gives you a
version-controlled audit trail of every publish in the git history.

**Overlap protection:** the workflow sets `concurrency: group:
waitech-auto-publisher`, so if a run is still in progress when the next
5-minute trigger fires, the new run queues instead of starting a second
runner against the same repository state.

## Setup steps

1. **Push this project to a GitHub repository** (if not already there).

2. **Add repository secrets.**
   Go to your repo → **Settings → Secrets and variables → Actions →
   New repository secret**, and add:

   | Secret name | Value |
   |---|---|
   | `BUFFER_ACCESS_TOKEN` | Your Buffer API token |
   | `BUFFER_CHANNEL_ID` | *(optional)* your Buffer channel ID — omit to use the default |
   | `BLOGGER_RSS` | *(optional)* your Blogger RSS URL — omit to use the default |

   Never put these values directly in the workflow file or any committed
   file.

3. **Confirm the workflow file is present** at
   `.github/workflows/auto-publisher.yml` (already included in this
   project).

4. **Enable Actions** for the repository if prompted (Settings → Actions →
   General → Allow all actions).

5. **First run — dry run recommended.**
   Go to the **Actions** tab → **WaiTech Auto Publisher** → **Run
   workflow** → set `dry_run` to `true` → **Run workflow**. Check the logs
   to confirm the pipeline reads Blogger correctly and would build a valid
   Buffer request, without sending anything.

6. **Go live.**
   Once you're satisfied, either wait for the next scheduled run (every 5
   minutes) or trigger it manually with `dry_run` left as `false`.

## Verifying it's working

- **Actions tab** → each run's logs show the same console output you saw
  locally (`Reading Blogger...`, `NEW POST DETECTED.` /
  `POST ALREADY PUBLISHED.`, etc.).
- **Commit history** → after a real publish, you'll see a commit like
  `chore: update publication database [skip ci]` updating
  `data/published.json`.
- **Buffer/Facebook** → the new post appears on the connected Facebook
  Page.

## Changing the schedule

Edit the `cron` expression in `.github/workflows/auto-publisher.yml`:

```yaml
on:
  schedule:
    - cron: "*/5 * * * *"   # every 5 minutes
```

GitHub Actions' minimum supported granularity is 1 minute, but scheduled
runs are best-effort and may be delayed during platform-wide high load —
this is a GitHub-side limitation, not something this project controls.

## Rotating the Buffer token

If the token is ever exposed (logs, screenshots, chat history, etc.):

1. Go to Buffer's developer/API settings and revoke the old token.
2. Generate a new token.
3. Update the `BUFFER_ACCESS_TOKEN` repository secret with the new value.

No code change is required — the token is never read from anywhere except
the environment variable.

## Turning it off

- **Temporarily:** disable the workflow from the Actions tab (**...** →
  **Disable workflow**).
- **Permanently:** delete `.github/workflows/auto-publisher.yml`, or
  delete the repository.

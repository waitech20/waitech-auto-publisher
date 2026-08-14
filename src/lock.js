const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOCK_FILE = path.join(DATA_DIR, "publisher.lock");
const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Acquire the run lock. Returns true if the lock was acquired (safe to
 * proceed), false if another run currently holds it.
 *
 * Note: this protects a single machine/process (e.g. the local
 * scheduler.js running continuously). It does NOT by itself protect
 * against two separate cloud runner VMs racing each other — that is
 * handled at the platform level via the GitHub Actions `concurrency:`
 * setting in the workflow file. Both layers together give full
 * protection across local and cloud execution.
 */
function acquireLock() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(LOCK_FILE)) {
      const stat = fs.statSync(LOCK_FILE);
      const age = Date.now() - stat.mtimeMs;

      if (age < STALE_LOCK_MS) {
        return false;
      }

      console.log(
        `⚠️ Stale lock detected (${Math.round(age / 1000)}s old). Overriding.`
      );
    }

    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      "utf8"
    );

    return true;
  } catch (error) {
    console.log("⚠️ Lock acquisition failed, proceeding without lock:", error.message);
    return true; // fail open — a lock error must never permanently block publishing
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error) {
    console.log("⚠️ Lock release failed (non-fatal):", error.message);
  }
}

module.exports = { acquireLock, releaseLock };

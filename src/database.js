const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATABASE_FILE = path.join(DATA_DIR, "published.json");

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify({ published: [] }, null, 2),
      "utf8"
    );
  }
}

function readDatabase() {
  ensureDatabase();

  try {
    const content = fs.readFileSync(DATABASE_FILE, "utf8");

    const data = JSON.parse(content);

    if (!Array.isArray(data.published)) {
      data.published = [];
    }

    return data;
  } catch (error) {
    console.log("⚠️ Database file invalid. Creating a new one.");

    const freshDatabase = {
      published: []
    };

    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(freshDatabase, null, 2),
      "utf8"
    );

    return freshDatabase;
  }
}

function entryId(entry) {
  // Supports legacy entries (plain string id) and new entries
  // (record object with an "id" field).
  return typeof entry === "string" ? entry : entry && entry.id;
}

function findRecord(id) {
  const database = readDatabase();

  return database.published.find((entry) => entryId(entry) === id) || null;
}

function isPublished(id) {
  if (!id) return false;

  return findRecord(id) !== null;
}

function markAsPublished(id, metadata) {
  if (!id) return;

  const database = readDatabase();

  const existingIndex = database.published.findIndex(
    (entry) => entryId(entry) === id
  );

  const record = metadata ? { id, ...metadata } : id;

  if (existingIndex === -1) {
    database.published.push(record);
  } else {
    // Update in place — used when an intentional republish refreshes
    // sourcePublishedAt / bufferPostId / publishedAt for an id that was
    // already published before.
    database.published[existingIndex] = record;
  }

  fs.writeFileSync(
    DATABASE_FILE,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

function getPublishedPosts() {
  const database = readDatabase();

  return database.published;
}

/**
 * Publication identity / republish strategy.
 *
 * - No record for this post id yet            -> PUBLISH ("new-post")
 * - Record exists but is a legacy plain string
 *   (no stored source timestamp)               -> SKIP ("already-published")
 *   We have no reliable prior timestamp to compare against for old data,
 *   so we preserve the original duplicate-protection behavior exactly.
 * - Record exists with a stored sourcePublishedAt,
 *   and Blogger's own pubDate for this post is
 *   unchanged since we last published it        -> SKIP ("already-published")
 *   This is what makes routine 5-minute polling safe: pubDate does not
 *   change just because the scheduler re-checks the feed.
 * - Record exists with a stored sourcePublishedAt,
 *   and Blogger's own pubDate for this post HAS
 *   changed since we last published it           -> PUBLISH ("republish-detected")
 *   This only happens when the post is intentionally republished/updated
 *   on Blogger's side (Blogger bumping the publish date is the explicit
 *   republish signal), never from ordinary polling.
 */
function getPublicationDecision(id, sourcePublishedAt) {
  if (!id) {
    return { action: "SKIP", reason: "missing-id" };
  }

  const record = findRecord(id);

  if (!record) {
    return { action: "PUBLISH", reason: "new-post" };
  }

  if (typeof record === "string" || !record.sourcePublishedAt) {
    return { action: "SKIP", reason: "already-published", record };
  }

  if (record.sourcePublishedAt !== sourcePublishedAt) {
    return { action: "PUBLISH", reason: "republish-detected", record };
  }

  return { action: "SKIP", reason: "already-published", record };
}

module.exports = {
  ensureDatabase,
  readDatabase,
  isPublished,
  markAsPublished,
  getPublishedPosts,
  getPublicationDecision
};
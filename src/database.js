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
  // Supports legacy entries (plain string id) and record objects
  // (both the old single-channel shape and the new per-channel shape).
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

/**
 * Normalizes any stored record shape into a { [service]: { success, ... } }
 * map, without mutating the stored data:
 *
 * - legacy plain string id (oldest data)      -> null (no per-channel info)
 * - old single-channel shape (bufferPostId at
 *   the top level, from before multi-channel
 *   support existed)                          -> { facebook: { success: true, ... } }
 * - new shape (an explicit "channels" object) -> used as-is
 */
function normalizeChannels(record) {
  if (!record || typeof record === "string") {
    return null;
  }

  if (record.channels) {
    return record.channels;
  }

  if (record.bufferPostId) {
    return {
      facebook: {
        success: true,
        postId: record.bufferPostId,
        publishedAt: record.publishedAt
      }
    };
  }

  return {};
}

function getPublishedPosts() {
  const database = readDatabase();

  return database.published;
}

/**
 * Publication / per-channel retry decision.
 *
 * - No record for this post id yet             -> PUBLISH all channels ("new-post")
 * - Record is a legacy plain string             -> SKIP entirely ("already-published")
 *   (no per-channel info exists for very old data — preserve original
 *   behavior exactly rather than guessing)
 * - Record exists, Blogger's pubDate CHANGED
 *   since we last saw it                        -> PUBLISH all channels again
 *   ("republish-detected" — this is the explicit, intentional signal)
 * - Record exists, pubDate UNCHANGED             -> PUBLISH only the channels
 *   that have not yet succeeded ("partial-retry"); if every channel has
 *   already succeeded, SKIP entirely ("already-published")
 *
 * This is what prevents a channel that already succeeded (e.g. Instagram)
 * from being re-attempted just because a different channel (e.g. Pinterest)
 * failed and needs a retry on the next cycle.
 */
function getPublicationDecision(id, sourcePublishedAt, channelServices) {
  if (!id) {
    return { action: "SKIP", reason: "missing-id", channelsToAttempt: [] };
  }

  const services = channelServices || [];
  const record = findRecord(id);

  if (!record) {
    return { action: "PUBLISH", reason: "new-post", channelsToAttempt: services.slice() };
  }

  if (typeof record === "string") {
    return { action: "SKIP", reason: "already-published", channelsToAttempt: [] };
  }

  const isRepublish =
    record.sourcePublishedAt && record.sourcePublishedAt !== sourcePublishedAt;

  if (isRepublish) {
    return {
      action: "PUBLISH",
      reason: "republish-detected",
      channelsToAttempt: services.slice(),
      record
    };
  }

  const channels = normalizeChannels(record) || {};

  const channelsToAttempt = services.filter((service) => {
    const status = channels[service];
    return !status || !status.success;
  });

  if (channelsToAttempt.length === 0) {
    return { action: "SKIP", reason: "already-published", record };
  }

  return {
    action: "PUBLISH",
    reason: "partial-retry",
    channelsToAttempt,
    record
  };
}

/**
 * Records the outcome of attempting ONE channel for a post. Safe to call
 * once per channel, immediately after each attempt — merges with any
 * previously recorded channel results instead of overwriting them, so a
 * channel that already succeeded is never forgotten just because a
 * different channel was retried afterward.
 */
function recordChannelResult(id, meta, service, result) {
  if (!id || !service) return;

  const database = readDatabase();

  const existingIndex = database.published.findIndex(
    (entry) => entryId(entry) === id
  );

  const existing = existingIndex === -1 ? null : database.published[existingIndex];

  const record = {
    id,
    title: (meta && meta.title) || (existing && existing.title) || "",
    url: (meta && meta.url) || (existing && existing.url) || "",
    sourcePublishedAt: (meta && meta.sourcePublishedAt) || (existing && existing.sourcePublishedAt) || "",
    channels: normalizeChannels(existing) || {}
  };

  record.channels[service] = result.success
    ? {
        success: true,
        postId: result.postId || null,
        publishedAt: new Date().toISOString()
      }
    : {
        success: false,
        lastError:
          result.message ||
          (result.errors ? JSON.stringify(result.errors) : "unknown error"),
        lastAttemptAt: new Date().toISOString()
      };

  if (existingIndex === -1) {
    database.published.push(record);
  } else {
    database.published[existingIndex] = record;
  }

  fs.writeFileSync(
    DATABASE_FILE,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

module.exports = {
  ensureDatabase,
  readDatabase,
  isPublished,
  getPublishedPosts,
  getPublicationDecision,
  recordChannelResult
};
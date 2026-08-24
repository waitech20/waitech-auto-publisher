require("dotenv").config();

const { getLatestPost } = require("./blogger");
const {
  ensureDatabase,
  getPublicationDecision,
  recordChannelResult
} = require("./database");
const { createBufferPost } = require("./bufferClient");
const { acquireLock, releaseLock } = require("./lock");
const { CHANNELS } = require("./channels");

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;

// Set DRY_RUN=true to run the full pipeline without sending anything to
// Buffer and without writing to the publication database. Defaults to
// false so production behavior is unchanged from the verified baseline.
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === "true";

async function publishToChannel(channel, post) {
  console.log("");
  console.log(`--- ${channel.service.toUpperCase()} ---`);

  let text;

  try {
    text = await channel.buildText(post);
  } catch (error) {
    console.log(`Caption generator failed for ${channel.service}.`);
    console.log(error.message);
    return { service: channel.service, success: false, message: error.message };
  }

  const metadata = channel.buildMetadata(post);

  const result = await createBufferPost({
    token: TOKEN,
    channelId: channel.channelId,
    text,
    imageUrl: post.image,
    metadata,
    dryRun: DRY_RUN
  });

  if (!result.success) {
    console.log(`${channel.service.toUpperCase()} PUBLISH FAILED`);

    if (result.errors) {
      console.log(JSON.stringify(result.errors, null, 2));
    } else {
      console.log(result.message);
    }

    return { service: channel.service, success: false, ...result };
  }

  console.log(
    DRY_RUN
      ? "DRY_RUN COMPLETE (nothing published)"
      : `${channel.service.toUpperCase()} POST CREATED`
  );
  console.log("Post ID:", result.postId);
  console.log("Status:", result.status);

  return { service: channel.service, success: true, ...result };
}

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech AUTO PUBLISHER");
  console.log("=================================");
  console.log("");

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN mode active — nothing will be sent to Buffer or saved.");
    console.log("");
  }

  if (!TOKEN) {
    console.log("ERROR: BUFFER_ACCESS_TOKEN missing.");
    return;
  }

  ensureDatabase();

  if (!acquireLock()) {
    console.log("Another publisher run is already in progress. Skipping this cycle.");
    return;
  }

  try {
    console.log("Reading Blogger...");

    const post = await getLatestPost();

    if (!post) {
      console.log("No Blogger post found.");
      return;
    }

    if (!post.url) {
      console.log("");
      console.log("❌ Post is missing a URL. Skipping — cannot safely publish or deduplicate.");
      return;
    }

    console.log("");
    console.log("Checking publication history...");

    const channelServices = CHANNELS.map((c) => c.service);
    const decision = getPublicationDecision(post.id, post.published, channelServices);

    if (decision.action === "SKIP") {
      console.log("POST ALREADY PUBLISHED.");
      console.log("Nothing sent to Buffer.");
      return;
    }

    if (decision.reason === "republish-detected") {
      console.log("REPUBLISH DETECTED (Blogger publish date changed).");
    } else if (decision.reason === "partial-retry") {
      console.log("PARTIAL RETRY — some channels already succeeded, retrying the rest only.");
    } else {
      console.log("NEW POST DETECTED.");
    }

    const channelsToAttempt = CHANNELS.filter((c) =>
      decision.channelsToAttempt.includes(c.service)
    );

    console.log("");
    console.log("Feature Image:", post.image ? "YES" : "NO");
    console.log(
      "Attempting",
      channelsToAttempt.length,
      "of",
      CHANNELS.length,
      "channel(s):",
      channelsToAttempt.map((c) => c.service).join(", ")
    );

    const results = [];

    for (const channel of channelsToAttempt) {
      const result = await publishToChannel(channel, post);
      results.push(result);

      // Record each channel's outcome immediately, one at a time, so a
      // channel that just succeeded is never lost even if a later
      // channel in this same run fails or the process is interrupted.
      if (!DRY_RUN) {
        recordChannelResult(
          post.id,
          {
            title: post.title,
            url: post.url,
            sourcePublishedAt: post.published
          },
          channel.service,
          result
        );
      }
    }

    console.log("");
    console.log("=================================");
    console.log("SUMMARY");
    console.log("=================================");
    results.forEach((r) => {
      console.log(`${r.service}: ${r.success ? "OK" : "FAILED"}`);
    });

    if (!DRY_RUN) {
      console.log("");
      console.log("Publication record updated.");
    }

    console.log("AUTO PUBLISHER COMPLETED.");
  } catch (error) {
    console.log("");
    console.log("FATAL ERROR:");
    console.log(error.message);
  } finally {
    releaseLock();
  }
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR (unhandled):");
  console.log(error.message);
});
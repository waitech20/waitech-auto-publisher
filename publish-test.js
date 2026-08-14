require("dotenv").config();

const { getLatestPost } = require("./blogger");
const { createCaption } = require("./caption");
const { createBufferPost } = require("./bufferClient");

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const CHANNEL_ID =
  process.env.BUFFER_CHANNEL_ID ||
  "6a7de7afb2d9d577436e52b5";

// SAFETY: this script CAN create a real Facebook post, but only when
// BOTH of the following are true:
//   1. the environment variable LIVE=true is set
//   2. the --confirm flag is passed on the command line
// Any other combination runs in DRY_RUN mode (nothing is sent to Buffer).
//
//   Dry run (default, safe):  node src/publish-test.js
//   Real post (explicit):     LIVE=true node src/publish-test.js --confirm
const LIVE_REQUESTED = String(process.env.LIVE).toLowerCase() === "true";
const CONFIRMED = process.argv.includes("--confirm");
const DRY_RUN = !(LIVE_REQUESTED && CONFIRMED);

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech BUFFER INTEGRATION TEST");
  console.log("=================================");
  console.log("");

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN mode — no real Facebook post will be created.");
    console.log("   For a real test run: LIVE=true node src/publish-test.js --confirm");
  } else {
    console.log("⚠️  LIVE MODE — this WILL create a real Facebook post.");
  }

  console.log("");

  if (!TOKEN) {
    console.log("❌ BUFFER_ACCESS_TOKEN missing.");
    return;
  }

  console.log("🔄 Reading latest Blogger post...");

  const post = await getLatestPost();

  if (!post) {
    console.log("❌ No Blogger post found.");
    return;
  }

  const caption = createCaption(post);

  console.log("");
  console.log("📱 FACEBOOK CAPTION");
  console.log("---------------------------------");
  console.log(caption);
  console.log("---------------------------------");

  if (!post.image) {
    console.log("");
    console.log("⚠️  No feature image found for this post.");
  }

  console.log("");
  console.log(
    "🔄 Sending to Buffer" + (DRY_RUN ? " (DRY_RUN — not actually sent)" : "") + "..."
  );

  const result = await createBufferPost({
    token: TOKEN,
    channelId: CHANNEL_ID,
    text: caption,
    imageUrl: post.image,
    dryRun: DRY_RUN
  });

  console.log("");

  if (!result.success) {
    console.log("❌ BUFFER PUBLISH FAILED");
    console.log(
      result.errors ? JSON.stringify(result.errors, null, 2) : result.message
    );
    return;
  }

  console.log("=================================");
  console.log(DRY_RUN ? "✅ DRY_RUN COMPLETE" : "🎉 FACEBOOK POST CREATED");
  console.log("=================================");
  console.log("Post ID:", result.postId || "(dry-run — not created)");
  console.log("Status:", result.status);
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR:");
  console.log(error.message);
});

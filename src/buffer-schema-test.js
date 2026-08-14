require("dotenv").config();

const { getLatestPost } = require("./blogger");
const { createCaption } = require("./caption");
const { buildCreatePostInput } = require("./bufferClient");

const CHANNEL_ID =
  process.env.BUFFER_CHANNEL_ID ||
  "6a7de7afb2d9d577436e52b5";

// SAFETY: this script NEVER sends a request to Buffer, unconditionally.
// It only validates that Blogger extraction + caption generation + the
// Buffer CreatePostInput shape all wire together correctly. For a real
// (optional, explicitly-confirmed) live post, use publish-test.js.

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech BUFFER SCHEMA TEST (always DRY_RUN)");
  console.log("=================================");
  console.log("");

  const post = await getLatestPost();

  if (!post) {
    console.log("❌ No Blogger post found.");
    return;
  }

  const caption = createCaption(post);

  const input = buildCreatePostInput({
    channelId: CHANNEL_ID,
    text: caption,
    imageUrl: post.image
  });

  console.log("");
  console.log("📱 FACEBOOK CAPTION");
  console.log("---------------------------------");
  console.log(caption);
  console.log("---------------------------------");

  console.log("");
  console.log("📦 CreatePostInput that WOULD be sent:");
  console.log("---------------------------------");
  console.log(JSON.stringify(input, null, 2));
  console.log("---------------------------------");

  console.log("");
  console.log("🟢 Schema shape validated. Nothing was sent to Buffer.");
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR:");
  console.log(error.message);
});

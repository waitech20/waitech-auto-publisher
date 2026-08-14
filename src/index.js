require("dotenv").config();

const { getLatestPost } = require("./blogger");
const { createCaption } = require("./caption");
const {
  ensureDatabase,
  getPublicationDecision,
  markAsPublished
} = require("./database");
const { createBufferPost } = require("./bufferClient");
const { acquireLock, releaseLock } = require("./lock");

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const CHANNEL_ID =
  process.env.BUFFER_CHANNEL_ID ||
  "6a7de7afb2d9d577436e52b5";

// Set DRY_RUN=true to run the full pipeline without sending anything to
// Buffer and without writing to the publication database. Defaults to
// false so production behavior is unchanged from the verified baseline.
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === "true";

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

    const decision = getPublicationDecision(post.id, post.published);

    if (decision.action === "SKIP") {
      console.log("POST ALREADY PUBLISHED.");
      console.log("Nothing sent to Buffer.");
      return;
    }

    if (decision.reason === "republish-detected") {
      console.log("REPUBLISH DETECTED (Blogger publish date changed).");
    } else {
      console.log("NEW POST DETECTED.");
    }

    let caption;

    try {
      caption = await createCaption(post);

      if (typeof caption !== "string") {
        caption =
          "🔥 " +
          post.title +
          "\n\n" +
          post.excerpt +
          "\n\n" +
          "Read the full article:\n" +
          post.url +
          "\n\n" +
          "#WaiTech #Technology #TechNews #DigitalTips";
      }
    } catch (error) {
      console.log("Caption generator failed.");
      console.log(error.message);
      return;
    }

    console.log("");
    console.log("Sending to Buffer...");

    const result = await createBufferPost({
      token: TOKEN,
      channelId: CHANNEL_ID,
      text: caption,
      imageUrl: post.image,
      dryRun: DRY_RUN
    });

    if (!result.success) {
      console.log("");
      console.log("BUFFER PUBLISH FAILED");

      if (result.errors) {
        console.log(
          JSON.stringify(result.errors, null, 2)
        );
      } else {
        console.log(result.message);
      }

      return;
    }

    console.log("");
    console.log("=================================");
    console.log(DRY_RUN ? "DRY_RUN COMPLETE (nothing published)" : "FACEBOOK POST CREATED");
    console.log("=================================");
    console.log("Post ID:", result.postId);
    console.log("Status:", result.status);
    console.log("Facebook Type: post");
    console.log(
      "Feature Image:",
      post.image ? "YES" : "NO"
    );

    if (!DRY_RUN) {
      markAsPublished(post.id, {
        title: post.title,
        url: post.url,
        bufferPostId: result.postId,
        publishedAt: new Date().toISOString(),
        sourcePublishedAt: post.published
      });

      console.log("");
      console.log("Publication saved.");
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

require("dotenv").config();

const Parser = require("rss-parser");

const parser = new Parser({ timeout: 15000 });

const BLOGGER_RSS =
  process.env.BLOGGER_RSS ||
  "https://waitechsolution.blogspot.com/feeds/posts/default?alt=rss";

// SAFETY: this script is 100% read-only. It only reads the public
// Blogger RSS feed — it never touches Buffer, Facebook, Instagram, or
// Pinterest. Safe to run at any time.

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech BLOGGER FEED — ALL POSTS (read-only)");
  console.log("=================================");
  console.log("");

  const feed = await parser.parseURL(BLOGGER_RSS);

  if (!feed.items || feed.items.length === 0) {
    console.log("No posts found.");
    return;
  }

  feed.items.forEach((item, index) => {
    console.log(`[${index}] ${item.title}`);
    console.log(`    ID:        ${item.guid || item.id || item.link}`);
    console.log(`    URL:       ${item.link}`);
    console.log(`    Published: ${item.pubDate || item.isoDate}`);
    console.log("");
  });

  console.log(`🟢 Done. ${feed.items.length} post(s) listed.`);
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR:");
  console.log(error.message);
});

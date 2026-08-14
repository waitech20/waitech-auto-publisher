const Parser = require("rss-parser");
const { withRetry } = require("./retry");

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

const BLOGGER_RSS =
  process.env.BLOGGER_RSS ||
  "https://waitechsolution.blogspot.com/feeds/posts/default?alt=rss";

function extractImage(post) {
  if (post.mediaContent) {
    const media = Array.isArray(post.mediaContent)
      ? post.mediaContent[0]
      : post.mediaContent;

    if (media && media.$ && media.$.url) {
      return media.$.url;
    }

    if (media && media.url) {
      return media.url;
    }
  }

  if (post.mediaThumbnail) {
    const media = Array.isArray(post.mediaThumbnail)
      ? post.mediaThumbnail[0]
      : post.mediaThumbnail;

    if (media && media.$ && media.$.url) {
      return media.$.url;
    }

    if (media && media.url) {
      return media.url;
    }
  }

  if (post.enclosure && post.enclosure.url) {
    return post.enclosure.url;
  }

  const html =
    post.contentEncoded ||
    post["content:encoded"] ||
    post.content ||
    "";

  const imageMatch = html.match(
    /<img[^>]+src=["']([^"']+)["']/i
  );

  if (imageMatch && imageMatch[1]) {
    return imageMatch[1];
  }

  return null;
}

function cleanText(text) {
  if (!text) return "";

  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createExcerpt(post) {
  const text = cleanText(
    post.contentSnippet ||
    post.content ||
    post.contentEncoded ||
    ""
  );

  if (text.length <= 220) {
    return text;
  }

  return text.substring(0, 220).trim() + "...";
}

async function getLatestPost() {
  console.log("=================================");
  console.log("WaiTech Blogger RSS");
  console.log("=================================");
  console.log("");

  try {
    console.log("🔄 Reading Blogger RSS...");
    console.log("");

    const feed = await withRetry(
      () => parser.parseURL(BLOGGER_RSS),
      { retries: 2, baseDelayMs: 1500 }
    );

    if (!feed.items || feed.items.length === 0) {
      console.log("⚠️ Hakuna posts zilizopatikana.");
      return null;
    }

    const post = feed.items[0];

    const title = post.title || "Untitled";
    const url = post.link || "";
    const image = extractImage(post);
    const excerpt = createExcerpt(post);
    const published = post.pubDate || post.isoDate || "";
    const id = post.guid || post.id || url;

    console.log("✅ NEWEST BLOGGER POST");
    console.log("---------------------------------");
    console.log("");
    console.log("📝 TITLE:");
    console.log(title);
    console.log("");
    console.log("🔗 URL:");
    console.log(url);
    console.log("");
    console.log("🖼️ FEATURE IMAGE:");

    if (image) {
      console.log(image);
    } else {
      console.log("❌ No feature image found.");
    }

    console.log("");
    console.log("📄 EXCERPT:");
    console.log(excerpt);
    console.log("");
    console.log("📅 PUBLISHED:");
    console.log(published);
    console.log("");
    console.log("---------------------------------");

    if (image) {
      console.log("🟢 Feature image extraction successful.");
    } else {
      console.log("⚠️ Feature image was not found.");
    }

    console.log("🟢 Blogger RSS extraction successful.");
    console.log("🟢 Post object ready for automation.");
    console.log("");

    return {
      id,
      title,
      url,
      image,
      excerpt,
      published
    };

  } catch (error) {
    console.log("");
    console.log("❌ Blogger RSS Error:");
    console.log(error.message);
    return null;
  }
}

module.exports = {
  getLatestPost,
  extractImage,
  cleanText,
  createExcerpt
};
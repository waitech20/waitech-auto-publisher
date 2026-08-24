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

/**
 * Extract feature image using the original verified fallback order:
 *
 * 1. media:content
 * 2. media:thumbnail
 * 3. enclosure
 * 4. first <img> inside article HTML
 */
/**
 * Blogger/Google-hosted images encode a size directly in the URL path,
 * e.g. ".../s72-c/image.jpg" is a 72x72 cropped thumbnail — this is
 * where the "blurry" feature image comes from when media:thumbnail
 * (rather than a full-size media:content) is what the feed provided.
 * Rewriting the size segment to a much larger value fixes this without
 * needing a different image entirely.
 */
function upgradeImageQuality(url) {
  if (!url) return url;

  if (/googleusercontent\.com/i.test(url) || /bp\.blogspot\.com/i.test(url)) {
    return url.replace(/\/s\d+(-c)?\//, "/s1600/");
  }

  return url;
}

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

/**
 * Convert HTML / encoded content into clean readable text.
 */
function cleanText(text) {
  if (!text) return "";

  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create a professional Facebook-ready article description.
 *
 * Target:
 * - Minimum useful length: ~300 characters when source content allows
 * - Target length: ~450 characters
 * - Maximum: 500 characters
 * - Never intentionally cuts a word in half
 */
function createExcerpt(post) {
  // IMPORTANT: prioritize the raw HTML fields (contentEncoded/content).
  // rss-parser's own "contentSnippet" is pre-stripped of HTML tags —
  // including the <style> and <script> wrapper tags — which means by
  // the time it reaches us, any CSS/JS text they contained has already
  // leaked through as if it were plain article text, with no tags left
  // for our own cleanText() stripping to catch. Running cleanText() on
  // the raw HTML first lets it properly remove whole <style>/<script>
  // blocks (tag + content) before anything is exposed as an excerpt.
  const text = cleanText(
    post.contentEncoded ||
    post.content ||
    post.contentSnippet ||
    ""
  );

  if (!text) {
    return "";
  }

  // If the article is already short, return the complete text.
  if (text.length <= 500) {
    return text;
  }

  // Target a professional medium-length Facebook description.
  const targetLength = 450;

  let excerpt = text.substring(0, targetLength);

  // Avoid cutting a word in half.
  const lastSpace = excerpt.lastIndexOf(" ");

  if (lastSpace > 300) {
    excerpt = excerpt.substring(0, lastSpace);
  }

  excerpt = excerpt.trim();

  // Add a clean ellipsis when the original article continues.
  return `${excerpt}...`;
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
      {
        retries: 2,
        baseDelayMs: 1500
      }
    );

    if (!feed.items || feed.items.length === 0) {
      console.log("⚠️ Hakuna posts zilizopatikana.");
      return null;
    }

    const post = feed.items[0];

    const title = post.title || "Untitled";
    const url = post.link || "";
    const image = upgradeImageQuality(extractImage(post));
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
    console.log("📏 EXCERPT LENGTH:");
    console.log(`${excerpt.length} characters`);

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
  upgradeImageQuality,
  cleanText,
  createExcerpt
};
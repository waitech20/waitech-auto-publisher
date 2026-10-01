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

// Target width/height for Google-hosted (Blogger) images.
// 1600px is sharp on Facebook and stays well under any upload size limit.
const TARGET_SIZE = 1600;

// <img> tags that declare a width/height below this are treated as icons,
// emoji or tracking pixels and are never used as the feature image.
const MIN_CONTENT_IMAGE_PX = 200;

/* ------------------------------------------------------------------ */
/* Image helpers                                                       */
/* ------------------------------------------------------------------ */

function isGoogleHosted(url) {
  return /(?:googleusercontent\.com|ggpht\.com|bp\.blogspot\.com)/i.test(url);
}

function decodeUrlEntities(url) {
  return String(url).replace(/&amp;/gi, "&").trim();
}

/**
 * Decides what to do with a Blogger size token such as
 * "s72-c", "s320", "w640-h480-c", "s1600-rw".
 *   - s0 (original size) or anything already >= TARGET_SIZE -> kept
 *   - everything smaller -> "s1600" (no crop flag, no webp flag)
 */
function resolveSizeToken(token) {
  if (/^s0(?:-|$)/i.test(token)) return token;

  const nums = (token.match(/\d+/g) || []).map(Number);
  const biggest = nums.length ? Math.max(...nums) : 0;

  if (biggest >= TARGET_SIZE) return token;

  return `s${TARGET_SIZE}`;
}

/**
 * Blogger/Google-hosted images encode a size in the URL. Two formats exist:
 *
 *   OLD  https://blogger.googleusercontent.com/img/b/.../s72-c/photo.jpg
 *        https://1.bp.blogspot.com/-xxxx/s320/photo.jpg
 *        https://.../w640-h480-c/photo.jpg
 *
 *   NEW  https://blogger.googleusercontent.com/img/a/AVvXs...=s72-c
 *        https://lh3.googleusercontent.com/...=w400-h300-c-rw
 *
 * The previous version only handled the OLD "/s72-c/" form, so images
 * uploaded with the NEW "=s72-c" form stayed as 72px thumbnails.
 * Both forms are handled here.
 */
function upgradeImageQuality(url) {
  if (!url) return url;

  let out = decodeUrlEntities(url);

  if (!isGoogleHosted(out)) return out;

  out = out.replace(/^http:\/\//i, "https://");

  // NEW style: ...=s72-c  /  ...=w400-h300-c-rw
  out = out.replace(
    /=([swh]\d+(?:-[a-z0-9]+)*)(?=$|[?#])/i,
    (_, token) => "=" + resolveSizeToken(token)
  );

  // OLD style: .../s72-c/photo.jpg (size segment right before the filename)
  out = out.replace(
    /\/([swh]\d+(?:-[a-z0-9]+)*)\/(?=[^\/?#]+(?:[?#].*)?$)/i,
    (_, token) => "/" + resolveSizeToken(token) + "/"
  );

  return out;
}

function mediaUrl(field) {
  if (!field) return null;

  const media = Array.isArray(field) ? field[0] : field;
  if (!media) return null;

  return (media.$ && media.$.url) || media.url || null;
}

/**
 * Finds images inside the article HTML, in document order.
 *
 * Blogger wraps uploaded photos like this:
 *   <a href="https://.../s1600/photo.jpg"><img src="https://.../s320/photo.jpg"></a>
 * The <a href> points to the full-size original, so when an image is wrapped
 * in such a link, the link target is preferred over the small <img src>.
 */
function findContentImages(html) {
  const results = [];
  if (!html) return results;

  const pattern =
    /(?:<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>\s*)?<img\b([^>]*)>/gi;

  let match;

  while ((match = pattern.exec(html)) !== null) {
    const href = match[1];
    const attrs = match[2] || "";

    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const src = srcMatch[1];
    if (/^data:/i.test(src)) continue;

    const w = attrs.match(/\bwidth=["']?(\d+)/i);
    const h = attrs.match(/\bheight=["']?(\d+)/i);

    if (
      (w && Number(w[1]) < MIN_CONTENT_IMAGE_PX) ||
      (h && Number(h[1]) < MIN_CONTENT_IMAGE_PX)
    ) {
      continue;
    }

    const hrefLooksLikeImage =
      href &&
      (/\.(?:jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(href) ||
        isGoogleHosted(href));

    results.push(hrefLooksLikeImage ? href : src);
  }

  return results;
}

/**
 * All possible feature images for a post, best first:
 *
 * 1. media:content
 * 2. images inside the article (full-size link target preferred)
 * 3. enclosure
 * 4. media:thumbnail  (last resort: usually a 72px crop)
 *
 * NOTE: the old order tried media:thumbnail second. It is now last because
 * it is the lowest-quality source. Blogger's thumbnail is normally the same
 * photo as the first image in the article, so the chosen picture is the same,
 * just at a much better resolution.
 */
function extractImageCandidates(post) {
  const html =
    post.contentEncoded ||
    post["content:encoded"] ||
    post.content ||
    "";

  const list = [
    mediaUrl(post.mediaContent),
    ...findContentImages(html),
    post.enclosure && post.enclosure.url,
    mediaUrl(post.mediaThumbnail)
  ]
    .filter(Boolean)
    .map(decodeUrlEntities);

  return [...new Set(list)];
}

/**
 * Kept for backward compatibility: returns the single best raw candidate
 * (not upgraded). getLatestPost() uses pickBestImage() instead.
 */
function extractImage(post) {
  return extractImageCandidates(post)[0] || null;
}

/**
 * Cheap check that a URL really serves an image (reads 1 byte, not the file).
 * Returns true if fetch is unavailable, so it can never block publishing.
 */
async function verifyImageUrl(url, timeoutMs = 8000) {
  if (typeof fetch !== "function") return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: controller.signal
    });

    const type = res.headers.get("content-type") || "";
    const ok =
      (res.status === 200 || res.status === 206) && /^image\//i.test(type);

    try {
      if (res.body && typeof res.body.cancel === "function") {
        await res.body.cancel();
      }
    } catch (_) {
      // ignore
    }

    return ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Picks the best working feature image:
 * for each candidate (best first) try the HD-upgraded URL, then the
 * original URL, and return the first one that really serves an image.
 * If nothing can be verified (network issue), falls back to the upgraded
 * first candidate, which is what the old version always did.
 */
async function pickBestImage(post) {
  const candidates = extractImageCandidates(post);

  if (candidates.length === 0) return null;

  for (const original of candidates) {
    const upgraded = upgradeImageQuality(original);
    const attempts = upgraded === original ? [original] : [upgraded, original];

    for (const url of attempts) {
      if (await verifyImageUrl(url)) return url;
    }
  }

  return upgradeImageQuality(candidates[0]);
}

/* ------------------------------------------------------------------ */
/* Text helpers (unchanged)                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

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
    const image = await pickBestImage(post);
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
  extractImageCandidates,
  pickBestImage,
  verifyImageUrl,
  upgradeImageQuality,
  cleanText,
  createExcerpt
};

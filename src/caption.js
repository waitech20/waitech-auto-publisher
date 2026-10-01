const { translateText } = require("./translate");

function cleanText(text) {
  if (!text) return "";

  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Small helpers for varied, hook-first captions                       */
/* ------------------------------------------------------------------ */

// Deterministic hash: the same post always gets the same caption
// (important for DRY_RUN checks), but different posts look different.
function hashString(str) {
  let h = 0;
  const s = String(str || "");

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }

  return h;
}

function pick(list, seed) {
  return list[seed % list.length];
}

/**
 * Shortens text to about `max` characters, preferring to end on a full
 * sentence, otherwise on a whole word. Never cuts a word in half.
 */
function shorten(text, max) {
  const original = String(text || "").trim();
  if (!original) return "";

  const hadEllipsis = /(\.{3}|…)$/.test(original);
  const base = original.replace(/(\.{3}|…)$/, "").trim();

  if (base.length <= max) {
    return hadEllipsis ? base + "..." : base;
  }

  const slice = base.substring(0, max);

  // Prefer the last complete sentence if it keeps a reasonable amount of text.
  const sentence = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= max * 0.4) {
    return sentence[0].trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.5 ? slice.substring(0, lastSpace) : slice;

  return cut.trim().replace(/[,;:\-–]+$/, "") + "...";
}

const HOOK_EMOJIS = ["🔥", "⚡", "📢", "💡", "🚀"];

const LINK_CTAS = [
  "👉 Read the full article / Soma makala kamili:",
  "🔗 Full story / Habari kamili:",
  "📖 Continue reading / Endelea kusoma:"
];

const ENGAGEMENT_LINES = [
  "💬 What do you think? / Una maoni gani? Tuambie kwenye comments",
  "💬 Share your thoughts below / Toa maoni yako hapa chini"
];

const FB_HASHTAGS = "#WaiTech #Technology #TechNews";

async function getBilingualParts(post) {
  const title = cleanText(post.title || "New Article");
  const excerpt = cleanText(post.excerpt || "");

  const titleSw = await translateText(title, { to: "sw" });
  const excerptSw = excerpt ? await translateText(excerpt, { to: "sw" }) : null;

  return {
    title,
    excerpt,
    titleSw: titleSw || title,
    excerptSw: excerptSw || excerpt
  };
}

/**
 * Facebook caption, written for reach:
 *  - the title is the hook and sits on the first line;
 *  - the excerpt is trimmed to ~230 characters so the key message appears
 *    before Facebook's "See more" cut-off (the old caption was 450 English
 *    characters + the full Swahili copy, so most of it was hidden);
 *  - a short bilingual block is kept when a Swahili version exists;
 *  - one comment-inviting line;
 *  - the emoji / call-to-action vary per post so the page does not look
 *    like a bot posting an identical template every time.
 *
 * Link handling:
 *  - default (linkInBody = true): the link stays in the caption, exactly as
 *    before, so readers can always reach the article.
 *  - linkInBody = false (or env FB_LINK_IN_BODY=false): the caption has no
 *    URL and points to the first comment. Facebook usually gives posts
 *    without links more reach. Only turn this on when the first comment is
 *    actually being posted (see createFirstComment).
 */
async function createCaption(post, options = {}) {
  const url = post.url || "";
  const linkInBody =
    options.linkInBody !== undefined
      ? options.linkInBody
      : process.env.FB_LINK_IN_BODY !== "false";

  const { title, excerpt, titleSw, excerptSw } = await getBilingualParts(post);

  const seed = hashString(url || title);

  let caption = `${pick(HOOK_EMOJIS, seed)} ${title}\n\n`;

  const hook = shorten(excerpt, 230);

  if (hook) {
    caption += `${hook}\n\n`;
  }

  if (titleSw !== title || excerptSw !== excerpt) {
    caption += `———————————\n\n`;
    caption += `${pick(HOOK_EMOJIS, seed + 1)} ${titleSw}\n\n`;

    const hookSw = shorten(excerptSw, 200);

    if (hookSw) {
      caption += `${hookSw}\n\n`;
    }
  }

  caption += `${pick(ENGAGEMENT_LINES, seed)}\n\n`;

  if (linkInBody) {
    if (url) {
      caption += `${pick(LINK_CTAS, seed)}\n${url}\n\n`;
    }
  } else {
    caption += `👇 Link in the first comment / Link iko kwenye comment ya kwanza\n\n`;
  }

  caption += FB_HASHTAGS;

  return caption;
}

/**
 * Text for the first comment when the link is kept out of the post body.
 */
function createFirstComment(post) {
  const url = post.url || "";
  const seed = hashString(url || post.title);

  return `${pick(LINK_CTAS, seed)}\n${url}`;
}

// Instagram: same bilingual content, but links in captions are NOT
// clickable on Instagram, so we point people to the bio instead of
// showing a URL that looks clickable but isn't.
async function createInstagramCaption(post) {
  const { title, excerpt, titleSw, excerptSw } = await getBilingualParts(post);

  let caption = `🔥 ${title}\n\n`;

  if (excerpt) {
    caption += `${excerpt}\n\n`;
  }

  if (titleSw !== title || excerptSw !== excerpt) {
    caption += `———————————\n\n`;
    caption += `🔥 ${titleSw}\n\n`;

    if (excerptSw) {
      caption += `${excerptSw}\n\n`;
    }
  }

  caption += `🔗 Link in bio / Link iko kwenye bio\n\n`;

  caption += `#WaiTech #Technology #TechNews #DigitalTips`;

  return caption;
}

// Pinterest: short, ENGLISH-ONLY description, hard-capped well under
// Pinterest's 500-character limit. The destination link and title are
// sent as separate structured fields (see channels.js), not part of
// this text. (Bilingual text was tried but the combined English+Swahili
// excerpt routinely exceeded 500 characters and Pinterest rejected the
// post outright — a single language, safely truncated, is reliable.)
async function createPinterestDescription(post) {
  const excerpt = cleanText(post.excerpt || "");
  const hashtags = " #WaiTech #Technology";
  const maxDescLength = 500 - hashtags.length - 3 - 10; // extra safety margin

  let description = excerpt;

  if (description.length > maxDescLength) {
    description = description.substring(0, maxDescLength);
    const lastSpace = description.lastIndexOf(" ");

    if (lastSpace > 50) {
      description = description.substring(0, lastSpace);
    }

    description = description.trim() + "...";
  }

  return description + hashtags;
}

module.exports = {
  createCaption,
  createFirstComment,
  createInstagramCaption,
  createPinterestDescription,
  cleanText,
  shorten
};

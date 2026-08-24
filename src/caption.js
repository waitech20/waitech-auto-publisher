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

// Facebook: full bilingual caption with a clickable link (unchanged from
// the original verified version).
async function createCaption(post) {
  const url = post.url || "";
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

  caption += `👉 Read the full article / Soma makala kamili:\n${url}\n\n`;

  caption += `#WaiTech #Technology #TechNews #DigitalTips`;

  return caption;
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
  createInstagramCaption,
  createPinterestDescription,
  cleanText
};
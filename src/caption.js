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

function createCaption(post) {
  const title = cleanText(post.title || "New Article");
  const url = post.url || "";
  const excerpt = cleanText(post.excerpt || "");

  let caption = `🔥 ${title}\n\n`;

  if (excerpt) {
    caption += `${excerpt}\n\n`;
  }

  caption += `👉 Read the full article:\n${url}\n\n`;

  caption += `#WaiTech #Technology #TechNews #DigitalTips`;

  return caption;
}

module.exports = {
  createCaption,
  cleanText
};

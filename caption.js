function cleanText(text) {
  if (!text) return "";

  return text
    .replace(/<[^>]*>/g, " ")
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
  createCaption
};
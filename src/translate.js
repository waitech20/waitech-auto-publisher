const { withRetry } = require("./retry");

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "";

/**
 * Translates text via the free MyMemory API.
 *
 * Returns the translated string, or null if translation is unavailable
 * for any reason (network failure, rate limit, bad response). Callers
 * must treat null as "fall back to English" — translation failure must
 * never block or break the publish pipeline.
 */
async function translateText(text, { from = "en", to = "sw" } = {}) {
  if (!text) return null;

  // MyMemory's free "get" endpoint caps each request at ~500 bytes.
  const chunk = text.slice(0, 490);

  try {
    const params = new URLSearchParams({
      q: chunk,
      langpair: `${from}|${to}`
    });

    if (MYMEMORY_EMAIL) {
      params.set("de", MYMEMORY_EMAIL);
    }

    const fetchTranslation = async () => {
      const response = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(8000)
      });
      return response.json();
    };

    const result = await withRetry(fetchTranslation, {
      retries: 1,
      baseDelayMs: 1000
    });

    if (result.responseStatus !== 200 || !result.responseData || !result.responseData.translatedText) {
      console.log("⚠️ Translation unavailable, continuing in English only.");
      return null;
    }

    return result.responseData.translatedText;
  } catch (error) {
    console.log("⚠️ Translation failed (" + error.message + "), continuing in English only.");
    return null;
  }
}

module.exports = { translateText };

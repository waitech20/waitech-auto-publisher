const TRANSLATE_ENABLED =
  String(process.env.TRANSLATE_ENABLED || "false").toLowerCase() === "true";

const TRANSLATE_URL =
  process.env.TRANSLATE_URL ||
  "https://libretranslate.com/translate";

const TRANSLATE_API_KEY =
  process.env.TRANSLATE_API_KEY || "";

const TRANSLATE_TIMEOUT_MS = 15000;

async function translateText(text) {
  if (!text || !text.trim()) {
    return "";
  }

  if (!TRANSLATE_ENABLED) {
    console.log("🌐 Translation disabled.");
    return text;
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TRANSLATE_TIMEOUT_MS);

  try {
    const body = {
      q: text,
      source: "en",
      target: "sw",
      format: "text"
    };

    if (TRANSLATE_API_KEY) {
      body.api_key = TRANSLATE_API_KEY;
    }

    console.log("🌐 Translating English → Kiswahili...");

    const response = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `Translation API returned HTTP ${response.status}`
      );
    }

    if (
      !data ||
      typeof data.translatedText !== "string" ||
      !data.translatedText.trim()
    ) {
      throw new Error("Translation API returned no translated text.");
    }

    console.log("🟢 Translation successful.");

    return data.translatedText.trim();

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Translation request timed out.");
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}

async function translatePost(post) {
  if (!post) {
    throw new Error("No post supplied for translation.");
  }

  const title = post.title || "";
  const excerpt = post.excerpt || "";

  try {
    const [translatedTitle, translatedExcerpt] =
      await Promise.all([
        translateText(title),
        translateText(excerpt)
      ]);

    return {
      ...post,
      swTitle: translatedTitle,
      swExcerpt: translatedExcerpt
    };

  } catch (error) {
    console.log("");
    console.log("⚠️ TRANSLATION FAILED");
    console.log(error.message);
    console.log("↩️ Falling back to original English content.");

    return {
      ...post,
      swTitle: "",
      swExcerpt: "",
      translationFailed: true
    };
  }
}

module.exports = {
  translateText,
  translatePost
};

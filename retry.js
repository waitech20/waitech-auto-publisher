/**
 * withRetry — retries an async operation on transient (thrown) failures
 * such as network timeouts, DNS errors, or connection resets.
 *
 * IMPORTANT: this only retries when the operation THROWS before producing
 * a result (e.g. request never completed). It must never be used to retry
 * after a response was already received from Buffer, because Buffer has
 * no idempotency key — retrying an ambiguous "did it actually post?"
 * response could create a duplicate Facebook post.
 */
async function withRetry(fn, options = {}) {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const isRetryable = options.isRetryable || (() => true);

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === retries || !isRetryable(error)) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);

      console.log(
        `⚠️ Attempt ${attempt + 1} failed (${error.message}). Retrying in ${delay}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = { withRetry };

const { withRetry } = require("./retry");

const BUFFER_API_URL = "https://api.buffer.com";

// VERIFIED WORKING MUTATION — do not change the field structure or the
// inline fragment types without re-validating against the Buffer schema.
// See the audit notes: PostActionPayload is a union; "... on Post" is
// invalid and was already ruled out during testing.
const CREATE_POST_MUTATION =
  'mutation CreatePost($input: CreatePostInput!) {' +
  ' createPost(input: $input) {' +
  '   ... on PostActionSuccess {' +
  '     post { id text status }' +
  '   }' +
  '   ... on NotFoundError { message }' +
  '   ... on UnauthorizedError { message }' +
  '   ... on UnexpectedError { message }' +
  '   ... on RestProxyError { message }' +
  '   ... on LimitReachedError { message }' +
  '   ... on InvalidInputError { message }' +
  ' }' +
  '}';

/**
 * Builds the CreatePostInput object using the exact verified shape:
 * shareNow / automatic / image asset. metadata defaults to the original
 * verified Facebook shape when not provided, so existing callers are
 * unaffected.
 */
function buildCreatePostInput({ channelId, text, imageUrl, metadata }) {
  return {
    channelId,
    text,
    assets: imageUrl ? [{ image: { url: imageUrl } }] : [],
    mode: "shareNow",
    schedulingType: "automatic",
    saveToDraft: false,
    needsApproval: false,
    metadata: metadata || {
      facebook: {
        type: "post"
      }
    }
  };
}

/**
 * Sends (or simulates, if dryRun) a CreatePost mutation to Buffer.
 *
 * Retry policy: only retries when the HTTP request itself throws
 * (network failure, timeout, DNS error) BEFORE any response is received.
 * A response that was successfully received — even a GraphQL error
 * response — is never retried, because Buffer has no idempotency key
 * and retrying after an ambiguous "maybe it posted" state risks a
 * duplicate Facebook post.
 */
async function createBufferPost({ token, channelId, text, imageUrl, metadata, dryRun = false }) {
  const input = buildCreatePostInput({ channelId, text, imageUrl, metadata });

  if (dryRun) {
    console.log("🧪 DRY_RUN active — Buffer request NOT sent.");
    console.log("Would send CreatePostInput:");
    console.log(JSON.stringify(input, null, 2));

    return {
      success: true,
      dryRun: true,
      postId: null,
      status: "dry-run"
    };
  }

  const sendRequest = async () => {
    const response = await fetch(BUFFER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        query: CREATE_POST_MUTATION,
        variables: { input }
      })
    });

    return response.json();
  };

  const result = await withRetry(sendRequest, {
    retries: 2,
    baseDelayMs: 1500
  });

  if (result.errors) {
    return { success: false, errors: result.errors };
  }

  const data = result.data?.createPost;

  if (data?.post) {
    return {
      success: true,
      postId: data.post.id,
      status: data.post.status
    };
  }

  return {
    success: false,
    message: data?.message || "Buffer rejected the post."
  };
}

module.exports = {
  createBufferPost,
  buildCreatePostInput,
  CREATE_POST_MUTATION
};

const {
  createCaption,
  createInstagramCaption,
  createPinterestDescription
} = require("./caption");

const PINTEREST_BOARD_ID =
  process.env.PINTEREST_BOARD_ID || "779404347952599517"; // "WaiTech Solution" board (serviceId, not Buffer's internal id)

const CHANNELS = [
  {
    service: "facebook",
    channelId: process.env.FACEBOOK_CHANNEL_ID || "6a7de7afb2d9d577436e52b5",
    // The publication record (duplicate/republish protection) is driven
    // by this channel succeeding, matching the original verified baseline.
    critical: true,
    buildText: (post) => createCaption(post),
    buildMetadata: () => ({
      facebook: {
        type: "post"
      }
    })
  },
  {
    service: "instagram",
    channelId: process.env.INSTAGRAM_CHANNEL_ID || "6a89ca44ccaf649a67f6cc72",
    critical: false,
    buildText: (post) => createInstagramCaption(post),
    buildMetadata: () => ({
      instagram: {
        type: "post",
        shouldShareToFeed: true
      }
    })
  },
  {
    service: "pinterest",
    channelId: process.env.PINTEREST_CHANNEL_ID || "6a7eb380b2d9d57743759f4a",
    critical: false,
    buildText: (post) => createPinterestDescription(post),
    buildMetadata: (post) => ({
      pinterest: {
        title: post.title,
        url: post.url,
        boardServiceId: PINTEREST_BOARD_ID
      }
    })
  }
];

module.exports = { CHANNELS };
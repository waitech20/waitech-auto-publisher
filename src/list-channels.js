require("dotenv").config();

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const BUFFER_API_URL = "https://api.buffer.com";

// SAFETY: this script is 100% read-only. It only queries account +
// channel info from Buffer — it never creates, edits, or deletes
// anything. Safe to run at any time.

const ACCOUNT_QUERY = `
  query GetAccount {
    account {
      id
      email
      organizations {
        id
        name
      }
    }
  }
`;

const CHANNELS_QUERY = `
  query GetChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id
      name
      service
      displayName
      isDisconnected
      metadata {
        ... on PinterestMetadata {
          boards {
            id
            name
            serviceId
            url
          }
        }
      }
    }
  }
`;

async function callBuffer(query, variables) {
  const response = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  return response.json();
}

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech BUFFER CHANNEL LIST (read-only)");
  console.log("=================================");
  console.log("");

  if (!TOKEN) {
    console.log("❌ BUFFER_ACCESS_TOKEN missing.");
    return;
  }

  const accountResult = await callBuffer(ACCOUNT_QUERY);

  if (accountResult.errors) {
    console.log("❌ Failed to fetch account:");
    console.log(JSON.stringify(accountResult.errors, null, 2));
    return;
  }

  const organizations = accountResult.data.account.organizations;

  if (!organizations || organizations.length === 0) {
    console.log("❌ No organizations found on this account.");
    return;
  }

  for (const org of organizations) {
    console.log(`Organization: ${org.name} (${org.id})`);
    console.log("---------------------------------");

    const channelsResult = await callBuffer(CHANNELS_QUERY, {
      input: { organizationId: org.id }
    });

    if (channelsResult.errors) {
      console.log("❌ Failed to fetch channels:");
      console.log(JSON.stringify(channelsResult.errors, null, 2));
      continue;
    }

    const channels = channelsResult.data.channels;

    if (!channels || channels.length === 0) {
      console.log("(no channels connected)");
    } else {
      channels.forEach((ch) => {
        console.log(`Service:  ${ch.service}`);
        console.log(`Name:     ${ch.displayName || ch.name}`);
        console.log(`ID:       ${ch.id}`);
        console.log(`Status:   ${ch.isDisconnected ? "DISCONNECTED" : "connected"}`);

        if (ch.service === "pinterest" && ch.metadata && ch.metadata.boards) {
          console.log("Boards:");
          ch.metadata.boards.forEach((board) => {
            console.log(`  - ${board.name}  (id: ${board.id})`);
          });
        }

        console.log("---------------------------------");
      });
    }

    console.log("");
  }

  console.log("🟢 Done. Copy the ID for each channel you need.");
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR:");
  console.log(error.message);
});

require("dotenv").config();

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const BUFFER_API_URL = "https://api.buffer.com";

// SAFETY: this script is 100% read-only GraphQL schema introspection.
// It never creates, edits, or deletes anything — it only asks Buffer's
// API to describe its own types. Safe to run at any time.

const INTROSPECT_TYPE_QUERY = `
  query IntrospectType($name: String!) {
    __type(name: $name) {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
      inputFields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
      enumValues {
        name
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

function describeField(field) {
  let typeDesc = field.type.name || field.type.kind;

  if (field.type.ofType) {
    typeDesc = `${field.type.kind}<${field.type.ofType.name || field.type.ofType.kind}`;
    if (field.type.ofType.ofType) {
      typeDesc += `<${field.type.ofType.ofType.name}>`;
    }
    typeDesc += ">";
  }

  return `  ${field.name}: ${typeDesc}`;
}

async function introspect(typeName) {
  console.log(`===== ${typeName} =====`);

  const result = await callBuffer(INTROSPECT_TYPE_QUERY, { name: typeName });

  if (result.errors) {
    console.log("❌ Error:", JSON.stringify(result.errors, null, 2));
    return;
  }

  const type = result.data.__type;

  if (!type) {
    console.log("(type not found)");
    console.log("");
    return;
  }

  console.log("kind:", type.kind);

  if (type.fields) {
    type.fields.forEach((f) => console.log(describeField(f)));
  }

  if (type.inputFields) {
    type.inputFields.forEach((f) => console.log(describeField(f)));
  }

  if (type.enumValues) {
    console.log("values:", type.enumValues.map((v) => v.name).join(", "));
  }

  console.log("");
}

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech BUFFER SCHEMA INTROSPECTION (read-only)");
  console.log("=================================");
  console.log("");

  if (!TOKEN) {
    console.log("❌ BUFFER_ACCESS_TOKEN missing.");
    return;
  }

  await introspect("PostInputMetaData");
  await introspect("InstagramPostMetadataInput");
  await introspect("PinterestPostMetadataInput");
  await introspect("PostType");
  await introspect("Channel");
  await introspect("PinterestBoard");

  console.log("🟢 Done.");
}

main().catch((error) => {
  console.log("");
  console.log("FATAL ERROR:");
  console.log(error.message);
});

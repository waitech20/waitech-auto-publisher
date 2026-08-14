require("dotenv").config();

const { getLatestPost } = require("./blogger");

// This is a cron-triggered batch job, not a long-running server, so a
// full HTTP health endpoint isn't applicable. This script instead gives
// a quick pass/fail signal (exit code 0/1) that can be run locally, in
// CI, or as a separate manual GitHub Actions workflow_dispatch job.

async function main() {
  console.log("");
  console.log("=================================");
  console.log("WaiTech AUTO PUBLISHER — HEALTH CHECK");
  console.log("=================================");
  console.log("");

  const problems = [];

  if (!process.env.BUFFER_ACCESS_TOKEN) {
    problems.push("BUFFER_ACCESS_TOKEN is not set.");
  } else {
    console.log("✅ BUFFER_ACCESS_TOKEN is set.");
  }

  console.log("🔄 Checking Blogger RSS feed reachability...");

  try {
    const post = await getLatestPost();

    if (post) {
      console.log("✅ Blogger RSS reachable, latest post:", post.title);
    } else {
      problems.push("Blogger RSS reachable but returned no posts.");
    }
  } catch (error) {
    problems.push("Blogger RSS check failed: " + error.message);
  }

  console.log("");

  if (problems.length > 0) {
    console.log("HEALTH: FAIL");
    problems.forEach((problem) => console.log(" - " + problem));
    process.exitCode = 1;
    return;
  }

  console.log("HEALTH: OK");
}

main().catch((error) => {
  console.log("");
  console.log("HEALTH: FAIL");
  console.log(error.message);
  process.exitCode = 1;
});

require("dotenv").config();

const { spawn } = require("child_process");

// Configurable via SCHEDULER_INTERVAL_MINUTES; defaults to 5 minutes,
// matching the original verified baseline.
const INTERVAL_MINUTES =
  Number(process.env.SCHEDULER_INTERVAL_MINUTES) > 0
    ? Number(process.env.SCHEDULER_INTERVAL_MINUTES)
    : 5;

const INTERVAL = INTERVAL_MINUTES * 60 * 1000;

let running = false;

function runPublisher() {
  if (running) {
    console.log("");
    console.log("Publisher already running. Skipping this cycle.");
    return;
  }

  running = true;

  console.log("");
  console.log("=================================");
  console.log("WaiTech Auto Publisher Scheduler");
  console.log("=================================");
  console.log("Running publisher...");
  console.log("");

  const child = spawn(
    process.execPath,
    ["src/index.js"],
    {
      cwd: __dirname,
      stdio: "inherit",
      shell: false
    }
  );

  child.on("close", (code) => {
    running = false;

    console.log("");
    console.log("---------------------------------");
    console.log("Publisher finished.");
    console.log("Exit code:", code);
    console.log("---------------------------------");
    console.log("");
    console.log(`Next check in ${INTERVAL_MINUTES} minute(s).`);
  });

  child.on("error", (error) => {
    running = false;

    console.log("");
    console.log("Scheduler error:");
    console.log(error.message);
  });
}

console.log("");
console.log("=================================");
console.log("WaiTech AUTO PUBLISHER SCHEDULER");
console.log("=================================");
console.log("");
console.log(`Interval: ${INTERVAL_MINUTES} minute(s)`);
console.log("Press CTRL+C to stop.");
console.log("");

runPublisher();

setInterval(runPublisher, INTERVAL);

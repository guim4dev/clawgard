#!/usr/bin/env node
const sub = process.argv[2] ?? "";
if (sub === "version") {
  console.log("clawgard-buddy v0.1.0");
  process.exit(0);
}
if (sub === "setup") {
  console.log("SENTINEL SETUP OK");
  process.exit(0);
}
if (sub === "listen") {
  console.log("SENTINEL LISTEN OK " + process.argv.slice(3).join(" "));
  process.exit(0);
}
console.error("unknown subcommand: " + sub);
process.exit(2);

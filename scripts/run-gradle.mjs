import { spawn } from "node:child_process";
import { platform } from "node:process";

const args = process.argv.slice(2);
const isWindows = platform === "win32";
const command = isWindows ? "cmd.exe" : "./gradlew";
const commandArgs = isWindows ? ["/d", "/s", "/c", "gradlew.bat", ...args] : args;

const child = spawn(command, commandArgs, {
  cwd: new URL("../apps/api/", import.meta.url),
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Gradle terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start Gradle: ${error.message}`);
  process.exit(1);
});

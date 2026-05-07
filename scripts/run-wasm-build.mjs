import { spawn } from "node:child_process";
import { platform } from "node:process";

const rawArgs = process.argv.slice(2);
const command = platform === "win32" ? "powershell" : "bash";
const script = platform === "win32"
  ? ["-ExecutionPolicy", "Bypass", "-File", "engine/wasm-engine/scripts/build-wasm.ps1"]
  : ["engine/wasm-engine/scripts/build-wasm.sh"];
const args = platform === "win32" ? toPowerShellArgs(rawArgs) : rawArgs;

const child = spawn(command, [...script, ...args], {
  cwd: new URL("../", import.meta.url),
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`WASM build terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start WASM build: ${error.message}`);
  process.exit(1);
});

function toPowerShellArgs(args) {
  return args.map((arg) => {
    if (arg === "--skip-web-copy") {
      return "-SkipWebCopy";
    }
    if (arg === "--web-public-dir") {
      return "-WebPublicDir";
    }
    return arg;
  });
}

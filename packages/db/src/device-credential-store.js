import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const PROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$inputValue = [Console]::In.ReadToEnd()",
  "$plain = [Text.Encoding]::UTF8.GetBytes($inputValue)",
  "$protected = [System.Security.Cryptography.ProtectedData]::Protect($plain, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($protected))",
].join("; ");

const UNPROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$inputValue = [Console]::In.ReadToEnd()",
  "$protected = [Convert]::FromBase64String($inputValue)",
  "$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
].join("; ");

export class WindowsDpapiCredentialStore {
  #credentialPath;
  #run;

  constructor({ credentialPath, run = runPowerShell }) {
    if (typeof credentialPath !== "string" || !path.isAbsolute(credentialPath)) {
      throw new Error("An absolute OS credential path is required");
    }
    this.#credentialPath = credentialPath;
    this.#run = run;
  }

  async save(token) {
    if (typeof token !== "string" || !/^rpd1\.device_[A-Za-z0-9]+\.[A-Za-z0-9_-]{32,128}$/u.test(token)) {
      throw new Error("Device credential is invalid");
    }
    const protectedValue = await this.#run(PROTECT_SCRIPT, token);
    await mkdir(path.dirname(this.#credentialPath), { recursive: true });
    await writeFile(this.#credentialPath, `${protectedValue}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async load() {
    let protectedValue;
    try {
      protectedValue = (await readFile(this.#credentialPath, "utf8")).trim();
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    return this.#run(UNPROTECT_SCRIPT, protectedValue);
  }

  async clear() {
    try {
      await unlink(this.#credentialPath);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

export class InMemoryDeviceCredentialStore {
  #token = null;
  async save(token) { this.#token = token; }
  async load() { return this.#token; }
  async clear() { this.#token = null; }
}

function runPowerShell(script, input) {
  if (process.platform !== "win32") return Promise.reject(new Error("Windows DPAPI is unavailable on this operating system"));
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && output.trim()) resolve(output.trim());
      else reject(new Error(`OS credential protection failed${errorOutput ? `: ${errorOutput.trim().slice(0, 160)}` : ""}`));
    });
    child.stdin.end(input);
  });
}

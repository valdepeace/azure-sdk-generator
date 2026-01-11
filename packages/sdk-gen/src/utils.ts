import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function die(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeFile(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf8");
}

export function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function defaultCacheDir() {
  const home = os.homedir();
  return path.join(home, ".cache", "azdo-sdk-gen");
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} → ${url}\n${text}`);
  }
  return JSON.parse(text) as T;
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} → ${url}\n${text}`);
  return text;
}

import path from "node:path";
import { fetchJson } from "./utils.js";

const OWNER = "MicrosoftDocs";
const REPO = "vsts-rest-api-specs";

export type GitHubContentItem = {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url: string | null;
};

export function githubHeaders() {
  const h: Record<string, string> = {
    "User-Agent": "azdo-sdk-gen",
    "Accept": "application/vnd.github+json"
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function listApis(ref: string) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/specification?ref=${encodeURIComponent(ref)}`;
  const items = await fetchJson<GitHubContentItem[]>(url, githubHeaders());
  return items.filter(i => i.type === "dir").map(i => i.name).sort();
}

export async function listVersions(api: string, ref: string) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/specification/${encodeURIComponent(api)}?ref=${encodeURIComponent(ref)}`;
  const items = await fetchJson<GitHubContentItem[]>(url, githubHeaders());
  return items.filter(i => i.type === "dir").map(i => i.name).sort();
}

export async function listJsonFiles(api: string, version: string, ref: string) {
  const dir = `specification/${api}/${version}`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${dir}?ref=${encodeURIComponent(ref)}`;
  const items = await fetchJson<GitHubContentItem[]>(url, githubHeaders());
  const jsons = items
    .filter(i => i.type === "file" && i.name.toLowerCase().endsWith(".json"))
    .map(i => i.name)
    .sort();
  return { dir, jsons };
}

export function rawSpecUrl(api: string, version: string, file: string, ref: string) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${encodeURIComponent(ref)}/specification/${encodeURIComponent(api)}/${encodeURIComponent(version)}/${encodeURIComponent(file)}`;
}

export function pickSpecFile(api: string, jsons: string[], fileOverride?: string) {
  if (fileOverride) {
    const ok = jsons.includes(fileOverride);
    if (!ok) {
      throw new Error(`--file "${fileOverride}" no existe. Disponibles: ${jsons.join(", ")}`);
    }
    return fileOverride;
  }

  if (jsons.length === 0) throw new Error("No hay JSONs en ese directorio.");
  if (jsons.length === 1) return jsons[0];

  const preferred = [
    `${api}.json`,
    `${api}s.json`
  ];

  for (const p of preferred) {
    if (jsons.includes(p)) return p;
  }

  throw new Error(
    `Hay varios JSONs y no puedo elegir de forma segura. Usa --file.\nDisponibles: ${jsons.join(", ")}`
  );
}

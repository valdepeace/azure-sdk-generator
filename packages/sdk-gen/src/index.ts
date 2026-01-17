#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Command } from "commander";
import { defaultCacheDir, die, ensureDir, fetchText, writeFile } from "./utils.js";
import { listApis, listVersions, listJsonFiles, pickSpecFile, rawSpecUrl } from "./github.js";
import { runOpenApiGenerate } from "./generator.js";
import { scaffoldPackage } from "./scaffold.js";

function tmpDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function downloadSpecTo(url: string, dest: string) {
  const content = await fetchText(url);
  writeFile(dest, content);
}

function normalizeScope(scope?: string) {
  if (!scope) return "";
  if (!scope.startsWith("@")) return `@${scope}`;
  return scope;
}

function workspaceRootDir() {
  let dir = process.cwd();
  while (true) {
    const hasWorkspaceYaml = fs.existsSync(path.join(dir, "pnpm-workspace.yaml"));
    const pkgPath = path.join(dir, "package.json");
    const hasWorkspacesPkg = fs.existsSync(pkgPath) && JSON.parse(fs.readFileSync(pkgPath, "utf8")).workspaces;
    if (hasWorkspaceYaml || hasWorkspacesPkg) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

const program = new Command();

program
  .name("az-sdk-gen")
  .description("Generate TypeScript SDKs from MicrosoftDocs/vsts-rest-api-specs")
  .version("0.1.3");

program
  .command("list")
  .description("List available APIs or versions")
  .option(
    "--api <api>",
    "API to inspect (graph, security, account, ...). When omitted, lists all APIs."
  )
  .option("--ref <ref>", "Git ref in vsts-rest-api-specs (master, tag, commit)", "master")
  .addHelpText(
    "after",
    `
Examples:
  npx @valdepeace/az-sdk-gen list
  npx @valdepeace/az-sdk-gen list --api graph
  pnpm dlx @valdepeace/az-sdk-gen list --api graph --ref master
`
  )
  .action(async (opts) => {
    try {
      if (!opts.api) {
        const apis = await listApis(opts.ref);
        apis.forEach((a) => console.log(a));
        return;
      }
      const versions = await listVersions(opts.api, opts.ref);
      versions.forEach((v) => console.log(v));
    } catch (e: any) {
      die(e?.message ?? String(e));
    }
  });

program
  .command("resolve")
  .description("Resolve which OpenAPI JSON file will be used for a given API and version")
  .requiredOption("--api <api>", "API to resolve (graph, security, account, ...)")
  .requiredOption("--api-version <version>", "API version (7.1, 7.2, ...)")
  .option("--ref <ref>", "Git ref in vsts-rest-api-specs (master, tag, commit)", "master")
  .option("--file <file>", "Explicit JSON file name to use (e.g. accounts.json)")
  .addHelpText(
    "after",
    `
Example:
  npx @valdepeace/az-sdk-gen resolve --api graph --api-version 7.1
`
  )
  .action(async (opts) => {
    try {
      const { jsons } = await listJsonFiles(opts.api, opts.apiVersion, opts.ref);
      const chosen = pickSpecFile(opts.api, jsons, opts.file);
      const url = rawSpecUrl(opts.api, opts.apiVersion, chosen, opts.ref);
      console.log(chosen);
      console.log(url);
    } catch (e: any) {
      die(e?.message ?? String(e));
    }
  });

program
  .command("generate")
  .description("Generate a TypeScript SDK from a vsts-rest-api-specs OpenAPI document")
  .requiredOption("--api <api>", "API to generate (graph, security, account, ...)")
  .requiredOption("--api-version <version>", "API version (7.1, 7.2, ...)")
  .option("--ref <ref>", "Git ref in vsts-rest-api-specs (master, tag, commit)", "master")
  .option("--file <file>", "Explicit JSON file name to use")
  .option(
    "--out <dir>",
    "Root directory where generated packages will be created",
    "packages/generated"
  )
  .option("--scope <scope>", "npm scope for generated packages (e.g. @valdepeace)")
  .option("--pkg-version <version>", "Version for generated npm packages", "0.1.0")
  .option("--no-cache", "Disable local caching of downloaded specs")
  .addHelpText(
    "after",
    `
Examples:
  npx @valdepeace/az-sdk-gen generate --api graph --api-version 7.1
  npx @valdepeace/az-sdk-gen generate --api graph --api-version 7.1 --out packages/generated --scope @valdepeace
  pnpm dlx @valdepeace/az-sdk-gen generate --api graph --api-version 7.1 --out packages/generated --scope @valdepeace
`
  )
  .action(async (opts) => {
    try {
      const scope = normalizeScope(opts.scope);

      const { jsons } = await listJsonFiles(opts.api, opts.apiVersion, opts.ref);
      const chosen = pickSpecFile(opts.api, jsons, opts.file);
      const url = rawSpecUrl(opts.api, opts.apiVersion, chosen, opts.ref);

      const cacheRoot = defaultCacheDir();
      const cachePath = path.join(cacheRoot, "specs", opts.ref, opts.api, opts.apiVersion, chosen);

      let specPath: string;

      if (opts.cache && fs.existsSync(cachePath)) {
        console.log(`🗃️  Cache hit: ${cachePath}`);
        specPath = cachePath;
      } else {
        console.log(`⬇️  Descargando spec: ${url}`);
        ensureDir(path.dirname(cachePath));
        await downloadSpecTo(url, cachePath);
        specPath = cachePath;
      }

      const tmp = tmpDir("azdo-sdk-gen-");
      const genOut = path.join(tmp, "gen");
      ensureDir(genOut);

      console.log("⚙️  Generando SDK (typescript-fetch)…");
      runOpenApiGenerate({
        inputSpecPath: specPath,
        outDir: genOut,
        generator: "typescript-fetch",
        additionalProperties: {
          supportsES6: "true",
          typescriptThreePlus: "true",
          modelPropertyNaming: "original"
        }
      });

      const baseName = `azure-devops-${opts.api}-${opts.apiVersion}`;
      const pkgName = scope ? `${scope}/${baseName}` : baseName;

      const outRoot = path.resolve(opts.out);
      const resolvedOut = path.isAbsolute(outRoot) ? outRoot : path.join(workspaceRootDir(), opts.out);
      ensureDir(resolvedOut);

      const finalDir = path.join(resolvedOut, baseName);
      if (fs.existsSync(finalDir)) {
        fs.rmSync(finalDir, { recursive: true, force: true });
      }
      fs.mkdirSync(finalDir, { recursive: true });

      fs.cpSync(genOut, finalDir, { recursive: true });

      scaffoldPackage({
        packageDir: finalDir,
        packageName: pkgName,
        packageVersion: opts.pkgVersion,
        description: `Azure DevOps ${opts.api} SDK (${opts.apiVersion}) generado desde vsts-rest-api-specs @ ${opts.ref}`
      });

      console.log(`✅ Listo: ${finalDir}`);
      console.log(`📦 Paquete: ${pkgName}@${opts.pkgVersion}`);
      console.log(`👉 Siguiente: (cd ${finalDir} && pnpm i && pnpm build)`);
    } catch (e: any) {
      die(e?.message ?? String(e));
    }
  });

function isStableVersion(v: string) {
  return !/preview|beta|rc/i.test(v);
}

function versionTokens(v: string) {
  return v.split(/[^0-9]+/).filter(Boolean).map((x) => parseInt(x, 10));
}

function compareVersionsDesc(a: string, b: string) {
  const sa = isStableVersion(a);
  const sb = isStableVersion(b);
  if (sa !== sb) return sa ? -1 : 1;
  const ta = versionTokens(a);
  const tb = versionTokens(b);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i++) {
    const va = ta[i] ?? 0;
    const vb = tb[i] ?? 0;
    if (va !== vb) return vb - va;
  }
  return b.localeCompare(a);
}

function pickLatest(versions: string[]) {
  const sorted = versions.slice().sort(compareVersionsDesc);
  return sorted[0];
}

program
  .command("generate-latest")
  .description("Generate SDKs for all APIs using their latest available version")
  .option("--ref <ref>", "Git ref in vsts-rest-api-specs (master, tag, commit)", "master")
  .option(
    "--out <dir>",
    "Root directory where generated packages will be created",
    "packages/generated"
  )
  .option("--scope <scope>", "npm scope for generated packages (e.g. @valdepeace)")
  .option("--pkg-version <version>", "Version for generated npm packages", "0.1.0")
  .option("--no-cache", "Disable local caching of downloaded specs")
  .addHelpText(
    "after",
    `
Example:
  npx @valdepeace/az-sdk-gen generate-latest --ref master --out packages/generated --scope @valdepeace
`
  )
  .action(async (opts) => {
    try {
      const scope = normalizeScope(opts.scope);
      const apis = await listApis(opts.ref);
      for (const api of apis) {
        try {
          const versions = await listVersions(api, opts.ref);
          if (!versions.length) continue;
          const latest = pickLatest(versions);
          const { jsons } = await listJsonFiles(api, latest, opts.ref);
          let chosen: string;
          try {
            chosen = pickSpecFile(api, jsons);
          } catch {
            continue;
          }
          const url = rawSpecUrl(api, latest, chosen, opts.ref);
          const cacheRoot = defaultCacheDir();
          const cachePath = path.join(cacheRoot, "specs", opts.ref, api, latest, chosen);
          let specPath: string;
          if (opts.cache && fs.existsSync(cachePath)) {
            specPath = cachePath;
          } else {
            ensureDir(path.dirname(cachePath));
            await downloadSpecTo(url, cachePath);
            specPath = cachePath;
          }
          const tmp = tmpDir("azdo-sdk-gen-");
          const genOut = path.join(tmp, "gen");
          ensureDir(genOut);
          runOpenApiGenerate({
            inputSpecPath: specPath,
            outDir: genOut,
            generator: "typescript-fetch",
            additionalProperties: {
              supportsES6: "true",
              typescriptThreePlus: "true",
              modelPropertyNaming: "original"
            }
          });
          const baseName = `azure-devops-${api}-${latest}`;
          const pkgName = scope ? `${scope}/${baseName}` : baseName;
          const outRoot = path.resolve(opts.out);
          const resolvedOut = path.isAbsolute(outRoot) ? outRoot : path.join(workspaceRootDir(), opts.out);
          ensureDir(resolvedOut);
          const finalDir = path.join(resolvedOut, baseName);
          if (fs.existsSync(finalDir)) {
            fs.rmSync(finalDir, { recursive: true, force: true });
          }
          fs.mkdirSync(finalDir, { recursive: true });
          fs.cpSync(genOut, finalDir, { recursive: true });
          scaffoldPackage({
            packageDir: finalDir,
            packageName: pkgName,
            packageVersion: opts.pkgVersion,
            description: `Azure DevOps ${api} SDK (${latest}) generado desde vsts-rest-api-specs @ ${opts.ref}`
          });
          console.log(`${api}@${latest} → ${finalDir}`);
        } catch (e: any) {
          console.error(`Error en ${api}: ${e?.message ?? String(e)}`);
        }
      }
      console.log("Finalizado.");
    } catch (e: any) {
      die(e?.message ?? String(e));
    }
  });

program.parse(process.argv);

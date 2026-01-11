import { spawnSync } from "node:child_process";

export type GenerateOptions = {
  inputSpecPath: string;
  outDir: string;
  generator: string;
  additionalProperties: Record<string, string>;
};

export function runOpenApiGenerate(opts: GenerateOptions) {
  const props = Object.entries(opts.additionalProperties)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

  const args = [
    "@openapitools/openapi-generator-cli",
    "generate",
    "-g", opts.generator,
    "-i", opts.inputSpecPath,
    "-o", opts.outDir,
    "--additional-properties", props,
    "--skip-validate-spec"
  ];

  const r = spawnSync("npx", args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (r.status !== 0) {
    throw new Error(`openapi-generator failed (status ${r.status})`);
  }
}

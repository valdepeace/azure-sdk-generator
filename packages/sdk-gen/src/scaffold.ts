import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeFile } from "./utils.js";

export type ScaffoldOptions = {
  packageDir: string;
  packageName: string;
  packageVersion: string;
  description: string;
};

function fileExists(p: string) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function scaffoldPackage(opts: ScaffoldOptions) {
  ensureDir(opts.packageDir);

  const hasApisIndex =
    fileExists(path.join(opts.packageDir, "apis", "index.ts")) ||
    fileExists(path.join(opts.packageDir, "src", "apis", "index.ts"));

  const hasModelsIndex =
    fileExists(path.join(opts.packageDir, "models", "index.ts")) ||
    fileExists(path.join(opts.packageDir, "src", "models", "index.ts"));

  const hasConfiguration =
    fileExists(path.join(opts.packageDir, "configuration.ts")) ||
    fileExists(path.join(opts.packageDir, "src", "configuration.ts"));

  const hasRuntime =
    fileExists(path.join(opts.packageDir, "runtime.ts")) ||
    fileExists(path.join(opts.packageDir, "src", "runtime.ts"));

  const usesSrcLayout =
    fileExists(path.join(opts.packageDir, "src", "index.ts")) ||
    fileExists(path.join(opts.packageDir, "src", "apis")) ||
    fileExists(path.join(opts.packageDir, "src", "models"));

  const pkg: any = {
    name: opts.packageName,
    version: opts.packageVersion,
    description: opts.description,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      }
    },
    files: ["dist"],
    scripts: {
      build: "tsc -p tsconfig.json"
    },
    dependencies: {}
  };

  writeFile(path.join(opts.packageDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "dist",
      rootDir: ".",
      declaration: true,
      strict: false,
      skipLibCheck: true
    },
    include: ["**/*.ts"],
    exclude: ["dist", "node_modules"]
  };

  writeFile(path.join(opts.packageDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");

  const readme = `# ${opts.packageName}

SDK generated automatically from \`MicrosoftDocs/vsts-rest-api-specs\`.

## Build
\`\`\`bash
pnpm install
pnpm build
\`\`\`

## Usage
\`\`\`ts
import { Configuration } from "${opts.packageName}";
\`\`\`
`;
  writeFile(path.join(opts.packageDir, "README.md"), readme);

  const entryFrom = (p: string) => (usesSrcLayout ? `./src/${p}` : `./${p}`);

  const exportsLines: string[] = [];
  exportsLines.push("// Auto-generated entrypoint.");
  exportsLines.push("// Do not edit manually.\n");

  const fallbackSrcIndex = fileExists(path.join(opts.packageDir, "src", "index.ts"));

  if (hasApisIndex) exportsLines.push(`export * from "${entryFrom("apis/index.js")}";`);
  if (hasModelsIndex) exportsLines.push(`export * from "${entryFrom("models/index.js")}";`);
  if (hasConfiguration) exportsLines.push(`export * from "${entryFrom("configuration.js")}";`);
  if (hasRuntime) exportsLines.push(`export * from "${entryFrom("runtime.js")}";`);

  if (exportsLines.length <= 2 && fallbackSrcIndex) {
    exportsLines.push(`export * from "./src/index.js";`);
  }

  if (exportsLines.length <= 2) {
    exportsLines.push(
      `// No known entrypoints were detected. Inspect generated sources under ${usesSrcLayout ? "./src" : "./"}`
    );
  }

  writeFile(path.join(opts.packageDir, "index.ts"), exportsLines.join("\n") + "\n");
}

import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript");
const output = resolve("src/services/typescript/generated");
await mkdir(output, { recursive: true });
// TypeScript supports a host-supplied filesystem. Exclude its Node system probe
// so the same compiler runs inside the native app without Node polyfills.
await build({
  stdin: { contents: `import ts from ${JSON.stringify(compiler)}; export default ts;`, resolveDir: process.cwd() },
  outfile: join(output, "compiler.js"), bundle: true, platform: "browser", format: "esm",
  define: { process: "undefined", require: "undefined" }, minify: true, legalComments: "inline",
});
const libraries = {};
for (const file of (await readdir(dirname(compiler))).filter((name) => /^lib\..*\.d\.ts$/.test(name)).sort()) {
  libraries[`/lib/${file}`] = await readFile(join(dirname(compiler), file), "utf8");
}
await writeFile(join(output, "libraries.json"), JSON.stringify(libraries));
console.log(`Packaged TypeScript and ${Object.keys(libraries).length} standard libraries for offline use.`);

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateManifest } from "material-icon-theme";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"));
const output = fileURLToPath(new URL("../assets/material-icons.json", import.meta.url));
const { version } = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const manifest = generateManifest({
  activeIconPack: "react",
  folders: { theme: "specific" },
});

// Theme associations follow VS Code's case-insensitive matching rules.
const normalizeAssociations = (theme) => {
  if (!theme) return;
  for (const field of [
    "fileNames", "fileExtensions", "folderNames", "folderNamesExpanded",
    "rootFolderNames", "rootFolderNamesExpanded", "languageIds",
  ]) {
    if (theme[field]) {
      theme[field] = Object.fromEntries(
        Object.entries(theme[field]).map(([key, value]) => [key.toLowerCase(), value]),
      );
    }
  }
  normalizeAssociations(theme.light);
  normalizeAssociations(theme.highContrast);
};
normalizeAssociations(manifest);

const icons = Object.fromEntries(await Promise.all(
  Object.entries(manifest.iconDefinitions).map(async ([id, { iconPath }]) => [
    id,
    await readFile(path.join(packageRoot, "icons", path.basename(iconPath)), "utf8"),
  ]),
));

// Keep the upstream artwork and license together in the distributed asset.
const content = JSON.stringify({
  generatedBy: "pnpm generate:icons",
  package: "material-icon-theme",
  version,
  license: await readFile(path.join(packageRoot, "LICENSE"), "utf8"),
  manifest,
  icons,
}, null, 2) + "\n";

const existing = await readFile(output, "utf8").catch((error) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});

if (process.argv.includes("--check")) {
  if (existing !== content) throw new Error("Material icons are stale. Run pnpm generate:icons.");
  console.log(`Material icons are current (${Object.keys(icons).length} icons).`);
} else if (existing !== content) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, content);
  console.log(`Generated ${Object.keys(icons).length} Material icons with the React preset.`);
}

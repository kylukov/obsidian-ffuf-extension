import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, "main.js"), join(dist, "main.js"));
copyFileSync(join(root, "manifest.json"), join(dist, "manifest.json"));

console.log("Copied main.js and manifest.json → dist/");

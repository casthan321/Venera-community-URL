import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
const rawBase = "https://raw.githubusercontent.com/casthan321/Venera-community-URL/main";

if (!Array.isArray(index) || index.length === 0) fail("index.json must be a non-empty array");

const names = new Set();
const keys = new Set();
const files = new Set();

for (const entry of index) {
  for (const field of ["name", "fileName", "key", "version", "url"]) {
    if (typeof entry?.[field] !== "string" || entry[field].trim() === "") {
      fail(`index entry is missing ${field}`);
    }
  }
  if (!/^[A-Za-z0-9_.-]+\.js$/.test(entry.fileName)) fail(`${entry.fileName}: unsafe fileName`);
  if (!/^[A-Za-z0-9_]+$/.test(entry.key)) fail(`${entry.fileName}: invalid key`);
  if (!/^\d+\.\d+\.\d+$/.test(entry.version)) fail(`${entry.fileName}: invalid version`);
  if (entry.url !== `${rawBase}/${entry.fileName}`) fail(`${entry.fileName}: index URL is not canonical`);
  if (names.has(entry.name)) fail(`${entry.fileName}: duplicate name`);
  if (keys.has(entry.key)) fail(`${entry.fileName}: duplicate key`);
  if (files.has(entry.fileName)) fail(`${entry.fileName}: duplicate fileName`);
  names.add(entry.name);
  keys.add(entry.key);
  files.add(entry.fileName);

  const filePath = path.join(root, entry.fileName);
  if (!fs.existsSync(filePath)) fail(`${entry.fileName}: file does not exist`);
  const code = fs.readFileSync(filePath, "utf8");
  if (!/^class [A-Za-z_$][\w$]* extends ComicSource\s*\{/.test(code)) {
    fail(`${entry.fileName}: first line is not a ComicSource class`);
  }
  const metadata = Object.fromEntries(
    ["name", "key", "version", "minAppVersion", "url"].map((field) => [field, readField(code, field, entry.fileName)]),
  );
  if (metadata.name !== entry.name) fail(`${entry.fileName}: name does not match index.json`);
  if (metadata.key !== entry.key) fail(`${entry.fileName}: key does not match index.json`);
  if (metadata.version !== entry.version) fail(`${entry.fileName}: version does not match index.json`);
  if (metadata.minAppVersion !== "1.6.0") fail(`${entry.fileName}: minAppVersion must be 1.6.0`);
  if (metadata.url !== `${rawBase}/${entry.fileName}`) fail(`${entry.fileName}: update URL is not the canonical raw file`);
}

console.log(`Validated ${index.length} Venera sources.`);

function readField(code, field, fileName) {
  const match = code.match(new RegExp(`^\\s*${field}\\s*=\\s*["']([^"']+)["']`, "m"));
  if (!match) fail(`${fileName}: missing top-level ${field}`);
  return match[1];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

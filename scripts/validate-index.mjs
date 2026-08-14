import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const rawBase = "https://raw.githubusercontent.com/casthan321/Venera-community-URL/main";
const strictCapabilitySources = new Map([
  ["tencent_comics", new Set(["account", "favorites", "explore"])],
  ["noymanga", new Set(["account", "favorites", "explore", "signin"])],
]);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptFile)) {
  validateRepository();
}

function validateRepository() {
  const root = path.resolve(path.dirname(scriptFile), "..");
  const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));

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

    try {
      validateSourcePolicy(code, entry);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`Validated ${index.length} Venera sources.`);
}

function readField(code, field, fileName) {
  const match = code.match(new RegExp(`^\\s*${field}\\s*=\\s*["']([^"']+)["']`, "m"));
  if (!match) fail(`${fileName}: missing top-level ${field}`);
  return match[1];
}

export function validateSourcePolicy(code, entry) {
  const reject = (message) => {
    throw new Error(`${entry.fileName}: ${message}`);
  };
  const search = readAssignedBlock(code, "search", "{");
  const comic = readAssignedBlock(code, "comic", "{");
  if (!search || !/\bload\s*:/m.test(search)) reject("search.load is required");
  if (!comic || !/\bloadInfo\s*:/m.test(comic)) reject("comic.loadInfo is required");
  if (!comic || !/\bloadEp\s*:/m.test(comic)) reject("comic.loadEp is required");

  const strictCapabilities = strictCapabilitySources.get(entry.key) || new Set();
  const account = readAssignedBlock(code, "account", "{");
  const favorites = readAssignedBlock(code, "favorites", "{");
  const explore = readAssignedBlock(code, "explore", "[");
  const settings = readAssignedBlock(code, "settings", "{") || "";
  const manualSignIn = readNamedObject(settings, "manual_signin");
  const autoSignIn = readNamedObject(settings, "auto_signin");

  if (strictCapabilities.has("account") && !account) {
    reject("this maintained source must keep its account integration");
  }
  if (account && !/\bloginWithWebview\s*:\s*\{/m.test(account)) {
    reject("declared account integration must use loginWithWebview");
  }
  if (account && /\blogin\s*:\s*(?:async\s*)?\(/m.test(account)) {
    reject("password login must not be embedded; use loginWithWebview");
  }

  if (strictCapabilities.has("favorites") && !favorites) {
    reject("this maintained source must keep its favorites integration");
  }
  if (favorites && (!/\baddOrDelFavorite\s*:/m.test(favorites) || !/\bloadComics\s*:/m.test(favorites))) {
    reject("declared favorites integration needs addOrDelFavorite and loadComics");
  }

  if (strictCapabilities.has("explore") && !explore) {
    reject("this maintained source must keep its Discover integration");
  }
  if (explore && !/\btype\s*:\s*["']multiPartPage["']/m.test(explore)) {
    reject("declared Discover integration needs a multiPartPage");
  }
  if (explore) validateExploreTargets(explore, reject);

  if (strictCapabilities.has("signin") && (!manualSignIn || !autoSignIn)) {
    reject("this maintained source must keep manual and optional automatic sign-in settings");
  }
  if (manualSignIn && (!/\btype\s*:\s*["']callback["']/m.test(manualSignIn) || !/\bcallback\s*:/m.test(manualSignIn))) {
    reject("declared manual sign-in needs a callback setting");
  }
  if (autoSignIn && (!/\btype\s*:\s*["']switch["']/m.test(autoSignIn) || !/\bdefault\s*:\s*(?:true|false)/m.test(autoSignIn))) {
    reject("declared automatic sign-in needs a boolean switch setting");
  }

  const forbiddenSecrets = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/i,
    /(?:["']?(?:Authorization|Proxy-Authorization|Cookie)["']?)\s*[:=]\s*["'][^"']{4,}["']/i,
    /(?:["']?(?:password|passwd|clientSecret|secretKey|apiKey|token|accessToken|authToken|refreshToken|sessionToken|githubToken)["']?)\s*[:=]\s*["'][^"']{4,}["']/i,
    /["'](?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}["']/i,
    /https?:\/\/[^/\s"']+:[^@\s"']+@/i,
  ];
  if (forbiddenSecrets.some((pattern) => pattern.test(code))) {
    reject("possible embedded credential, Cookie, token, or private key");
  }
}

function validateExploreTargets(explore, reject) {
  const viewMoreTargets = readAllNamedObjects(explore, "viewMore");
  if (viewMoreTargets.length === 0) {
    reject("declared Discover sections need viewMore targets");
  }
  for (const target of viewMoreTargets) {
    const page = target.match(/\bpage\s*:\s*["'](category|search)["']/)?.[1];
    if (!page) reject("Discover viewMore.page must be category or search");
    const attributes = readNamedObject(target, "attributes");
    if (!attributes) reject(`Discover ${page} viewMore needs attributes`);
    const requiredAttribute = page === "category" ? "category" : "keyword";
    if (!new RegExp(`\\b${requiredAttribute}\\s*:`).test(attributes)) {
      reject(`Discover ${page} viewMore needs attributes.${requiredAttribute}`);
    }
  }
}

function readAssignedBlock(code, field, opener) {
  const match = new RegExp(`^\\s*${escapeRegExp(field)}\\s*=\\s*\\${opener}`, "m").exec(code);
  if (!match) return null;
  const start = code.indexOf(opener, match.index);
  return readBalancedBlock(code, start, opener);
}

function readNamedObject(code, field) {
  return readAllNamedObjects(code, field)[0] || null;
}

function readAllNamedObjects(code, field) {
  const blocks = [];
  const pattern = new RegExp(`\\b${escapeRegExp(field)}\\s*:\\s*\\{`, "g");
  for (const match of code.matchAll(pattern)) {
    const start = code.indexOf("{", match.index);
    const block = readBalancedBlock(code, start, "{");
    if (block) blocks.push(block);
  }
  return blocks;
}

function readBalancedBlock(code, start, opener) {
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let state = "code";
  let escaped = false;
  let regexCharacterClass = false;
  for (let index = start; index < code.length; index += 1) {
    const character = code[index];
    const next = code[index + 1];
    if (state === "lineComment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "blockComment") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (state === "single" && character === "'")
        || (state === "double" && character === '"')
        || (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (state === "regex") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "[") {
        regexCharacterClass = true;
      } else if (character === "]") {
        regexCharacterClass = false;
      } else if (character === "/" && !regexCharacterClass) {
        state = "code";
      }
      continue;
    }
    if (character === "/" && next === "/") {
      state = "lineComment";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "blockComment";
      index += 1;
      continue;
    }
    if (character === "/" && isRegexStart(code, index)) {
      state = "regex";
      regexCharacterClass = false;
      continue;
    }
    if (character === "'") state = "single";
    else if (character === '"') state = "double";
    else if (character === "`") state = "template";
    else if (character === opener) depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0) return code.slice(start, index + 1);
    }
  }
  return null;
}

function isRegexStart(code, index) {
  const before = code.slice(0, index).match(/(?:^|\s)(return|case|throw|else|do|typeof|instanceof|in|of|yield|await)\s*$/);
  if (before) return true;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (/\s/.test(code[cursor])) continue;
    return /[({[=,:;!?&|+\-*%^~<>]/.test(code[cursor]);
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

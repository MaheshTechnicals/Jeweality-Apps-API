// Fetches all apps of a Google Play developer and writes public/apps.json.
// Run: node fetch-apps.js   (DEV_ID env var optional, default "JEWEALITY")

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import gplay from "google-play-scraper";

const DEV_ID = process.env.DEV_ID || "JEWEALITY"; // F1
const LANG = "en";
const COUNTRY = "us";
const APP_DELAY_MS = 1500; // F4
const RETRY_DELAYS_MS = [3000, 6000]; // F5: 1st try + 2 backoff retries = 3 attempts

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "public", "apps.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// F5: run fn, retrying with backoff on failure.
async function withRetry(label, fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      const wait = RETRY_DELAYS_MS[attempt];
      console.warn(`[retry] ${label} failed (${err.message}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

// Read previous apps.json (if any) so we can fall back to it.
async function readOld() {
  try {
    return JSON.parse(await fs.readFile(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}

// Play Store returns some text HTML-encoded (e.g. "&amp;"); decode to plain text
// so clients can safely render it with textContent.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  if (typeof s !== "string") return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// Map a gplay result to our public API shape.
function toApi(a) {
  return {
    name: decode(a.title ?? ""),
    package: a.appId,
    url: a.url ?? `https://play.google.com/store/apps/details?id=${a.appId}`,
    icon: a.icon ?? "",
    shortDescription: decode(a.summary ?? ""),
    description: decode(a.description ?? a.summary ?? ""),
    score: typeof a.score === "number" ? a.score : null,
    installs: a.installs ?? "",
    version: a.version ?? "",
    updated: typeof a.updated === "number" ? a.updated : null,
  };
}

async function main() {
  const old = await readOld();
  const oldByPkg = new Map((old?.apps ?? []).map((a) => [a.package, a]));

  // F2 + F7: fetch developer list; any failure / empty list => exit without touching apps.json.
  let list;
  try {
    list = await withRetry(`developer(${DEV_ID})`, () =>
      gplay.developer({ devId: DEV_ID, num: 100, lang: LANG, country: COUNTRY })
    );
  } catch (err) {
    console.error(`[fatal] Could not fetch developer list: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(list) || list.length === 0) {
    console.error(`[fatal] Developer list for "${DEV_ID}" is empty. Keeping old apps.json.`);
    process.exit(1);
  }
  console.log(`Found ${list.length} apps for ${DEV_ID}`);

  // F3, F4, F6: fetch full details one by one with a delay between calls.
  const apps = [];
  for (let i = 0; i < list.length; i++) {
    const basic = list[i];
    if (i > 0) await sleep(APP_DELAY_MS);
    try {
      const full = await withRetry(`app(${basic.appId})`, () =>
        gplay.app({ appId: basic.appId, lang: LANG, country: COUNTRY })
      );
      apps.push(toApi(full));
      console.log(`  ok  ${basic.appId}`);
    } catch (err) {
      // F6: use old data if present, else basic info from the developer list.
      const prev = oldByPkg.get(basic.appId);
      apps.push(prev ?? toApi(basic));
      console.warn(`  !!  ${basic.appId} detail failed (${err.message}); using ${prev ? "old" : "basic"} data`);
    }
  }

  // F8: skip writing if apps data is unchanged (ignoring updatedAt).
  if (old && JSON.stringify(old.apps) === JSON.stringify(apps) && old.developer === DEV_ID) {
    console.log("No changes. apps.json not modified.");
    return;
  }

  // F9: pretty-printed output.
  const out = {
    developer: DEV_ID,
    count: apps.length,
    updatedAt: new Date().toISOString(),
    apps,
  };
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${apps.length} apps to public/apps.json`);
}

main().catch((err) => {
  console.error(`[fatal] ${err.stack || err.message}`);
  process.exit(1);
});

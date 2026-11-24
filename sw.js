// 離線支援。第一次開啟時把整個網站存進快取，之後沒網路也能用。
// 程式檔：有網路就拿最新的，沒網路才用快取，所以更新網站不必改這裡的版本號。
// 單字資料（約 5 MB）：先用快取，背景再向伺服器確認有沒有新版，下次開啟生效。
const CACHE = "lexi-v3";
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "store.js",
  "speech.js",
  "manifest.webmanifest",
  "core/badges.js",
  "core/dates.js",
  "core/diff.js",
  "core/game.js",
  "core/i18n.js",
  "core/lookup.js",
  "core/merge.js",
  "core/monster.js",
  "core/schedule.js",
  "core/training.js",
  "core/usedwords.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];
const DATA = [
  "data/words.json",
  "data/training-examples.json",
  "data/word-details.json",
  "data/game-answers.json",
  "data/course.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([...SHELL, ...DATA].map((u) => new Request(u, { cache: "no-cache" })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function refresh(req) {
  const res = await fetch(req, { cache: "no-cache" });
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

// 網路優先；四秒內沒回應或失敗就用快取。
async function networkFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  const fresh = refresh(req);
  if (!cached) return fresh;
  fresh.catch(() => {});
  const timeout = new Promise((r) => setTimeout(() => r(null), 4000));
  return (await Promise.race([fresh.catch(() => null), timeout])) || cached;
}

// 快取優先；背景更新。
async function cacheFirst(req, e) {
  const cached = await caches.match(req);
  if (!cached) return refresh(req);
  e.waitUntil(refresh(req).catch(() => {}));
  return cached;
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes("/data/") ? cacheFirst(req, e) : networkFirst(req));
});

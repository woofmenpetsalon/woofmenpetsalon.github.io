const SW_VERSION = "woofmen-v10";
const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

// 你站內「核心檔案」：可依實際再加
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./manifest-admin.json",
  "./logo.png",
  "./menu.jpg"
];

// 安裝：預快取核心檔
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // 讓新 SW 直接進入 waiting -> active 流程
  self.skipWaiting();
});

// 啟用：清掉舊 cache，接管頁面
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// 接收頁面傳來的 skipWaiting 訊號
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});

// 請求策略
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只處理 GET
  if (req.method !== "GET") return;

  // 只處理同網域資源
  if (url.origin !== self.location.origin) return;

  // HTML：Network First（確保拿到最新 index/admin）
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(req);
          return cached || caches.match("./index.html");
        }
      })()
    );
    return;
  }

  // 其他靜態檔：Cache First + 背景更新
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (networkRes) => {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, networkRes.clone());
          return networkRes;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
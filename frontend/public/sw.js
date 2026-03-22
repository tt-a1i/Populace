const CACHE_NAME = "populace-shell-v1";
const SHELL_URLS = ["/", "/index.html", "/manifest.json", "/favicon.svg"];
const OFFLINE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#020617" />
  <title>Populace 离线</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at top, #0f172a, #020617 70%);
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 28rem;
      padding: 2rem;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 1rem;
      background: rgba(15, 23, 42, 0.9);
      box-shadow: 0 24px 48px rgba(2, 6, 23, 0.4);
    }
    h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
    p { margin: 0; line-height: 1.6; color: #cbd5e1; }
  </style>
</head>
<body>
  <main>
    <h1>当前处于离线状态</h1>
    <p>Populace 已缓存基础页面。网络恢复后，刷新即可重新连接模拟服务。</p>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          const shell = await caches.match("/");
          if (shell) {
            return shell;
          }
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

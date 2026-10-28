/**
 * Service worker：讓遊戲加到主畫面之後，Mac 關掉也能玩。
 *
 * 手寫而不是裝打包外掛，因為需求很單純，而且 Vite 產出的檔名有雜湊，
 * 與其維護一份會過期的檔案清單，不如**邊用邊快取**：
 *   - 導覽請求（開頁面）走網路優先，有新版就拿新版，沒網路才回快取
 *   - 其他同源的 GET 走快取優先，拿過一次就留著，`pack.bin` 也是這樣進來的
 *
 * 所以第一次要連得到網路（手機開一次就好），之後就離線可用。
 */
const CACHE = 'career-v1';
const PRECACHE = ['./', './pack.bin', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 任何一個抓不到就整組失敗，所以逐個來、失敗的略過
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // 開頁面：有網路就拿新版，沒有才回快取。不然改了程式永遠看到舊的。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(async () => (await caches.match('./')) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit !== undefined) return hit;
      return fetch(request).then((response) => {
        // 只留成功的完整回應，206 之類的放進快取會壞掉
        if (response.ok && response.status === 200) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

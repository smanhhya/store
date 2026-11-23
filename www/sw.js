// sw.js - محرك السرعة والعمل الكامل بدون إنترنت لتطبيق إدارة سمان ههيا (CRM)
const CRM_CACHE_NAME = 'sman-crm-shell-v1';
const CRM_CDN_CACHE = 'sman-crm-cdn-v1';

const LOCAL_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './dialogs.js?v=20261129',
  './settings.js?v=20261129',
  './dashboard.js?v=20261129',
  './orders.js?v=20261129',
  './batches.js?v=20261129',
  './drivers.js?v=20261129',
  './customers.js?v=20261129',
  './waybill.js?v=20261129',
  './live-connect.js?v=20261129',
  './kitchen-crm.js?v=20261129'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CRM_CACHE_NAME).then((cache) =>
      Promise.allSettled(LOCAL_SHELL_ASSETS.map((u) => cache.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CRM_CACHE_NAME && k !== CRM_CDN_CACHE) ? caches.delete(k) : null)
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;
  if (
    !url.startsWith('http') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('api.github.com') ||
    url.includes('script.google.com') ||
    url.includes('api.web3forms.com') ||
    url.includes('api.imgbb.com')
  ) {
    return;
  }

  const isCdn = CDN_HOSTS.some((h) => url.includes(h));

  // مكتبات الـ CDN والخطوط: من الكاش فوراً في 0ms + تحديث صامت في الخلفية
  if (isCdn) {
    event.respondWith(
      caches.open(CRM_CDN_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const netFetch = fetch(req).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          }).catch(() => cached);
          return cached || netFetch;
        })
      )
    );
    return;
  }

  // ملفات التطبيق المحلية: فتح فوري من الكاش (Stale-While-Revalidate) لضمان السرعة الصاروخية والأوفلاين 100%
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.open(CRM_CACHE_NAME).then((cache) =>
        cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
          const netFetch = fetch(req).then((res) => {
            if (res && res.ok) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          }).catch(() => cached);
          return cached || netFetch;
        })
      )
    );
  }
});

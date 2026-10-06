/**
 * ============================================================
 * sw.js - Service Worker
 * 作用：预缓存静态资源，支持离线访问
 * 策略：
 *   - 页面导航（HTML）：network-first，在线时始终拿最新页面，
 *     离线时回退到缓存的 index.html
 *   - 静态资源（CSS/JS/图标）：cache-first + 后台更新（下次访问自动取新版）
 *   - 天气 API 等第三方请求：network-only（数据实时性要求高）
 *
 * 重要：修改了任何被缓存的资源后，请务必把 CACHE_NAME 的版本号 +1，
 * 否则旧缓存会一直生效，用户看到的仍是老版本。
 * ============================================================
 */

var CACHE_NAME = 'schedule-calendar-v15';

// 说明：Service Worker 必须放在站点根目录，否则它的作用范围（scope）
// 只能覆盖自己所在的子目录，就无法缓存 index.html / css / js 了。
// 这是浏览器规范限制，所以它是根目录里的唯一例外。

// 需要预缓存的核心资源
// 农历算法库 lunar.min.js 是核心依赖（所有年份的农历都由它推算），必须预缓存
var PRECACHE_URLS = [
    './',
    './index.html',
    './pwa/manifest.json',
    './icons/apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './css/main.css',
    './css/calendar.css',
    './css/sidebar.css',
    './css/progress.css',
    './css/themes.css',
    './css/todo.css',
    './css/backup.css',
    './css/page.css',
    './js/lunar.min.js',
    './js/error-log.js',
    './js/utils.js',
    './js/overlay.js',
    './js/analytics.js',
    './js/storage.js',
    './js/history.js',
    './js/progress.js',
    './js/calendar.js',
    './js/dragDrop.js',
    './js/themes.js',
    './js/countdown.js',
    './js/templates.js',
    './js/plan.js',
    './js/todo.js',
    './js/todo-reminder.js',
    './js/weather-location.js',
    './js/backup.js',
    './js/cloud-config.js',
    './js/cloud-backup.js',
    './js/about.js',
    './js/main.js',
    './pages/about.html',
    './pages/privacy.html'
];

// ---------- 安装：预缓存核心资源 ----------
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            // 逐个缓存并容错：任一资源失败都不应导致整个安装失败
            return Promise.all(
                PRECACHE_URLS.map(function (url) {
                    return cache.add(url).catch(function (err) {
                        console.warn('[SW] 预缓存失败（已跳过）:', url, err);
                    });
                })
            );
        }).then(function () {
            // 立即接管页面，不等旧 SW 退出
            return self.skipWaiting();
        })
    );
});

// ---------- 激活：清理旧版本缓存 ----------
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (names) {
                return Promise.all(
                    names.map(function (name) {
                        if (name !== CACHE_NAME) {
                            return caches.delete(name);
                        }
                    })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

// ---------- 拦截请求 ----------
self.addEventListener('fetch', function (event) {
    var request = event.request;

    // 只处理 GET（避免缓存非幂等请求）
    if (request.method !== 'GET') {
        return;
    }

    var url = new URL(request.url);

    // 第三方 API（天气等）直接走网络，不缓存
    if (url.origin !== self.location.origin) {
        return;
    }

    // 页面导航：网络优先，保证在线时永远拿到最新 HTML；离线回退缓存
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        // 按「本次请求的地址」缓存：不能一律写进 index.html，
                        // 否则访问 关于页 会把首页缓存覆盖掉
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    // 离线：先找该页自己的缓存，找不到再回退到首页
                    return caches.match(request).then(function (hit) {
                        return hit || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // 同源静态资源：cache-first，命中后在后台刷新（下次访问即取新版）
    event.respondWith(
        caches.match(request).then(function (cached) {
            var network = fetch(request)
                .then(function (response) {
                    // 只缓存成功响应
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    // 网络失败时回退到缓存
                    return cached;
                });

            return cached || network;
        })
    );
});

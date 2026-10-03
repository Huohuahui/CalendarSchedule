/**
 * ============================================================
 * sw.js - Service Worker
 * 作用：预缓存静态资源，支持离线访问
 * 策略：
 *   - 静态资源（CSS/JS/图标/HTML）：cache-first + 后台更新
 *   - 天气 API 等第三方请求：network-only（数据实时性要求高）
 * ============================================================
 */

var CACHE_NAME = 'schedule-calendar-v2';

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
    './js/lunar.min.js',
    './js/utils.js',
    './js/storage.js',
    './js/progress.js',
    './js/calendar.js',
    './js/dragDrop.js',
    './js/themes.js',
    './js/countdown.js',
    './js/main.js'
];

// ---------- 安装：预缓存核心资源 ----------
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                return cache.addAll(PRECACHE_URLS);
            })
            .then(function () {
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
    var url = new URL(event.request.url);

    // 第三方 API（天气等）直接走网络，不缓存
    if (url.origin !== self.location.origin) {
        return;
    }

    // 同源资源：cache-first，命中后在后台刷新
    event.respondWith(
        caches.match(event.request).then(function (cached) {
            var fetchPromise = fetch(event.request)
                .then(function (response) {
                    // 只缓存成功响应
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    // 网络失败且无缓存时，对页面请求回退到 index.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });

            return cached || fetchPromise;
        })
    );
});

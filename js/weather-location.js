/**
 * ============================================================
 * weather-location.js - 天气「地点」模块
 * 作用：让天气不再写死某个城市。
 *   1) 首次访问：请求浏览器定位（用户授权后拿到坐标）→ 反查城市名
 *   2) 拒绝 / 失败 / file:// 打开：自动回退到内置常用城市（默认汕头），不白屏
 *   3) 天气标题显示城市名，点击可打开「选择城市」弹窗：
 *      · 使用我的当前位置（重新定位）
 *      · 在线搜索任意城市（open-meteo 免费地理编码，无需 key）
 *      · 常用城市一键切换
 *
 * 隐私说明：坐标只写入本机 localStorage；天气请求会带坐标发给第三方
 *   open-meteo（免费开源天气服务，无需注册）。手动选城市时发的是城市中心坐标。
 *
 * 数据：localStorage 'weatherLocation'
 *   { mode:'auto'|'manual', name, latitude, longitude, updatedAt }
 * 依赖：无（main.js 通过 getWeatherLocation() 取值）
 * ============================================================
 */

var WEATHER_LOC_KEY = 'weatherLocation';

/** 默认城市（定位不可用时的兜底） */
var DEFAULT_LOCATION = { mode: 'manual', name: '汕头', latitude: 23.4, longitude: 116.7 };

/**
 * 内置常用城市（离线可用，坐标已逐条校准）
 * 为什么要有它：在线地理编码（open-meteo）对个别中文名不敏感
 * （例如「汕头 / 潮州 / 揭阳」用中文搜不到，必须输入拼音），
 * 内置列表让这些城市在离线或搜索失败时也能直接选中。
 */
var COMMON_CITIES = [
    { name: '汕头', latitude: 23.35, longitude: 116.68 },
    { name: '潮州', latitude: 23.65, longitude: 116.62 },
    { name: '揭阳', latitude: 23.54, longitude: 116.37 },
    { name: '汕尾', latitude: 22.78, longitude: 115.35 },
    { name: '梅州', latitude: 24.29, longitude: 116.12 },
    { name: '北京', latitude: 39.91, longitude: 116.40 },
    { name: '上海', latitude: 31.22, longitude: 121.46 },
    { name: '广州', latitude: 23.12, longitude: 113.25 },
    { name: '深圳', latitude: 22.55, longitude: 114.07 },
    { name: '东莞', latitude: 23.02, longitude: 113.75 },
    { name: '佛山', latitude: 23.03, longitude: 113.13 },
    { name: '珠海', latitude: 22.28, longitude: 113.57 },
    { name: '中山', latitude: 22.52, longitude: 113.38 },
    { name: '惠州', latitude: 23.11, longitude: 114.42 },
    { name: '江门', latitude: 22.58, longitude: 113.08 },
    { name: '肇庆', latitude: 23.05, longitude: 112.46 },
    { name: '湛江', latitude: 21.23, longitude: 110.39 },
    { name: '茂名', latitude: 21.67, longitude: 110.91 },
    { name: '清远', latitude: 23.70, longitude: 113.03 },
    { name: '韶关', latitude: 24.80, longitude: 113.58 },
    { name: '阳江', latitude: 21.86, longitude: 111.96 },
    { name: '河源', latitude: 23.73, longitude: 114.68 },
    { name: '云浮', latitude: 22.93, longitude: 112.04 },
    { name: '天津', latitude: 39.14, longitude: 117.18 },
    { name: '重庆', latitude: 29.56, longitude: 106.56 },
    { name: '成都', latitude: 30.67, longitude: 104.07 },
    { name: '杭州', latitude: 30.29, longitude: 120.16 },
    { name: '南京', latitude: 32.06, longitude: 118.78 },
    { name: '武汉', latitude: 30.58, longitude: 114.27 },
    { name: '西安', latitude: 34.34, longitude: 108.94 },
    { name: '苏州', latitude: 31.30, longitude: 120.60 },
    { name: '长沙', latitude: 28.20, longitude: 112.97 },
    { name: '郑州', latitude: 34.76, longitude: 113.65 },
    { name: '青岛', latitude: 36.06, longitude: 120.38 },
    { name: '大连', latitude: 38.91, longitude: 121.60 },
    { name: '厦门', latitude: 24.48, longitude: 118.08 },
    { name: '福州', latitude: 26.06, longitude: 119.31 },
    { name: '泉州', latitude: 24.91, longitude: 118.59 },
    { name: '漳州', latitude: 24.51, longitude: 117.66 },
    { name: '莆田', latitude: 25.44, longitude: 119.01 },
    { name: '昆明', latitude: 25.04, longitude: 102.72 },
    { name: '贵阳', latitude: 26.58, longitude: 106.72 },
    { name: '南宁', latitude: 22.82, longitude: 108.32 },
    { name: '海口', latitude: 20.03, longitude: 110.35 },
    { name: '三亚', latitude: 18.25, longitude: 109.51 },
    { name: '合肥', latitude: 31.86, longitude: 117.28 },
    { name: '济南', latitude: 36.67, longitude: 117.00 },
    { name: '烟台', latitude: 37.48, longitude: 121.44 },
    { name: '潍坊', latitude: 36.71, longitude: 119.10 },
    { name: '临沂', latitude: 35.06, longitude: 118.34 },
    { name: '淄博', latitude: 36.79, longitude: 118.06 },
    { name: '威海', latitude: 37.51, longitude: 122.11 },
    { name: '南昌', latitude: 28.68, longitude: 115.85 },
    { name: '赣州', latitude: 25.85, longitude: 114.93 },
    { name: '九江', latitude: 29.70, longitude: 116.00 },
    { name: '上饶', latitude: 28.45, longitude: 117.94 },
    { name: '宜春', latitude: 27.83, longitude: 114.40 },
    { name: '宁波', latitude: 29.88, longitude: 121.55 },
    { name: '温州', latitude: 28.00, longitude: 120.67 },
    { name: '绍兴', latitude: 30.00, longitude: 120.58 },
    { name: '嘉兴', latitude: 30.75, longitude: 120.75 },
    { name: '金华', latitude: 29.11, longitude: 119.64 },
    { name: '台州', latitude: 28.66, longitude: 121.42 },
    { name: '常州', latitude: 31.77, longitude: 119.95 },
    { name: '无锡', latitude: 31.57, longitude: 120.29 },
    { name: '徐州', latitude: 34.20, longitude: 117.28 },
    { name: '南通', latitude: 32.03, longitude: 120.87 },
    { name: '扬州', latitude: 32.40, longitude: 119.44 },
    { name: '盐城', latitude: 33.36, longitude: 120.16 },
    { name: '沈阳', latitude: 41.79, longitude: 123.43 },
    { name: '哈尔滨', latitude: 45.75, longitude: 126.65 },
    { name: '长春', latitude: 43.88, longitude: 125.32 },
    { name: '石家庄', latitude: 38.04, longitude: 114.48 },
    { name: '唐山', latitude: 39.64, longitude: 118.18 },
    { name: '保定', latitude: 38.87, longitude: 115.46 },
    { name: '廊坊', latitude: 39.52, longitude: 116.71 },
    { name: '秦皇岛', latitude: 39.94, longitude: 119.59 },
    { name: '太原', latitude: 37.87, longitude: 112.56 },
    { name: '大同', latitude: 40.09, longitude: 113.29 },
    { name: '兰州', latitude: 36.06, longitude: 103.84 },
    { name: '西宁', latitude: 36.63, longitude: 101.76 },
    { name: '银川', latitude: 38.47, longitude: 106.27 },
    { name: '乌鲁木齐', latitude: 43.80, longitude: 87.60 },
    { name: '呼和浩特', latitude: 40.81, longitude: 111.65 },
    { name: '包头', latitude: 40.65, longitude: 109.84 },
    { name: '拉萨', latitude: 29.65, longitude: 91.10 },
    { name: '洛阳', latitude: 34.67, longitude: 112.44 },
    { name: '开封', latitude: 34.80, longitude: 114.31 },
    { name: '新乡', latitude: 35.30, longitude: 113.93 },
    { name: '襄阳', latitude: 32.04, longitude: 112.14 },
    { name: '宜昌', latitude: 30.71, longitude: 111.28 },
    { name: '株洲', latitude: 27.83, longitude: 113.15 },
    { name: '湘潭', latitude: 27.85, longitude: 112.90 },
    { name: '衡阳', latitude: 26.89, longitude: 112.62 },
    { name: '岳阳', latitude: 29.37, longitude: 113.09 },
    { name: '桂林', latitude: 25.28, longitude: 110.30 },
    { name: '柳州', latitude: 24.32, longitude: 109.41 },
    { name: '遵义', latitude: 27.69, longitude: 106.91 },
    { name: '绵阳', latitude: 31.47, longitude: 104.68 },
    { name: '宜宾', latitude: 28.76, longitude: 104.64 },
    { name: '泸州', latitude: 28.89, longitude: 105.43 },
    { name: '南充', latitude: 30.80, longitude: 106.08 },
    { name: '达州', latitude: 31.21, longitude: 107.46 },
    { name: '大理', latitude: 25.58, longitude: 100.21 },
    { name: '丽江', latitude: 26.87, longitude: 100.22 },
    { name: '中国香港', latitude: 22.32, longitude: 114.17 },
    { name: '中国澳门', latitude: 22.20, longitude: 113.55 },
    { name: '中国台湾·台北', latitude: 25.03, longitude: 121.57 }
];

/** 在内置城市里做名称匹配（离线可用，搜索时优先展示） */
function findCommonCities(q) {
    var key = (q || '').trim();
    if (!key) return [];
    var hit = [];
    for (var i = 0; i < COMMON_CITIES.length; i++) {
        if (COMMON_CITIES[i].name.indexOf(key) >= 0) {
            hit.push({
                name: COMMON_CITIES[i].name,
                region: '',
                latitude: COMMON_CITIES[i].latitude,
                longitude: COMMON_CITIES[i].longitude
            });
            if (hit.length >= 8) break;
        }
    }
    return hit;
}

// ============================================================
// 地名的规范写法（中国香港 / 中国澳门 / 中国台湾）
// ============================================================

var TW_CITY_TOKENS = ['台北', '新北', '桃园', '台中', '台南', '高雄', '基隆', '新竹', '嘉义'];

function normalizeRegionName(n) {
    if (!n || typeof n !== 'string') return n || '';
    var name = n.trim();
    if (name.indexOf('中国') === 0) return name;
    if (name.indexOf('香港') >= 0) return '中国香港';
    if (name.indexOf('澳门') >= 0) return '中国澳门';
    if (name.indexOf('台湾') >= 0) return '中国台湾';
    for (var i = 0; i < TW_CITY_TOKENS.length; i++) {
        if (name.indexOf(TW_CITY_TOKENS[i]) >= 0) return '中国台湾·' + name;
    }
    // 与内置城市列表保持一致：去掉「汕头市」这类后缀
    if (name.length > 2 && name.charAt(name.length - 1) === '市') {
        name = name.slice(0, -1);
    }
    return name;
}

// ============================================================
// 读写
// ============================================================

function loadWeatherLocation() {
    try {
        var raw = localStorage.getItem(WEATHER_LOC_KEY);
        if (!raw) return null;
        var loc = JSON.parse(raw);
        if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
        if (typeof loc.name !== 'string' || !loc.name) return null;
        if (loc.mode !== 'auto' && loc.mode !== 'manual') loc.mode = 'manual';
        return loc;
    } catch (e) {
        return null;
    }
}

function saveWeatherLocation(loc) {
    try {
        localStorage.setItem(WEATHER_LOC_KEY, JSON.stringify(loc));
        return true;
    } catch (e) {
        return false;
    }
}

/** 当前生效的地点（供 main.js 取坐标）。永不返回 null。 */
function getWeatherLocation() {
    var loc = loadWeatherLocation();
    if (loc) return loc;
    return { mode: 'manual', name: DEFAULT_LOCATION.name, latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude };
}

function clearWeatherCache() {
    try { localStorage.removeItem('weatherCache'); } catch (e) { /* 忽略 */ }
}

/** 天气标题上的城市名 */
function renderWeatherLocName() {
    var el = document.getElementById('weatherLocName');
    if (!el) return;
    el.textContent = getWeatherLocation().name;
}

// ============================================================
// 定位
// ============================================================

/** 浏览器是否具备定位条件（需 HTTPS 或 localhost；file:// 下被浏览器禁用） */
function geoAvailable() {
    if (!navigator.geolocation) return false;
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
    return true;
}

/** 只查询权限状态，不触发授权弹窗 */
function checkGeoPermission(cb) {
    if (!navigator.permissions || !navigator.permissions.query) return cb('unknown');
    try {
        navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
            cb(st && st.state ? st.state : 'unknown');
        }).catch(function () { cb('unknown'); });
    } catch (e) {
        cb('unknown');
    }
}

/** 坐标 → 城市名（第三方免费反查，失败时用「当前位置」兜底，不影响天气显示） */
function reverseGeocode(lat, lon) {
    return new Promise(function (resolve, reject) {
        var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat +
            '&longitude=' + lon + '&localityLanguage=zh';
        var controller = new AbortController();
        var tid = setTimeout(function () { controller.abort(); }, 6000);
        fetch(url, { signal: controller.signal })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                clearTimeout(tid);
                var name = (d && (d.city || d.locality || d.principalSubdivision)) || '';
                if (!name) return reject(new Error('无城市名'));
                resolve(normalizeRegionName(name));
            })
            .catch(function (e) { clearTimeout(tid); reject(e); });
    });
}

/**
 * 回退到默认城市并加载天气（不打分弹窗，供说明卡「跳过」时使用）
 */
function useDefaultLocation() {
    if (!loadWeatherLocation()) {
        saveWeatherLocation({
            mode: DEFAULT_LOCATION.mode,
            name: DEFAULT_LOCATION.name,
            latitude: DEFAULT_LOCATION.latitude,
            longitude: DEFAULT_LOCATION.longitude,
            updatedAt: Date.now()
        });
    }
    renderWeatherLocName();
    fetchWeather(true);
}

/**
 * 请求定位
 * @param {boolean} silent 静默模式（已授权时后台更新坐标，失败不打扰用户）
 * @param {Function} [done] 回调 (ok, loc)
 */
function requestGeolocation(silent, done) {
    var finished = false;
    function finish(ok, loc) {
        if (finished) return;
        finished = true;
        if (typeof done === 'function') done(ok, loc);
    }

    function fallbackToDefault(skipToast) {
        if (silent) return;                     // 静默失败：继续用现有地点
        if (!loadWeatherLocation()) {
            var d = { mode: DEFAULT_LOCATION.mode, name: DEFAULT_LOCATION.name, latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude, updatedAt: Date.now() };
            saveWeatherLocation(d);
        }
        renderWeatherLocName();
        // skipToast：调用方已给出更具体的提示（如「不支持定位」），别把它盖掉
        if (!skipToast) showToast('📍 未能定位，请点击城市名手动选择');
        fetchWeather(true);
    }

    if (!geoAvailable()) {
        if (!silent) showToast('📍 当前打开方式不支持定位（需 HTTPS），已用默认城市');
        fallbackToDefault(true);
        finish(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = Math.round(pos.coords.latitude * 100) / 100;
        var lon = Math.round(pos.coords.longitude * 100) / 100;
        var apply = function (name) {
            var loc = { mode: 'auto', name: name, latitude: lat, longitude: lon, updatedAt: Date.now() };
            var changed = !isSameLocation(getWeatherLocation(), loc);
            saveWeatherLocation(loc);
            renderWeatherLocName();
            if (changed || !silent) {
                clearWeatherCache();
                fetchWeather(true);
            }
            if (!silent) showToast('📍 已定位到 ' + name);
            finish(true, loc);
        };
        reverseGeocode(lat, lon).then(function (name) {
            apply(name);
        }, function () {
            apply('当前位置');   // 反查失败也照常显示天气
        });
    }, function () {
        if (!silent) showToast('📍 定位被拒绝或失败，已回退到默认城市');
        fallbackToDefault();
        finish(false);
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 });
}

function isSameLocation(a, b) {
    return !!a && !!b
        && Math.abs(a.latitude - b.latitude) < 1e-6
        && Math.abs(a.longitude - b.longitude) < 1e-6;
}

// ============================================================
// 城市搜索（open-meteo 免费地理编码，无需 key）
// ============================================================

function searchCities(q) {
    return new Promise(function (resolve, reject) {
        var key = (q || '').trim();
        if (!key) return resolve([]);
        var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(key) +
            '&count=8&language=zh&format=json';
        var controller = new AbortController();
        var tid = setTimeout(function () { controller.abort(); }, 6000);
        fetch(url, { signal: controller.signal })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                clearTimeout(tid);
                var list = (d && d.results) || [];
                // 按人口降序，避免把同名小地名排在省会前面（如「洛阳 福建省」）
                list.sort(function (a, b) { return (b.population || 0) - (a.population || 0); });
                resolve(list.map(function (it) {
                    var name = normalizeRegionName(it.name || '');
                    var parts = [];
                    if (it.admin1 && it.admin1 !== it.name) parts.push(it.admin1);
                    if (it.country && it.country !== it.name && parts.indexOf(it.country) < 0) parts.push(it.country);
                    return {
                        name: name,
                        region: parts.join(' · '),
                        latitude: Math.round(it.latitude * 100) / 100,
                        longitude: Math.round(it.longitude * 100) / 100
                    };
                }));
            })
            .catch(function (e) { clearTimeout(tid); reject(e); });
    });
}

// ============================================================
// 首次访问的「定位说明」卡
// ------------------------------------------------------------
// 为什么需要它：浏览器原生的权限弹窗由浏览器渲染，网页**无法修改**它的
// 文案（通常只有一句「xxx 想要获取您的位置」+ 站点域名）。所以我们在
// 请求定位之前先展示自己的说明卡，讲清「仅用于获取天气地点」，用户点了
// 「允许定位」之后，浏览器才会弹它自己的那个窗。
// ============================================================

function closeGeoIntro() {
    var el = document.getElementById('geoIntro');
    if (el) el.remove();
}

function geoIntroItem(icon, text) {
    var row = document.createElement('div');
    row.className = 'geo-intro-item';
    var i = document.createElement('span');
    i.className = 'geo-intro-icon';
    i.textContent = icon;
    var t = document.createElement('span');
    t.className = 'geo-intro-text';
    t.textContent = text;                 // textContent 防注入
    row.appendChild(i);
    row.appendChild(t);
    return row;
}

/**
 * 展示定位说明卡
 * @param {string} permState 'prompt' | 'denied' | 'unknown' | 'granted'
 */
function showGeoIntro(permState) {
    closeGeoIntro();
    var denied = permState === 'denied';

    var overlay = document.createElement('div');
    overlay.id = 'geoIntro';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box geo-intro-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '📍 开启天气定位';
    box.appendChild(title);

    var desc = document.createElement('div');
    desc.className = 'geo-intro-desc';
    desc.textContent = '为了显示你所在城市的天气，需要获取大致位置（城市级即可）。';
    box.appendChild(desc);

    var list = document.createElement('div');
    list.className = 'geo-intro-list';
    list.appendChild(geoIntroItem('🔒', '仅用于获取天气所属城市，不做其它用途'));
    list.appendChild(geoIntroItem('💾', '坐标只保存在本机浏览器，不会上传（本项目没有服务器）'));
    list.appendChild(geoIntroItem('🌐', '天气数据来自第三方 open-meteo，请求时会带上该坐标'));
    box.appendChild(list);

    var note = document.createElement('div');
    note.className = 'geo-intro-note';
    note.textContent = denied
        ? '浏览器此前已拒绝本站定位，需点击地址栏的锁形图标重新开启；也可以直接手动选城市。'
        : '点「允许定位」后，浏览器会弹出它自己的权限请求（那个窗的文字本站改不了），请选「允许」。';
    box.appendChild(note);

    var actions = document.createElement('div');
    actions.className = 'modal-btn-group geo-intro-actions';

    var allowBtn = document.createElement('button');
    allowBtn.type = 'button';
    allowBtn.className = 'modal-btn modal-btn-primary';
    allowBtn.id = 'geoIntroAllow';
    allowBtn.textContent = denied ? '浏览器已拒绝定位' : '📡 允许定位（仅用于天气）';
    allowBtn.disabled = denied;
    allowBtn.onclick = function () {
        closeGeoIntro();
        var el = document.getElementById('weatherLocName');
        if (el) el.textContent = '定位中…';
        requestGeolocation(false);
    };
    actions.appendChild(allowBtn);

    var manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'modal-btn modal-btn-cancel';
    manualBtn.id = 'geoIntroManual';
    manualBtn.textContent = '手动选择城市';
    manualBtn.onclick = function () {
        closeGeoIntro();
        useDefaultLocation();      // 先落地默认城市，保证天气能显示
        openCityPicker();
    };
    actions.appendChild(manualBtn);

    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
}

// ============================================================
// 切换地点
// ============================================================

function applyWeatherLocation(loc, toastText) {
    loc.updatedAt = Date.now();
    saveWeatherLocation(loc);
    renderWeatherLocName();
    clearWeatherCache();     // 换地点必须清缓存，否则会显示上一个城市的天气
    fetchWeather(true);
    if (toastText) showToast(toastText);
}

// ============================================================
// 城市选择弹窗
// ============================================================

function closeCityPicker() {
    var el = document.getElementById('cityPicker');
    if (el) el.remove();
}

function cityMsgRow(text) {
    var d = document.createElement('div');
    d.className = 'city-msg';
    d.textContent = text;
    return d;
}

function buildCityRow(c) {
    var row = document.createElement('div');
    row.className = 'city-row';

    var main = document.createElement('div');
    main.style.flex = '1';
    main.style.minWidth = '0';

    var n = document.createElement('div');
    n.className = 'city-row-name';
    n.textContent = c.name;
    main.appendChild(n);

    if (c.region) {
        var r = document.createElement('div');
        r.className = 'city-row-region';
        r.textContent = c.region;
        main.appendChild(r);
    }
    row.appendChild(main);

    row.onclick = function () {
        applyWeatherLocation({ mode: 'manual', name: c.name, latitude: c.latitude, longitude: c.longitude },
            '✅ 已切换到 ' + c.name);
        closeCityPicker();
    };
    return row;
}

function buildCityChip(c, activeName) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'city-chip' + (c.name === activeName ? ' active' : '');
    b.textContent = c.name;
    b.onclick = function () {
        applyWeatherLocation({ mode: 'manual', name: c.name, latitude: c.latitude, longitude: c.longitude },
            '✅ 已切换到 ' + c.name);
        closeCityPicker();
    };
    return b;
}

function openCityPicker() {
    closeCityPicker();

    var overlay = document.createElement('div');
    overlay.id = 'cityPicker';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box city-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '📌 选择城市';
    box.appendChild(title);

    // 使用当前位置
    var geoBtn = document.createElement('button');
    geoBtn.type = 'button';
    geoBtn.className = 'city-geo-btn';
    var usable = geoAvailable();
    geoBtn.textContent = usable ? '📡 使用我的当前位置' : '📡 当前打开方式不支持定位';
    geoBtn.disabled = !usable;
    geoBtn.onclick = function () {
        geoBtn.disabled = true;
        geoBtn.textContent = '📡 定位中…（请在浏览器提示中允许）';
        requestGeolocation(false, function (ok) {
            if (ok) { closeCityPicker(); return; }
            geoBtn.disabled = false;
            geoBtn.textContent = '📡 重新定位';
            var tip = document.getElementById('cityTip');
            if (tip) tip.textContent = '⚠️ 定位失败或未授权，请在下方搜索或选择城市。';
        });
    };
    box.appendChild(geoBtn);

    var cur = getWeatherLocation();
    var curTip = document.createElement('div');
    curTip.className = 'city-cur';
    curTip.textContent = '当前：' + cur.name + (cur.mode === 'auto' ? '（自动定位）' : '（手动选择）');
    box.appendChild(curTip);

    // 搜索
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.id = 'citySearchInput';
    input.placeholder = '搜索城市，如：北京 / 上海 / 广州';
    input.maxLength = 20;
    box.appendChild(input);

    var resultBox = document.createElement('div');
    resultBox.id = 'cityResults';
    resultBox.className = 'city-results';
    box.appendChild(resultBox);

    var sub = document.createElement('div');
    sub.className = 'city-sub';
    sub.textContent = '常用城市';
    box.appendChild(sub);

    var commonBox = document.createElement('div');
    commonBox.className = 'city-common';
    for (var i = 0; i < COMMON_CITIES.length; i++) {
        commonBox.appendChild(buildCityChip(COMMON_CITIES[i], cur.name));
    }
    box.appendChild(commonBox);

    var tip = document.createElement('div');
    tip.id = 'cityTip';
    tip.className = 'city-tip';
    tip.textContent = '坐标仅保存在本机浏览器，不会上传到本项目（本项目没有服务器）；天气数据由第三方 open-meteo 提供。个别城市需用拼音搜索（如 shantou）。';
    box.appendChild(tip);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    function appendSub(text) {
        var s = document.createElement('div');
        s.className = 'city-sub';
        s.textContent = text;
        resultBox.appendChild(s);
    }

    function doSearch(q) {
        var key = (q || '').trim();
        resultBox.innerHTML = '';
        if (!key) return;

        // 1) 先给内置城市的匹配结果（离线可用，秒出）
        var local = findCommonCities(key);
        if (local.length) {
            appendSub('常用城市');
            for (var m = 0; m < local.length; m++) resultBox.appendChild(buildCityRow(local[m]));
        }

        // 2) 再联网补充其它城市
        var loading = cityMsgRow('⏳ 联网搜索更多…');
        resultBox.appendChild(loading);

        searchCities(key).then(function (list) {
            if (loading.parentNode) loading.remove();

            var localNames = {};
            for (var a = 0; a < local.length; a++) localNames[local[a].name] = 1;
            var rest = list.filter(function (c) { return !localNames[c.name]; });

            if (!rest.length) {
                if (!local.length) {
                    resultBox.appendChild(cityMsgRow('未找到「' + key + '」，可试试拼音（如 shantou / chaozhou）'));
                }
                return;
            }
            appendSub('搜索结果');
            for (var k = 0; k < rest.length; k++) resultBox.appendChild(buildCityRow(rest[k]));
        }, function () {
            if (loading.parentNode) loading.remove();
            if (!local.length) {
                resultBox.appendChild(cityMsgRow('⚠️ 联网搜索失败，可从下方常用城市中选择'));
            }
        });
    }

    var timer = null;
    input.addEventListener('input', function () {
        clearTimeout(timer);
        var q = input.value;
        if (!q.trim()) { resultBox.innerHTML = ''; return; }
        timer = setTimeout(function () { doSearch(q); }, 350);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { clearTimeout(timer); doSearch(input.value); }
    });

    setTimeout(function () { input.focus(); }, 30);
}

// ============================================================
// 初始化
// ============================================================

function initWeatherLocation() {
    var locBtn = document.getElementById('weatherLocBtn');
    if (locBtn) locBtn.addEventListener('click', openCityPicker);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        // 说明卡开着时，Esc = 不做定位，直接用默认城市（避免卡在「定位中…」）
        if (document.getElementById('geoIntro')) {
            closeGeoIntro();
            useDefaultLocation();
            showToast('📍 已使用默认城市，点城市名可切换');
            return;
        }
        closeCityPicker();
    });

    var saved = loadWeatherLocation();

    if (saved) {
        // 已有地点：先按它显示天气
        renderWeatherLocName();
        loadWeather();
        // 之前是自动定位，且权限仍在 → 静默更新坐标（换城市/换网络能跟上）
        if (saved.mode === 'auto') {
            checkGeoPermission(function (state) {
                if (state === 'granted') requestGeolocation(true);
            });
        }
        return;
    }

    // 首次访问：先查权限状态，再决定怎么问
    checkGeoPermission(function (state) {
        if (state === 'granted') {
            // 已授权 → 浏览器不会再弹窗，直接拿坐标
            var el = document.getElementById('weatherLocName');
            if (el) el.textContent = '定位中…';
            requestGeolocation(false);
            return;
        }
        // 未决定 / 已被拒绝 → 先展示我们自己的说明卡（含「仅用于天气」说明）
        showGeoIntro(state);
    });
}

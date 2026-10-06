/**
 * ============================================================
 * analytics.js - 使用统计（两级，分开控制）
 * ------------------------------------------------------------
 * 设计原则：本应用是「隐私优先」的本地工具，所以统计也按这个原则做。
 *
 * 第一级 · 本地使用统计（默认开，永不出设备）
 *   只记录「事件名称 + 次数 + 使用天数」，**不记录任何内容**：
 *   不记待办写了什么、不记哪天排了什么班、不记城市、不记坐标、不记邮箱。
 *   数据存在 localStorage 'analyticsLocal'，可在关于页一键清除。
 *
 * 第二级 · 匿名统计上报（默认关，且当前未配置端点）
 *   只有同时满足两个条件才会发出请求：
 *     ① 运营者在下方 ANALYTICS_ENDPOINT 填了上报地址；
 *     ② 用户自己打开了开关。
 *   任一不满足 → 不做任何网络请求（不是"发了但没人收"，是根本不发）。
 *   我们不做"默认开启、事后告知"那套。
 *
 * 数据：localStorage 'analyticsLocal'（统计）、'analyticsOptin'（上报开关）
 * ============================================================
 */

/** 本地统计存储键 */
var ANALYTICS_LOCAL_KEY = 'analyticsLocal';
/** 上报开关存储键 */
var ANALYTICS_OPTIN_KEY = 'analyticsOptin';

/**
 * 匿名统计上报地址。
 * 留空 = 未配置 = 永不上报（当前即为此状态）。
 * 若将来要接入统计服务，把接收端点填在这里即可，前端无需改动其它代码。
 */
var ANALYTICS_ENDPOINT = '';

/** 本地最多保留多少个事件类型（防止无限增长） */
var ANALYTICS_MAX_EVENT_KINDS = 40;

// ============================================================
// 读写
// ============================================================

function analyticsEmpty() {
    return {
        v: 1,
        firstSeen: 0,
        lastSeen: 0,
        openCount: 0,
        dayCount: 0,
        lastDay: '',
        events: {}
    };
}

function analyticsLoad() {
    try {
        var raw = localStorage.getItem(ANALYTICS_LOCAL_KEY);
        if (!raw) return analyticsEmpty();
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return analyticsEmpty();
        var base = analyticsEmpty();
        base.firstSeen = typeof o.firstSeen === 'number' ? o.firstSeen : 0;
        base.lastSeen = typeof o.lastSeen === 'number' ? o.lastSeen : 0;
        base.openCount = typeof o.openCount === 'number' ? o.openCount : 0;
        base.dayCount = typeof o.dayCount === 'number' ? o.dayCount : 0;
        base.lastDay = typeof o.lastDay === 'string' ? o.lastDay : '';
        if (o.events && typeof o.events === 'object' && !Array.isArray(o.events)) {
            base.events = o.events;
        }
        return base;
    } catch (e) {
        return analyticsEmpty();
    }
}

function analyticsSave(data) {
    try {
        localStorage.setItem(ANALYTICS_LOCAL_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        return false;
    }
}

/** 今天的日期键（本地时区） */
function analyticsDayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// ============================================================
// 记录
// ============================================================

/**
 * 记录一次事件（只累加计数，不记录任何内容）
 * @param {string} name 事件名，建议用固定短标识，如 'mark_schedule'
 */
function analyticsTrack(name) {
    if (!name || typeof name !== 'string') return;
    var data = analyticsLoad();
    var kinds = Object.keys(data.events);
    if (!Object.prototype.hasOwnProperty.call(data.events, name) && kinds.length >= ANALYTICS_MAX_EVENT_KINDS) {
        return;   // 事件类型已达上限，丢弃新类型，避免无限增长
    }
    data.events[name] = (parseInt(data.events[name], 10) || 0) + 1;
    data.lastSeen = Date.now();
    analyticsSave(data);
}

/** 应用启动时调用一次：累计打开次数与使用天数 */
function analyticsMarkOpen() {
    var data = analyticsLoad();
    var today = analyticsDayKey();
    if (!data.firstSeen) data.firstSeen = Date.now();
    data.openCount++;
    if (data.lastDay !== today) {
        data.dayCount++;
        data.lastDay = today;
    }
    data.lastSeen = Date.now();
    analyticsSave(data);
}

// ============================================================
// 上报开关
// ============================================================

function analyticsOptin() {
    try { return localStorage.getItem(ANALYTICS_OPTIN_KEY) === '1'; } catch (e) { return false; }
}

function analyticsSetOptin(on) {
    try {
        if (on) localStorage.setItem(ANALYTICS_OPTIN_KEY, '1');
        else localStorage.removeItem(ANALYTICS_OPTIN_KEY);
    } catch (e) { /* 忽略 */ }
    if (on) analyticsFlush();
}

/** 上报端点是否已由运营者配置 */
function analyticsEndpointReady() {
    return typeof ANALYTICS_ENDPOINT === 'string' && ANALYTICS_ENDPOINT.length > 0;
}

/** 当前是否真的会发送数据（两个条件都满足） */
function analyticsActive() {
    return analyticsEndpointReady() && analyticsOptin();
}

/**
 * 上报一次聚合结果。
 * 只有「已配置端点」且「用户已同意」才会真正发出；否则直接返回，不发任何请求。
 * 上报内容仅为计数，不含任何用户内容。
 */
function analyticsFlush() {
    if (!analyticsActive()) return Promise.resolve(false);

    var data = analyticsLoad();
    var body = JSON.stringify({
        v: 1,
        firstSeen: data.firstSeen,
        dayCount: data.dayCount,
        openCount: data.openCount,
        events: data.events
    });

    try {
        return fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            keepalive: true
        }).then(function () { return true; }, function () { return false; });
    } catch (e) {
        return Promise.resolve(false);
    }
}

// ============================================================
// 汇总与清除
// ============================================================

/** 事件名 → 中文标签（用于关于页展示） */
var ANALYTICS_LABELS = {
    app_open: '打开应用',
    mark_schedule: '标记排班',
    clear_month: '清空某月',
    apply_template: '套用模板',
    copy_prev_month: '复制上月',
    todo_add: '添加待办',
    countdown_add: '添加倒计时',
    plan_apply: '应用排班方案',
    backup_local: '本地备份',
    backup_cloud: '云备份',
    restore_cloud: '云端恢复',
    theme_set: '切换主题',
    weather_location: '切换城市'
};

/**
 * 汇总，供关于页展示
 * @returns {{firstSeen:number, lastSeen:number, openCount:number, dayCount:number,
 *            events:Array<{key:string,label:string,count:number}>, total:number}}
 */
function analyticsSummary() {
    var data = analyticsLoad();
    var list = Object.keys(data.events).map(function (k) {
        return { key: k, label: ANALYTICS_LABELS[k] || k, count: parseInt(data.events[k], 10) || 0 };
    });
    list.sort(function (a, b) { return b.count - a.count; });
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].count;
    return {
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        openCount: data.openCount,
        dayCount: data.dayCount,
        events: list,
        total: total
    };
}

/** 清除本地统计（不影响你的排班等待办数据） */
function analyticsClear() {
    try { localStorage.removeItem(ANALYTICS_LOCAL_KEY); } catch (e) { /* 忽略 */ }
}

// ============================================================
// 初始化（在应用主页调用）
// ============================================================

function initAnalytics() {
    analyticsMarkOpen();
    // 若用户此前已同意且端点已配置，顺带上报一次
    if (analyticsActive()) analyticsFlush();
}

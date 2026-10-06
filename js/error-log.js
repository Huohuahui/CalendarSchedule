/**
 * ============================================================
 * error-log.js - 本地错误日志（替代远程错误监控）
 * ------------------------------------------------------------
 * 为什么不做远程错误监控：本项目主打「纯本地、隐私优先」。
 * 把报错自动上传给第三方，一是要引入外部服务和 SDK，二是报错内容
 * 有时会夹带上下文数据 —— 那与本项目的定位自相矛盾。
 *
 * 所以改成「本地错误日志」：
 *   · 页面出 JS 报错时，把「报错信息 + 位置 + 堆栈」记进本机 localStorage
 *   · 只保留最近 10 条不同的报错，重复的只累加次数
 *   · 在「关于页」可以查看、一键复制成错误报告、或清除
 *   · 复制出来的报告由**你自己**决定要不要贴到 Issue 里
 *
 * 明确边界：
 *   · 只记录报错本身，不记录你的排班、待办、倒计时内容
 *   · 不自动上传，任何情况下都不会离开这台设备
 *   · 单条信息与堆栈都做长度截断，避免把整页数据写进来
 *
 * 数据：localStorage 'errorLog'
 *   { entries: [ { t, m, s, k, n } ] }   t=时间戳 m=信息 s=位置 k=堆栈 n=次数
 * 依赖：无（必须最先加载，才能捕获后续脚本的报错）
 * ============================================================
 */

var ERROR_LOG_KEY = 'errorLog';
/** 最多保留多少条「不同的」报错 */
var ERROR_LOG_MAX = 10;
/** 单条信息 / 位置 / 堆栈的最大长度 */
var ERROR_LOG_MSG_MAX = 200;
var ERROR_LOG_SRC_MAX = 160;
var ERROR_LOG_STACK_MAX = 600;

var errorLogBound = false;

// ============================================================
// 读写
// ============================================================

function errorLogLoad() {
    try {
        var raw = localStorage.getItem(ERROR_LOG_KEY);
        if (!raw) return { entries: [] };
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || !Array.isArray(o.entries)) return { entries: [] };
        return o;
    } catch (e) {
        return { entries: [] };
    }
}

function errorLogSave(data) {
    try {
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        return false;   // 隐私模式 / 配额满：静默放弃记录，绝不影响主功能
    }
}

function errorLogTrim(v, max) {
    var s = (v === undefined || v === null) ? '' : String(v);
    if (s.length > max) s = s.slice(0, max) + '…';
    return s;
}

// ============================================================
// 记录
// ============================================================

/**
 * 记录一条报错。相同「信息 + 位置」视为同一条，只累加次数并更新时间。
 * @param {string} message 报错信息
 * @param {string} source  位置，如 'js/main.js:120:15'
 * @param {string} [stack] 堆栈
 */
function errorLogRecord(message, source, stack) {
    var msg = errorLogTrim(message, ERROR_LOG_MSG_MAX);
    var src = errorLogTrim(source, ERROR_LOG_SRC_MAX);
    if (!msg && !src) return;

    var data = errorLogLoad();
    var now = Date.now();
    var found = null;

    for (var i = 0; i < data.entries.length; i++) {
        if (data.entries[i].m === msg && data.entries[i].s === src) { found = data.entries[i]; break; }
    }

    if (found) {
        found.n = (parseInt(found.n, 10) || 1) + 1;
        found.t = now;
        if (stack) found.k = errorLogTrim(stack, ERROR_LOG_STACK_MAX);
        // 提到最前
        data.entries = data.entries.filter(function (e) { return e !== found; });
        data.entries.unshift(found);
    } else {
        data.entries.unshift({
            t: now,
            m: msg,
            s: src,
            k: errorLogTrim(stack, ERROR_LOG_STACK_MAX),
            n: 1
        });
        if (data.entries.length > ERROR_LOG_MAX) data.entries.length = ERROR_LOG_MAX;
    }

    errorLogSave(data);
}

// ============================================================
// 汇总 / 导出 / 清除
// ============================================================

/**
 * @returns {{count:number, total:number, latestAt:number, entries:Array}}
 *          count = 不同报错条数，total = 含重复的累计次数
 */
function errorLogSummary() {
    var data = errorLogLoad();
    var total = 0;
    var latest = 0;
    for (var i = 0; i < data.entries.length; i++) {
        total += parseInt(data.entries[i].n, 10) || 1;
        if ((data.entries[i].t || 0) > latest) latest = data.entries[i].t || 0;
    }
    return {
        count: data.entries.length,
        total: total,
        latestAt: latest,
        entries: data.entries
    };
}

function errorLogFormatTime(ts) {
    if (!ts) return '—';
    return formatDateTime(ts);
}

/**
 * 生成一段纯文本错误报告，供用户自行决定是否贴到 Issue。
 * 其中包含浏览器标识（你复制前能看见，粘贴前可自行删除）。
 */
function errorLogAsText() {
    var s = errorLogSummary();
    var lines = [];
    lines.push('【排班日历 · 错误报告】');
    lines.push('导出时间：' + errorLogFormatTime(Date.now()));
    lines.push('浏览器：' + (navigator.userAgent || '未知'));
    lines.push('报错条数：' + s.count + ' 条（累计 ' + s.total + ' 次）');
    lines.push('');
    lines.push('⚠️ 以下内容只包含报错信息，不含你的排班、待办或倒计时内容。');
    lines.push('⚠️ 上面那行浏览器标识你可以自行删除后再粘贴。');
    lines.push('');

    if (!s.entries.length) {
        lines.push('（暂无报错记录）');
        return lines.join('\n');
    }

    s.entries.forEach(function (e, i) {
        lines.push('—— ' + (i + 1) + '、最近发生：' + errorLogFormatTime(e.t) +
            (e.n > 1 ? '（共 ' + e.n + ' 次）' : ''));
        lines.push('信息：' + (e.m || '(无)'));
        lines.push('位置：' + (e.s || '(未知)'));
        if (e.k) lines.push('堆栈：' + e.k);
        lines.push('');
    });
    return lines.join('\n');
}

function errorLogClear() {
    try { localStorage.removeItem(ERROR_LOG_KEY); } catch (e) { /* 忽略 */ }
}

// ============================================================
// 安装全局捕获
// ============================================================

/**
 * 安装全局报错捕获。必须在其它脚本之前调用，才能捕获它们的启动错误。
 */
function initErrorLog() {
    if (errorLogBound) return;
    if (typeof window === 'undefined' || !window.addEventListener) return;
    errorLogBound = true;

    // 脚本运行错误（资源加载失败没有 message，这里跳过）
    window.addEventListener('error', function (ev) {
        try {
            if (!ev || !ev.message) return;
            var src = (ev.filename || '') + (ev.lineno ? ':' + ev.lineno + ':' + (ev.colno || 0) : '');
            errorLogRecord(ev.message, src, ev.error && ev.error.stack);
        } catch (e) { /* 记录失败不能影响主流程 */ }
    });

    window.addEventListener('unhandledrejection', function (ev) {
        try {
            var r = ev && ev.reason;
            var msg = (r && (r.message || r)) ? String(r.message || r) : '未处理的 Promise 拒绝';
            errorLogRecord('未处理的 Promise 拒绝：' + msg, 'promise', r && r.stack);
        } catch (e) { /* 忽略 */ }
    });
}

// 本文件被加载即安装（要抢在其它脚本之前）
initErrorLog();

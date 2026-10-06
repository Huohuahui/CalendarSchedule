/**
 * ============================================================
 * about.js - 关于页交互
 * 作用：渲染本地使用统计与本地错误日志、绑定匿名上报开关、复制/清除
 * 依赖：analytics.js、error-log.js
 * ============================================================
 */

/** 时间戳 → 'YYYY-MM-DD' */
function aboutDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

/** 一格「标签 + 数值」（统计与错误区共用） */
function aboutStatLine(k, v) {
    var d = document.createElement('div');
    d.className = 'stat-line';
    var kk = document.createElement('span');
    kk.className = 'stat-k';
    kk.textContent = k;
    var vv = document.createElement('span');
    vv.className = 'stat-v';
    vv.textContent = v;
    d.appendChild(kk);
    d.appendChild(vv);
    return d;
}

// ============================================================
// 使用统计
// ============================================================

function aboutRenderStats() {
    var meta = document.getElementById('statsMeta');
    var body = document.getElementById('statsBody');
    if (!meta || !body) return;

    var s = analyticsSummary();

    meta.innerHTML = '';
    meta.appendChild(aboutStatLine('首次使用', aboutDate(s.firstSeen)));
    meta.appendChild(aboutStatLine('累计使用天数', s.dayCount + ' 天'));
    meta.appendChild(aboutStatLine('累计打开次数', s.openCount + ' 次'));
    meta.appendChild(aboutStatLine('累计操作次数', s.total + ' 次'));

    body.innerHTML = '';
    if (!s.events.length) {
        var empty = document.createElement('div');
        empty.className = 'stat-empty';
        empty.textContent = '还没有记录到操作。用一用排班、待办，这里就会有数据。';
        body.appendChild(empty);
        return;
    }

    var max = s.events[0].count || 1;
    var table = document.createElement('div');
    table.className = 'stat-bars';

    s.events.forEach(function (e) {
        var row = document.createElement('div');
        row.className = 'stat-bar-row';

        var label = document.createElement('span');
        label.className = 'stat-bar-label';
        label.textContent = e.label;

        var track = document.createElement('span');
        track.className = 'stat-bar-track';
        var fill = document.createElement('span');
        fill.className = 'stat-bar-fill';
        fill.style.width = Math.max(6, Math.round((e.count / max) * 100)) + '%';
        track.appendChild(fill);

        var num = document.createElement('span');
        num.className = 'stat-bar-num';
        num.textContent = e.count + ' 次';

        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(num);
        table.appendChild(row);
    });

    body.appendChild(table);
}

// ============================================================
// 匿名上报开关
// ============================================================

function aboutRenderOptin() {
    var input = document.getElementById('optinToggle');
    var note = document.getElementById('optinNote');
    if (!input || !note) return;

    var ready = analyticsEndpointReady();
    input.checked = analyticsOptin();
    input.disabled = !ready;

    if (!ready) {
        note.textContent = '运营者尚未配置上报地址，因此当前不会发送任何数据（开关暂时不可用）。';
        note.className = 'optin-note muted';
    } else if (analyticsOptin()) {
        note.textContent = '已开启：会发送「事件名称 + 次数」，不含你的任何内容与身份信息。';
        note.className = 'optin-note on';
    } else {
        note.textContent = '未开启：统计只保存在你本机，不会发送给任何人。';
        note.className = 'optin-note';
    }
}

// ============================================================
// 最近错误（本地）
// ============================================================

function aboutRenderErrors() {
    var meta = document.getElementById('errorMeta');
    var body = document.getElementById('errorBody');
    if (!meta || !body || typeof errorLogSummary !== 'function') return;

    var s = errorLogSummary();

    meta.innerHTML = '';
    meta.appendChild(aboutStatLine('报错条数', s.count + ' 条'));
    meta.appendChild(aboutStatLine('累计发生', s.total + ' 次'));
    meta.appendChild(aboutStatLine('最近一次', errorLogFormatTime(s.latestAt)));

    body.innerHTML = '';
    if (!s.entries.length) {
        var empty = document.createElement('div');
        empty.className = 'err-empty';
        empty.textContent = '👍 没有记录到任何报错。';
        body.appendChild(empty);
        return;
    }

    s.entries.forEach(function (e) {
        var item = document.createElement('div');
        item.className = 'err-item';

        var msg = document.createElement('div');
        msg.className = 'err-msg';
        msg.textContent = e.m || '(无信息)';
        item.appendChild(msg);

        var metaLine = document.createElement('div');
        metaLine.className = 'err-meta';
        metaLine.textContent = errorLogFormatTime(e.t)
            + (e.n > 1 ? ' · 共 ' + e.n + ' 次' : '')
            + (e.s ? ' · ' + e.s : '');
        item.appendChild(metaLine);

        if (e.k) {
            var stack = document.createElement('div');
            stack.className = 'err-stack';
            stack.textContent = e.k;
            item.appendChild(stack);
        }

        body.appendChild(item);
    });
}

/** 剪贴板不可用时的兜底：把报告显示在文本框里让用户手动复制 */
function aboutShowErrorText(text) {
    var host = document.getElementById('errorFallback');
    if (!host) return;
    host.innerHTML = '';
    var hint = document.createElement('div');
    hint.className = 'err-empty';
    hint.textContent = '自动复制不可用，请手动全选下面的内容复制：';
    host.appendChild(hint);
    var ta = document.createElement('textarea');
    ta.className = 'err-textarea';
    ta.readOnly = true;
    ta.value = text;
    host.appendChild(ta);
    ta.focus();
    ta.select();
}

function aboutCopyReport() {
    var text = errorLogAsText();
    var note = document.getElementById('errorCopyNote');
    var host = document.getElementById('errorFallback');
    if (host) host.innerHTML = '';
    if (note) note.className = 'err-note';

    // 统一走 utils.js 的复制实现（含 execCommand 兜底，比只用 clipboard API 更稳）
    if (typeof copyTextToClipboard !== 'function') {
        aboutShowErrorText(text);
        return;
    }
    copyTextToClipboard(text).then(function (ok) {
        if (ok) {
            if (note) note.className = 'err-note show';
        } else {
            aboutShowErrorText(text);   // 自动复制不可用 → 让用户手动复制
        }
    });
}

// ============================================================
// 初始化
// ============================================================

function initAboutPage() {
    aboutRenderStats();
    aboutRenderOptin();
    aboutRenderErrors();

    var input = document.getElementById('optinToggle');
    if (input) {
        input.addEventListener('change', function () {
            analyticsSetOptin(input.checked);
            aboutRenderOptin();
        });
    }

    var statsClearBtn = document.getElementById('statsClearBtn');
    if (statsClearBtn) {
        statsClearBtn.addEventListener('click', function () {
            if (!confirm('清除本机使用统计？\n\n只会清掉这些计数，你的排班、待办、倒计时等数据不受影响。')) return;
            analyticsClear();
            aboutRenderStats();
        });
    }

    var errorCopyBtn = document.getElementById('errorCopyBtn');
    if (errorCopyBtn) errorCopyBtn.addEventListener('click', aboutCopyReport);

    var errorClearBtn = document.getElementById('errorClearBtn');
    if (errorClearBtn) {
        errorClearBtn.addEventListener('click', function () {
            if (!confirm('清除本机错误记录？')) return;
            errorLogClear();
            var host = document.getElementById('errorFallback');
            if (host) host.innerHTML = '';
            var note = document.getElementById('errorCopyNote');
            if (note) note.className = 'err-note';
            aboutRenderErrors();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutPage);
} else {
    initAboutPage();
}

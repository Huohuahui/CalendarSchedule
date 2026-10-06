/**
 * ============================================================
 * about.js - 关于页交互
 * 作用：渲染本地使用统计、绑定匿名上报开关、清除统计
 * 依赖：analytics.js（analyticsSummary / analyticsOptin / analyticsSetOptin /
 *                      analyticsClear / analyticsEndpointReady）
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

function aboutRenderStats() {
    var meta = document.getElementById('statsMeta');
    var body = document.getElementById('statsBody');
    if (!meta || !body) return;

    var s = analyticsSummary();

    meta.innerHTML = '';
    var rows = [
        ['首次使用', aboutDate(s.firstSeen)],
        ['累计使用天数', s.dayCount + ' 天'],
        ['累计打开次数', s.openCount + ' 次'],
        ['累计操作次数', s.total + ' 次']
    ];
    rows.forEach(function (r) {
        var d = document.createElement('div');
        d.className = 'stat-line';
        var k = document.createElement('span');
        k.className = 'stat-k';
        k.textContent = r[0];
        var v = document.createElement('span');
        v.className = 'stat-v';
        v.textContent = r[1];
        d.appendChild(k);
        d.appendChild(v);
        meta.appendChild(d);
    });

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

function aboutRenderOptin() {
    var box = document.getElementById('optinBox');
    var input = document.getElementById('optinToggle');
    var note = document.getElementById('optinNote');
    if (!box || !input || !note) return;

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

function initAboutPage() {
    aboutRenderStats();
    aboutRenderOptin();

    var input = document.getElementById('optinToggle');
    if (input) {
        input.addEventListener('change', function () {
            analyticsSetOptin(input.checked);
            aboutRenderOptin();
        });
    }

    var clearBtn = document.getElementById('statsClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (!confirm('清除本机使用统计？\n\n只会清掉这些计数，你的排班、待办、倒计时等数据不受影响。')) return;
            analyticsClear();
            aboutRenderStats();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutPage);
} else {
    initAboutPage();
}

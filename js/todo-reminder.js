/**
 * ============================================================
 * todo-reminder.js - 待办「临近提醒」模块
 * 作用：在事项临近时用右下角悬浮卡提醒。
 *   阶段与次数上限（按天累计封顶）：
 *     当天到期 → 每天最多 5 次
 *     明天到期 → 每天最多 3 次
 *     2~3 天后 → 每天最多 1 次
 *   计数规则：页面每触发一次检查、该事项计数 +1；达到当天上限后当天不再提醒，
 *            次日自动重置（换阶段后随即按新阶段上限计）。
 *   多个临期事项在同一张卡里合并展示。
 *   触发时机：刷新/首次加载、切回标签页、页面可见时每 30 分钟检查一次。
 * 数据：localStorage 'todoReminderLog'
 *   结构：{ 'YYYY-MM-DD': { 'todoId': 已提醒次数 } }  只保留最近 3 天
 * 依赖：todo.js（todoList / loadTodos / toggleTodoDone / openTodoModal）
 * ============================================================
 */

var TODO_REMIND_KEY = 'todoReminderLog';
var TODO_REMIND_TICK_MS = 30 * 60 * 1000;   // 页面停留时的检查间隔
var TODO_REMIND_AUTOCLOSE_MS = 15000;      // 卡片自动消失（仍算作已提醒）
var TODO_REMIND_MAX_STACK = 3;             // 同时最多堆叠几张卡

// ============================================================
// 计算：距今天数 / 阶段上限
// ============================================================

/** 返回 dateStr('YYYY-MM-DD') 距今天的天数（未来为正，逾期为负，非法为 NaN） */
function todoDaysFromToday(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return NaN;
    var p = dateStr.split('-');
    if (p.length !== 3) return NaN;
    var t = getToday();
    var a = new Date(t.year, t.month - 1, t.day);
    var b = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(b.getTime())) return NaN;
    return Math.round((b - a) / 86400000);
}

/** 当天提醒次数上限；返回 0 表示不提醒 */
function todoRemindCap(days) {
    if (days === 0) return 5;              // 当天到期
    if (days === 1) return 3;              // 明天到期
    if (days >= 2 && days <= 3) return 1;  // 2~3 天内到期
    return 0;                              // 逾期或 3 天以外：不弹提醒
}

/** 阶段标签 */
function todoRemindStage(days) {
    if (days === 0) return { text: '今天到期', cls: 'due-today' };
    if (days === 1) return { text: '明天到期', cls: 'due-soon' };
    return { text: days + ' 天后到期', cls: 'due-soon' };
}

// ============================================================
// 提醒日志读写（只保留最近 3 天，避免无限增长）
// ============================================================

function loadTodoReminderLog() {
    try {
        var raw = localStorage.getItem(TODO_REMIND_KEY);
        var o = raw ? JSON.parse(raw) : {};
        return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) {
        return {};
    }
}

function saveTodoReminderLog(log) {
    try {
        var t = getToday();
        var todayKey = formatDate(t.year, t.month, t.day);
        var c = new Date(t.year, t.month - 1, t.day - 3);
        var cutoffKey = formatDate(c.getFullYear(), c.getMonth() + 1, c.getDate());

        var keep = {};
        var keys = Object.keys(log || {});
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] >= cutoffKey && keys[i] <= todayKey) keep[keys[i]] = log[keys[i]];
        }
        localStorage.setItem(TODO_REMIND_KEY, JSON.stringify(keep));
    } catch (e) {
        /* 隐私模式 / 配额满：提醒降级为「每次都弹」，不影响主功能 */
    }
}

// ============================================================
// 主流程：检查并提醒
// ============================================================

/**
 * 检查一次待办提醒。由刷新、切回标签页、定时器调用。
 * @returns {number} 本次实际提醒到的事项数（0 表示无需提醒）
 */
function checkTodoReminders(source) {
    if (typeof loadTodos !== 'function') return 0;
    loadTodos();

    var t = getToday();
    var todayKey = formatDate(t.year, t.month, t.day);
    var log = loadTodoReminderLog();
    if (!log[todayKey] || typeof log[todayKey] !== 'object') log[todayKey] = {};
    var dayLog = log[todayKey];

    var due = [];
    for (var i = 0; i < todoList.length; i++) {
        var td = todoList[i];
        if (!td || td.done) continue;
        var days = todoDaysFromToday(td.date);
        if (isNaN(days)) continue;

        var cap = todoRemindCap(days);
        if (cap <= 0) continue;

        var used = parseInt(dayLog[td.id], 10);
        if (isNaN(used) || used < 0) used = 0;
        if (used >= cap) continue;   // 当天已达上限，不再打扰

        due.push({ todo: td, days: days, cap: cap });
    }

    if (due.length === 0) return 0;

    // 越紧急越靠前；同阶段按日期+时间升序
    due.sort(function (a, b) {
        if (a.days !== b.days) return a.days - b.days;
        var ka = a.todo.date + (a.todo.time || '');
        var kb = b.todo.date + (b.todo.time || '');
        if (ka !== kb) return ka < kb ? -1 : 1;
        return (a.todo.createdAt || 0) - (b.todo.createdAt || 0);
    });

    // 计数 +1（按天累计封顶：每条事项各自记账）
    for (var j = 0; j < due.length; j++) {
        dayLog[due[j].todo.id] = (parseInt(dayLog[due[j].todo.id], 10) || 0) + 1;
    }
    saveTodoReminderLog(log);

    showTodoReminderCard(due, source || 'check');
    return due.length;
}

/** 开发/调试用：清空今天的提醒计数 */
function resetTodoReminders() {
    try {
        localStorage.removeItem(TODO_REMIND_KEY);
        if (typeof showToast === 'function') showToast('🔄 待办提醒计数已重置');
    } catch (e) { /* 忽略 */ }
}

// ============================================================
// 右下角悬浮卡
// ============================================================

function getTodoRemindStack() {
    var wrap = document.getElementById('todoRemindStack');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'todoRemindStack';
        wrap.className = 'todo-remind-stack';
        document.body.appendChild(wrap);
    }
    return wrap;
}

function removeTodoRemindCard(card) {
    if (!card || !card.parentNode) return;
    if (card.classList.contains('out')) return;
    card.classList.add('out');
    setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        var wrap = document.getElementById('todoRemindStack');
        if (wrap && wrap.parentNode && wrap.children.length === 0) {
            wrap.parentNode.removeChild(wrap);
        }
    }, 240);
}

function showTodoReminderCard(items, source) {
    var wrap = getTodoRemindStack();

    // 超出堆叠上限时溢出最早的一张
    while (wrap.children.length >= TODO_REMIND_MAX_STACK) {
        wrap.removeChild(wrap.firstChild);
    }

    var card = document.createElement('div');
    card.className = 'todo-remind-card';

    // ---------------- 头部 ----------------
    var head = document.createElement('div');
    head.className = 'todo-remind-head';

    var hIcon = document.createElement('span');
    hIcon.className = 'todo-remind-icon';
    hIcon.textContent = '🔔';
    head.appendChild(hIcon);

    var hTitle = document.createElement('span');
    hTitle.className = 'todo-remind-title';
    hTitle.textContent = '待办提醒';
    head.appendChild(hTitle);

    var hCount = document.createElement('span');
    hCount.className = 'todo-remind-count';
    hCount.textContent = items.length + ' 项';
    head.appendChild(hCount);

    var hClose = document.createElement('button');
    hClose.type = 'button';
    hClose.className = 'todo-remind-close';
    hClose.textContent = '✕';
    hClose.title = '关闭（本次已提醒，不再重复）';
    hClose.onclick = function () { removeTodoRemindCard(card); };
    head.appendChild(hClose);

    card.appendChild(head);

    // ---------------- 事项列表 ----------------
    var list = document.createElement('div');
    list.className = 'todo-remind-list';

    for (var i = 0; i < items.length; i++) {
        (function (it) {
            var stage = todoRemindStage(it.days);

            var row = document.createElement('div');
            row.className = 'todo-remind-item ' + stage.cls;

            var main = document.createElement('div');
            main.className = 'todo-remind-main';

            var ttl = document.createElement('div');
            ttl.className = 'todo-remind-ttl';
            ttl.textContent = it.todo.title;
            main.appendChild(ttl);

            if (it.todo.detail) {
                var det = document.createElement('div');
                det.className = 'todo-remind-detail';
                det.textContent = it.todo.detail;
                main.appendChild(det);
            }

            var meta = document.createElement('div');
            meta.className = 'todo-remind-meta';
            var dateText = '📅 ' + it.todo.date + (it.todo.time ? ' ' + it.todo.time : '');
            meta.textContent = '🔔 ' + stage.text + ' · ' + dateText;
            main.appendChild(meta);

            row.appendChild(main);

            // 快捷完成
            var doneBtn = document.createElement('button');
            doneBtn.type = 'button';
            doneBtn.className = 'todo-remind-done';
            doneBtn.textContent = '✓ 完成';
            doneBtn.title = '标记为已完成';
            doneBtn.onclick = function () {
                if (typeof toggleTodoDone === 'function') toggleTodoDone(it.todo.id);
                if (row.parentNode) row.parentNode.removeChild(row);
                if (list.children.length === 0) removeTodoRemindCard(card);
            };
            row.appendChild(doneBtn);

            list.appendChild(row);
        })(items[i]);
    }

    card.appendChild(list);

    // ---------------- 底部操作 ----------------
    var foot = document.createElement('div');
    foot.className = 'todo-remind-foot';

    var viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'todo-remind-btn ghost';
    viewBtn.textContent = '查看全部';
    viewBtn.onclick = function () {
        if (typeof openTodoModal === 'function') openTodoModal();
        removeTodoRemindCard(card);
    };
    foot.appendChild(viewBtn);

    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'todo-remind-btn primary';
    okBtn.textContent = '知道了';
    okBtn.onclick = function () { removeTodoRemindCard(card); };
    foot.appendChild(okBtn);

    card.appendChild(foot);

    wrap.appendChild(card);

    // 自动消失（仍视为已提醒一次）
    card._autoTimer = setTimeout(function () { removeTodoRemindCard(card); }, TODO_REMIND_AUTOCLOSE_MS);
}

// ============================================================
// 初始化：绑定触发时机
// ============================================================

function initTodoReminder() {
    // 1) 刷新 / 首次加载：稍延迟，避开首屏渲染高峰
    setTimeout(function () { checkTodoReminders('load'); }, 900);

    // 2) 从后台切回标签页
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkTodoReminders('visible');
    });

    // 3) 页面停留时定时检查（仅在可见时）
    setInterval(function () {
        if (!document.hidden) checkTodoReminders('timer');
    }, TODO_REMIND_TICK_MS);
}

/**
 * ============================================================
 * backup.js - 本地备份中心（档 1：零后端）
 * ------------------------------------------------------------
 * 为什么要有它：本项目所有数据只存在浏览器 localStorage，清缓存 / 换设备即丢。
 * 原来只有「导出文件 / 导入文件」两个入口，用户往往想不到、也想不起来用。
 * 这里把备份能力集中成一个「备份中心」，并补上三件事：
 *   1) 记住「上次备份时间」，并计算「备份后又改过没有」（指纹比对）
 *   2) 到期提醒：有未备份的改动、且距上次备份 ≥ 14 天时，每天最多轻提醒一次
 *   3) 除了下载文件，还能「一键复制备份文本 / 从文本粘贴导入」（手机↔电脑搬运更方便）
 *
 * 数据：localStorage 'backupMeta'
 *   { lastBackupAt, lastFingerprint, lastCloudAt }
 * 依赖：storage.js / plan.js / todo.js（仅读取各模块的 localStorage 键）
 * ============================================================
 */

var BACKUP_META_KEY = 'backupMeta';
var BACKUP_REMIND_KEY = 'backupRemindLog';
/** 距上次备份超过这么多天，且期间有改动 → 提醒 */
var BACKUP_REMIND_DAYS = 14;

// ============================================================
// 数据收集 / 指纹
// ============================================================

/** 安全读取一个 JSON 键 */
function backupReadJSON(key, fallback) {
    try {
        var raw = localStorage.getItem(key);
        if (!raw) return fallback;
        var v = JSON.parse(raw);
        return v;
    } catch (e) {
        return fallback;
    }
}

/**
 * 收集当前完整数据（结构与导出备份完全一致，version 4）
 * 导出、备份文本、云备份、指纹计算都用它，保证口径统一
 */
function collectBackupPayload() {
    var countdowns = backupReadJSON('countdownList', []);
    if (!Array.isArray(countdowns)) countdowns = [];

    var todos = backupReadJSON('todoList', []);
    if (!Array.isArray(todos)) todos = [];

    var planData = backupReadJSON('schedulePlan', null);

    return {
        version: 4,
        app: 'schedule-calendar',
        exportedAt: new Date().toISOString(),
        statuses: statusMap,
        countdowns: countdowns,
        todos: todos,
        plan: planData,
        theme: localStorage.getItem('calendar_theme') || 'default'
    };
}

/** djb2 字符串指纹（够用且极快，只用于判断「变了没有」） */
function backupFingerprint(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return 'f' + (h >>> 0).toString(36);
}

/** 只取「内容」部分算指纹，不含 exportedAt（否则每次都变） */
function currentBackupFingerprint() {
    var p = collectBackupPayload();
    delete p.exportedAt;
    return backupFingerprint(JSON.stringify(p));
}

/** 数据规模摘要，用于界面展示 */
function backupDataSummary() {
    var p = collectBackupPayload();
    return {
        statuses: Object.keys(p.statuses || {}).length,
        countdowns: (p.countdowns || []).length,
        todos: (p.todos || []).length,
        hasPlan: !!p.plan
    };
}

// ============================================================
// 备份元数据
// ============================================================

function loadBackupMeta() {
    var m = backupReadJSON(BACKUP_META_KEY, null);
    if (!m || typeof m !== 'object') m = {};
    return {
        lastBackupAt: typeof m.lastBackupAt === 'number' ? m.lastBackupAt : 0,
        lastFingerprint: typeof m.lastFingerprint === 'string' ? m.lastFingerprint : '',
        lastCloudAt: typeof m.lastCloudAt === 'number' ? m.lastCloudAt : 0
    };
}

function saveBackupMeta(m) {
    try {
        localStorage.setItem(BACKUP_META_KEY, JSON.stringify(m));
        return true;
    } catch (e) {
        return false;
    }
}

/** 标记「刚刚备份过」（本地导出 / 复制文本） */
function markBackedUp() {
    var m = loadBackupMeta();
    m.lastBackupAt = Date.now();
    m.lastFingerprint = currentBackupFingerprint();
    saveBackupMeta(m);
    updateBackupBadge();
}

/** 标记「刚刚云备份过」 */
function markCloudBackedUp() {
    var m = loadBackupMeta();
    m.lastCloudAt = Date.now();
    // 云备份同样是「已落一份出去」，视为已完成备份
    m.lastBackupAt = Date.now();
    m.lastFingerprint = currentBackupFingerprint();
    saveBackupMeta(m);
    updateBackupBadge();
}

// ============================================================
// 状态判定
// ============================================================

/** 距离「某时间戳」的天数（向下取整）；0 表示今天 */
function backupDaysAgo(ts) {
    if (!ts) return -1;
    return Math.floor((Date.now() - ts) / 86400000);
}

/**
 * 备份状态
 * @returns {{
 *   hasData:boolean, changed:boolean, neverBacked:boolean,
 *   lastAt:number, daysAgo:number, overdue:boolean, summary:object
 * }}
 */
function backupStatus() {
    var meta = loadBackupMeta();
    var summary = backupDataSummary();
    var hasData = summary.statuses > 0 || summary.countdowns > 0 || summary.todos > 0 || summary.hasPlan;

    var current = currentBackupFingerprint();
    var changed = !meta.lastFingerprint || current !== meta.lastFingerprint;
    var neverBacked = !meta.lastBackupAt;
    var daysAgo = backupDaysAgo(meta.lastBackupAt);
    var overdue = hasData && changed && (neverBacked || daysAgo >= BACKUP_REMIND_DAYS);

    return {
        hasData: hasData,
        changed: changed,
        neverBacked: neverBacked,
        lastAt: meta.lastBackupAt,
        daysAgo: daysAgo,
        overdue: overdue,
        summary: summary
    };
}

/** 把时间戳格式化为「2026-10-06 15:30」 */
function backupFormatTime(ts) {
    if (!ts) return '从未';
    var d = new Date(ts);
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 页脚「备份」入口上的小红点 */
function updateBackupBadge() {
    var el = document.getElementById('backupBtn');
    if (!el) return;
    var st = backupStatus();
    el.classList.toggle('backup-due', st.overdue);
    el.title = st.overdue
        ? '有未备份的改动，建议备份'
        : ('上次备份：' + backupFormatTime(st.lastAt));
}

// ============================================================
// 导入（文件导入与文本粘贴导入共用同一套校验/写入逻辑）
// ============================================================

/**
 * 应用一份备份对象（已 JSON.parse）
 * 从 main.js 的 importData 抽出，供「文件导入」与「粘贴导入」共用
 * @param {object} data  解析后的备份对象
 * @returns {{ok:boolean, msg:string}}
 */
function applyImportedBackup(data) {
    var statuses = null;
    var countdowns = null;
    var todos = null;
    var planData = null;
    var theme = null;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if ((data.version === 2 || data.version === 3 || data.version === 4) && data.statuses) {
            statuses = sanitizeStatusMap(data.statuses);
            if (Array.isArray(data.countdowns)) countdowns = data.countdowns;
            if (Array.isArray(data.todos)) todos = data.todos.filter(isValidTodo);
            if (data.plan && typeof data.plan === 'object') planData = sanitizePlanData(data.plan);
            if (typeof data.theme === 'string') theme = data.theme;
        } else {
            // 兼容旧版纯 map 格式
            statuses = sanitizeStatusMap(data);
        }
    }

    if (!statuses || Object.keys(statuses).length === 0) {
        return { ok: false, msg: '❌ 没有有效的排班数据' };
    }

    // 导入前留一份快照，万一导错可从控制台恢复
    var backup = localStorage.getItem('workStatusMap');

    var confirmMessage = '确定要导入数据吗？\n\n将导入 ' + Object.keys(statuses).length + ' 个标记'
        + (countdowns ? '、' + countdowns.length + ' 个倒计时' : '')
        + (todos ? '、' + todos.length + ' 个待办' : '')
        + (planData ? '、1 套排班方案' : '')
        + '\n\n⚠️ 将覆盖当前全部数据！';
    if (!confirm(confirmMessage)) {
        return { ok: false, msg: '❌ 已取消导入', cancelled: true };
    }

    try {
        localStorage.setItem('workStatusMap', JSON.stringify(statuses));
        if (countdowns !== null) localStorage.setItem('countdownList', JSON.stringify(countdowns));
        if (todos !== null) localStorage.setItem('todoList', JSON.stringify(todos));
        if (planData !== null) localStorage.setItem('schedulePlan', JSON.stringify(planData));
        if (theme) localStorage.setItem('calendar_theme', theme);
    } catch (e) {
        return { ok: false, msg: '❌ 写入本地存储失败（可能空间不足）' };
    }

    if (backup) console.log('[导入备份] 导入前的数据快照：', backup);

    // 刷新各模块
    loadFromStorage();
    if (countdowns !== null && typeof renderCountdownList === 'function') renderCountdownList();
    if (todos !== null && typeof loadTodos === 'function') { loadTodos(); renderTodoBadge(); }
    if (theme && typeof loadTheme === 'function') loadTheme();
    if (planData !== null && typeof refreshPlanUI === 'function') refreshPlanUI();
    fullUpdate();

    return {
        ok: true,
        msg: '✅ 成功导入 ' + Object.keys(statuses).length + ' 个标记'
            + (countdowns ? '、' + countdowns.length + ' 个倒计时' : '')
            + (todos ? '、' + todos.length + ' 个待办' : '')
            + (planData ? '、排班方案' : '')
    };
}

// ============================================================
// 剪贴板
// ============================================================

/** 复制文本到剪贴板；返回 Promise<boolean>（含 execCommand 兜底） */
function backupCopyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; },
            function () { return backupCopyFallback(text); });
    }
    return Promise.resolve(backupCopyFallback(text));
}

function backupCopyFallback(text) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}

// ============================================================
// 备份中心弹窗
// ============================================================

function closeBackupModal() {
    var el = document.getElementById('backupModal');
    if (el) el.remove();
}

function backupRow(label, value, cls) {
    var row = document.createElement('div');
    row.className = 'backup-row';
    var l = document.createElement('span');
    l.className = 'backup-row-label';
    l.textContent = label;
    var v = document.createElement('span');
    v.className = 'backup-row-value' + (cls ? ' ' + cls : '');
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    return row;
}

function backupActionBtn(id, text, primary, onclick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'modal-btn ' + (primary ? 'modal-btn-primary' : 'modal-btn-cancel');
    b.textContent = text;
    b.onclick = onclick;
    return b;
}

function openBackupModal() {
    closeBackupModal();

    var st = backupStatus();

    var overlay = document.createElement('div');
    overlay.id = 'backupModal';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box backup-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '🛡️ 数据备份';
    box.appendChild(title);

    var desc = document.createElement('div');
    desc.className = 'backup-desc';
    desc.textContent = '你的数据只保存在这台设备的浏览器里，不会上传到任何服务器。清除浏览器数据、换设备或重装系统都会丢失，建议定期备份。';
    box.appendChild(desc);

    // ---- 状态 ----
    var statusCard = document.createElement('div');
    statusCard.className = 'backup-status' + (st.overdue ? ' due' : '');

    var statusLine = document.createElement('div');
    statusLine.className = 'backup-status-line';
    if (!st.hasData) statusLine.textContent = 'ℹ️ 还没有可备份的数据';
    else if (st.overdue && st.neverBacked) statusLine.textContent = '⚠️ 你还没有备份过，建议现在备份一份';
    else if (st.overdue) statusLine.textContent = '⚠️ 上次备份后又有改动（' + st.daysAgo + ' 天前备份）';
    else if (st.changed) statusLine.textContent = '📝 有未备份的改动';
    else statusLine.textContent = '✅ 已是最新备份';
    statusCard.appendChild(statusLine);

    statusCard.appendChild(backupRow('上次备份', backupFormatTime(st.lastAt) + (st.daysAgo >= 0 ? '（' + st.daysAgo + ' 天前）' : '')));
    var sum = st.summary;
    statusCard.appendChild(backupRow('当前数据',
        sum.statuses + ' 个标记 · ' + sum.countdowns + ' 个倒计时 · ' + sum.todos + ' 个待办' + (sum.hasPlan ? ' · 1 套方案' : '')));
    box.appendChild(statusCard);

    // ---- 本地备份 ----
    var sub1 = document.createElement('div');
    sub1.className = 'backup-sub';
    sub1.textContent = '本地备份';
    box.appendChild(sub1);

    var btnRow1 = document.createElement('div');
    btnRow1.className = 'backup-actions';
    btnRow1.appendChild(backupActionBtn('backupFileBtn', '💾 导出文件', true, function () {
        exportData();
        closeBackupModal();
        updateBackupBadge();
    }));
    btnRow1.appendChild(backupActionBtn('backupCopyBtn', '📋 复制备份文本', false, function () {
        var text = JSON.stringify(collectBackupPayload(), null, 2);
        backupCopyText(text).then(function (ok) {
            if (ok) {
                markBackedUp();
                showToast('📋 备份文本已复制，可粘贴到聊天/备忘里保存');
            } else {
                showPasteBox('复制失败，请手动全选复制下面的内容：', text);
            }
        });
    }));
    box.appendChild(btnRow1);

    var btnRow2 = document.createElement('div');
    btnRow2.className = 'backup-actions';
    btnRow2.appendChild(backupActionBtn('backupPasteBtn', '📥 粘贴文本导入', false, function () {
        showPasteBox('把你之前复制/保存的备份文本粘贴到这里，然后点「导入」：', '');
    }));
    btnRow2.appendChild(backupActionBtn('backupFileImportBtn', '📂 选择文件导入', false, function () {
        closeBackupModal();
        importData();
    }));
    box.appendChild(btnRow2);

    // ---- 云备份（档 2，由 cloud-backup.js 挂载；未加载时不显示） ----
    var cloudHost = document.createElement('div');
    cloudHost.id = 'backupCloudHost';
    cloudHost.className = 'backup-cloud-host';
    box.appendChild(cloudHost);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'backup-close-btn';
    closeBtn.textContent = '关闭';
    closeBtn.onclick = closeBackupModal;
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    // 交给云备份模块填充云区块（未加载则什么都不做）
    if (typeof renderCloudBackupSection === 'function') {
        renderCloudBackupSection(cloudHost);
    }
}

/** 弹出一个粘贴框（复制失败展示 / 粘贴导入） */
function showPasteBox(hint, presetText) {
    closePasteBox();

    var overlay = document.createElement('div');
    overlay.id = 'pasteBox';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box backup-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '📋 备份文本';
    box.appendChild(title);

    var hintEl = document.createElement('div');
    hintEl.className = 'backup-desc';
    hintEl.textContent = hint;
    box.appendChild(hintEl);

    var ta = document.createElement('textarea');
    ta.id = 'pasteTextarea';
    ta.className = 'modal-input backup-textarea';
    ta.rows = 8;
    ta.placeholder = '在这里粘贴 JSON 备份文本…';
    ta.value = presetText || '';
    box.appendChild(ta);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'modal-btn-group';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'modal-btn modal-btn-cancel';
    cancel.textContent = '关闭';
    cancel.onclick = closePasteBox;
    btnGroup.appendChild(cancel);

    // 只是展示（复制失败）时不显示导入按钮
    if (!presetText) {
        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'modal-btn modal-btn-primary';
        confirmBtn.textContent = '导入';
        confirmBtn.onclick = function () {
            var text = (ta.value || '').trim();
            if (!text) { showToast('⚠️ 请先粘贴备份文本'); return; }
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                showToast('❌ 文本格式错误，请确认复制完整');
                return;
            }
            var res = applyImportedBackup(data);
            if (res.ok) {
                closePasteBox();
                closeBackupModal();
                showToast(res.msg);
            } else if (!res.cancelled) {
                showToast(res.msg);
            }
        };
        btnGroup.appendChild(confirmBtn);
    } else {
        var selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'modal-btn modal-btn-primary';
        selectBtn.textContent = '全选';
        selectBtn.onclick = function () { ta.focus(); ta.select(); };
        btnGroup.appendChild(selectBtn);
    }

    box.appendChild(btnGroup);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    setTimeout(function () { ta.focus(); if (!presetText) ta.value = ''; }, 30);
}

function closePasteBox() {
    var el = document.getElementById('pasteBox');
    if (el) el.remove();
}

// ============================================================
// 到期提醒（每天最多一次）
// ============================================================

function backupRemindTodayKey() {
    var t = getToday();
    return formatDate(t.year, t.month, t.day);
}

function maybeRemindBackup() {
    var st = backupStatus();
    if (!st.overdue) return;

    var today = backupRemindTodayKey();
    var last = '';
    try { last = localStorage.getItem(BACKUP_REMIND_KEY) || ''; } catch (e) { /* 忽略 */ }
    if (last === today) return;                    // 今天已经提醒过

    try { localStorage.setItem(BACKUP_REMIND_KEY, today); } catch (e) { /* 忽略 */ }
    showToast('🛡️ 数据只在本机，已 ' + (st.neverBacked ? '从未备份' : st.daysAgo + ' 天未备份') + '，点「备份」保存一份');
}

// ============================================================
// 初始化
// ============================================================

function initBackup() {
    var btn = document.getElementById('backupBtn');
    if (btn) btn.addEventListener('click', openBackupModal);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (document.getElementById('pasteBox')) { closePasteBox(); return; }
        closeBackupModal();
    });

    updateBackupBadge();

    // 首屏稳定后再判断是否提醒，避免和别的提示挤在一起
    setTimeout(maybeRemindBackup, 2600);
}

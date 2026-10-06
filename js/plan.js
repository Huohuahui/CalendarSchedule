/**
 * ============================================================
 * plan.js - 排班方案（可定制的月度加班目标）
 * ------------------------------------------------------------
 * 为什么要有它：原来「大月 15 / 小月 14」是写死在 utils.js 里的常量，
 * 只适用于特定岗位。面向大众就必须让用户自己定。
 *
 * 规则模型（可改的大小月制）：
 *   bigBase   - 大月（31 天）的「基础目标」天数
 *   smallBase - 小月（≤30 天）的「基础目标」天数
 *   extra     - 「额外加班」上限天数
 *
 * 生效范围三选（用户自己挑）：
 *   month - 仅本月：只覆盖当前这个月，其它月不受影响
 *   from  - 从本月起：本月及以后都用新规则（更早的月份保留旧规则）
 *   at    - 指定月份：从「未来 12 个月内」挑一个月份开始生效
 *
 * 求值优先级：某月单独覆盖(overrides) > 生效规则(rules 中 from ≤ 目标月 的最后一条) > 默认
 *   —— 这样「改规则」不会污染历史月份的达标统计。
 *
 * 数据：localStorage 'schedulePlan'
 *   {
 *     version: 1,
 *     planId: 'default',            // 当前使用的预设 id
 *     templateId: 'six-one',        // 方案配套的排班模板（与 templates.js 的 SCHEDULE_TEMPLATES 对应）
 *     customPresets: [ {...} ],     // 用户自建预设
 *     rules:    [ { from:'2026-10', bigBase, smallBase, extra, planName } ],
 *     overrides:{ '2026-10': { bigBase, smallBase, extra, planName } }
 *   }
 * 依赖：utils.js（日期工具）、templates.js（读模板名，仅用于显示）
 * ============================================================
 */

var PLAN_KEY = 'schedulePlan';
var PLAN_DEFAULT = { bigBase: 15, smallBase: 14, extra: 8, planName: '标准班', templateId: 'six-one' };
var PLAN_MAX_DAYS = 31;

/** 内置行业预设（数字都是起点，用户可随时改） */
var BUILTIN_PLANS = [
    {
        id: 'default', name: '标准班', icon: '🌙',
        bigBase: 15, smallBase: 14, extra: 8, templateId: 'six-one',
        desc: '大月 15 / 小月 14，额外 8 天（系统默认）'
    },
    {
        id: 'double-off', name: '双休制', icon: '🛋️',
        bigBase: 4, smallBase: 4, extra: 4, templateId: 'weekday-only',
        desc: '周末双休，每月加班约 4 天'
    },
    {
        id: 'size-week', name: '大小周', icon: '📆',
        bigBase: 6, smallBase: 6, extra: 4, templateId: 'five-two',
        desc: '一周单休、一周双休，每月加班约 6 天'
    },
    {
        id: 'one-day-off', name: '上六休一', icon: '🔁',
        bigBase: 2, smallBase: 2, extra: 4, templateId: 'six-one',
        desc: '每周休 1 天（周日），每月加班约 2 天'
    },
    {
        id: 'alt-day', name: '做一休一', icon: '🔄',
        bigBase: 15, smallBase: 14, extra: 0, templateId: 'alternate',
        desc: '隔天上班，每月上班约 15 天'
    }
];

// ============================================================
// 工具
// ============================================================

function planMonthKey(year, month) {
    return String(year) + '-' + (month < 10 ? '0' + month : String(month));
}

/** 取整数并夹在 0..31，非法值用 def */
function planInt(v, def) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return def;
    if (n < 0) return 0;
    if (n > PLAN_MAX_DAYS) return PLAN_MAX_DAYS;
    return n;
}

function planStr(v, def) {
    return (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 12) : def;
}

/** 规范化一条规则 */
function sanitizePlanRule(r) {
    r = r || {};
    return {
        bigBase: planInt(r.bigBase, PLAN_DEFAULT.bigBase),
        smallBase: planInt(r.smallBase, PLAN_DEFAULT.smallBase),
        extra: planInt(r.extra, PLAN_DEFAULT.extra),
        planName: planStr(r.planName, PLAN_DEFAULT.planName)
    };
}

function findBuiltinPlan(id) {
    for (var i = 0; i < BUILTIN_PLANS.length; i++) {
        if (BUILTIN_PLANS[i].id === id) return BUILTIN_PLANS[i];
    }
    return null;
}

/** 全部可选预设 = 内置 + 自建 */
function allPlanPresets(plan) {
    var list = BUILTIN_PLANS.slice();
    for (var i = 0; i < plan.customPresets.length; i++) list.push(plan.customPresets[i]);
    return list;
}

function findPlanPreset(plan, id) {
    var all = allPlanPresets(plan);
    for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i];
    }
    return null;
}

/** 模板名（仅用于显示），templates.js 未加载时返回空 */
function planTemplateName(id) {
    if (!id || typeof SCHEDULE_TEMPLATES === 'undefined') return '';
    for (var i = 0; i < SCHEDULE_TEMPLATES.length; i++) {
        if (SCHEDULE_TEMPLATES[i].id === id) return SCHEDULE_TEMPLATES[i].name;
    }
    return '';
}

// ============================================================
// 读写
// ============================================================

/** 把任意（含导入的脏数据）对象规范化成可用的方案结构 */
function sanitizePlanData(raw) {
    var plan = {
        version: 1,
        planId: 'default',
        templateId: PLAN_DEFAULT.templateId,
        customPresets: [],
        rules: [],
        overrides: {}
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return plan;

    if (typeof raw.planId === 'string' && raw.planId) plan.planId = raw.planId.slice(0, 40);
    if (typeof raw.templateId === 'string' && raw.templateId) plan.templateId = raw.templateId.slice(0, 30);

    if (Array.isArray(raw.customPresets)) {
        for (var i = 0; i < raw.customPresets.length && plan.customPresets.length < 20; i++) {
            var p = raw.customPresets[i];
            if (!p || typeof p !== 'object') continue;
            if (typeof p.id !== 'string' || !p.id) continue;
            plan.customPresets.push({
                id: p.id.slice(0, 40),
                name: planStr(p.name, '我的方案'),
                icon: planStr(p.icon, '⭐'),
                desc: typeof p.desc === 'string' ? p.desc.slice(0, 60) : '',
                custom: true,
                templateId: typeof p.templateId === 'string' ? p.templateId.slice(0, 30) : '',
                bigBase: planInt(p.bigBase, PLAN_DEFAULT.bigBase),
                smallBase: planInt(p.smallBase, PLAN_DEFAULT.smallBase),
                extra: planInt(p.extra, PLAN_DEFAULT.extra)
            });
        }
    }

    if (Array.isArray(raw.rules)) {
        var seen = {};
        for (var k = 0; k < raw.rules.length && plan.rules.length < 60; k++) {
            var rr = raw.rules[k];
            if (!rr || typeof rr.from !== 'string' || !/^\d{4}-\d{2}$/.test(rr.from)) continue;
            if (seen[rr.from]) continue;             // 同一起始月只留一条
            seen[rr.from] = 1;
            var norm = sanitizePlanRule(rr);
            norm.from = rr.from;
            plan.rules.push(norm);
        }
        plan.rules.sort(function (a, b) { return a.from < b.from ? -1 : (a.from > b.from ? 1 : 0); });
    }

    if (raw.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)) {
        var count = 0;
        for (var key in raw.overrides) {
            if (!Object.prototype.hasOwnProperty.call(raw.overrides, key)) continue;
            if (!/^\d{4}-\d{2}$/.test(key)) continue;
            if (count++ >= 60) break;
            plan.overrides[key] = sanitizePlanRule(raw.overrides[key]);
        }
    }
    return plan;
}

function loadPlan() {
    try {
        var raw = localStorage.getItem(PLAN_KEY);
        if (!raw) return sanitizePlanData(null);
        return sanitizePlanData(JSON.parse(raw));
    } catch (e) {
        return sanitizePlanData(null);
    }
}

function savePlan(plan) {
    try {
        localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 取某个生效月份的规则
 * @returns {{bigBase:number, smallBase:number, extra:number, planName:string, source:'override'|'rule'|'default'}}
 */
function getPlanRule(year, month) {
    var plan = loadPlan();
    var key = planMonthKey(year, month);

    // 1) 该月单独覆盖优先
    if (plan.overrides[key]) {
        var o = sanitizePlanRule(plan.overrides[key]);
        o.source = 'override';
        return o;
    }
    // 2) 生效规则：取 from ≤ 目标月 的最后一条
    var hit = null;
    for (var i = 0; i < plan.rules.length; i++) {
        if (plan.rules[i].from <= key) hit = plan.rules[i];
    }
    if (hit) {
        var r = sanitizePlanRule(hit);
        r.source = 'rule';
        return r;
    }
    // 3) 默认
    var d = sanitizePlanRule(PLAN_DEFAULT);
    d.source = 'default';
    return d;
}

/** 当前方案名（用于界面展示）：优先取「本月实际生效的规则」里的名字 */
function getCurrentPlanName() {
    var rule = getPlanRule(currentYear, currentMonth);
    return rule.planName;
}

/** 当前配套模板 id（全局，不分月） */
function getPlanTemplateId() {
    return loadPlan().templateId || '';
}

// ============================================================
// 应用方案
// ============================================================

/**
 * 应用一套目标规则
 * @param {object} preset 预设（内置或自建）
 * @param {string} scope  'month' 仅本月 | 'from' 从本月起 | 'at' 指定月份
 * @param {number} [atYear]   scope='at' 时的目标年
 * @param {number} [atMonth]  scope='at' 时的目标月
 * @returns {{ok:boolean, msg:string}}
 */
function applyPlanPreset(preset, scope, atYear, atMonth) {
    if (!preset) return { ok: false, msg: '方案不存在' };

    var plan = loadPlan();
    var rule = {
        bigBase: planInt(preset.bigBase, PLAN_DEFAULT.bigBase),
        smallBase: planInt(preset.smallBase, PLAN_DEFAULT.smallBase),
        extra: planInt(preset.extra, PLAN_DEFAULT.extra),
        planName: planStr(preset.name, PLAN_DEFAULT.planName)
    };

    var baseYear = currentYear, baseMonth = currentMonth;
    if (scope === 'at') {
        if (!atYear || !atMonth) return { ok: false, msg: '请先选择生效月份' };
        baseYear = atYear; baseMonth = atMonth;
    }
    var key = planMonthKey(baseYear, baseMonth);

    if (scope === 'month') {
        // 仅本月：写覆盖，不动规则
        plan.overrides[key] = rule;
    } else {
        // 从该月起：清掉该月及以后的规则，再追加；同时清掉已失效的覆盖
        plan.rules = plan.rules.filter(function (r) { return r.from < key; });
        var nr = Object.assign({}, rule);
        nr.from = key;
        plan.rules.push(nr);
        plan.rules.sort(function (a, b) { return a.from < b.from ? -1 : (a.from > b.from ? 1 : 0); });

        var cleaned = {};
        for (var k in plan.overrides) {
            if (Object.prototype.hasOwnProperty.call(plan.overrides, k) && k < key) cleaned[k] = plan.overrides[k];
        }
        plan.overrides = cleaned;
    }

    plan.planId = preset.id || 'custom';
    if (preset.templateId) plan.templateId = preset.templateId;
    savePlan(plan);

    var scopeText = scope === 'month'
        ? '仅 ' + key.replace('-', '年') + '月'
        : (scope === 'from' ? '从 ' + key.replace('-', '年') + '月起' : key.replace('-', '年') + '月起');
    return {
        ok: true,
        msg: '🧭 已应用「' + rule.planName + '」· ' + scopeText +
            '（大月 ' + rule.bigBase + ' / 小月 ' + rule.smallBase + ' · 额外 ' + rule.extra + '）'
    };
}

/** 撤销某月的单独覆盖，让它重新跟随生效规则 */
function clearPlanOverride(year, month) {
    var plan = loadPlan();
    var key = planMonthKey(year, month);
    if (!plan.overrides[key]) return false;
    delete plan.overrides[key];
    savePlan(plan);
    return true;
}

/** 存为「我的预设」 */
function saveCustomPlanPreset(name, rule, templateId) {
    name = planStr(name, '');
    if (!name) return { ok: false, msg: '请先填写方案名' };
    var plan = loadPlan();
    if (plan.customPresets.length >= 20) return { ok: false, msg: '自建预设已达 20 个上限' };

    var id = 'custom-' + Date.now().toString(36);
    plan.customPresets.push({
        id: id,
        name: name,
        icon: '⭐',
        custom: true,
        desc: '我保存的方案',
        templateId: templateId || '',
        bigBase: planInt(rule.bigBase, PLAN_DEFAULT.bigBase),
        smallBase: planInt(rule.smallBase, PLAN_DEFAULT.smallBase),
        extra: planInt(rule.extra, PLAN_DEFAULT.extra)
    });
    savePlan(plan);
    return { ok: true, msg: '⭐ 已存为预设「' + name + '」', id: id };
}

function deleteCustomPlanPreset(id) {
    var plan = loadPlan();
    var before = plan.customPresets.length;
    plan.customPresets = plan.customPresets.filter(function (p) { return p.id !== id; });
    if (plan.customPresets.length === before) return false;
    if (plan.planId === id) plan.planId = 'default';
    savePlan(plan);
    return true;
}

// ============================================================
// 界面：进度条入口 + 方案弹窗
// ============================================================

/** 同步界面上与方案相关的文字（入口提示、模板卡副标题） */
function refreshPlanUI() {
    var label = document.getElementById('planEntryHint');
    if (label) {
        label.textContent = getCurrentPlanName();
        label.title = '当前方案：' + getCurrentPlanName() + '（点击定制）';
    }
    var tplHint = document.getElementById('quickTemplateHint');
    if (tplHint) {
        var tname = planTemplateName(getPlanTemplateId());
        tplHint.textContent = tname ? '方案：' + tname : '一键套用';
    }
}

function closePlanModal() {
    var el = document.getElementById('planModal');
    if (el) el.remove();
}

/** 弹窗里记住用户选的生效范围，重绘时不丢 */
var planModalScope = 'from';
var planModalMonthOffset = 0;

function planScopeOptions() {
    var list = [];
    for (var i = 0; i <= 12; i++) {
        var d = new Date(currentYear, currentMonth - 1 + i, 1);
        list.push({
            offset: i,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            label: d.getFullYear() + '年' + (d.getMonth() + 1) + '月'
        });
    }
    return list;
}

function planRuleSummary(base, small, extra) {
    return '大月 ' + base + ' / 小月 ' + small + ' · 额外 ' + extra;
}

function showPlanModal() {
    closePlanModal();

    var plan = loadPlan();
    var cur = getPlanRule(currentYear, currentMonth);
    var monthKey = planMonthKey(currentYear, currentMonth);

    var overlay = document.createElement('div');
    overlay.id = 'planModal';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box plan-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '🧭 排班方案';
    box.appendChild(title);

    // ---- 本月当前状态 ----
    var nowRow = document.createElement('div');
    nowRow.className = 'plan-now';
    var monthTarget = (typeof getBaseTarget === 'function')
        ? getBaseTarget(currentYear, currentMonth)
        : (getDaysInMonth(currentYear, currentMonth) <= 30 ? cur.smallBase : cur.bigBase);
    nowRow.textContent = '本月（' + currentYear + '年' + currentMonth + '月）实际目标：基础 ' + monthTarget +
        ' 天 · 额外 ' + cur.extra + ' 天 · 方案「' + cur.planName + '」' +
        (cur.source === 'override' ? '（本月单独设置）' : '');
    box.appendChild(nowRow);

    // ---- 生效范围 ----
    var scopeWrap = document.createElement('div');
    scopeWrap.className = 'plan-field';

    var scopeLabel = document.createElement('div');
    scopeLabel.className = 'plan-field-label';
    scopeLabel.textContent = '生效时间';
    scopeWrap.appendChild(scopeLabel);

    var scopeRow = document.createElement('div');
    scopeRow.className = 'plan-scope-row';
    var scopeDefs = [
        { v: 'month', t: '仅本月' },
        { v: 'from', t: '从本月起' },
        { v: 'at', t: '指定月份' }
    ];
    scopeDefs.forEach(function (sd) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'plan-scope-btn' + (planModalScope === sd.v ? ' active' : '');
        b.textContent = sd.t;
        b.onclick = function () { planModalScope = sd.v; showPlanModal(); };
        scopeRow.appendChild(b);
    });
    scopeWrap.appendChild(scopeRow);

    if (planModalScope === 'at') {
        var sel = document.createElement('select');
        sel.className = 'modal-input plan-select';
        sel.id = 'planMonthSelect';
        planScopeOptions().forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = String(o.offset);
            opt.textContent = o.label;
            if (o.offset === planModalMonthOffset) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = function () { planModalMonthOffset = parseInt(sel.value, 10) || 0; };
        scopeWrap.appendChild(sel);
    }
    box.appendChild(scopeWrap);

    // ---- 预设列表 ----
    var sub1 = document.createElement('div');
    sub1.className = 'plan-sub';
    sub1.textContent = '预设方案';
    box.appendChild(sub1);

    var list = document.createElement('div');
    list.className = 'plan-list';
    allPlanPresets(plan).forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'plan-item' + (p.id === plan.planId ? ' active' : '');

        var info = document.createElement('div');
        info.className = 'plan-item-info';

        var nm = document.createElement('div');
        nm.className = 'plan-item-name';
        nm.textContent = (p.icon ? p.icon + ' ' : '') + p.name;
        info.appendChild(nm);

        var ds = document.createElement('div');
        ds.className = 'plan-item-desc';
        ds.textContent = planRuleSummary(p.bigBase, p.smallBase, p.extra) +
            (p.templateId ? ' · ' + (planTemplateName(p.templateId) || p.templateId) : '');
        info.appendChild(ds);
        row.appendChild(info);

        var use = document.createElement('button');
        use.type = 'button';
        use.className = 'plan-use-btn';
        use.textContent = '应用';
        use.onclick = function () { doApplyPlan(p); };
        row.appendChild(use);

        if (p.custom) {
            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'plan-del-btn';
            del.textContent = '✕';
            del.title = '删除这个预设';
            del.onclick = function () {
                if (!confirm('删除自建预设「' + p.name + '」？')) return;
                deleteCustomPlanPreset(p.id);
                refreshPlanUI();
                updateProgressBars(currentYear, currentMonth);
                showToast('🗑️ 已删除预设「' + p.name + '」');
                showPlanModal();
            };
            row.appendChild(del);
        }
        list.appendChild(row);
    });
    box.appendChild(list);

    // ---- 自定义 ----
    var sub2 = document.createElement('div');
    sub2.className = 'plan-sub';
    sub2.textContent = '自定义';
    box.appendChild(sub2);

    var form = document.createElement('div');
    form.className = 'plan-form';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'modal-input';
    nameInput.id = 'planNameInput';
    nameInput.placeholder = '方案名，如：我们厂三班倒';
    nameInput.maxLength = 12;
    nameInput.value = cur.planName === PLAN_DEFAULT.planName ? '' : cur.planName;
    form.appendChild(nameInput);

    var numRow = document.createElement('div');
    numRow.className = 'plan-num-row';
    numRow.appendChild(buildNumField('planBigInput', '大月目标', cur.bigBase));
    numRow.appendChild(buildNumField('planSmallInput', '小月目标', cur.smallBase));
    numRow.appendChild(buildNumField('planExtraInput', '额外上限', cur.extra));
    form.appendChild(numRow);

    var tplSel = document.createElement('select');
    tplSel.className = 'modal-input plan-select';
    tplSel.id = 'planTemplateSelect';
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '配套排班模板：不设置';
    tplSel.appendChild(noneOpt);
    if (typeof SCHEDULE_TEMPLATES !== 'undefined') {
        SCHEDULE_TEMPLATES.forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = '配套模板：' + t.name;
            if (t.id === plan.templateId) opt.selected = true;
            tplSel.appendChild(opt);
        });
    }
    form.appendChild(tplSel);
    box.appendChild(form);

    var formErr = document.createElement('div');
    formErr.className = 'plan-err';
    formErr.id = 'planFormErr';
    box.appendChild(formErr);

    function readFormRule() {
        return {
            bigBase: planInt(document.getElementById('planBigInput').value, PLAN_DEFAULT.bigBase),
            smallBase: planInt(document.getElementById('planSmallInput').value, PLAN_DEFAULT.smallBase),
            extra: planInt(document.getElementById('planExtraInput').value, PLAN_DEFAULT.extra),
            name: planStr(document.getElementById('planNameInput').value, '')
        };
    }

    var btnRow = document.createElement('div');
    btnRow.className = 'modal-btn-group plan-actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'modal-btn modal-btn-primary';
    saveBtn.id = 'planSaveBtn';
    saveBtn.textContent = '保存并应用';
    saveBtn.onclick = function () {
        var r = readFormRule();
        if (!r.name) { document.getElementById('planFormErr').textContent = '请填写方案名'; return; }
        doApplyPlan({
            id: 'custom-' + Date.now().toString(36),
            name: r.name,
            icon: '⭐',
            bigBase: r.bigBase,
            smallBase: r.smallBase,
            extra: r.extra,
            templateId: document.getElementById('planTemplateSelect').value
        });
    };
    btnRow.appendChild(saveBtn);

    var presetBtn = document.createElement('button');
    presetBtn.type = 'button';
    presetBtn.className = 'modal-btn modal-btn-cancel';
    presetBtn.id = 'planPresetBtn';
    presetBtn.textContent = '存为我的预设';
    presetBtn.onclick = function () {
        var r = readFormRule();
        var res = saveCustomPlanPreset(r.name, r, document.getElementById('planTemplateSelect').value);
        if (!res.ok) { document.getElementById('planFormErr').textContent = res.msg; return; }
        showToast(res.msg);
        showPlanModal();
    };
    btnRow.appendChild(presetBtn);
    box.appendChild(btnRow);

    // ---- 本月单独设置时，给一个「恢复跟随方案」----
    if (cur.source === 'override') {
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'plan-reset-btn';
        resetBtn.id = 'planResetBtn';
        resetBtn.textContent = '↺ 本月改为跟随方案（取消单独设置）';
        resetBtn.onclick = function () {
            clearPlanOverride(currentYear, currentMonth);
            refreshPlanUI();
            updateProgressBars(currentYear, currentMonth);
            resetBtn.remove();
            showToast('↺ 本月已恢复跟随方案');
            showPlanModal();
        };
        box.appendChild(resetBtn);
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'plan-close-btn';
    closeBtn.textContent = '关闭';
    closeBtn.onclick = closePlanModal;
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    function doApplyPlan(preset) {
        var atYear = null, atMonth = null;
        if (planModalScope === 'at') {
            var opts = planScopeOptions();
            var off = planModalMonthOffset;
            var found = null;
            for (var i = 0; i < opts.length; i++) if (opts[i].offset === off) found = opts[i];
            if (!found) found = opts[0];
            atYear = found.year;
            atMonth = found.month;
        }
        var res = applyPlanPreset(preset, planModalScope, atYear, atMonth);
        if (!res.ok) { document.getElementById('planFormErr').textContent = res.msg; return; }
        refreshPlanUI();
        updateProgressBars(currentYear, currentMonth);
        showToast(res.msg);
        showPlanModal();
    }
}

function buildNumField(id, label, value) {
    var wrap = document.createElement('div');
    wrap.className = 'plan-num';
    var lb = document.createElement('span');
    lb.className = 'plan-num-label';
    lb.textContent = label;
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'modal-input plan-num-input';
    inp.id = id;
    inp.min = '0';
    inp.max = String(PLAN_MAX_DAYS);
    inp.value = String(value);
    wrap.appendChild(lb);
    wrap.appendChild(inp);
    return wrap;
}

function initPlan() {
    var entry = document.getElementById('planEntry');
    if (entry) entry.addEventListener('click', showPlanModal);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePlanModal();
    });

    refreshPlanUI();
}

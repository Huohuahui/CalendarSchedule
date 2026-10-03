/**
 * ============================================================
 * templates.js - 排班模板与批量套用
 * 作用：提供「上五休二 / 上六休一 / 隔天轮换 / 清空本月」等整月模板，
 *       以及「复制上月排班」，把几十次点击压缩成一次操作
 * 说明：所有套用都通过 applyChanges 走历史栈，因此可以用 Ctrl+Z 整批撤销
 * ============================================================
 */

/**
 * 模板定义
 * isOvertime(dateInfo) 返回 true 表示这一天加班，false 表示休息
 */
var SCHEDULE_TEMPLATES = [
    {
        id: 'five-two',
        name: '上五休二',
        icon: '📅',
        desc: '周一至周五加班，周末休息',
        isOvertime: function (d) {
            var w = d.getDay();          // 0=周日 1-5=周一至周五 6=周六
            return w >= 1 && w <= 5;
        }
    },
    {
        id: 'six-one',
        name: '上六休一',
        icon: '🔁',
        desc: '周一至周六加班，周日休息',
        isOvertime: function (d) {
            return d.getDay() !== 0;
        }
    },
    {
        id: 'alternate',
        name: '隔天轮换',
        icon: '🔄',
        desc: '单数日加班，双数日休息',
        isOvertime: function (d) {
            return d.getDate() % 2 === 1;
        }
    },
    {
        id: 'weekday-only',
        name: '仅工作日',
        icon: '💼',
        desc: '工作日加班，周末留空不标记',
        isOvertime: function (d) {
            var w = d.getDay();
            return w >= 1 && w <= 5;
        },
        skipWeekend: true
    }
];

/**
 * 按模板生成某个月的变更列表
 * @param {object} template - SCHEDULE_TEMPLATES 中的一项
 * @param {number} year
 * @param {number} month
 * @returns {Array<{key:string, from:string, to:string}>}
 */
function buildTemplateChanges(template, year, month) {
    var days = getDaysInMonth(year, month);
    var changes = [];
    for (var d = 1; d <= days; d++) {
        var date = new Date(year, month - 1, d);
        var key = formatDate(year, month, d);
        var from = statusMap[key] || 'normal';

        // 「仅工作日」模板跳过周末，不改动周末原有的标记
        if (template.skipWeekend && (date.getDay() === 0 || date.getDay() === 6)) {
            continue;
        }

        changes.push({
            key: key,
            from: from,
            to: template.isOvertime(date) ? 'overtime' : 'rest'
        });
    }
    return changes;
}

/**
 * 生成「复制上月排班」的变更列表
 * 按日期一一对应；上月没有的日期（如 31 号）跳过
 * @returns {Array<{key:string, from:string, to:string}>}
 */
function buildCopyPrevMonthChanges(year, month) {
    var prevYear = (month === 1) ? year - 1 : year;
    var prevMonth = (month === 1) ? 12 : month - 1;

    var days = getDaysInMonth(year, month);
    var prevDays = getDaysInMonth(prevYear, prevMonth);
    var changes = [];

    for (var d = 1; d <= days; d++) {
        if (d > prevDays) continue;       // 上月没有这一天
        var from = statusMap[formatDate(year, month, d)] || 'normal';
        var prevStatus = statusMap[formatDate(prevYear, prevMonth, d)] || 'normal';
        changes.push({
            key: formatDate(year, month, d),
            from: from,
            to: prevStatus
        });
    }
    return changes;
}

/**
 * 应用模板
 */
function applyTemplate(templateId, year, month) {
    var template = null;
    for (var i = 0; i < SCHEDULE_TEMPLATES.length; i++) {
        if (SCHEDULE_TEMPLATES[i].id === templateId) template = SCHEDULE_TEMPLATES[i];
    }
    if (!template) return;

    var changes = buildTemplateChanges(template, year, month);
    var n = applyChanges(changes);
    fullUpdate();
    updateUndoUI();
    showToast(n > 0
        ? '📋 已套用「' + template.name + '」，更新 ' + n + ' 天（可 Ctrl+Z 撤销）'
        : 'ℹ️ 排班无变化');
}

/**
 * 复制上月排班
 */
function copyPrevMonth(year, month) {
    var changes = buildCopyPrevMonthChanges(year, month);
    var n = applyChanges(changes);
    fullUpdate();
    updateUndoUI();
    showToast(n > 0
        ? '📄 已复制上月排班，更新 ' + n + ' 天（可 Ctrl+Z 撤销）'
        : 'ℹ️ 上月无排班可复制');
}

/**
 * 打开排班模板选择弹窗
 */
function showTemplateModal() {
    var existing = document.getElementById('templateModal');
    if (existing) {
        existing.remove();
        return;
    }

    var overlay = document.createElement('div');
    overlay.id = 'templateModal';
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = '📋 套用排班模板';
    modal.appendChild(title);

    var tip = document.createElement('div');
    tip.className = 'modal-label';
    tip.style.textAlign = 'center';
    tip.textContent = '将应用到 ' + currentYear + '年' + currentMonth + '月整月';
    modal.appendChild(tip);

    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';

    SCHEDULE_TEMPLATES.forEach(function (tpl) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'template-item';
        btn.innerHTML =
            '<span class="template-icon">' + tpl.icon + '</span>' +
            '<span class="template-text">' +
            '<span class="template-name">' + tpl.name + '</span>' +
            '<span class="template-desc">' + tpl.desc + '</span>' +
            '</span>';
        btn.onclick = function () {
            overlay.remove();
            applyTemplate(tpl.id, currentYear, currentMonth);
        };
        list.appendChild(btn);
    });

    modal.appendChild(list);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = function () {
        overlay.remove();
    };
    modal.appendChild(cancelBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.onclick = function (e) {
        if (e.target === overlay) overlay.remove();
    };
}

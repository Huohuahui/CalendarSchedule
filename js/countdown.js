/**
 * ============================================================
 * countdown.js - 倒计时功能模块
 * 作用：管理倒计时事项，支持分类选择和置顶
 * 数据存储：localStorage，键名 'countdownList'
 *
 * 说明：
 * - 「添加」与「编辑」弹窗合并为 showCountdownModal(mode, item)，
 *   消除了原先约 250 行的重复代码
 * - 分类/子类型/置顶的选择状态由变量维护，
 *   不再通过比对按钮内联样式颜色反查
 * ============================================================
 */

// ---------- 常量 ----------
var COUNTDOWN_STORAGE_KEY = 'countdownList';
var MAX_COUNTDOWN = 4;
var MAX_NAME_LENGTH = 6;

// ---------- 分类数据 ----------
var CATEGORY_DATA = {
    '工作': {
        color: 'var(--primary)',
        subCategories: [
            { id: 'project', name: '项目截止', icon: '📋' },
            { id: 'report', name: '汇报/周报', icon: '📊' },
            { id: 'delivery', name: '客户交付', icon: '💼' },
            { id: 'meeting', name: '会议/面试', icon: '📅' },
            { id: 'document', name: '文档/合同', icon: '📝' }
        ]
    },
    '个人': {
        color: 'var(--rest)',
        subCategories: [
            { id: 'salary', name: '发工资', icon: '💰' },
            { id: 'birthday', name: '生日/纪念日', icon: '🎂' },
            { id: 'travel', name: '旅行/出行', icon: '✈️' },
            { id: 'study', name: '学习/考试', icon: '📚' },
            { id: 'health', name: '体检/健康', icon: '🏥' },
            { id: 'shopping', name: '购物/抢购', icon: '🎁' },
            { id: 'festival', name: '节日', icon: '🎉' },
            { id: 'holiday', name: '假日', icon: '🏖️' }
        ]
    }
};

var CATEGORY_NAMES = Object.keys(CATEGORY_DATA);

function getSubIcon(category, subCategoryId) {
    var catInfo = CATEGORY_DATA[category];
    if (!catInfo) return '📌';
    for (var i = 0; i < catInfo.subCategories.length; i++) {
        if (catInfo.subCategories[i].id === subCategoryId) {
            return catInfo.subCategories[i].icon;
        }
    }
    return '📌';
}

// ---------- 日期工具 ----------

/**
 * 解析 'YYYY-MM-DD' 为本地时区的 Date
 * 直接 new Date('YYYY-MM-DD') 会按 UTC 解析，存在跨时区差一天的风险
 */
function parseDateOnly(str) {
    var p = String(str).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

/** 今天 'YYYY-MM-DD'（本地时区）— 实现统一在 utils.js 的 todayStr() */
function todayDateStr() {
    return todayStr();
}

// ---------- 数据操作 ----------

function loadCountdownList() {
    try {
        var stored = localStorage.getItem(COUNTDOWN_STORAGE_KEY);
        if (stored) {
            var parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return sanitizeCountdowns(parsed);
            }
        }
        return [];
    } catch (e) {
        return [];
    }
}

/**
 * 清洗倒计时列表
 *
 * statuses / todos / plan 都有各自的清洗函数，这里之前是缺口：
 * 导入时只判断「是不是数组」就整包入库，缺字段的条目会在渲染时露出 undefined。
 * 所有入库入口（导入备份、云端恢复、启动加载）都必须过这里。
 *
 * @param {Array} raw 外部数据
 * @returns {Array} 只含合法条目的新数组
 */
function sanitizeCountdowns(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length && out.length < MAX_COUNTDOWN; i++) {
        var it = raw[i];
        if (!it || typeof it !== 'object' || Array.isArray(it)) continue;

        var name = (typeof it.name === 'string') ? it.name.trim().slice(0, 20) : '';
        var date = (typeof it.targetDate === 'string') ? it.targetDate : '';
        if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (seen[name]) continue;                       // 同名去重，与新增时的校验一致
        seen[name] = 1;

        var category = CATEGORY_DATA[it.category] ? it.category : CATEGORY_NAMES[0];
        var subCategory = (typeof it.subCategory === 'string') ? it.subCategory : '';

        out.push({
            id: (typeof it.id === 'string' && it.id) ? it.id.slice(0, 60) : ('cd_' + Date.now() + '_' + out.length),
            name: name,
            targetDate: date,
            category: category,
            subCategory: subCategory,
            subIcon: getSubIcon(category, subCategory),  // 不信任存储里的图标，按分类现算
            pinned: it.pinned === true
        });
    }
    return out;
}

function saveCountdownList(list) {
    try {
        localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('保存倒计时失败:', e);
        if (typeof showToast === 'function') {
            showToast('⚠️ 本地保存失败，请勿刷新页面');
        }
    }
}

function addCountdownItem(name, targetDate, category, subCategory, pinned) {
    var list = loadCountdownList();
    if (list.length >= MAX_COUNTDOWN) {
        showToast('⚠️ 最多只能添加 ' + MAX_COUNTDOWN + ' 个倒计时');
        return false;
    }
    for (var i = 0; i < list.length; i++) {
        if (list[i].name === name) {
            showToast('⚠️ 已存在同名事项，请修改名称');
            return false;
        }
    }

    // 如果置顶，取消其他置顶
    if (pinned) {
        for (var j = 0; j < list.length; j++) {
            list[j].pinned = false;
        }
    }

    list.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: name,
        targetDate: targetDate,
        category: category,
        subCategory: subCategory,
        subIcon: getSubIcon(category, subCategory),
        pinned: pinned || false,
        createTime: new Date().toISOString()
    });
    saveCountdownList(list);
    renderCountdownList();
    if (typeof analyticsTrack === 'function') analyticsTrack('countdown_add');
    return true;
}

function deleteCountdownItem(id) {
    var list = loadCountdownList();
    var newList = [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) {
            newList.push(list[i]);
        }
    }
    saveCountdownList(newList);
    renderCountdownList();
}

/** 计算每个事项的剩余天数/是否已过/是否今天 */
function updateCountdownItems() {
    var list = loadCountdownList();
    var now = new Date();
    now.setHours(0, 0, 0, 0);

    for (var i = 0; i < list.length; i++) {
        var target = parseDateOnly(list[i].targetDate);
        target.setHours(0, 0, 0, 0);
        var diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
        list[i].daysLeft = diff;
        list[i].isPassed = diff < 0;
        list[i].isToday = diff === 0;
    }
    return list;
}

function getCategoryColor(category) {
    var info = CATEGORY_DATA[category];
    return info ? info.color : 'var(--text-tertiary)';
}

function getCategoryLabel(category) {
    return category || '未分类';
}

// ---------- 渲染 ----------

function renderCountdownList() {
    var container = document.getElementById('countdownList');
    if (!container) return;

    var items = updateCountdownItems();
    container.innerHTML = '';

    if (items.length === 0) {
        var emptyDiv = document.createElement('div');
        emptyDiv.className = 'countdown-empty';
        emptyDiv.textContent = '暂无倒计时，点击 ✚ 添加';
        container.appendChild(emptyDiv);
        return;
    }

    // 排序：置顶的排在最前面，然后按天数排序
    items.sort(function (a, b) {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return a.daysLeft - b.daysLeft;
    });

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var category = item.category || '工作';
        var catColor = getCategoryColor(category);
        var categoryLabel = getCategoryLabel(category);
        var subIcon = item.subIcon || getSubIcon(category, item.subCategory) || '📌';
        var isPinned = item.pinned === true;

        var card = document.createElement('div');
        card.className = 'countdown-card' + (isPinned ? ' pinned' : '');
        card.setAttribute('aria-label', '倒计时：' + item.name);
        makeFocusableButton(card);
        card.onclick = (function (it) {
            return function () { showActionModal(it); };
        })(item);

        // 左侧：名称行 + 分类/日期行
        var leftDiv = document.createElement('div');
        leftDiv.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

        var topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

        var subIconSpan = document.createElement('span');
        subIconSpan.textContent = subIcon;
        subIconSpan.style.cssText = 'font-size:0.7rem;';
        topRow.appendChild(subIconSpan);

        var nameSpan = document.createElement('div');
        var displayName = item.name;
        if (displayName.length > MAX_NAME_LENGTH) {
            displayName = displayName.substring(0, MAX_NAME_LENGTH) + '…';
        }
        nameSpan.textContent = displayName;
        nameSpan.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;';
        nameSpan.title = item.name;
        topRow.appendChild(nameSpan);

        if (isPinned) {
            var pinIcon = document.createElement('span');
            pinIcon.textContent = '📌';
            pinIcon.style.cssText = 'font-size:0.55rem;color:var(--warn);';
            topRow.appendChild(pinIcon);
        }

        leftDiv.appendChild(topRow);

        var bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

        var catTag = document.createElement('span');
        catTag.textContent = categoryLabel;
        catTag.style.cssText = 'font-size:0.45rem;font-weight:600;color:' + catColor + ';';
        bottomRow.appendChild(catTag);

        var dateSpan = document.createElement('span');
        dateSpan.textContent = '📅 ' + item.targetDate;
        dateSpan.style.cssText = 'font-size:0.5rem;color:var(--text-muted);';
        bottomRow.appendChild(dateSpan);
        leftDiv.appendChild(bottomRow);

        // 右侧：天数徽章
        var rightDiv = document.createElement('div');
        rightDiv.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';

        var badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.55rem;font-weight:700;padding:2px 4px;border-radius:12px;white-space:nowrap;display:inline-block;width:52px;text-align:center;box-sizing:border-box;';

        if (item.isToday) {
            badge.textContent = '🎉 今天';
            badge.style.color = 'var(--rest)';
            badge.style.background = 'var(--rest-bg)';
        } else if (item.isPassed) {
            badge.textContent = '✅ 已过';
            badge.style.color = 'var(--text-tertiary)';
            badge.style.background = 'var(--surface-2)';
        } else {
            var d = item.daysLeft;
            var color = d <= 3 ? 'var(--overtime)' : d <= 7 ? 'var(--warn)' : 'var(--primary)';
            var bg = d <= 3 ? 'var(--overtime-bg)' : d <= 7 ? 'var(--warn-bg)' : 'var(--primary-bg)';
            badge.textContent = '⏳ ' + d + '天';
            badge.style.color = color;
            badge.style.background = bg;
        }
        rightDiv.appendChild(badge);

        card.appendChild(leftDiv);
        card.appendChild(rightDiv);
        container.appendChild(card);
    }
}

// ---------- 操作弹窗（编辑 / 删除菜单） ----------

function showActionModal(item) {
    var existing = document.getElementById('actionModal');
    if (existing) {
        existing.remove();
        return;
    }

    var overlay = document.createElement('div');
    overlay.id = 'actionModal';
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.2)';
    overlay.style.backdropFilter = 'none';

    var modal = document.createElement('div');
    modal.className = 'modal-box';
    modal.style.cssText += 'padding:8px 0;min-width:140px;';

    var editBtn = document.createElement('div');
    editBtn.className = 'action-menu-item';
    editBtn.textContent = '✏️ 编辑';
    editBtn.setAttribute('aria-label', '编辑');
    makeFocusableButton(editBtn);
    editBtn.onclick = function () {
        overlay.remove();
        showCountdownModal('edit', item);
    };
    modal.appendChild(editBtn);

    var deleteBtn = document.createElement('div');
    deleteBtn.className = 'action-menu-item danger';
    deleteBtn.textContent = '🗑️ 删除';
    deleteBtn.setAttribute('aria-label', '删除');
    makeFocusableButton(deleteBtn);
    deleteBtn.onclick = function () {
        if (confirm('确定要删除「' + item.name + '」吗？')) {
            deleteCountdownItem(item.id);
        }
        overlay.remove();
    };
    modal.appendChild(deleteBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.onclick = function (e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// ---------- 添加 / 编辑弹窗（合并版） ----------

/**
 * 打开倒计时弹窗
 * @param {string} mode - 'add' 新增 | 'edit' 编辑
 * @param {object} [item] - 编辑模式下要修改的事项
 */
function showCountdownModal(mode, item) {
    var isEdit = (mode === 'edit');

    // 弹窗已打开时再次触发 = 关闭（保留旧行为）
    var existing = document.getElementById('countdownModal');
    if (existing) {
        existing.remove();
        return;
    }

    // 新增模式下检查数量上限
    if (!isEdit && loadCountdownList().length >= MAX_COUNTDOWN) {
        showToast('⚠️ 最多只能添加 ' + MAX_COUNTDOWN + ' 个倒计时');
        return;
    }

    // 初值：编辑用原数据，新增用默认值
    var defaults = isEdit
        ? {
            name: item.name || '',
            targetDate: item.targetDate || todayDateStr(),
            category: item.category || '工作',
            subCategory: item.subCategory || 'project',
            pinned: item.pinned === true
        }
        : {
            name: '',
            targetDate: todayDateStr(),
            category: '工作',
            subCategory: 'project',
            pinned: false
        };

    var selectedCategory = defaults.category;
    var selectedSub = defaults.subCategory;
    var selectedPinned = defaults.pinned;

    var overlay = document.createElement('div');
    overlay.id = 'countdownModal';
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal-box';

    var title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = isEdit ? '✏️ 修改倒计时' : '⏱️ 添加倒计时';
    modal.appendChild(title);

    var nameLabel = document.createElement('div');
    nameLabel.className = 'modal-label';
    nameLabel.textContent = '事项名称（最多' + MAX_NAME_LENGTH + '个字）';
    modal.appendChild(nameLabel);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'modal-input';
    nameInput.placeholder = '例如：发工资';
    nameInput.maxLength = MAX_NAME_LENGTH;
    nameInput.value = defaults.name;
    modal.appendChild(nameInput);

    var catLabel = document.createElement('div');
    catLabel.className = 'modal-label';
    catLabel.textContent = '类型';
    modal.appendChild(catLabel);

    var catContainer = document.createElement('div');
    catContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;';
    modal.appendChild(catContainer);

    var subLabel = document.createElement('div');
    subLabel.className = 'modal-label';
    subLabel.textContent = '子类型';
    modal.appendChild(subLabel);

    var subContainer = document.createElement('div');
    subContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;';
    modal.appendChild(subContainer);

    /** 刷新容器内按钮的选中态（由 dataset.selected 驱动） */
    function refreshChipStyles(container) {
        container.querySelectorAll('button').forEach(function (b) {
            b.classList.toggle('chip-selected', b.dataset.selected === '1');
        });
    }

    // 类型按钮
    CATEGORY_NAMES.forEach(function (catName) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-btn';
        btn.textContent = catName;
        btn.dataset.selected = (catName === selectedCategory) ? '1' : '0';
        btn.onclick = function () {
            selectedCategory = catName;
            // 单选：重置同组其他按钮
            catContainer.querySelectorAll('button').forEach(function (b) {
                b.dataset.selected = (b === btn) ? '1' : '0';
            });
            refreshChipStyles(catContainer);
            updateSubCategories(catName);
        };
        catContainer.appendChild(btn);
    });

    // 子类型按钮
    function updateSubCategories(category) {
        subContainer.innerHTML = '';
        var catInfo = CATEGORY_DATA[category];
        if (!catInfo) return;

        catInfo.subCategories.forEach(function (sub) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip-btn sub-chip';
            btn.textContent = sub.icon + ' ' + sub.name;
            btn.dataset.subId = sub.id;
            btn.dataset.selected = (sub.id === selectedSub) ? '1' : '0';
            btn.onclick = function () {
                selectedSub = this.dataset.subId;
                subContainer.querySelectorAll('button').forEach(function (b) {
                    b.dataset.selected = (b === btn) ? '1' : '0';
                });
                refreshChipStyles(subContainer);
            };
            subContainer.appendChild(btn);
        });
        refreshChipStyles(subContainer);
    }

    updateSubCategories(selectedCategory);

    var dateLabel = document.createElement('div');
    dateLabel.className = 'modal-label';
    dateLabel.textContent = '目标日期';
    modal.appendChild(dateLabel);

    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'modal-input';
    dateInput.style.marginBottom = '16px';
    dateInput.value = defaults.targetDate;
    modal.appendChild(dateInput);

    // ⭐ 置顶选项
    var pinLabel = document.createElement('div');
    pinLabel.className = 'modal-label';
    pinLabel.textContent = '置顶';
    modal.appendChild(pinLabel);

    var pinContainer = document.createElement('div');
    pinContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:14px;';

    var pinYesBtn = document.createElement('button');
    pinYesBtn.type = 'button';
    pinYesBtn.className = 'chip-btn';
    pinYesBtn.textContent = '📌 置顶';
    pinYesBtn.dataset.selected = selectedPinned ? '1' : '0';

    var pinNoBtn = document.createElement('button');
    pinNoBtn.type = 'button';
    pinNoBtn.className = 'chip-btn';
    pinNoBtn.textContent = '不置顶';
    pinNoBtn.dataset.selected = selectedPinned ? '0' : '1';

    function refreshPinStyles() {
        pinYesBtn.dataset.selected = selectedPinned ? '1' : '0';
        pinNoBtn.dataset.selected = selectedPinned ? '0' : '1';
        refreshChipStyles(pinContainer);
    }

    pinYesBtn.onclick = function () {
        selectedPinned = true;
        refreshPinStyles();
    };
    pinNoBtn.onclick = function () {
        selectedPinned = false;
        refreshPinStyles();
    };

    pinContainer.appendChild(pinYesBtn);
    pinContainer.appendChild(pinNoBtn);
    refreshChipStyles(pinContainer);
    modal.appendChild(pinContainer);

    // 按钮组
    var btnGroup = document.createElement('div');
    btnGroup.className = 'modal-btn-group';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = function () {
        overlay.remove();
    };
    btnGroup.appendChild(cancelBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'modal-btn modal-btn-primary';
    confirmBtn.textContent = isEdit ? '保存' : '确定';
    confirmBtn.onclick = function () {
        var name = nameInput.value.trim();
        var date = dateInput.value;
        if (!name) {
            showToast('⚠️ 请输入事项名称');
            return;
        }
        if (!date) {
            showToast('⚠️ 请选择目标日期');
            return;
        }

        if (isEdit) {
            var list = loadCountdownList();

            // 置顶时取消其他事项的置顶
            if (selectedPinned) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id !== item.id) {
                        list[i].pinned = false;
                    }
                }
            }

            for (var j = 0; j < list.length; j++) {
                if (list[j].id === item.id) {
                    list[j].name = name;
                    list[j].targetDate = date;
                    list[j].category = selectedCategory;
                    list[j].subCategory = selectedSub;
                    list[j].subIcon = getSubIcon(selectedCategory, selectedSub);
                    list[j].pinned = selectedPinned;
                    break;
                }
            }
            saveCountdownList(list);
            renderCountdownList();
            overlay.remove();
            showToast('✅ 已更新倒计时');
        } else {
            var success = addCountdownItem(name, date, selectedCategory, selectedSub, selectedPinned);
            if (success) {
                overlay.remove();
                showToast('✅ 已添加倒计时');
            }
        }
    };
    btnGroup.appendChild(confirmBtn);

    modal.appendChild(btnGroup);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function () {
        nameInput.focus();
        if (isEdit) nameInput.select();
    }, 100);

    overlay.onclick = function (e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// ---------- 初始化 ----------

function initCountdown() {
    renderCountdownList();

    // Esc 由 overlay.js 统一处理（操作菜单在编辑弹窗之上，优先级略高）
    registerOverlayCloser(25, function () {
        var el = document.getElementById('actionModal');
        if (!el) return false;
        el.remove();
        return true;
    });
    registerOverlayCloser(20, function () {
        var el = document.getElementById('countdownModal');
        if (!el) return false;
        el.remove();
        return true;
    });

    var addBtn = document.getElementById('addCountdownBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            showCountdownModal('add');
        });
    }

    // 倒计时数据只精确到天，5 分钟刷新一次足够；
    // 低频刷新也避免了每分钟全量重建 DOM 打断悬停交互
    setInterval(renderCountdownList, 5 * 60 * 1000);
}

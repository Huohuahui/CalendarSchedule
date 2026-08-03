/**
 * ============================================================
 * countdown.js - 倒计时功能模块
 * 作用：管理倒计时事项，支持分类选择和置顶
 * 数据存储：localStorage，键名 'countdownList'
 * ============================================================
 */

// ---------- 常量 ----------
var COUNTDOWN_STORAGE_KEY = 'countdownList';
var MAX_COUNTDOWN = 4;
var MAX_NAME_LENGTH = 6;

// ---------- 分类数据 ----------
var CATEGORY_DATA = {
    '工作': {
        color: '#3b82f6',
        subCategories: [
            { id: 'project', name: '项目截止', icon: '📋' },
            { id: 'report', name: '汇报/周报', icon: '📊' },
            { id: 'delivery', name: '客户交付', icon: '💼' },
            { id: 'meeting', name: '会议/面试', icon: '📅' },
            { id: 'document', name: '文档/合同', icon: '📝' }
        ]
    },
    '个人': {
        color: '#16a34a',
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

// ---------- 数据操作 ----------

function loadCountdownList() {
    try {
        var stored = localStorage.getItem(COUNTDOWN_STORAGE_KEY);
        if (stored) {
            var parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
        return [];
    } catch (e) {
        return [];
    }
}

function saveCountdownList(list) {
    localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(list));
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
    
    var subIcon = getSubIcon(category, subCategory);
    
    list.push({
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: name,
        targetDate: targetDate,
        category: category,
        subCategory: subCategory,
        subIcon: subIcon,
        pinned: pinned || false,
        createTime: new Date().toISOString()
    });
    saveCountdownList(list);
    renderCountdownList();
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

function updateCountdownItems() {
    var list = loadCountdownList();
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    
    for (var i = 0; i < list.length; i++) {
        var target = new Date(list[i].targetDate);
        target.setHours(0, 0, 0, 0);
        var diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
        list[i].daysLeft = diff;
        list[i].isPassed = diff < 0;
        list[i].isToday = diff === 0;
    }
    return list;
}

function getCategoryColor(category) {
    var info = CATEGORY_DATA[category];
    return info ? info.color : '#64748b';
}

function getCategoryLabel(category) {
    return category || '未分类';
}

// ---------- 操作弹窗 ----------

function showActionModal(item) {
    var existing = document.getElementById('actionModal');
    if (existing) {
        existing.parentNode.removeChild(existing);
        return;
    }
    
    var overlay = document.createElement('div');
    overlay.id = 'actionModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:16px;padding:8px 0;min-width:140px;box-shadow:0 20px 60px rgba(0,0,0,0.15);';
    
    var editBtn = document.createElement('div');
    editBtn.textContent = '✏️ 编辑';
    editBtn.style.cssText = 'padding:12px 20px;font-size:0.85rem;color:#1e293b;cursor:pointer;transition:0.15s;border-bottom:1px solid #f1f4f9;';
    editBtn.onmouseover = function() { this.style.background = '#f1f4f9'; };
    editBtn.onmouseout = function() { this.style.background = 'transparent'; };
    editBtn.onclick = function() {
        overlay.remove();
        showEditCountdownModal(item);
    };
    modal.appendChild(editBtn);
    
    var deleteBtn = document.createElement('div');
    deleteBtn.textContent = '🗑️ 删除';
    deleteBtn.style.cssText = 'padding:12px 20px;font-size:0.85rem;color:#dc2626;cursor:pointer;transition:0.15s;border-radius:0 0 16px 16px;';
    deleteBtn.onmouseover = function() { this.style.background = '#fef2f2'; };
    deleteBtn.onmouseout = function() { this.style.background = 'transparent'; };
    deleteBtn.onclick = function() {
        if (confirm('确定要删除「' + item.name + '」吗？')) {
            deleteCountdownItem(item.id);
        }
        overlay.remove();
    };
    modal.appendChild(deleteBtn);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// ---------- 修改弹窗 ----------

function showEditCountdownModal(item) {
    var existing = document.getElementById('countdownModal');
    if (existing) {
        existing.parentNode.removeChild(existing);
        return;
    }
    
    var overlay = document.createElement('div');
    overlay.id = 'countdownModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:24px 28px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);';
    
    var title = document.createElement('div');
    title.textContent = '✏️ 修改倒计时';
    title.style.cssText = 'font-size:1rem;font-weight:700;color:#0f172a;margin-bottom:14px;text-align:center;';
    modal.appendChild(title);
    
    var nameLabel = document.createElement('div');
    nameLabel.textContent = '事项名称（最多' + MAX_NAME_LENGTH + '个字）';
    nameLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(nameLabel);
    
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'countdownNameInput';
    nameInput.placeholder = '例如：发工资';
    nameInput.maxLength = MAX_NAME_LENGTH;
    nameInput.value = item.name;
    nameInput.style.cssText = 'width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.85rem;outline:none;transition:0.2s;box-sizing:border-box;margin-bottom:14px;';
    nameInput.onfocus = function() { this.style.borderColor = '#3b82f6'; };
    nameInput.onblur = function() { this.style.borderColor = '#e2e8f0'; };
    modal.appendChild(nameInput);
    
    var catLabel = document.createElement('div');
    catLabel.textContent = '类型';
    catLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(catLabel);
    
    var catContainer = document.createElement('div');
    catContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;';
    
    var selectedCategory = item.category || '工作';
    var selectedSub = item.subCategory || 'project';
    
    for (var c = 0; c < CATEGORY_NAMES.length; c++) {
        var catName = CATEGORY_NAMES[c];
        var catInfo = CATEGORY_DATA[catName];
        var btn = document.createElement('button');
        btn.textContent = catName;
        btn.style.cssText = 'flex:1;padding:6px 0;border:2px solid ' + (selectedCategory === catName ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (selectedCategory === catName ? '#dbeafe' : 'transparent') + ';font-size:0.75rem;font-weight:600;color:' + (selectedCategory === catName ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
        btn.onclick = (function(cat) {
            return function() {
                var btns = catContainer.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) {
                    btns[b].style.borderColor = '#e2e8f0';
                    btns[b].style.background = 'transparent';
                    btns[b].style.color = '#64748b';
                }
                this.style.borderColor = '#3b82f6';
                this.style.background = '#dbeafe';
                this.style.color = '#2563eb';
                selectedCategory = cat;
                updateSubCategories(cat);
            };
        })(catName);
        catContainer.appendChild(btn);
    }
    modal.appendChild(catContainer);
    
    var subLabel = document.createElement('div');
    subLabel.textContent = '子类型';
    subLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(subLabel);
    
    var subContainer = document.createElement('div');
    subContainer.id = 'subCategoryContainer';
    subContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;';
    modal.appendChild(subContainer);
    
    function updateSubCategories(category) {
        subContainer.innerHTML = '';
        var catInfo = CATEGORY_DATA[category];
        if (!catInfo) return;
        
        for (var s = 0; s < catInfo.subCategories.length; s++) {
            var sub = catInfo.subCategories[s];
            var isSelected = (category === selectedCategory && sub.id === selectedSub);
            var btn = document.createElement('button');
            btn.textContent = sub.icon + ' ' + sub.name;
            btn.style.cssText = 'padding:4px 12px;border:2px solid ' + (isSelected ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (isSelected ? '#dbeafe' : 'transparent') + ';font-size:0.7rem;font-weight:500;color:' + (isSelected ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
            btn.dataset.subId = sub.id;
            btn.onclick = function() {
                var btns = subContainer.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) {
                    btns[b].style.borderColor = '#e2e8f0';
                    btns[b].style.background = 'transparent';
                    btns[b].style.color = '#64748b';
                }
                this.style.borderColor = '#3b82f6';
                this.style.background = '#dbeafe';
                this.style.color = '#2563eb';
                selectedSub = this.dataset.subId;
            };
            subContainer.appendChild(btn);
        }
    }
    
    updateSubCategories(selectedCategory);
    
    var dateLabel = document.createElement('div');
    dateLabel.textContent = '目标日期';
    dateLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(dateLabel);
    
    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'countdownDateInput';
    dateInput.value = item.targetDate;
    dateInput.style.cssText = 'width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.85rem;outline:none;transition:0.2s;box-sizing:border-box;margin-bottom:16px;';
    dateInput.onfocus = function() { this.style.borderColor = '#3b82f6'; };
    dateInput.onblur = function() { this.style.borderColor = '#e2e8f0'; };
    modal.appendChild(dateInput);
    
    // ⭐ 置顶选项
    var pinLabel = document.createElement('div');
    pinLabel.textContent = '置顶';
    pinLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:6px;';
    modal.appendChild(pinLabel);
    
    var pinContainer = document.createElement('div');
    pinContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:14px;';
    
    var pinYesBtn = document.createElement('button');
    pinYesBtn.textContent = '📌 置顶';
    var isPinned = item.pinned === true;
    pinYesBtn.style.cssText = 'flex:1;padding:6px 0;border:2px solid ' + (isPinned ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (isPinned ? '#dbeafe' : 'transparent') + ';font-size:0.75rem;font-weight:600;color:' + (isPinned ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
    pinYesBtn.onclick = function() {
        pinYesBtn.style.borderColor = '#3b82f6';
        pinYesBtn.style.background = '#dbeafe';
        pinYesBtn.style.color = '#2563eb';
        pinNoBtn.style.borderColor = '#e2e8f0';
        pinNoBtn.style.background = 'transparent';
        pinNoBtn.style.color = '#64748b';
        selectedPinned = true;
    };
    pinContainer.appendChild(pinYesBtn);
    
    var pinNoBtn = document.createElement('button');
    pinNoBtn.textContent = '不置顶';
    pinNoBtn.style.cssText = 'flex:1;padding:6px 0;border:2px solid ' + (!isPinned ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (!isPinned ? '#dbeafe' : 'transparent') + ';font-size:0.75rem;font-weight:600;color:' + (!isPinned ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
    pinNoBtn.onclick = function() {
        pinNoBtn.style.borderColor = '#3b82f6';
        pinNoBtn.style.background = '#dbeafe';
        pinNoBtn.style.color = '#2563eb';
        pinYesBtn.style.borderColor = '#e2e8f0';
        pinYesBtn.style.background = 'transparent';
        pinYesBtn.style.color = '#64748b';
        selectedPinned = false;
    };
    pinContainer.appendChild(pinNoBtn);
    
    modal.appendChild(pinContainer);
    
    var selectedPinned = isPinned;
    
    // 按钮
    var btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:10px;';
    
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'flex:1;padding:8px 0;border:1.5px solid #e2e8f0;border-radius:10px;background:transparent;font-size:0.8rem;font-weight:500;color:#64748b;cursor:pointer;transition:0.2s;';
    cancelBtn.onmouseover = function() { this.style.background = '#f1f4f9'; };
    cancelBtn.onmouseout = function() { this.style.background = 'transparent'; };
    cancelBtn.onclick = function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    btnGroup.appendChild(cancelBtn);
    
    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = '保存';
    confirmBtn.style.cssText = 'flex:1;padding:8px 0;border:none;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);font-size:0.8rem;font-weight:600;color:white;cursor:pointer;transition:0.2s;';
    confirmBtn.onmouseover = function() { this.style.opacity = '0.9'; };
    confirmBtn.onmouseout = function() { this.style.opacity = '1'; };
    confirmBtn.onclick = function() {
        var name = document.getElementById('countdownNameInput').value.trim();
        var date = document.getElementById('countdownDateInput').value;
        if (!name) {
            showToast('⚠️ 请输入事项名称');
            return;
        }
        if (!date) {
            showToast('⚠️ 请选择目标日期');
            return;
        }
        
        var catBtns = catContainer.querySelectorAll('button');
        var selectedCat = '工作';
        for (var cb = 0; cb < catBtns.length; cb++) {
            if (catBtns[cb].style.borderColor === 'rgb(59, 130, 246)' || catBtns[cb].style.borderColor === '#3b82f6') {
                selectedCat = catBtns[cb].textContent.trim();
                break;
            }
        }
        
        var subBtns = subContainer.querySelectorAll('button');
        var selectedSubId = 'project';
        for (var sb = 0; sb < subBtns.length; sb++) {
            if (subBtns[sb].style.borderColor === 'rgb(59, 130, 246)' || subBtns[sb].style.borderColor === '#3b82f6') {
                selectedSubId = subBtns[sb].dataset.subId;
                break;
            }
        }
        
        var list = loadCountdownList();
        
        // 如果置顶，取消其他置顶
        if (selectedPinned) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].id !== item.id) {
                    list[i].pinned = false;
                }
            }
        }
        
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === item.id) {
                list[i].name = name;
                list[i].targetDate = date;
                list[i].category = selectedCat;
                list[i].subCategory = selectedSubId;
                list[i].subIcon = getSubIcon(selectedCat, selectedSubId);
                list[i].pinned = selectedPinned;
                break;
            }
        }
        saveCountdownList(list);
        renderCountdownList();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        showToast('✅ 已更新倒计时');
    };
    btnGroup.appendChild(confirmBtn);
    
    modal.appendChild(btnGroup);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    setTimeout(function() {
        nameInput.focus();
        nameInput.select();
    }, 100);
    
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            overlay.parentNode.removeChild(overlay);
        }
    };
}

// ---------- 渲染 ----------

function renderCountdownList() {
    var container = document.getElementById('countdownList');
    if (!container) return;
    
    var items = updateCountdownItems();
    container.innerHTML = '';
    
    if (items.length === 0) {
        var emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'font-size:0.65rem;color:#94a3b8;text-align:center;padding:8px 0;';
        emptyDiv.textContent = '暂无倒计时，点击 ✚ 添加';
        container.appendChild(emptyDiv);
        return;
    }
    
    // 排序：置顶的排在最前面，然后按天数排序
    items.sort(function(a, b) {
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
        card.className = 'countdown-card';
        // ⭐ 置顶卡片添加金色边框
        var borderColor = isPinned ? '#f59e0b' : '#e9edf3';
        var shadow = isPinned ? '0 2px 12px rgba(245, 158, 11, 0.15)' : '0 1px 3px rgba(0,0,0,0.04)';
        card.style.cssText = 'background:white;border-radius:10px;padding:12px 18px;margin-bottom:6px;border:2px solid ' + borderColor + ';box-shadow:' + shadow + ';display:flex;align-items:center;justify-content:space-between;transition:0.2s;cursor:pointer;box-sizing:border-box;';
        
        card.onmouseover = function() { 
            this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; 
            this.style.transform = 'translateY(-2px)';
        };
        card.onmouseout = function() { 
            this.style.boxShadow = shadow; 
            this.style.transform = 'translateY(0)';
        };
        
        card.onclick = (function(item) {
            return function() { showActionModal(item); };
        })(item);
        
        // 左侧
        var leftDiv = document.createElement('div');
        leftDiv.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';
        
        // 第一行：子类型图标 + 名称 + 置顶标记
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
        nameSpan.style.cssText = 'font-size:0.7rem;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;';
        nameSpan.title = item.name;
        topRow.appendChild(nameSpan);
        
        // 置顶标记
        if (isPinned) {
            var pinIcon = document.createElement('span');
            pinIcon.textContent = '📌';
            pinIcon.style.cssText = 'font-size:0.55rem;color:#f59e0b;';
            topRow.appendChild(pinIcon);
        }
        
        leftDiv.appendChild(topRow);
        
        // 第二行：分类标签 + 日期
        var bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        
        var catTag = document.createElement('span');
        catTag.textContent = categoryLabel;
        catTag.style.cssText = 'font-size:0.45rem;font-weight:600;color:' + catColor + ';';
        bottomRow.appendChild(catTag);
        
        var dateSpan = document.createElement('span');
        dateSpan.textContent = '📅 ' + item.targetDate;
        dateSpan.style.cssText = 'font-size:0.5rem;color:#94a3b8;';
        bottomRow.appendChild(dateSpan);
        leftDiv.appendChild(bottomRow);
        
        // 右侧：天数徽章
        var rightDiv = document.createElement('div');
        rightDiv.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
        
        var badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.55rem;font-weight:700;padding:2px 4px;border-radius:12px;white-space:nowrap;display:inline-block;width:52px;text-align:center;box-sizing:border-box;';
        
        if (item.isToday) {
            badge.textContent = '🎉 今天';
            badge.style.color = '#16a34a';
            badge.style.background = '#dcfce7';
        } else if (item.isPassed) {
            badge.textContent = '✅ 已过';
            badge.style.color = '#64748b';
            badge.style.background = '#f1f4f9';
        } else {
            var d = item.daysLeft;
            var color = d <= 3 ? '#dc2626' : d <= 7 ? '#f59e0b' : '#3b82f6';
            var bg = d <= 3 ? '#fee2e2' : d <= 7 ? '#fef3c7' : '#dbeafe';
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

// ---------- 添加弹窗 ----------

function showAddCountdownModal() {
    var list = loadCountdownList();
    if (list.length >= MAX_COUNTDOWN) {
        showToast('⚠️ 最多只能添加 ' + MAX_COUNTDOWN + ' 个倒计时');
        return;
    }
    
    var existing = document.getElementById('countdownModal');
    if (existing) {
        existing.parentNode.removeChild(existing);
        return;
    }
    
    var overlay = document.createElement('div');
    overlay.id = 'countdownModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:24px 28px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);';
    
    var title = document.createElement('div');
    title.textContent = '⏱️ 添加倒计时';
    title.style.cssText = 'font-size:1rem;font-weight:700;color:#0f172a;margin-bottom:14px;text-align:center;';
    modal.appendChild(title);
    
    var nameLabel = document.createElement('div');
    nameLabel.textContent = '事项名称（最多' + MAX_NAME_LENGTH + '个字）';
    nameLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(nameLabel);
    
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'countdownNameInput';
    nameInput.placeholder = '例如：发工资';
    nameInput.maxLength = MAX_NAME_LENGTH;
    nameInput.style.cssText = 'width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.85rem;outline:none;transition:0.2s;box-sizing:border-box;margin-bottom:14px;';
    nameInput.onfocus = function() { this.style.borderColor = '#3b82f6'; };
    nameInput.onblur = function() { this.style.borderColor = '#e2e8f0'; };
    modal.appendChild(nameInput);
    
    var catLabel = document.createElement('div');
    catLabel.textContent = '类型';
    catLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(catLabel);
    
    var catContainer = document.createElement('div');
    catContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;';
    
    var selectedCategory = '工作';
    var selectedSub = 'project';
    
    for (var c = 0; c < CATEGORY_NAMES.length; c++) {
        var catName = CATEGORY_NAMES[c];
        var catInfo = CATEGORY_DATA[catName];
        var btn = document.createElement('button');
        btn.textContent = catName;
        btn.style.cssText = 'flex:1;padding:6px 0;border:2px solid ' + (selectedCategory === catName ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (selectedCategory === catName ? '#dbeafe' : 'transparent') + ';font-size:0.75rem;font-weight:600;color:' + (selectedCategory === catName ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
        btn.onclick = (function(cat) {
            return function() {
                var btns = catContainer.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) {
                    btns[b].style.borderColor = '#e2e8f0';
                    btns[b].style.background = 'transparent';
                    btns[b].style.color = '#64748b';
                }
                this.style.borderColor = '#3b82f6';
                this.style.background = '#dbeafe';
                this.style.color = '#2563eb';
                selectedCategory = cat;
                updateSubCategories(cat);
            };
        })(catName);
        catContainer.appendChild(btn);
    }
    modal.appendChild(catContainer);
    
    var subLabel = document.createElement('div');
    subLabel.textContent = '子类型';
    subLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(subLabel);
    
    var subContainer = document.createElement('div');
    subContainer.id = 'subCategoryContainer';
    subContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;';
    modal.appendChild(subContainer);
    
    function updateSubCategories(category) {
        subContainer.innerHTML = '';
        var catInfo = CATEGORY_DATA[category];
        if (!catInfo) return;
        
        for (var s = 0; s < catInfo.subCategories.length; s++) {
            var sub = catInfo.subCategories[s];
            var isSelected = (s === 0);
            var btn = document.createElement('button');
            btn.textContent = sub.icon + ' ' + sub.name;
            btn.style.cssText = 'padding:4px 12px;border:2px solid ' + (isSelected ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;background:' + (isSelected ? '#dbeafe' : 'transparent') + ';font-size:0.7rem;font-weight:500;color:' + (isSelected ? '#2563eb' : '#64748b') + ';cursor:pointer;transition:0.2s;';
            btn.dataset.subId = sub.id;
            btn.onclick = function() {
                var btns = subContainer.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) {
                    btns[b].style.borderColor = '#e2e8f0';
                    btns[b].style.background = 'transparent';
                    btns[b].style.color = '#64748b';
                }
                this.style.borderColor = '#3b82f6';
                this.style.background = '#dbeafe';
                this.style.color = '#2563eb';
                selectedSub = this.dataset.subId;
            };
            subContainer.appendChild(btn);
        }
    }
    
    updateSubCategories('工作');
    
    var dateLabel = document.createElement('div');
    dateLabel.textContent = '目标日期';
    dateLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:4px;';
    modal.appendChild(dateLabel);
    
    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'countdownDateInput';
    var today = new Date();
    var year = today.getFullYear();
    var month = String(today.getMonth() + 1).padStart(2, '0');
    var day = String(today.getDate()).padStart(2, '0');
    dateInput.value = year + '-' + month + '-' + day;
    dateInput.style.cssText = 'width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.85rem;outline:none;transition:0.2s;box-sizing:border-box;margin-bottom:16px;';
    dateInput.onfocus = function() { this.style.borderColor = '#3b82f6'; };
    dateInput.onblur = function() { this.style.borderColor = '#e2e8f0'; };
    modal.appendChild(dateInput);
    
    // ⭐ 置顶选项
    var pinLabel = document.createElement('div');
    pinLabel.textContent = '置顶';
    pinLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#475569;margin-bottom:6px;';
    modal.appendChild(pinLabel);
    
    var pinContainer = document.createElement('div');
    pinContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:14px;';
    
    var pinYesBtn = document.createElement('button');
    pinYesBtn.textContent = '📌 置顶';
    pinYesBtn.style.cssText = 'flex:1;padding:6px 0;border:2px solid #e2e8f0;border-radius:8px;background:transparent;font-size:0.75rem;font-weight:600;color:#64748b;cursor:pointer;transition:0.2s;';
    pinYesBtn.onclick = function() {
        pinYesBtn.style.borderColor = '#3b82f6';
        pinYesBtn.style.background = '#dbeafe';
        pinYesBtn.style.color = '#2563eb';
        pinNoBtn.style.borderColor = '#e2e8f0';
        pinNoBtn.style.background = 'transparent';
        pinNoBtn.style.color = '#64748b';
        selectedPinned = true;
    };
    pinContainer.appendChild(pinYesBtn);
    
    var pinNoBtn = document.createElement('button');
    pinNoBtn.textContent = '不置顶';
    pinNoBtn.style.cssText = 'flex:1;padding:6px 0;border:2px solid #3b82f6;border-radius:8px;background:#dbeafe;font-size:0.75rem;font-weight:600;color:#2563eb;cursor:pointer;transition:0.2s;';
    pinNoBtn.onclick = function() {
        pinNoBtn.style.borderColor = '#3b82f6';
        pinNoBtn.style.background = '#dbeafe';
        pinNoBtn.style.color = '#2563eb';
        pinYesBtn.style.borderColor = '#e2e8f0';
        pinYesBtn.style.background = 'transparent';
        pinYesBtn.style.color = '#64748b';
        selectedPinned = false;
    };
    pinContainer.appendChild(pinNoBtn);
    
    modal.appendChild(pinContainer);
    
    var selectedPinned = false;
    
    // 按钮
    var btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:10px;';
    
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'flex:1;padding:8px 0;border:1.5px solid #e2e8f0;border-radius:10px;background:transparent;font-size:0.8rem;font-weight:500;color:#64748b;cursor:pointer;transition:0.2s;';
    cancelBtn.onmouseover = function() { this.style.background = '#f1f4f9'; };
    cancelBtn.onmouseout = function() { this.style.background = 'transparent'; };
    cancelBtn.onclick = function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    btnGroup.appendChild(cancelBtn);
    
    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.cssText = 'flex:1;padding:8px 0;border:none;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);font-size:0.8rem;font-weight:600;color:white;cursor:pointer;transition:0.2s;';
    confirmBtn.onmouseover = function() { this.style.opacity = '0.9'; };
    confirmBtn.onmouseout = function() { this.style.opacity = '1'; };
    confirmBtn.onclick = function() {
        var name = document.getElementById('countdownNameInput').value.trim();
        var date = document.getElementById('countdownDateInput').value;
        if (!name) {
            showToast('⚠️ 请输入事项名称');
            return;
        }
        if (!date) {
            showToast('⚠️ 请选择目标日期');
            return;
        }
        
        var catBtns = catContainer.querySelectorAll('button');
        var selectedCat = '工作';
        for (var cb = 0; cb < catBtns.length; cb++) {
            if (catBtns[cb].style.borderColor === 'rgb(59, 130, 246)' || catBtns[cb].style.borderColor === '#3b82f6') {
                selectedCat = catBtns[cb].textContent.trim();
                break;
            }
        }
        
        var subBtns = subContainer.querySelectorAll('button');
        var selectedSubId = 'project';
        for (var sb = 0; sb < subBtns.length; sb++) {
            if (subBtns[sb].style.borderColor === 'rgb(59, 130, 246)' || subBtns[sb].style.borderColor === '#3b82f6') {
                selectedSubId = subBtns[sb].dataset.subId;
                break;
            }
        }
        
        var success = addCountdownItem(name, date, selectedCat, selectedSubId, selectedPinned);
        if (success) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
    };
    btnGroup.appendChild(confirmBtn);
    
    modal.appendChild(btnGroup);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    setTimeout(function() {
        nameInput.focus();
    }, 100);
    
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            overlay.parentNode.removeChild(overlay);
        }
    };
}

// ---------- 初始化 ----------

function initCountdown() {
    renderCountdownList();
    
    var addBtn = document.getElementById('addCountdownBtn');
    if (addBtn) {
        addBtn.addEventListener('click', showAddCountdownModal);
    }
    
    setInterval(function() {
        renderCountdownList();
    }, 60000);
}

window.loadCountdownList = loadCountdownList;
window.saveCountdownList = saveCountdownList;
window.addCountdownItem = addCountdownItem;
window.deleteCountdownItem = deleteCountdownItem;
window.renderCountdownList = renderCountdownList;
window.showAddCountdownModal = showAddCountdownModal;
window.initCountdown = initCountdown;
window.updateCountdownItems = updateCountdownItems;
window.showEditCountdownModal = showEditCountdownModal;
window.showActionModal = showActionModal;
window.getSubIcon = getSubIcon;
window.CATEGORY_DATA = CATEGORY_DATA;
window.CATEGORY_NAMES = CATEGORY_NAMES;
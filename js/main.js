/**
 * ============================================================
 * main.js - 主程序入口
 * 作用：初始化应用、组装各模块、绑定事件
 * 知识点：
 *   - DOMContentLoaded：页面加载完成后执行
 *   - 模块组装：调用各模块的函数
 *   - 事件绑定：为按钮绑定点击事件
 *   - 状态管理：管理当前年月
 * ============================================================
 */

// ---------- 全局状态 ----------
/**
 * 当前显示的年份和月份
 */
let currentYear = 2026;
let currentMonth = 6;

// ---------- DOM 引用 ----------
// 获取页面中的关键元素
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const todayBtn = document.getElementById('todayBtn');
const markOvertimeBtn = document.getElementById('markOvertimeBtn');
const markRestBtn = document.getElementById('markRestBtn');
const clearMonthBtn = document.getElementById('clearMonthBtn');
const quickToday = document.getElementById('quickToday');
const quickClear = document.getElementById('quickClear');

// ---------- 页面更新函数 ----------
/**
 * 完整更新页面
 * 包括：渲染日历、更新进度条、更新统计
 */
function fullUpdate() {
    // 1. 渲染日历（传入状态变化回调）
    renderCalendar(currentYear, currentMonth, function() {
        // 状态变化后，更新进度条
        updateProgressBars(currentYear, currentMonth);
        // 更新统计数字（已在 renderCalendar 中更新）
    });
    
    // 2. 更新进度条
    updateProgressBars(currentYear, currentMonth);
    
    // 3. 更新今日日期显示
    const today = getToday();
    document.getElementById('todayDateDisplay').textContent = 
        `${today.year}/${today.month}/${today.day}`;
}

/**
 * 更新进度条
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 */
function updateProgressBars(year, month) {
    // 获取进度数据
    const data = getProgressData(year, month);
    
    // ---------- 更新基础进度条 ----------
    const base = data.base;
    document.getElementById('progressDone').textContent = base.done;
    document.getElementById('progressTarget').textContent = base.target;
    document.getElementById('progressFill').style.width = base.percent + '%';
    document.getElementById('progressStatus').textContent = base.message;
    document.getElementById('progressStatus').className = 'progress-status ' + base.status;
    
    // 更新填充条样式
    const fill = document.getElementById('progressFill');
    if (base.status === 'achieved' || base.status === 'exact') {
        fill.className = 'progress-bar-fill achieved';
    } else {
        fill.className = 'progress-bar-fill';
    }
    
    // ---------- 更新额外进度条 ----------
    const extra = data.extra;
    document.getElementById('extraDone').textContent = extra.done;
    document.getElementById('extraTarget').textContent = extra.target;
    document.getElementById('extraFill').style.width = extra.percent + '%';
    document.getElementById('extraStatus').textContent = extra.message;
    document.getElementById('extraStatus').className = 'progress-status ' + extra.status;
    
    // 额外进度条填充样式（达标时变成紫色）
    const extraFill = document.getElementById('extraFill');
    if (extra.status === 'achieved') {
        extraFill.className = 'progress-bar-fill achieved';
    } else {
        extraFill.className = 'progress-bar-fill';
    }
}

// ---------- 导航函数 ----------
/**
 * 跳转到指定年月
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 */
function goToYearMonth(year, month) {
    // 处理月份溢出
    if (month < 1) {
        month = 12;
        year--;
    }
    if (month > 12) {
        month = 1;
        year++;
    }
    
    currentYear = year;
    currentMonth = month;
    fullUpdate();
    showToast(`📅 ${year}年${month}月`);
}

/**
 * 跳转到今天
 */
function goToToday() {
    const today = getToday();
    currentYear = today.year;
    currentMonth = today.month;
    fullUpdate();
    showToast('📍 回到今天');
}

// ---------- 操作函数 ----------
/**
 * 标记今天为指定状态
 * 
 * @param {string} status - 'overtime' 或 'rest'
 */
function markToday(status) {
    const today = getToday();
    
    // 如果当前显示的不是今天所在月份，先跳转
    if (today.year !== currentYear || today.month !== currentMonth) {
        currentYear = today.year;
        currentMonth = today.month;
    }
    
    // 设置状态
    setStatus(today.year, today.month, today.day, status);
    
    // 更新页面
    fullUpdate();
    
    const label = status === 'overtime' ? '🌙 加班' : '☀️ 休息';
    showToast(`今日 ${today.year}/${today.month}/${today.day} → ${label}`);
}

/**
 * 清除当前月份的所有标记（带二次确认弹窗）
 */
function clearCurrentMonth() {
    // 先统计本月有多少个标记
    const overtimeCount = countStatusInMonth(currentYear, currentMonth, 'overtime');
    const restCount = countStatusInMonth(currentYear, currentMonth, 'rest');
    const total = overtimeCount + restCount;
    
    // 如果没有标记，直接提示
    if (total === 0) {
        showToast('ℹ️ 本月无标记可清除');
        return;
    }
    
    // ⭐ 弹出确认对话框
    const confirmMessage = `⚠️ 确定要清除 ${currentYear}年${currentMonth}月的所有标记吗？\n\n加班 ${overtimeCount} 天，休息 ${restCount} 天，共 ${total} 个标记\n\n此操作不可撤销！`;
    
    if (confirm(confirmMessage)) {
        const cleared = clearMonth(currentYear, currentMonth);
        if (cleared > 0) {
            fullUpdate();
            showToast(`🧹 已清除 ${cleared} 个标记`);
        }
    } else {
        showToast('❌ 已取消清除操作');
    }
}

// ---------- 初始化 ----------
/**
 * 页面初始化
 * 
 * 知识点：
 * - DOMContentLoaded 事件：DOM 加载完成后执行
 * - 加载数据 → 设置初始年月 → 渲染页面 → 绑定事件
 */
document.addEventListener('DOMContentLoaded', function() {
    // 1. 加载数据
    loadFromStorage();
    
    // 2. 设置初始年月为今天
    const today = getToday();
    currentYear = today.year;
    currentMonth = today.month;
    
    // 3. 完整渲染
    fullUpdate();
    
    // 4. 显示加载状态
    const total = Object.keys(statusMap).length;
    showToast(`💾 已加载 ${total} 个标记`);
    
    // ---------- 绑定按钮事件 ----------
    // 上个月 / 下个月
    prevMonthBtn.addEventListener('click', function() {
        goToYearMonth(currentYear, currentMonth - 1);
    });
    nextMonthBtn.addEventListener('click', function() {
        goToYearMonth(currentYear, currentMonth + 1);
    });
    
    // 今天
    todayBtn.addEventListener('click', goToToday);
    quickToday.addEventListener('click', goToToday);
    
    // 标记今日加班 / 休息
    markOvertimeBtn.addEventListener('click', function() {
        markToday('overtime');
    });
    markRestBtn.addEventListener('click', function() {
        markToday('rest');
    });
    
    // 清除本月
    clearMonthBtn.addEventListener('click', clearCurrentMonth);
    quickClear.addEventListener('click', clearCurrentMonth);
    
    // ---------- 设置拖拽功能 ----------
    setupDragDrop(markOvertimeBtn, markRestBtn, function() {
        // 拖拽完成后更新页面
        fullUpdate();
    });
});

/**
 * 显示提示消息（全局函数，供其他模块调用）
 * 
 * @param {string} message - 要显示的消息
 */
function showToast(message) {
    const toast = document.getElementById('toastMessage');
    toast.textContent = message;
}
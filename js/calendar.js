/**
 * ============================================================
 * calendar.js - 日历渲染模块
 * 作用：渲染日历网格、处理日期点击事件，显示农历日期
 * 依赖：utils.js, storage.js, lunar-javascript 库
 * ============================================================
 */

/**
 * 获取农历日期字符串
 * 
 * @param {number} year  - 公历年份
 * @param {number} month - 公历月份（1-12）
 * @param {number} day   - 公历日期（1-31）
 * @returns {string} 农历日期字符串，如 "初一"、"十五"、"腊月廿三"
 */
function getLunarDate(year, month, day) {
    try {
        // lunar-javascript 库：公历转农历
        // lunar 是全局对象，由 CDN 加载
        // 注意：month 需要减 1，因为库中月份从 0 开始
        const solar = lunar.Solar.fromYmd(year, month, day);
        // 获取农历日期对象
        const lunarDate = solar.getLunar();
        // 获取农历月日字符串，如 "正月初一"、"八月十五"
        const monthStr = lunarDate.getMonthInChinese();    // 农历月：正月、二月...
        const dayStr = lunarDate.getDayInChinese();        // 农历日：初一、十五...
        // 如果是农历初一，直接显示月份名（如"正月"）
        if (dayStr === '初一') {
            return monthStr;  // 显示"正月"而不是"正月初一"
        }
        return monthStr + dayStr;  // 组合：如"八月十五"
    } catch (error) {
        // 如果转换失败，返回空字符串（防止页面报错）
        return '';
    }
}

/**
 * 渲染日历
 * 
 * 知识点：
 * - 日历计算：确定每个日期格子的年月日
 * - DOM 操作：使用 createElement 和 appendChild 动态创建元素
 * - 事件绑定：为每个日期格子绑定点击事件
 * - 状态同步：从 storage 读取状态并渲染
 * - 农历显示：在日期下方显示农历日期
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @param {Function} onStatusChange - 状态变化回调函数
 */
function renderCalendar(year, month, onStatusChange) {
    // ---------- 更新标题 ----------
    const monthYearDisplay = document.getElementById('monthYearDisplay');
    monthYearDisplay.textContent = `📅 ${year}年${month}月`;
    
    // ---------- 计算日期数据 ----------
    // 获取当月第一天是星期几（1=周一，7=周日）
    const firstDay = new Date(year, month - 1, 1);
    let firstWeekday = firstDay.getDay();  // 0=周日
    if (firstWeekday === 0) firstWeekday = 7;  // 转为7=周日
    
    // 当月天数
    const daysInMonth = getDaysInMonth(year, month);
    
    // ---------- 构建日期数组（仅当月日期 + 空单元格占位） ----------
    const cells = [];
    
    // 计算当月第一天前需要空出的格数
    const emptyBefore = firstWeekday - 1;
    
    // 添加空单元格占位（当月第一天之前的空白）
    for (let i = 0; i < emptyBefore; i++) {
        cells.push({
            year: year,
            month: month,
            day: null,
            isEmpty: true  // 标记为空单元格
        });
    }
    
    // 添加当月日期
    for (let day = 1; day <= daysInMonth; day++) {
        cells.push({
            year: year,
            month: month,
            day: day,
            isEmpty: false
        });
    }
    
    // ---------- 获取今日日期 ----------
    const today = getToday();
    
    // ---------- 渲染到 DOM ----------
    const daysGrid = document.getElementById('daysGrid');
    daysGrid.innerHTML = '';  // 清空网格
    
    // 遍历每个日期格子
    for (const cell of cells) {
        const { year: y, month: m, day: d, isEmpty } = cell;
        
        // 创建日期元素
        const cellDiv = document.createElement('div');
        cellDiv.className = 'day-cell';
        
        // 如果是空单元格，添加特殊样式并跳过
        if (isEmpty) {
            cellDiv.classList.add('empty-cell');
            daysGrid.appendChild(cellDiv);
            continue;
        }
        
        // ---------- 应用状态样式 ----------
        const status = getStatus(y, m, d);
        if (status === 'overtime') {
            cellDiv.classList.add('status-overtime');
        } else if (status === 'rest') {
            cellDiv.classList.add('status-rest');
        } else {
            cellDiv.classList.add('status-normal');
        }
        
        // ---------- 今日高亮 ----------
        if (y === today.year && m === today.month && d === today.day) {
            cellDiv.classList.add('today');
        }
        
        // ---------- 存储日期数据到元素 ----------
        cellDiv.dataset.year = y;
        cellDiv.dataset.month = m;
        cellDiv.dataset.day = d;
        cellDiv.dataset.isOther = 'false';
        
        // ---------- 日期数字（公历） ----------
        const dateSpan = document.createElement('span');
        dateSpan.className = 'date-number';  // 添加类名便于样式控制
        dateSpan.textContent = d;
        cellDiv.appendChild(dateSpan);
        
        // ---------- 农历日期（在公历日期下方） ----------
        const lunarText = getLunarDate(y, m, d);
        // 创建农历标签元素
        const lunarSpan = document.createElement('span');
        lunarSpan.className = 'lunar-date';  // 添加类名便于样式控制
        lunarSpan.textContent = lunarText;
        // 如果有农历日期才显示，否则隐藏
        if (lunarText) {
            lunarSpan.style.display = 'block';
        } else {
            lunarSpan.style.display = 'none';
        }
        cellDiv.appendChild(lunarSpan);
        
        // ---------- 状态标签（加班/休息标记） ----------
        const label = document.createElement('span');
        label.className = 'status-label';
        if (status === 'overtime') {
            label.textContent = '🌙';
        } else if (status === 'rest') {
            label.textContent = '☀️';
        } else {
            label.textContent = '·';
        }
        cellDiv.appendChild(label);
        
        // ---------- 绑定点击事件 ----------
        cellDiv.addEventListener('click', function() {
            // 循环切换状态：normal → overtime → rest → normal
            const currentStatus = getStatus(y, m, d);
            let nextStatus;
            if (currentStatus === 'normal') {
                nextStatus = 'overtime';
            } else if (currentStatus === 'overtime') {
                nextStatus = 'rest';
            } else {
                nextStatus = 'normal';
            }
            
            // 保存状态
            setStatus(y, m, d, nextStatus);
            // 更新当前格子的样式
            updateCellStyle(cellDiv, nextStatus);
            // 更新统计数字
            updateStats(year, month);
            
            // 执行回调（更新进度条）
            if (onStatusChange) {
                onStatusChange();
            }
            
            // 状态名称映射
            const statusNames = {
                'overtime': '🌙 加班',
                'rest': '☀️ 休息',
                'normal': '普通'
            };
            // 显示提示
            showToast(`${y}/${m}/${d} → ${statusNames[nextStatus]}`);
        });
        
        // 添加到网格
        daysGrid.appendChild(cellDiv);
    }
    
    // ---------- 更新统计数字 ----------
    updateStats(year, month);
}

/**
 * 更新单个日期格子的样式
 * 
 * @param {HTMLElement} cellDiv - 日期格子元素
 * @param {string} status - 'normal' | 'overtime' | 'rest'
 */
function updateCellStyle(cellDiv, status) {
    // 移除所有状态类
    cellDiv.classList.remove('status-normal', 'status-overtime', 'status-rest');
    
    // 添加新的状态类
    if (status === 'overtime') {
        cellDiv.classList.add('status-overtime');
    } else if (status === 'rest') {
        cellDiv.classList.add('status-rest');
    } else {
        cellDiv.classList.add('status-normal');
    }
    
    // 更新状态标签文字
    const label = cellDiv.querySelector('.status-label');
    if (label) {
        if (status === 'overtime') {
            label.textContent = '🌙';
        } else if (status === 'rest') {
            label.textContent = '☀️';
        } else {
            label.textContent = '·';
        }
    }
}

/**
 * 更新统计数字
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 */
function updateStats(year, month) {
    const overtimeCount = countStatusInMonth(year, month, 'overtime');
    const restCount = countStatusInMonth(year, month, 'rest');
    document.getElementById('overtimeCount').textContent = overtimeCount;
    document.getElementById('restCount').textContent = restCount;
}

/**
 * 显示提示消息
 * 
 * @param {string} message - 要显示的消息
 */
function showToast(message) {
    const toast = document.getElementById('toastMessage');
    toast.textContent = message + ' ✅';
}
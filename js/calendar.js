/**
 * ============================================================
 * calendar.js - 日历渲染模块
 * 农历：使用 lunar.min.js（lunar-javascript）天文算法实时推算
 *       支持任意年份，节气按真实太阳黄经时刻计算，精确到分钟
 *       节气 > 三伏 > 农历月名（初一）/ 农历日期
 * 节气替换农历显示，节日显示在下方标签
 * 排班后文字自动变白
 * 支持多选模式（批量标记，补齐触屏设备无法拖拽的场景）
 * ============================================================
 */

const LUNAR_DATA_ALL = {};

// ---------- 多选模式状态 ----------
/**
 * 是否处于多选模式
 * 多选模式下点击日期 = 加入/移出选区；
 * 再点底部「加班/休息」按钮 = 批量应用到所有选中日期
 */
var multiSelectMode = false;

/** 多选模式下已选中的日期 key 列表（'YYYY-MM-DD'） */
var selectedDates = [];

function dateKey(y, m, d) {
    return formatDate(y, m, d);
}

function isDateSelected(y, m, d) {
    return selectedDates.indexOf(dateKey(y, m, d)) !== -1;
}

function clearDateSelection() {
    selectedDates = [];
}

/**
 * 多选模式下切换某天的选中状态
 * @param {number} y - 年
 * @param {number} m - 月
 * @param {number} d - 日
 * @param {HTMLElement} el - 对应的日期格子元素
 */
function toggleDateSelection(y, m, d, el) {
    const key = dateKey(y, m, d);
    const idx = selectedDates.indexOf(key);
    if (idx === -1) {
        selectedDates.push(key);
        el.classList.add('multi-selected');
    } else {
        selectedDates.splice(idx, 1);
        el.classList.remove('multi-selected');
    }
    showToast('☑️ 已选 ' + selectedDates.length + ' 天');
    if (typeof updateMultiSelectUI === 'function') updateMultiSelectUI();
}

// ---------- 农历数据 ----------

/** lunar.min.js（算法库）是否正在加载中 */
let lunarLibLoading = false;

/**
 * 动态加载农历算法库（lunar-javascript，约 300KB）
 * 正常情况下 index.html 已用 defer 引入该文件；
 * 这里是离线/加载失败时的二次兜底
 * @param {Function} cb - 加载完成（或失败放弃）后的回调
 */
function ensureLunarLib(cb) {
    if (window.Solar) { cb(); return; }
    if (lunarLibLoading) return;
    lunarLibLoading = true;

    const script = document.createElement('script');
    script.src = 'js/lunar.min.js';
    script.onload = function () {
        lunarLibLoading = false;
        cb();
    };
    script.onerror = function () {
        lunarLibLoading = false;
        // 加载失败（离线且无缓存），放弃农历显示
    };
    document.head.appendChild(script);
}

/**
 * =========== 节日白名单 ===========
 * 算法库会返回大量「纪念日 / 洋节」（如消费者权益日、万圣节、感恩节、
 * 全国中小学生安全教育日），这些并非节假日，且部分名字长达 11 个字会把格子撑破。
 * 这里只保留：法定节假日 + 传统节日。需要增删直接改这个数组即可。
 */
var FESTIVAL_WHITELIST = [
    // 法定节假日
    '元旦节', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节',
    // 传统节日
    '除夕', '元宵节', '龙头节', '七夕节', '中元节', '重阳节', '腊八节'
];

/** 节日标签最多显示几个字（超出截断，防止长名撑破格子） */
var FESTIVAL_MAX_LEN = 4;

/**
 * 从候选节日列表里挑出一个要显示的节日
 * 按白名单顺序匹配，保证同一天有多个候选时结果稳定
 * @param {string[]} candidates - 该天所有节日名
 * @returns {string} 要显示的节日名，无则空串
 */
function pickFestival(candidates) {
    for (var i = 0; i < FESTIVAL_WHITELIST.length; i++) {
        if (candidates.indexOf(FESTIVAL_WHITELIST[i]) !== -1) {
            return FESTIVAL_WHITELIST[i];
        }
    }
    return '';
}

/**
 * 用算法库计算某天的农历信息
 *
 * 显示优先级：
 *   1. 节气（getJieQi，非节气日返回空串）
 *   2. 三伏（getFu：初伏/中伏/末伏）
 *   3. 农历初一 → 显示月份名（如「六月」），与传统日历习惯一致
 *   4. 其余 → 农历日期（如「廿三」）
 *
 * @returns {{display: string, festival: string}}
 */
function getLunarInfoFromLib(year, month, day) {
    try {
        const solar = window.Solar.fromYmd(year, month, day);
        const lunar = solar.getLunar();

        const jieQi = lunar.getJieQi();
        const fu = lunar.getFu();
        const dayCn = lunar.getDayInChinese();

        let display;
        if (jieQi) {
            display = jieQi;
        } else if (fu) {
            display = fu.getName();
        } else if (dayCn === '初一') {
            display = lunar.getMonthInChinese() + '月';
        } else {
            display = dayCn;
        }

        // 农历节日优先，其次公历节日；结果再过一遍白名单，
        // 剔除各类纪念日和洋节，只留真正的节假日
        var festivals = lunar.getFestivals().concat(solar.getFestivals());
        var festival = pickFestival(festivals);

        // 清明在库中只作为节气存在（不进 festivals），这里补上节日标签
        if (!festival && jieQi === '清明') festival = '清明';

        // 防御：万一白名单以外的长名漏进来，截断到 4 个字
        if (festival && festival.length > FESTIVAL_MAX_LEN) {
            festival = festival.substring(0, FESTIVAL_MAX_LEN - 1) + '…';
        }

        return {
            display: display || '',
            festival: festival
        };
    } catch (e) {
        return { display: '', festival: '' };
    }
}

/**
 * 获取某天的农历信息（带按日缓存，避免重复计算）
 * @returns {{display: string, festival: string}}
 */
function getLunarInfo(year, month, day) {
    if (!window.Solar) return { display: '', festival: '' };

    // 算法推算有一定开销，按「年-月-日」缓存结果
    if (!LUNAR_DATA_ALL[year]) LUNAR_DATA_ALL[year] = {};
    const key = String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    if (!LUNAR_DATA_ALL[year][key]) {
        LUNAR_DATA_ALL[year][key] = getLunarInfoFromLib(year, month, day);
    }
    return LUNAR_DATA_ALL[year][key];
}

function isWeekend(year, month, day) {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 0 || d.getDay() === 6;
}

// ---------- 键盘可达性 ----------
/**
 * 键盘焦点所在日；null 表示用「今天（若在当前月）或 1 号」
 * 用 roving tabindex：全月只有一个格子 tabindex=0，避免 Tab 要按 31 次
 */
var calendarFocusDay = null;

/**
 * 按状态循环切换某天：普通 → 加班 → 休息 → 普通
 * 鼠标点击与键盘 Enter/空格 共用同一份逻辑，避免两处行为漂移
 */
function cycleDayStatus(y, m, d) {
    var next = getStatus(y, m, d);
    next = next === 'normal' ? 'overtime' : next === 'overtime' ? 'rest' : 'normal';
    setStatus(y, m, d, next);
    renderCalendar(currentYear, currentMonth);
    updateProgressBars(currentYear, currentMonth);
    var names = { overtime: '🌙 加班', rest: '☀️ 休息', normal: '普通' };
    showToast(y + '/' + m + '/' + d + ' → ' + names[next] + ' ✅');
}

function calendarDefaultFocusDay(year, month) {
    var t = getToday();
    if (t.year === year && t.month === month) return t.day;
    return 1;
}

/** 当前月份下应当持有 tabindex=0 的那一天 */
function calendarFocusDayFor(year, month) {
    var days = getDaysInMonth(year, month);
    var d = calendarFocusDay;
    if (!d || d < 1 || d > days) return calendarDefaultFocusDay(year, month);
    return d;
}

/** 在同一月内移动焦点：只改 tabindex 与 DOM 焦点，不重绘 */
function focusCalendarDay(y, m, d) {
    var cells = document.querySelectorAll('#daysGrid .day-cell:not(.empty-cell)');
    var target = null;
    for (var i = 0; i < cells.length; i++) {
        if (cells[i].dataset.day === String(d)) { target = cells[i]; break; }
    }
    if (!target) return false;
    for (var j = 0; j < cells.length; j++) cells[j].tabIndex = -1;
    target.tabIndex = 0;
    calendarFocusDay = d;
    target.focus();
    return true;
}

/** 按天数偏移移动焦点；跨月时先切月，重绘后再落焦点 */
function calendarMoveFocus(y, m, d, delta) {
    var t = new Date(y, m - 1, d + delta);
    var ty = t.getFullYear(), tm = t.getMonth() + 1, td = t.getDate();
    if (ty === currentYear && tm === currentMonth) {
        focusCalendarDay(ty, tm, td);
        return;
    }
    calendarFocusDay = td;
    goToYearMonth(ty, tm);
    setTimeout(function () { focusCalendarDay(ty, tm, td); }, 0);
}

/**
 * 安装日历键盘操作（由 main.js 初始化时调用一次）
 * ← → 前后一天；↑ ↓ 前后一周；Home/End 月首/月末；Enter/空格 切换状态
 */
function initCalendarKeyboard() {
    var grid = document.getElementById('daysGrid');
    if (!grid || grid.dataset.kbBound === '1') return;
    grid.dataset.kbBound = '1';

    grid.addEventListener('keydown', function (e) {
        var cell = e.target && e.target.closest ? e.target.closest('.day-cell') : null;
        if (!cell || cell.classList.contains('empty-cell')) return;

        var y = parseInt(cell.dataset.year, 10);
        var m = parseInt(cell.dataset.month, 10);
        var d = parseInt(cell.dataset.day, 10);
        if (!y || !m || !d) return;

        var handled = true;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            cycleDayStatus(y, m, d);
            // 状态切换会整块重绘，重绘后把焦点放回同一天
            calendarFocusDay = d;
            setTimeout(function () { focusCalendarDay(y, m, d); }, 0);
        } else if (e.key === 'ArrowLeft') {
            calendarMoveFocus(y, m, d, -1);
        } else if (e.key === 'ArrowRight') {
            calendarMoveFocus(y, m, d, 1);
        } else if (e.key === 'ArrowUp') {
            calendarMoveFocus(y, m, d, -7);
        } else if (e.key === 'ArrowDown') {
            calendarMoveFocus(y, m, d, 7);
        } else if (e.key === 'Home') {
            calendarMoveFocus(y, m, d, -(d - 1));
        } else if (e.key === 'End') {
            calendarMoveFocus(y, m, d, getDaysInMonth(y, m) - d);
        } else {
            handled = false;
        }
        if (handled) e.preventDefault();
    });
}

function renderCalendar(year, month) {
    // ===== 月份名映射 =====
    const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    // ===== 计算上个月和下个月 =====
    const prevMonth = month === 1 ? 12 : month - 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const prevMonthName = MONTH_NAMES[prevMonth - 1];
    const nextMonthName = MONTH_NAMES[nextMonth - 1];

    // ===== 更新按钮文字 =====
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn) {
        prevBtn.innerHTML = '<span style="font-size:10px;">' + prevMonthName + '</span>';
    }
    if (nextBtn) {
        nextBtn.innerHTML = '<span style="font-size:10px;">' + nextMonthName + '</span>';
    }

    document.getElementById('monthYearDisplay').innerHTML = year + '年' + month + '月';

    const firstDay = new Date(year, month - 1, 1);
    let firstWeekday = firstDay.getDay();
    if (firstWeekday === 0) firstWeekday = 7;

    const daysInMonth = getDaysInMonth(year, month);
    const cells = [];
    for (let i = 0; i < firstWeekday - 1; i++) {
        cells.push({ year, month, day: null, isEmpty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ year, month, day: d, isEmpty: false });
    }

    const today = getToday();
    const grid = document.getElementById('daysGrid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', year + '年' + month + '月 排班日历');
    const focusDay = calendarFocusDayFor(year, month);
    grid.innerHTML = '';

    // 算法库未就绪（离线或加载失败）时触发懒加载，加载完重渲染补齐农历
    if (!window.Solar) {
        ensureLunarLib(function () {
            renderCalendar(year, month);
        });
    }

    for (const cell of cells) {
        const { year: y, month: m, day: d, isEmpty } = cell;
        const div = document.createElement('div');
        div.className = 'day-cell';

        if (isEmpty) {
            div.classList.add('empty-cell');
            div.setAttribute('aria-hidden', 'true');
            grid.appendChild(div);
            continue;
        }

        const status = getStatus(y, m, d);
        const isStatusActive = (status === 'overtime' || status === 'rest');

        if (status === 'overtime') div.classList.add('status-overtime');
        else if (status === 'rest') div.classList.add('status-rest');
        else div.classList.add('status-normal');

        if (y === today.year && m === today.month && d === today.day) div.classList.add('today');
        if (isWeekend(y, m, d)) div.classList.add('weekend');
        if (multiSelectMode && isDateSelected(y, m, d)) div.classList.add('multi-selected');

        div.dataset.year = y;
        div.dataset.month = m;
        div.dataset.day = d;

        const num = document.createElement('span');
        num.className = 'date-number';
        num.textContent = d;
        const dateColor = isStatusActive ? 'var(--on-accent)' : 'var(--text-primary)';
        num.style.cssText = 'display:block;font-size:1.1rem;font-weight:700;color:' + dateColor + ';line-height:1.2;';
        div.appendChild(num);

        const info = getLunarInfo(y, m, d);
        if (info.display) {
            const span = document.createElement('span');
            span.className = 'lunar-date';
            span.textContent = info.display;
            const color = isStatusActive ? 'var(--on-accent)' : 'var(--text-secondary)';
            span.style.cssText = 'display:block;font-size:0.7rem;font-weight:600;color:' + color + ';line-height:1.3;margin-top:2px;letter-spacing:0.3px;';
            div.appendChild(span);
        }

        if (info.festival) {
            const span = document.createElement('span');
            span.className = 'festival-date';
            span.textContent = info.festival;
            const color = isStatusActive ? 'var(--overtime-light)' : 'var(--overtime)';
            const bg = isStatusActive ? 'rgba(255,255,255,0.15)' : 'rgba(220,38,38,0.10)';
            span.style.cssText = 'display:block;font-size:0.5rem;font-weight:700;color:' + color + ';background:' + bg + ';padding:0 6px;border-radius:10px;line-height:1.5;margin-top:2px;';
            div.appendChild(span);
        }

        // ---- 键盘可达性：roving tabindex + 可读标签 ----
        div.setAttribute('role', 'gridcell');
        div.tabIndex = (d === focusDay) ? 0 : -1;
        const statusName = status === 'overtime' ? '加班' : status === 'rest' ? '休息' : '未标记';
        let ariaText = y + '年' + m + '月' + d + '日，' + statusName;
        if (info.festival) ariaText += '，' + info.festival;
        else if (info.display) ariaText += '，' + info.display;
        div.setAttribute('aria-label', ariaText);

        const label = document.createElement('span');
        label.className = 'status-label';
        label.textContent = status === 'overtime' ? '🌙' : status === 'rest' ? '☀️' : '·';
        const labelColor = isStatusActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
        label.style.cssText = 'font-size:0.55rem;margin-top:1px;color:' + labelColor + ';';
        div.appendChild(label);

        grid.appendChild(div);
    }

    document.getElementById('overtimeCount').textContent = countStatusInMonth(year, month, 'overtime');
    document.getElementById('restCount').textContent = countStatusInMonth(year, month, 'rest');
}

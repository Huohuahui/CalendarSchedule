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

function renderCalendar(year, month, onStatusChange) {
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
    grid.innerHTML = '';

    // 算法库未就绪（离线或加载失败）时触发懒加载，加载完重渲染补齐农历
    if (!window.Solar) {
        ensureLunarLib(function () {
            renderCalendar(year, month, onStatusChange);
        });
    }

    for (const cell of cells) {
        const { year: y, month: m, day: d, isEmpty } = cell;
        const div = document.createElement('div');
        div.className = 'day-cell';

        if (isEmpty) {
            div.classList.add('empty-cell');
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
        const dateColor = isStatusActive ? '#ffffff' : '#0f172a';
        num.style.cssText = 'display:block;font-size:1.1rem;font-weight:700;color:' + dateColor + ';line-height:1.2;';
        div.appendChild(num);

        const info = getLunarInfo(y, m, d);
        if (info.display) {
            const span = document.createElement('span');
            span.className = 'lunar-date';
            span.textContent = info.display;
            const color = isStatusActive ? '#ffffff' : '#475569';
            span.style.cssText = 'display:block;font-size:0.7rem;font-weight:600;color:' + color + ';line-height:1.3;margin-top:2px;letter-spacing:0.3px;';
            div.appendChild(span);
        }

        if (info.festival) {
            const span = document.createElement('span');
            span.className = 'festival-date';
            span.textContent = info.festival;
            const color = isStatusActive ? '#fca5a5' : '#dc2626';
            const bg = isStatusActive ? 'rgba(255,255,255,0.15)' : 'rgba(220,38,38,0.10)';
            span.style.cssText = 'display:block;font-size:0.5rem;font-weight:700;color:' + color + ';background:' + bg + ';padding:0 6px;border-radius:10px;line-height:1.5;margin-top:2px;';
            div.appendChild(span);
        }

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

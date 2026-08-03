/**
 * ============================================================
 * calendar.js - 日历渲染模块
 * 使用本地农历数据查表
 * 节气替换农历显示，节日显示在下方标签
 * 排班后文字自动变白
 * ============================================================
 */

const LUNAR_DATA_ALL = {};

function loadLunarData(year) {
    if (LUNAR_DATA_ALL[year]) return LUNAR_DATA_ALL[year];
    const data = window['LUNAR_' + year];
    if (data) {
        LUNAR_DATA_ALL[year] = data;
        return data;
    }
    return null;
}

function getLunarInfo(year, month, day) {
    const data = loadLunarData(year);
    if (!data) return { display: '', festival: '' };
    
    const key = String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const info = data[key];
    if (!info) return { display: '', festival: '' };
    
    return {
        display: info.display || '',
        festival: info.festival || ''
    };
}

function isWeekend(year, month, day) {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * 创建文字元素，根据状态决定颜色
 */
function createTextElement(text, className, isStatusActive) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    // 如果有排班状态（加班/休息），文字变白
    const color = isStatusActive ? '#ffffff' : '#475569';
    span.style.cssText = `display:block;font-size:0.7rem;font-weight:600;color:${color};line-height:1.3;margin-top:2px;letter-spacing:0.3px;`;
    return span;
}

function createFestivalElement(text, isStatusActive) {
    const span = document.createElement('span');
    span.className = 'festival-date';
    span.textContent = text;
    const color = isStatusActive ? '#fca5a5' : '#dc2626';
    const bg = isStatusActive ? 'rgba(255,255,255,0.15)' : 'rgba(220,38,38,0.10)';
    span.style.cssText = `display:block;font-size:0.5rem;font-weight:700;color:${color};background:${bg};padding:0 6px;border-radius:10px;line-height:1.5;margin-top:2px;`;
    return span;
}

function renderCalendar(year, month, onStatusChange) {
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

        div.dataset.year = y;
        div.dataset.month = m;
        div.dataset.day = d;

        // ----- 公历日期 -----
        const num = document.createElement('span');
        num.className = 'date-number';
        num.textContent = d;
        const dateColor = isStatusActive ? '#ffffff' : '#0f172a';
        num.style.cssText = `display:block;font-size:1.1rem;font-weight:700;color:${dateColor};line-height:1.2;`;
        div.appendChild(num);

        // ----- 农历/节气 -----
        const info = getLunarInfo(y, m, d);
        if (info.display) {
            const span = createTextElement(info.display, 'lunar-date', isStatusActive);
            div.appendChild(span);
        }

        // ----- 节日 -----
        if (info.festival) {
            const span = createFestivalElement(info.festival, isStatusActive);
            div.appendChild(span);
        }

        // ----- 加班/休息标记 -----
        const label = document.createElement('span');
        label.className = 'status-label';
        label.textContent = status === 'overtime' ? '🌙' : status === 'rest' ? '☀️' : '·';
        const labelColor = isStatusActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
        label.style.cssText = `font-size:0.55rem;margin-top:1px;color:${labelColor};`;
        div.appendChild(label);

        div.addEventListener('click', function () {
            let next = getStatus(y, m, d);
            next = next === 'normal' ? 'overtime' : next === 'overtime' ? 'rest' : 'normal';
            setStatus(y, m, d, next);
            renderCalendar(year, month, onStatusChange);
            if (onStatusChange) onStatusChange();
            const names = { overtime: '🌙 加班', rest: '☀️ 休息', normal: '普通' };
            document.getElementById('toastMessage').textContent = y + '/' + m + '/' + d + ' → ' + names[next] + ' ✅';
        });

        grid.appendChild(div);
    }

    document.getElementById('overtimeCount').textContent = countStatusInMonth(year, month, 'overtime');
    document.getElementById('restCount').textContent = countStatusInMonth(year, month, 'rest');
}
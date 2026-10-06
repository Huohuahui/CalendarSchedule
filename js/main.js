/**
 * ============================================================
 * main.js - 主程序入口
 * ============================================================
 */

// ---------- 全局状态 ----------
var currentYear = 2026;
var currentMonth = 7;

// ---------- 天气配置 ----------
/**
 * 当前天气坐标：由 weather-location.js 的地点模块提供
 * （自动定位 / 手动选城市，见 js/weather-location.js）。
 * 这里只做兜底，保证即使地点模块未加载也能正常显示天气。
 */
var WEATHER_FALLBACK_LOCATION = { name: '汕头', latitude: 23.4, longitude: 116.7 };

function currentWeatherCoords() {
    if (typeof getWeatherLocation === 'function') {
        var loc = getWeatherLocation();
        if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') return loc;
    }
    return WEATHER_FALLBACK_LOCATION;
}

/** 天气缓存有效期：10 分钟 */
var WEATHER_CACHE_TTL = 10 * 60 * 1000;
var WEATHER_CACHE_KEY = 'weatherCache';

// ---------- DOM 引用 ----------
var prevMonthBtn = document.getElementById('prevMonthBtn');
var nextMonthBtn = document.getElementById('nextMonthBtn');
var todayBtn = document.getElementById('todayBtn');
var markOvertimeBtn = document.getElementById('markOvertimeBtn');
var markRestBtn = document.getElementById('markRestBtn');
var clearMonthBtn = document.getElementById('clearMonthBtn');
var multiSelectBtn = document.getElementById('multiSelectBtn');
var undoBtn = document.getElementById('undoBtn');
var quickTodo = document.getElementById('quickTodo');
var quickClear = document.getElementById('quickClear');
var quickTemplate = document.getElementById('quickTemplate');
var quickCopyPrev = document.getElementById('quickCopyPrev');

// ---------- 页面更新函数 ----------
/**
 * 全量刷新：渲染日历 + 更新进度条 + 更新右上角今日日期
 * 注意：进度条只在这里更新一次，renderCalendar 不再回调
 */
function fullUpdate() {
    renderCalendar(currentYear, currentMonth);
    updateProgressBars(currentYear, currentMonth);
    updateUndoUI();     // 任何变更后同步撤销按钮状态
    // 方案名可能随月份/规则变化（如「仅本月」覆盖），一并刷新入口文字
    if (typeof refreshPlanUI === 'function') refreshPlanUI();
}

function updateProgressBars(year, month) {
    var data = getProgressData(year, month);

    var base = data.base;
    document.getElementById('progressDone').textContent = base.done;
    document.getElementById('progressTarget').textContent = base.target;
    document.getElementById('progressFill').style.width = base.percent + '%';
    document.getElementById('progressStatus').textContent = base.message;
    document.getElementById('progressStatus').className = 'progress-status ' + base.status;

    var fill = document.getElementById('progressFill');
    if (base.status === 'achieved' || base.status === 'exact') {
        fill.className = 'progress-bar-fill achieved';
    } else {
        fill.className = 'progress-bar-fill';
    }

    var extra = data.extra;
    document.getElementById('extraDone').textContent = extra.done;
    document.getElementById('extraTarget').textContent = extra.target;
    document.getElementById('extraFill').style.width = extra.percent + '%';
    document.getElementById('extraStatus').textContent = extra.message;
    document.getElementById('extraStatus').className = 'progress-status ' + extra.status;

    var extraFill = document.getElementById('extraFill');
    if (extra.status === 'achieved') {
        extraFill.className = 'progress-bar-fill achieved';
    } else {
        extraFill.className = 'progress-bar-fill';
    }
}

// ---------- 导航函数 ----------
function goToYearMonth(year, month) {
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    currentYear = year;
    currentMonth = month;
    fullUpdate();
    showToast('📅 ' + year + '年' + month + '月');
}

function goToToday() {
    var today = getToday();
    currentYear = today.year;
    currentMonth = today.month;
    fullUpdate();
    showToast('📍 回到今天');
}

// ---------- 操作函数 ----------
function markToday(status) {
    var today = getToday();
    if (today.year !== currentYear || today.month !== currentMonth) {
        currentYear = today.year;
        currentMonth = today.month;
    }
    setStatus(today.year, today.month, today.day, status);
    fullUpdate();
    var label = status === 'overtime' ? '🌙 加班' : '☀️ 休息';
    showToast('今日 ' + today.year + '/' + today.month + '/' + today.day + ' → ' + label);
}

/**
 * 加班/休息按钮的统一入口：
 * 多选模式且有选区 → 批量应用；否则标记今天
 */
function handleMarkAction(status) {
    if (multiSelectMode) {
        if (selectedDates.length === 0) {
            showToast('☑️ 请先点击日期加入选区');
            return;
        }
        applyMarkToSelected(status);
        return;
    }
    markToday(status);
}

/** 把指定状态批量应用到所有选中日期 */
function applyMarkToSelected(status) {
    var count = selectedDates.length;
    selectedDates.forEach(function (key) {
        var p = key.split('-');
        setStatus(parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10), status);
    });
    clearDateSelection();
    fullUpdate();
    updateMultiSelectUI();
    var label = status === 'overtime' ? '🌙 加班' : '☀️ 休息';
    showToast('✅ 已将 ' + count + ' 天标记为 ' + label);
}

// ---------- 多选模式 ----------
function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;
    clearDateSelection();
    fullUpdate();
    updateMultiSelectUI();
    showToast(multiSelectMode
        ? '☑️ 多选模式：点击日期加入选区，再点「应用」批量标记'
        : '☑️ 已退出多选模式');
}

/** 同步多选按钮与加班/休息按钮的文字、高亮状态 */
function updateMultiSelectUI() {
    if (multiSelectBtn) {
        multiSelectBtn.classList.toggle('active', multiSelectMode);
        multiSelectBtn.textContent = multiSelectMode
            ? '☑️ 完成(' + selectedDates.length + ')'
            : '☑️ 多选';
    }
    if (multiSelectMode) {
        markOvertimeBtn.textContent = '🌙 应用(' + selectedDates.length + ')';
        markRestBtn.textContent = '☀️ 应用(' + selectedDates.length + ')';
    } else {
        markOvertimeBtn.textContent = '🌙 加班';
        markRestBtn.textContent = '☀️ 休息';
    }
}

function clearCurrentMonth() {
    // 多选模式：只清除选中的日期
    if (multiSelectMode) {
        if (selectedDates.length === 0) {
            showToast('☑️ 请先选择日期');
            return;
        }
        if (!confirm('⚠️ 确定要清除选中的 ' + selectedDates.length + ' 天的标记吗？\n\n此操作不可撤销！')) {
            showToast('❌ 已取消清除操作');
            return;
        }
        // 整批清除记入历史，撤销时一次性恢复
        var changes = selectedDates.map(function (key) {
            return { key: key, from: statusMap[key] || 'normal', to: 'normal' };
        });
        var cleared = applyChanges(changes);
        clearDateSelection();
        fullUpdate();
        updateMultiSelectUI();
        showToast(cleared > 0 ? '🧹 已清除 ' + cleared + ' 个标记' : 'ℹ️ 选中日期无标记');
        return;
    }

    var overtimeCount = countStatusInMonth(currentYear, currentMonth, 'overtime');
    var restCount = countStatusInMonth(currentYear, currentMonth, 'rest');
    var total = overtimeCount + restCount;

    if (total === 0) {
        showToast('ℹ️ 本月无标记可清除');
        return;
    }

    var confirmMessage = '⚠️ 确定要清除 ' + currentYear + '年' + currentMonth + '月的所有标记吗？\n\n加班 ' + overtimeCount + ' 天，休息 ' + restCount + ' 天，共 ' + total + ' 个标记\n\n此操作不可撤销！';

    if (confirm(confirmMessage)) {
        var removed = clearMonth(currentYear, currentMonth);
        if (removed > 0) {
            fullUpdate();
            showToast('🧹 已清除 ' + removed + ' 个标记');
            if (typeof analyticsTrack === 'function') analyticsTrack('clear_month');
        }
    } else {
        showToast('❌ 已取消清除操作');
    }
}

function showToast(message) {
    var toast = document.getElementById('toastMessage');
    if (toast) toast.textContent = message;
}

// ============================================================
// 撤销 / 重做（配合 js/history.js 的操作栈）
// ============================================================

function doUndo() {
    var n = undoChanges();
    if (n === 0) {
        showToast('ℹ️ 没有可撤销的操作');
        return;
    }
    fullUpdate();
    updateUndoUI();
    showToast('↩︎ 已撤销 ' + n + ' 处变更');
}

function doRedo() {
    var n = redoChanges();
    if (n === 0) {
        showToast('ℹ️ 没有可重做的操作');
        return;
    }
    fullUpdate();
    updateUndoUI();
    showToast('↪︎ 已重做 ' + n + ' 处变更');
}

/** 同步撤销按钮的可用状态 */
function updateUndoUI() {
    if (!undoBtn) return;
    undoBtn.classList.toggle('disabled', !canUndo());
    undoBtn.title = canUndo() ? '撤销上一步（Ctrl+Z）' : '暂无可撤销的操作';
}

// ============================================================
// 数据导出/导入功能
// 版本 2：完整备份（排班 + 倒计时 + 主题）
// ============================================================

/** 清洗排班数据：只保留合法的键值对 */
function sanitizeStatusMap(raw) {
    var result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    Object.keys(raw).forEach(function (key) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) &&
            (raw[key] === 'overtime' || raw[key] === 'rest')) {
            result[key] = raw[key];
        }
    });
    return result;
}

function exportData() {
    var statusCount = Object.keys(statusMap).length;

    // 统一由 backup.js 收集完整数据（含倒计时 / 待办 / 排班方案 / 主题）
    var payload = collectBackupPayload();
    var countdowns = payload.countdowns;
    var todos = payload.todos;
    var planData = payload.plan;

    if (statusCount === 0 && countdowns.length === 0 && todos.length === 0 && !planData) {
        showToast('⚠️ 没有数据可导出');
        return;
    }

    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;

    var today = getToday();
    var fileName = '排班数据_' + today.year + '-' + String(today.month).padStart(2, '0') + '-' + String(today.day).padStart(2, '0') + '.json';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 记一笔「已备份」，用于备份中心的状态与提醒
    markBackedUp();

    showToast('✅ 已导出 ' + statusCount + ' 个标记、' + countdowns.length + ' 个倒计时、' + todos.length + ' 个待办'
        + (planData ? '、排班方案' : ''));
}

function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) {
            showToast('❌ 未选择文件');
            return;
        }

        var reader = new FileReader();
        reader.onload = function (event) {
            var data;
            try {
                data = JSON.parse(event.target.result);
            } catch (error) {
                showToast('❌ 文件格式错误，请选择正确的备份文件');
                return;
            }

            // 校验 / 清洗 / 写入 / 刷新 一律交给 backup.js，
            // 与「粘贴文本导入」共用同一套逻辑，避免两处实现漂移
            var res = applyImportedBackup(data);
            if (!res.cancelled) showToast(res.msg);
        };
        reader.readAsText(file);
    };

    input.click();
}

// ============================================================
// 时钟模块
// ============================================================

function startClock() {
    updateClock();
    updateGreeting();
    // 对齐到下一个整秒启动，避免秒数跳变抖动
    var delay = 1000 - (Date.now() % 1000);
    setTimeout(function tick() {
        updateClock();
        updateGreeting();
        setTimeout(tick, 1000);
    }, delay);
}

function updateClock() {
    var now = new Date();

    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');
    var timeStr = hours + ':' + minutes + ':' + seconds;

    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var weekday = weekdays[now.getDay()];
    var dateStr = year + '年' + month + '月' + day + '日 ' + weekday;

    var clockEl = document.getElementById('clockDisplay');
    var dateEl = document.getElementById('dateDisplay');

    if (clockEl) clockEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}

// ============================================================
// 问候模块（只在时段变化时更新 DOM，避免每秒无效写入）
// ============================================================

var lastGreetingText = '';

function updateGreeting() {
    var hour = new Date().getHours();
    var greetingEl = document.getElementById('greetingDisplay');
    if (!greetingEl) return;

    var greeting = '';
    var emoji = '';

    if (hour >= 5 && hour < 9) {
        greeting = '早安';
        emoji = '🌅';
    } else if (hour >= 9 && hour < 12) {
        greeting = '上午好';
        emoji = '☀️';
    } else if (hour >= 12 && hour < 14) {
        greeting = '中午好';
        emoji = '🌞';
    } else if (hour >= 14 && hour < 18) {
        greeting = '下午好';
        emoji = '🌤️';
    } else if (hour >= 18 && hour < 21) {
        greeting = '傍晚好';
        emoji = '🌅';
    } else if (hour >= 21 && hour < 24) {
        greeting = '晚安';
        emoji = '🌙';
    } else {
        greeting = '夜深了';
        emoji = '🌃';
    }

    var text = emoji + ' ' + greeting;
    if (text !== lastGreetingText) {
        lastGreetingText = text;
        greetingEl.textContent = text;
    }
}

// ============================================================
// 天气模块（当前天气 + 4个关键时段预报 + 6天预报）
// 带 10 分钟本地缓存 + 6 秒超时，避免每次进入都请求
// ============================================================

function getCachedWeather() {
    try {
        var raw = localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) return null;
        var cache = JSON.parse(raw);
        if (!cache || !cache.fetchedAt || !cache.data) return null;
        if (Date.now() - cache.fetchedAt > WEATHER_CACHE_TTL) return null;
        // 缓存的预报天数不足 6 天（旧版只存了 3 天）时视为失效，强制重新获取
        if (!cache.data.daily || !cache.data.daily.time || cache.data.daily.time.length < 6) return null;
        // 缓存必须属于当前地点，否则会显示上一个城市的天气
        var loc = currentWeatherCoords();
        if (!cache.loc
            || Math.abs(cache.loc.latitude - loc.latitude) > 1e-6
            || Math.abs(cache.loc.longitude - loc.longitude) > 1e-6) return null;
        return cache.data;
    } catch (e) {
        return null;
    }
}

function cacheWeather(data) {
    try {
        var loc = currentWeatherCoords();
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
            fetchedAt: Date.now(),
            loc: { latitude: loc.latitude, longitude: loc.longitude, name: loc.name },
            data: data
        }));
    } catch (e) { /* 存储失败不影响使用 */ }
}

function fetchWeather(forceRefresh) {
    var container = document.getElementById('weatherDisplay');
    if (!container) return;

    // 非强制刷新时优先使用缓存
    if (!forceRefresh) {
        var cached = getCachedWeather();
        if (cached) {
            renderWeatherWithForecast(cached);
            return;
        }
    }

    container.innerHTML = '<div class="weather-loading">⏳ 加载中...</div>';

    var loc = currentWeatherCoords();
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude +
        '&longitude=' + loc.longitude +
        '&current_weather=true' +
        '&hourly=temperature_2m,weathercode' +
        '&daily=temperature_2m_max,temperature_2m_min,weathercode' +
        '&timezone=Asia/Shanghai' +
        '&forecast_days=6';

    // 6 秒超时，防止弱网下一直卡在「加载中」
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 6000);

    fetch(url, { signal: controller.signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            clearTimeout(timeoutId);
            if (data && data.current_weather) {
                cacheWeather(data);
                renderWeatherWithForecast(data);
            } else {
                container.innerHTML = '<div class="weather-loading">暂无天气数据</div>';
            }
        })
        .catch(function () {
            clearTimeout(timeoutId);
            // 失败时尝试用过期缓存兜底（有总比没有强，但必须是同一地点）
            var stale = null;
            try {
                var raw = localStorage.getItem(WEATHER_CACHE_KEY);
                if (raw) {
                    var parsed = JSON.parse(raw);
                    var curLoc = currentWeatherCoords();
                    if (parsed && parsed.data && parsed.loc
                        && Math.abs(parsed.loc.latitude - curLoc.latitude) < 1e-6
                        && Math.abs(parsed.loc.longitude - curLoc.longitude) < 1e-6) {
                        stale = parsed.data;
                    }
                }
            } catch (e) { /* 忽略 */ }
            if (stale && stale.current_weather) {
                renderWeatherWithForecast(stale);
                showToast('⚠️ 天气刷新失败，显示缓存数据');
            } else {
                container.innerHTML = '<div class="weather-loading">🌤️ 加载失败，点击刷新重试</div>';
            }
        });
}

function loadWeather() {
    fetchWeather(false);
}

function renderWeatherWithForecast(data) {
    var container = document.getElementById('weatherDisplay');
    if (!container) return;

    var current = data.current_weather;
    var temp = current.temperature || '--';
    var weatherCode = current.weathercode || 0;
    var windSpeed = current.windspeed || '--';
    var now = new Date();
    var currentHour = now.getHours();

    var weatherMap = {
        0: { text: '晴天', icon: '☀️' },
        1: { text: '晴天', icon: '☀️' },
        2: { text: '少云', icon: '⛅' },
        3: { text: '多云', icon: '⛅' },
        45: { text: '雾', icon: '🌫️' },
        48: { text: '雾', icon: '🌫️' },
        51: { text: '小雨', icon: '🌦️' },
        53: { text: '小雨', icon: '🌦️' },
        55: { text: '中雨', icon: '🌧️' },
        61: { text: '小雨', icon: '🌦️' },
        63: { text: '中雨', icon: '🌧️' },
        65: { text: '大雨', icon: '🌧️' },
        71: { text: '小雪', icon: '🌨️' },
        73: { text: '中雪', icon: '❄️' },
        75: { text: '大雪', icon: '❄️' },
        80: { text: '阵雨', icon: '🌦️' },
        81: { text: '阵雨', icon: '🌧️' },
        82: { text: '大雨', icon: '🌧️' },
        95: { text: '雷阵雨', icon: '⛈️' },
        96: { text: '雷阵雨', icon: '⛈️' },
        99: { text: '雷阵雨', icon: '⛈️' }
    };

    var weather = weatherMap[weatherCode] || { text: '--', icon: '🌤️' };

    container.innerHTML = '';

    // ========== 第一行：当前天气 ==========
    var currentRow = document.createElement('div');
    currentRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--surface-2);';

    var iconSpan = document.createElement('span');
    iconSpan.textContent = weather.icon;
    iconSpan.style.cssText = 'font-size:2rem;flex-shrink:0;';
    currentRow.appendChild(iconSpan);

    var infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'flex:1;';

    var tempSpan = document.createElement('div');
    tempSpan.textContent = Math.round(temp) + '°C';
    tempSpan.style.cssText = 'font-size:1.3rem;font-weight:700;color:var(--text-primary);line-height:1.2;';
    infoDiv.appendChild(tempSpan);

    var descSpan = document.createElement('div');
    descSpan.textContent = weather.text;
    descSpan.style.cssText = 'font-size:0.65rem;color:var(--text-tertiary);';
    infoDiv.appendChild(descSpan);

    currentRow.appendChild(infoDiv);

    var windSpan = document.createElement('span');
    windSpan.textContent = '💨 ' + Math.round(windSpeed) + 'km/h';
    windSpan.style.cssText = 'font-size:0.55rem;color:var(--text-muted);background:var(--surface-2);padding:2px 10px;border-radius:12px;';
    currentRow.appendChild(windSpan);

    container.appendChild(currentRow);

    // ========== 第二行：4个关键时段预报（8点、12点、18点、21点） ==========
    if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
        var hourlyTitle = document.createElement('div');
        hourlyTitle.style.cssText = 'font-size:0.55rem;color:var(--text-muted);padding-top:6px;padding-bottom:4px;';
        hourlyTitle.textContent = '🕐 今日关键时段';
        container.appendChild(hourlyTitle);

        var hourlyRow = document.createElement('div');
        hourlyRow.style.cssText = 'display:flex;gap:6px;';

        var targetHours = [8, 12, 18, 21];
        var labels = ['上午', '中午', '傍晚', '晚上'];

        var times = data.hourly.time;
        var temps = data.hourly.temperature_2m;
        var codes = data.hourly.weathercode;

        for (var h = 0; h < targetHours.length; h++) {
            var targetHour = targetHours[h];
            var found = false;

            for (var i = 0; i < times.length; i++) {
                var timeParts = times[i].split('T');
                var hour = parseInt(timeParts[1].substring(0, 2));
                if (hour === targetHour) {
                    var tempVal = Math.round(temps[i] || 0);
                    var code = codes[i] || 0;
                    var w = weatherMap[code] || { text: '--', icon: '🌤️' };

                    var dayDiv = document.createElement('div');
                    dayDiv.style.cssText = 'flex:1;text-align:center;background:var(--surface);border-radius:6px;padding:4px 0;';

                    if (targetHour === currentHour) {
                        dayDiv.style.background = 'var(--primary-bg)';
                        dayDiv.style.boxShadow = '0 0 0 1px var(--primary)';
                    }

                    dayDiv.innerHTML =
                        '<div style="font-size:0.45rem;font-weight:600;color:var(--text-tertiary);">' + labels[h] + '</div>' +
                        '<div style="font-size:0.7rem;">' + w.icon + '</div>' +
                        '<div style="font-size:0.5rem;font-weight:600;color:var(--text-primary);">' + tempVal + '°</div>';

                    hourlyRow.appendChild(dayDiv);
                    found = true;
                    break;
                }
            }

            if (!found) {
                var emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'flex:1;text-align:center;background:var(--surface);border-radius:6px;padding:4px 0;';
                emptyDiv.innerHTML =
                    '<div style="font-size:0.45rem;font-weight:600;color:var(--text-muted);">' + labels[h] + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--text-muted);">--</div>';
                hourlyRow.appendChild(emptyDiv);
            }
        }

        container.appendChild(hourlyRow);
    }

    // ========== 第三行：6天预报（分两排，每排 3 天，尺寸一致） ==========
    if (data.daily && data.daily.time && data.daily.time.length > 0) {
        var forecastTitle = document.createElement('div');
        forecastTitle.style.cssText = 'font-size:0.55rem;color:var(--text-muted);padding-top:6px;padding-bottom:4px;border-top:1px solid var(--surface-2);margin-top:4px;';
        forecastTitle.textContent = '📅 未来6天';
        container.appendChild(forecastTitle);

        var days = data.daily.time;
        var maxTemps = data.daily.temperature_2m_max;
        var minTemps = data.daily.temperature_2m_min;
        var dailyCodes = data.daily.weathercode;
        var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        var PER_ROW = 3;
        var totalDays = Math.min(days.length, 6);

        for (var r = 0; r < Math.ceil(totalDays / PER_ROW); r++) {
            var forecastRow = document.createElement('div');
            forecastRow.style.cssText = 'display:flex;gap:4px;';

            for (var c = 0; c < PER_ROW; c++) {
                var k = r * PER_ROW + c;

                // 末排不足 3 天时补空位，保证每格宽度与上排一致
                if (k >= totalDays) {
                    var spacer = document.createElement('div');
                    spacer.style.cssText = 'flex:1;';
                    forecastRow.appendChild(spacer);
                    continue;
                }

                var dateParts = days[k].split('-');
                var d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                var dayOfWeek = weekDays[d.getDay()];

                var dCode = dailyCodes[k] || 0;
                var dw = weatherMap[dCode] || { text: '--', icon: '🌤️' };
                var maxT = Math.round(maxTemps[k] || 0);
                var minT = Math.round(minTemps[k] || 0);

                var fDayDiv = document.createElement('div');
                fDayDiv.style.cssText = 'flex:1;text-align:center;background:var(--surface);border-radius:8px;padding:6px 0;';
                if (k === 0) {
                    fDayDiv.style.background = 'var(--primary-bg)';
                }

                fDayDiv.innerHTML =
                    '<div style="font-size:0.5rem;font-weight:600;color:var(--text-tertiary);">' + dayOfWeek + '</div>' +
                    '<div style="font-size:1rem;">' + dw.icon + '</div>' +
                    '<div style="font-size:0.6rem;font-weight:600;color:var(--text-primary);">' + maxT + '°</div>' +
                    '<div style="font-size:0.5rem;color:var(--text-muted);">' + minT + '°</div>';

                forecastRow.appendChild(fDayDiv);
            }

            container.appendChild(forecastRow);
        }
    }
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
    loadFromStorage();

    var today = getToday();
    currentYear = today.year;
    currentMonth = today.month;

    fullUpdate();
    updateMultiSelectUI();

    // 全站唯一的 Esc 浮层关闭监听（各模块通过 overlay.js 注册自己的关闭函数）
    if (typeof initOverlayEsc === 'function') initOverlayEsc();

    var total = Object.keys(statusMap).length;
    showToast('💾 已加载 ' + total + ' 个标记');

    prevMonthBtn.addEventListener('click', function () {
        goToYearMonth(currentYear, currentMonth - 1);
    });
    nextMonthBtn.addEventListener('click', function () {
        goToYearMonth(currentYear, currentMonth + 1);
    });

    todayBtn.addEventListener('click', goToToday);

    // 快速操作「待办」：打开待办事项总览弹窗
    if (quickTodo) {
        quickTodo.addEventListener('click', openTodoModal);
    }

    markOvertimeBtn.addEventListener('click', function () {
        handleMarkAction('overtime');
    });
    markRestBtn.addEventListener('click', function () {
        handleMarkAction('rest');
    });
    if (multiSelectBtn) {
        multiSelectBtn.addEventListener('click', toggleMultiSelect);
    }

    clearMonthBtn.addEventListener('click', clearCurrentMonth);
    quickClear.addEventListener('click', clearCurrentMonth);

    // 排班模板 / 复制上月
    if (quickTemplate) {
        quickTemplate.addEventListener('click', showTemplateModal);
    }
    if (quickCopyPrev) {
        quickCopyPrev.addEventListener('click', function () {
            copyPrevMonth(currentYear, currentMonth);
        });
    }

    // ---------- 撤销 / 重做 ----------
    if (undoBtn) {
        undoBtn.addEventListener('click', doUndo);
        updateUndoUI();
    }

    // 键盘快捷键：Ctrl/⌘ + Z 撤销，Ctrl/⌘ + Shift + Z 或 Ctrl + Y 重做
    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        var k = (e.key || '').toLowerCase();
        if (k === 'z' && !e.shiftKey) {
            e.preventDefault();
            doUndo();
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
            e.preventDefault();
            doRedo();
        }
    });

    // ---------- 日历格子：事件委托（只需绑定一次） ----------
    // 日期格子的点击统一在这里处理，替代原先每个格子单独绑定的方式
    document.getElementById('daysGrid').addEventListener('click', function (e) {
        var cell = e.target.closest('.day-cell');
        if (!cell || cell.classList.contains('empty-cell')) return;

        var y = parseInt(cell.dataset.year, 10);
        var m = parseInt(cell.dataset.month, 10);
        var d = parseInt(cell.dataset.day, 10);

        // 多选模式：点击 = 切换选中状态
        if (multiSelectMode) {
            toggleDateSelection(y, m, d, cell);
            return;
        }

        // 普通模式：循环切换状态（与键盘 Enter/空格 共用同一份逻辑）
        cycleDayStatus(y, m, d);
    });

    // 日历键盘操作：方向键移焦点、Home/End、Enter/空格 切换状态
    initCalendarKeyboard();

    setupDragDrop(markOvertimeBtn, markRestBtn, function () {
        fullUpdate();
    });

    // 初始化天气地点（首次访问请求定位；拒绝/失败/不支持则回退默认城市）并加载天气
    setTimeout(function () {
        if (typeof initWeatherLocation === 'function') {
            initWeatherLocation();
        } else {
            loadWeather();
        }
    }, 500);

    var refreshBtn = document.getElementById('weatherRefresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
            fetchWeather(true);  // 手动刷新：跳过缓存
        });
    }

    // 启动时钟 + 问候
    startClock();

    // 导入：仍保留一个直达入口；「导出」已并入备份中心（js/backup.js）
    var importLink = document.getElementById('importBtn');
    if (importLink) {
        importLink.addEventListener('click', importData);
    }

    // 加载主题（同时生成主题圆点）
    loadTheme();

    // 初始化倒计时功能
    initCountdown();

    // 初始化排班模板（注册模板弹窗的 Esc 关闭）
    if (typeof initTemplates === 'function') initTemplates();

    // 初始化待办事项（加载数据 + 刷新侧栏卡片徽标）
    if (typeof initTodo === 'function') initTodo();

    // 初始化待办「临近提醒」（刷新 / 切回标签页 / 页面停留定时检查）
    if (typeof initTodoReminder === 'function') initTodoReminder();

    // 初始化排班方案（目标天数定制入口）
    if (typeof initPlan === 'function') initPlan();

    // 初始化备份中心（状态 / 提醒 / 导出导入 / 云备份入口）
    if (typeof initBackup === 'function') initBackup();

    // 初始化云备份（已开启且域名允许时，恢复登录态）
    if (typeof initCloudBackup === 'function') initCloudBackup();

    // 初始化使用统计（仅记录事件次数，不含任何内容；仅存本机）
    if (typeof initAnalytics === 'function') initAnalytics();
});

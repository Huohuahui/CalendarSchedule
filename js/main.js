/**
 * ============================================================
 * main.js - 主程序入口
 * ============================================================
 */

// ---------- 全局状态 ----------
var currentYear = 2026;
var currentMonth = 7;

// ---------- DOM 引用 ----------
var prevMonthBtn = document.getElementById('prevMonthBtn');
var nextMonthBtn = document.getElementById('nextMonthBtn');
var todayBtn = document.getElementById('todayBtn');
var markOvertimeBtn = document.getElementById('markOvertimeBtn');
var markRestBtn = document.getElementById('markRestBtn');
var clearMonthBtn = document.getElementById('clearMonthBtn');
var quickToday = document.getElementById('quickToday');
var quickClear = document.getElementById('quickClear');

// ---------- 页面更新函数 ----------
function fullUpdate() {
    renderCalendar(currentYear, currentMonth, function() {
        updateProgressBars(currentYear, currentMonth);
    });
    updateProgressBars(currentYear, currentMonth);
    var today = getToday();
    document.getElementById('todayDateDisplay').textContent =
        today.year + '/' + today.month + '/' + today.day;
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
        fullUpdate();
    }
    setStatus(today.year, today.month, today.day, status);
    fullUpdate();
    var label = status === 'overtime' ? '🌙 加班' : '☀️ 休息';
    showToast('今日 ' + today.year + '/' + today.month + '/' + today.day + ' → ' + label);
}

function clearCurrentMonth() {
    var overtimeCount = countStatusInMonth(currentYear, currentMonth, 'overtime');
    var restCount = countStatusInMonth(currentYear, currentMonth, 'rest');
    var total = overtimeCount + restCount;

    if (total === 0) {
        showToast('ℹ️ 本月无标记可清除');
        return;
    }

    var confirmMessage = '⚠️ 确定要清除 ' + currentYear + '年' + currentMonth + '月的所有标记吗？\n\n加班 ' + overtimeCount + ' 天，休息 ' + restCount + ' 天，共 ' + total + ' 个标记\n\n此操作不可撤销！';

    if (confirm(confirmMessage)) {
        var cleared = clearMonth(currentYear, currentMonth);
        if (cleared > 0) {
            fullUpdate();
            showToast('🧹 已清除 ' + cleared + ' 个标记');
        }
    } else {
        showToast('❌ 已取消清除操作');
    }
}

function showToast(message) {
    var toast = document.getElementById('toastMessage');
    toast.textContent = message;
}

// ============================================================
// 数据导出/导入功能
// ============================================================

function exportData() {
    var data = localStorage.getItem('workStatusMap');
    if (!data) {
        showToast('⚠️ 没有数据可导出');
        return;
    }

    var parsed = JSON.parse(data);
    var count = Object.keys(parsed).length;

    if (count === 0) {
        showToast('⚠️ 没有数据可导出');
        return;
    }

    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;

    var today = getToday();
    var fileName = '加班数据_' + today.year + '-' + String(today.month).padStart(2, '0') + '-' + String(today.day).padStart(2, '0') + '.json';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ 已导出 ' + count + ' 个标记');
}

function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) {
            showToast('❌ 未选择文件');
            return;
        }

        var reader = new FileReader();
        reader.onload = function(event) {
            try {
                var data = JSON.parse(event.target.result);

                if (typeof data !== 'object' || Array.isArray(data)) {
                    showToast('❌ 数据格式无效');
                    return;
                }

                var keys = Object.keys(data);
                var validCount = 0;
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    if (/^\d{4}-\d{2}-\d{2}$/.test(key) &&
                        (data[key] === 'overtime' || data[key] === 'rest')) {
                        validCount++;
                    }
                }

                if (validCount === 0) {
                    showToast('❌ 没有有效的加班数据');
                    return;
                }

                var confirmMessage = '确定要导入数据吗？\n\n将覆盖当前所有数据，共 ' + validCount + ' 个标记\n\n⚠️ 此操作不可撤销！';
                if (!confirm(confirmMessage)) {
                    showToast('❌ 已取消导入');
                    return;
                }

                localStorage.setItem('workStatusMap', JSON.stringify(data));
                fullUpdate();
                showToast('✅ 成功导入 ' + validCount + ' 个标记');

            } catch (error) {
                showToast('❌ 文件格式错误，请选择正确的备份文件');
            }
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
    setInterval(function() {
        updateClock();
        updateGreeting();
    }, 1000);
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
// 问候模块
// ============================================================

function updateGreeting() {
    var now = new Date();
    var hour = now.getHours();
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

    greetingEl.textContent = emoji + ' ' + greeting;
}

// ============================================================
// 天气模块（当前天气 + 4个关键时段预报 + 3天预报）
// ============================================================

function loadWeather() {
    var container = document.getElementById('weatherDisplay');
    if (!container) return;

    container.innerHTML = '<div style="font-size:0.8rem;color:#94a3b8;text-align:center;padding:12px 0;">⏳ 加载中...</div>';

    var latitude = 23.4;
    var longitude = 116.7;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude +
        '&current_weather=true' +
        '&hourly=temperature_2m,weathercode' +
        '&daily=temperature_2m_max,temperature_2m_min,weathercode' +
        '&timezone=Asia/Shanghai' +
        '&forecast_days=3';

    fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.current_weather) {
                renderWeatherWithForecast(data);
            } else {
                container.innerHTML = '<div style="font-size:0.7rem;color:#94a3b8;text-align:center;padding:12px 0;">暂无天气数据</div>';
            }
        })
        .catch(function() {
            container.innerHTML = '<div style="font-size:0.7rem;color:#94a3b8;text-align:center;padding:12px 0;">🌤️ 加载失败，点击刷新重试</div>';
        });
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
    currentRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:1px solid #f1f4f9;';

    var iconSpan = document.createElement('span');
    iconSpan.textContent = weather.icon;
    iconSpan.style.cssText = 'font-size:2rem;flex-shrink:0;';
    currentRow.appendChild(iconSpan);

    var infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'flex:1;';

    var tempSpan = document.createElement('div');
    tempSpan.textContent = Math.round(temp) + '°C';
    tempSpan.style.cssText = 'font-size:1.3rem;font-weight:700;color:#0f172a;line-height:1.2;';
    infoDiv.appendChild(tempSpan);

    var descSpan = document.createElement('div');
    descSpan.textContent = weather.text;
    descSpan.style.cssText = 'font-size:0.65rem;color:#64748b;';
    infoDiv.appendChild(descSpan);

    currentRow.appendChild(infoDiv);

    var windSpan = document.createElement('span');
    windSpan.textContent = '💨 ' + Math.round(windSpeed) + 'km/h';
    windSpan.style.cssText = 'font-size:0.55rem;color:#94a3b8;background:#f1f4f9;padding:2px 10px;border-radius:12px;';
    currentRow.appendChild(windSpan);

    container.appendChild(currentRow);

    // ========== 第二行：4个关键时段预报（8点、12点、18点、21点） ==========
    if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
        var hourlyTitle = document.createElement('div');
        hourlyTitle.style.cssText = 'font-size:0.55rem;color:#94a3b8;padding-top:6px;padding-bottom:4px;';
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
                    dayDiv.style.cssText = 'flex:1;text-align:center;background:#f8fafc;border-radius:6px;padding:4px 0;';

                    if (targetHour === currentHour) {
                        dayDiv.style.background = '#dbeafe';
                        dayDiv.style.boxShadow = '0 0 0 1px #3b82f6';
                    }

                    dayDiv.innerHTML =
                        '<div style="font-size:0.45rem;font-weight:600;color:#64748b;">' + labels[h] + '</div>' +
                        '<div style="font-size:0.7rem;">' + w.icon + '</div>' +
                        '<div style="font-size:0.5rem;font-weight:600;color:#0f172a;">' + tempVal + '°</div>';

                    hourlyRow.appendChild(dayDiv);
                    found = true;
                    break;
                }
            }

            if (!found) {
                var emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'flex:1;text-align:center;background:#f8fafc;border-radius:6px;padding:4px 0;';
                emptyDiv.innerHTML =
                    '<div style="font-size:0.45rem;font-weight:600;color:#94a3b8;">' + labels[h] + '</div>' +
                    '<div style="font-size:0.6rem;color:#94a3b8;">--</div>';
                hourlyRow.appendChild(emptyDiv);
            }
        }

        container.appendChild(hourlyRow);
    }

    // ========== 第三行：3天预报 ==========
    if (data.daily && data.daily.time && data.daily.time.length > 0) {
        var forecastTitle = document.createElement('div');
        forecastTitle.style.cssText = 'font-size:0.55rem;color:#94a3b8;padding-top:6px;padding-bottom:4px;border-top:1px solid #f1f4f9;margin-top:4px;';
        forecastTitle.textContent = '📅 未来3天';
        container.appendChild(forecastTitle);

        var forecastRow = document.createElement('div');
        forecastRow.style.cssText = 'display:flex;gap:4px;';

        var days = data.daily.time;
        var maxTemps = data.daily.temperature_2m_max;
        var minTemps = data.daily.temperature_2m_min;
        var codes = data.daily.weathercode;
        var weekDays = ['日', '一', '二', '三', '四', '五', '六'];

        for (var k = 0; k < Math.min(days.length, 3); k++) {
            var dateParts = days[k].split('-');
            var d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            var dayOfWeek = weekDays[d.getDay()];

            var code = codes[k] || 0;
            var w = weatherMap[code] || { text: '--', icon: '🌤️' };
            var maxT = Math.round(maxTemps[k] || 0);
            var minT = Math.round(minTemps[k] || 0);

            var dayDiv = document.createElement('div');
            dayDiv.style.cssText = 'flex:1;text-align:center;background:#f8fafc;border-radius:8px;padding:6px 0;';
            if (k === 0) {
                dayDiv.style.background = '#dbeafe';
            }

            dayDiv.innerHTML =
                '<div style="font-size:0.5rem;font-weight:600;color:#64748b;">' + dayOfWeek + '</div>' +
                '<div style="font-size:1rem;">' + w.icon + '</div>' +
                '<div style="font-size:0.6rem;font-weight:600;color:#0f172a;">' + maxT + '°</div>' +
                '<div style="font-size:0.5rem;color:#94a3b8;">' + minT + '°</div>';

            forecastRow.appendChild(dayDiv);
        }

        container.appendChild(forecastRow);
    }
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();

    var today = getToday();
    currentYear = today.year;
    currentMonth = today.month;

    fullUpdate();

    var total = Object.keys(statusMap).length;
    showToast('💾 已加载 ' + total + ' 个标记');

    prevMonthBtn.addEventListener('click', function() {
        goToYearMonth(currentYear, currentMonth - 1);
    });
    nextMonthBtn.addEventListener('click', function() {
        goToYearMonth(currentYear, currentMonth + 1);
    });

    todayBtn.addEventListener('click', goToToday);
    quickToday.addEventListener('click', goToToday);

    markOvertimeBtn.addEventListener('click', function() {
        markToday('overtime');
    });
    markRestBtn.addEventListener('click', function() {
        markToday('rest');
    });

    clearMonthBtn.addEventListener('click', clearCurrentMonth);
    quickClear.addEventListener('click', clearCurrentMonth);

    setupDragDrop(markOvertimeBtn, markRestBtn, function() {
        fullUpdate();
    });

    // 加载天气
    setTimeout(function() {
        loadWeather();
    }, 500);

    var refreshBtn = document.getElementById('weatherRefresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadWeather);
    }

    // 启动时钟 + 问候
    startClock();

    // 导出/导入
    var exportBtn = document.getElementById('exportData');
    var importBtn = document.getElementById('importData');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }
    if (importBtn) {
        importBtn.addEventListener('click', importData);
    }

    // 加载主题
    loadTheme();

    // 初始化倒计时功能
    initCountdown();
});
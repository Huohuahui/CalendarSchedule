/**
 * ============================================================
 * themes.js - 主题管理
 * 主题圆点由本模块生成（index.html 只留容器 #themeDots）
 * ============================================================
 */

// 主题存储键名
var THEME_KEY = 'calendar_theme';

// 可选主题列表（颜色需与 themes.css 中各主题的 --primary 保持一致）
var THEME_LIST = [
    { id: 'default', color: '#3b82f6', title: '默认蓝' },
    { id: 'red',     color: '#ef4444', title: '红色' },
    { id: 'orange',  color: '#f59e0b', title: '橙色' },
    { id: 'green',   color: '#22c55e', title: '绿色' },
    { id: 'purple',  color: '#8b5cf6', title: '紫色' },
    { id: 'pink',    color: '#ec4899', title: '粉色' },
    { id: 'cyan',    color: '#06b6d4', title: '青色' },
    { id: 'gray',    color: '#6b7280', title: '灰色' }
];

/**
 * 生成主题圆点（替代原先 HTML 里 8 段重复的内联代码）
 */
function renderThemeDots() {
    var container = document.getElementById('themeDots');
    if (!container) return;

    container.innerHTML = '';

    THEME_LIST.forEach(function (t) {
        var dot = document.createElement('span');
        dot.className = 'theme-dot';
        dot.dataset.theme = t.id;
        dot.title = t.title;
        dot.style.background = t.color;
        dot.setAttribute('aria-label', '主题：' + t.title);
        makeFocusableButton(dot);
        dot.addEventListener('click', function () {
            setTheme(t.id);
            if (typeof analyticsTrack === 'function') analyticsTrack('theme_set');
        });
        container.appendChild(dot);
    });
}

/** 主题 id 是否在白名单内（用于校验外部数据） */
function isKnownThemeId(id) {
    for (var i = 0; i < THEME_LIST.length; i++) {
        if (THEME_LIST[i].id === id) return true;
    }
    return false;
}

/**
 * 设置主题
 *
 * 只接受 THEME_LIST 里的 id：导入的备份可能带着任意字符串，
 * 直接 setAttribute('data-theme', 任意值) 会留下一个永远匹配不到样式的脏值
 * （不报错，但主题静默失效）。
 */
function setTheme(theme) {
    if (!theme || !isKnownThemeId(theme)) theme = 'default';

    // 存储读写都要容错：Safari 隐私模式下 setItem 会抛异常，不能让切主题直接报错中断
    if (theme === 'default') {
        document.documentElement.removeAttribute('data-theme');
        try { localStorage.removeItem(THEME_KEY); } catch (e) { /* 忽略 */ }
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 忽略 */ }
    }

    // 更新圆点选中状态
    document.querySelectorAll('.theme-dot').forEach(function (dot) {
        if (dot.dataset.theme === theme) {
            dot.style.borderColor = '#FFFFFF';
            dot.style.transform = 'scale(1.15)';
        } else {
            dot.style.borderColor = 'var(--border-solid)';
            dot.style.transform = 'scale(1)';
        }
    });

    showToast('🎨 主题已切换');
}

/**
 * 加载已保存的主题
 */
function loadTheme() {
    renderThemeDots();

    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* 忽略 */ }
    setTheme(saved || 'default');
}

/**
 * ============================================================
 * themes.js - 主题管理
 * ============================================================
 */

// 主题存储键名
var THEME_KEY = 'calendar_theme';

/**
 * 设置主题
 */
function setTheme(theme) {
    // 如果是默认主题，移除 data-theme 属性
    if (theme === 'default' || !theme) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem(THEME_KEY);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }
    
    // 更新圆点选中状态
    document.querySelectorAll('.theme-dot').forEach(function(dot) {
        var dotTheme = dot.getAttribute('data-theme');
        if (dotTheme === theme || (theme === 'default' && dotTheme === 'default')) {
            dot.style.borderColor = '#FFFFFF';
            dot.style.transform = 'scale(1.15)';
        } else {
            dot.style.borderColor = '#e2e8f0';
            dot.style.transform = 'scale(1)';
        }
    });
    
    showToast('🎨 主题已切换');
}

/**
 * 加载已保存的主题
 */
function loadTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) {
        setTheme(saved);
    } else {
        // 默认选中默认主题
        document.querySelectorAll('.theme-dot').forEach(function(dot) {
            if (dot.getAttribute('data-theme') === 'default') {
                dot.style.borderColor = '#FFFFFF';
                dot.style.transform = 'scale(1.15)';
            }
        });
    }
}
/**
 * ============================================================
 * overlay.js - 浮层关闭管理器（统一 Esc 行为）
 * ------------------------------------------------------------
 * 背景：随着弹窗变多（方案 / 待办 / 备份 / 粘贴框 / 城市 / 定位说明卡 /
 * 倒计时 / 模板 / 操作菜单），每个模块各自注册一个 keydown 监听会很散，
 * 而且多个浮层同时开着时，按 Esc 该关哪一个没有统一规则。
 *
 * 这里的做法：各模块把自己的「关闭函数」注册进来并给一个优先级，
 * 全站只保留一个 Esc 监听；按下 Esc 时按优先级从高到低尝试，
 * 第一个「确实关掉了东西」的生效，然后停止。
 *
 * 约定：关闭函数返回 true 表示「我关掉了一个浮层」，返回 false 表示
 * 「我没开，不归我管」。优先级建议：越靠上层/越小的浮层，数值越大。
 * ============================================================
 */

/** @type {Array<{pri:number, fn:function():boolean}>} */
var overlayClosers = [];

/**
 * 注册一个浮层关闭函数
 * @param {number} priority 优先级（越大越优先被 Esc 关闭）
 * @param {Function} fn 返回 true 表示已关闭
 */
function registerOverlayCloser(priority, fn) {
    if (typeof fn !== 'function') return;
    overlayClosers.push({ pri: typeof priority === 'number' ? priority : 0, fn: fn });
}

/**
 * 关闭最上层浮层
 * @returns {boolean} 是否关掉了某个浮层
 */
function closeTopOverlay() {
    var list = overlayClosers.slice().sort(function (a, b) { return b.pri - a.pri; });
    for (var i = 0; i < list.length; i++) {
        try {
            if (list[i].fn() === true) return true;
        } catch (e) {
            // 某个关闭函数出错，不应阻断其它的
        }
    }
    return false;
}

/** 全站唯一的 Esc 监听（由 main.js 在初始化时调用一次） */
function initOverlayEsc() {
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        closeTopOverlay();
    });
}

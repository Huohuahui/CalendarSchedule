/**
 * ============================================================
 * modal.js - 弹窗无障碍增强层
 * ------------------------------------------------------------
 * 为什么用「增强」而不是「重写」：
 * 全站有 9 个手写弹窗（方案 / 待办 / 备份 / 粘贴框 / 定位说明卡 /
 * 城市选择 / 倒计时 / 模板 / 操作菜单），各自的内部结构差别很大，
 * 而且 plan.js 会在每次交互后整棵重建弹窗。
 * 把它们统一改造成工厂类风险很高、收益却集中在「无障碍语义 + 焦点管理」上。
 *
 * 所以这里的做法：不做工厂，改用 MutationObserver 在
 * 每个 .modal-overlay 挂载 / 移除时统一补齐：
 *   1) role="dialog" + aria-modal + aria-labelledby
 *   2) 打开时的初始焦点
 *   3) Tab 焦点困留在弹窗内（不会跑到遮罩后面的日历上）
 *   4) 关闭后把焦点归还给打开它的那个元素
 *   5) 顺带统一「点遮罩关闭」——原先 9 处各写了一遍完全相同的代码
 *
 * 所有行为都是「缺失才补」，不覆盖各弹窗自己的焦点设置。
 * ============================================================
 */

/** 弹窗内可聚焦元素的选择器 */
var MODAL_FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 最近一次移除弹窗的时间：用于识别「整棵重建」，重建时不该抢焦点 */
var modalLastRemovedAt = 0;

/** 是否已初始化（幂等守卫） */
var modalA11yBound = false;

function modalIsOverlay(node) {
    return !!(node && node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay'));
}

/** 取最上层的弹窗（DOM 里最后出现的那个） */
function modalTopOverlay() {
    var all = document.querySelectorAll('.modal-overlay');
    return all.length ? all[all.length - 1] : null;
}

/** 列出弹窗内的可聚焦元素（按 DOM 顺序） */
function modalFocusables(overlay) {
    if (!overlay) return [];
    var list = overlay.querySelectorAll(MODAL_FOCUSABLE_SELECTOR);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
}

/**
 * 给一个刚挂载的弹窗补齐无障碍语义与焦点
 * 全部是「缺失才补」：不覆盖弹窗自身的设置
 */
function modalDecorate(overlay) {
    if (!overlay || overlay.dataset.modalA11y === '1') return;
    overlay.dataset.modalA11y = '1';

    var box = overlay.querySelector('.modal-box');
    var dialog = box || overlay;

    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    // 有标题就用标题做可访问名称
    var title = overlay.querySelector('.modal-title');
    if (title) {
        if (!title.id) title.id = 'modalTitle_' + Math.random().toString(36).slice(2, 8);
        dialog.setAttribute('aria-labelledby', title.id);
    }

    // 容器可程序化聚焦（作为没有可聚焦控件时的落点）
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

    // 记住打开前的焦点，关闭后归还
    if (!overlay._prevFocus) overlay._prevFocus = document.activeElement;

    // 统一「点遮罩关闭」（原先 9 处逐字重复）
    if (!overlay._backdropBound) {
        overlay._backdropBound = true;
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
    }

    // 初始焦点：延迟到各弹窗自己的 focus 逻辑之后再判断，
    // 若焦点已经在弹窗内（弹窗自己设过了）就不抢
    setTimeout(function () {
        if (!overlay.parentNode) return;
        if (overlay.contains(document.activeElement)) return;
        // 刚发生过「移除 + 新增」＝弹窗整棵重建，此时抢焦点会打断用户操作
        if (Date.now() - modalLastRemovedAt < 300) return;
        var items = modalFocusables(overlay);
        if (items.length) items[0].focus();
        else dialog.focus();
    }, 120);
}

/** 弹窗被移除后，把焦点还给打开它的元素 */
function modalRestoreFocus(overlay) {
    modalLastRemovedAt = Date.now();
    var prev = overlay && overlay._prevFocus;
    if (!prev || typeof prev.focus !== 'function') return;
    if (!document.contains(prev)) return;
    try { prev.focus(); } catch (e) { /* 焦点归还失败不影响功能 */ }
}

/**
 * 初始化（由 main.js 调用一次）
 */
function initModalA11y() {
    if (modalA11yBound) return;
    modalA11yBound = true;

    // 已存在的弹窗先补一遍（理论上没有，防御性处理）
    var existing = document.querySelectorAll('.modal-overlay');
    for (var i = 0; i < existing.length; i++) modalDecorate(existing[i]);

    var observer = new MutationObserver(function (records) {
        for (var r = 0; r < records.length; r++) {
            var rec = records[r];
            var a, n;
            for (a = 0; a < rec.addedNodes.length; a++) {
                n = rec.addedNodes[a];
                if (modalIsOverlay(n)) modalDecorate(n);
            }
            for (a = 0; a < rec.removedNodes.length; a++) {
                n = rec.removedNodes[a];
                if (modalIsOverlay(n)) modalRestoreFocus(n);
            }
        }
    });
    observer.observe(document.body, { childList: true });

    // Tab 焦点困留：只在最上层弹窗内循环，不会跑到遮罩后面的日历上
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var overlay = modalTopOverlay();
        if (!overlay) return;
        var items = modalFocusables(overlay);
        if (items.length === 0) return;

        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;
        var inside = overlay.contains(active);

        if (e.shiftKey) {
            if (!inside || active === first) {
                e.preventDefault();
                last.focus();
            }
        } else if (!inside || active === last) {
            e.preventDefault();
            first.focus();
        }
    });
}

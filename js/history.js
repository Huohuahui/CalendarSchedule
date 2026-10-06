/**
 * ============================================================
 * history.js - 操作历史（撤销 / 重做）
 * 作用：记录每次排班变更，支持 Ctrl+Z 撤销、Ctrl+Shift+Z 重做
 * 设计：
 *   - 以「批次」为单位：一次批量标记只占一条历史，撤销时整批回退
 *   - 只记录发生变化的部分（key + 变更前后的值），不存全量快照
 *   - 历史只保留在内存，刷新页面后清空（本次会话内可撤销）
 * ============================================================
 */

var MAX_HISTORY = 30;

/** 撤销栈：每项是一个变更批次数组 */
var undoStack = [];
/** 重做栈 */
var redoStack = [];

/**
 * 应用一批变更，并写入历史
 * @param {Array<{key: string, from: string, to: string}>} changes
 *        每条：日期 key、变更前状态、目标状态（'overtime' | 'rest' | 'normal'）
 * @returns {number} 实际生效的变更条数
 */
function applyChanges(changes) {
    // 过滤掉「没变化」的条目（例如把已是加班的日子再标一次加班）
    var real = [];
    for (var i = 0; i < changes.length; i++) {
        if (changes[i].from !== changes[i].to) real.push(changes[i]);
    }
    if (real.length === 0) return 0;

    undoStack.push(real);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];   // 有新操作后，重做栈失效

    writeStatus(real, 'to');
    saveToStorage();
    if (typeof analyticsTrack === 'function') analyticsTrack('mark_schedule');
    return real.length;
}

/**
 * 把某个批次的状态写入 statusMap
 * @param {Array} batch - 变更批次
 * @param {string} field - 'to' 表示应用新值，'from' 表示回退到旧值
 */
function writeStatus(batch, field) {
    for (var i = 0; i < batch.length; i++) {
        var c = batch[i];
        var value = (field === 'to') ? c.to : c.from;
        if (value === 'normal') {
            delete statusMap[c.key];   // 普通状态不占存储
        } else {
            statusMap[c.key] = value;
        }
    }
}

/**
 * 撤销上一步
 * @returns {number} 回退的条数，0 表示没有可撤销的操作
 */
function undoChanges() {
    if (undoStack.length === 0) return 0;
    var batch = undoStack.pop();
    writeStatus(batch, 'from');
    redoStack.push(batch);
    saveToStorage();
    return batch.length;
}

/**
 * 重做被撤销的一步
 * @returns {number} 重做的条数，0 表示没有可重做的操作
 */
function redoChanges() {
    if (redoStack.length === 0) return 0;
    var batch = redoStack.pop();
    writeStatus(batch, 'to');
    undoStack.push(batch);
    saveToStorage();
    return batch.length;
}

function canUndo() {
    return undoStack.length > 0;
}

function canRedo() {
    return redoStack.length > 0;
}

/**
 * 清空撤销 / 重做栈
 *
 * 必须在「数据被整体替换」之后调用（导入备份、云端恢复）。
 * 否则栈里记录的还是替换前的旧值，用户一按 Ctrl+Z 就会把旧值写回新数据，
 * 得到一份「新旧混合」的结果 —— 看起来像导入失败，实际是被撤销回滚了。
 */
function clearHistory() {
    undoStack = [];
    redoStack = [];
    if (typeof updateUndoUI === 'function') updateUndoUI();
}

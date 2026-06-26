/**
 * ============================================================
 * progress.js - 进度条计算模块
 * 作用：计算基础加班和额外加班的进度数据
 * 依赖：utils.js, storage.js
 * ============================================================
 */

/**
 * 计算基础加班进度
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {{
 *   done: number,
 *   target: number,
 *   percent: number,
 *   status: string,
 *   message: string
 * }}
 */
function calcBaseProgress(year, month) {
    const totalOvertime = getTotalOvertime(year, month);
    const target = getBaseTarget(year, month);
    const done = Math.min(totalOvertime, target);
    const percent = calcPercent(done, target);
    
    let status, message;
    if (totalOvertime < target) {
        status = 'unachieved';
        message = `⏳ 还需 ${target - totalOvertime} 天`;
    } else if (totalOvertime === target) {
        status = 'exact';
        message = '🎉 刚好达标！';
    } else {
        status = 'achieved';
        message = `🏆 基础达标！ (+${totalOvertime - target}天)`;
    }
    
    return { done, target, percent, status, message };
}

/**
 * 计算额外加班进度
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {{
 *   done: number,
 *   target: number,
 *   percent: number,
 *   status: string,
 *   message: string
 * }}
 */
function calcExtraProgress(year, month) {
    const totalOvertime = getTotalOvertime(year, month);
    const baseTarget = getBaseTarget(year, month);
    const target = EXTRA_TARGET;
    const extraRaw = getExtraOvertime(totalOvertime, baseTarget);
    const done = Math.min(extraRaw, target);
    const percent = calcPercent(done, target);
    
    let status, message;
    if (totalOvertime < baseTarget) {
        status = 'unachieved';
        message = `⏳ 先完成基础目标 (${baseTarget - totalOvertime}天)`;
    } else if (done >= target) {
        status = 'achieved';
        message = `🌟 额外加班已满！ (+${done}/${target})`;
    } else if (done > 0) {
        status = 'extra';
        message = `⭐ 已加 ${done} 天，还可加 ${target - done} 天`;
    } else {
        status = 'unachieved';
        message = `⏳ 还可额外加 ${target} 天`;
    }
    
    return { done, target, percent, status, message };
}

/**
 * 获取完整的进度数据
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {{
 *   base: 基础进度数据,
 *   extra: 额外进度数据
 * }}
 */
function getProgressData(year, month) {
    return {
        base: calcBaseProgress(year, month),
        extra: calcExtraProgress(year, month)
    };
}
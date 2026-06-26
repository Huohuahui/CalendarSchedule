/**
 * ============================================================
 * utils.js - 工具函数
 * 作用：提供通用的辅助函数，供其他模块调用
 * 特点：纯函数（无副作用），不依赖外部状态
 * ============================================================
 */

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * 
 * 知识点：
 * - String.padStart(targetLength, padString)：在字符串前面填充字符
 *   例如：'6'.padStart(2, '0') → '06'
 * - 模板字符串：使用反引号 `` 和 ${} 插入变量
 * 
 * @param {number} year  - 年份，如 2026
 * @param {number} month - 月份，1-12
 * @param {number} day   - 日期，1-31
 * @returns {string} 格式化后的日期字符串，如 "2026-06-15"
 */
function formatDate(year, month, day) {
    // padStart(2, '0') 确保月份和日期都是两位数
    const m = String(month).padStart(2, '0');  // 月份补零
    const d = String(day).padStart(2, '0');    // 日期补零
    return `${year}-${m}-${d}`;                // 模板字符串拼接
}

/**
 * 获取今天的日期对象
 * 
 * 知识点：
 * - new Date() 创建一个表示当前时间的 Date 对象
 * - Date.getFullYear() 获取年份（4位数）
 * - Date.getMonth() 获取月份（0-11），需要 +1
 * - Date.getDate() 获取日期（1-31）
 * 
 * @returns {{ year: number, month: number, day: number }} 今天的日期
 */
function getToday() {
    const now = new Date();                      // 当前时间的 Date 对象
    return {
        year: now.getFullYear(),                 // 获取年份
        month: now.getMonth() + 1,               // 月份从0开始，+1转成1-12
        day: now.getDate()                       // 获取日期
    };
}

/**
 * 获取指定月份的天数
 * 
 * 知识点：
 * - new Date(year, month, 0) 中的 month 参数：1月=1，2月=2...
 *   第三个参数 0 表示上个月的最后一天
 *   所以 new Date(2026, 6, 0) 返回 2026年5月31日
 * - getDate() 返回该月的天数
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 该月的天数（28-31）
 */
function getDaysInMonth(year, month) {
    // month 参数：1月=1，所以 6月 → new Date(2026, 6, 0) = 5月31日
    return new Date(year, month, 0).getDate();
}

/**
 * 计算基础加班目标
 * 
 * 知识点：
 * - 三元运算符：condition ? valueIfTrue : valueIfFalse
 * - 小月（≤30天）目标14天，大月（31天）目标15天
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 基础加班目标天数
 */
function getBaseTarget(year, month) {
    const days = getDaysInMonth(year, month);
    // 30天及以下为小月，目标是14天；31天为大月，目标是15天
    return days <= 30 ? 14 : 15;
}

/**
 * 额外加班目标（固定为8天）
 * 
 * @constant {number} EXTRA_TARGET - 额外加班目标天数
 */
const EXTRA_TARGET = 8;

/**
 * 计算额外加班天数
 * 
 * 知识点：
 * - Math.max(a, b) 返回两者中的最大值
 * - 额外加班 = 总加班 - 基础目标，最低为0（不能为负数）
 * 
 * @param {number} totalOvertime - 总加班天数
 * @param {number} baseTarget    - 基础目标天数
 * @returns {number} 额外加班天数（0-8）
 */
function getExtraOvertime(totalOvertime, baseTarget) {
    // 总加班减去基础目标，如果小于0则取0
    return Math.max(0, totalOvertime - baseTarget);
}

/**
 * 限制数值在指定范围内
 * 
 * 知识点：
 * - Math.min(a, b) 返回两者中的最小值
 * - Math.max(a, b) 返回两者中的最大值
 * - 组合使用可限制数值范围
 * 
 * @param {number} value - 要限制的值
 * @param {number} min   - 最小值
 * @param {number} max   - 最大值
 * @returns {number} 限制后的值
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * 计算百分比（用于进度条）
 * 
 * @param {number} done   - 已完成数量
 * @param {number} target - 目标数量
 * @returns {number} 百分比（0-100）
 */
function calcPercent(done, target) {
    // 如果目标为0，返回0；否则计算百分比并限制在0-100
    if (target === 0) return 0;
    return clamp((done / target) * 100, 0, 100);
}
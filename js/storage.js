/**
 * ============================================================
 * storage.js - 数据存储模块
 * 作用：管理加班/休息数据的读写，使用 localStorage 持久化
 * 知识点：
 *   - localStorage：浏览器提供的本地存储，数据持久化保存
 *   - JSON.parse() / JSON.stringify()：对象和字符串互转
 *   - 数据验证：确保存储的数据格式正确
 * ============================================================
 */

// ---------- 常量 ----------
/**
 * localStorage 的键名
 * 知识点：使用常量定义键名，避免拼写错误
 */
const STORAGE_KEY = 'workStatusMap';

/**
 * 数据存储对象
 * 格式：{ '2026-06-15': 'overtime', '2026-06-16': 'rest' }
 * 不存储的日期默认为 'normal'（普通）
 * 
 * 知识点：
 * - 对象字面量 {} 存储键值对
 * - 键是日期字符串，值是状态字符串
 */
let statusMap = {};

// ---------- 数据加载 ----------

/**
 * 从 localStorage 加载数据
 * 
 * 知识点：
 * - try...catch：捕获异常，防止数据损坏导致程序崩溃
 * - localStorage.getItem(key)：读取数据，返回字符串或 null
 * - JSON.parse(str)：将 JSON 字符串解析为 JavaScript 对象
 * - typeof 运算符：检查数据类型
 * - Array.isArray()：检查是否为数组
 * 
 * 执行流程：
 * 1. 尝试从 localStorage 读取数据
 * 2. 如果存在，解析为对象
 * 3. 验证数据类型（必须是对象且不是数组）
 * 4. 如果数据无效，重置为空对象
 * 5. 清理无效的键（非日期格式或无效状态值）
 */
function loadFromStorage() {
    try {
        // 尝试从 localStorage 读取数据
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (stored) {
            // 将 JSON 字符串解析为对象
            const parsed = JSON.parse(stored);
            
            // 验证：必须是对象且不是数组
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                statusMap = parsed;  // 赋值给全局变量
            } else {
                statusMap = {};      // 数据无效，重置
            }
        } else {
            statusMap = {};          // 没有数据，重置
        }
    } catch (error) {
        // 捕获异常（如 JSON 解析错误），重置数据
        console.warn('加载数据失败，重置为空:', error);
        statusMap = {};
    }

    // ---------- 数据验证和清理 ----------
    // 遍历所有键，删除无效的条目
    Object.keys(statusMap).forEach(key => {
        // 检查键是否为日期格式：YYYY-MM-DD
        // 正则表达式：^\d{4}-\d{2}-\d{2}$ 表示4位数字-2位数字-2位数字
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            delete statusMap[key];   // 删除无效键
            return;
        }
        
        // 检查值是否有效：只能是 'overtime' 或 'rest'
        const value = statusMap[key];
        if (value !== 'overtime' && value !== 'rest') {
            delete statusMap[key];   // 删除无效值
        }
    });
}

// ---------- 数据保存 ----------

/**
 * 保存数据到 localStorage
 * 
 * 知识点：
 * - JSON.stringify(obj)：将对象转换为 JSON 字符串
 * - localStorage.setItem(key, value)：保存数据
 * 
 * 注意：每次修改数据后都要调用此函数
 */
function saveToStorage() {
    // 将对象转为 JSON 字符串并保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
}

// ---------- 数据操作 ----------

/**
 * 获取某天的状态
 * 
 * 知识点：
 * - 逻辑或 ||：如果 statusMap[key] 为 undefined，返回 'normal'
 * - 默认值：'normal' 表示普通状态（无标记）
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @param {number} day   - 日期（1-31）
 * @returns {string} 'normal' | 'overtime' | 'rest'
 */
function getStatus(year, month, day) {
    const key = formatDate(year, month, day);
    // 如果不存在，默认返回 'normal'
    return statusMap[key] || 'normal';
}

/**
 * 设置某天的状态
 * 
 * 知识点：
 * - 如果状态为 'normal'，从对象中删除该键（节省空间）
 * - 其他状态则保存到对象中
 * - 修改后自动保存到 localStorage
 * 
 * @param {number} year   - 年份
 * @param {number} month  - 月份（1-12）
 * @param {number} day    - 日期（1-31）
 * @param {string} status - 'normal' | 'overtime' | 'rest'
 */
function setStatus(year, month, day, status) {
    const key = formatDate(year, month, day);
    
    if (status === 'normal') {
        // 普通状态：删除键（不存储）
        delete statusMap[key];
    } else {
        // 加班或休息：保存状态
        statusMap[key] = status;
    }
    
    // 自动保存到 localStorage
    saveToStorage();
}

/**
 * 统计某月中指定状态的天数
 * 
 * 知识点：
 * - for 循环遍历该月的每一天
 * - 调用 getStatus 获取每天的状态
 * - 累加匹配的状态数量
 * 
 * @param {number} year        - 年份
 * @param {number} month       - 月份（1-12）
 * @param {string} targetStatus - 'overtime' | 'rest'
 * @returns {number} 该月指定状态的天数
 */
function countStatusInMonth(year, month, targetStatus) {
    const days = getDaysInMonth(year, month);  // 获取该月天数
    let count = 0;                             // 计数器
    
    for (let day = 1; day <= days; day++) {
        // 如果该天的状态匹配目标状态，计数+1
        if (getStatus(year, month, day) === targetStatus) {
            count++;
        }
    }
    
    return count;
}

/**
 * 获取总加班天数（用于进度条计算）
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 该月加班总天数
 */
function getTotalOvertime(year, month) {
    return countStatusInMonth(year, month, 'overtime');
}

/**
 * 清除某个月的所有标记
 * 
 * 知识点：
 * - 遍历该月的每一天
 * - 如果存在标记，删除它
 * - 返回清除的数量
 * 
 * @param {number} year  - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 清除的标记数量
 */
function clearMonth(year, month) {
    const days = getDaysInMonth(year, month);
    let cleared = 0;
    
    for (let day = 1; day <= days; day++) {
        const key = formatDate(year, month, day);
        if (statusMap[key]) {
            delete statusMap[key];   // 删除标记
            cleared++;               // 计数+1
        }
    }
    
    if (cleared > 0) {
        saveToStorage();             // 有清除才保存
    }
    
    return cleared;
}
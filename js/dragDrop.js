/**
 * ============================================================
 * dragDrop.js - 拖拽功能模块
 * 作用：实现从按钮拖拽到日期格子批量标记
 * 知识点：
 *   - HTML5 拖拽 API：dragstart, dragenter, dragleave, dragover, drop, dragend
 *   - 数据传递：e.dataTransfer.setData() / getData()
 *   - 自定义拖拽图像：e.dataTransfer.setDragImage()
 *   - 事件委托：在父元素上监听事件
 * ============================================================
 */

// ---------- 拖拽状态 ----------
/**
 * 当前拖拽数据
 * 格式：{ type: 'overtime' | 'rest' } 或 null
 */
let dragData = null;

/**
 * 设置拖拽功能
 * 
 * 知识点：
 * - 为按钮绑定 dragstart 和 dragend 事件
 * - 创建自定义拖拽图像（克隆元素）
 * - 在日期格子上绑定 dragenter/dragleave/dragover/drop
 * 
 * @param {HTMLElement} overtimeBtn - 加班按钮元素
 * @param {HTMLElement} restBtn     - 休息按钮元素
 * @param {Function} onDrop         - 拖放成功后的回调函数
 */
function setupDragDrop(overtimeBtn, restBtn, onDrop) {
    // ---------- 按钮：拖拽开始 ----------
    function handleDragStart(e, type) {
        // 保存拖拽类型
        dragData = { type: type };
        
        // 创建自定义拖拽图像
        const clone = document.createElement('div');
        clone.className = `drag-clone ${type}`;
        clone.textContent = type === 'overtime' ? '🌙 加班' : '☀️ 休息';
        document.body.appendChild(clone);
        
        // 设置拖拽图像
        e.dataTransfer.setDragImage(clone, 40, 20);
        
        // 清除克隆（setDragImage 会复制一份）
        setTimeout(() => {
            if (clone.parentNode) {
                clone.parentNode.removeChild(clone);
            }
        }, 0);
        
        // 设置拖拽效果和数据
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', type);
        
        // 显示提示
        const label = type === 'overtime' ? '🌙 加班' : '☀️ 休息';
        showToast(`🔄 拖拽到日期标记为 ${label}`);
    }
    
    // 加班按钮拖拽开始
    overtimeBtn.addEventListener('dragstart', function(e) {
        handleDragStart(e, 'overtime');
    });
    
    // 休息按钮拖拽开始
    restBtn.addEventListener('dragstart', function(e) {
        handleDragStart(e, 'rest');
    });
    
    // ---------- 按钮：拖拽结束 ----------
    function handleDragEnd() {
        dragData = null;  // 清空拖拽状态
        
        // 清除所有日期格子的高亮
        document.querySelectorAll('.day-cell.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        showToast('💡 拖拽结束');
    }
    
    overtimeBtn.addEventListener('dragend', handleDragEnd);
    restBtn.addEventListener('dragend', handleDragEnd);
    
    // ---------- 日期格子：拖拽事件（使用事件委托） ----------
    const daysGrid = document.getElementById('daysGrid');
    
    // dragenter：拖拽进入时高亮
    daysGrid.addEventListener('dragenter', function(e) {
        e.preventDefault();
        const target = e.target.closest('.day-cell');
        if (!target) return;
        
        // 只有拖拽中且不是其他月份才高亮
        if (dragData && target.dataset.isOther === 'false') {
            target.classList.add('drag-over');
        }
    }, true);  // 使用捕获阶段
    
    // dragleave：拖拽离开时取消高亮
    daysGrid.addEventListener('dragleave', function(e) {
        e.preventDefault();
        const target = e.target.closest('.day-cell');
        if (target) {
            target.classList.remove('drag-over');
        }
    }, true);
    
    // dragover：必须阻止默认行为，否则 drop 不会触发
    daysGrid.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    
    // drop：拖放释放时执行标记
    daysGrid.addEventListener('drop', function(e) {
        e.preventDefault();
        
        // 获取目标日期格子
        const target = e.target.closest('.day-cell');
        if (!target) return;
        
        target.classList.remove('drag-over');  // 移除高亮
        
        // 检查是否在拖拽中
        if (!dragData) return;
        
        // 检查是否为其他月份
        if (target.dataset.isOther === 'true') {
            showToast('📅 仅可标记当月日期');
            return;
        }
        
        // 获取日期数据
        const year = parseInt(target.dataset.year);
        const month = parseInt(target.dataset.month);
        const day = parseInt(target.dataset.day);
        const status = dragData.type;
        
        // 保存状态
        setStatus(year, month, day, status);
        
        // 显示提示
        const label = status === 'overtime' ? '🌙 加班' : '☀️ 休息';
        showToast(`${year}/${month}/${day} → ${label} (拖拽)`);
        
        // 执行回调（重新渲染日历、更新进度）
        if (onDrop) {
            onDrop();
        }
    });
    
    // ---------- 全局：防止页面其他元素干扰拖拽 ----------
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    document.addEventListener('drop', function(e) {
        e.preventDefault();
    });
}

/**
 * 清除所有日期格子的拖拽高亮
 */
function clearDragHighlights() {
    document.querySelectorAll('.day-cell.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}
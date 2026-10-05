/**
 * ============================================================
 * todo.js - 待办事项模块
 * 作用：一个「总览式」待办清单。点击右侧面板「📝 待办」卡片打开弹窗，
 *       在一处集中管理所有事项（不局限某一天）。
 * 功能：新增 / 编辑 / 删除 / 勾选完成；按时间排序；逾期与今日高亮；
 *       全部 / 待办 / 已完成 三种筛选；侧栏卡片实时显示待办数量。
 * 数据：localStorage 'todoList'
 *   单条结构：{ id, date:'YYYY-MM-DD', time:'HH:MM'|'', title, detail, done, createdAt }
 *   - title  「主题」
 *   - detail 「具体事宜」
 *   - date/time 「时间」
 * ============================================================
 */

var TODO_KEY = 'todoList';
var todoList = [];
var todoFilter = 'all';      // all | active | done
var todoEditingId = null;    // 非空表示正在编辑该条

// ============================================================
// 数据读写
// ============================================================

/** 判断一条数据是否合法，避免脏数据污染 */
function isValidTodo(t) {
    return !!t && typeof t === 'object'
        && typeof t.id === 'string'
        && typeof t.title === 'string'
        && typeof t.date === 'string';
}

/** 从 localStorage 加载并清洗 */
function loadTodos() {
    try {
        var raw = localStorage.getItem(TODO_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        todoList = Array.isArray(parsed) ? parsed.filter(isValidTodo) : [];
    } catch (e) {
        console.warn('加载待办失败，重置为空:', e);
        todoList = [];
    }
}

/** 保存到 localStorage（异常保护） */
function saveTodos() {
    try {
        localStorage.setItem(TODO_KEY, JSON.stringify(todoList));
        return true;
    } catch (e) {
        console.warn('保存待办失败:', e);
        if (typeof showToast === 'function') showToast('⚠️ 待办保存失败，请勿刷新页面');
        return false;
    }
}

function genTodoId() {
    return 'td' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 未完成数量 */
function todoPendingCount() {
    var n = 0;
    for (var i = 0; i < todoList.length; i++) {
        if (!todoList[i].done) n++;
    }
    return n;
}

// ============================================================
// 侧栏卡片徽标
// ============================================================

function renderTodoBadge() {
    var el = document.getElementById('todoBadge');
    if (!el) return;
    var pending = todoPendingCount();
    if (todoList.length === 0) el.textContent = '点击查看';
    else if (pending === 0) el.textContent = '全部完成 🎉';
    else el.textContent = pending + ' 项待办';
}

/** 初始化：加载数据 + 刷新徽标 + 绑定 Esc 关闭 */
function initTodo() {
    loadTodos();
    renderTodoBadge();
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var overlay = document.getElementById('todoModal');
        if (!overlay) return;
        var form = document.getElementById('todoForm');
        if (form && form.style.display !== 'none') {
            renderTodoList();   // 表单视图 → 先返回列表
            return;
        }
        overlay.remove();
    });
}

// ============================================================
// 时间标签（用 YYYY-MM-DD 字符串比较，避免时区偏差）
// ============================================================

function todoDateInfo(todo) {
    var t = getToday();
    var todayKey = formatDate(t.year, t.month, t.day);
    var tom = new Date(t.year, t.month - 1, t.day + 1);
    var yes = new Date(t.year, t.month - 1, t.day - 1);
    var tomKey = formatDate(tom.getFullYear(), tom.getMonth() + 1, tom.getDate());
    var yesKey = formatDate(yes.getFullYear(), yes.getMonth() + 1, yes.getDate());

    var label;
    if (todo.date === todayKey) label = '今天';
    else if (todo.date === tomKey) label = '明天';
    else if (todo.date === yesKey) label = '昨天';
    else {
        var dp = todo.date.split('-');
        var dt = new Date(parseInt(dp[0], 10), parseInt(dp[1], 10) - 1, parseInt(dp[2], 10));
        var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
        label = parseInt(dp[1], 10) + '月' + parseInt(dp[2], 10) + '日 ' + wk;
    }

    var overdue = todo.date < todayKey && !todo.done;
    var isToday = todo.date === todayKey;

    return {
        text: '📅 ' + label + (todo.time ? ' ' + todo.time : '') + (overdue ? ' · 已逾期' : ''),
        cls: overdue ? 'overdue' : (isToday ? 'today' : '')
    };
}

// ============================================================
// 弹窗：总体待办清单
// ============================================================

function openTodoModal() {
    var existing = document.getElementById('todoModal');
    if (existing) existing.remove();

    loadTodos();
    todoFilter = 'all';
    todoEditingId = null;

    var overlay = document.createElement('div');
    overlay.id = 'todoModal';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box todo-box';

    // ---- 头部：标题 + 添加按钮 ----
    var header = document.createElement('div');
    header.className = 'todo-header';

    var hTitle = document.createElement('span');
    hTitle.className = 'todo-header-title';
    hTitle.textContent = '📝 待办事项';
    header.appendChild(hTitle);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'todo-add-btn';
    addBtn.textContent = '✚ 添加';
    addBtn.onclick = function () { showTodoForm(null); };
    header.appendChild(addBtn);

    box.appendChild(header);

    // ---- 统计 ----
    var stats = document.createElement('div');
    stats.id = 'todoStats';
    stats.className = 'todo-stats';
    box.appendChild(stats);

    // ---- 筛选 ----
    var filters = document.createElement('div');
    filters.id = 'todoFilters';
    filters.className = 'todo-filters';
    var defs = [['all', '全部'], ['active', '待办'], ['done', '已完成']];
    for (var i = 0; i < defs.length; i++) {
        (function (def) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'todo-filter';
            b.dataset.filter = def[0];
            b.textContent = def[1];
            b.onclick = function () { todoFilter = def[0]; renderTodoList(); };
            filters.appendChild(b);
        })(defs[i]);
    }
    box.appendChild(filters);

    // ---- 列表 ----
    var listBox = document.createElement('div');
    listBox.id = 'todoListBox';
    listBox.className = 'todo-list';
    box.appendChild(listBox);

    // ---- 表单（默认隐藏） ----
    var form = document.createElement('div');
    form.id = 'todoForm';
    form.className = 'todo-form';
    form.style.display = 'none';
    box.appendChild(form);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    renderTodoList();
}

function makeStatChip(text, strong) {
    var s = document.createElement('span');
    s.className = 'todo-stat' + (strong ? ' todo-stat-strong' : '');
    s.textContent = text;
    return s;
}

/** 渲染列表视图（同时负责从表单视图切回来） */
function renderTodoList() {
    var stats = document.getElementById('todoStats');
    var filters = document.getElementById('todoFilters');
    var listBox = document.getElementById('todoListBox');
    var form = document.getElementById('todoForm');
    if (!listBox) return;

    if (form) form.style.display = 'none';
    if (stats) stats.style.display = '';
    if (filters) filters.style.display = '';
    listBox.style.display = '';

    // 统计
    var total = todoList.length;
    var pending = todoPendingCount();
    if (stats) {
        stats.innerHTML = '';
        stats.appendChild(makeStatChip('共 ' + total + ' 项'));
        stats.appendChild(makeStatChip('待办 ' + pending, true));
        stats.appendChild(makeStatChip('已完成 ' + (total - pending)));
    }

    // 筛选高亮
    if (filters) {
        var btns = filters.querySelectorAll('.todo-filter');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].dataset.filter === todoFilter);
        }
    }

    // 过滤 + 排序（未完成在前，再按时间升序）
    var items = todoList.filter(function (t) {
        if (todoFilter === 'active') return !t.done;
        if (todoFilter === 'done') return t.done;
        return true;
    });
    items.sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        var ka = a.date + (a.time || '');
        var kb = b.date + (b.time || '');
        if (ka !== kb) return ka < kb ? -1 : 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    listBox.innerHTML = '';
    if (items.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'todo-empty';
        if (total === 0) empty.textContent = '🎉 还没有待办，点右上角「✚ 添加」';
        else if (todoFilter === 'active') empty.textContent = '👍 没有未完成的待办';
        else if (todoFilter === 'done') empty.textContent = '还没有已完成的事项';
        else empty.textContent = '暂无事项';
        listBox.appendChild(empty);
        return;
    }

    for (var j = 0; j < items.length; j++) {
        listBox.appendChild(buildTodoItem(items[j]));
    }
}

function buildTodoItem(todo) {
    var info = todoDateInfo(todo);

    var item = document.createElement('div');
    item.className = 'todo-item' + (todo.done ? ' done' : '') + (info.cls ? ' ' + info.cls : '');

    // 勾选框
    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'todo-check';
    check.textContent = '✓';
    check.title = todo.done ? '标记为未完成' : '标记为已完成';
    check.onclick = function () { toggleTodoDone(todo.id); };
    item.appendChild(check);

    // 主体
    var main = document.createElement('div');
    main.className = 'todo-main';

    var title = document.createElement('div');
    title.className = 'todo-title';
    title.textContent = todo.title;
    main.appendChild(title);

    if (todo.detail) {
        var detail = document.createElement('div');
        detail.className = 'todo-detail';
        detail.textContent = todo.detail;
        main.appendChild(detail);
    }

    var meta = document.createElement('div');
    meta.className = 'todo-meta' + (info.cls ? ' ' + info.cls : '');
    meta.textContent = info.text;
    main.appendChild(meta);

    item.appendChild(main);

    // 操作：编辑 / 删除
    var actions = document.createElement('div');
    actions.className = 'todo-item-actions';

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'todo-icon-btn';
    editBtn.textContent = '✎';
    editBtn.title = '编辑';
    editBtn.onclick = function () { showTodoForm(todo.id); };
    actions.appendChild(editBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'todo-icon-btn del';
    delBtn.textContent = '🗑';
    delBtn.title = '删除';
    delBtn.onclick = function () { deleteTodo(todo.id); };
    actions.appendChild(delBtn);

    item.appendChild(actions);
    return item;
}

// ============================================================
// 表单视图：新增 / 编辑
// ============================================================

function showTodoForm(id) {
    var form = document.getElementById('todoForm');
    var stats = document.getElementById('todoStats');
    var filters = document.getElementById('todoFilters');
    var listBox = document.getElementById('todoListBox');
    if (!form) return;

    todoEditingId = id || null;
    var editing = null;
    if (todoEditingId) {
        for (var i = 0; i < todoList.length; i++) {
            if (todoList[i].id === todoEditingId) editing = todoList[i];
        }
    }

    if (stats) stats.style.display = 'none';
    if (filters) filters.style.display = 'none';
    if (listBox) listBox.style.display = 'none';
    form.style.display = 'flex';
    form.innerHTML = '';

    var ft = document.createElement('div');
    ft.className = 'todo-form-title';
    ft.textContent = editing ? '✎ 编辑事项' : '✚ 添加事项';
    form.appendChild(ft);

    // 时间行：日期（必填）+ 具体时间（可选）
    var row = document.createElement('div');
    row.className = 'todo-form-row';

    var dateWrap = document.createElement('div');
    dateWrap.style.flex = '2';
    var dateLabel = document.createElement('div');
    dateLabel.className = 'modal-label';
    dateLabel.textContent = '时间（日期 *）';
    dateWrap.appendChild(dateLabel);
    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'modal-input';
    dateInput.id = 'todoDateInput';
    var t = getToday();
    dateInput.value = editing ? editing.date : formatDate(t.year, t.month, t.day);
    dateWrap.appendChild(dateInput);
    row.appendChild(dateWrap);

    var timeWrap = document.createElement('div');
    timeWrap.style.flex = '1';
    var timeLabel = document.createElement('div');
    timeLabel.className = 'modal-label';
    timeLabel.textContent = '具体时间';
    timeWrap.appendChild(timeLabel);
    var timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'modal-input';
    timeInput.id = 'todoTimeInput';
    timeInput.value = (editing && editing.time) ? editing.time : '';
    timeWrap.appendChild(timeInput);
    row.appendChild(timeWrap);

    form.appendChild(row);

    // 主题
    var titleLabel = document.createElement('div');
    titleLabel.className = 'modal-label';
    titleLabel.textContent = '主题 *';
    form.appendChild(titleLabel);
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'modal-input';
    titleInput.id = 'todoTitleInput';
    titleInput.maxLength = 60;
    titleInput.placeholder = '例如：提交周报 / 牙医复诊';
    titleInput.value = editing ? editing.title : '';
    form.appendChild(titleInput);

    // 具体事宜
    var detailLabel = document.createElement('div');
    detailLabel.className = 'modal-label';
    detailLabel.textContent = '具体事宜';
    form.appendChild(detailLabel);
    var detailInput = document.createElement('textarea');
    detailInput.className = 'modal-input';
    detailInput.id = 'todoDetailInput';
    detailInput.rows = 3;
    detailInput.maxLength = 500;
    detailInput.placeholder = '补充细节（可选）';
    detailInput.value = (editing && editing.detail) ? editing.detail : '';
    form.appendChild(detailInput);

    // 按钮
    var btnGroup = document.createElement('div');
    btnGroup.className = 'modal-btn-group';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = function () { todoEditingId = null; renderTodoList(); };

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'modal-btn modal-btn-primary';
    saveBtn.textContent = editing ? '保存' : '添加';
    saveBtn.onclick = function () { submitTodoForm(); };

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(saveBtn);
    form.appendChild(btnGroup);

    setTimeout(function () { titleInput.focus(); }, 30);
}

function submitTodoForm() {
    var dateInput = document.getElementById('todoDateInput');
    var timeInput = document.getElementById('todoTimeInput');
    var titleInput = document.getElementById('todoTitleInput');
    var detailInput = document.getElementById('todoDetailInput');
    if (!dateInput || !titleInput) return;

    var date = (dateInput.value || '').trim();
    var time = (timeInput && timeInput.value || '').trim();
    var title = (titleInput.value || '').trim();
    var detail = (detailInput && detailInput.value || '').trim();

    if (!title) { showToast('⚠️ 请填写主题'); titleInput.focus(); return; }
    if (!date) { showToast('⚠️ 请选择时间（日期）'); dateInput.focus(); return; }

    if (todoEditingId) {
        for (var i = 0; i < todoList.length; i++) {
            if (todoList[i].id === todoEditingId) {
                todoList[i].date = date;
                todoList[i].time = time;
                todoList[i].title = title;
                todoList[i].detail = detail;
            }
        }
        showToast('✅ 已保存修改');
    } else {
        todoList.push({
            id: genTodoId(),
            date: date,
            time: time,
            title: title,
            detail: detail,
            done: false,
            createdAt: Date.now()
        });
        showToast('✅ 已添加待办');
    }

    todoEditingId = null;
    saveTodos();
    renderTodoList();
    renderTodoBadge();
}

// ============================================================
// 完成 / 删除
// ============================================================

function toggleTodoDone(id) {
    for (var i = 0; i < todoList.length; i++) {
        if (todoList[i].id === id) todoList[i].done = !todoList[i].done;
    }
    saveTodos();
    renderTodoList();
    renderTodoBadge();
}

function deleteTodo(id) {
    var target = null;
    for (var i = 0; i < todoList.length; i++) {
        if (todoList[i].id === id) target = todoList[i];
    }
    if (!target) return;
    if (!confirm('确定要删除「' + target.title + '」吗？')) return;

    todoList = todoList.filter(function (t) { return t.id !== id; });
    saveTodos();
    renderTodoList();
    renderTodoBadge();
    showToast('🗑 已删除');
}

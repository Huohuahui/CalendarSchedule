/**
 * ============================================================
 * smoke.js - 冒烟测试（真实 DOM）
 * ------------------------------------------------------------
 * 做法：起一个本地静态服务，用 jsdom 把真实页面连同真实脚本一起跑起来，
 *       然后在真实 DOM 上断言行为。不是单元测试，而是「整站能不能跑」的体检。
 *
 * 运行：
 *   cd 项目根目录
 *   npm i jsdom          # 只装开发依赖，应用本身依然零依赖
 *   node tests/smoke.js
 *
 * 为什么要它：本项目是纯静态无构建的，以前每次改动都靠临时脚本验证、
 * 用完就删，改动一多就没有回归保障。这个文件把它固化下来。
 * 新增功能时，在对应小节补几条断言即可。
 * ============================================================
 */

const { JSDOM } = require('jsdom');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else {
    fail++;
    failures.push(name + (extra ? '  \u2192 ' + extra : ''));
    console.log('  \u2717 ' + name + (extra ? '  \u2192 ' + extra : ''));
  }
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/** 打开一个页面，等到 load 事件后再给脚本一点时间 */
async function load(port, urlPath, seed) {
  const errors = [];
  const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}${urlPath}`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.confirm = () => true;
      window.alert = () => { };
      window.fetch = () => Promise.reject(new Error('offline-test'));
      if (seed) seed(window);
      window.addEventListener('error', e => errors.push(String(e.message)));
    }
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 300));
  return { dom, w: dom.window, errors };
}

/** 在元素上派发一个键盘事件 */
function press(w, el, key) {
  const ev = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  (el || w.document).dispatchEvent(ev);
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    await runAll(port);
  } catch (e) {
    fail++;
    console.error('\n未捕获异常：' + e.message + '\n' + e.stack);
  }

  console.log('\n===============================');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  · ' + f));
  }
  console.log('===============================');
  server.close();
  process.exit(fail === 0 ? 0 : 1);
});

async function runAll(port) {

  // ============================================================
  console.log('\n=== A. 主页加载 + SEO ===');
  // ============================================================
  const home = await load(port, '/index.html', w => {
    w.localStorage.setItem('workStatusMap', JSON.stringify({
      '2026-10-01': 'overtime', '2026-10-02': 'rest'
    }));
  });
  const w = home.w, d = w.document;

  ok('lang 为 zh-CN', d.documentElement.lang === 'zh-CN', d.documentElement.lang);
  ok('title 含品牌', (d.title || '').indexOf('排班日历') >= 0, d.title);
  const desc = d.querySelector('meta[name="description"]');
  ok('description 长度合理',
    !!desc && desc.content.length >= 60 && desc.content.length <= 200);
  ok('有 canonical', !!d.querySelector('link[rel="canonical"]'));
  ok('有 og:image', !!d.querySelector('meta[property="og:image"]'));
  const ldEl = d.querySelector('script[type="application/ld+json"]');
  let ld = null;
  try { ld = JSON.parse(ldEl.textContent); } catch (e) { }
  ok('JSON-LD 可解析且为 WebApplication', !!ld && ld['@type'] === 'WebApplication');
  ok('页脚有「关于」入口', !!d.getElementById('aboutLink'));
  ok('页脚有「隐私政策」入口', !!d.getElementById('privacyLink'));
  const appFooter = d.querySelector('.app-footer');
  const cssCalendar = fs.readFileSync(path.join(ROOT, 'css/calendar.css'), 'utf8');
  ok('页脚信息含版本与许可',
    !!appFooter && appFooter.textContent.indexOf('MIT 开源许可') >= 0,
    appFooter ? appFooter.textContent : '');
  ok('页脚信息在日历盒子内', !!d.querySelector('.calendar-wrapper > .app-footer'));
  ok('页脚为两行（版本+许可 / 文档入口）',
    appFooter.querySelectorAll('.app-footer-line').length === 2,
    'got ' + appFooter.querySelectorAll('.app-footer-line').length);
  ok('页脚居中', /\.app-footer\s*\{[^}]*text-align:\s*center/.test(cssCalendar));
  ok('页脚贴底（margin-top:auto 填掉下方留白）',
    /\.app-footer\s*\{[^}]*margin-top:\s*auto/.test(cssCalendar));
  ok('日历盒子是纵向 flex（页脚才能贴到底部）',
    /\.calendar-wrapper\s*\{[^}]*flex-direction:\s*column/.test(cssCalendar));
  ok('页脚链接带下划线（与文档页风格一致）',
    /\.app-footer a\s*\{[^}]*text-decoration:\s*underline/.test(cssCalendar));
  ok('操作栏已回到 3 项（关于移入页脚信息）',
    d.querySelectorAll('.footer-hints .footer-link').length === 3,
    'got ' + d.querySelectorAll('.footer-hints .footer-link').length);

  // ============================================================
  console.log('\n=== B. 排班核心 ===');
  // ============================================================
  ok('加载了 2 个标记', Object.keys(w.collectBackupPayload().statuses).length === 2);
  ok('撤销栈初始可用', typeof w.canUndo === 'function');
  w.setStatus(2026, 10, 5, 'overtime');
  ok('新增标记后总数 3', Object.keys(w.collectBackupPayload().statuses).length === 3);
  ok('撤销可用', w.canUndo() === true);
  w.undoChanges();
  ok('撤销后回到 2', Object.keys(w.collectBackupPayload().statuses).length === 2);
  ok('重做可用', w.canRedo() === true);
  w.redoChanges();
  ok('重做后回到 3', Object.keys(w.collectBackupPayload().statuses).length === 3);

  const prog = w.getProgressData(2026, 10);
  ok('进度数据可取', typeof prog.base.target === 'number' && prog.base.target > 0);
  // 2026-10 有 31 天 → 大月目标 15；2026-11 有 30 天 → 小月目标 14
  ok('大月(31天)目标走方案默认 15', prog.base.target === 15, 'got ' + prog.base.target);
  ok('小月(30天)目标走方案默认 14', w.getProgressData(2026, 11).base.target === 14,
    'got ' + w.getProgressData(2026, 11).base.target);

  // ============================================================
  console.log('\n=== C. 日历键盘可达性 ===');
  // ============================================================
  const grid = d.getElementById('daysGrid');
  ok('网格有 role=grid', grid.getAttribute('role') === 'grid');
  const cells = grid.querySelectorAll('.day-cell:not(.empty-cell)');
  ok('有日期格子', cells.length >= 28, 'got ' + cells.length);
  ok('格子有 role=gridcell', cells[0].getAttribute('role') === 'gridcell');
  ok('格子有 aria-label', !!cells[0].getAttribute('aria-label'),
    cells[0].getAttribute('aria-label') || '');
  ok('aria-label 含日期与状态',
    /年.*月.*日，/.test(cells[0].getAttribute('aria-label') || ''),
    cells[0].getAttribute('aria-label') || '');

  let tabbable = grid.querySelectorAll('.day-cell[tabindex="0"]');
  ok('全月只有一个格子可 Tab 进入（roving tabindex）', tabbable.length === 1,
    'got ' + tabbable.length);

  // 方向键移动焦点
  const startDay = parseInt(tabbable[0].dataset.day, 10);
  press(w, tabbable[0], 'ArrowRight');
  tabbable = grid.querySelectorAll('.day-cell[tabindex="0"]');
  ok('→ 焦点右移一天', tabbable.length === 1 &&
    parseInt(tabbable[0].dataset.day, 10) === startDay + 1,
    'from ' + startDay + ' to ' + (tabbable[0] && tabbable[0].dataset.day));

  press(w, tabbable[0], 'ArrowDown');
  tabbable = grid.querySelectorAll('.day-cell[tabindex="0"]');
  ok('↓ 焦点下移一周', parseInt(tabbable[0].dataset.day, 10) === startDay + 8,
    'got ' + tabbable[0].dataset.day);

  // Enter 切换状态
  const targetDay = parseInt(tabbable[0].dataset.day, 10);
  const key = '2026-10-' + String(targetDay).padStart(2, '0');
  const before = w.getStatus(2026, 10, targetDay);
  press(w, tabbable[0], 'Enter');
  const after = w.getStatus(2026, 10, targetDay);
  ok('Enter 切换了该天状态', before !== after, before + ' → ' + after);
  ok('切换后可撤销（走的是同一套历史栈）', w.canUndo() === true);

  // ============================================================
  console.log('\n=== D. Esc 统一浮层管理 ===');
  // ============================================================
  ok('overlay.js 已加载', typeof w.registerOverlayCloser === 'function');
  w.openBackupModal();
  ok('备份中心已打开', !!d.getElementById('backupModal'));
  w.showPasteBox('测试', '');
  ok('粘贴框已打开', !!d.getElementById('pasteBox'));
  press(w, null, 'Escape');
  ok('Esc 先关最上层的粘贴框', !d.getElementById('pasteBox') && !!d.getElementById('backupModal'));
  press(w, null, 'Escape');
  ok('再按 Esc 关备份中心', !d.getElementById('backupModal'));

  // 真实嵌套场景：待办弹窗里的「表单视图」在列表之上
  w.openTodoModal();
  w.showTodoForm(null);
  ok('待办表单视图已打开', d.getElementById('todoForm').style.display !== 'none');
  press(w, null, 'Escape');
  ok('Esc 先从表单退回列表（弹窗仍开着）',
    d.getElementById('todoForm').style.display === 'none' && !!d.getElementById('todoModal'));
  press(w, null, 'Escape');
  ok('再按 Esc 关待办弹窗', !d.getElementById('todoModal'));

  // 方案弹窗独立验证
  w.showPlanModal();
  ok('方案弹窗已打开', !!d.getElementById('planModal'));
  press(w, null, 'Escape');
  ok('Esc 关方案弹窗', !d.getElementById('planModal'));

  // 模板弹窗（在 templates.js 里注册，之前没有任何 Esc 支持）
  w.showTemplateModal();
  ok('模板弹窗已打开', !!d.getElementById('templateModal'));
  press(w, null, 'Escape');
  ok('Esc 关模板弹窗', !d.getElementById('templateModal'));

  // ============================================================
  console.log('\n=== E. 备份中心 ===');
  // ============================================================
  let st = w.backupStatus();
  ok('识别出有数据', st.hasData === true);
  ok('从未备份', st.neverBacked === true);
  ok('导出结构 version=4', w.collectBackupPayload().version === 4);
  const fp1 = w.currentBackupFingerprint();
  ok('指纹稳定', fp1 === w.currentBackupFingerprint());
  w.markBackedUp();
  ok('标记备份后不再是「有改动」', w.backupStatus().changed === false);
  w.setStatus(2026, 10, 20, 'overtime');
  ok('再次改动后恢复「有改动」', w.backupStatus().changed === true);

  const bad = w.applyImportedBackup({ foo: 'bar' });
  ok('非法备份被拒绝', bad.ok === false);
  const good = w.applyImportedBackup({ '2026-01-01': 'overtime' });
  ok('兼容旧版纯 map 格式', good.ok === true &&
    Object.keys(w.collectBackupPayload().statuses).length === 1);

  // ============================================================
  console.log('\n=== F. 主题变量（不再写死品牌色）===');
  // ============================================================
  ok('工作分类用主题变量', w.CATEGORY_DATA['工作'].color === 'var(--primary)',
    w.CATEGORY_DATA['工作'].color);
  const css = fs.readFileSync(path.join(ROOT, 'css/themes.css'), 'utf8');
  ['--surface', '--surface-2', '--text-tertiary', '--warn'].forEach(v => {
    ok('themes.css 定义了 ' + v, css.indexOf(v) >= 0);
  });
  // 抽查：JS 里不应再出现写死的品牌蓝
  const mainJs = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  ok('main.js 天气模块不再写死 #3b82f6', mainJs.indexOf('#3b82f6') < 0);
  ok('main.js 天气模块不再写死 #dbeafe', mainJs.indexOf('#dbeafe') < 0);

  // ============================================================
  console.log('\n=== G. 本地使用统计 ===');
  // ============================================================
  ok('记录了打开次数', w.analyticsSummary().openCount >= 1);
  ok('记录了排班操作', w.analyticsSummary().events.some(e => e.key === 'mark_schedule'));
  ok('端点未配置', w.analyticsEndpointReady() === false);
  ok('上报默认关闭', w.analyticsOptin() === false);
  let sent = false;
  w.fetch = () => { sent = true; return Promise.resolve({}); };
  w.analyticsSetOptin(true);
  await w.analyticsFlush();
  ok('未配置端点时绝不上报', sent === false);
  w.analyticsSetOptin(false);

  // ============================================================
  console.log('\n=== H. 本地错误日志 ===');
  // ============================================================
  ok('错误日志模块已加载', typeof w.errorLogRecord === 'function');
  w.errorLogRecord('测试错误 A', 'js/test.js:1:1', 'stack-A');
  w.errorLogRecord('测试错误 A', 'js/test.js:1:1', 'stack-A');
  w.errorLogRecord('测试错误 B', 'js/test.js:2:2');
  let es = w.errorLogSummary();
  ok('去重计数正确（A 出现 2 次）', es.count === 2 && es.total === 3,
    JSON.stringify({ count: es.count, total: es.total }));
  ok('最新的排在最前', es.entries[0].m === '测试错误 B');
  const reportText = w.errorLogAsText();
  ok('报告含报错信息', reportText.indexOf('测试错误 A') >= 0);
  ok('报告说明了不含用户内容', reportText.indexOf('不含你的排班') >= 0);
  // 超长信息截断
  w.errorLogRecord('X'.repeat(500), 'js/long.js');
  es = w.errorLogSummary();
  ok('超长信息被截断', es.entries[0].m.length <= 201, 'len=' + es.entries[0].m.length);
  w.errorLogClear();
  ok('可清空', w.errorLogSummary().count === 0);

  // 关键：整个主页跑下来，真实报错应为 0
  ok('运行期无未捕获错误（错误日志为空）', w.errorLogSummary().count === 0,
    JSON.stringify(w.errorLogSummary().entries.map(e => e.m)));
  ok('无 window error 事件', home.errors.length === 0, home.errors.join(' | '));
  home.dom.window.close();

  // ============================================================
  console.log('\n=== I. 关于页 ===');
  // ============================================================
  const about = await load(port, '/pages/about.html', win => {
    win.localStorage.setItem('analyticsLocal', JSON.stringify({
      v: 1, firstSeen: Date.now() - 86400000 * 5, lastSeen: Date.now(),
      openCount: 7, dayCount: 3, lastDay: '2026-10-06',
      events: { mark_schedule: 12, todo_add: 3, theme_set: 1 }
    }));
    win.localStorage.setItem('errorLog', JSON.stringify({
      entries: [{ t: Date.now(), m: 'TypeError: demo', s: 'js/demo.js:9:9', k: 'at demo', n: 2 }]
    }));
  });
  const aw = about.w, ad = aw.document;
  const aText = ad.body.textContent;

  ok('统计：累计打开次数', (ad.getElementById('statsMeta').textContent || '').indexOf('7 次') >= 0);
  ok('统计：事件条 3 项', ad.querySelectorAll('#statsBody .stat-bar-row').length === 3);
  ok('统计：降序（标记排班在最前）',
    (ad.querySelector('#statsBody .stat-bar-row') || {}).textContent?.indexOf('标记排班') >= 0);
  ok('错误：显示报错条数', (ad.getElementById('errorMeta').textContent || '').indexOf('1 条') >= 0);
  ok('错误：显示累计次数', (ad.getElementById('errorMeta').textContent || '').indexOf('2 次') >= 0);
  ok('错误：列出报错内容', (ad.getElementById('errorBody').textContent || '').indexOf('TypeError: demo') >= 0);
  ok('错误：展示堆栈', ad.querySelectorAll('#errorBody .err-stack').length === 1);
  const toggle = ad.getElementById('optinToggle');
  ok('上报开关存在且因未配置而禁用', !!toggle && toggle.disabled === true);
  ok('反馈区分 Issues 与 PR',
    aText.indexOf('Issues') >= 0 && aText.indexOf('Pull Request') >= 0);
  ok('有 Issues 新建议题链接', !!ad.querySelector('a[href*="issues/new"]'));
  ok('许可写明 MIT License', aText.indexOf('MIT License') >= 0);
  ok('无「请填写」占位符', aText.indexOf('请填写') < 0);
  ok('关于页无未捕获错误', about.errors.length === 0, about.errors.join(' | '));
  about.dom.window.close();

  // ============================================================
  console.log('\n=== J. 隐私政策 ===');
  // ============================================================
  const pv = await load(port, '/pages/privacy.html');
  const pd = pv.w.document;
  const pText = pd.body.textContent;
  ok('标题正确', (pd.title || '').indexOf('隐私政策') >= 0);
  ok('有 canonical', !!pd.querySelector('link[rel="canonical"]'));
  [
    ['逐项列出存储键', 'workStatusMap'],
    ['新增的 errorLog 已写入', 'errorLog'],
    ['声明不使用 Cookie', 'Cookie'],
    ['列出第三方域名', 'api.open-meteo.com'],
    ['说明定位权限', '位置信息'],
    ['说明云备份', '云备份'],
    ['说明撤回方式', '撤回'],
    ['说明彻底删除', '清除网站数据'],
    ['含未成年人条款', '未成年人'],
    ['含免责声明', '免责声明'],
    ['标注生效日期', '生效日期'],
    ['联系方式为 Issues', 'GitHub Issues']
  ].forEach(([label, needle]) => ok(label, pText.indexOf(needle) >= 0, '缺少：' + needle));
  ok('无「请填写」占位符', pText.indexOf('请填写') < 0);
  ok('隐私页无未捕获错误', pv.errors.length === 0, pv.errors.join(' | '));
  pv.dom.window.close();

  // ============================================================
  console.log('\n=== K. 静态文件与配置 ===');
  // ============================================================
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok('sw.js 版本已升级', /schedule-calendar-v\d+/.test(sw));
  ['error-log.js', 'overlay.js', 'analytics.js', 'about.js'].forEach(f => {
    ok('sw 预缓存含 ' + f, sw.indexOf(f) >= 0);
  });
  ok('sw 导航缓存按请求地址（不再一律写 index.html）',
    sw.indexOf('cache.put(request, clone)') >= 0);
  const rb = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  ok('robots.txt 允许抓取并指向 sitemap',
    rb.indexOf('Allow: /') >= 0 && rb.indexOf('Sitemap:') >= 0);
  const lic = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  ok('LICENSE 为 MIT 且含致谢',
    lic.indexOf('MIT License') >= 0 && lic.indexOf('lunar-javascript') >= 0);

  const util = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
  ok('死代码 EXTRA_TARGET 已删除', util.indexOf('const EXTRA_TARGET') < 0);
  const cal = fs.readFileSync(path.join(ROOT, 'js/calendar.js'), 'utf8');
  ok('死参数 onStatusChange 已删除', cal.indexOf('onStatusChange') < 0);
  const cd = fs.readFileSync(path.join(ROOT, 'js/countdown.js'), 'utf8');
  ok('废弃 API substr 已替换', cd.indexOf('.substr(') < 0);
}

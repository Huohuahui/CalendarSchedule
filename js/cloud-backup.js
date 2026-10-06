/**
 * ============================================================
 * cloud-backup.js - 云备份（档 2）
 * ------------------------------------------------------------
 * 做什么：把整包数据快照存到「你自己的账号」下，换设备 / 清缓存后能恢复。
 *
 * 重要设计前提（由平台规则决定，不是偷懒）：
 *   1) 云备份必须登录。平台强制「用户数据按用户隔离」（RLS: owner_id = auth.uid()），
 *      没有真实身份就无法安全地存取，因此不做匿名/设备号方案。
 *   2) Web 端只支持「邮箱」登录（平台不提供 Web 端的手机号/微信登录）。
 *   3) 云备份只在本应用「注册的正式发布域名」下可用：服务端按 Origin 精确校验。
 *      本地 file:// / 静态托管预览 / 未授权域名下，这里会明确告知并禁用，
 *      绝不伪造一个本地假的「云备份」。
 *   4) 只上传「整包快照」，不做字段级合并：恢复时整包覆盖（会二次确认）。
 *
 * 默认关闭：开启后才会去加载 SDK（CDN）并发起网络请求，符合本项目「隐私优先」的定位。
 *
 * 数据：localStorage 'cloudBackupEnabled'（开关）、'backupMeta.lastCloudAt'（上次云备份时间）
 * 依赖：backup.js（collectBackupPayload / applyImportedBackup / markCloudBackedUp / backupFormatTime）
 * ============================================================
 */

var CB_SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
var CB_ENABLED_KEY = 'cloudBackupEnabled';
var CB_TABLE = 'schedule_backups';

// ---------- 运行期状态 ----------
var cbClient = null;        // 云服务客户端（只初始化一次）
var cbSdkPromise = null;    // CDN 脚本加载 Promise
var cbSession = null;       // 当前登录会话
var cbBusy = false;         // 有请求在飞（禁用按钮）
var cbStatus = '';          // 状态/错误提示
var cbStatusErr = false;
var cbMode = 'password';    // 登录面板：password | otp | reset
var cbPendingOtp = null;    // { email, verificationId, isExistingUser }
var cbOtpSent = false;      // 验证码是否已发送（决定是否显示验证码输入框）
var cbResetSent = false;    // 重置码是否已发送
var cbAuthBound = false;    // 是否已绑定 onAuthStateChange

// ============================================================
// 配置 / 环境判定
// ============================================================

function cbConfig() {
    if (typeof window === 'undefined' || !window.CLOUD_CONFIG) return null;
    var c = window.CLOUD_CONFIG;
    if (!c.endpoint || !c.publishableKey) return null;
    return c;
}

function cbEnabled() {
    try { return localStorage.getItem(CB_ENABLED_KEY) === '1'; } catch (e) { return false; }
}

function cbSetEnabled(v) {
    try {
        if (v) localStorage.setItem(CB_ENABLED_KEY, '1');
        else localStorage.removeItem(CB_ENABLED_KEY);
    } catch (e) { /* 忽略 */ }
}

/**
 * 是否运行在「本应用注册的发布域名」下。
 * 服务端按 Origin 精确校验，其它环境（本地 / GitHub Pages / 预览）登录必然失败，
 * 这里提前判断，给出可读的说明而不是让用户撞一个看不懂的报错。
 */
function cbOriginOk() {
    var cfg = cbConfig();
    if (!cfg) return false;
    if (typeof window === 'undefined' || !window.location) return false;
    try {
        var endpointHost = new URL(cfg.endpoint).hostname;
        var slug = endpointHost.split('.')[0];      // 与域名后缀无关，仍限定到本应用
        return window.location.hostname === endpointHost
            || window.location.hostname.indexOf(slug) === 0;
    } catch (e) {
        return false;
    }
}

// ============================================================
// SDK 懒加载 + 客户端
// ============================================================

/** 动态加载 CDN 上的 SDK（只在用户开启云备份后才发生） */
function cbLoadSdk() {
    if (window.WorkBuddyCloud) return Promise.resolve();
    if (cbSdkPromise) return cbSdkPromise;

    cbSdkPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = CB_SDK_URL;
        s.async = true;
        s.onload = function () {
            if (window.WorkBuddyCloud) resolve();
            else reject(new Error('SDK 未正确暴露'));
        };
        s.onerror = function () {
            cbSdkPromise = null;
            reject(new Error('SDK 加载失败'));
        };
        document.head.appendChild(s);
    });
    return cbSdkPromise;
}

/** 取（并按需初始化）云服务客户端 */
function cbGetClient() {
    if (cbClient) return Promise.resolve(cbClient);
    var cfg = cbConfig();
    if (!cfg) return Promise.reject(new Error('缺少云服务配置'));

    return cbLoadSdk().then(function () {
        // endpoint 与 publishableKey 都来自 publicConfig，二者缺一不可
        cbClient = window.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: cfg.endpoint,
            publishableKey: cfg.publishableKey
        });
        cbBindAuthEvents();
        return cbClient;
    });
}

function cbBindAuthEvents() {
    if (cbAuthBound || !cbClient || !cbClient.auth || !cbClient.auth.onAuthStateChange) return;
    cbAuthBound = true;
    try {
        cbClient.auth.onAuthStateChange(function (event, session) {
            cbSession = session || null;
            if (document.getElementById('backupCloudHost')) cbRerender();
        });
    } catch (e) { /* 忽略 */ }
}

// ============================================================
// 小工具
// ============================================================

function cbMaskEmail(email) {
    if (!email || email.indexOf('@') < 0) return '已登录';
    var p = email.split('@');
    var n = p[0] || '';
    var head = n.slice(0, Math.min(2, n.length));
    return head + '***@' + p[1];
}

function cbEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;   // 一律 textContent，防注入
    return el;
}

function cbButton(id, text, cls, fn) {
    var b = cbEl('button', cls || 'modal-btn modal-btn-cancel', text);
    b.type = 'button';
    if (id) b.id = id;
    b.disabled = !!cbBusy;
    b.onclick = fn;
    return b;
}

function cbInput(id, type, placeholder) {
    var i = cbEl('input', 'modal-input', null);
    i.type = type;
    i.id = id;
    if (placeholder) i.placeholder = placeholder;
    return i;
}

function cbSetStatus(msg, isErr) {
    cbStatus = msg || '';
    cbStatusErr = !!isErr;
}

function cbValue(id) {
    var el = document.getElementById(id);
    return el && typeof el.value === 'string' ? el.value.trim() : '';
}

function cbErrorText(err) {
    if (!err) return '操作失败，请重试';
    var kind = err.kind || '';
    if (kind === 'unauthenticated' || kind === 'invalid_grant') return '登录已失效，请重新登录';
    if (kind === 'network' || kind === 'backend-unavailable') return '网络异常，请稍后重试';
    return err.message || '操作失败，请重试';
}

// ============================================================
// 认证：会话
// ============================================================

function cbRefreshSession(then) {
    return cbGetClient().then(function (cloud) {
        return cloud.auth.getSession();
    }).then(function (res) {
        cbSession = (res && res.data) ? res.data : null;
        if (then) then();
        return cbSession;
    }).catch(function () {
        cbSession = null;
        if (then) then();
        return null;
    });
}

function cbSignOut() {
    if (!cbClient || !cbClient.auth) return;
    cbBusy = true;
    cbRerender();
    cbClient.auth.signOut().then(function () {
        cbSession = null;
        cbBusy = false;
        cbSetStatus('已退出登录', false);
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

// ============================================================
// 认证：邮箱 + 密码
// ============================================================

function cbSignInPassword() {
    var email = cbValue('cbEmail');
    var pwd = cbValue('cbPassword');
    if (!email || !pwd) { cbSetStatus('请填写邮箱和密码', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('登录中…', false); cbRerender();
    cbGetClient().then(function (cloud) {
        return cloud.auth.signInWithPassword({ email: email, password: pwd });
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus('账号或密码不正确', true); cbRerender(); return; }
        cbSession = (res && res.data) ? res.data : null;
        cbSetStatus('登录成功', false);
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

// ============================================================
// 认证：邮箱验证码（登录 / 注册，注册需补密码）
// ============================================================

function cbSendOtp() {
    var email = cbValue('cbEmail');
    if (!email) { cbSetStatus('请填写邮箱', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('正在发送验证码…', false); cbRerender();
    cbGetClient().then(function (cloud) {
        return cloud.auth.sendOtp({ email: email });
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        var d = (res && res.data) || {};
        cbPendingOtp = {
            email: email,
            verificationId: d.verificationId,
            isExistingUser: !!d.isExistingUser
        };
        cbOtpSent = true;
        cbSetStatus('验证码已发送到邮箱，请查收（含垃圾邮件箱）', false);
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

function cbVerifyOtp() {
    var pending = cbPendingOtp;
    var code = cbValue('cbCode');
    if (!pending) { cbSetStatus('请先获取验证码', true); cbRerender(); return; }
    if (!code) { cbSetStatus('请填写验证码', true); cbRerender(); return; }

    var pwd = cbValue('cbPassword');
    if (!pending.isExistingUser && !pwd) {
        cbSetStatus('新账号需要设置一个密码', true);
        cbRerender();
        return;
    }

    cbBusy = true; cbSetStatus('验证中…', false); cbRerender();
    cbGetClient().then(function (cloud) {
        return cloud.auth.verifyOtp({
            email: pending.email,
            verificationId: pending.verificationId,
            isExistingUser: pending.isExistingUser,
            token: code,
            password: pending.isExistingUser ? undefined : pwd
        });
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        cbPendingOtp = null;
        cbOtpSent = false;
        cbSession = (res && res.data) ? res.data : null;
        cbSetStatus(pending.isExistingUser ? '登录成功' : '注册成功，已登录', false);
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

// ============================================================
// 认证：忘记密码
// ============================================================

function cbSendReset() {
    var email = cbValue('cbEmail');
    if (!email) { cbSetStatus('请填写邮箱', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('正在发送…', false); cbRerender();
    cbGetClient().then(function (cloud) {
        return cloud.auth.resetPasswordForEmail(email);
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        cbResetHandle = (res && res.data) ? res.data : null;   // 携带 updateUser
        cbResetSent = true;
        cbSetStatus('重置验证码已发送，请查收邮箱', false);
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

var cbResetHandle = null;

function cbDoReset() {
    var code = cbValue('cbCode');
    var pwd = cbValue('cbPassword');
    if (!cbResetHandle) { cbSetStatus('请先获取重置验证码', true); cbRerender(); return; }
    if (!code || !pwd) { cbSetStatus('请填写验证码和新密码', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('重置中…', false); cbRerender();
    Promise.resolve(cbResetHandle.updateUser({ nonce: code, password: pwd })).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        cbResetHandle = null;
        cbResetSent = false;
        cbSetStatus('密码已重置，并已自动登录', false);
        return cbRefreshSession(function () { cbRerender(); });
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

// ============================================================
// 云备份：上传 / 恢复
// ============================================================

function cbBackupNow() {
    if (!cbSession) { cbSetStatus('请先登录', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('正在备份到云…', false); cbRerender();

    var payload = collectBackupPayload();
    var itemCount = Object.keys(payload.statuses || {}).length;

    cbGetClient().then(function (cloud) {
        // 每个账号只保留一份快照：有则更新，无则新建
        return cloud.database.from(CB_TABLE).select('id').limit(1).then(function (res) {
            if (res && res.error) throw res.error;
            var rows = res && res.data ? res.data : [];
            if (rows.length) {
                return cloud.database.from(CB_TABLE)
                    .update({ payload: payload, item_count: itemCount, updated_at: new Date().toISOString() })
                    .eq('id', rows[0].id)
                    .select();
            }
            return cloud.database.from(CB_TABLE)
                .insert({ payload: payload, item_count: itemCount })
                .select();
        });
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        var rows = res && res.data ? res.data : [];
        if (!rows.length) {
            // 写入被 RLS 过滤掉时不会报错，只会返回空数组——必须显式提示，不能当成成功
            cbSetStatus('备份未生效（可能登录已失效，请重新登录后再试）', true);
            cbRerender();
            return;
        }
        markCloudBackedUp();
        cbSetStatus('✅ 已备份到云（' + itemCount + ' 个标记）', false);
        if (typeof analyticsTrack === 'function') analyticsTrack('backup_cloud');
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

function cbRestore() {
    if (!cbSession) { cbSetStatus('请先登录', true); cbRerender(); return; }

    cbBusy = true; cbSetStatus('正在读取云端备份…', false); cbRerender();

    cbGetClient().then(function (cloud) {
        return cloud.database.from(CB_TABLE)
            .select('payload, item_count, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1);
    }).then(function (res) {
        cbBusy = false;
        if (res && res.error) { cbSetStatus(cbErrorText(res.error), true); cbRerender(); return; }
        var rows = res && res.data ? res.data : [];
        if (!rows.length) { cbSetStatus('云端还没有备份', true); cbRerender(); return; }

        var row = rows[0];
        var when = backupFormatTime(new Date(row.updated_at).getTime());
        if (!confirm('用云端的备份覆盖本机数据吗？\n\n云端备份时间：' + when
            + '\n包含 ' + (row.item_count || 0) + ' 个标记\n\n⚠️ 本机当前数据将被覆盖！')) {
            cbSetStatus('已取消恢复', false);
            cbRerender();
            return;
        }

        var out = applyImportedBackup(row.payload);
        if (!out.ok && !out.cancelled) { cbSetStatus(out.msg, true); cbRerender(); return; }
        cbSetStatus(out.ok ? '✅ 已从云端恢复' : '已取消', false);
        if (out.ok && typeof analyticsTrack === 'function') analyticsTrack('restore_cloud');
        updateBackupBadge();
        cbRerender();
    }).catch(function (e) {
        cbBusy = false;
        cbSetStatus(cbErrorText(e), true);
        cbRerender();
    });
}

// ============================================================
// 界面渲染
// ============================================================

function cbRerender() {
    var host = document.getElementById('backupCloudHost');
    if (host) renderCloudBackupSection(host);
}

function cbSwitch(onChange) {
    var label = cbEl('label', 'cloud-switch');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'cbSwitchInput';
    input.checked = cbEnabled();
    input.disabled = !cbOriginOk();
    input.onchange = function () { onChange(input.checked); };

    var track = cbEl('span', 'cloud-switch-track');
    var text = cbEl('span', null, cbEnabled() ? '已开启' : '已关闭');

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);
    return label;
}

function cbStatusBox() {
    if (!cbStatus) return null;
    var d = cbEl('div', 'cloud-state' + (cbStatusErr ? ' err' : ''), cbStatus);
    return d;
}

function cbRenderLogin(box) {
    var title = cbEl('div', 'backup-sub', '登录以使用云备份');
    box.appendChild(title);

    var email = cbInput('cbEmail', 'email', '邮箱地址');
    if (cbPendingOtp && cbPendingOtp.email) email.value = cbPendingOtp.email;
    box.appendChild(email);

    if (cbMode === 'password') {
        box.appendChild(cbInput('cbPassword', 'password', '密码'));
        var row = cbEl('div', 'cloud-actions');
        row.appendChild(cbButton('cbLoginBtn', cbBusy ? '登录中…' : '登录', 'modal-btn modal-btn-primary', cbSignInPassword));
        box.appendChild(row);

        var links = cbEl('div', 'cloud-links');
        var l1 = cbEl('span', 'cloud-link', '用验证码登录 / 注册');
        l1.onclick = function () { cbMode = 'otp'; cbOtpSent = false; cbPendingOtp = null; cbStatus = ''; cbRerender(); };
        var l2 = cbEl('span', 'cloud-link', '忘记密码');
        l2.onclick = function () { cbMode = 'reset'; cbResetSent = false; cbStatus = ''; cbRerender(); };
        links.appendChild(l1);
        links.appendChild(l2);
        box.appendChild(links);
        return;
    }

    if (cbMode === 'otp') {
        if (cbOtpSent) {
            box.appendChild(cbInput('cbCode', 'text', '邮箱收到的验证码'));
            if (cbPendingOtp && !cbPendingOtp.isExistingUser) {
                box.appendChild(cbInput('cbPassword', 'password', '设置密码（新账号需要）'));
            }
            var row2 = cbEl('div', 'cloud-actions');
            row2.appendChild(cbButton('cbVerifyBtn', cbBusy ? '处理中…' : '登录 / 注册', 'modal-btn modal-btn-primary', cbVerifyOtp));
            row2.appendChild(cbButton('cbResendBtn', '重新发送', 'modal-btn modal-btn-cancel', cbSendOtp));
            box.appendChild(row2);
        } else {
            var row3 = cbEl('div', 'cloud-actions');
            row3.appendChild(cbButton('cbSendOtpBtn', cbBusy ? '发送中…' : '获取验证码', 'modal-btn modal-btn-primary', cbSendOtp));
            box.appendChild(row3);
        }
        var back = cbEl('div', 'cloud-links');
        var b1 = cbEl('span', 'cloud-link', '返回密码登录');
        b1.onclick = function () { cbMode = 'password'; cbStatus = ''; cbRerender(); };
        back.appendChild(b1);
        box.appendChild(back);
        return;
    }

    // reset
    if (cbResetSent) {
        box.appendChild(cbInput('cbCode', 'text', '邮箱收到的验证码'));
        box.appendChild(cbInput('cbPassword', 'password', '设置新密码'));
        var row4 = cbEl('div', 'cloud-actions');
        row4.appendChild(cbButton('cbResetBtn', cbBusy ? '重置中…' : '重置并登录', 'modal-btn modal-btn-primary', cbDoReset));
        box.appendChild(row4);
    } else {
        var row5 = cbEl('div', 'cloud-actions');
        row5.appendChild(cbButton('cbSendResetBtn', cbBusy ? '发送中…' : '发送重置验证码', 'modal-btn modal-btn-primary', cbSendReset));
        box.appendChild(row5);
    }
    var back2 = cbEl('div', 'cloud-links');
    var b2 = cbEl('span', 'cloud-link', '返回密码登录');
    b2.onclick = function () { cbMode = 'password'; cbStatus = ''; cbRerender(); };
    back2.appendChild(b2);
    box.appendChild(back2);
}

function cbRenderSignedIn(box, meta) {
    var who = cbSession && cbSession.user ? cbSession.user.email : '';
    var last = meta && meta.lastCloudAt ? backupFormatTime(meta.lastCloudAt) : '从未';

    var state = cbEl('div', 'cloud-state');
    state.appendChild(cbEl('strong', null, '已登录：' + cbMaskEmail(who)));
    state.appendChild(cbEl('div', null, '上次云备份：' + last));
    box.appendChild(state);

    var row = cbEl('div', 'cloud-actions');
    row.appendChild(cbButton('cbBackupCloudBtn', cbBusy ? '备份中…' : '⬆ 备份到云', 'modal-btn modal-btn-primary', cbBackupNow));
    row.appendChild(cbButton('cbRestoreBtn', cbBusy ? '读取中…' : '⬇ 从云端恢复', 'modal-btn modal-btn-cancel', cbRestore));
    box.appendChild(row);

    var links = cbEl('div', 'cloud-links');
    var out = cbEl('span', 'cloud-link', '退出登录');
    out.onclick = cbSignOut;
    links.appendChild(out);
    box.appendChild(links);
}

/**
 * 渲染「云备份」区块到指定容器
 * 由备份中心（backup.js）在弹窗打开时调用
 */
function renderCloudBackupSection(host) {
    if (!host) return;
    host.innerHTML = '';

    var section = cbEl('div', 'cloud-section');

    var head = cbEl('div', 'cloud-head');
    head.appendChild(cbEl('span', 'cloud-title', '☁️ 云备份'));
    head.appendChild(cbSwitch(function (on) {
        cbSetEnabled(on);
        cbStatus = '';
        if (!on) { cbSession = null; cbMode = 'password'; }
        cbRerender();
        if (on) cbRefreshSession(function () { cbRerender(); });
    }));
    section.appendChild(head);

    if (!cbConfig()) {
        section.appendChild(cbEl('div', 'cloud-note', '云备份尚未配置，暂不可用。你仍可使用上面的本地备份。'));
        host.appendChild(section);
        return;
    }

    if (!cbOriginOk()) {
        section.appendChild(cbEl('div', 'cloud-note',
            '云备份需要在应用的正式发布域名下使用（服务端会校验来源域名）。'
            + '当前环境不支持，请改用上面的本地备份 —— 复制文本同样能把数据搬走。'));
        host.appendChild(section);
        return;
    }

    if (!cbEnabled()) {
        section.appendChild(cbEl('div', 'cloud-note',
            '默认关闭。开启后，数据会备份到「你自己的账号」下，换设备或清过缓存也能找回；'
            + '按账号隔离，别人看不到你的数据。'));
        host.appendChild(section);
        return;
    }

    section.appendChild(cbEl('div', 'cloud-note',
        '数据备份到你的账号下，按账号隔离。恢复会用云端快照整包覆盖本机数据（会二次确认）。'));

    var statusEl = cbStatusBox();
    if (statusEl) section.appendChild(statusEl);

    if (!cbSession) {
        // 首次开启先静默查一次会话，避免已登录用户还要再登一次
        if (!cbAuthChecked) {
            cbAuthChecked = true;
            section.appendChild(cbEl('div', 'cloud-note', '正在检查登录状态…'));
            host.appendChild(section);
            cbRefreshSession(function () { cbRerender(); });
            return;
        }
        cbRenderLogin(section);
    } else {
        cbRenderSignedIn(section, loadBackupMeta());
    }

    host.appendChild(section);
}

var cbAuthChecked = false;

// ============================================================
// 初始化
// ============================================================

function initCloudBackup() {
    // 已开启且环境允许时，提前把客户端准备好（登录态会自动恢复）
    if (cbEnabled() && cbOriginOk()) {
        cbRefreshSession(function () {
            if (document.getElementById('backupCloudHost')) cbRerender();
        });
    }
}

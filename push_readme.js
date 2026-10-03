const https = require('https');
const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'Huohuahui';
const REPO = 'CalendarSchedule';
const BRANCH = 'main';
const ROOT = 'D:/62757/TEST/排班计划表';
const PROXY = { host: '127.0.0.1', port: 7890 };

let useProxy = null;

function testDirect() {
  return new Promise(res => {
    const r = https.get({ host: 'api.github.com', path: '/', timeout: 8000, headers: { 'User-Agent': 'node' } }, resp => { resp.resume(); res(true); });
    r.on('error', () => res(false));
    r.on('timeout', () => { r.destroy(); res(false); });
  });
}
function testProxy() {
  return new Promise(res => {
    const t = http.request({ host: PROXY.host, port: PROXY.port, method: 'CONNECT', path: 'api.github.com:443', timeout: 8000 });
    t.on('connect', (r, s) => { s.destroy(); res(true); });
    t.on('error', () => res(false));
    t.on('timeout', () => { t.destroy(); res(false); });
    t.end();
  });
}

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.github.com' + p);
    const headers = {
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'node'
    };
    if (body) headers['Content-Type'] = 'application/json';
    const doReq = (socket) => {
      const opts = { method, host: url.host, path: url.pathname + url.search, headers };
      if (socket) opts.createConnection = () => tls.connect({ socket, servername: 'api.github.com' });
      const req = https.request(opts, resp => {
        let d = ''; resp.on('data', c => d += c);
        resp.on('end', () => resolve({ status: resp.statusCode, data: d }));
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    };
    if (useProxy) {
      const t = http.request({ host: PROXY.host, port: PROXY.port, method: 'CONNECT', path: 'api.github.com:443' });
      t.on('connect', (r, s) => doReq(s));
      t.on('error', reject);
      t.end();
    } else {
      doReq();
    }
  });
}

function walk(dir, base = '') {
  let f = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.workbuddy', 'node_modules'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) f = f.concat(walk(full, rel));
    else f.push(rel);
  }
  return f;
}

(async () => {
  if (!TOKEN) { console.error('NO TOKEN'); process.exit(1); }
  console.log('探测网络...');
  if (await testDirect()) { useProxy = false; console.log('直连可用'); }
  else if (await testProxy()) { useProxy = true; console.log('代理可用'); }
  else { console.error('网络不可用'); process.exit(1); }

  let r = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  if (r.status !== 200) { console.error('ref fail', r.status, r.data); process.exit(1); }
  const baseCommitSha = JSON.parse(r.data).object.sha;

  r = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`);
  const baseTreeSha = JSON.parse(r.data).tree.sha;
  console.log('base commit', baseCommitSha);

  const files = walk(ROOT);
  console.log('扫描到', files.length, '个文件');

  const tree = [];
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    const content = fs.readFileSync(full).toString('base64');
    const rb = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
    if (rb.status !== 201) { console.error('blob fail', rel, rb.status, rb.data); process.exit(1); }
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: JSON.parse(rb.data).sha });
  }
  console.log('blobs 完成');

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTreeSha, tree });
  const newTreeSha = JSON.parse(r.data).sha;

  r = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, { message: 'docs: 添加 README.md 项目说明', tree: newTreeSha, parents: [baseCommitSha] });
  const newCommitSha = JSON.parse(r.data).sha;

  r = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommitSha });
  console.log('推送结果', r.status);
  if (r.status !== 200) { console.error(r.data); process.exit(1); }

  // 验证 README 已存在
  r = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${newCommitSha}?recursive=1`);
  const names = JSON.parse(r.data).tree.map(x => x.path);
  console.log('README.md 已推送:', names.includes('README.md'));
  console.log('OK commit', newCommitSha);
})().catch(e => { console.error('ERR', e); process.exit(1); });

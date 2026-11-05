/**
 * 身份入口 / 权限边界端到端测试
 * 用法：node tests/check-identity.mjs（需先启动 node server.mjs）
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9461;
const BASE = (process.env.ZWZ_BASE || 'http://127.0.0.1:5178').replace(/\/+$/, '');
const userDir = path.join(os.tmpdir(), 'zwz-identity-' + Date.now());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 80 && !target; i++) {
  try { const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = (list || []).find(t => t.type === 'page'); } catch (e) {}
  if (!target) await sleep(200);
}
if (!target) { console.error('无法连接 Edge'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
const nav = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(100); try { if (await ev('document.readyState') === 'complete') break; } catch (e) {} } await sleep(800); };
await send('Page.enable'); await send('Runtime.enable');

console.log('\n身份入口');
await nav(BASE + '/index.html');
const gate = await ev(`(() => ({ gate: !!document.querySelector('.identity-page'), title: (document.querySelector('.identity-head h1') || {}).textContent || '', active: !!document.querySelector('.identity-role.is-active'), shell: !!document.querySelector('#shell'), page: !!document.querySelector('#page-content') }))()`);
check('首次进入显示身份入口，不自动进入页面', gate.gate && !gate.shell && !gate.page, JSON.stringify(gate));
check('未默认选中任何体验身份', !gate.active, 'active=' + gate.active);
check('提供学生/教师/评委快速体验三种入口', await ev(`document.querySelectorAll('[data-id-role]').length`) === 3);

console.log('\n学生身份');
await ev(`(() => { [...document.querySelectorAll('[data-id-role]')].find(x => x.textContent.indexOf('学生体验') >= 0).click(); })()`); await sleep(300);
check('学生体验先要求选择学生，无默认学生', await ev(`!document.querySelector('.identity-student.is-active') && document.querySelectorAll('[data-id-student]').length > 0`));
await ev(`document.querySelector('[data-id-student]').click()`); await sleep(250);
const chosen = await ev(`document.querySelector('.identity-student.is-active').getAttribute('data-id-student')`);
await ev(`document.querySelector('[data-id-enter="student"]').click()`); await sleep(800);
const student = await ev(`(() => ({ hash: location.hash, title: (document.querySelector('.topbar-title h1') || {}).textContent || '', shell: !!document.querySelector('#shell'), session: localStorage.getItem('zwz.session.v1') || '' }))()`);
check('学生选择后进入学生端，身份写入会话并标记明确选择', student.hash === '#/student/home' && student.shell && student.session.indexOf('"identityChosen":true') >= 0, JSON.stringify(student));
check('顶栏持续显示学生身份', (await ev(`(document.querySelector('.user-name') || {}).textContent || ''`)).length > 0);

const beforeUser = await ev(`(JSON.parse(localStorage.getItem('zwz.session.v1') || '{}').userId) || ''`);
await nav(BASE + '/index.html?user=s2&role=student#/student/home');
const afterUser = await ev(`(JSON.parse(localStorage.getItem('zwz.session.v1') || '{}').userId) || ''`);
check('已选身份后，URL user 参数不能静默切换学生', beforeUser === afterUser, beforeUser + ' → ' + afterUser);
await nav(BASE + '/index.html#/teacher/dashboard');
check('学生访问教师路由被权限守卫拦截', await ev(`location.hash`) === '#/student/home', await ev(`location.hash`));
await nav(BASE + '/index.html#/student/home');
check('刷新页面保持已选身份，不重新随机', !(await ev(`!!document.querySelector('.identity-page')`)) && (await ev(`(document.querySelector('.user-name') || {}).textContent || ''`)) !== '');

console.log('\n退出 / 教师 / 评委');
await ev(`document.querySelector('[data-act="user-menu"]').click()`); await sleep(400);
check('用户菜单提供切换身份/退出入口', await ev(`!!document.querySelector('[data-act="exit-identity"]')`));
await ev(`document.querySelector('[data-act="exit-identity"]').click()`); await sleep(600);
check('退出后回到身份入口并清除旧页面', await ev(`!!document.querySelector('.identity-page') && !document.querySelector('#shell')`));
await ev(`(() => { [...document.querySelectorAll('[data-id-role]')].find(x => x.textContent.indexOf('教师体验') >= 0).click(); })()`); await sleep(300);
check('教师体验要求明确班级/教师演示身份', await ev(`!!document.querySelector('[data-id-enter="teacher"]') && !!document.querySelector('#identity-class')`));
await ev(`document.querySelector('[data-id-enter="teacher"]').click()`); await sleep(800);
check('教师进入工作台，显示教师身份', await ev(`location.hash`) === '#/teacher/dashboard' && (await ev(`(document.querySelector('.user-name') || {}).textContent || ''`)).length > 0);
await ev(`document.querySelector('[data-act="user-menu"]').click()`); await sleep(400);
await ev(`document.querySelector('[data-act="exit-identity"]').click()`); await sleep(500);
await ev(`(() => { [...document.querySelectorAll('[data-id-role]')].find(x => x.textContent.indexOf('评委快速体验') >= 0).click(); })()`); await sleep(300);
const judgePanel = await ev(`(document.querySelector('.identity-panel') || {}).innerText || ''`);
check('评委快速体验明确说明模拟数据/身份/范围', /模拟/.test(judgePanel) && /教师演示/.test(judgePanel) && /DC01/.test(judgePanel), judgePanel.slice(0, 80));
await ev(`document.querySelector('[data-id-enter="judge"]').click()`); await sleep(1200);
check('评委进入赛题成果，使用赛题数据', await ev(`location.hash`) === '#/teacher/contest' && /赛题数据/.test(await ev(`(document.querySelector('.demo-badge') || {}).textContent || ''`)));

console.log('\n角色参数不自动分配');
await ev(`localStorage.clear()`);
await nav(BASE + '/index.html?role=teacher&data=official#/teacher/dashboard');
check('仅有 role 参数时仍进入身份入口（不自动选教师）', await ev(`!!document.querySelector('.identity-page') && !document.querySelector('#shell')`), await ev(`(document.querySelector('.identity-role.is-active') || {}).textContent || ''`));

console.log('\n共 ' + (pass + fail) + ' 项：通过 ' + pass + '，失败 ' + fail);
if (errors.length) console.log('浏览器异常：', errors);
ws.close(); child.kill();
if (fail) process.exit(1);



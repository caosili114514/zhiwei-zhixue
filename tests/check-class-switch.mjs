/**
 * 班级切换回归测试：用户菜单切班 + 个体档案班级选择
 * 用法：node tests/check-class-switch.mjs
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9477;
const BASE = (process.env.ZWZ_BASE || 'http://127.0.0.1:5178').replace(/\/+$/, '');
const dir = path.join(os.tmpdir(), 'zwz-class-' + Date.now());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + dir, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = (l || []).find(t => t.type === 'page'); } catch (e) {} if (!target) await sleep(200); }
if (!target) { console.log('无法连接 Edge'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
const nav = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(100); try { if (await ev('document.readyState') === 'complete') break; } catch (e) {} } await sleep(900); };
await send('Page.enable'); await send('Runtime.enable');

await nav(BASE + '/index.html?role=teacher&user=T01&data=official#/teacher/dashboard');
const start = await ev(`({hash:location.hash, menu:!!document.querySelector('[data-act="user-menu"]'), students:(document.querySelector('main')||{}).innerText.includes('班级学生')})`);
check('教师官方模式工作台加载', start.hash === '#/teacher/dashboard' && start.menu && start.students, JSON.stringify(start));
await ev(`document.querySelector('[data-act="user-menu"]').click()`); await sleep(500);
const hasClasses = await ev(`document.querySelectorAll('[data-class]').length`);
check('用户菜单显示 DC01/DC02 班级切换', hasClasses === 2, '按钮数=' + hasClasses);
await ev(`(() => { const b=[...document.querySelectorAll('[data-class]')].find(x=>x.getAttribute('data-class')==='DC02'); if(b)b.click(); })()`); await sleep(800);
const afterMenu = await ev(`({main:(document.querySelector('main')||{}).innerText.replace(/\\s+/g,' ').slice(0,120), session:localStorage.getItem('zwz.session.official.v1')||''})`);
check('菜单切到 DC02 后页面数据/会话同步', afterMenu.main.includes('DC02') && afterMenu.session.includes('DC02'), afterMenu.main.slice(0, 50));

await nav(BASE + '/index.html?role=teacher&user=T01&data=official#/teacher/profile');
const beforeProfile = await ev(`({classSel:!!document.querySelector('#ana-class'), selected:(document.querySelector('#ana-class')||{}).value||'', student:(document.querySelector('#ana-student')||{}).value||'', count:document.querySelectorAll('#ana-student option').length})`);
check('个体档案提供班级选择并显示 DC02 学生', beforeProfile.classSel && beforeProfile.selected === 'DC02' && beforeProfile.count === 19, JSON.stringify(beforeProfile));
await ev(`(() => { const s=document.querySelector('#ana-class'); if(s){s.value='DC01';s.dispatchEvent(new Event('change',{bubbles:true}));} })()`); await sleep(800);
const afterProfile = await ev(`({selected:(document.querySelector('#ana-class')||{}).value||'', student:(document.querySelector('#ana-student')||{}).value||'', count:document.querySelectorAll('#ana-student option').length, main:(document.querySelector('main')||{}).innerText.replace(/\\s+/g,' ').slice(0,120)})`);
check('档案内切到 DC01 后学生列表刷新', afterProfile.selected === 'DC01' && afterProfile.count === 21 && afterProfile.student === 'D01', JSON.stringify(afterProfile));
check('浏览器无应用侧异常', errs.length === 0, errs.length ? errs[0] : '0 异常');

console.log('\n共 ' + (pass + fail) + ' 项：通过 ' + pass + '，失败 ' + fail);
ws.close(); child.kill();
if (fail) process.exit(1);

/**
 * 布置作业入口与创建任务回归测试
 * 用法：node tests/check-assign.mjs
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9481;
const BASE = (process.env.ZWZ_BASE || 'http://127.0.0.1:5178').replace(/\/+$/, '');
const dir = path.join(os.tmpdir(), 'zwz-assign-' + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); } else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); } }
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + dir, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = (l || []).find(t => t.type === 'page'); } catch (e) {} if (!target) await sleep(200); }
if (!target) { console.log('无法连接 Edge'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errs = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
const nav = async url => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(100); try { if (await ev('document.readyState') === 'complete') break; } catch (e) {} } await sleep(900); };
await send('Page.enable'); await send('Runtime.enable');

await nav(BASE + '/index.html?role=teacher&user=T01&data=official#/teacher/dashboard');
check('教师工作台显示醒目的“布置作业”入口', await ev(`!!document.querySelector('[data-act="assign-homework"]')`) && await ev(`document.querySelector('main').innerText.includes('布置作业')`));
await ev(`document.querySelector('[data-act="assign-homework"]').click()`); await sleep(900);
const page = await ev(`({hash:location.hash, title:(document.querySelector('.page-title')||{}).textContent||'', papers:document.querySelectorAll('[data-paper]').length, hasForm:!!document.querySelector('#assign-due')})`);
check('点击进入布置作业页', page.hash === '#/teacher/assign' && page.title === '布置作业', JSON.stringify(page));
check('显示当前班级已确认试卷列表', page.papers >= 2, '试卷数=' + page.papers);
await ev(`document.querySelector('[data-paper]').click()`); await sleep(500);
const selected = await ev(`({selected:!!document.querySelector('.assign-paper.is-active'), title:(document.querySelector('#assign-title')||{}).value||'', qs:document.querySelectorAll('.assign-question').length})`);
check('选择试卷后显示任务表单与题目预览', selected.selected && selected.qs > 0, JSON.stringify(selected));
await ev(`(() => { const t=document.querySelector('#assign-title'); t.value='自动化测试作业'; t.dispatchEvent(new Event('input',{bubbles:true})); const s=document.querySelector('#assign-scope'); s.value='测试范围'; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const beforeTasks = await ev(`ZWZ.store.state.tasks.length`);
await ev(`document.querySelector('[data-act="assign-submit"]').click()`); await sleep(1200);
const after = await ev(`({hash:location.hash, toast:(document.querySelector('.toast')||{}).textContent||'', tasks:ZWZ.store.state.tasks.length, titles:ZWZ.store.state.tasks.map(t=>t.title).slice(-3)})`);
check('确认后被布置到学生端并在工作台可见', after.hash === '#/teacher/dashboard' && after.tasks === beforeTasks + 1 && after.titles.includes('自动化测试作业'), JSON.stringify(after));
check('原有批阅/分析入口仍存在', await ev(`!!document.querySelector('[data-nav="teacher/grading"]') && !!document.querySelector('[data-nav="teacher/analysis"]')`));
// 评委快速端赛题成果页入口
await nav(BASE + '/index.html?role=teacher&user=T01&data=official#/teacher/contest');
check('评委赛题成果页也有布置作业入口', await ev(`document.querySelector('main').innerText.includes('布置作业') && !!document.querySelector('[data-go="#/teacher/assign"]')`));
check('浏览器无应用侧异常', errs.length === 0, errs.length ? errs[0] : '0 异常');
console.log('\n共 ' + (pass + fail) + ' 项：通过 ' + pass + '，失败 ' + fail);
ws.close(); child.kill();
if (fail) process.exit(1);

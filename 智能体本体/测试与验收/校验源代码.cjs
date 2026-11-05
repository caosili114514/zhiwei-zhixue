/**
 * 校验“智能体本体/源代码”快照是否完整、未被误改。
 * 运行：node 校验源代码.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '源代码');
const MANIFEST = path.join(ROOT, '源文件校验清单.sha256');
function files(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...files(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
if (!fs.existsSync(MANIFEST)) { console.error('缺少', MANIFEST); process.exit(1); }
const lines = fs.readFileSync(MANIFEST, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
let ok = 0, bad = 0;
for (const line of lines) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  if (!m) { bad++; console.error('格式错误：', line); continue; }
  const file = path.join(ROOT, m[2]);
  if (!fs.existsSync(file)) { bad++; console.error('缺失：', m[2]); continue; }
  const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (h !== m[1]) { bad++; console.error('哈希不一致：', m[2]); } else ok++;
}
const actual = files(ROOT, ROOT).filter(f => f !== '源文件校验清单.sha256');
if (actual.length !== lines.length) {
  console.error('文件数不一致：清单 ' + lines.length + ' / 实际 ' + actual.length);
  bad++;
}
console.log(JSON.stringify({ files: actual.length, ok, bad }, null, 2));
if (bad) process.exit(1);
console.log('PASS：源代码快照完整，哈希与清单一致。');

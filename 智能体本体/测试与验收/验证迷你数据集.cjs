/**
 * 迷你数据集（5 名学生）结构适配验证
 * 用途：证明智能体不依赖官方固定人数/班级/记录数；不是赛方独立评测成绩。
 * 运行：node 验证迷你数据集.mjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HERE = __dirname;
const DATA = path.join(HERE, '必要测试数据', '迷你数据集_5名学生');
const SRC = path.join(HERE, '..', '源代码');

globalThis.window = globalThis;
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, removeChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; }, body: { appendChild() {}, removeChild() {}, style: {} } };
for (const f of ['js/core/html.js', 'js/core/pages.js', 'js/data/seed.js', 'js/data/official-data.js', 'js/data/official.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return { headers, rows: rows.filter(r => r.some(c => String(c).trim() !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] === undefined ? '' : r[i]).trim()]))) };
}
function table(file) { return parseCsv(fs.readFileSync(path.join(DATA, file), 'utf8')).rows; }

const tables = {
  courseRequirements: table('课程要求.csv'),
  materials: table('题目与材料.csv'),
  students: table('模拟学生.csv'),
  nodes: table('测验节点.csv'),
  answers: table('作答记录.csv')
};
const v = ZWZ.official.validate(tables);
const built = ZWZ.official.build({ tables, source: '迷你数据集（结构适配测试）', version: 'mini-5', counts: v.counts });
const studentCount = built.users.filter(u => u.role === 'student').length;
const analysis = built.answers.length;
const hardcoded = studentCount === 40 || analysis === 799;
console.log(JSON.stringify({
  validateOk: v.ok,
  counts: v.counts,
  builtStudents: studentCount,
  builtClasses: built.classes.length,
  builtAnalysisRecords: analysis,
  buildHardcodesOfficialSizes: hardcoded,
  warnings: v.warnings.length,
  errors: v.errors
}, null, 2));
if (!v.ok || hardcoded || studentCount !== 5) process.exit(1);
console.log('PASS：5 名学生迷你数据集可校验、可构建，且不依赖官方固定规模。');

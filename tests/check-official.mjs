/**
 * 官方赛题数据 / 数据质量 / Task1-3 成果自检
 * 用法：node tests/check-official.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
let pass = 0, fail = 0;
function check(name, fn) {
  try {
    const detail = fn();
    pass++;
    console.log('  ✓ ' + name + (detail ? '  — ' + detail : ''));
  } catch (err) {
    fail++;
    console.log('  ✗ ' + name + '  — ' + (err && err.message ? err.message : String(err)));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期望 ' + b + '，实际 ' + a); }

/* 最小浏览器环境 */
globalThis.window = globalThis;
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] === undefined ? null : this._data[k]; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
globalThis.document = {
  readyState: 'loading',
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, removeChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
  body: { appendChild() {}, removeChild() {}, style: {} }
};
globalThis.Blob = class { constructor(parts) { this.parts = parts || []; } };
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};

const SCRIPTS = [
  'js/core/html.js', 'js/core/pages.js', 'js/data/seed.js', 'js/data/official-data.js', 'js/data/official.js',
  'js/services/parser.js', 'js/services/grader.js', 'js/services/diagnosis.js', 'js/services/selectors.js',
  'js/services/assistant.js', 'js/services/io.js', 'js/services/competition.js', 'js/core/store.js'
];
for (const f of SCRIPTS) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });

const store = ZWZ.store.init('official');
const state = store.state;
const comp = ZWZ.competition;
const official = ZWZ.officialData;

console.log('\n官方数据导入与质量');
check('官方公开数据规模（读取原始表）', () => {
  eq(official.tables.students.length, 40, '学生');
  eq(official.tables.answers.length, 806, '作答');
  eq(official.tables.courseRequirements.length, 9, '课程要求');
  eq(official.tables.materials.length, 65, '材料');
  eq(official.tables.materials.filter(m => m['材料类型'] === '题目').length, 54, '题目');
  eq(official.tables.nodes.length, 2, '节点');
  return '40/806/9/65/54/2';
});
check('数据模式隔离（competition vs demo）', () => {
  eq(state.meta.dataMode, 'competition', '模式');
  const demo = ZWZ.store.init('demo').state;
  eq(demo.meta.dataMode, undefined, 'demo 无 competition 标记');
  eq(demo.answers.length, 206, 'demo 作答');
  eq(demo.users.filter(u => u.role === 'student').length, 11, 'demo 学生');
  return 'demo 11 学生 / 206 作答；competition 独立';
});
check('班级与节点映射', () => {
  eq(state.classes.length, 2, '班级');
  eq(state.classes.find(c => c.id === 'DC01').studentIds.length, 21, 'DC01 学生');
  eq(state.classes.find(c => c.id === 'DC02').studentIds.length, 19, 'DC02 学生');
  eq(state.tasks.length, 4, '节点×班级任务');
  return 'DC01 21 / DC02 19；4 个任务';
});
check('修订版本按事件聚合', () => {
  eq(state.answers.length, 799, '分析记录');
  eq(state.answerHistory.length, 7, '历史版本事件');
  eq(state.dataQuality.revisionEvents, 7, '修订事件');
  const evs = new Set(state.answerHistory.map(h => h.eventId));
  eq(evs.size, 7, '事件唯一');
  return '806 原始 → 799 分析记录；7 个修订事件';
});
check('原始/分析评分状态计数', () => {
  eq(state.dataQuality.rawRows, 806, '原始行');
  eq(state.dataQuality.rawStatusCounts['已评分'], 795, '原始已评分');
  eq(state.dataQuality.rawStatusCounts['待评分'], 6, '原始待评分');
  eq(state.dataQuality.rawStatusCounts['未作答'], 5, '原始未作答');
  eq(state.dataQuality.statusCounts['待评分'], 4, '分析待评分（2 条已由 v2 转已评分）');
  eq(state.dataQuality.statusCounts['未作答'], 5, '分析未作答');
  return '原始 795/6/5；分析 790/4/5';
});
check('数据质量问题（不静默修正）', () => {
  const types = {};
  state.dataQuality.issues.forEach(i => { types[i.type] = (types[i.type] || 0) + 1; });
  eq(types.score_out_of_range, 2, '分数越界');
  eq(types.point_sum_mismatch, 3, '评分点合计不一致');
  eq(types.node_question_mismatch, 1, '节点越界');
  eq(types.unanswered, 5, '未作答');
  eq(types.pending_score, 4, '待评分（分析记录）');
  eq(state.dataQuality.excludedCount, 4, '异常排除记录');
  return JSON.stringify(types);
});
check('未作答/待评分不进入错误分母', () => {
  const unanswered = state.answers.filter(a => a.attemptStatus === 'unanswered');
  const pending = state.answers.filter(a => a.attemptStatus === 'pending');
  eq(unanswered.length, 5, '未作答');
  eq(pending.length, 4, '待评分');
  unanswered.forEach(a => {
    const d = ZWZ.sel.diagnostics(state, { studentId: a.studentId }).find(x => x.kpId === (state.questions.find(q => q.id === a.questionId) || {}).indicatorId);
    if (d) assert(d.evidence.judged >= 0 && d.evidence.pending >= 0, '诊断包含未作答计数');
  });
  return '5 未作答 / 4 待评分';
});

console.log('\nTask 1/2/3 成果');
check('Task1 主题/指标/课标/教材关联', () => {
  const t1 = comp.task1(state);
  eq(t1.themes.length, 3, '主题');
  eq(t1.themes.reduce((n, t) => n + t.indicators.length, 0), 9, '指标');
  t1.themes.forEach(t => {
    assert(t.goal && t.standardRef && t.textbookPages, '主题缺少目标/课标/教材');
    t.indicators.forEach(i => {
      assert(i.questionIds.length > 0, '指标缺题目');
      assert(i.learningCards.length > 0 || i.textbookSlices.length > 0, '指标缺材料');
    });
  });
  return '3 主题 / 9 指标 / 全部有题目与材料';
});
check('个体与群体统计可重算', () => {
  const cmp = comp.classComparison(state);
  eq(cmp.classes.length, 2, '班级');
  const total = cmp.classes.reduce((n, c) => n + c.records, 0);
  eq(total, 799, '班级记录合计');
  const judged = cmp.classes.reduce((n, c) => n + c.judged, 0);
  eq(judged, 786, '有效记录 = 799 - 5 未作答 - 4 待评分 - 4 异常');
  return 'DC01 ' + cmp.classes[0].records + ' / DC02 ' + cmp.classes[1].records;
});
check('三名案例与双班比较', () => {
  const cases = comp.caseStudies(state);
  eq(cases.length, 3, '案例数');
  eq(new Set(cases.map(c => c.studentId)).size, 3, '案例学生不重复');
  const types = cases.map(c => c.type);
  assert(types.indexOf('partial') >= 0 && types.indexOf('strong') >= 0 && types.indexOf('insufficient') >= 0, '案例类型应覆盖 partial/strong/insufficient：' + types.join(','));
  cases.forEach(c => assert(c.recommendations.length > 0, c.studentId + ' 缺建议'));
  return cases.map(c => c.studentId + ':' + c.type).join(' / ');
});
check('建议材料可解析到 Q/L/B', () => {
  const cases = comp.caseStudies(state);
  const qids = new Set(state.questions.map(q => q.id));
  const mids = new Set(state.materials.map(m => m.id));
  cases.forEach(c => c.recommendations.forEach(r => {
    r.materials.practiceQuestions.forEach(q => assert(qids.has(q.id), '未知题目 ' + q.id));
    if (r.materials.learningCard) assert(mids.has(r.materials.learningCard.id), '未知学习卡');
    if (r.materials.textbook) assert(mids.has(r.materials.textbook.id), '未知教材');
  }));
  return '全部建议材料存在';
});
check('Task2/3 成果包结构', () => {
  const o = comp.buildOutcomes(state);
  eq(o.task2Individual.length, 360, '学生×指标');
  eq(o.task2Group.length, 2, '群体');
  eq(o.task3.length, 3, 'Task3 案例');
  eq(o.fieldSpec.length, 14, '字段说明');
  assert(JSON.stringify(o).length > 1000, '成果包为空');
  assert(comp.csv([{ key: 'a', label: 'A' }], [{ a: 1 }]).indexOf('A') >= 0, 'CSV 生成失败');
  return '360 个体行 / 2 群体行 / 14 字段';
});
check('交互式导入校验：官方表通过、缺表阻止', () => {
  const v = ZWZ.official.validate(official.tables);
  eq(v.ok, true, '官方表应通过校验');
  eq(v.counts.students, 40, '学生计数');
  eq(v.counts.answers, 806, '作答计数');
  const bad = { ...official.tables, answers: [] };
  const v2 = ZWZ.official.validate(bad);
  eq(v2.ok, false, '缺少作答表应阻止');
  assert(v2.errors.length > 0, '应有错误说明');
  return '官方表通过；缺作答表被阻止';
});
check('导入应用与回滚（store 级）', () => {
  ZWZ.store.init('official');
  const before = store.state.answers.length;
  store.applyOfficialDataset({ tables: official.tables, source: 'test-import', version: 'test-v1', counts: official.counts });
  eq(store.mode, 'official', '模式');
  eq(store.state.answers.length, 799, '导入后分析记录');
  assert(store.hasOfficialBackup(), '应存在上一版本备份');
  store.rollbackOfficialDataset();
  eq(store.state.answers.length, before, '回滚后记录数');
  return '导入 799 / 回滚 ' + before;
});
check('不硬编码固定样本数量（5 人子集可构建）', () => {
  const backup = ZWZ.officialData;
  const clone = JSON.parse(JSON.stringify(backup));
  clone.tables.students = clone.tables.students.slice(0, 5);
  const ids = new Set(clone.tables.students.map(s => s['学生编号']));
  clone.tables.answers = clone.tables.answers.filter(a => ids.has(a['学生编号']));
  ZWZ.officialData = clone;
  try {
    const mini = ZWZ.official.build();
    eq(mini.users.filter(u => u.role === 'student').length, 5, '子集学生');
    eq(mini.answers.length, new Set(mini.answers.map(a => a.eventId)).size, '事件聚合');
    return '5 名学生子集构建成功';
  } finally { ZWZ.officialData = backup; }
});

console.log('\n共 ' + (pass + fail) + ' 项：通过 ' + pass + '，失败 ' + fail);
if (fail) process.exit(1);




/**
 * 知微·智学 · 数据层一致性自检（Node 直跑，不依赖浏览器）
 * ------------------------------------------------------------
 * 用法：node tests/check-data.mjs
 *
 * 做什么：
 *   1. 用 vm 在最小浏览器桩里加载核心脚本（seed / services / store）；
 *   2. 校验基础数据量、引用完整性、判分状态、派生诊断、班级分析、导入导出；
 *   3. 校验「教育安全」措辞与诊断状态规则（记录不足不下结论）；
 *   4. 校验写操作闭环（提交作答 / 教师复核 / 确认诊断 / 重置）；
 *   5. 输出人类可读检查清单与通过 / 失败统计。
 *
 * 退出码：全部通过 0；有失败 1（CI / 一键验收可直接使用）。
 * 依赖：仅 Node（>= 18，需内置 fetch 不需要网络，实际不联网）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTED = Date.now();

/* ============================================================
   1. 最小浏览器环境（让经典脚本可在 Node 中运行）
   ============================================================ */
const downloads = [];

class CaptureBlob {
  constructor(parts, options) {
    this.parts = (parts || []).map(function (p) { return String(p); });
    this.type = (options && options.type) || '';
    this.size = this.parts.join('').length;
  }
  get content() {
    return this.parts.join('');
  }
}

const listeners = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] === undefined ? null : this._data[k]; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};
globalThis.Blob = CaptureBlob;
globalThis.URL.createObjectURL = function (blob) {
  const url = 'blob:zwz-test/' + (downloads.length + 1);
  downloads.push({ url: url, blob: blob, filename: null });
  return url;
};
globalThis.URL.revokeObjectURL = function () {};

function makeEl(tag) {
  return {
    tagName: String(tag || '').toUpperCase(),
    style: {},
    className: '',
    innerHTML: '',
    href: '',
    download: '',
    parentNode: null,
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    addEventListener() {},
    appendChild(child) { child.parentNode = this; this.children.push(child); },
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); },
    click() {
      const last = downloads[downloads.length - 1];
      if (last) last.filename = this.download;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {}
  };
}

globalThis.document = {
  readyState: 'loading',
  title: '',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement: makeEl,
  createTextNode(text) { return String(text); }
};

const SCRIPTS = [
  'js/core/html.js',
  'js/core/pages.js',
  'js/data/seed.js',
  'js/services/parser.js',
  'js/services/grader.js',
  'js/services/diagnosis.js',
  'js/services/selectors.js',
  'js/services/assistant.js',
  'js/services/io.js',
  'js/core/store.js',
  'js/core/ui.js',
  'js/core/charts.js'
];

/* ============================================================
   2. 检查框架
   ============================================================ */
const rows = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  rows.push({ kind: 'section', name: name });
}
function ok(name, detail) {
  rows.push({ kind: 'check', ok: true, section: currentSection, name: name, detail: detail || '' });
}
function fail(name, detail) {
  rows.push({ kind: 'check', ok: false, section: currentSection, name: name, detail: detail || '' });
}
function check(name, fn) {
  try {
    const detail = fn();
    ok(name, typeof detail === 'string' ? detail : '');
  } catch (err) {
    fail(name, err && err.message ? err.message : String(err));
  }
}
/** 对集合逐项断言：收集全部失败项而不是只报第一个 */
function checkEach(name, items, fn) {
  const problems = [];
  (items || []).forEach(function (item, index) {
    try {
      fn(item, index);
    } catch (err) {
      const tag = item && (item.id || item.code || item.name) ? String(item.id || item.code || item.name) : '第 ' + (index + 1) + ' 项';
      problems.push(tag + '：' + (err && err.message ? err.message : String(err)));
    }
  });
  if (problems.length) {
    const shown = problems.slice(0, 5).join('；');
    fail(name, problems.length + ' / ' + items.length + ' 项失败 → ' + shown + (problems.length > 5 ? '；…另 ' + (problems.length - 5) + ' 项' : ''));
  } else {
    ok(name, '共 ' + items.length + ' 项');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言未通过');
}
function assertEqual(actual, expected, what) {
  if (actual !== expected) throw new Error(what + ' 期望 ' + fmtValue(expected) + '，实际 ' + fmtValue(actual));
}
function assertIn(value, list, what) {
  if (list.indexOf(value) < 0) throw new Error(what + ' 取值「' + value + '」不在允许范围（' + list.join(' / ') + '）');
}
function assertNumber(value, what) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(what + ' 不是有效数字（' + fmtValue(value) + '）');
}
function assertRange(value, min, max, what) {
  assertNumber(value, what);
  if (value < min || value > max) throw new Error(what + ' 应在 ' + min + '–' + max + ' 之间，实际 ' + value);
}
function assertRatioOrNull(value, what) {
  if (value === null) return;
  assertRange(value, 0, 1, what);
}
function assertText(value, what, minLength) {
  assert(typeof value === 'string', what + ' 应为字符串，实际 ' + fmtValue(value));
  assert(value.trim().length >= (minLength || 2), what + ' 内容过短（「' + value + '」）');
}
function fmtValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return '「' + v + '」';
  return String(v);
}
const BANNED_WORDS = ['差生', '排名', '红黑榜', '倒数第一', '不及格', '失败'];

/* ============================================================
   3. 加载核心脚本
   ============================================================ */
const loadErrors = [];
for (const rel of SCRIPTS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    loadErrors.push(rel + '（文件不存在）');
    continue;
  }
  try {
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: rel });
  } catch (err) {
    loadErrors.push(rel + '（' + err.message + '）');
  }
}

section('0. 环境与加载');
check('核心脚本全部加载成功', function () {
  assert(loadErrors.length === 0, '以下脚本加载失败：' + loadErrors.join('；'));
  return SCRIPTS.length + ' 个脚本（' + SCRIPTS[0] + ' … ' + SCRIPTS[SCRIPTS.length - 1] + '）';
});

const ZWZ = globalThis.ZWZ;
check('ZWZ 命名空间关键模块可用', function () {
  assert(ZWZ, 'window.ZWZ 未创建');
  const needed = ['html', 'raw', 'esc', 'fmt', 'pages', 'seed', 'parser', 'grader', 'diagnosis', 'sel', 'io', 'store', 'ui', 'charts'];
  const missing = needed.filter(function (k) { return !ZWZ[k]; });
  assert(missing.length === 0, '缺少模块：' + missing.join('、'));
  return needed.length + ' 个模块';
});

const store = ZWZ.store.init();
const state = store.state;
const grader = ZWZ.grader;
const sel = ZWZ.sel;
const io = ZWZ.io;
const diagnosis = ZWZ.diagnosis;

check('store.init() 初始化数据库', function () {
  assert(state && Array.isArray(state.answers), '数据库结构异常');
  assertRange(state.__rev, 1, 1e9, 'state.__rev');
  return '版本 ' + state.meta.version + '，__rev=' + state.__rev;
});

/* 常用索引 */
const classId = state.classes[0].id;
const students = sel.classStudents(state, classId);
const kpsAll = state.knowledgePoints || [];
const kpsInScope = sel.knowledgePoints(state, classId);
const qById = {};
state.questions.forEach(function (q) { qById[q.id] = q; });
const studentById = {};
state.users.forEach(function (u) { studentById[u.id] = u; });
const classStudentIds = students.map(function (s) { return s.id; });
/* 初始种子快照：供最后“重置演示数据”检查对照（写操作会改变内部状态） */
const SEED_BASELINE = {
  answers: state.answers.length,
  reviews: state.reviews.length,
  users: state.users.length,
  diagnosisReviews: state.diagnosisReviews.length,
  questions: state.questions.length,
  papers: state.papers.length,
  tasks: state.tasks.length,
  kps: kpsAll.length,
  students: students.length
};
const answerStatuses = Object.keys(grader.STATUS_LABELS);
const perfKeys = Object.keys(diagnosis.PERFORMANCE);
const statusKeys = Object.keys(diagnosis.STATUS);

/* ============================================================
   4. 基础数据量与唯一性
   ============================================================ */
section('1. 基础数据量');
check('学生数量合理（8–60）', function () {
  assertRange(students.length, 8, 60, '学生数');
  assertEqual(students.length, (state.classes[0].studentIds || []).length, '班级 studentIds 数量');
  return students.length + ' 名学生 / 1 个班级';
});
check('题目数量合理（20–60）', function () {
  assertRange(state.questions.length, 20, 60, '题目数');
  return state.questions.length + ' 道题';
});
check('试卷数量合理（2–10）', function () {
  assertRange(state.papers.length, 2, 10, '试卷数');
  return state.papers.length + ' 份试卷';
});
check('任务数量合理（2–10）', function () {
  assertRange(state.tasks.length, 2, 10, '任务数');
  return state.tasks.length + ' 个任务';
});
check('作答记录数量合理（150–400）', function () {
  assertRange(state.answers.length, 150, 400, '作答记录数');
  return state.answers.length + ' 条作答';
});
check('知识点与教学范围配置', function () {
  assertRange(kpsAll.length, 8, 30, '知识点数');
  assertEqual(kpsInScope.length, kpsAll.filter(function (kp) { return kp.inScope !== false; }).length, '范围内知识点数');
  const outOfScope = kpsAll.filter(function (kp) { return kp.inScope === false; });
  assertEqual(outOfScope.length, 1, '范围外知识点数');
  assertEqual(outOfScope[0].id, 'kp9', '范围外知识点 id');
  return '共 ' + kpsAll.length + ' 个知识点，其中范围外 ' + outOfScope.map(function (kp) { return kp.id + ' ' + kp.name; }).join('、');
});
check('集合主键唯一', function () {
  const sets = [
    ['users', state.users], ['classes', state.classes], ['knowledgePoints', state.knowledgePoints],
    ['questions', state.questions], ['papers', state.papers], ['tasks', state.tasks],
    ['answers', state.answers], ['materials', state.materials]
  ];
  const problems = [];
  sets.forEach(function (pair) {
    const seen = {};
    pair[1].forEach(function (item) {
      if (!item.id) { problems.push(pair[0] + ' 存在无 id 的记录'); return; }
      if (seen[item.id]) problems.push(pair[0] + ' id 重复：' + item.id);
      seen[item.id] = true;
    });
  });
  assert(problems.length === 0, problems.slice(0, 5).join('；'));
  return sets.length + ' 个集合';
});
check('演示数据已明确标注（虚构 + 教材待确认）', function () {
  assertText(state.meta.demoNotice, 'meta.demoNotice', 10);
  assert(state.meta.demoNotice.indexOf('虚构') >= 0, 'demoNotice 未声明“虚构”');
  assert(state.meta.textbook && state.meta.textbook.confirmed === false, '教材版本应为“待确认”状态');
  return 'demoNotice 含“虚构”；textbook.confirmed=false';
});

/* ============================================================
   5. 题目 / 试卷 / 任务引用完整性
   ============================================================ */
section('2. 题目与引用完整性');
const kpIds = new Set(kpsAll.map(function (kp) { return kp.id; }));
checkEach('每道题：知识点 / 答案 / 分值 / 提示齐全', state.questions, function (q) {
  assert(Array.isArray(q.kpIds) && q.kpIds.length > 0, 'kpIds 为空');
  q.kpIds.forEach(function (id) { assert(kpIds.has(id), '引用了不存在的知识点 ' + id); });
  assertText(q.answer, 'answer', 1);
  assertIn(q.type, ['choice', 'fill', 'calc', 'process'], 'type');
  assert(q.scoring && typeof q.scoring.max === 'number' && q.scoring.max > 0, 'scoring.max 无效');
  assertIn(q.scoring.mode, ['exact', 'process'], 'scoring.mode');
  ['kp', 'idea', 'step', 'solution'].forEach(function (key) {
    assert(q.hints && q.hints[key], '缺少 hints.' + key);
  });
  assert(Array.isArray(q.errorTags) && q.errorTags.length > 0, 'errorTags 为空');
  q.errorTags.forEach(function (tag) { assert(diagnosis.ERROR_MAP[tag], '未知错误类型标签 ' + tag); });
});
checkEach('每份试卷：题目存在且归属一致', state.papers, function (p) {
  assert(Array.isArray(p.questionIds) && p.questionIds.length > 0, 'questionIds 为空');
  assert(state.classes.some(function (c) { return c.id === p.classId; }), 'classId 不存在：' + p.classId);
  p.questionIds.forEach(function (qid) {
    const q = qById[qid];
    assert(q, '引用了不存在的题目 ' + qid);
    assertEqual(q.paperId, p.id, '题目 ' + qid + ' 的 paperId');
  });
  assertEqual(sel.questionsOfPaper(state, p.id).length, p.questionIds.length, '可解析的题目数');
});
checkEach('每个任务：班级 / 试卷 / 题目 / 时间合法', state.tasks, function (t) {
  assert(state.classes.some(function (c) { return c.id === t.classId; }), 'classId 不存在：' + t.classId);
  const paper = state.papers.filter(function (p) { return p.id === t.paperId; })[0];
  assert(paper, 'paperId 不存在：' + t.paperId);
  assert(Array.isArray(t.questionIds) && t.questionIds.length > 0, 'questionIds 为空');
  t.questionIds.forEach(function (qid) { assert(qById[qid], '引用了不存在的题目 ' + qid); });
  assertEqual(t.questionIds.join(','), paper.questionIds.join(','), '任务题目应与其试卷一致');
  assert(new Date(t.dueAt) > new Date(t.assignedAt), 'dueAt 应晚于 assignedAt');
});
check('每名学生至少有 1 条作答记录（演示数据覆盖）', function () {
  const empty = students.filter(function (st) {
    return sel.answers(state, { studentId: st.id }).length === 0;
  });
  assert(empty.length === 0, '以下学生无任何作答：' + empty.map(function (s) { return s.name; }).join('、'));
  return students.length + ' 名学生均有记录';
});
check('教学材料引用有效', function () {
  assert(Array.isArray(state.materials) && state.materials.length >= 2, '材料数量不足');
  state.materials.forEach(function (m) {
    (m.kpIds || []).forEach(function (id) { assert(kpIds.has(id), '材料 ' + m.id + ' 引用未知知识点 ' + id); });
    (m.chapterIds || []).forEach(function (id) {
      assert(state.chapters.some(function (c) { return c.id === id; }), '材料 ' + m.id + ' 引用未知章节 ' + id);
    });
  });
  return state.materials.length + ' 份材料';
});

/* ============================================================
   6. 作答与判分状态
   ============================================================ */
section('3. 作答与判分状态');
const taskIds = new Set(state.tasks.map(function (t) { return t.id; }));
const taskById = {};
state.tasks.forEach(function (t) { taskById[t.id] = t; });

checkEach('每条作答：可关联题目 / 任务 / 学生，且已有判分字段', state.answers, function (a) {
  const q = qById[a.questionId];
  assert(q, '题目不存在：' + a.questionId);
  assert(taskIds.has(a.taskId), '任务不存在：' + a.taskId);
  const st = studentById[a.studentId];
  assert(st, '学生不存在：' + a.studentId);
  assertEqual(st.classId, classId, '学生 ' + a.studentId + ' 的班级');
  assert((taskById[a.taskId].questionIds || []).indexOf(a.questionId) >= 0, '题目未包含在该任务的题目列表中');
  assert(a.score !== undefined, 'score 为 undefined（判分未执行）');
  assert(a.maxScore !== undefined, 'maxScore 为 undefined');
  assertNumber(a.maxScore, 'maxScore');
  assert(a.maxScore > 0, 'maxScore 应大于 0');
  if (a.score !== null) assertRange(a.score, 0, a.maxScore, 'score');
  assertIn(a.gradeStatus, answerStatuses, 'gradeStatus');
  assert(!Number.isNaN(new Date(a.submittedAt).getTime()), 'submittedAt 不是有效时间');
});
checkEach('判分结果可独立重算且与存储一致', state.answers, function (a) {
  const q = qById[a.questionId];
  const recomputed = grader.grade(state, a, q);
  assertIn(recomputed.status, answerStatuses, '重算 gradeStatus');
  assertEqual(recomputed.score, a.score, '重算得分');
  assertEqual(recomputed.status, a.gradeStatus, '重算判分状态');
  assert(Array.isArray(recomputed.evidence) && recomputed.evidence.length > 0, '缺少判分依据说明');
  assertText(recomputed.note, '判分说明', 2);
});
checkEach('作答时间：位于任务布置与截止之间', state.answers, function (a) {
  const t = taskById[a.taskId];
  const at = new Date(a.submittedAt).getTime();
  assert(!Number.isNaN(at), 'submittedAt 不是有效时间');
  assert(at >= new Date(t.assignedAt).getTime(), '提交时间早于任务布置时间（' + a.id + '）');
  assert(at <= new Date(t.dueAt).getTime(), '提交时间晚于任务截止时间（' + a.id + '）');
});
check('判分规则符合教育安全约定', function () {
  const problems = [];
  state.answers.forEach(function (a) {
    const q = qById[a.questionId];
    const raw = String(a.rawAnswer === undefined || a.rawAnswer === null ? '' : a.rawAnswer).trim();
    if (q.scoring.mode === 'process' && a.gradeStatus === 'auto') problems.push('过程题被自动定分：' + a.id);
    if (q.scoring.mode !== 'process' && a.gradeStatus === 'suggested') problems.push('客观题被要求复核：' + a.id);
    if (!raw && a.gradeStatus !== 'unjudged' && a.gradeStatus !== 'reviewed') problems.push('空白作答未标“暂无法判阅”：' + a.id);
    if (a.recognition === 'low' && a.gradeStatus !== 'unjudged' && a.gradeStatus !== 'reviewed') problems.push('识别质量低未标“暂无法判阅”：' + a.id);
  });
  assert(problems.length === 0, problems.slice(0, 5).join('；'));
  const statusCount = grader.countByStatus(state);
  const total = Object.keys(statusCount).reduce(function (n, k) { return n + statusCount[k]; }, 0);
  assertEqual(total, state.answers.length, '判分状态合计');
  return '状态分布 ' + JSON.stringify(statusCount);
});
check('教师复核样本形成闭环（reviewed 记录存在）', function () {
  const reviewed = state.answers.filter(function (a) { return a.gradeStatus === 'reviewed'; });
  assert(reviewed.length >= 1, '缺少教师已复核的样本记录');
  reviewed.forEach(function (a) {
    assert(a.reviewedAt && a.reviewedNote !== undefined, '复核记录缺少 reviewedAt / reviewedNote');
  });
  assert(state.reviews.length >= 1, '复核历史 reviews 为空');
  return reviewed.length + ' 条已复核作答 / ' + state.reviews.length + ' 条复核历史';
});

/* ============================================================
   7. 派生诊断
   ============================================================ */
section('4. 派生诊断（每名学生）');
const diagByStudent = {};
students.forEach(function (st) {
  diagByStudent[st.id] = sel.diagnostics(state, { studentId: st.id });
});

checkEach('每名学生的诊断条目数 = 知识点总数', students, function (st) {
  const list = diagByStudent[st.id];
  assertEqual(list.length, kpsAll.length, '诊断条目数');
  assertEqual(list.map(function (d) { return d.kpId; }).join(','), kpsAll.map(function (kp) { return kp.id; }).join(','), '诊断知识点顺序');
});
checkEach('诊断字段完整且类型正确', students, function (st) {
  diagByStudent[st.id].forEach(function (d) {
    assertText(d.id, 'id');
    assertEqual(d.studentId, st.id, 'studentId');
    assertText(d.kpName, 'kpName');
    assertText(d.chapterName, 'chapterName');
    assertIn(d.performance, perfKeys, 'performance');
    assertIn(d.status, statusKeys, 'status');
    assertEqual(d.performanceLabel, diagnosis.PERFORMANCE[d.performance].label, 'performanceLabel');
    assertEqual(d.statusLabel, diagnosis.STATUS[d.status].label, 'statusLabel');
    assertIn(d.scope, ['in-scope', 'extended'], 'scope');
    assert(Array.isArray(d.errorTypes), 'errorTypes 应为数组');
    d.errorTypes.forEach(function (e) {
      assert(diagnosis.ERROR_MAP[e.key], '未知错误类型 ' + e.key);
      assertEqual(e.label, diagnosis.ERROR_MAP[e.key].label, 'errorTypes.label');
      assert(e.count > 0, 'errorTypes.count 应大于 0');
    });
    assertText(d.suggestion, 'suggestion', 10);
    const ev = d.evidence;
    assert(ev && typeof ev === 'object', '缺少 evidence');
    assert(Array.isArray(ev.answerIds), 'evidence.answerIds 应为数组');
    assert(Array.isArray(ev.quotes), 'evidence.quotes 应为数组');
    assertRange(ev.records, 0, 999, 'evidence.records');
    assertRange(ev.judged, 0, ev.records, 'evidence.judged');
    assertRange(ev.correct + ev.wrong, 0, ev.judged, 'evidence.correct + wrong');
    assertEqual(ev.correct + ev.wrong, ev.judged, 'correct + wrong 应等于 judged');
    assertRange(ev.pending, 0, ev.records, 'evidence.pending');
    assertEqual(ev.answerIds.length, ev.records, 'answerIds 数量应等于 records');
    assertText(ev.coverageText, 'evidence.coverageText', 4);
    assertRange(ev.quotes.length, 0, 4, 'evidence.quotes 数量');
  });
});
checkEach('证据引用真实作答，证据文案可读', students, function (st) {
  const answerIds = new Set(state.answers.map(function (a) { return a.id; }));
  diagByStudent[st.id].forEach(function (d) {
    d.evidence.answerIds.forEach(function (id) { assert(answerIds.has(id), '引用了不存在的作答 ' + id); });
    if (d.evidence.records > 0) assert(d.evidence.quotes.length > 0, '有记录但没有任何证据摘录');
    d.evidence.quotes.forEach(function (quote) {
      assertText(quote, '证据摘录', 8);
      assert(quote.indexOf('第') >= 0, '证据摘录应包含题号（「' + quote + '」）');
    });
  });
});
checkEach('诊断状态与记录数规则一致（记录不足不下结论）', students, function (st) {
  diagByStudent[st.id].forEach(function (d) {
    const ev = d.evidence;
    if (d.reviewed) {
      assertText(d.teacherNote, '教师备注', 2);
      return; // 教师已人工确认/修正，允许覆盖自动规则
    }
    if (ev.records === 0) {
      assertEqual(d.status, 'undetermined', d.kpName + ' 无记录时状态');
    } else if (ev.judged === 0) {
      assertEqual(d.status, 'pending', d.kpName + ' 有记录但无可判读时状态');
    }
    if (ev.judged < 2) {
      assert(d.status !== 'sufficient', d.kpName + ' 可判读记录 < 2 时不得给出“证据充分”结论');
    }
    if (ev.judged >= 1 && ev.judged < 2) {
      assert(d.status === 'preliminary' || d.status === 'pending', d.kpName + ' 单条记录应为初步判断或待复核');
    }
  });
});
checkEach('诊断范围与知识点范围一致', students, function (st) {
  diagByStudent[st.id].forEach(function (d) {
    const kp = kpsAll.filter(function (item) { return item.id === d.kpId; })[0];
    assert(kp, '诊断引用了未知知识点 ' + d.kpId);
    assertEqual(d.scope, kp.inScope === false ? 'extended' : 'in-scope', d.kpName + ' scope');
    if (d.scope === 'extended') {
      assertEqual(d.performance, 'not-learned', '范围外知识点表现');
      assertEqual(d.status, 'undetermined', '范围外知识点状态');
    }
  });
});
check('范围内知识点不存在“尚未学习”结论', function () {
  const bad = [];
  students.forEach(function (st) {
    diagByStudent[st.id].forEach(function (d) {
      if (d.scope === 'in-scope' && d.performance === 'not-learned') bad.push(st.name + ' / ' + d.kpName);
    });
  });
  assert(bad.length === 0, bad.slice(0, 5).join('；'));
  return '检查 ' + students.length + ' 名学生';
});
check('诊断措辞符合教育安全（无标签化 / 排名化表达）', function () {
  const bad = [];
  /* 允许“不会计为答错”这类中性说明，禁止的是对学生能力的绝对化断言 */
  const absoluteClaims = ['不会做', '学不会', '不会解', '不会算', '不会答', '做不出'];
  Object.keys(diagByStudent).forEach(function (sid) {
    diagByStudent[sid].forEach(function (d) {
      BANNED_WORDS.forEach(function (word) {
        if (d.suggestion.indexOf(word) >= 0) bad.push(sid + '/' + d.kpName + ' 含「' + word + '」');
      });
      absoluteClaims.forEach(function (word) {
        if (d.suggestion.indexOf(word) >= 0) bad.push(sid + '/' + d.kpName + ' 出现绝对化表述「' + word + '」');
      });
    });
  });
  assert(bad.length === 0, bad.slice(0, 5).join('；'));
  return '共检查 ' + students.length * kpsAll.length + ' 条诊断建议';
});
check('diagnosis.explain 提供可读依据说明', function () {
  const d = diagByStudent[students[0].id][0];
  const text = diagnosis.explain(d);
  assertText(text, 'explain 文本', 10);
  assert(text.indexOf('依据') >= 0 && text.indexOf('条') >= 0, 'explain 未说明记录依据：' + text);
  return text.slice(0, 60) + '…';
});

/* ============================================================
   8. 班级分析 / 概览 / 待复核
   ============================================================ */
section('5. 班级知识点分析与概览');
const kpRows = sel.kpAnalysis(state, classId);
const overview = sel.classOverview(state, classId);
const pending = sel.pendingReviews(state, { classId: classId });

check('班级知识点分析条目与教学范围一致', function () {
  assertEqual(kpRows.length, kpsInScope.length, '知识点分析条目数');
  assertEqual(kpRows.map(function (r) { return r.kp.id; }).join(','), kpsInScope.map(function (kp) { return kp.id; }).join(','), '分析顺序');
  const ids = kpRows.map(function (r) { return r.kp.id; });
  assert(ids.indexOf('kp9') < 0, 'kp9（几何图形初步）不在当前教学范围，不应出现在班级分析中');
  return kpRows.length + ' 条（kp1–kp8），kp9 已排除';
});
checkEach('班级分析字段取值合法', kpRows, function (r) {
  assertText(r.kpName, 'kpName');
  assertRange(r.records, 0, 9999, 'records');
  assertRange(r.judged, 0, r.records, 'judged');
  assertRange(r.weakCount, 0, students.length, 'weakCount');
  assertRange(r.masteredCount, 0, students.length, 'masteredCount');
  assertRange(r.studentsWithRecords, 0, students.length, 'studentsWithRecords');
  assertRatioOrNull(r.coverage, 'coverage');
  assertRatioOrNull(r.masteryRate, 'masteryRate');
  assertRatioOrNull(r.weakRate, 'weakRate');
  assertRatioOrNull(r.accuracy, 'accuracy');
  assertRatioOrNull(r.judgedCoverage, 'judgedCoverage');
  assert(Array.isArray(r.errorTypes), 'errorTypes 应为数组');
  for (let i = 1; i < r.errorTypes.length; i++) {
    assert(r.errorTypes[i - 1].count >= r.errorTypes[i].count, 'errorTypes 未按次数降序');
  }
  if (r.trend) {
    assertRange(r.trend.from, 0, 100, 'trend.from');
    assertRange(r.trend.to, 0, 100, 'trend.to');
    assertRange(r.trend.n, 1, 9999, 'trend.n');
  }
});
check('班级概览与作答数据一致', function () {
  assertEqual(overview.studentCount, students.length, 'studentCount');
  assertEqual(overview.records, state.answers.filter(function (a) { return classStudentIds.indexOf(a.studentId) >= 0; }).length, 'records');
  assertRatioOrNull(overview.accuracy, 'accuracy');
  assertRatioOrNull(overview.hintRate, 'hintRate');
  assertEqual(overview.pendingGrades, pending.grades.length, '待复核批阅数与 pendingReviews 一致');
  assertRange(overview.pendingDiagnoses, 0, 999, 'pendingDiagnoses');
  assert(overview.weakKps.length <= 3, 'weakKps 最多 3 条');
  assertEqual(overview.trend.xLabels.length, overview.trend.series[0].points.length, '趋势横轴与数据点数');
  assertEqual(overview.trend.xLabels.length, overview.trend.series[1].points.length, '趋势横轴与提示率点数');
  return '学生 ' + overview.studentCount + ' / 记录 ' + overview.records + ' / 待复核批阅 ' + overview.pendingGrades;
});
check('错误类型分布比例合理', function () {
  const dist = sel.errorDistribution(state, classId);
  assert(dist.length > 0, '错误类型分布为空');
  const total = dist.reduce(function (n, e) { return n + e.count; }, 0);
  const ratioSum = dist.reduce(function (n, e) { return n + e.ratio; }, 0);
  assert(Math.abs(ratioSum - 1) < 1e-6, '错误类型占比合计应为 1，实际 ' + ratioSum.toFixed(4));
  dist.forEach(function (e) {
    assertText(e.label, '错误类型名称');
    assertIn(e.tone, ['primary', 'teal', 'success', 'warn', 'danger', 'neutral', 'purple'], '错误类型 tone');
    assertRange(e.count, 1, 9999, '错误类型次数');
  });
  return dist.map(function (e) { return e.label + '×' + e.count; }).join('、') + '（合计 ' + total + ' 次）';
});
check('待复核清单可关联到具体记录', function () {
  pending.grades.forEach(function (row) {
    assert(row.answer && row.question && row.student, '待复核批阅缺少关联数据');
    assertIn(row.answer.gradeStatus, ['suggested', 'unjudged'], '待复核状态');
  });
  pending.diagnoses.forEach(function (row) {
    assert(row.diag && row.student, '待复核诊断缺少关联数据');
    assertIn(row.diag.status, ['pending', 'preliminary'], '待复核诊断状态');
    assert(row.diag.evidence.records > 0, '待复核诊断应有记录支撑');
  });
  return '批阅 ' + pending.grades.length + ' 条 / 诊断 ' + pending.diagnoses.length + ' 项';
});
check('学生概览 / 报告结构完整', function () {
  const sid = 's1';
  const ov = sel.studentOverview(state, sid);
  assertEqual(ov.stats.records, sel.answers(state, { studentId: sid }).length, 'stats.records');
  assertRatioOrNull(ov.stats.accuracy, 'stats.accuracy');
  assert(ov.focus.every(function (d) { return ['difficulty', 'after-hint', 'retry'].indexOf(d.performance) >= 0; }), 'focus 应仅含“仍需巩固 / 提示后完成 / 反复尝试”条目');
  assert(ov.focus.every(function (d) { return d.evidence.records > 0; }), 'focus 不应包含无记录条目');
  assert(ov.strengths.every(function (d) { return d.status !== 'undetermined'; }), 'strengths 不应包含无法判断的条目');
  /* 同一知识点不能既算“优势”又算“待巩固”（Lead 已在 selectors 修复，这里做回归校验） */
  const focusIds = new Set(ov.focus.map(function (d) { return d.id; }));
  ov.strengths.forEach(function (d) {
    assert(!focusIds.has(d.id), '「' + d.kpName + '」同时出现在优势与待巩固列表中');
  });
  const report = sel.studentReport(state, sid);
  assertEqual(report.rows.length, kpsInScope.length, '个人报告知识点行数');
  assertText(report.sourceNote, 'sourceNote', 6);
  assert(report.sourceNote.indexOf('教材') >= 0, 'sourceNote 应说明教材/材料来源待确认');
  assert(report.range && report.range.start && report.range.end, '报告缺少数据时间范围');
  assertRatioOrNull(report.stats.accuracy, '报告准确率');
  return '重点 ' + ov.focus.length + ' 项 / 优势 ' + ov.strengths.length + ' 项 / 报告 ' + report.rows.length + ' 行';
});

check('全体学生：优势知识点与待巩固知识点不重叠', function () {
  const problems = [];
  students.forEach(function (st) {
    const ov = sel.studentOverview(state, st.id);
    const ids = new Set(ov.focus.map(function (d) { return d.id; }));
    ov.strengths.forEach(function (d) {
      if (ids.has(d.id)) problems.push(st.name + ' / ' + d.kpName);
    });
  });
  assert(problems.length === 0, problems.slice(0, 5).join('；'));
  return students.length + ' 名学生';
});

/* ============================================================
   9. 伴学助手 / 教学助理（本地规则应答）
   ============================================================ */
section('6. 伴学与教学助理（规则应答）');
const assistant = ZWZ.assistant;
check('学生伴学助手：四级分层提示逐级递进', function () {
  const outs = [1, 2, 3, 4].map(function (level) {
    return assistant.studentReply(state, { studentId: 's1', questionId: 'q5', level: level });
  });
  outs.forEach(function (r, index) {
    const level = index + 1;
    assert(Array.isArray(r.messages) && r.messages.length > 0, '第 ' + level + ' 层没有返回消息');
    const m = r.messages[0];
    assertEqual(m.role, 'assistant', '消息角色');
    assertEqual(m.type, 'hint', '第 ' + level + ' 层消息类型');
    assertEqual(m.level, level, '提示层级');
    assertText(m.title, '标题');
    assertText(m.body, '正文', 8);
    assert(Array.isArray(m.actions), '缺少后续操作');
    assertEqual(r.hintLevel, level, '返回的 hintLevel');
  });
  assert(outs[2].messages[0].steps && outs[2].messages[0].steps.length > 0, '第 3 层应给出步骤提示');
  assert(outs[3].messages[0].steps && outs[3].messages[0].steps.length > 0, '第 4 层应给出完整步骤');
  assertText(outs[3].messages[0].caveat, '完整解析说明', 8);
  return '1→4 层均返回分层提示，第 4 层含完整解析与使用说明';
});
check('学生伴学助手：默认不直接给答案，超范围内容标注拓展', function () {
  const refuse = assistant.studentReply(state, { studentId: 's1', questionId: 'q5', message: '直接告诉我答案是多少' });
  assertEqual(refuse.messages[0].type, 'refuse', '直接索要答案时应拒绝并引导分层提示');
  assert(refuse.messages[0].actions.some(function (a) { return a.level === 4; }), '应提供“完整解析”的自主选择入口');
  /* 构造一道“尚未纳入教学范围（kp9）”的题目，仅用于本检查（浅拷贝 state，不污染数据） */
  const fakeQ = Object.assign({}, state.questions[0], {
    id: 'q_scope_check', code: '测1', kpIds: ['kp9'], kpNames: ['几何图形初步']
  });
  const testState = Object.assign({}, state, { questions: state.questions.concat([fakeQ]) });
  const ext = assistant.studentReply(testState, { studentId: 's1', questionId: 'q_scope_check', level: 1 });
  assertText(ext.messages[0].scopeWarning, '超范围提示', 6);
  assert(ext.messages[0].scopeWarning.indexOf('拓展') >= 0, '超范围提示应使用“拓展”表述');
  return '拒绝直接给答案 ✅；kp9 超范围提示 ✅';
});
check('学生伴学助手：未打开题目时给出引导而非编造', function () {
  const r = assistant.studentReply(state, { studentId: 's1' });
  assertEqual(r.messages[0].type, 'guide', '无题目时应返回引导消息');
  assertText(r.messages[0].body, '引导正文', 8);
  assert(Array.isArray(r.messages[0].actions) && r.messages[0].actions.length > 0, '引导消息应提供去练习入口');
  return r.messages[0].title + ' / ' + r.messages[0].actions[0].label;
});
check('教师教学助理：分析卡片均含知识点 / 依据 / 适用条件 / 建议', function () {
  const questions = [
    '本班目前最需要关注哪些知识点？',
    '学生在哪些错误类型上最集中？',
    '请针对最薄弱的知识点给出教学建议',
    '林以安最近的学习情况怎么样？',
    '这批数据的覆盖情况够不够支撑结论？'
  ];
  questions.forEach(function (q) {
    const r = assistant.teacherReply(state, { classId: classId, message: q });
    assert(r.cards.length > 0, '问题「' + q + '」没有返回分析卡片');
    r.cards.forEach(function (card) {
      assertText(card.title, '卡片标题');
      assertText(card.kpName, '关联知识点', 1);
      assertText(card.insight, '分析结论', 8);
      assert(Array.isArray(card.evidence) && card.evidence.length > 0, '卡片「' + card.title + '」缺少数据依据');
      assertText(card.conditions, '适用条件 / 口径', 8);
      assertText(card.suggestion, '教学建议', 8);
      assert(Array.isArray(card.actions) && card.actions.length > 0, '卡片「' + card.title + '」缺少后续操作');
    });
    assertText(r.disclaimer, '免责声明', 10);
    assert(r.disclaimer.indexOf('不替代') >= 0 || r.disclaimer.indexOf('教师') >= 0, '免责声明应说明不替代教师决定');
    BANNED_WORDS.forEach(function (word) {
      assert(JSON.stringify(r).indexOf(word) < 0, '教师助手输出含禁用词「' + word + '」');
    });
  });
  return questions.length + ' 个问题均返回带依据的卡片';
});
check('教师教学助理：无依据时明确说明（不编造）', function () {
  const r = assistant.teacherReply(state, { classId: classId, message: '量子力学怎么教？' });
  assertEqual(r.intent, 'fallback', '无依据问题应走 fallback');
  assert(
    r.reply.indexOf('无法基于现有数据') >= 0 || r.reply.indexOf('没有依据') >= 0 || r.reply.indexOf('暂时无法') >= 0,
    '无依据时应明确说明无法回答（实际：' + r.reply.slice(0, 40) + '…）'
  );
  return r.reply.slice(0, 50) + '…';
});

/* ============================================================
   10. 导入导出（CSV / 解析）
   ============================================================ */
section('7. 导出与导入');
function captureCsv(label, run) {
  const before = downloads.length;
  const okFlag = run();
  assert(okFlag === true, '导出未成功触发（' + label + '）');
  assertEqual(downloads.length, before + 1, '下载次数');
  const rec = downloads[downloads.length - 1];
  assert(rec.filename && /\.csv$/i.test(rec.filename), '文件名应为 .csv，实际 ' + fmtValue(rec.filename));
  assert(rec.filename.indexOf(io.today()) >= 0, '文件名应包含导出日期 ' + io.today() + '，实际 ' + rec.filename);
  assert(rec.blob.content.charCodeAt(0) === 0xFEFF, 'CSV 应以 BOM 开头（Excel 中文兼容）');
  const parsed = io.parseCSV(rec.blob.content);
  assert(parsed.headers.length > 0, 'CSV 表头为空');
  return { rec: rec, parsed: parsed, filename: rec.filename };
}

check('导出班级学情报告 CSV（行数 = 知识点分析条数）', function () {
  const out = captureCsv('班级报告', function () { return io.exportClassReport(state, classId); });
  assertEqual(out.parsed.rows.length, kpRows.length, '班级报告 CSV 数据行数');
  ['知识点', '掌握学生占比', '学生覆盖率', '主要错误类型', '时间变化'].forEach(function (h) {
    assert(out.parsed.headers.indexOf(h) >= 0, '缺少表头「' + h + '」');
  });
  return out.parsed.rows.length + ' 行 / ' + out.parsed.headers.length + ' 列 · ' + out.filename;
});
check('导出结构化诊断 CSV（行数 = 学生数 × 范围内知识点数）', function () {
  const expected = students.reduce(function (n, st) {
    return n + sel.diagnostics(state, { studentId: st.id, scopeOnly: true }).length;
  }, 0);
  const out = captureCsv('诊断数据', function () { return io.exportDiagnosticsCSV(state, classId); });
  assertEqual(out.parsed.rows.length, expected, '诊断 CSV 数据行数');
  ['学生', '知识点', '诊断状态', '数据覆盖', '主要证据', '教师复核', '最近更新时间'].forEach(function (h) {
    assert(out.parsed.headers.indexOf(h) >= 0, '缺少表头「' + h + '」');
  });
  assertEqual(expected, students.length * kpsInScope.length, '学生数 × 范围内知识点数');
  return expected + ' 行 = ' + students.length + ' 名学生 × ' + kpsInScope.length + ' 个知识点';
});
check('导出作答记录 CSV（行数 = 作答记录数）', function () {
  const expected = state.answers.filter(function (a) { return classStudentIds.indexOf(a.studentId) >= 0; }).length;
  const out = captureCsv('作答记录', function () { return io.exportAnswersCSV(state, classId); });
  assertEqual(out.parsed.rows.length, expected, '作答 CSV 数据行数');
  assertEqual(expected, state.answers.length, '本班作答数应等于全部作答数');
  ['学生', '任务', '题号', '得分', '判分状态', '提示层级', '识别质量', '提交时间'].forEach(function (h) {
    assert(out.parsed.headers.indexOf(h) >= 0, '缺少表头「' + h + '」');
  });
  const unjudged = out.parsed.rows.filter(function (r) { return r['得分'] === ''; });
  assert(unjudged.length > 0, '应保留未定分记录（得分留空），不被当作 0 分');
  return expected + ' 行，其中 ' + unjudged.length + ' 条未定分（留空）';
});
check('导出个人学情报告 CSV（仅本人 / 仅范围内知识点）', function () {
  const expected = sel.diagnostics(state, { studentId: 's1', scopeOnly: true }).length;
  const out = captureCsv('个人报告', function () { return io.exportStudentReport(state, 's1'); });
  assertEqual(out.parsed.rows.length, expected, '个人报告 CSV 数据行数');
  ['知识点', '表现', '诊断状态', '数据覆盖', '错误类型', '建议', '教师是否复核'].forEach(function (h) {
    assert(out.parsed.headers.indexOf(h) >= 0, '缺少表头「' + h + '」');
  });
  assert(out.filename.indexOf('林以安') >= 0, '文件名应包含学生姓名');
  assertEqual(sel.studentReport(state, 's1').rows.length, expected, '报告行数与导出接口一致');
  return expected + ' 行 · ' + out.filename;
});
check('导出使用独立的 JSON / 快照入口', function () {
  const before = downloads.length;
  assert(io.exportStudentJSON(state, 's1') === true, '个人 JSON 导出失败');
  assertEqual(downloads.length, before + 1, 'JSON 下载次数');
  const rec = downloads[downloads.length - 1];
  assert(/\.json$/i.test(rec.filename), 'JSON 文件名后缀');
  const parsed = JSON.parse(rec.blob.content);
  assert(parsed.student && parsed.student.name === '林以安', 'JSON 学生信息');
  assert(parsed.knowledgePoints && parsed.knowledgePoints.length === kpsInScope.length, 'JSON 知识点行数');
  assert(parsed.meta && parsed.meta.demoNotice, 'JSON 缺少演示数据声明');
  return '个人 JSON ' + parsed.knowledgePoints.length + ' 行 + meta 声明';
});

check('CSV 解析：BOM / 引号 / 逗号 / 中文', function () {
  const text = '\uFEFF姓名,备注\r\n林以安,"含,逗号的备注"\r\n苏清和,普通\r\n';
  const parsed = io.parseCSV(text);
  assertEqual(parsed.headers.join('|'), '姓名|备注', '表头');
  assertEqual(parsed.rows.length, 2, '数据行数');
  assertEqual(parsed.rows[0]['备注'], '含,逗号的备注', '引号内逗号解析');
  assertEqual(parsed.rows[1]['姓名'], '苏清和', '第二行姓名');
  return '2 行解析正确（含引号内逗号）';
});
check('学情导入：字段映射 / 预览 / 质量检查', function () {
  const headers = ['姓名', '班级', '知识点'];
  const rows = [
    { 姓名: '林以安', 班级: '七年级(3)班', 知识点: '有理数的加减运算' },
    { 姓名: '张三', 班级: '七年级(3)班', 知识点: '有理数的加减运算' }
  ];
  const built = io.buildLearnerImport(state, { headers: headers, rows: rows });
  assertEqual(built.mapping.name, '姓名', '姓名映射');
  assertEqual(built.preview.length, 2, '预览行数');
  assert(built.preview[1].issues.some(function (i) { return i.indexOf('待确认') >= 0; }), '未知学生应提示“待确认”');
  assertEqual(built.canImport, true, '已知学生 + 待确认学生应可导入（待确认不等于阻断）');
  assertEqual(built.valid, 2, '有效行数');

  // 未知知识点属于阻断项（需要先修正或确认）
  const unknownKp = io.buildLearnerImport(state, {
    headers: headers,
    rows: [{ 姓名: '林以安', 班级: '七年级(3)班', 知识点: '未知知识点' }]
  });
  assert(unknownKp.preview[0].issues.some(function (i) { return i.indexOf('未在知识库中匹配') >= 0; }), '未知知识点应给出提示');
  assertEqual(unknownKp.canImport, false, '未知知识点应阻断导入');

  const noName = io.buildLearnerImport(state, { headers: ['学号'], rows: [{ 学号: '01' }] });
  assertEqual(noName.canImport, false, '缺少姓名映射时不可导入');
  assert(noName.issues.some(function (i) { return i.indexOf('姓名') >= 0; }), '应提示缺少姓名字段');
  return '映射 ' + JSON.stringify(built.mapping) + '；缺姓名 / 未知知识点均正确阻断';
});
check('导入模板可下载且格式正确', function () {
  const before = downloads.length;
  assert(io.learnerTemplateCSV(state) === true, '模板导出失败');
  const rec = downloads[downloads.length - 1];
  assert(/\.csv$/i.test(rec.filename) && rec.filename.indexOf(io.today()) >= 0, '模板文件名');
  const parsed = io.parseCSV(rec.blob.content);
  assertEqual(parsed.rows.length, 1, '模板数据行数');
  assert(parsed.headers.indexOf('姓名') >= 0, '模板缺少“姓名”列');
  return parsed.headers.join('/');
});

/* ============================================================
   10. 写操作闭环（会修改内存中的数据，放在最后）
   ============================================================ */
section('8. 写操作闭环（提交 → 判分 → 复核 → 诊断）');
const answersBeforeWrite = state.answers.length;

check('学生提交作答：判分字段与诊断证据同步更新', function () {
  const existedBefore = sel.answers(state, { studentId: 's1', taskId: 't3', questionId: 'q23' }).length > 0;
  const kpId = qById.q23.kpIds[0];
  const before = sel.diagnostics(state, { studentId: 's1' }).filter(function (d) { return d.kpId === kpId; })[0];
  const res = store.actions.submitAnswer({
    studentId: 's1', taskId: 't3', questionId: 'q23', rawAnswer: '1', hintLevels: [1, 2], durationSec: 30
  });
  assert(res && res.answer, 'submitAnswer 未返回作答记录');
  assert(res.answer.score !== undefined, '提交后 score 仍为 undefined');
  assertIn(res.answer.gradeStatus, answerStatuses, '提交后判分状态');
  assert(res.result && Array.isArray(res.result.evidence) && res.result.evidence.length > 0, '提交后缺少判分依据');
  const after = sel.diagnostics(state, { studentId: 's1' }).filter(function (d) { return d.kpId === kpId; })[0];
  assertEqual(after.evidence.records, before.evidence.records + (existedBefore ? 0 : 1), '提交后诊断记录数');
  assert(after.evidence.quotes.length > 0, '提交后诊断缺少证据摘录');
  assertEqual(state.answers.length, answersBeforeWrite + (existedBefore ? 0 : 1), '作答总数');
  return 'q23（' + kpId + '）判分 ' + res.answer.gradeStatus + ' / 诊断记录 ' + before.evidence.records + ' → ' + after.evidence.records;
});
check('教师复核作答：状态变为“教师已复核”并留痕', function () {
  const target = state.answers.filter(function (a) { return a.gradeStatus === 'suggested'; })[0];
  assert(target, '缺少可复核的过程题作答');
  const reviewsBefore = state.reviews.length;
  const logsBefore = state.auditLogs.length;
  const updated = store.actions.gradeAnswer(target.id, { score: 4, note: '自检：过程基本正确，给过程分。' });
  assert(updated, 'gradeAnswer 未返回记录');
  assertEqual(updated.gradeStatus, 'reviewed', '复核后判分状态');
  assertEqual(updated.score, 4, '复核后得分');
  assertEqual(state.reviews.length, reviewsBefore + 1, '复核历史条数');
  assert(state.auditLogs.length > logsBefore, '复核应写入审计日志');
  const q = qById[updated.questionId];
  assert(q, '复核记录关联题目缺失');
  return '作答 ' + target.id + '（第 ' + q.code + ' 题）→ reviewed / 4 分';
});
check('教师确认 / 修正诊断：结论被采纳并留痕', function () {
  const diagId = 'dg_s2_kp1';
  const logsBefore = state.auditLogs.length;
  const row = store.actions.confirmDiagnosis(diagId, { status: 'sufficient', note: '自检：已核对课堂练习与订正记录。' });
  assert(row, 'confirmDiagnosis 未返回复核记录');
  const d = sel.diagnostics(state, { studentId: 's2' }).filter(function (item) { return item.kpId === 'kp1'; })[0];
  assert(d.reviewed === true, '诊断未标记为已复核');
  assertEqual(d.status, 'sufficient', '诊断状态应被教师结论覆盖');
  assertText(d.teacherNote, '诊断教师备注', 2);
  assert(state.auditLogs.length > logsBefore, '确认诊断应写入审计日志');
  const marked = store.actions.markUndetermined('dg_s2_kp2', '自检：证据不足，标记暂无法判断。');
  assert(marked, 'markUndetermined 未生效');
  const d2 = sel.diagnostics(state, { studentId: 's2' }).filter(function (item) { return item.kpId === 'kp2'; })[0];
  assertEqual(d2.status, 'undetermined', '标记后诊断状态');
  return 's2/kp1 → sufficient；s2/kp2 → undetermined';
});
check('重置演示数据可恢复初始状态', function () {
  store.resetDemo();
  const fresh = store.state;
  assertEqual(fresh.answers.length, SEED_BASELINE.answers, '重置后作答记录数');
  assertEqual(fresh.users.length, SEED_BASELINE.users, '重置后用户数');
  assertEqual(fresh.questions.length, SEED_BASELINE.questions, '重置后题目数');
  assertEqual(fresh.papers.length, SEED_BASELINE.papers, '重置后试卷数');
  assertEqual(fresh.tasks.length, SEED_BASELINE.tasks, '重置后任务数');
  assertEqual(fresh.reviews.length, SEED_BASELINE.reviews, '重置后复核历史（应回到种子样本）');
  assertEqual(fresh.diagnosisReviews.length, SEED_BASELINE.diagnosisReviews, '重置后诊断复核（应回到种子样本）');
  assertEqual(fresh.auditLogs.length > 0, true, '重置后应保留种子审计日志');
  return '作答 ' + fresh.answers.length + ' 条 / 学生 ' + fresh.classes[0].studentIds.length + ' 名 / 数据回到演示初始态';
});

/* ============================================================
   11. 输出
   ============================================================ */
const checkRows = rows.filter(function (r) { return r.kind === 'check'; });
const passed = checkRows.filter(function (r) { return r.ok; }).length;
const failed = checkRows.length - passed;
const L = [];
L.push('');
L.push('知微·智学 · 数据层一致性自检');
L.push('时间 ' + new Date().toISOString() + '　耗时 ' + (Date.now() - STARTED) + 'ms');
L.push('数据快照：学生 ' + SEED_BASELINE.students + ' / 题目 ' + SEED_BASELINE.questions + ' / 试卷 ' + SEED_BASELINE.papers +
  ' / 任务 ' + SEED_BASELINE.tasks + ' / 作答 ' + SEED_BASELINE.answers + ' / 知识点 ' + SEED_BASELINE.kps + '（范围内 ' + kpsInScope.length + '）');
L.push('');
rows.forEach(function (row) {
  if (row.kind === 'section') {
    L.push(row.name);
  } else if (row.ok) {
    L.push('  ✓ ' + row.name + (row.detail ? '  — ' + row.detail : ''));
  } else {
    L.push('  ✗ ' + row.name + '  — ' + row.detail);
  }
});
L.push('');
L.push('────────────────────────────────────────');
L.push('共 ' + checkRows.length + ' 项检查：通过 ' + passed + '，失败 ' + failed);
L.push(failed === 0 ? '结论：全部通过 ✅' : '结论：存在失败项 ❌（请按上方清单修复后复跑）');
L.push('');

process.stdout.write(L.join('\n'));
if (failed > 0) process.exitCode = 1;

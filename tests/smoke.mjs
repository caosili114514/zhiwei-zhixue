/**
 * 知微·智学 · 全路由无头浏览器冒烟测试
 * ------------------------------------------------------------
 * 用法：
 *   node tests/smoke.mjs                    # 只做 DOM 冒烟（12 个路由）
 *   node tests/smoke.mjs --screenshots      # 额外逐页截图到 tests/screenshots/
 *   node tests/smoke.mjs --route=teacher/analysis   # 只跑某个路由（调试用）
 *   node tests/smoke.mjs --base=http://127.0.0.1:5178 --budget=8000 --concurrency=4
 *
 * 依赖：Node（>= 18，需内置 fetch）+ 本机 Microsoft Edge。不安装任何依赖包。
 * 前置：本地静态服务已启动（项目根 `node server.mjs`，默认端口 5178）。
 *
 * 每个路由断言：
 *   1. 页面外壳已渲染（#page-content 存在、侧边导航数量正确）；
 *   2. 内容区非空（去除标签后文字量足够）；
 *   3. 不含占位 / 渲染失败痕迹（“页面开发中”“[object Object]”“渲染失败”“Cannot read” 等）；
 *   4. 命中该页 1–3 组关键特征文案（每组为“任一命中即可”的同义词数组）。
 *
 * 输出：终端结果表 + tests/last-run.md（每次覆盖）+ 可选 tests/screenshots/<key>.png。
 * 退出码：全部通过 0；有失败 1。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const SHOT_DIR = path.join(TESTS_DIR, 'screenshots');
const STARTED = new Date();

/* ============================================================
   1. 参数
   ============================================================ */
const argv = process.argv.slice(2);
function argValue(name) {
  const hit = argv.filter(function (a) { return a.indexOf('--' + name + '=') === 0; })[0];
  return hit ? hit.slice(name.length + 3) : null;
}
const OPTIONS = {
  base: (argValue('base') || process.env.ZWZ_BASE || 'http://127.0.0.1:5178').replace(/\/+$/, ''),
  budget: Number(argValue('budget') || process.env.ZWZ_BUDGET || 8000),
  concurrency: Math.max(1, Math.min(6, Number(argValue('concurrency') || 4))),
  screenshots: argv.indexOf('--screenshots') >= 0,
  print: argv.indexOf('--print') >= 0,
  keepTemp: argv.indexOf('--keep-temp') >= 0,
  onlyRoute: argValue('route'),
  edge: argValue('edge')
};

/* ============================================================
   2. 路由与关键特征文案
   ------------------------------------------------------------
   每组是一个“同义词数组”：组内任意一个子串出现在内容区文字中即算通过。
   页面组实现时可以按实际文案扩充/调整这里的同义词，保持 1–3 组即可。
   ============================================================ */
const ROUTES = [
  {
    key: 'student-home', route: 'student/home', role: 'student', label: '学生 · 学习主页',
    navCount: 4,
    expect: [
      ['继续练习', '继续学习', '待完成任务', '待完成', '未完成'],
      ['需要巩固', '仍需巩固', '重点巩固', '最近需要关注', '巩固']
    ]
  },
  {
    key: 'student-practice', route: 'student/practice', role: 'student', label: '学生 · 题目练习',
    navCount: 4,
    expect: [
      ['练习', '答题', '作答'],
      ['提示', '提交']
    ]
  },
  {
    key: 'student-archive', route: 'student/archive', role: 'student', label: '学生 · 我的档案',
    navCount: 4,
    expect: [
      ['档案', '学习记录', '记录'],
      ['知识点', '诊断', '证据']
    ]
  },
  {
    key: 'student-report', route: 'student/report', role: 'student', label: '学生 · 学情报告',
    navCount: 4,
    expect: [
      ['学情报告', '报告'],
      ['导出', '打印', '建议']
    ]
  },
  {
    key: 'teacher-dashboard', route: 'teacher/dashboard', role: 'teacher', label: '教师 · 工作台',
    navCount: 8,
    expect: [
      ['班级', '本班', '学生'],
      ['待复核', '待批阅', '批阅', '任务', '待确认']
    ]
  },
  {
    key: 'teacher-analysis', route: 'teacher/analysis', role: 'teacher', label: '教师 · 班级学情分析',
    navCount: 8,
    expect: [
      ['知识点', '掌握'],
      ['错误类型', '错误', '错因']
    ]
  },
  {
    key: 'teacher-profile', route: 'teacher/profile', role: 'teacher', label: '教师 · 个体学情档案',
    navCount: 8,
    expect: [
      ['个体', '学生', '档案'],
      ['诊断', '证据', '建议']
    ]
  },
  {
    key: 'teacher-import', route: 'teacher/import', role: 'teacher', label: '教师 · 试卷与题目',
    navCount: 8,
    expect: [
      ['解析', '上传', '材料', '试卷'],
      ['预览', '知识点']
    ]
  },
  {
    key: 'teacher-grading', route: 'teacher/grading', role: 'teacher', label: '教师 · 作业批阅',
    navCount: 8,
    expect: [
      ['批阅', '判分'],
      ['复核', '待复核', '暂无法判阅']
    ]
  },
  {
    key: 'teacher-review', route: 'teacher/review', role: 'teacher', label: '教师 · 复核中心',
    navCount: 8,
    expect: [
      ['待复核', '暂无法判断', '待确认'],
      ['诊断', '批阅']
    ]
  },
  {
    key: 'teacher-assistant', route: 'teacher/assistant', role: 'teacher', label: '教师 · 教学助理',
    navCount: 8,
    expect: [
      ['助手', '提问', '问答'],
      ['建议', '证据', '依据']
    ]
  },
  {
    key: 'teacher-data', route: 'teacher/data', role: 'teacher', label: '教师 · 数据与报告',
    navCount: 8,
    expect: [
      ['导出', '报告'],
      ['导入', '数据']
    ]
  }
];

/* 打印复核目标（--print）：用无头 Edge 打印为 PDF，校验页数与文件大小。
   旧版 --headless 的 --print-to-pdf 不执行 JS，会得到空白页，必须用 --headless=new；
   无头打印偶发在首屏渲染前截取（1–2KB 空白 PDF），脚本会自动重试取最大文件。 */
const PRINT_TARGETS = [
  { key: 'print-student-report', label: '打印 · 学生个人报告', role: 'student', route: 'student/report', expectedPages: 3 },
  { key: 'print-teacher-profile', label: '打印 · 教师个体档案', role: 'teacher', route: 'teacher/profile', expectedPages: 2 },
  { key: 'print-teacher-class-report', label: '打印 · 教师班级报告', role: 'teacher', route: 'teacher/data?tab=export', expectedPages: 2 }
];

const FORBIDDEN = [  { text: '页面开发中', hint: '占位页面未实现' },
  { text: '页面不存在或尚未实现', hint: '路由未注册或页面文件报错' },
  { text: '[object Object]', hint: '模板字符串误拼接对象（应使用 html`` / raw()）' },
  { text: '渲染失败', hint: 'render() 抛出异常，页面显示错误横幅' },
  { text: 'Cannot read', hint: 'JS 运行时错误（常见：访问 undefined 属性）' },
  { text: '正在加载演示数据', hint: '脚本启动失败或未完成初始化' }
];
const SOFT_WARNINGS = ['NaN', 'undefined'];

/* ============================================================
   3. 工具
   ============================================================ */
function findEdge() {
  const candidates = [
    OPTIONS.edge,
    process.env.EDGE_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch (err) { /* 继续找 */ }
  }
  return null;
}

function execFileP(edge, args, timeoutMs) {
  return new Promise(function (resolve) {
    execFile(edge, args, {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      resolve({ err: err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function extractContent(dom) {
  const m = dom.match(/<main[^>]*id="page-content"[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : null;
}
function extractTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}
function extractLastActivity(dom) {
  const m = dom.match(/<main[^>]*id="page-content"[^>]*class="([^"]*)"/i);
  return m ? m[1] : '';
}
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function wordCount(text) {
  return text.replace(/\s/g, '').length;
}
function routeUrl(route, role) {
  return OPTIONS.base + '/index.html?role=' + role + '#' + '/' + route;
}
function tempRoot() {
  return path.join(os.tmpdir(), 'zwz-smoke-' + STARTED.getTime() + '-' + process.pid);
}

/* ============================================================
   4. 单路由 DOM 检查
   ============================================================ */
async function checkRoute(item, index, edge, tmpRoot) {
  const url = routeUrl(item.route, item.role);
  const dir = path.join(tmpRoot, 'dom-' + index + '-' + item.key);
  const startedAt = Date.now();
  const result = {
    key: item.key, route: item.route, role: item.role, label: item.label, url: url,
    ok: false, title: '', contentLength: 0, failures: [], warnings: [], elapsed: 0
  };
  const run = await execFileP(edge, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--user-data-dir=' + dir,
    '--virtual-time-budget=' + OPTIONS.budget,
    '--dump-dom',
    url
  ], 90000);
  result.elapsed = Date.now() - startedAt;

  const dom = run.stdout;
  if (!dom || !/<\/html>/i.test(dom)) {
    result.failures.push('浏览器未返回完整 DOM（' +
      (run.err ? (run.err.killed ? '执行超时' : '退出码 ' + run.err.code + '：' + run.err.message) : '输出为空') + '）');
    return result;
  }
  result.title = extractTitle(dom);
  const contentHtml = extractContent(dom);
  if (contentHtml === null) {
    result.failures.push('未找到内容区 #page-content（页面外壳未渲染，可能 js/app.js 启动失败）');
    return result;
  }
  const text = stripHtml(contentHtml);
  result.contentLength = wordCount(text);

  // 1. 内容区非空
  if (result.contentLength < 60) {
    result.failures.push('内容区文字过少（' + result.contentLength + ' 字），疑似空白页');
  }

  // 2. 页面标题
  if (!result.title || result.title === '知微·智学') {
    result.failures.push('页面标题未更新（仍为默认标题「' + (result.title || '空') + '」）');
  }

  // 3. 导航数量（外壳渲染完整性）
  const navCount = (dom.match(/data-nav="/g) || []).length;
  if (navCount !== item.navCount) {
    result.failures.push('侧边导航数量异常（' + item.role + ' 期望 ' + item.navCount + ' 项，实际 ' + navCount + ' 项）');
  }

  // 4. 占位 / 异常痕迹
  FORBIDDEN.forEach(function (rule) {
    if (text.indexOf(rule.text) >= 0) {
      result.failures.push('内容区出现「' + rule.text + '」— ' + rule.hint);
    }
  });
  /* 属性中拼接对象也能被发现（如 fill="[object Object]"），文字扫描覆盖不到 */
  if (contentHtml.indexOf('[object Object]') >= 0 && text.indexOf('[object Object]') < 0) {
    result.failures.push('页面 HTML 出现「[object Object]」（标签属性中拼接了对象，常见于 Raw 模板与字符串相加）');
  }
  SOFT_WARNINGS.forEach(function (word) {
    if (text.indexOf(word) >= 0) result.warnings.push('内容区出现「' + word + '」，疑似数据未正确处理');
  });

  // 5. 关键特征文案（每组任一命中）
  item.expect.forEach(function (group, gi) {
    const hit = group.some(function (word) { return text.indexOf(word) >= 0; });
    if (!hit) {
      result.failures.push('缺少第 ' + (gi + 1) + ' 组关键文案（期望命中其一：' + group.join(' / ') + '）');
    }
  });

  // 6. 页面结构提示（不判失败，供页面组自查）
  if (!/<div class="page"/.test(contentHtml) && !/class="page\b/.test(contentHtml)) {
    result.warnings.push('未使用 .page 容器（CONTRACT §10.4 约定）');
  }

  result.ok = result.failures.length === 0;
  return result;
}

/* ============================================================
   5. 截图（旧版 --headless；先写纯 ASCII 临时目录再复制进项目）
   ============================================================ */
async function captureScreenshot(item, index, edge, tmpRoot) {
  const shotTmpDir = path.join(tmpRoot, 'shots');
  fs.mkdirSync(shotTmpDir, { recursive: true });
  const tmpPng = path.join(shotTmpDir, item.key + '.png');
  const profileDir = path.join(tmpRoot, 'shot-profile-' + index + '-' + item.key);
  const url = routeUrl(item.route, item.role);
  const run = await execFileP(edge, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=1440,1000',
    '--user-data-dir=' + profileDir,
    '--virtual-time-budget=' + OPTIONS.budget,
    '--screenshot=' + tmpPng,
    url
  ], 120000);
  const out = { key: item.key, label: item.label, route: item.route, file: path.join('tests', 'screenshots', item.key + '.png'), ok: false, size: 0, error: '' };
  try {
    if (!fs.existsSync(tmpPng)) {
      out.error = '截图文件未生成' + (run.err ? '（' + run.err.message + '）' : '');
      return out;
    }
    const buf = fs.readFileSync(tmpPng);
    out.size = buf.length;
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isPng) {
      out.error = '生成文件不是有效 PNG（' + buf.length + ' 字节）';
      return out;
    }
    if (buf.length < 5000) {
      out.error = '截图文件过小（' + buf.length + ' 字节），疑似空白页';
      return out;
    }
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.copyFileSync(tmpPng, path.join(SHOT_DIR, item.key + '.png'));
    out.ok = true;
    return out;
  } catch (err) {
    out.error = err.message;
    return out;
  }
}

/* ============================================================
   5.5 权限守卫：跨角色访问应回落到本角色首页
   ------------------------------------------------------------
   验收标准第 1 条「数据权限符合预期」。app.js 在路由渲染前做角色守卫：
   学生访问 teacher/* → 回落到 #/student/home；教师访问 student/* → 回落到 #/teacher/dashboard。
   ============================================================ */
async function checkGuard(edge, tmpRoot, index, item, expectedTitle) {
  const url = routeUrl(item.route, item.role);
  const dir = path.join(tmpRoot, 'guard-' + index);
  const startedAt = Date.now();
  const result = { key: item.key, label: item.label, ok: false, title: '', failures: [], elapsed: 0, url: url };
  const run = await execFileP(edge, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + dir, '--virtual-time-budget=' + OPTIONS.budget, '--dump-dom', url
  ], 90000);
  result.elapsed = Date.now() - startedAt;
  const dom = run.stdout;
  if (!dom || !/<\/html>/i.test(dom)) {
    result.failures.push('浏览器未返回完整 DOM');
    return result;
  }
  result.title = extractTitle(dom);
  const contentHtml = extractContent(dom);
  if (contentHtml === null) {
    result.failures.push('未找到内容区 #page-content');
    return result;
  }
  const text = stripHtml(contentHtml);
  if (wordCount(text) < 60) result.failures.push('回落页面内容过少（' + wordCount(text) + ' 字）');
  FORBIDDEN.forEach(function (rule) {
    if (text.indexOf(rule.text) >= 0) result.failures.push('回落页面出现「' + rule.text + '」');
  });
  if (expectedTitle && result.title !== expectedTitle) {
    result.failures.push('未回落到本角色首页（期望标题「' + expectedTitle + '」，实际「' + result.title + '」）');
  }
  result.ok = result.failures.length === 0;
  return result;
}

/* ============================================================
   5.6 打印复核（--print）：打印为 PDF 并校验页数 / 文件大小
   ============================================================ */
function pdfPageCount(buf) {
  return (buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;
}

async function capturePrintPdf(item, index, edge, tmpRoot) {
  const url = routeUrl(item.route, item.role);
  const out = { key: item.key, label: item.label, url: url, ok: false, size: 0, pages: 0, attempts: 0, error: '' };
  const budget = Math.max(OPTIONS.budget, 15000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    out.attempts = attempt + 1;
    const pdf = path.join(tmpRoot, 'print-' + index + '-' + item.key + '-' + attempt + '.pdf');
    const profile = path.join(tmpRoot, 'print-profile-' + index + '-' + item.key + '-' + attempt);
    const run = await execFileP(edge, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--user-data-dir=' + profile, '--virtual-time-budget=' + budget,
      '--no-pdf-header-footer', '--print-to-pdf=' + pdf, url
    ], 120000);
    if (!fs.existsSync(pdf)) {
      out.error = '未生成 PDF' + (run.err ? '（' + run.err.message + '）' : '');
      continue;
    }
    const buf = fs.readFileSync(pdf);
    if (buf.length > out.size) {
      out.size = buf.length;
      out.pages = pdfPageCount(buf);
    }
    if (out.size >= 80000) break; /* 已得到“页面已渲染”的 PDF */
    /* 无头打印偶发在首屏渲染前截取（空白 PDF），短暂等待后重试 */
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
  }
  if (!out.size) {
    out.error = out.error || '未生成有效 PDF';
    return out;
  }
  if (out.size < 80000) {
    out.error = 'PDF 过小（' + out.size + ' 字节），疑似空白页（可重跑，或确认页面是否报错）';
  } else if (out.pages !== item.expectedPages) {
    out.error = '页数异常（期望 ' + item.expectedPages + ' 页，实际 ' + out.pages + ' 页；若内容调整请同步 tests/smoke.mjs 中 PRINT_TARGETS 的期望页数）';
  }
  out.ok = !out.error;
  return out;
}

/* ============================================================
   6. 并发池
   ============================================================ */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async function () {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ============================================================
   7. 报告
   ============================================================ */
function pad(text, width) {
  const s = String(text);
  const len = s.replace(/[^\x00-\xff]/g, 'xx').length;
  return s + new Array(Math.max(0, width - len) + 1).join(' ');
}

function buildMarkdown(results, shots, guards, prints, fatal) {
  const total = results.length;
  const passed = results.filter(function (r) { return r.ok; }).length;
  const failed = total - passed;
  const guardFailed = (guards || []).filter(function (g) { return !g.ok; }).length;
  const printFailed = (prints || []).filter(function (p) { return !p.ok; }).length;
  const L = [];
  L.push('# 冒烟测试结果（自动生成）');
  L.push('');
  L.push('- 运行时间：' + STARTED.toLocaleString('zh-CN') + '（耗时 ' + (Date.now() - STARTED.getTime()) + ' ms）');
  L.push('- 目标地址：' + OPTIONS.base);
  L.push('- 浏览器：' + (OPTIONS.edgePath || '（未找到）'));
  L.push('- 模式：DOM 冒烟' + (OPTIONS.screenshots ? ' + 截图（1440×1000）' : '') + (OPTIONS.print ? ' + 打印 PDF 复核' : ''));
  L.push('- 结果：**' + passed + ' 通过 / ' + failed + ' 失败**（共 ' + total + ' 个路由' +
    ((guards || []).length ? '；权限守卫 ' + (guards.length - guardFailed) + ' / ' + guards.length + ' 通过' : '') +
    ((prints || []).length ? '；打印复核 ' + (prints.length - printFailed) + ' / ' + prints.length + ' 通过' : '') + '）');
  L.push('');
  if (fatal) {
    L.push('> 运行失败：' + fatal);
    L.push('');
    return L.join('\n');
  }
  L.push('## 结果表');
  L.push('');
  L.push('| # | 路由 | 身份 | 状态 | 页面标题 | 内容字数 | 耗时 | 失败原因 |');
  L.push('|---|---|---|---|---|---|---|---|');
  results.forEach(function (r, i) {
    L.push('| ' + (i + 1) + ' | `#/' + r.route + '` | ' + (r.role === 'teacher' ? '教师' : '学生') +
      ' | ' + (r.ok ? '✅ 通过' : '❌ 失败') + ' | ' + (r.title || '—') + ' | ' + r.contentLength +
      ' | ' + r.elapsed + 'ms | ' + (r.failures.length ? r.failures.join('；') : '—') + ' |');
  });
  L.push('');
  if ((guards || []).length) {
    L.push('## 权限守卫（跨角色访问）');
    L.push('');
    L.push('| 场景 | 状态 | 实际页面标题 | 耗时 | 失败原因 |');
    L.push('|---|---|---|---|---|');
    guards.forEach(function (g) {
      L.push('| ' + g.label + '（`' + g.url.replace(OPTIONS.base, '') + '`） | ' +
        (g.ok ? '✅ 通过' : '❌ 失败') + ' | ' + (g.title || '—') + ' | ' + g.elapsed + 'ms | ' +
        (g.failures.length ? g.failures.join('；') : '—') + ' |');
    });
    L.push('');
  }
  if (failed) {
    L.push('## 失败详情');
    L.push('');
    results.filter(function (r) { return !r.ok; }).forEach(function (r) {
      L.push('### ' + r.label + '（`#/' + r.route + '`）');
      L.push('');
      L.push('- URL：`' + r.url + '`');
      r.failures.forEach(function (f) { L.push('- 现象：' + f); });
      L.push('- 复现：`node tests/smoke.mjs --route=' + r.route + '`');
      L.push('');
    });
  }
  const warnRows = results.filter(function (r) { return r.warnings.length; });
  if (warnRows.length) {
    L.push('## 提示（不判失败）');
    L.push('');
    warnRows.forEach(function (r) {
      L.push('- `#/' + r.route + '`：' + r.warnings.join('；'));
    });
    L.push('');
  }
  if (OPTIONS.screenshots) {
    L.push('## 截图');
    L.push('');
    if (!shots.length) {
      L.push('（未生成）');
    } else {
      shots.forEach(function (s) {
        L.push('- `' + s.file + '` — ' + (s.ok ? '✅ ' + Math.round(s.size / 1024) + ' KB' : '❌ ' + s.error) + (s.ok ? '（' + s.label + '）' : ''));
      });
    }
    L.push('');
  }
  if (OPTIONS.print) {
    L.push('## 打印复核（--print）');
    L.push('');
    L.push('无头 Edge `--headless=new --print-to-pdf` 打印为 PDF，校验页数与文件大小（>80KB 视为已渲染；空首页/渲染失败会体现为页数异常或文件过小）。');
    L.push('');
    L.push('| 打印对象 | 路由 | 状态 | 页数 | 文件大小 | 尝试次数 | 失败原因 |');
    L.push('|---|---|---|---|---|---|---|');
    (prints || []).forEach(function (p) {
      L.push('| ' + p.label + ' | `' + p.url.replace(OPTIONS.base, '') + '` | ' + (p.ok ? '✅ 通过' : '❌ 失败') +
        ' | ' + (p.pages || '—') + ' | ' + (p.size ? Math.round(p.size / 1024) + ' KB' : '—') +
        ' | ' + p.attempts + ' | ' + (p.error || '—') + ' |');
    });
    L.push('');
  }
  L.push('> 本文件由 `node tests/smoke.mjs` 自动生成，每次运行覆盖；请勿手工编辑。');
  L.push('');
  return L.join('\n');
}

/* ============================================================
   8. 主流程
   ============================================================ */
async function main() {
  const edge = findEdge();
  OPTIONS.edgePath = edge || '';
  let fatal = '';

  // 前置：本地服务
  try {
    const res = await fetch(OPTIONS.base + '/index.html', { method: 'GET' });
    if (!res.ok) fatal = '本地服务返回 HTTP ' + res.status + '（' + OPTIONS.base + '/index.html）';
  } catch (err) {
    fatal = '本地服务不可访问（' + OPTIONS.base + '）：' + err.message + '。请先在项目根目录运行 node server.mjs（或双击 启动知微智学.bat）。';
  }
  if (!fatal && !edge) {
    fatal = '未找到 Microsoft Edge。可用 --edge="<msedge.exe 路径>" 或环境变量 EDGE_BIN 指定。';
  }

  let routes = ROUTES;
  if (OPTIONS.onlyRoute) {
    const normalized = OPTIONS.onlyRoute.replace(/^#?\/?/, '');
    routes = ROUTES.filter(function (r) { return r.route === normalized; });
    if (!routes.length) fatal = fatal || '未找到路由：' + OPTIONS.onlyRoute;
  }

  const tmpRoot = tempRoot();
  fs.mkdirSync(tmpRoot, { recursive: true });

  let results = [];
  let shots = [];
  let guards = [];
  let prints = [];
  try {
    if (!fatal) {
      results = await pool(routes, OPTIONS.concurrency, function (item, index) {
        return checkRoute(item, index, edge, tmpRoot);
      });
      if (!OPTIONS.onlyRoute) {
        /* 权限守卫：跨角色路由应回落到本角色首页（标题取自本次 12 路由实测结果） */
        const homeTitle = function (key) {
          const hit = results.filter(function (r) { return r.key === key; })[0];
          return hit && hit.ok ? hit.title : '';
        };
        const guardItems = [
          {
            key: 'guard-student-to-teacher', label: '权限守卫 · 学生访问教师路由',
            role: 'student', route: 'teacher/analysis',
            expected: homeTitle('student-home')
          },
          {
            key: 'guard-teacher-to-student', label: '权限守卫 · 教师访问学生路由',
            role: 'teacher', route: 'student/home',
            expected: homeTitle('teacher-dashboard')
          }
        ];
        guards = [];
        for (let gi = 0; gi < guardItems.length; gi += 1) {
          const item = guardItems[gi];
          if (!item.expected) continue; // 首页自身未通过时跳过守卫断言，避免误报
          guards.push(await checkGuard(edge, tmpRoot, gi, item, item.expected));
        }
      }
      if (OPTIONS.screenshots) {
        shots = await pool(routes, 3, function (item, index) {
          return captureScreenshot(item, index, edge, tmpRoot);
        });
      }
      if (OPTIONS.print) {
        /* 打印检查顺序执行，避免并发抢占渲染导致偶发空白 PDF */
        prints = await pool(PRINT_TARGETS, 1, function (item, index) {
          return capturePrintPdf(item, index, edge, tmpRoot);
        });
      }
    }
  } finally {
    if (!OPTIONS.keepTemp) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (err) { /* 忽略清理失败 */ }
    }
  }

  // 终端输出
  const lines = [];
  lines.push('');
  lines.push('知微·智学 · 全路由冒烟测试');
  lines.push('目标 ' + OPTIONS.base + '　Edge ' + (edge ? path.basename(edge) : '未找到') +
    '　模式 ' + (OPTIONS.screenshots ? 'DOM + 截图' : 'DOM') + (OPTIONS.print ? ' + 打印复核' : '') + '　预算 ' + OPTIONS.budget + 'ms');
  lines.push('');
  if (fatal) {
    lines.push('✗ 运行前置失败：' + fatal);
  } else {
    lines.push(pad('#', 3) + pad('路由', 24) + pad('身份', 6) + pad('状态', 8) + pad('内容', 7) + pad('耗时', 9) + '失败原因');
    lines.push('-'.repeat(110));
    results.forEach(function (r, i) {
      lines.push(pad(String(i + 1), 3) + pad('#/' + r.route, 24) + pad(r.role === 'teacher' ? '教师' : '学生', 6) +
        pad(r.ok ? '✓ 通过' : '✗ 失败', 8) + pad(r.contentLength + '字', 7) + pad(r.elapsed + 'ms', 9) +
        (r.failures.length ? r.failures.join('；') : ''));
    });
    const passed = results.filter(function (r) { return r.ok; }).length;
    lines.push('');
    lines.push('合计：' + results.length + ' 个路由，通过 ' + passed + '，失败 ' + (results.length - passed));
    if (guards.length) {
      const gPassed = guards.filter(function (g) { return g.ok; }).length;
      lines.push('权限守卫：' + gPassed + ' / ' + guards.length + ' 通过');
      guards.filter(function (g) { return !g.ok; }).forEach(function (g) {
        lines.push('  ✗ ' + g.label + ' — ' + g.failures.join('；'));
      });
    }
    if (results.some(function (r) { return r.warnings.length; })) {
      lines.push('提示：');
      results.filter(function (r) { return r.warnings.length; }).forEach(function (r) {
        lines.push('  · #/' + r.route + ' — ' + r.warnings.join('；'));
      });
    }
    if (OPTIONS.screenshots) {
      const okShots = shots.filter(function (s) { return s.ok; }).length;
      lines.push('截图：' + okShots + ' / ' + shots.length + ' 张已写入 tests/screenshots/');
      shots.filter(function (s) { return !s.ok; }).forEach(function (s) {
        lines.push('  ✗ ' + s.key + '：' + s.error);
      });
    }
    if (OPTIONS.print) {
      const okPrints = prints.filter(function (p) { return p.ok; }).length;
      lines.push('打印复核：' + okPrints + ' / ' + prints.length + ' 通过');
      prints.forEach(function (p) {
        lines.push('  ' + (p.ok ? '✓' : '✗') + ' ' + p.label + ' — ' + p.pages + ' 页 / ' + Math.round(p.size / 1024) + ' KB' +
          (p.error ? '（' + p.error + '）' : ''));
      });
    }
  }
  lines.push('报告：tests/last-run.md');
  lines.push('');
  process.stdout.write(lines.join('\n'));

  // 写 last-run.md
  try {
    fs.mkdirSync(TESTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TESTS_DIR, 'last-run.md'), buildMarkdown(results, shots, guards, prints, fatal), 'utf8');
  } catch (err) {
    console.error('写入 tests/last-run.md 失败：' + err.message);
  }

  const shotFailed = shots.some(function (s) { return !s.ok; });
  const guardFailed = guards.some(function (g) { return !g.ok; });
  const printFailed = prints.some(function (p) { return !p.ok; });
  if (fatal || results.some(function (r) { return !r.ok; }) || shotFailed || guardFailed || printFailed) {
    process.exitCode = 1;
  }
}

main().catch(function (err) {
  console.error('冒烟测试异常退出：', err);
  process.exitCode = 1;
});

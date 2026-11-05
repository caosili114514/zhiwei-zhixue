# 「知微·智学」开发协作契约（CONTRACT）

> 本文件是团队内部开发契约，不是交付文档。所有成员必须按此接口编码，禁止擅自改动他人文件或公共接口。
> 需求来源：`知微智学_Agent开发总Prompt.docx`（产品/开发总要求）、`UI设计.docx`（视觉规范）。

## 0. 技术路线（已定，不要更改）

- **零构建、零依赖静态 SPA**：原生 HTML + CSS + JavaScript（**经典 script**，非 ES module，保证 `file://` 双击即可运行）。
- 路由：`location.hash`，形如 `#/student/home`、`#/teacher/analysis?student=s1`。
- 所有代码挂到全局命名空间 `window.ZWZ`，脚本按 `index.html` 中的固定顺序加载。
- 图表：手写 SVG（`js/core/charts.js`），不引入第三方库。
- 数据：`localStorage` 持久化 + 内存兜底；所有数据为**明确标注的模拟数据**。
- 不使用终端、不安装依赖、不联网。运行方式：双击 `index.html`，或双击 `启动知微智学.bat`（本地静态服务，更稳妥）。

## 1. 文件归属（写入范围，禁止越界）

| 归属 | 文件 |
|---|---|
| Lead（只读给其他人） | `index.html`、`css/tokens.css`、`css/base.css`、`css/components.css`、`css/charts.css`、`css/print.css`、`js/core/*`、`js/services/*`、`js/data/seed.js`、`js/app.js`、`server.mjs`、`启动知微智学.bat`、`CONTRACT.md`、`README.md` |
| 学生端组 | `js/pages/student/*.js`、`css/student.css` |
| 教师核心流程组 | `js/pages/teacher/dashboard.js`、`import.js`、`grading.js`、`review.js`、`css/teacher.css` |
| 教师分析组 | `js/pages/teacher/analysis.js`、`profile.js`、`assistant.js`、`data.js`、`css/analysis.css` |
| QA 组 | `tests/**`、`交付说明.md`、`README.md` 的 QA 校验章节 |

> 公共文件（`index.html`、`js/app.js`、`css/components.css`）如需改动，**只向 Lead 发消息说明需求**，由 Lead 修改。

## 2. 脚本加载顺序（index.html 已固定）

```
js/core/html.js
js/data/seed.js
js/services/parser.js, grader.js, diagnosis.js, selectors.js, assistant.js, io.js
js/core/store.js
js/core/ui.js
js/core/charts.js
js/pages/student/home.js, practice.js, archive.js, report.js
js/pages/teacher/dashboard.js, import.js, grading.js, review.js, analysis.js, profile.js, assistant.js, data.js
js/app.js   ← 最后，负责注册路由并启动
```

## 3. 页面模块规范

每个页面文件只做一件事：注册到 `ZWZ.pages`。

```js
(function () {
  ZWZ.pages.register('student/home', {
    title: '学习主页',                 // 顶栏标题
    subtitle: '林以安 · 七年级(3)班',  // 顶栏副标题（可省略）
    render(ctx) {                     // 必须返回 html`` 字符串
      return html`<div class="page">...</div>`;
    },
    mount(root, ctx) {                // 可选：绑定事件（render 之后立即调用）
      root.querySelector('#btn').addEventListener('click', () => { ... });
    }
  });
})();
```

`ctx` = `{ state, session, params, query, navigate(hash), refresh(), page }`
- `ctx.state`：当前数据库快照（只读，不要直接改）。
- `ctx.session`：`{ userId, role, name, classId, classIds }`。
- `ctx.navigate('#/teacher/analysis')`：跳转；`ctx.refresh()`：当前页重渲染（改完数据后调用）。
- 数据修改**只能**通过 `ZWZ.store.actions.*`。

事件绑定建议：元素上加 `data-*`，在 `mount` 里用 `ZWZ.ui.bind(root, sel, evt, fn)` 或 `root.querySelectorAll` 循环绑定。禁止内联 `onclick`。

## 4. 核心库 API

### 4.1 `html` 模板（js/core/html.js）

```js
const { html, raw, esc } = ZWZ;            // 也挂为 window.html 方便书写
html`<div class="card">${value}</div>`       // 插值默认转义
html`<div>${raw('<b>可信 HTML</b>')}</div>`  // raw() 表示可信
html`${list.map(x => html`<li>${x}</li>`)}`  // 数组自动拼接
```
公共工具：`ZWZ.fmt.date(iso)`、`fmt.datetime`、`fmt.time`、`fmt.pct(0.42)`、`fmt.num(1234)`、`fmt.duration(sec)`、`fmt.rel(iso)`、`fmt.short(iso)`、`fmt.trunc(str,n)`。

### 4.2 UI 组件（js/core/ui.js）

```js
ui.icon('chart', 18)                  // 内联 SVG 图标
ui.badge('待复核', 'warn')            // tone: neutral|primary|teal|warn|danger
ui.statusBadge('pending')             // confirmed|pending|undetermined|processing|error|insufficient
ui.card({ title, desc, actions, body, className, pad })  // 返回 html
ui.kpi({ label, value, unit, sub, tone, icon, spark })   // 返回 html
ui.button({ label, icon, tone, size, attrs, className }) // 返回 html，attrs 为字符串如 'data-id="q1"'
ui.table({ columns: [{ key, label, align, width, render(row) }], rows, empty, className, rowAttrs })
ui.tabs({ items: [{ key, label, badge }], active, name })   // 需配合 ui.bindTabs(root, name, cb)
ui.stepper({ items: [{ label, state: 'done'|'active'|'todo' }] })
ui.progress(value, tone)              // value 0-100
ui.empty({ icon, title, desc, action })
ui.loading(text) / ui.skeleton(rows)
ui.banner({ tone: 'info'|'warn'|'danger'|'success', title, body, icon })
ui.avatar(name, { size, colorSeed })
ui.chip(text, { active, tag, attrs })
ui.evidence({ title, items, status, coverage })   // 证据卡片
ui.aiNote(text)                        // 轻量 AI 标识行
ui.mountModal / 以下为命令式 API（返回 controller）：
ui.modal({ title, body, footer, size: 'sm'|'md'|'lg', onMount, className }) -> { close() }
ui.drawer({ title, body, footer, width, onMount }) -> { close() }
ui.confirm({ title, body, okText, danger }) -> Promise<boolean>
ui.toast(message, tone)               // tone: info|success|warn|error
ui.bind(root, selector, event, handler)
ui.bindTabs(root, name, handler)
ui.copy(text)                         // 复制并 toast
```

### 4.3 图表（js/core/charts.js）

所有函数返回 html 字符串，容器自带标题/单位/图例说明，`viewBox` 自适应宽度。

```js
charts.hbar({ items: [{ label, value, unit, max, tone, note }], max, unit, title, desc, height })
charts.stacked({ items: [{ label, segments: [{ label, value, color }] }], keys, title, desc, unit })
charts.line({ series: [{ name, color, points: [num] }], xLabels, yMax, unit, title, desc })
charts.heatmap({ rows: [{ label, cells: [{ value, label, tone }] }], cols: [str], title, desc, legend })
charts.donut({ segments: [{ label, value, color }], title, desc, centerLabel, centerValue })
charts.sparkline(points, { color })
charts.legend(items)                   // items: [{ label, color }]
charts.note(text)                      // 图表下方口径/样本量说明
```
`tone` 只使用：`primary | teal | success | warn | danger | neutral`。

### 4.4 Store 与数据修改（js/core/store.js）

```js
ZWZ.store.state            // 数据库（只读快照）
ZWZ.store.session          // 会话
ZWZ.store.init() / reset() / save()
ZWZ.store.subscribe(fn)
ZWZ.store.actions.setRole(role)                    // 'student' | 'teacher'
ZWZ.store.actions.loginAs(userId)                  // 切换演示身份
ZWZ.store.actions.importPaper(fileMeta)            // -> { paper, questions, warnings }
ZWZ.store.actions.confirmPaper(paperId, patch)     // 确认题目/知识点/答案
ZWZ.store.actions.updateQuestion(id, patch)
ZWZ.store.actions.createTask({ title, classId, paperId, dueAt })
ZWZ.store.actions.submitAnswer({ studentId, taskId, questionId, rawAnswer, hintLevels, durationSec })
                                                    // -> { answer, diagnostics }
ZWZ.store.actions.saveDraft / clearDraft(studentId, questionId)
ZWZ.store.actions.gradeAnswer(answerId, { score, status, note })       // 教师复核判分
ZWZ.store.actions.confirmDiagnosis(diagId, patch)                      // 教师确认/修正诊断
ZWZ.store.actions.markUndetermined(diagId, note)
ZWZ.store.actions.addMaterial(material) / updateMaterial(id, patch)
ZWZ.store.actions.importLearners({ fileName, rows, mapping })          // CSV 导入
ZWZ.store.actions.exportData(kind)                 // 由 io 服务实现，页面直接调 io
ZWZ.store.actions.resetDemo()
ZWZ.store.audit(action, detail, target)            // 记录审计（自动落库）
```
每次 action 内部调用 `ZWZ.store.save()` 并派发变更；页面在 action 后自行 `ctx.refresh()`。

### 4.5 选择器（js/services/selectors.js，均为纯函数）

```js
sel.session(state)                                  // { userId, role }
sel.students(state, classId) / sel.student(state, id)
sel.classOf(state, id) / sel.classes(state) / sel.teacher(state, id)
sel.kp(state, kpId) / sel.knowledgePoints(state, { classId })
sel.task(state, taskId) / sel.tasks(state, classId) / sel.paper(state, id)
sel.question(state, qId) / sel.questionsOfPaper(state, paperId)
sel.answers(state, { studentId, taskId, questionId })
sel.diagnostics(state, { studentId, classId, kpId })   // 派生诊断（由 diagnosis 引擎计算，带证据）
sel.studentOverview(state, studentId)   // { tasks, recent, streak, needFocus, hintStats, trend }
sel.classOverview(state, classId)       // { studentCount, coverage, weakKps, pendingReview, ... }
sel.kpAnalysis(state, classId, { from, to })          // [{ kp, mastery, weakRatio, errorTypes, coverage, records, trend }]
sel.errorDistribution(state, classId, { kpId })       // [{ type, count, ratio }]
sel.trendSeries(state, classId)                       // { xLabels, series }
sel.pendingReviews(state, { classId, type })          // 待复核批阅/诊断/无法判断
sel.studentReport(state, studentId)                   // 个人报告数据结构
sel.classReport(state, classId)                       // 班级报告数据结构
sel.assistantContext(state, { role, studentId, kpId })
```
`diagnostics` 的每一项结构（**页面必须按此展示**）：
```js
{
  id, studentId, kpId, kpName, chapterName,
  performance: 'independent'|'after-hint'|'retry'|'secure'|'difficulty'|'not-learned'|'insufficient',
  errorTypes: ['calculation', ...],          // 见 4.7
  status: 'sufficient'|'preliminary'|'pending'|'undetermined',
  evidence: { answerIds, records: 3, judged: 2, quotes: ['10月20日 第3题 ……'], hintUsed: 1 },
  suggestion: '……',                           // 面向学生/教师的中性建议
  updatedAt, reviewed, teacherNote, scope: 'in-scope'|'extended'
}
```
### 4.6 诊断引擎（js/services/diagnosis.js）

```js
diagnosis.computeDiagnostics(state, { studentId, classId })   // 派生诊断数组
diagnosis.performanceLabels / statusLabels / errorTypeLabels   // 中文映射
diagnosis.errorTypes                                          // 可扩展标签配置 [{ key, label, desc, tone }]
diagnosis.explain(diag)                                       // 生成依据说明文案
```
**教育安全规则（必须遵守）**：单条记录不得断言“不会”；记录数 < 2 → `preliminary`；无有效记录 → `undetermined`；识别异常 → `pending` 并提示人工复核；超出教学范围 → `scope:'extended'` 且不得作为正式诊断唯一依据；仅 `sufficient` 才展示明确结论。措辞使用“目前记录显示 / 还需更多记录确认”，禁止“差生 / 排名”。

### 4.7 批阅（js/services/grader.js）

```js
grader.grade(state, answer)   // -> { score, maxScore, status: 'auto'|'suggested'|'unjudged'|'reviewed', evidence, note }
grader.statusLabels           // { auto: '自动判分', suggested: '建议复核', unjudged: '暂无法判阅', reviewed: '教师已复核' }
```
客观题（选择/填空，答案明确）自动判分；计算/证明/应用题只能“辅助批阅 + 建议复核”；空白/涂改/识别质量低 → “暂无法判阅”，必须给人工复核入口。

### 4.8 伴学助手 / 教学助理（js/services/assistant.js）

```js
assistant.studentReply(state, { studentId, questionId, message, level, history })
// -> { messages: [{ role: 'assistant', type: 'hint'|'explain'|'scope'|'refuse', title, body, steps?, evidence?, actions? }], hintLevel }
// level: 1 知识点提醒 | 2 思路提示 | 3 步骤提示 | 4 完整解析（需学生确认，记为提示使用）
assistant.teacherReply(state, { classId, message })
// -> { intent, cards: [{ title, kpName, insight, evidence: [...], suggestion, conditions, actions: [{label, hash}] }],
//      followUps: [str], disclaimer }
// 必须：说明知识点、班级证据（记录数/覆盖）、建议适用条件；不替教师作决定；无依据时输出“暂无法判断”并说明缺什么数据。
assistant.quickAsks            // 学生端快捷问法
assistant.teacherQuickAsks    // 教师端快捷问法
```

### 4.9 导入导出（js/services/io.js）

```js
io.parseCSV(text)             // -> { headers, rows }，支持引号与 BOM
io.exportCSV(filename, headers, rows)   // 触发下载 + toast
io.exportJSON(filename, obj)
io.exportClassReport(state, classId)    // 打印 / 下载 JSON
io.exportStudentReport(state, studentId)
io.buildLearnerImport(state, { headers, rows, mapping })  // -> { preview, issues, canImport }
io.materials(state)  // 知识范围/材料来源
```
导出必须包含：诊断结论、证据、数据覆盖、诊断状态、知识点映射、时间范围；文件名带日期。

## 5. 数据模型（js/data/seed.js，运行时为 `ZWZ.store.state`）

```js
{
  meta: { appName, version, term, generatedAt, demoNotice, textbook: { name, edition, confirmed: false } },
  users: [{ id, role, name, classId?, avatarSeed, note }],
  classes: [{ id, name, grade, teacherId, studentIds: [], term }],
  chapters: [{ id, name, order, textbook }],
  knowledgePoints: [{ id, code, name, chapterId, chapterName, difficulty, desc, inScope }],
  materials: [{ id, name, type, source, version, chapterIds, kpIds, usage: [], importedAt, status }],
  questions: [{ id, code, type, stem, options?, answer, scoring: { max, rule }, kpIds: [], chapterId, difficulty, hints: { kp, idea, step, solution }, errorTags: [], source: { paperId, materialId }, status }],
  papers: [{ id, title, classId, questionIds: [], status, createdAt, source: { fileName, type, size }, parseMode: 'mock' }],
  tasks: [{ id, title, classId, paperId, questionIds: [], assignedAt, dueAt, status }],
  answers: [{ id, studentId, taskId, questionId, submittedAt, rawAnswer, score, maxScore, gradeStatus, gradeNote, recognition, attempts, hintLevels: [], durationSec }],
  reviews: [{ id, targetType, targetId, by, at, action, before, after, note }],
  drafts: {}, auditLogs: [], imports: [], assistantThreads: {}
}
```

## 6. 视觉与交互规范（来自 UI设计.docx，必须遵守）

**色彩**（已封装为 CSS 变量，禁止硬编码色值）：`--bg #F6F8FC`、`--surface #FFF`、`--primary #365CF5`、`--navy #172B4D`、`--teal #20B8A5`、`--success #16A085`、`--warn #F0A43A`、`--danger #E56B6F`、`--text #1F2937`、`--text-2 #6B7280`、`--border #E8EDF5`。
**布局**：左侧可折叠导航 + 顶部轻量工具栏 + 内容区（8px 间距体系，卡片圆角 12–16px，细边框 + 轻阴影）。
**状态语义**：已确认=青绿、待复核=琥珀、暂无法判断=灰、处理中=蓝、判阅异常=红（仅必要时）。每个页面必须有空状态、加载状态、错误状态，关键操作有确认与反馈，动画 150–250ms。
**教育安全**：不得使用“失败/差生/排名”等表达；诊断不确定用中性提示；模拟数据必须可见标注（顶栏 `演示数据` 徽标 + 页脚说明）。

## 7. 组件类名清单（`components.css` 已实现，页面直接复用）

布局：`.page`、`.page-head`、`.page-title`、`.page-desc`、`.toolbar`、`.section`、`.section-head`、`.grid`、`.grid-2`、`.grid-3`、`.grid-4`、`.row`、`.row-between`、`.stack`、`.stack-sm`、`.split`、`.split-main`、`.split-side`、`.divider`、`.spacer`
卡片：`.card`、`.card-head`、`.card-title`、`.card-desc`、`.card-body`、`.card-foot`、`.card-link`
按钮：`.btn`、`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.btn-danger`、`.btn-sm`、`.btn-icon`
表单：`.field`、`.label`、`.input`、`.select`、`.textarea`、`.help`、`.form-grid`
数据：`.table`、`.table-wrap`、`.badge`、`.badge-primary/teal/warn/danger/neutral`、`.tag`、`.kpi`、`.kv`、`.progress`
反馈：`.banner`、`.banner-info/warn/danger/success`、`.empty`、`.loading`、`.skeleton`、`.toast`
浮层：`.modal-root`、`.modal`、`.drawer-root`、`.drawer`、`.overlay`
AI/诊断：`.ai-card`、`.ai-tag`、`.evidence`、`.evidence-item`、`.hint-step`、`.steps`、`.chip`
其他：`.avatar`、`.timeline`、`.tile-grid`、`.stat-line`、`.muted`、`.small`、`.num`、`.truncate`、`.scroll-x`、`.print-area`、`.no-print`

## 8. 交付与自检

- 每个页面写完必须：`node --check` 文件（可 `E:\node.js\node.exe --check`），并在浏览器打开对应 hash 确认无控制台报错、无死按钮、无溢出。
- 所有按钮必须有行为；未实现能力必须标 `原型` / `待接入` 并通过 toast 或 banner 说明，禁止伪装完成。
- 每阶段结束向 Lead 汇报：完成内容、修改文件、验证方式与结果、已知问题。

---

# 补充说明（Lead 已于核心骨架完成后更新，2026-11-03）

## 9. 已实现的核心事实（写页面时按此假设）

- 页面注册表在 `js/core/pages.js`，**早于所有页面脚本加载**；页面文件只需 `ZWZ.pages.register(...)`。
- `index.html` 已按固定顺序引入全部脚本与样式，**任何人不得修改 index.html**。
- 演示数据：11 名学生（s1 林以安 … s11 苏清和）、3 个任务（t1 有理数单元测评 / t2 整式与方程巩固 / t3 有理数订正再练）、23 道题、206 条作答记录；诊断与班级分析全部由数据实时派生，禁止在页面里硬编码结论数字。
- 演示身份切换：右上角「学生端 / 教师端」切换，或 `user-chip` 打开「切换演示身份」弹窗。
- 深链参数（便于演示与自动化测试）：`index.html?role=teacher#/teacher/analysis`、`index.html?user=s1#/student/practice`。
- 数据持久化：`localStorage`（key `zwz.db.v1`）；顶栏用户菜单可「重置演示数据」。
- 已封装的 UI/图表：见 `js/core/ui.js`、`js/core/charts.js`；样式变量见 `css/tokens.css`；通用类见 `css/components.css`。
- 页面外壳（侧边栏 / 顶栏 / 页脚）由 `js/app.js` 统一渲染，页面只需返回内容区 HTML。

## 10. 页面开发约定（重要）

1. **只改自己文件**；公共文件需要改动时发消息给 Lead。
2. 页面 `render(ctx)` 返回 `html\`...\``；`mount(root, ctx)` 里绑定事件。渲染后如需局部更新，优先操作自身 DOM；修改数据后调用 `ctx.refresh()`。
3. **输入框状态**：`ctx.refresh()` 会重渲染整个内容区，因此输入类页面必须
   - 在输入时用 `ZWZ.store.actions.saveDraft({ questionId, text })` 存草稿（可 `debounce` 300ms）；
   - 渲染时用 `ZWZ.store.actions.getDraft({ questionId })` 回填；
   - 提交前读取输入值，提交后清空草稿。
4. 每个页面顶部用 `.page` 容器 + `.page-head`（标题/说明/操作）；正文用 `.card`、`.section`、`.grid-*`、`.split`。
5. 状态语义统一：`ui.statusBadge('sufficient' | 'preliminary' | 'pending' | 'undetermined')`（诊断）、`ui.statusBadge('auto' | 'suggested' | 'unjudged' | 'reviewed')`（批阅）。
6. 空状态 / 加载 / 错误状态必须存在；复杂操作前后用 `ui.toast` 反馈。
7. 禁止出现「失败」「差生」「排名」「红黑榜」等表达；不确定结论必须带中性说明。
8. 页面标题（`title`）会显示在顶栏，`subtitle` 可选。

## 11. 自检命令（本机可用）

```powershell
# 语法检查（node 在 PATH 中）
node --check js/pages/student/home.js

# 数据层一致性自检（不需要浏览器）
node _dsh_work\check_data.mjs

# 本地服务（Lead 已在 5178 端口启动；若失效可重启）
node server.mjs

# 无头浏览器渲染检查（DOM）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-sandbox --user-data-dir="C:\Users\asus\AppData\Local\Temp\zwz-edge-a" --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:5178/index.html?role=teacher#/teacher/dashboard"

# 截图（注意：截图必须用旧版 --headless，且 user-data-dir 每次不同）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --no-sandbox --window-size=1440,1000 --hide-scrollbars --user-data-dir="C:\Users\asus\AppData\Local\Temp\zwz-shot-a" --screenshot="C:\Users\asus\AppData\Local\Temp\shot.png" "http://127.0.0.1:5178/index.html?role=teacher#/teacher/dashboard"
```

> 无头模式下如需查看报错，请访问 `http://127.0.0.1:5178/_dsh_work/probe2.html`（会显示捕获到的脚本错误）；`file://` 模式下浏览器会隐藏错误详情。


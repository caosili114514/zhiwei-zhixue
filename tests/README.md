# tests · 质量验收脚本

本目录是「知微·智学」的可复跑验收工具链，**零依赖**，只用本机已有的 Node 与 Microsoft Edge 即可。
脚本只做「检查 + 报告」，不修改任何产品代码（`index.html` / `js/**` / `css/**` 不在此目录写入范围内）。

## 1. 两个脚本

### 1.1 `tests/check-data.mjs` —— 数据层一致性自检（Node 直跑，不需要浏览器）

```powershell
node tests/check-data.mjs
```

做什么：在 Node 里用最小浏览器桩加载 `js/core/html.js` … `js/core/charts.js`（顺序同 `index.html`），然后检查

- 学生 / 题目 / 试卷 / 任务 / 作答 / 知识点数量是否合理、主键是否唯一；
- 每条作答能否关联题目、任务、学生，`score` 是否已判分（不为 `undefined`），判分结果能否独立重算一致；
- 判分规则是否符合教育安全约定（过程题不定分、空白 / 识别质量低 → 暂无法判阅）；
- 每名学生诊断条目数 = 知识点总数，`performance / status / evidence.quotes / scope` 字段是否完整；
- 诊断状态与记录数规则是否一致（记录 0 → 暂无法判断；judged 0 → 待复核；judged < 2 → 不得“证据充分”）；
- 班级知识点分析是否为 8 条（kp1–kp8）、kp9（范围外）是否被正确排除；
- 导出 CSV / JSON 行数与数据量是否匹配（用 `io.parseCSV` 反解导出的 CSV 做往返校验）；
- CSV 解析、字段映射、导入预览与阻断规则；
- 写操作闭环（提交作答 → 判分 → 教师复核 → 确认 / 修正诊断 → 重置演示数据）；
- 诊断措辞是否出现标签化 / 排名化表达。

退出码：全部通过 `0`；有任何失败 `1`。终端会输出分组检查清单与「通过 / 失败」统计。

### 1.2 `tests/smoke.mjs` —— 全路由无头浏览器冒烟测试

前置：本地静态服务已启动（项目根 `node server.mjs`，默认 `http://127.0.0.1:5178`）。

```powershell
node tests/smoke.mjs                 # 12 个路由 DOM 冒烟
node tests/smoke.mjs --screenshots   # 额外逐页截图到 tests/screenshots/
node tests/smoke.mjs --print         # 额外复核 3 处打印 PDF（页数 / 文件大小）
node tests/smoke.mjs --screenshots --print   # 交付前完整验收
node tests/smoke.mjs --route=teacher/analysis   # 只跑一个路由（调试用）
node tests/smoke.mjs --base=http://127.0.0.1:5178 --budget=8000 --concurrency=4
```

路由覆盖（学生 4 + 教师 8）：

| 身份 | 路由 |
|---|---|
| 学生 `?role=student` | `#/student/home`、`#/student/practice`、`#/student/archive`、`#/student/report` |
| 教师 `?role=teacher` | `#/teacher/dashboard`、`analysis`、`profile`、`import`、`grading`、`review`、`assistant`、`data` |

每个路由用无头 Edge `--dump-dom` 渲染后断言：

1. 页面外壳已渲染（`#page-content` 存在，侧边导航数量 = 4 / 8）；
2. 内容区非空（去标签后文字量 ≥ 60 字），页面标题已由页面更新；
3. 内容区**不含**：「页面开发中」「页面不存在或尚未实现」「[object Object]」「渲染失败」「Cannot read」「正在加载演示数据」；
4. 命中该页 1–3 组关键特征文案（每组是“同义词数组”，命中其一即可）。

全量运行（未加 `--route`）时额外做两条**权限守卫**检查：学生访问 `#/teacher/analysis`、教师访问 `#/student/home`
应分别回落到本角色首页（标题与学生/教师首页一致）。

加 `--print` 时额外做 3 处**打印复核**：用无头 Edge `--headless=new --print-to-pdf` 打印
`#/student/report`（期望 3 页）、`#/teacher/profile`（期望 2 页）、`#/teacher/data?tab=export`（期望 2 页），
校验页数与文件大小（>80KB 视为已渲染）。**不要**用旧版 `--headless` 做打印：它不执行 JS，只会得到空白 PDF；
无头打印偶发在首屏渲染前截取（1–2KB 空白文件），脚本会自动重试最多 6 次取最大结果（顺序执行，避免并发抢占渲染）。页数期望值在
`tests/smoke.mjs` 顶部 `PRINT_TARGETS` 中配置，页面打印内容调整后需同步更新。

可选参数：`--edge="<msedge.exe 路径>"`、`--keep-temp`（保留临时 profile 便于排查）、
`--budget=毫秒`（无头虚拟时间预算，默认 8000）、`--concurrency=并发数`（默认 4）、`--route=路径`（单路由）。

退出码：全部通过 `0`；有失败 `1`（包括截图生成失败）。

## 2. 依赖

- Node（本机已装，`node --version` 可用；脚本用内置 `fetch` / `child_process` / `fs`，**不安装任何 npm 包**）。
- Microsoft Edge：默认自动探测
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`、
  `C:\Program Files\Microsoft\Edge\Application\msedge.exe`、
  `%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`；
  找不到时用 `--edge=` 或环境变量 `EDGE_BIN` 指定。
- 本地静态服务（仅 `smoke.mjs` 需要）：`node server.mjs` 或双击 `启动知微智学.bat`。

## 3. 输出物

| 路径 | 产生方式 | 说明 |
|---|---|---|
| `tests/last-run.md` | `smoke.mjs` 每次运行覆盖 | 本次冒烟结果表：路由 / 身份 / 状态 / 页面标题 / 内容字数 / 耗时 / 失败原因；含失败详情与复现命令 |
| `tests/screenshots/<key>.png` | `smoke.mjs --screenshots` | 12 页 1440×1000 截图（`student-home.png`、`teacher-analysis.png` …），供视觉复核 |
| 终端输出 | 两个脚本 | `check-data.mjs` 输出分组检查清单；`smoke.mjs` 输出结果表与失败原因 |

> 截图实现：先用旧版 `--headless` 截到系统临时目录（纯 ASCII 路径，避免中文路径问题），校验 PNG 有效后
> 再复制到 `tests/screenshots/`。临时 profile 目录在运行结束后自动清理。

## 4. 常见失败原因与处理

| 现象 | 原因 | 处理 |
|---|---|---|
| `本地服务不可访问` / `HTTP 404` | 静态服务未启动，或端口不是 5178 | 项目根执行 `node server.mjs`；确认 `http://127.0.0.1:5178/` 可打开 |
| 端口被占用（启动服务时报错） | 5178 已被其他进程占用 | 关闭占用进程，或 `--base=http://127.0.0.1:<端口>` 指向已有服务 |
| `内容区出现「页面开发中」` | 该路由仍是占位页面 | 对应页面组实现 `js/pages/**`；这是开发中的预期失败 |
| `内容区文字过少` | 页面渲染为空 / 报错被 `js/app.js` 捕获 | 查看浏览器控制台；或访问 `_dsh_work/probe2.html` 看脚本错误 |
| `内容区出现「[object Object]」` | 模板里把 Raw 对象（`html`` / `ui.icon()` 等）与普通字符串相加 | 改用 `html`` 插值，或对 Raw 取 `.value` 后再拼接 |
| `页面标题未更新` / 内容区找不到 | `render()` 抛异常或页面未 `ZWZ.pages.register` | 检查 `node --check` 与页面注册 key 是否与路由一致 |
| `侧边导航数量异常` | 角色切换失败或 `js/app.js` 外壳未渲染 | 确认 `?role=student` / `?role=teacher` 深链未被 localStorage 旧会话覆盖（脚本每个路由用独立 profile，一般不会） |
| `浏览器未返回完整 DOM（执行超时）` | 机器繁忙 / 页面脚本卡死 | 加大 `--budget=15000` 重试；仍是超时则查页面死循环 |
| 截图失败 / 非 PNG | 旧版 `--headless` 兼容问题、窗口尺寸或中文路径 | 脚本已用 ASCII 临时路径 + PNG 魔数校验；若仍失败，用 `--keep-temp` 查看日志 |

## 5. 维护说明

- **关键特征文案**在 `tests/smoke.mjs` 顶部的 `ROUTES[].expect` 中配置，每一项是“同义词数组”，
  组内命中任意一个即通过。页面文案调整后同步更新该数组即可，不需要改断言逻辑。
- `check-data.mjs` 中的数量断言使用区间（学生 8–60、题目 20–60、作答 150–400 等），
  其余行数断言均由数据实时推导（如导出行数 = 学生数 × 范围内知识点数），改数据不会误报。
- 两个脚本互不依赖，可单独复跑，也可在交付前一键依次执行：

  ```powershell
  node tests/check-data.mjs; if ($LASTEXITCODE -eq 0) { node tests/smoke.mjs --screenshots }
  ```

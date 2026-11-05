# 知微·智学 · 比赛交付总览

本目录为比赛交付物索引；代码与数据在项目根目录。

## 快速运行
1. `node server.mjs`
2. 打开 `http://127.0.0.1:5178/`
3. 教师端 → 教学支持 → **赛题成果**（或直接 `?role=teacher&data=official#/teacher/contest`）
4. 右上角用户菜单可切换“演示数据 / 赛题数据”、DC01/DC02、教师/学生身份。

## 交付物
| 交付物 | 路径 |
|---|---|
| 设计方案 PDF（5 页，≤20 页） | `比赛交付/设计方案.pdf` |
| 设计方案源文件 | `比赛交付/设计方案.html` |
| 答辩 PPT | `比赛交付/答辩PPT.pptx` |
| 演示视频脚本（≤5 分钟） | `比赛交付/演示视频脚本.md` |
| 任务成果包（JSON/CSV/字段说明/manifest/源数据副本） | `比赛交付/任务成果包/` |
| 数据对账报告 | `比赛交付/数据对账报告.md` |
| 运行说明 | `比赛交付/运行说明.md` |
| 实施报告（批次/测试/checkpoint/未完成项） | `比赛交付/比赛实施报告.md` |
| 赛题成果页截图 | `比赛交付/screenshots/contest-task1.png` |

## 代码与数据
- 官方数据副本（只读）：`data/official/`
- 数据适配：`js/data/official.js`、`js/data/official-data.js`
- Task1/2/3 服务：`js/services/competition.js`
- 赛题成果页：`js/pages/teacher/contest.js`
- 原有演示模式与 12 个页面保留；双模式独立存储。

## 测试
```bash
node tests/check-data.mjs      # 53/53（演示数据回归）
node tests/check-official.mjs  # 13/13（官方数据/质量/成果）
node tests/smoke.mjs           # 12 路由 + 权限 2/2
node tests/smoke.mjs --print   # 3/3
```

## 边界
- 官方数据为模拟数据，不用于证明真实教学成效；仅使用主办方模拟数据，不含真实学生个人信息。
- 未接入真实 OCR/大模型/后端；相关页面有明确标注。
- 独立评测数据文件、官方成果包模板、视频录制需团队/赛方确认后补齐；详见实施报告。

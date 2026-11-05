# 冒烟测试结果（自动生成）

- 运行时间：2026/11/5 15:57:02（耗时 27050 ms）
- 目标地址：http://127.0.0.1:5178
- 浏览器：C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
- 模式：DOM 冒烟 + 打印 PDF 复核
- 结果：**12 通过 / 0 失败**（共 12 个路由；权限守卫 2 / 2 通过；打印复核 3 / 3 通过）

## 结果表

| # | 路由 | 身份 | 状态 | 页面标题 | 内容字数 | 耗时 | 失败原因 |
|---|---|---|---|---|---|---|---|
| 1 | `#/student/home` | 学生 | ✅ 通过 | 学习主页 · 知微·智学 | 534 | 2135ms | — |
| 2 | `#/student/practice` | 学生 | ✅ 通过 | 题目练习 · 知微·智学 | 505 | 2136ms | — |
| 3 | `#/student/archive` | 学生 | ✅ 通过 | 我的档案 · 知微·智学 | 1494 | 3871ms | — |
| 4 | `#/student/report` | 学生 | ✅ 通过 | 学情报告 · 知微·智学 | 2424 | 3882ms | — |
| 5 | `#/teacher/dashboard` | 教师 | ✅ 通过 | 工作台 · 知微·智学 | 1320 | 3488ms | — |
| 6 | `#/teacher/analysis` | 教师 | ✅ 通过 | 班级学情分析 · 知微·智学 | 4125 | 3472ms | — |
| 7 | `#/teacher/profile` | 教师 | ✅ 通过 | 个体学情档案 · 知微·智学 | 3754 | 2045ms | — |
| 8 | `#/teacher/import` | 教师 | ✅ 通过 | 试卷与题目 · 知微·智学 | 797 | 1737ms | — |
| 9 | `#/teacher/grading` | 教师 | ✅ 通过 | 作业批阅 · 知微·智学 | 1821 | 2566ms | — |
| 10 | `#/teacher/review` | 教师 | ✅ 通过 | 复核中心 · 知微·智学 | 6336 | 2553ms | — |
| 11 | `#/teacher/assistant` | 教师 | ✅ 通过 | 教学助理 · 知微·智学 | 1029 | 2487ms | — |
| 12 | `#/teacher/data` | 教师 | ✅ 通过 | 数据与报告 · 知微·智学 | 471 | 2193ms | — |

## 权限守卫（跨角色访问）

| 场景 | 状态 | 实际页面标题 | 耗时 | 失败原因 |
|---|---|---|---|---|
| 权限守卫 · 学生访问教师路由（`/index.html?role=student#/teacher/analysis`） | ✅ 通过 | 学习主页 · 知微·智学 | 972ms | — |
| 权限守卫 · 教师访问学生路由（`/index.html?role=teacher#/student/home`） | ✅ 通过 | 工作台 · 知微·智学 | 1112ms | — |

## 打印复核（--print）

无头 Edge `--headless=new --print-to-pdf` 打印为 PDF，校验页数与文件大小（>80KB 视为已渲染；空首页/渲染失败会体现为页数异常或文件过小）。

| 打印对象 | 路由 | 状态 | 页数 | 文件大小 | 尝试次数 | 失败原因 |
|---|---|---|---|---|---|---|
| 打印 · 学生个人报告 | `/index.html?role=student#/student/report` | ✅ 通过 | 3 | 336 KB | 2 | — |
| 打印 · 教师个体档案 | `/index.html?role=teacher#/teacher/profile` | ✅ 通过 | 2 | 176 KB | 3 | — |
| 打印 · 教师班级报告 | `/index.html?role=teacher#/teacher/data?tab=export` | ✅ 通过 | 2 | 237 KB | 1 | — |

> 本文件由 `node tests/smoke.mjs` 自动生成，每次运行覆盖；请勿手工编辑。

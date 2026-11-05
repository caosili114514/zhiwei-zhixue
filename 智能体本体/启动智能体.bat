@echo off
chcp 65001 >nul
title 知微·智学 · 智能体本体
cd /d "%~dp0源代码"
set PORT=5178
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
echo 正在启动智能体本体本地预览：http://127.0.0.1:%PORT%/
start "" cmd /c "timeout /t 1 >nul & start http://127.0.0.1:%PORT%/index.html?role=teacher&data=official#/teacher/contest"
node server.mjs
goto END
:NO_NODE
echo [!] 未检测到 Node.js，改为直接用浏览器打开 index.html（file:// 模式）。
start "" "%~dp0源代码\index.html?role=teacher&data=official#/teacher/contest"
:END
pause

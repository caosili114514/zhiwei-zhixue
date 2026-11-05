@echo off
chcp 65001 >nul
title 知微·智学 · 本地预览
cd /d "%~dp0"
set PORT=5178
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
echo 正在启动本地预览服务：http://127.0.0.1:%PORT%/
start "" cmd /c "timeout /t 1 >nul & start http://127.0.0.1:%PORT%/"
node server.mjs
goto END
:NO_NODE
echo [!] 未检测到 Node.js，改为直接用浏览器打开 index.html（file:// 模式）。
start "" "%~dp0index.html"
:END
pause
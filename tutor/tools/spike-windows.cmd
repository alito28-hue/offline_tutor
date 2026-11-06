@echo off
rem Double-click to measure this PC. It needs Node.js and, the first time, internet (about 3.9 GB).
cd /d "%~dp0..\.."
where node >nul 2>nul || (echo Install Node.js 24 LTS from nodejs.org, then run this again. & pause & exit /b 1)
if not exist node_modules\@qvac\sdk call npm ci || (echo npm ci failed. & pause & exit /b 1)
node tutor\tools\fetch_models.mjs --small || (echo Model download failed. & pause & exit /b 1)
mkdir spike-results 2>nul
cd spike-results
node ..\tutor\tools\spike.mjs --model Qwen3-4B-Q4_K_M --device gpu
node ..\tutor\tools\spike.mjs --model Qwen3-1.7B-Q4_0 --device gpu
node ..\tutor\tools\spike.mjs --model Qwen3-4B-Q4_K_M --device cpu
node ..\tutor\tools\spike.mjs --model Qwen3-1.7B-Q4_0 --device cpu
echo.
echo Done. Send the files in the spike-results folder.
explorer .
pause

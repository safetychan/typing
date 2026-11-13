@echo off
setlocal
if "%~1"=="" (
  echo Usage: push-to-github.bat ^<repository-https-url^>
  echo Example: push-to-github.bat https://github.com/yourname/typing-lab.git
  exit /b 1
)
cd /d "%~dp0.."
git config user.name >nul 2>&1
if errorlevel 1 (
  echo Git identity is not configured. Run these first:
  echo   git config --global user.name  "Your Name"
  echo   git config --global user.email "you@example.com"
  exit /b 1
)
git init -b main
if errorlevel 1 exit /b 1
git add -A
git commit -m "Typing Lab v4.0"
git remote remove origin >nul 2>&1
git remote add origin "%~1"
git push -u origin main
if errorlevel 1 exit /b 1
echo.
echo Pushed. Now enable Pages: Settings - Pages - Deploy from a branch - main / root

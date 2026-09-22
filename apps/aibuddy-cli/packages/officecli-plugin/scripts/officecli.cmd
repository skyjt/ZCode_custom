@echo off
setlocal
set "OFFICECLI_SKIP_UPDATE=1"
set "OFFICECLI_NO_AUTO_INSTALL=1"
set "OFFICECLI_NO_AUTO_RESIDENT=1"
"%~dp0..\bin\officecli.exe" %*
exit /b %errorlevel%

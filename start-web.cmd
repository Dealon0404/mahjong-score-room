@echo off
setlocal
set "ROOT=%~dp0"
set "PROJECT=%ROOT%."
set "NODE_DIR=%ROOT%..\_tools\node-v24.18.0-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
"%NODE_DIR%\node.exe" "%ROOT%node_modules\expo\bin\cli" start "%PROJECT%" --web --localhost --port 8082
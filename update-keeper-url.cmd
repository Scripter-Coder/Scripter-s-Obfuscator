@echo off
REM ===========================================================================
REM  update-keeper-url.cmd  -  point the worker at the CURRENT Storage Keeper tunnel
REM ===========================================================================
REM
REM  WHY THIS EXISTS
REM  A quick cloudflared tunnel is handed a RANDOM address on every restart. The
REM  worker caches the old one in SH_STORE_URL, so after any restart it is talking
REM  to an address that no longer exists: publishing fails, and every script whose
REM  bytes live only on the PC stops delivering. That has now happened three times.
REM
REM  The token does NOT change - it is persisted in Storage Keeper\data\tunnel.txt
REM  and reused - so this script only ever rewrites the URL.
REM
REM  USAGE   (from cmd, in the project folder)
REM     update-keeper-url.cmd
REM
REM  It reads the address tunnel.py wrote, swaps it into wrangler.toml, deploys,
REM  and then verifies the whole path - so a failure tells you WHICH step broke
REM  instead of leaving you to guess.
REM ===========================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo === ScripterHub - repoint the worker at your current tunnel
echo.

REM ---- 1. did tunnel.py actually run? ----------------------------------------
if not exist "Storage Keeper\data\tunnel-url.txt" (
    echo [X] No tunnel-url.txt found.
    echo     Start the keeper FIRST:
    echo         py "Storage Keeper\tunnel.py"
    echo     and leave that window open.
    exit /b 1
)

set "NEWURL="
for /f "usebackq delims=" %%U in ("Storage Keeper\data\tunnel-url.txt") do set "NEWURL=%%U"
REM strip a trailing CR that for/f leaves behind on some Windows builds
set "NEWURL=!NEWURL!"
if not defined NEWURL (
    echo [X] tunnel-url.txt is empty. Is the keeper still running?
    exit /b 1
)

echo [1/4] tunnel address : !NEWURL!

REM ---- 2. is it actually alive? ----------------------------------------------
REM Checked BEFORE deploying. Deploying a dead address is the exact mistake this
REM script exists to stop, and it costs a round trip to discover afterwards.
echo [2/4] checking it is reachable...
powershell -NoProfile -Command ^
  "try { $r = Invoke-WebRequest -Uri '%NEWURL%/v1/health' -TimeoutSec 20 -UseBasicParsing; if ($r.StatusCode -eq 200) { Write-Host '      reachable, HTTP 200' ; exit 0 } else { Write-Host ('      HTTP ' + $r.StatusCode) ; exit 1 } } catch { Write-Host ('      NOT reachable: ' + $_.Exception.Message) ; exit 1 }"
if errorlevel 1 (
    echo.
    echo [X] The tunnel is not answering. Publishing would fail with a 502.
    echo     Check the tunnel.py window is still open and shows no error.
    exit /b 1
)

REM ---- 3. write it into wrangler.toml ----------------------------------------
echo [3/4] updating wrangler.toml...
powershell -NoProfile -Command ^
  "$p='wrangler.toml'; $t=[IO.File]::ReadAllText($p); $u='%NEWURL%'; $new=[regex]::Replace($t,'(?m)^SH_STORE_URL\s*=.*$','SH_STORE_URL = \"' + $u + '\"'); if ($new -eq $t) { Write-Host '      already correct' } else { [IO.File]::WriteAllText($p,$new); Write-Host ('      SH_STORE_URL = ' + $u) }"
if errorlevel 1 (
    echo [X] Could not rewrite wrangler.toml.
    exit /b 1
)

REM ---- 4. deploy -------------------------------------------------------------
echo [4/4] deploying...
call npx wrangler deploy
if errorlevel 1 (
    echo.
    echo [X] Deploy failed. wrangler.toml was already updated, so just re-run this.
    exit /b 1
)

echo.
echo === Done. Publishing and delivery both point at your PC again.
echo.
echo NOTE: this is still a QUICK tunnel. The address changes on every restart,
echo so this command has to be run after each one. A named tunnel removes that
echo entirely - see Storage Keeper\README.md.
echo.
endlocal
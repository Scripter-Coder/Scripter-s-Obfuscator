@echo off
REM ===========================================================================
REM  keeper-autostart.cmd  -  one-line wrapper
REM ===========================================================================
REM  The work is in Storage Keeper\keeper_autostart.py. This exists so the
REM  Scheduled Task, a desktop shortcut, and a confused human all have the same
REM  thing to run. Pass anything through, e.g.
REM      keeper-autostart.cmd --skip-deploy
REM ===========================================================================
cd /d "%~dp0"
py "Storage Keeper\keeper_autostart.py" %*
exit /b %ERRORLEVEL%
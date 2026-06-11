@echo off
REM Deploy-Helper: kopiert die aktuelle V18_0 aus dem Vault ins git-Repo
REM Quelle = Vault-SERVER-Ordner (Single Source of Truth fuer den Deploy-Stand)
set SRC=C:\Users\Elitebook\Documents\Obsidian Vault\Phoenix Brain\01_BRAIN\PROJEKTE\DARTS\DARTS_APP\SERVER
set VER=DARTS_APP_V20_1_9.html

echo Kopiere %VER% ...
copy /Y "%SRC%\%VER%" "%~dp0%VER%" >nul
copy /Y "%SRC%\%VER%" "%~dp0public\index.html" >nul

if %errorlevel%==0 (
    echo OK aktualisiert: %VER%, public\index.html
    echo Naechste Schritte: git add public/index.html %VER% ^&^& git commit -m "deploy V20.1.9" ^&^& git push
) else (
    echo FEHLER beim Kopieren — pruefe Pfad %SRC%
)
pause

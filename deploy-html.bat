@echo off
echo Kopiere Darts App nach public\index.html ...
copy /Y "C:\Users\Elitebook\Documents\Obsidian Vault\Phoenix Brain\01_BRAIN\PROJEKTE\SOFTWARE_APPS\DARTS_APP\DARTS_APP_V12_8.html" "public\index.html"
if %errorlevel%==0 (
    echo OK — public\index.html aktualisiert.
) else (
    echo FEHLER beim Kopieren.
)
pause

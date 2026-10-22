@echo off
REM Projector TV - opens Chrome full screen (kiosk) with muted autoplay allowed.
REM Put a shortcut to this file in the Startup folder: Win+R, type  shell:startup , Enter, paste the shortcut there.
REM To exit kiosk: Alt+F4.
timeout /t 20 /nobreak >nul
set URL=https://lefty113.github.io/projector-tv/
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist %CHROME% (
  start "" %CHROME% --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --disable-infobars --user-data-dir="%LOCALAPPDATA%\ProjectorTV" %URL%
) else (
  start "" msedge --kiosk %URL% --edge-kiosk-type=fullscreen --autoplay-policy=no-user-gesture-required --no-first-run --user-data-dir="%LOCALAPPDATA%\ProjectorTV"
)

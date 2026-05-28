@echo off
echo [ShadowSwitch] Building receiver.exe...

:: Move to receiver directory where go.mod is located
cd receiver

:: Build the Go binary
:: -H=windowsgui : Suppresses the console window
:: -s -w         : Strips debug info to reduce file size
:: Output directly to the parent folder (root)
go build -ldflags="-H=windowsgui -s -w" -o ../receiver.exe main.go

if %ERRORLEVEL% EQU 0 (
    cd ..
    echo [SUCCESS] receiver.exe has been built in the project root.
) else (
    cd ..
    echo [ERROR] Build failed. Make sure Go is installed.
    pause
)

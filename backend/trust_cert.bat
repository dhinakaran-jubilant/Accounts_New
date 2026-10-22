@echo off
:: Trust LoanDesk SSL Certificate in Windows Root Store
echo Adding LoanDesk SSL certificate (cert.pem) to Windows Trusted Root Certification Authorities...
certutil -addstore -f "ROOT" "%~dp0cert.pem"
if %errorlevel% equ 0 (
    echo [SUCCESS] Certificate added to Trusted Root Certification Authorities successfully!
) else (
    echo [ERROR] Failed to add certificate. Please run this script as Administrator.
)
pause

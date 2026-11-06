# ========================================================
# Kuro Studio (AllToolsKuro) - One-liner Windows Installer
# ========================================================

Write-Host "Menginstal Kuro Studio CLI (opkuro)..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js belum terpasang di sistem Anda. Silakan pasang Node.js terlebih dahulu." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm belum terpasang." -ForegroundColor Red
    exit 1
}

npm install -g github:itsvin-debug/AllToolsKuro

Write-Host "`nInstalasi selesai!" -ForegroundColor Green
Write-Host "Ketik 'opkuro' di terminal Anda untuk langsung membuka Kuro Studio." -ForegroundColor Yellow
Write-Host "Ketik 'opkuro --cloud' untuk membuka instans web cloud." -ForegroundColor Gray

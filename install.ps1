# ========================================================
# Kuro Studio (AllToolsKuro) - Windows Installer
# ========================================================

Write-Host "Memeriksa lingkungan sistem..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js belum terpasang di sistem Anda." -ForegroundColor Red
    Write-Host "Unduh dan pasang Node.js (versi 18 ke atas) dari https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm belum terpasang." -ForegroundColor Red
    exit 1
}

$nodeVerString = node -v
$nodeMajor = [int]($nodeVerString.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Host "Peringatan: Versi Node.js ($nodeVerString) terlalu rendah. Disarankan Node.js v18 ke atas." -ForegroundColor Yellow
}

Write-Host "Menginstal paket CLI global Kuro Studio (opkuro)..." -ForegroundColor Cyan
npm install -g github:itsvin-debug/AllToolsKuro

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nInstalasi berhasil!" -ForegroundColor Green
    Write-Host "Jalankan 'opkuro' di terminal untuk membuka Kuro Studio." -ForegroundColor Yellow
    Write-Host "Jalankan 'opkuro --cloud' untuk membuka instans web produksi." -ForegroundColor Gray
} else {
    Write-Host "`nInstalasi gagal dengan kode $LASTEXITCODE." -ForegroundColor Red
    Write-Host "Jika mengalami kendala hak akses, jalankan PowerShell sebagai Administrator." -ForegroundColor Yellow
}

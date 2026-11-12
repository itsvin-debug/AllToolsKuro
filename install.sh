#!/bin/bash
# ========================================================
# Kuro Studio (AllToolsKuro) - Linux & macOS Installer
# ========================================================

set -e

echo "Memeriksa lingkungan sistem..."

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js belum terpasang di sistem Anda."
  echo "Silakan pasang Node.js v18+ via package manager atau https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm belum terpasang."
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Peringatan: Versi Node.js ($(node -v)) terlalu rendah. Disarankan v18 ke atas."
fi

echo "Menginstal paket CLI global Kuro Studio (opkuro)..."
npm install -g github:itsvin-debug/AllToolsKuro

echo ""
echo "Instalasi selesai!"
echo "Jalankan 'opkuro' di terminal untuk membuka Kuro Studio."
echo "Jalankan 'opkuro --cloud' untuk membuka instans web produksi."

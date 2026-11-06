#!/bin/bash
# ========================================================
# Kuro Studio (AllToolsKuro) - One-liner Global Installer
# ========================================================

set -e

echo "Menginstal Kuro Studio CLI (opkuro)..."

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js belum terpasang di sistem Anda. Silakan pasang Node.js terlebih dahulu."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm belum terpasang."
  exit 1
fi

npm install -g github:itsvin-debug/AllToolsKuro

echo ""
echo "Instalasi selesai!"
echo "Ketik 'opkuro' di terminal Anda untuk langsung membuka Kuro Studio."
echo "Ketik 'opkuro --cloud' untuk membuka instans web cloud."

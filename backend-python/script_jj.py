#!/usr/bin/env python3
"""
CLI runner untuk dipanggil oleh child_process Node.js saat service FastAPI tidak aktif.
Penggunaan: python script_jj.py "<url_video_tiktok>"
Output: JSON terstruktur di stdout
"""
import sys
import json
from services.jj_service import find_jj_presets

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "message": "Argumen URL video TikTok diperlukan."
        }))
        sys.exit(1)

    url = sys.argv[1].strip()
    result = find_jj_presets(url)
    print(json.dumps(result))

if __name__ == "__main__":
    main()

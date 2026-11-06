#!/usr/bin/env python3
"""
CLI runner untuk dipanggil oleh child_process Node.js saat service FastAPI tidak aktif.
Penggunaan: python script_resolver.py "<url_target>"
Output: JSON terstruktur di stdout
"""
import sys
import json
from services.resolver_service import deep_resolve

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "status": "error",
            "message": "Argumen URL target diperlukan."
        }))
        sys.exit(1)

    target_url = sys.argv[1].strip()
    result = deep_resolve(target_url, timeout=28)
    print(json.dumps(result))

if __name__ == "__main__":
    main()

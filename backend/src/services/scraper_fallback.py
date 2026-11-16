import sys
import json
import re

def scrape_with_curl_cffi(username):
    try:
        from curl_cffi import requests
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        }
        r = requests.get(f'https://www.tiktok.com/@{username}', impersonate='safari15_5', headers=headers, timeout=10)
        if r.status_code == 200:
            return r.text
    except Exception:
        pass
    return None

def scrape_with_httpx(username):
    try:
        import httpx
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        }
        with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
            r = client.get(f'https://www.tiktok.com/@{username}')
            if r.status_code == 200:
                return r.text
    except Exception:
        pass
    return None

def parse_tiktok_html(html, username):
    if not html:
        return None

    # 1. Coba parse __UNIVERSAL_DATA_FOR_REHYDRATION__
    match = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)</script>', html)
    if match:
        try:
            raw_json = json.loads(match.group(1))
            detail = raw_json.get('__DEFAULT_SCOPE__', {}).get('webapp.user-detail', {})
            status_code = detail.get('statusCode')
            if status_code in [10202, 10221]:
                return {"status": False, "error": "user_not_found"}

            user_info = detail.get('userInfo', {})
            user = user_info.get('user', {})
            stats = user_info.get('stats', {})
            stats_v2 = user_info.get('statsV2', {})

            if user and (user.get('uniqueId') or user.get('nickname')):
                return {
                    "status": True,
                    "source": "universal_data",
                    "user": user,
                    "stats": stats,
                    "statsV2": stats_v2
                }
        except Exception:
            pass

    # 2. Coba parse SIGI_STATE
    sigi_match = re.search(r'<script id="SIGI_STATE"[^>]*>([\s\S]*?)</script>', html)
    if sigi_match:
        try:
            sigi_json = json.loads(sigi_match.group(1))
            users_map = sigi_json.get('UserModule', {}).get('users', {})
            stats_map = sigi_json.get('UserModule', {}).get('stats', {})
            
            user = users_map.get(username) or next(iter(users_map.values()), {})
            stats = stats_map.get(username) or next(iter(stats_map.values()), {})

            if user:
                return {
                    "status": True,
                    "source": "sigi_state",
                    "user": user,
                    "stats": stats,
                    "statsV2": {}
                }
        except Exception:
            pass

    return None

def main():
    target = sys.argv[1].strip().lstrip('@') if len(sys.argv) > 1 else 'tiktok'
    
    # Prioritas 1: curl_cffi dengan peniruan safari/chrome
    html = scrape_with_curl_cffi(target)
    
    # Prioritas 2: httpx mobile
    if not html:
        html = scrape_with_httpx(target)

    parsed = parse_tiktok_html(html, target)
    if parsed:
        print(json.dumps(parsed))
    else:
        print(json.dumps({"status": False, "error": "extraction_failed"}))

if __name__ == '__main__':
    main()

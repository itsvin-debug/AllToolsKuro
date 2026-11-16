import sys
import json
import re

def scrape_tiktok_profile(username):
    username = username.strip().lstrip('@')
    profile_url = f"https://www.tiktok.com/@{username}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    }

    try:
        import httpx
        from bs4 import BeautifulSoup

        with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(profile_url)
            
            if resp.status_code == 200:
                html = resp.text
                
                # Coba parse Universal Data for Rehydration
                match = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)</script>', html)
                if match:
                    try:
                        raw_json = json.loads(match.group(1))
                        user_info = raw_json.get('__DEFAULT_SCOPE__', {}).get('webapp.user-detail', {}).get('userInfo', {})
                        user = user_info.get('user', {})
                        stats = user_info.get('stats', {})
                        
                        if user:
                            return {
                                "status": True,
                                "source": "universal_data",
                                "data": {
                                    "uniqueId": user.get('uniqueId', username),
                                    "nickname": user.get('nickname', username),
                                    "avatarLarger": user.get('avatarLarger', user.get('avatarMedium', '')),
                                    "avatar": user.get('avatarMedium', user.get('avatarThumb', '')),
                                    "signature": user.get('signature', ''),
                                    "verified": bool(user.get('verified', False)),
                                    "privateAccount": bool(user.get('privateAccount', False)),
                                    "secUid": user.get('secUid', ''),
                                    "id": user.get('id', ''),
                                    "region": user.get('region', ''),
                                    "bioLink": user.get('bioLink', {}),
                                    "followerCount": stats.get('followerCount', 0),
                                    "followingCount": stats.get('followingCount', 0),
                                    "heartCount": stats.get('heartCount', 0),
                                    "videoCount": stats.get('videoCount', 0),
                                    "friendCount": stats.get('friendCount', 0)
                                }
                            }
                    except Exception:
                        pass

                # Coba parse metadata OpenGraph standar HTML
                soup = BeautifulSoup(html, 'html.parser')
                title_tag = soup.find('title')
                desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
                image_tag = soup.find('meta', attrs={'property': 'og:image'})
                
                nickname = title_tag.text.split('(')[0].strip() if title_tag else username
                signature = desc_tag.get('content', '') if desc_tag else ''
                avatar = image_tag.get('content', '') if image_tag else ''

                return {
                    "status": True,
                    "source": "opengraph_fallback",
                    "data": {
                        "uniqueId": username,
                        "nickname": nickname or username,
                        "avatarLarger": avatar,
                        "avatar": avatar,
                        "signature": signature,
                        "verified": False,
                        "privateAccount": False,
                        "secUid": "",
                        "id": "",
                        "region": "",
                        "bioLink": None,
                        "followerCount": 0,
                        "followingCount": 0,
                        "heartCount": 0,
                        "videoCount": 0,
                        "friendCount": 0
                    }
                }
    except Exception as e:
        return {
            "status": False,
            "error": str(e),
            "data": {
                "uniqueId": username,
                "nickname": username,
                "avatarLarger": "",
                "avatar": "",
                "signature": "",
                "verified": False,
                "privateAccount": False
            }
        }

    return {
        "status": False,
        "error": "Web page blocked or not accessible",
        "data": {
            "uniqueId": username,
            "nickname": username,
            "avatarLarger": "",
            "avatar": "",
            "signature": "",
            "verified": False,
            "privateAccount": False
        }
    }

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'tiktok'
    result = scrape_tiktok_profile(target)
    print(json.dumps(result))

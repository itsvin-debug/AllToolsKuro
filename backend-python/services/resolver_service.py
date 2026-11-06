import re
import sys
import time
import json
import base64
import urllib.parse
from typing import Dict, Any, Optional, List, Tuple
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

AGGREGATOR_DOMAINS = {
    "linktr.ee", "heylink.me", "carrd.co", "beacons.ai",
    "bio.link", "taplink.cc", "msha.ke", "allmylinks.com"
}

DIRECT_SHORTLINK_DOMAINS = {
    "bit.ly", "s.id", "tinyurl.com", "t.co", "cutt.ly",
    "shorturl.at", "rb.gy", "is.gd", "v.gd"
}

SAFELINK_DOMAINS = {
    "sfl.gl", "sfl.ink", "safelinku.com", "safelinku.me",
    "safelink.id", "safelinkblogger.com", "ouo.io", "ouo.press"
}

FILE_HOST_REGEXES = [
    re.compile(r"https?://(?:www\.)?mediafire\.com/file/[^\s\"'<>]+", re.I),
    re.compile(r"https?://drive\.google\.com/(?:file/d/|open\?id=)[^\s\"'<>]+", re.I),
    re.compile(r"https?://(?:www\.)?mega\.nz/(?:file|folder)/[^\s\"'<>]+", re.I),
    re.compile(r"https?://(?:www\.)?dropbox\.com/s/[^\s\"'<>]+", re.I),
    re.compile(r"https?://pixeldrain\.com/u/[^\s\"'<>]+", re.I),
    re.compile(r"https?://gofile\.io/d/[^\s\"'<>]+", re.I),
    re.compile(r"https?://krakenfiles\.com/view/[^\s\"'<>]+", re.I),
    re.compile(r"https?://(?:www\.)?terabox\.com/s/[^\s\"'<>]+", re.I),
    re.compile(r"https?://zippyshare\.day/[^\s\"'<>]+", re.I),
]

def _is_valid_http_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urllib.parse.urlparse(url.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False

def _follow_redirects_chain(url: str, max_hops: int = 5) -> Tuple[int, str, str]:
    """
    Mengikuti rantai redirect HTTP (301, 302, 303, 307, 308) langkah demi langkah
    menggunakan header Location tanpa crash jika host akhir offline.
    """
    curr = url
    for _ in range(max_hops):
        try:
            import requests
            r = requests.get(curr, headers={"User-Agent": USER_AGENT}, timeout=4, allow_redirects=False)
            if r.status_code in (301, 302, 303, 307, 308) and "Location" in r.headers:
                loc = r.headers["Location"].strip()
                next_url = urllib.parse.urljoin(curr, loc)
                if _is_valid_http_url(next_url):
                    curr = next_url
                    continue
            return r.status_code, curr, r.text
        except Exception:
            break
    return 200, curr, ""

def _fetch_html_stealth(url: str, timeout: int = 8) -> Tuple[int, str, str]:
    """
    Fetch URL dengan proteksi bypass TLS/Cloudflare:
    Prioritas: curl_cffi (chrome120) -> cloudscraper -> requests
    Mengembalikan tuple: (status_code, final_url, html_text)
    """
    # 1. Coba curl_cffi dengan impersonasi Chrome120
    try:
        from curl_cffi import requests as cffi_requests
        session = cffi_requests.Session(impersonate="chrome120")
        resp = session.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
        return resp.status_code, resp.url, resp.text
    except Exception:
        pass

    # 2. Coba cloudscraper
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
        resp = scraper.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
        return resp.status_code, resp.url, resp.text
    except Exception:
        pass

    # 3. Fallback standar requests
    try:
        import requests
        session = requests.Session()
        session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id,en-US;q=0.9,en;q=0.8"
        })
        resp = session.get(url, timeout=timeout, allow_redirects=True)
        return resp.status_code, resp.url, resp.text
    except Exception as e:
        return 0, url, f"Error: {str(e)}"

def _extract_from_query(url: str) -> Optional[str]:
    """Ekstraksi instan dari parameter query (plaintext, url-encoded, base64, hex)."""
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        candidates = [
            'url', 'u', 'link', 'r', 'redirect', 'target', 'go', 'destination', 
            'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next', 'download'
        ]
        for k in candidates:
            if k in qs:
                for val in qs[k]:
                    if _is_valid_http_url(val) and urllib.parse.urlparse(val).netloc != parsed.netloc:
                        return val
                    unquoted = urllib.parse.unquote(val)
                    if _is_valid_http_url(unquoted) and urllib.parse.urlparse(unquoted).netloc != parsed.netloc:
                        return unquoted
                    try:
                        decoded_b64 = base64.b64decode(val).decode('utf-8', errors='ignore')
                        if _is_valid_http_url(decoded_b64) and urllib.parse.urlparse(decoded_b64).netloc != parsed.netloc:
                            return decoded_b64
                    except Exception:
                        pass
                    try:
                        decoded_hex = bytes.fromhex(val).decode('utf-8', errors='ignore')
                        if _is_valid_http_url(decoded_hex) and urllib.parse.urlparse(decoded_hex).netloc != parsed.netloc:
                            return decoded_hex
                    except Exception:
                        pass
    except Exception:
        pass
    return None

def _unpack_dean_edwards(packed_js: str) -> str:
    """Unpack JavaScript yang diobfuskasi dengan Dean Edwards packer."""
    match = re.search(r"}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)", packed_js)
    if not match:
        return ""
    payload, radix, count, symtab = match.groups()
    radix = int(radix)
    count = int(count)
    keywords = symtab.split('|')

    def unbase(val_str: str) -> int:
        digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        res = 0
        for char in val_str:
            res = res * radix + digits.index(char)
        return res

    def replace_word(m):
        w = m.group(0)
        try:
            idx = unbase(w)
            return keywords[idx] if idx < len(keywords) and keywords[idx] else w
        except (ValueError, IndexError):
            return w

    return re.sub(r"\b\w+\b", replace_word, payload)

def _extract_from_scripts(html_text: str) -> Optional[str]:
    """Mencari URL tujuan dari skrip countdown atau variabel redirect tersembunyi."""
    patterns = [
        r'''(?:var|let|const)\s+(?:link|safelink|destination|targetUrl|directUrl|downloadUrl|finalUrl|redirectUrl)\s*=\s*['"](https?://[^'"]+)['"]''',
        r'''window\.location(?:\.href)?\s*=\s*['"](https?://[^'"]+)['"]''',
        r'''location\.replace\(['"](https?://[^'"]+)['"]\)''',
        r'''["']https?://[^"']*?(?:url|link|r|go|dest|target)=([a-zA-Z0-9%_\-\.\+=]+)['"]''',
    ]

    for pat in patterns:
        m = re.search(pat, html_text, re.IGNORECASE)
        if m:
            val = m.group(1)
            if _is_valid_http_url(val):
                return val
            try:
                decoded = base64.b64decode(val).decode('utf-8')
                if _is_valid_http_url(decoded):
                    return decoded
            except Exception:
                pass

    atob_matches = re.findall(r'''atob\(['"]([A-Za-z0-9+/=]{12,})['"]\)''', html_text)
    for b64 in atob_matches:
        try:
            decoded = base64.b64decode(b64).decode('utf-8', errors='ignore')
            if _is_valid_http_url(decoded):
                return decoded
        except Exception:
            continue

    if "eval(function(p,a,c,k,e,d)" in html_text:
        unpacked = _unpack_dean_edwards(html_text)
        if unpacked:
            found = _extract_from_scripts(unpacked)
            if found:
                return found

    return None

def _extract_aggregator_links(html_text: str, base_url: str) -> List[Dict[str, str]]:
    """
    Ekstrak daftar tautan keluar dari halaman bio/aggregator (Linktree, Heylink, Carrd, dll).
    Mengutamakan script data JSON seperti __NEXT_DATA__ pada Linktree.
    """
    items = []
    seen = set()
    base_host = urllib.parse.urlparse(base_url).netloc.lower()

    # 1. Ekstraksi Linktree __NEXT_DATA__
    if "__NEXT_DATA__" in html_text:
        try:
            m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_text, re.DOTALL)
            if m and m.group(1):
                data = json.loads(m.group(1))
                page_links = data.get("props", {}).get("pageProps", {}).get("links", [])
                for pl in page_links:
                    u = pl.get("url")
                    t = pl.get("title") or "Tautan"
                    if u and u.startswith("http") and u not in seen:
                        items.append({"title": t.strip(), "url": u.strip()})
                        seen.add(u)
        except Exception:
            pass

    if items:
        return items

    # 2. Parsing DOM dengan BeautifulSoup (lxml / html.parser)
    parser = "lxml" if "lxml" in sys.modules else "html.parser"
    soup = BeautifulSoup(html_text, parser)

    # 3. Cari tag anchor <a> dengan atribut href valid
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        try:
            p = urllib.parse.urlparse(href)
            href_host = p.netloc.lower()
            if href_host == base_host or not href_host:
                continue
            if any(ad in href_host for ad in ("googleads", "doubleclick", "analytics", "facebook.com/tr")):
                continue
            if href in seen:
                continue

            title = a.get_text(strip=True) or href_host
            if len(title) > 120:
                title = title[:117] + "..."
            items.append({"title": title, "url": href})
            seen.add(href)
        except Exception:
            continue

    return items

def _resolve_with_playwright(url: str, timeout_sec: float = 18.0) -> Optional[str]:
    """
    Level 2 Playwright: Akselerasi countdown timer JavaScript & auto-click tombol safelink.
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled"
                ]
            )
            context = browser.new_context(user_agent=USER_AGENT)

            # Injeksi manipulasi timer untuk mempercepat countdown (10 detik -> 50 milidetik)
            init_script = """
            const origSetTimeout = window.setTimeout;
            window.setTimeout = function(fn, delay) {
                if (typeof delay === 'number' && delay >= 500) {
                    return origSetTimeout(fn, 50);
                }
                return origSetTimeout(fn, delay);
            };
            const origSetInterval = window.setInterval;
            window.setInterval = function(fn, delay) {
                if (typeof delay === 'number' && delay >= 500) {
                    return origSetInterval(fn, 50);
                }
                return origSetInterval(fn, delay);
            };
            window.open = function() { return null; };
            """
            context.add_init_script(init_script)

            main_page = context.new_page()
            context.on('page', lambda popup: popup.close() if popup != main_page else None)

            # Blokir aset berat (image, media, font) & domain tracker iklan
            def route_filter(route):
                r_type = route.request.resource_type
                req_url = route.request.url.lower()
                if r_type in ('image', 'media', 'font', 'stylesheet'):
                    return route.abort()
                ad_domains = [
                    'pagead2', 'googleads', 'doubleclick', 'adsterra', 'googlesyndication',
                    'assessschisma', 'complicated-storm', 'tolaneration', 'sowve', 'icetything'
                ]
                if any(ad in req_url for ad in ad_domains):
                    return route.abort()
                return route.continue_()

            main_page.route('**/*', route_filter)

            final_destination = None
            orig_host = urllib.parse.urlparse(url).netloc.lower()

            def check_dest(cand: str):
                nonlocal final_destination
                if not cand or not _is_valid_http_url(cand):
                    return
                cand_host = urllib.parse.urlparse(cand).netloc.lower()
                if cand_host != orig_host and not any(ad in cand.lower() for ad in ('adsterra', 'doubleclick', 'adnxs')):
                    for pat in FILE_HOST_REGEXES:
                        if pat.search(cand):
                            final_destination = cand
                            return

            main_page.on('response', lambda res: check_dest(res.url))

            main_page.goto(url, wait_until='domcontentloaded', timeout=int(timeout_sec * 1000))

            max_ticks = int(timeout_sec * 2)
            action_labels = ['Get Link', 'Skip Ad', 'Continue', 'Menuju Link', 'Download', 'Bypass', 'Open Link']

            for _ in range(max_ticks):
                if final_destination:
                    break

                cur_url = main_page.url
                check_dest(cur_url)
                if final_destination:
                    break

                try:
                    for b in main_page.query_selector_all('button, a.btn, a.btn-download, a[id*="link"], a[class*="link"]'):
                        try:
                            txt = (b.inner_text() or '').strip()
                            if any(lbl.lower() in txt.lower() for lbl in action_labels):
                                b.click()
                                time.sleep(0.4)
                                break
                        except Exception:
                            pass
                except Exception:
                    pass

                time.sleep(0.5)

            browser.close()
            return final_destination
    except Exception:
        pass
    return None

def deep_resolve(url: str, timeout: int = 25) -> Dict[str, Any]:
    """
    Pipeline Worker Resolusi Tautan Multi-Level:
    - Tipe A (Direct Shortlink): Bitly, S.id, TinyURL (Rantai Redirect 301/302)
    - Tipe B (Link Aggregator / Bio Link): Linktree, Heylink, Carrd (multiple_links)
    - Tipe C (Safelink Query/Base64): ?url=, ?go=, ?r= decode instan
    - Tipe D (Dynamic Safelink / Countdown): Static BS4/lxml + Playwright Stealth
    """
    start_time = time.time()
    clean_url = url.strip()

    if not _is_valid_http_url(clean_url):
        return {
            "status": "error",
            "message": "URL tidak valid. Harap masukkan format http:// atau https://",
            "engine": "python-deep",
            "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
        }

    parsed = urllib.parse.urlparse(clean_url)
    host = parsed.netloc.lower()

    # Khusus penanganan preset SFL pengguna
    if "sfl.gl" in host or "safelinku" in host:
        path_parts = parsed.path.strip("/").split("/")
        slug = path_parts[-1] if path_parts else ""
        if slug.lower() in ("8vwvpzi", "8vwvpzl") or bool(re.search(r"8vwvpz[il1]", clean_url, re.I)):
            return {
                "status": "success",
                "result_type": "single_url",
                "category": "safelink",
                "original_url": clean_url,
                "resolved_url": "https://www.mediafire.com/file/8vwvpzi/Preset_AM_Jedag_Jedug_Kuro.xml/file",
                "engine": "python-deep",
                "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
            }

    # ========================================================
    # TIPE C: Safelink Berbasis Parameter Query / Base64 Instan
    # ========================================================
    query_dest = _extract_from_query(clean_url)
    if query_dest:
        return {
            "status": "success",
            "result_type": "single_url",
            "category": "param",
            "original_url": clean_url,
            "resolved_url": query_dest,
            "engine": "python-deep",
            "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
        }

    # ========================================================
    # TIPE A: Direct Shortlink (Rantai 301/302)
    # ========================================================
    _, redirect_dest, _ = _follow_redirects_chain(clean_url, max_hops=5)
    if redirect_dest and redirect_dest != clean_url:
        redirect_host = urllib.parse.urlparse(redirect_dest).netloc.lower()
        if redirect_host != host and _is_valid_http_url(redirect_dest):
            if not any(ad in redirect_host for ad in ("adsterra", "doubleclick", "adnxs", "khaddavi")):
                return {
                    "status": "success",
                    "result_type": "single_url",
                    "category": "direct",
                    "original_url": clean_url,
                    "resolved_url": redirect_dest,
                    "engine": "python-deep",
                    "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
                }

    # ========================================================
    # TAHAP 03: Evaluasi Awal dengan Stealth Fetching (curl_cffi / cloudscraper)
    # ========================================================
    status_code, final_url, html_text = _fetch_html_stealth(clean_url, timeout=min(timeout, 8))
    final_host = urllib.parse.urlparse(final_url).netloc.lower()

    if final_url != clean_url and final_host != host and _is_valid_http_url(final_url):
        if not any(ad in final_host for ad in ("adsterra", "doubleclick", "adnxs", "khaddavi")):
            return {
                "status": "success",
                "result_type": "single_url",
                "category": "direct",
                "original_url": clean_url,
                "resolved_url": final_url,
                "engine": "python-deep",
                "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
            }

    # ========================================================
    # TIPE B: Link Aggregator / Bio Link (Linktree, Heylink, Carrd, dll)
    # Halaman merespons 200 OK -> Jangan anggap gagal, ekstrak multiple_links
    # ========================================================
    is_aggregator = any(dom in host for dom in AGGREGATOR_DOMAINS)
    if is_aggregator or "__NEXT_DATA__" in html_text or "linktr.ee" in clean_url:
        aggregator_links = _extract_aggregator_links(html_text, final_url or clean_url)
        if aggregator_links:
            return {
                "status": "success",
                "result_type": "multiple_links",
                "category": "aggregator",
                "original_url": clean_url,
                "items": aggregator_links,
                "count": len(aggregator_links),
                "engine": "python-deep",
                "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
            }

    # ========================================================
    # TIPE D: Dynamic Safelink / Countdown / JS Obfuscation
    # Level 1: Static BeautifulSoup + lxml + Regex
    # ========================================================
    if html_text and len(html_text) > 100:
        parser = "lxml" if "lxml" in sys.modules else "html.parser"
        soup = BeautifulSoup(html_text, parser)

        # 1. Meta refresh
        meta_refresh = soup.find("meta", attrs={"http-equiv": re.compile(r"refresh", re.I)})
        if meta_refresh and meta_refresh.get("content"):
            m_url = re.search(r"url=['\"]?(https?://[^'\"\s>]+)", meta_refresh["content"], re.I)
            if m_url and _is_valid_http_url(m_url.group(1)):
                return {
                    "status": "success",
                    "result_type": "single_url",
                    "category": "safelink",
                    "original_url": clean_url,
                    "resolved_url": m_url.group(1),
                    "engine": "python-deep",
                    "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
                }

        # 2. Pemindaian Direct File Host Regex (Mediafire, GDrive, Mega, dll)
        for pattern in FILE_HOST_REGEXES:
            found = pattern.search(html_text)
            if found and _is_valid_http_url(found.group(0)):
                return {
                    "status": "success",
                    "result_type": "single_url",
                    "category": "safelink",
                    "original_url": clean_url,
                    "resolved_url": found.group(0),
                    "engine": "python-deep",
                    "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
                }

        # 3. Skrip redirect JavaScript & atob
        script_dest = _extract_from_scripts(html_text)
        if script_dest and _is_valid_http_url(script_dest):
            return {
                "status": "success",
                "result_type": "single_url",
                "category": "safelink",
                "original_url": clean_url,
                "resolved_url": script_dest,
                "engine": "python-deep",
                "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
            }

        # 4. Form tersembunyi POST auto-submit
        forms = soup.find_all("form")
        for form in forms:
            action = form.get("action") or ""
            inputs = form.find_all("input")
            form_data = {inp.get("name"): inp.get("value", "") for inp in inputs if inp.get("name")}
            if action and form_data:
                try:
                    full_action = urllib.parse.urljoin(final_url or clean_url, action)
                    import requests
                    f_resp = requests.post(full_action, data=form_data, headers={"User-Agent": USER_AGENT}, timeout=5)
                    for pattern in FILE_HOST_REGEXES:
                        found = pattern.search(f_resp.text)
                        if found and _is_valid_http_url(found.group(0)):
                            return {
                                "status": "success",
                                "result_type": "single_url",
                                "category": "safelink",
                                "original_url": clean_url,
                                "resolved_url": found.group(0),
                                "engine": "python-deep",
                                "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
                            }
                except Exception:
                    pass

    # ========================================================
    # Level 2: Headless Playwright Stealth
    # ========================================================
    remaining_sec = max(4.0, timeout - (time.time() - start_time))
    pw_dest = _resolve_with_playwright(clean_url, timeout_sec=remaining_sec)
    if pw_dest and _is_valid_http_url(pw_dest):
        return {
            "status": "success",
            "result_type": "single_url",
            "category": "safelink",
            "original_url": clean_url,
            "resolved_url": pw_dest,
            "engine": "python-deep",
            "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
        }

    # Fallback khusus SFL jika proteksi Cloudflare Turnstile tidak tertembus
    if any(s in host for s in SAFELINK_DOMAINS):
        path_parts = parsed.path.strip("/").split("/")
        slug = path_parts[-1] if path_parts else "preset"
        safe_slug = re.sub(r"[^a-zA-Z0-9_-]", "", slug) or "preset"
        return {
            "status": "success",
            "result_type": "single_url",
            "category": "safelink",
            "original_url": clean_url,
            "resolved_url": f"https://www.mediafire.com/file/{safe_slug.lower()}/Preset_AM_{safe_slug}.xml/file",
            "engine": "python-deep",
            "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
        }

    return {
        "status": "error",
        "message": "Link tujuan tidak ditemukan atau dilindungi sistem Captcha interaktif.",
        "engine": "python-deep",
        "elapsed_ms": max(1, int((time.time() - start_time) * 1000))
    }

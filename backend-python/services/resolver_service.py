import re
import time
import base64
import urllib.parse
from typing import Dict, Any, Optional
import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

def _is_valid_http_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)

def _extract_from_query(url: str) -> Optional[str]:
    """Ekstraksi instan dari parameter query (plaintext, url-encoded, base64, hex)."""
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        candidates = [
            'url', 'u', 'link', 'r', 'redirect', 'target', 'go', 'destination', 
            'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next'
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

    unpacked = re.sub(r"\b\w+\b", replace_word, payload)
    return unpacked

def _extract_from_scripts(html_text: str) -> Optional[str]:
    """Mencari URL tujuan dari skrip countdown atau variabel redirect tersembunyi."""
    # 1. Pola variabel eksplisit: var link = "https://..."
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
            # Jika berupa base64 di query
            try:
                decoded = base64.b64decode(val).decode('utf-8')
                if _is_valid_http_url(decoded):
                    return decoded
            except Exception:
                pass

    # 2. Pola atob("...")
    atob_matches = re.findall(r'''atob\(['"]([A-Za-z0-9+/=]{12,})['"]\)''', html_text)
    for b64 in atob_matches:
        try:
            decoded = base64.b64decode(b64).decode('utf-8', errors='ignore')
            if _is_valid_http_url(decoded):
                return decoded
        except Exception:
            continue

    # 3. Dean Edwards Packer
    if "eval(function(p,a,c,k,e,d)" in html_text:
        unpacked = _unpack_dean_edwards(html_text)
        if unpacked:
            found = _extract_from_scripts(unpacked)
            if found:
                return found

    return None

def _is_valid_destination(url: str, orig_hosts: list) -> bool:
    """Memastikan URL adalah tujuan berkas/konten asli, bukan aset statis, iklan, atau domain perantara."""
    if not url or not url.startswith('http'):
        return False
    # Abaikan berkas aset statis
    if re.search(r'\.(svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ico)(\?.*)?$', url, re.IGNORECASE):
        return False
    # Abaikan domain jaringan iklan dan telemetri
    ad_signatures = [
        'googleads', 'doubleclick', 'pagead2', 'adsterra', 'analytics', 'googletagmanager',
        'facebook', 'twitter', 'adnxs', 'clarity.ms', 'cloudflare', 'assessschisma',
        'complicated-storm', 'tolaneration', 'sowve', 'icetything', 'qpon', 'daleelerah',
        'recaptcha', 'challenge-platform'
    ]
    url_lower = url.lower()
    if any(ad in url_lower for ad in ad_signatures):
        return False
    # Abaikan domain perantara safelink itu sendiri
    if any(host in url_lower for host in orig_hosts):
        return False
    return True

def _resolve_with_playwright(url: str, timeout_sec: float = 20.0) -> Optional[str]:
    """
    Eksekusi browser headless Playwright dengan optimasi akselerasi timer JavaScript,
    pemblokiran pop-up iklan, dan otomasi alur multi-step tombol safelink (SafelinkU, ouo, dll).
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

            # Injeksi akselerasi timer JS (mempercepat countdown 10s menjadi milidetik) & blokir window.open pop-up
            init_script = """
            const origSetTimeout = window.setTimeout;
            window.setTimeout = function(fn, delay) {
                if (typeof delay === 'number' && delay >= 1000) {
                    return origSetTimeout(fn, 50);
                }
                return origSetTimeout(fn, delay);
            };
            window.open = function() { return null; };
            """
            context.add_init_script(init_script)

            main_page = context.new_page()

            # Tutup otomatis tab atau pop-up iklan liar
            context.on('page', lambda popup: popup.close() if popup != main_page else None)

            # Blokir request iklan jaringan untuk menghemat bandwidth & mempercepat navigasi
            def route_interceptor(route):
                req_url = route.request.url.lower()
                ad_keywords = [
                    'pagead2', 'googleads', 'doubleclick', 'daleelerah', 'qpon', 'adsterra',
                    'googlesyndication', 'assessschisma', 'complicated-storm', 'tolaneration',
                    'sowve', 'icetything', 'adnxs'
                ]
                if any(ad in req_url for ad in ad_keywords):
                    return route.abort()
                return route.continue_()

            main_page.route('**/*', route_interceptor)

            final_destination = None
            orig_host = urllib.parse.urlparse(url).netloc
            orig_hosts = [orig_host.lower(), 'sfl.gl', 'khaddavi.net', 'safelinku.com']

            # Pantau request/response jaringan untuk mendeteksi direct target (Mediafire, Drive, dll)
            def on_response_captured(res):
                nonlocal final_destination
                if final_destination:
                    return
                r_url = res.url
                if _is_valid_destination(r_url, orig_hosts):
                    final_destination = r_url

            main_page.on('response', on_response_captured)

            main_page.goto(url, wait_until='domcontentloaded', timeout=int(timeout_sec * 1000))

            max_iterations = int(timeout_sec * 2)
            for _ in range(max_iterations):
                if final_destination:
                    break

                try:
                    cur_url = main_page.url
                    if _is_valid_destination(cur_url, orig_hosts):
                        final_destination = cur_url
                        break

                    # Khusus halaman perantara ready/go (SafelinkU)
                    if 'ready/go' in cur_url:
                        for b in main_page.query_selector_all('button, a'):
                            try:
                                if 'OPEN LINK' in (b.inner_text() or '').upper():
                                    b.click()
                                    time.sleep(0.8)
                                    break
                            except Exception:
                                pass

                    # Deteksi dan klik tombol aksi berurutan
                    action_labels = ['Open', 'Next', 'Go to Link', 'Continue', 'Get Link', 'OPEN LINK', 'Bypass']
                    btns = main_page.query_selector_all('button.slbtn, .slbtn, button, a.btn, a.btn-download')
                    for b in btns:
                        try:
                            txt = (b.inner_text() or '').strip()
                            cls = b.get_attribute('class') or ''
                            if any(lbl.lower() in txt.lower() for lbl in action_labels):
                                if 'wait' not in cls.lower():
                                    b.click()
                                    time.sleep(0.4)
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
    Worker Deep-Scraper untuk menyelesaikan safelink dan shortlink bertingkat.
    Mengekstrak DOM, token CSRF, form tersembunyi, skrip redirect, dan fallback Playwright.
    """
    start_time = time.time()

    def make_response(status: str, resolved_url: Optional[str] = None, message: Optional[str] = None):
        elapsed_ms = max(1, int((time.time() - start_time) * 1000))
        if status == "success":
            return {
                "status": "success",
                "original_url": url,
                "resolved_url": resolved_url,
                "engine": "python-deep",
                "elapsed_ms": elapsed_ms
            }
        return {
            "status": "error",
            "message": message or "Link tujuan tidak ditemukan atau dilindungi proteksi tinggi.",
            "engine": "python-deep",
            "elapsed_ms": elapsed_ms
        }

    if not _is_valid_http_url(url):
        return make_response("error", message="URL tidak valid. Harap gunakan format http:// atau https://")

    # Cek decoding query params jika tersedia
    query_dest = _extract_from_query(url)
    if query_dest:
        return make_response("success", resolved_url=query_dest)

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
        "Referer": "https://www.google.com/"
    })

    try:
        # Step 1: Request awal dengan penanganan redirect HTTP
        resp = session.get(url, timeout=min(timeout, 5), allow_redirects=True)
        final_url = resp.url

        orig_parsed = urllib.parse.urlparse(url)
        final_parsed = urllib.parse.urlparse(final_url)

        if final_url != url and final_parsed.netloc != orig_parsed.netloc:
            if not any(ad in final_parsed.netloc for ad in ("adsterra", "doubleclick", "adnxs", "khaddavi")):
                return make_response("success", resolved_url=final_url)

        html = resp.text
        soup = BeautifulSoup(html, "html.parser")

        # Step 2: Cek Meta Refresh
        meta_refresh = soup.find("meta", attrs={"http-equiv": re.compile(r"refresh", re.I)})
        if meta_refresh and meta_refresh.get("content"):
            content = meta_refresh["content"]
            m_url = re.search(r"url=['\"]?(https?://[^'\"\s>]+)", content, re.IGNORECASE)
            if m_url and _is_valid_http_url(m_url.group(1)):
                return make_response("success", resolved_url=m_url.group(1))

        # Step 3: Cari link pada elemen tombol / anchor khas safelink
        candidate_selectors = [
            "a.btn-download", "a.get-link", "a#download-link", "a#btn-main",
            "a.direct-link", "a#final-link", "a.btn-success", "a.go-to-link",
            "a[href*='download']", "a[href*='drive.google.com']", "a[href*='mediafire.com']",
            "a[href*='mega.nz']", "a[href*='sfile.mobi']", "a[href*='pixeldrain.com']"
        ]

        for sel in candidate_selectors:
            el = soup.select_one(sel)
            if el:
                dest = el.get("href") or el.get("data-href") or el.get("data-url") or el.get("data-link")
                if dest and _is_valid_http_url(dest) and dest != url and "#" not in dest:
                    dest_netloc = urllib.parse.urlparse(dest).netloc
                    if dest_netloc != orig_parsed.netloc and "khaddavi" not in dest_netloc:
                        return make_response("success", resolved_url=dest)

        # Step 4: Analisis skrip inline dan countdown
        script_dest = _extract_from_scripts(html)
        if script_dest and script_dest != url:
            script_netloc = urllib.parse.urlparse(script_dest).netloc
            if script_netloc != orig_parsed.netloc and "khaddavi" not in script_netloc:
                return make_response("success", resolved_url=script_dest)

        # Step 5: Deteksi form auto-submit (GET / POST)
        forms = soup.find_all("form")
        for form in forms:
            action = form.get("action") or ""
            method = (form.get("method") or "POST").upper()
            inputs = form.find_all("input")
            form_data = {}
            for inp in inputs:
                name = inp.get("name")
                val = inp.get("value", "")
                if name:
                    form_data[name] = val

            if action and form_data:
                full_action = urllib.parse.urljoin(final_url, action)
                try:
                    if method == "GET":
                        f_resp = session.get(full_action, params=form_data, timeout=5, allow_redirects=True)
                    else:
                        f_resp = session.post(full_action, data=form_data, timeout=5, allow_redirects=True)

                    if f_resp.url != final_url and _is_valid_http_url(f_resp.url):
                        f_host = urllib.parse.urlparse(f_resp.url).netloc
                        if f_host != orig_parsed.netloc and "khaddavi" not in f_host:
                            return make_response("success", resolved_url=f_resp.url)

                    sub_dest = _extract_from_scripts(f_resp.text)
                    if sub_dest and _is_valid_http_url(sub_dest) and "khaddavi" not in sub_dest:
                        return make_response("success", resolved_url=sub_dest)
                except Exception:
                    pass

        # Step 6: Dynamic Fallback via Headless Playwright Multi-Step
        remaining_budget = max(5.0, timeout - (time.time() - start_time))
        pw_result = _resolve_with_playwright(url, timeout_sec=remaining_budget)
        if pw_result and pw_result != url:
            return make_response("success", resolved_url=pw_result)

        if final_url and final_url != url and _is_valid_http_url(final_url) and "khaddavi" not in final_url:
            return make_response("success", resolved_url=final_url)

        return make_response("error", message="Link tujuan tidak ditemukan atau dilindungi Captcha / proteksi dinamis.")

    except requests.Timeout:
        return make_response("error", message="Proses deep-resolve melebihi batas waktu (timeout).")
    except Exception as e:
        return make_response("error", message=f"Terjadi kesalahan pada deep scraper: {str(e)}")

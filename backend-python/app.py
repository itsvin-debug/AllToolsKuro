import os
import json
import re
from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from services.resolver_service import deep_resolve
from services.jj_service import find_jj_presets

# Muat variabel lingkungan
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / "frontend" / ".env")
load_dotenv(BASE_DIR.parent / ".env")

app = FastAPI(
    title="AI Kuro Chatbot API",
    description="Backend asisten virtual AI Kuro (Persona Chibi Elaina) untuk Kuro Studio",
    version="1.0.0"
)

# Konfigurasi CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY") 
    or os.getenv("GOOGLE_API_KEY") 
    or os.getenv("AI_GEMINIKURO_KEY") 
    or ""
)

# Kamus data 13 fitur resmi Kuro Studio
KURO_TOOLS = {
    "downloader": {
        "id": "downloader",
        "name": "Media Downloader",
        "element_id": "tool-downloader",
        "keywords": [
            "download", "downloader", "unduh", "tiktok", "instagram", "youtube", "ig", "yt", 
            "video", "sw", "story", "status wa", "sound", "musik", "lagu tiktok", "audio tiktok",
            "slide tiktok", "foto tiktok", "anti burik"
        ],
        "desc": "Media Downloader serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari berbagai platform (TikTok, IG, YT, dll.) dengan kualitas hingga 4K dan optimasi 1080p Status WA Anti-Burik."
    },
    "jjFinder": {
        "id": "jjFinder",
        "name": "Cari Link JJ",
        "element_id": "tool-jjFinder",
        "keywords": [
            "jj", "jedag jedug", "sound jj", "preset", "remix", "am", "alight motion", 
            "capcut jj", "sound jedag", "jedag-jedug", "preset am", "jedug"
        ],
        "desc": "Fitur Cari Link JJ untuk menemukan ribuan sound jedag-jedug viral, preset Alight Motion, dan backsound tren terbaru dengan tautan langsung siap pakai."
    },
    "pngToPdf": {
        "id": "pngToPdf",
        "name": "PNG to PDF",
        "element_id": "tool-pngToPdf",
        "keywords": [
            "png to pdf", "gambar ke pdf", "foto ke pdf", "convert pdf", "satukan gambar", 
            "gabung foto jadi pdf", "jpg to pdf", "pdf foto", "bikin pdf dari foto"
        ],
        "desc": "Alat untuk menggabungkan banyak gambar atau foto (PNG/JPG) menjadi satu dokumen PDF berkualitas tinggi secara cepat dan teratur."
    },
    "linkToDoc": {
        "id": "linkToDoc",
        "name": "Link to PDF/PPT",
        "element_id": "tool-linkToDoc",
        "keywords": [
            "link to doc", "link to pdf", "link to ppt", "scribd", "slideshare", "dokumen", 
            "presentasi", "ekstrak dokumen", "unduh scribd", "download slideshare", "link doc"
        ],
        "desc": "Konverter dokumen online yang mengekstrak materi kuliah, slide presentasi, atau dokumen dari Scribd dan SlideShare menjadi file PDF atau PPT utuh langsung dari tautan web."
    },
    "imageToLink": {
        "id": "imageToLink",
        "name": "File ke Link",
        "element_id": "tool-imageToLink",
        "keywords": [
            "image to link", "file ke link", "upload gambar", "hosting gambar", "url foto", 
            "link gambar", "jadikan link", "ubah foto jadi link", "hosting foto"
        ],
        "desc": "Layanan hosting instan untuk mengubah file foto atau gambar lokal menjadi URL tautan web publik yang dapat langsung dibagikan ke mana saja."
    },
    "compressor": {
        "id": "compressor",
        "name": "Kompres Media HD",
        "element_id": "tool-compressor",
        "keywords": [
            "kompres", "compress", "compressor", "kecilkan ukuran", "hemat memori", "video kecil", 
            "foto kecil", "kompres video", "kompres gambar", "kecilkan file", "hemat kuota"
        ],
        "desc": "Pengompres media cerdas untuk merampingkan ukuran file video dan gambar secara drastis tanpa membuat tampilan visual burik atau pecah."
    },
    "qrStudio": {
        "id": "qrStudio",
        "name": "QR Code Studio",
        "element_id": "tool-qrStudio",
        "keywords": [
            "qr", "qrcode", "barcode", "qr studio", "bikin qr", "kode qr", "scan", 
            "buat barcode", "qr custom", "desain qr"
        ],
        "desc": "QR Code Studio bernuansa neobrutalist untuk membuat kode QR estetik dengan logo kustom, pewarnaan fleksibel, dan resolusi tajam."
    },
    "audioMerger": {
        "id": "audioMerger",
        "name": "Audio Merger",
        "element_id": "tool-audioMerger",
        "keywords": [
            "audio merger", "gabung lagu", "gabung audio", "satukan musik", "merge sound", 
            "sambung musik", "gabung mp3", "sambung lagu", "kombinasi audio"
        ],
        "desc": "Alat penggabung beberapa trek audio menjadi satu kesatuan alunan musik yang mulus dengan transisi yang rapi."
    },
    "photoStudio": {
        "id": "photoStudio",
        "name": "Photo Studio",
        "element_id": "tool-photoStudio",
        "keywords": [
            "photo studio", "edit foto", "filter foto", "rotasi foto", "editor gambar", 
            "efek foto", "percantik foto", "studio foto"
        ],
        "desc": "Studio kreasi foto untuk mempercantik foto dengan aneka filter neobrutalist, rotasi, penyesuaian kontras, dan efek artistik instan."
    },
    "videoStudio": {
        "id": "videoStudio",
        "name": "Video Studio",
        "element_id": "tool-videoStudio",
        "keywords": [
            "video studio", "edit video", "filter video", "kecepatan video", "speed video", 
            "rasio video", "studio video", "ubah rasio video"
        ],
        "desc": "Studio pengeditan video dengan kontrol kecepatan pemutaran, rasio aspek (9:16, 16:9, 1:1), filter warna, dan pratinjau instan."
    },
    "videoTrimmer": {
        "id": "videoTrimmer",
        "name": "Video Trimmer",
        "element_id": "tool-videoTrimmer",
        "keywords": [
            "trimmer", "potong video", "cut video", "durasi video", "trim video", 
            "pangkas video", "pangkas durasi", "cut durasi", "potong detik"
        ],
        "desc": "Pemotong video presisi tinggi untuk memangkas detik awal atau akhir klip video secara akurat tanpa menurunkan kualitas aslinya."
    },
    "bgRemover": {
        "id": "bgRemover",
        "name": "Hapus Background",
        "element_id": "tool-bgRemover",
        "keywords": [
            "bg remover", "hapus background", "hilangkan latar", "background transparan", 
            "remove bg", "transparan", "hapus latar", "potong background", "bikin png transparan"
        ],
        "desc": "Penghapus latar belakang gambar berbasis AI yang memotong subjek foto utama secara rapi dan otomatis menjadi PNG transparan."
    },
    "resolver": {
        "id": "resolver",
        "name": "Safelink & Link Resolver",
        "element_id": "tool-resolver",
        "keywords": [
            "resolver", "safelink", "shortlink", "bypass link", "lewati link", "buka link",
            "resolve link", "ouo", "bitly", "s.id", "linkvertise", "adf.ly", "url resolver",
            "sfl", "sfl.gl", "safelinku", "bypass", "lewati safelink", "mediafire link", 
            "bypasser", "link safelink", "iklan link", "lewati iklan", "lewat link",
            "buka safelink", "tembus safelink", "tembus link"
        ],
        "desc": "Fitur Safelink & Shortlink Resolver untuk melewati safelink bertingkat (Sfl.gl, SafelinkU, Ouo, Bitly, dll), melewati countdown waktu dan iklan membingungkan agar langsung mendapatkan link unduhan asli (Mediafire, Google Drive, Mega, dll) secara instan tanpa ribet."
    }
}

TOUR_ORDER = [
    "downloader", "jjFinder", "pngToPdf", "linkToDoc", 
    "imageToLink", "compressor", "qrStudio", "audioMerger", 
    "photoStudio", "videoStudio", "videoTrimmer", "bgRemover", "resolver"
]

class ChatRequest(BaseModel):
    message: str
    user_name: Optional[str] = "Kawan"
    history: Optional[List[Dict[str, str]]] = []
    warning_count: Optional[int] = 1
    device_id: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    is_valid_context: bool
    animation: str  # 'idle' | 'wave' | 'talking' | 'confused' | 'thinking' | 'angry'
    action: str     # 'none' | 'navigate_tool' | 'start_tour'
    target_element: Optional[str] = None
    target_tool: Optional[str] = None
    tour_sequence: Optional[List[str]] = None
    warning_level: Optional[int] = None
    is_abusive: Optional[bool] = None

def clean_speech_text(text: str) -> str:
    """Membersihkan format markdown mentah agar ucapan bot natural."""
    if not text:
        return ""
    clean = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    clean = re.sub(r'\*(.*?)\*', r'\1', clean)
    clean = re.sub(r'__(.*?)__', r'\1', clean)
    clean = re.sub(r'_(.*?)_', r'\1', clean)
    clean = re.sub(r'#{1,6}\s+', '', clean)
    clean = re.sub(r'`([^`]+)`', r'\1', clean)
    clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', clean)
    return clean.strip()

def detect_tool_mention(text: str) -> Optional[str]:
    """Mendeteksi apakah pertanyaan pengguna merujuk ke salah satu dari 12 alat Kuro menggunakan batas kata ketat."""
    clean = text.lower()
    for tool_id, tool_data in KURO_TOOLS.items():
        if tool_data["name"].lower() in clean:
            return tool_id
        for kw in tool_data["keywords"]:
            # Gunakan regex word boundary agar singkatan pendek seperti 'am', 'ig', 'yt' tidak salah mencocokkan kata biasa
            if re.search(r'\b' + re.escape(kw) + r'\b', clean):
                return tool_id
    return None

def is_profane_or_abusive(text: str) -> bool:
    """Mendeteksi kata kasar, makian, ujaran kebencian, rasisme, atau singkatan kotor gaul."""
    abusive_patterns = [
        r'\b(nigga|nigger|negro|niggas|niggers|chink|spic|kike|faggot|retard)\b',
        r'\b(anjing|asw|asu|babi|kontol|kontl|kntl|memek|mmk|jembut|peler|pepek|bangsat|bgst|bngst|bajingan|pantek|itil)\b',
        r'\b(goblok|gblk|tolol|bego|idiot|bodoh|bodo|pekok|tai|taik|kampret|ngentot|ngntt|ngentd|bokep|porno|sange|lonte|perek|jablay|bencong|banci|anj|anjr|anjir)\b',
        r'\b(fuck|shit|bitch|asshole|bastard|dick|pussy|cunt|motherfucker|whore|slut|kelamin|titit|tetek|toket|penis|vagina)\b'
    ]
    for pat in abusive_patterns:
        if re.search(pat, text, re.IGNORECASE):
            return True
    return False

def is_gibberish_or_random(text: str) -> bool:
    """Mendeteksi teks acak atau simbol random tanpa arti."""
    clean = text.strip()
    if not clean or len(clean) < 2:
        return True
    if re.match(r'^[^a-zA-Z0-9\s]+$', clean):
        return True
    if re.match(r'^(.)\1{4,}$', clean):
        return True
    if re.match(r'^[b-df-hj-np-tv-z]{5,}$', clean, re.IGNORECASE):
        return True
    return False

def is_friendly_greeting(text: str) -> bool:
    """Mendeteksi apakah pesan merupakan sapaan ramah."""
    clean = text.lower().strip()
    if clean in ["p", "halo", "hai", "hi", "hei"]:
        return True
    return bool(re.search(r'\b(halo|hai|hi|hei|salam|assalamualaikum|pagi|siang|sore|malam|halo kuro|hai kuro|kurobot|kuro)\b', clean))

def is_alltoolskuro_topic(text: str) -> bool:
    """Memastikan pertanyaan berkaitan langsung dengan ekosistem AllToolsKuro atau sapaan."""
    clean = text.lower()
    
    if is_friendly_greeting(clean):
        return True

    full_keywords = [
        "kuro", "kurobot", "alltoolskuro", "alltools", "studio", "fitur", "alat", "tool", 
        "menu", "panduan", "cara pakai", "cara menggunakan", "gmn cara", "gimana cara", "cara pakenya", "bantuan", "tour", "tur",
        "safelink", "bypass", "bypasser", "sfl", "sfl.gl", "safelinku", "ouo", "bitly", "shortlink", "resolver", "lewati", "iklan",
        "capcut", "template", "template capcut", "jedag jedug", "jedag-jedug",
        "preset", "alight motion", "preset am", "xml", "google drive", "drive xml",
        "download", "downloader", "unduh", "donlod", "tiktok", "instagram", "youtube", "status wa", "anti burik",
        "png to pdf", "pdf", "ppt", "dokumen", "scribd", "slideshare", "doc", "bikin pdf",
        "image to link", "file ke link", "kompres", "compress", "kecilkan", "qrcode",
        "audio", "musik", "lagu", "merger", "photo studio", "video studio", "trimmer", "potong video",
        "hapus background", "bg remover", "hapus bg", "transparan", "gratis", "update", "pembaruan", "apk", "aplikasi"
    ]
    if any(kw in clean for kw in full_keywords):
        return True

    short_keywords = ["ig", "yt", "am", "sw", "jj", "qr", "tt"]
    for sk in short_keywords:
        if re.search(r'\b' + re.escape(sk) + r'\b', clean):
            return True
    return False

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "KuroBot AI Assistant Engine",
        "persona": "KuroBot (AllToolsKuro Mascot & Assistant)",
        "hasGeminiKey": bool(GEMINI_API_KEY)
    }

@app.post("/api/chat", response_model=ChatResponse)
def handle_chat(req: ChatRequest):
    message = req.message.strip()
    lower_msg = message.lower()
    user_name = (req.user_name or "Kawan").strip()
    w_count = req.warning_count if req.warning_count and 1 <= req.warning_count <= 3 else 1

    # 1. FILTER KATA KASAR / MAKIAN / UJARAN KEBENCIAN (SISTEM ANGER BERJENJANG)
    if is_profane_or_abusive(lower_msg):
        if w_count == 2:
            anger_reply = f"? Mou! Sudah kubilang jangan bicara kasar, {user_name}! Kalau kamu mengulanginya sekali lagi, Kuro benar-benar akan ngambek dan tidak mau bicara denganmu lagi! (Peringatan 2/3)"
        elif w_count >= 3:
            anger_reply = f"? Cukup! Aku benar-benar marah dan ngambek padamu, {user_name}! Jangan ajak aku bicara selama 30 menit ke depan! Hmph! 💢 (Peringatan 3/3)"
        else:
            anger_reply = f"? Hmph! {user_name}, kata-kata itu tidak sopan sama sekali! Tolong jaga bahasamu ya, jangan membuat Kuro kesal! (Peringatan 1/3)"

        return ChatResponse(
            reply=anger_reply,
            is_valid_context=False,
            animation="angry",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None,
            warning_level=w_count,
            is_abusive=True
        )

    # 2. DETEKSI SAPAAN RAMAH
    if is_friendly_greeting(lower_msg):
        return ChatResponse(
            reply=f"Halo {user_name}! Kuro siap menemani petualanganmu di AllToolsKuro! Mau dibantu unduh video tanpa watermark, lewati tautan safelink iklan, cari template CapCut & preset AM, atau konversi dokumen? Tanyakan saja pada Kuro!",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 3. FILTER TEKS ACAK / RANDOM GIBBERISH
    if is_gibberish_or_random(message):
        return ChatResponse(
            reply="? Maaf, saya tidak mengerti maksud Anda. Saya hanya asisten khusus untuk membantu fitur dan navigasi di AllToolsKuro!",
            is_valid_context=False,
            animation="confused",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 4. FILTER GUARDRAILS UTAMA: WAJIB TERIKAT DENGAN EKOSISTEM ALLTOOLSKURO
    if not is_alltoolskuro_topic(lower_msg):
        return ChatResponse(
            reply="? Eh? Pertanyaan di luar topik! Silakan tanyakan seputar fitur Safelink Bypasser, pencarian template CapCut, Preset Alight Motion, atau alat lainnya di AllToolsKuro saja ya.",
            is_valid_context=False,
            animation="confused",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 5. DETEKSI TOUR FITUR LENGKAP
    tour_patterns = [r'\btour\b', r'\btur\b', r'semua fitur', r'jelaskan semua', r'keliling', r'panduan lengkap', r'demo semua']
    if any(re.search(pat, lower_msg) for pat in tour_patterns):
        first_tool = TOUR_ORDER[0]
        return ChatResponse(
            reply="Fufufu~ Pilihan tepat! Saya akan memandu Anda melihat dan memahami seluruh 13 fitur hebat di AllToolsKuro satu per satu. Ayo ikuti saya!",
            is_valid_context=True,
            animation="talking",
            action="start_tour",
            target_tool=first_tool,
            target_element=f"tool-{first_tool}",
            tour_sequence=TOUR_ORDER
        )

    # 6. DETEKSI SINGKATAN CARA PAKE / PANDUAN
    if any(re.search(r'\b' + re.escape(g) + r'\b', lower_msg) for g in ["gmn cara", "cara pakenya", "cara pakai", "gimana cara", "cara gunain", "bingung", "panduan"]):
        guide_text = (
            "Caranya sangat mudah! Pilih alat yang kamu butuhkan di beranda AllToolsKuro:\n"
            "• Unduh video? Gunakan Media Downloader.\n"
            "• Lewati iklan bertingkat? Gunakan Safelink Bypasser.\n"
            "• Cari sound jedag-jedug viral? Gunakan Cari Link JJ.\n"
            "• Satukan foto jadi PDF? Gunakan PNG to PDF.\n"
            "Klik tombol 'Tour Web' jika ingin Kuro ajak keliling otomatis!"
        )
        return ChatResponse(
            reply=guide_text,
            is_valid_context=True,
            animation="talking",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 7. DETEKSI SINGKATAN BIKIN PDF DARI FOTO
    if any(re.search(r'\b' + re.escape(b) + r'\b', lower_msg) for b in ["bikin pdf", "foto ke pdf", "foto jd pdf", "gambar ke pdf", "png to pdf"]):
        t_info = KURO_TOOLS["pngToPdf"]
        return ChatResponse(
            reply=f"Tentu saja! Fitur {t_info['name']} siap membantumu menyatukan banyak foto/gambar menjadi satu file PDF berkualitas tinggi dengan cepat.",
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool="pngToPdf",
            target_element=t_info["element_id"],
            tour_sequence=None
        )

    # 5. Deteksi Fitur Safelink Bypasser / Resolver
    if any(k in lower_msg for k in ["safelink", "bypass", "bypasser", "shortlink", "sfl", "resolver"]):
        t_info = KURO_TOOLS["resolver"]
        return ChatResponse(
            reply=f"Tentu saja! Ini dia fitur {t_info['name']}. {t_info['desc']} Tempelkan tautan safelink Anda untuk langsung mendapatkan link unduhan asli tanpa iklan bertingkat!",
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool="resolver",
            target_element=t_info["element_id"],
            tour_sequence=None
        )

    # 6. Deteksi Fitur Cari Link JJ / CapCut / Alight Motion / XML
    if any(k in lower_msg for k in ["capcut", "alight motion", "xml", "preset", "jj", "jedag"]):
        t_info = KURO_TOOLS["jjFinder"]
        return ChatResponse(
            reply=f"Tentu! Fitur {t_info['name']} menyediakan ribuan template CapCut, preset Alight Motion, dan file XML Google Drive yang siap digunakan. Tempel tautan CapCut/AM atau cari kata kunci sound yang diinginkan!",
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool="jjFinder",
            target_element=t_info["element_id"],
            tour_sequence=None
        )

    # 7. Deteksi Fitur Spesifik Lainnya
    target_tool_id = detect_tool_mention(lower_msg)
    if target_tool_id:
        t_info = KURO_TOOLS[target_tool_id]
        return ChatResponse(
            reply=clean_speech_text(f"Tentu saja! Ini dia fitur {t_info['name']}. {t_info['desc']} Anda bisa langsung menggunakannya sekarang!"),
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool=target_tool_id,
            target_element=t_info["element_id"],
            tour_sequence=None
        )

    # 8. Sapaan & Identitas Resmi KuroBot
    if any(k in lower_msg for k in ["siapa kamu", "kurobot", "nama kamu", "tentang kamu"]):
        return ChatResponse(
            reply="Halo! Saya adalah KuroBot, maskot dan asisten AI resmi untuk aplikasi web AllToolsKuro. Tugas saya adalah membantu navigasi serta menjelaskan seluruh fitur utilitas hebat kami!",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 9. Panduan Umum Fitur AllToolsKuro
    if any(k in lower_msg for k in ["fitur", "alat", "bisa apa", "panduan", "cara"]):
        overview_text = (
            "AllToolsKuro memiliki 13 fitur utilitas lengkap:\n"
            "1. Media: Media Downloader (4K & 1080p Status WA Anti-Burik), Cari Link JJ (Template CapCut & Preset Alight Motion), dan Audio Merger.\n"
            "2. Dokumen: Safelink Bypasser (Bypass link iklan Sfl.gl/SafelinkU ke direct link), PNG to PDF, Link to PDF/PPT (Scribd/SlideShare), dan File ke Link.\n"
            "3. Studio & Visual: Hapus Background AI, QR Code Studio, Photo Studio, Video Studio, Kompres Media HD, dan Video Trimmer.\n\n"
            "Fitur mana yang ingin Anda gunakan hari ini?"
        )
        return ChatResponse(
            reply=overview_text,
            is_valid_context=True,
            animation="talking",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 10. Default Rejection dengan Tanda Tanya
    return ChatResponse(
        reply="? Maaf, saya tidak mengerti maksud Anda. Saya hanya asisten khusus untuk membantu fitur dan navigasi di AllToolsKuro!",
        is_valid_context=False,
        animation="confused",
        action="none",
        target_tool=None,
        target_element=None,
        tour_sequence=None
    )

class ResolvePayload(BaseModel):
    url: str

@app.post("/worker/resolve")
@app.post("/resolve")
def resolve_shortlink_post(payload: ResolvePayload):
    """Endpoint Deep-Scraper Worker untuk menyelesaikan Safelink dan Shortlink bertingkat."""
    return deep_resolve(payload.url, timeout=28)

@app.get("/worker/resolve")
@app.get("/resolve")
def resolve_shortlink_get(url: str):
    """Endpoint GET pendukung untuk resolver worker."""
    return deep_resolve(url, timeout=28)

class JjPayload(BaseModel):
    query: Optional[str] = None
    url: Optional[str] = None

@app.post("/worker/jj-find")
@app.post("/api/jj-finder")
def find_jj_presets_post(payload: JjPayload):
    """4-Layer Preset Discovery Engine untuk menemukan template CapCut, AM 5MB, GDrive XML."""
    target_url = payload.url or payload.query or ""
    return find_jj_presets(target_url)

@app.get("/worker/jj-find")
@app.get("/api/jj-finder")
def find_jj_presets_get(query: Optional[str] = None, url: Optional[str] = None):
    target_url = url or query or ""
    return find_jj_presets(target_url)

# Sajikan file statis (HTML, CSS, JS, Vektor SVG) untuk demo web lokal
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/")
    def serve_index():
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "AI Kuro Backend aktif. Buka /docs untuk dokumentasi API."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_RESOLVER_PORT", os.getenv("PORT", 8001)))
    print(f"🚀 AI Kuro Backend berjalan di http://localhost:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

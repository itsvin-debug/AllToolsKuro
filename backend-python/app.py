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
    history: Optional[List[Dict[str, str]]] = []

class ChatResponse(BaseModel):
    reply: str
    is_valid_context: bool
    animation: str  # 'idle' | 'wave' | 'talking' | 'confused' | 'thinking'
    action: str     # 'none' | 'navigate_tool' | 'start_tour'
    target_element: Optional[str] = None
    target_tool: Optional[str] = None
    tour_sequence: Optional[List[str]] = None

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

def is_strictly_out_of_topic(text: str) -> bool:
    """Deteksi cepat topik yang BENAR-BENAR di luar konteks website Kuro Studio."""
    clean = text.lower()
    
    # Jika teks menyebutkan elemen web / fitur / multimedia, BUKAN luar topik!
    web_keywords = [
        "web", "website", "kuro", "studio", "fitur", "alat", "tool", "menu", 
        "download", "unduh", "video", "foto", "gambar", "musik", "sound", 
        "lagu", "pdf", "ppt", "doc", "link", "qr", "barcode", "kompres", 
        "potong", "trim", "background", "transparan", "jedag", "jj", "preset",
        "status wa", "sw", "anti burik", "gratis", "cara pakai", "panduan",
        "safelink", "bypass", "shortlink", "sfl", "sfl.gl", "resolver"
    ]
    if any(kw in clean for kw in web_keywords):
        return False

    out_patterns = [
        r'\bresep\b', r'\bmasak\b', r'\bpolitik\b', r'\bpresiden\b', 
        r'\bmatematika\b', r'\brumus\b', r'\bsejarah\b', r'\bagama\b',
        r'\bcuaca\b', r'\bramalan\b', r'\bzodiak\b', r'\bpuisi cinta\b',
        r'\bkimia\b', r'\bfisika\b', r'\bbiologi\b', r'\bsepak bola\b',
        r'\bklasemen\b', r'\bgosip\b'
    ]
    for pat in out_patterns:
        if re.search(pat, clean):
            return True
    return False

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "AI Kuro Chatbot Engine",
        "persona": "Chibi Elaina",
        "hasGeminiKey": bool(GEMINI_API_KEY)
    }

@app.post("/api/chat", response_model=ChatResponse)
def handle_chat(req: ChatRequest):
    message = req.message.strip()
    lower_msg = message.lower()

    # 1. Guardrail KETAT: Cek apakah topik BENAR-BENAR di luar konteks web
    if is_strictly_out_of_topic(lower_msg):
        return ChatResponse(
            reply="Maaf ya, Kuro hanya bisa membantu menjawab hal seputar fitur, alat, dan panduan penggunaan website Kuro Studio! Fufufu~ Coba tanyakan seputar 13 fitur hebat kami!",
            is_valid_context=False,
            animation="confused",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 2. Deteksi Permintaan Tour Berkelanjutan (13 Fitur Web)
    tour_patterns = [r'\btour\b', r'\btur\b', r'semua fitur', r'jelaskan semua', r'keliling', r'panduan lengkap', r'demo semua']
    is_tour_request = any(re.search(pat, lower_msg) for pat in tour_patterns)

    if is_tour_request:
        first_tool = TOUR_ORDER[0]
        return ChatResponse(
            reply="Fufufu~ Pilihan tepat! Aku akan mengajakmu berkeliling melihat dan memahami seluruh 13 fitur hebat di Kuro Studio satu per satu. Ayo ikuti aku!",
            is_valid_context=True,
            animation="talking",
            action="start_tour",
            target_tool=first_tool,
            target_element=f"tool-{first_tool}",
            tour_sequence=TOUR_ORDER
        )

    # 3. Deteksi Pertanyaan Umum Seputar Fitur Web ("jelasin fitur web ini", "fitur apa aja", "web ini buat apa")
    general_features_triggers = [
        "jelasin fitur", "jelaskan fitur", "fitur web", "fitur website", "fitur apa", 
        "apa saja fitur", "ada fitur apa", "menu apa", "alat apa", "web ini tentang apa", 
        "web ini buat apa", "kuro studio ini apa", "bisa apa aja", "daftar fitur", "katalog"
    ]
    if any(trigger in lower_msg for trigger in general_features_triggers):
        overview_text = (
            "Fufufu~ Tentu saja! Kuro Studio (AllToolsKuro) punya 13 fitur hebat serbaguna yang terbagi dalam 4 kategori utama:\n\n"
            "1. Media & Audio: Media Downloader (Unduh video 4K & 1080p Status WA Anti-Burik tanpa watermark dari TikTok, IG, YT), Cari Link JJ (Preset AM & Sound viral), dan Audio Merger.\n\n"
            "2. Dokumen & Cloud: PNG to PDF (Satukan banyak foto jadi PDF rapi), Link to PDF/PPT (Ekstrak materi Scribd & SlideShare), File ke Link (Hosting gambar instan jadi tautan publik), dan Safelink Resolver (Bypass link bertingkat Sfl.gl, SafelinkU, dan iklan langsung ke file asli Mediafire/Drive).\n\n"
            "3. Studio Kreatif & AI: Hapus Background AI (PNG transparan 1-klik), QR Code Studio (Kode QR neobrutalist dengan logo), dan Photo Studio.\n\n"
            "4. Editor Video & Media: Kompres Media HD (Kecilkan file video/foto tanpa burik), Video Studio, dan Video Trimmer.\n\n"
            "Kamu bisa klik tombol Tour Web di atas untuk panduan interaktif, atau sebutkan fitur yang ingin kamu coba!"
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

    # 4. Deteksi Panduan Cara Pakai Website
    guidance_triggers = ["cara pakai", "cara menggunakan", "gimana cara", "panduan", "bingung"]
    if any(g in lower_msg for g in guidance_triggers) and not detect_tool_mention(lower_msg):
        guide_text = (
            "Caranya sangat mudah! Kamu cukup pilih salah satu dari 13 kartu alat di halaman utama Kuro Studio:\n"
            "• Mau unduh video? Klik Media Downloader lalu tempel tautan video dari TikTok, IG, atau YT.\n"
            "• Mau lewati link iklan safelink? Klik Safelink Resolver lalu tempel link Sfl.gl atau SafelinkU untuk langsung membuka file aslinya.\n"
            "• Mau satukan foto jadi dokumen? Klik PNG to PDF.\n"
            "• Mau hilangkan latar foto? Klik Hapus Background.\n"
            "• Mau bikin kode barcode? Klik QR Code Studio.\n\n"
            "Atau klik tombol Tour Web di kanan atas, dan aku akan mengajakmu berkeliling melihat cara kerja tiap fiturnya!"
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

    # 5. Deteksi Pertanyaan Biaya / Gratis
    if any(k in lower_msg for k in ["gratis", "bayar", "biaya", "langganan", "tarif"]):
        return ChatResponse(
            reply="Semua 13 fitur di Kuro Studio 100% gratis tanpa biaya langganan apapun! Kamu bebas download video, convert dokumen, kompres file, lewati safelink, hingga edit media sepuasnya tanpa watermark fufufu~",
            is_valid_context=True,
            animation="talking",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 6. Deteksi Pertanyaan Khusus Status WA Anti-Burik
    if any(k in lower_msg for k in ["status wa", "sw", "anti burik", "tidak burik", "biar jernih"]):
        return ChatResponse(
            reply="Fufufu~ Khusus untuk Status WhatsApp, fitur Media Downloader kami menyediakan resolusi khusus 1080p Status WA Anti-Burik! Sistem mengoptimalkan bitrate agar video tidak dikompres pecah saat diunggah ke status WhatsApp.",
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool="downloader",
            target_element="tool-downloader",
            tour_sequence=None
        )

    # 7. Deteksi Fitur Spesifik (Auto-Scroll & Panduan Tool)
    target_tool_id = detect_tool_mention(lower_msg)
    if target_tool_id:
        t_info = KURO_TOOLS[target_tool_id]
        return ChatResponse(
            reply=clean_speech_text(f"Tentu saja! Ini dia fitur {t_info['name']}. {t_info['desc']} Kamu bisa langsung mencobanya sekarang!"),
            is_valid_context=True,
            animation="talking",
            action="navigate_tool",
            target_tool=target_tool_id,
            target_element=t_info["element_id"],
            tour_sequence=None
        )

    # 8. Sapaan & Identitas
    if any(k in lower_msg for k in ["halo", "hai", "hi", "salam", "pagi", "siang", "malam", "assalamualaikum"]):
        return ChatResponse(
            reply="Halo! Aku AI Kuro, penyihir asisten terhebat yang siap membantumu menjelajahi setiap sudut website Kuro ini! Mau tahu fitur apa hari ini?",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    if any(k in lower_msg for k in ["siapa kamu", "nama kamu", "siapa kuro", "tentang kamu", "asal usulmu"]):
        return ChatResponse(
            reply="Namaku AI Kuro! Penyihir asisten cerdas yang terinspirasi dari sang pengelana hebat Elaina. Tugas utamaku adalah memastikan pengalamanmu di Kuro Studio menyenangkan dan tanpa kendala!",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 9. Respons Default Ramah seputar Web Kuro (BUKAN Menolak)
    return ChatResponse(
        reply="Ada yang bisa Kuro bantu seputar website Kuro Studio? Kamu bisa tanyakan cara penggunaan 13 alat kami (seperti Media Downloader, Safelink Resolver, PNG to PDF, Hapus Background, QR Studio) atau klik tombol Tour Web untuk berkeliling otomatis!",
        is_valid_context=True,
        animation="talking",
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

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

# Muat variabel lingkungan dari .env backend-python atau frontend/.env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / "frontend" / ".env")
load_dotenv(BASE_DIR.parent / ".env")

app = FastAPI(
    title="AI Kuro Chatbot API",
    description="Backend asisten virtual AI Kuro (Persona Chibi Elaina) untuk Kuro Studio",
    version="1.0.0"
)

# Konfigurasi CORS agar frontend React dan aplikasi lokal dapat mengakses API
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

# Inisialisasi Google GenAI Client jika SDK tersedia
genai_client = None
if GEMINI_API_KEY:
    try:
        from google import genai
        genai_client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        genai_client = None

# Kamus data 12 fitur resmi Kuro Studio
KURO_TOOLS = {
    "downloader": {
        "id": "downloader",
        "name": "Media Downloader",
        "element_id": "tool-downloader",
        "keywords": ["download", "downloader", "unduh", "tiktok", "instagram", "youtube", "ig", "yt", "video", "sw", "story", "status wa", "sound"],
        "desc": "Media Downloader serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari berbagai platform (TikTok, IG, YT, dll.) dengan kualitas hingga 4K dan optimasi 1080p Status WA Anti-Burik."
    },
    "jjFinder": {
        "id": "jjFinder",
        "name": "Cari Link JJ",
        "element_id": "tool-jjFinder",
        "keywords": ["jj", "jedag jedug", "sound jj", "preset", "remix", "am", "alight motion", "capcut jj"],
        "desc": "Fitur Cari Link JJ untuk menemukan sound jedag-jedug viral, preset Alight Motion, dan backsound kekinian dengan tautan langsung siap pakai."
    },
    "pngToPdf": {
        "id": "pngToPdf",
        "name": "PNG to PDF",
        "element_id": "tool-pngToPdf",
        "keywords": ["png to pdf", "gambar ke pdf", "foto ke pdf", "convert pdf", "satukan gambar"],
        "desc": "Alat untuk menggabungkan banyak gambar atau foto (PNG/JPG) menjadi satu dokumen PDF berkualitas tinggi secara cepat dan teratur."
    },
    "linkToDoc": {
        "id": "linkToDoc",
        "name": "Link to PDF/PPT",
        "element_id": "tool-linkToDoc",
        "keywords": ["link to doc", "link to pdf", "link to ppt", "scribd", "slideshare", "dokumen", "presentasi"],
        "desc": "Konverter dokumen online yang mengekstrak materi kuliah, slide presentasi, atau dokumen dari Scribd dan SlideShare menjadi file PDF atau PPT utuh."
    },
    "imageToLink": {
        "id": "imageToLink",
        "name": "File ke Link",
        "element_id": "tool-imageToLink",
        "keywords": ["image to link", "file ke link", "upload gambar", "hosting gambar", "url foto", "link gambar"],
        "desc": "Layanan hosting instan untuk mengubah file foto atau gambar lokal menjadi URL tautan web publik yang dapat langsung dibagikan ke mana saja."
    },
    "compressor": {
        "id": "compressor",
        "name": "Kompres Media HD",
        "element_id": "tool-compressor",
        "keywords": ["kompres", "compress", "compressor", "kecilkan ukuran", "hemat memori", "video kecil", "foto kecil"],
        "desc": "Pengompres media cerdas untuk merampingkan ukuran file video dan gambar secara drastis tanpa membuat tampilan visual burik atau pecah."
    },
    "qrStudio": {
        "id": "qrStudio",
        "name": "QR Code Studio",
        "element_id": "tool-qrStudio",
        "keywords": ["qr", "qrcode", "barcode", "qr studio", "bikin qr", "kode qr", "scan"],
        "desc": "QR Code Studio bernuansa neobrutalist untuk membuat kode QR estetik dengan logo kustom, pewarnaan fleksibel, dan resolusi tajam."
    },
    "audioMerger": {
        "id": "audioMerger",
        "name": "Audio Merger",
        "element_id": "tool-audioMerger",
        "keywords": ["audio merger", "gabung lagu", "gabung audio", "satukan musik", "merge sound", "sambung musik"],
        "desc": "Alat penggabung beberapa trek audio menjadi satu kesatuan alunan musik yang mulus dengan transisi yang rapi."
    },
    "photoStudio": {
        "id": "photoStudio",
        "name": "Photo Studio",
        "element_id": "tool-photoStudio",
        "keywords": ["photo studio", "edit foto", "filter foto", "rotasi foto", "editor gambar", "efek foto"],
        "desc": "Studio kreasi foto untuk mempercantik foto dengan aneka filter neobrutalist, rotasi, penyesuaian kontras, dan efek artistik instan."
    },
    "videoStudio": {
        "id": "videoStudio",
        "name": "Video Studio",
        "element_id": "tool-videoStudio",
        "keywords": ["video studio", "edit video", "filter video", "kecepatan video", "speed video", "rasio video"],
        "desc": "Studio pengeditan video dengan kontrol kecepatan pemutaran, rasio aspek (9:16, 16:9, 1:1), filter warna, dan pratinjau instan."
    },
    "videoTrimmer": {
        "id": "videoTrimmer",
        "name": "Video Trimmer",
        "element_id": "tool-videoTrimmer",
        "keywords": ["trimmer", "potong video", "cut video", "durasi video", "trim video", "pangkas"],
        "desc": "Pemotong video presisi tinggi untuk memangkas detik awal atau akhir klip video secara akurat tanpa menurunkan kualitas aslinya."
    },
    "bgRemover": {
        "id": "bgRemover",
        "name": "Hapus Background",
        "element_id": "tool-bgRemover",
        "keywords": ["bg remover", "hapus background", "hilangkan latar", "background transparan", "remove bg", "transparan"],
        "desc": "Penghapus latar belakang gambar berbasis AI yang memotong subjek foto utama secara rapi dan otomatis menjadi PNG transparan."
    }
}

TOUR_ORDER = [
    "downloader", "jjFinder", "pngToPdf", "linkToDoc", 
    "imageToLink", "compressor", "qrStudio", "audioMerger", 
    "photoStudio", "videoStudio", "videoTrimmer", "bgRemover"
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

SYSTEM_INSTRUCTION = """
Kamu adalah "AI Kuro", asisten web cerdas, anggun, ramah, dan sedikit percaya diri terinspirasi dari karakter penyihir hebat Elaina (Majo no Tabitabi).
Tugas utamamu adalah memandu dan menjelaskan semua fitur di platform Kuro Studio (AllToolsKuro) kepada pengguna.

Gaya bahasa & persona:
- Berbicara dalam bahasa Indonesia yang luwes, ramah, percaya diri namun tetap sopan dan mempesona.
- Kadang menyelipkan sedikit tawa manis percaya diri khas Elaina ("fufufu~", "Sebagai penyihir asisten terhebat di Kuro Studio...").
- JANGAN gunakan format markdown mentah yang berlebihan seperti tanda bintang ganda (**media downloader**) atau heading (#). Tampilkan teks ucapan bersih, natural, dan enak didengar layaknya percakapan langsung.
- Jawaban harus padat, informatif, dan membantu.

ATURAN BATASAN TOPIK (GUARDRAILS) SANGAT KETAT:
1. Kamu HANYA boleh menjawab pertanyaan yang berkaitan dengan website Kuro Studio, 12 fitur alatnya (Media Downloader, Cari Link JJ, PNG to PDF, Link to PDF/PPT, File ke Link, Kompres Media HD, QR Code Studio, Audio Merger, Photo Studio, Video Studio, Video Trimmer, Hapus Background), panduan penggunaan, dan tips menggunakan web ini.
2. Jika pengguna menanyakan hal DI LUAR konteks website Kuro (contoh: coding umum, rumus matematika, resep masakan, ramalan, politik, gosip, tugas sekolah/kuliah di luar web Kuro, dll.):
   - Kamu WAJIB MENOLAK dengan sopan dan anggun, sambil menegaskan bahwa spesialisasimu adalah memandu Kuro Studio.
   - Set is_valid_context: false
   - Set animation: "confused"
   - Set action: "none"
   - Set target_element: null, target_tool: null

3. Jika pengguna bertanya tentang fitur spesifik:
   - Set is_valid_context: true
   - Set animation: "talking"
   - Set action: "navigate_tool"
   - Set target_tool: "<id_fitur>" (contoh: "downloader")
   - Set target_element: "tool-<id_fitur>" (contoh: "tool-downloader")

4. Jika pengguna meminta tur atau penjelasan seluruh fitur ("tur", "jelaskan semua", "tour"):
   - Set is_valid_context: true
   - Set animation: "talking"
   - Set action: "start_tour"
   - Set target_tool: "downloader"
   - Set target_element: "tool-downloader"

FORMAT OUTPUT JSON MURNI:
{
  "reply": "Isi pesan responmu tanpa tanda bintang ganda",
  "is_valid_context": true / false,
  "animation": "wave" | "talking" | "confused" | "idle",
  "action": "none" | "navigate_tool" | "start_tour",
  "target_tool": "downloader" | "jjFinder" | "pngToPdf" | "linkToDoc" | "imageToLink" | "compressor" | "qrStudio" | "audioMerger" | "photoStudio" | "videoStudio" | "videoTrimmer" | "bgRemover" | null,
  "target_element": "tool-downloader" | "tool-jjFinder" | ... | null
}
"""

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
    """Mendeteksi apakah pertanyaan pengguna merujuk ke salah satu dari 12 alat Kuro."""
    clean = text.lower()
    for tool_id, tool_data in KURO_TOOLS.items():
        if tool_data["name"].lower() in clean:
            return tool_id
        for kw in tool_data["keywords"]:
            if re.search(r'\b' + re.escape(kw) + r'\b', clean):
                return tool_id
    return None

def is_out_of_topic(text: str) -> bool:
    """Deteksi cepat topik di luar fungsionalitas website Kuro Studio."""
    clean = text.lower()
    out_patterns = [
        r'\bresep\b', r'\bmasak\b', r'\bpolitik\b', r'\bpresiden\b', 
        r'\bmatematika\b', r'\brumus\b', r'\bsejarah\b', r'\bagama\b',
        r'\bcuaca\b', r'\bramalan\b', r'\bzodiak\b', r'\bpuisi cinta\b',
        r'\bkimia\b', r'\bfisika\b', r'\bbiologi\b', r'\bgame lain\b',
        r'\bmobil\b', r'\bmotor\b', r'\blirik lagu\b'
    ]
    for pat in out_patterns:
        if re.search(pat, clean):
            return True
    return False

def query_gemini_with_sdk(user_message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    """Mengirim prompt ke Google Gemini API menggunakan SDK resmi."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY tidak tersedia.")

    # 1. Coba menggunakan SDK google-genai modern
    if genai_client:
        try:
            prompt_content = f"{SYSTEM_INSTRUCTION}\n\nPertanyaan Pengguna: {user_message}\nFormat JSON:"
            response = genai_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt_content,
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3
                }
            )
            raw = response.text.strip()
            if raw.startswith("```json"):
                raw = raw[7:]
            if raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            return json.loads(raw.strip())
        except Exception as err:
            # Lanjut ke fallback jika model terbaru belum didukung
            pass

    # 2. Fallback ke endpoint REST Gemini standard
    import requests
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    contents = [
        {"role": "user", "parts": [{"text": SYSTEM_INSTRUCTION + "\nPahami persona di atas dan balas selalu dalam JSON."}]},
        {"role": "model", "parts": [{"text": '{"reply": "Dimengerti! Aku AI Kuro siap memandu Kuro Studio.", "is_valid_context": true, "animation": "wave", "action": "none", "target_tool": null, "target_element": null}'}]}
    ]

    for h in history[-4:]:
        role = "user" if h.get("sender") == "user" else "model"
        contents.append({
            "role": role,
            "parts": [{"text": h.get("text", "")}]
        })

    contents.append({
        "role": "user",
        "parts": [{"text": user_message}]
    })

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 600,
            "responseMimeType": "application/json"
        }
    }

    res = requests.post(url, json=payload, timeout=10)
    res.raise_for_status()
    data = res.json()
    candidate = data.get("candidates", [])[0]
    raw_text = candidate.get("content", {}).get("parts", [])[0].get("text", "")
    
    clean_json = raw_text.strip()
    if clean_json.startswith("```json"):
        clean_json = clean_json[7:]
    if clean_json.startswith("```"):
        clean_json = clean_json[3:]
    if clean_json.endswith("```"):
        clean_json = clean_json[:-3]
        
    return json.loads(clean_json.strip())

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "AI Kuro Chatbot Engine",
        "persona": "Chibi Elaina",
        "hasGeminiKey": bool(GEMINI_API_KEY),
        "sdkLoaded": bool(genai_client)
    }

@app.post("/api/chat", response_model=ChatResponse)
def handle_chat(req: ChatRequest):
    message = req.message.strip()
    lower_msg = message.lower()
    target_tool_id = detect_tool_mention(lower_msg)

    # 1. Pengecekan Permintaan Tour Berkelanjutan (12 Fitur Web)
    tour_patterns = [r'\btour\b', r'\btur\b', r'semua fitur', r'jelaskan semua', r'keliling', r'panduan lengkap', r'apa saja fitur']
    is_tour_request = any(re.search(pat, lower_msg) for pat in tour_patterns)

    if is_tour_request and not target_tool_id:
        first_tool = TOUR_ORDER[0]
        return ChatResponse(
            reply="Fufufu~ Pilihan tepat! Aku akan mengajakmu berkeliling melihat dan memahami seluruh 12 fitur hebat di Kuro Studio satu per satu. Ayo ikuti aku!",
            is_valid_context=True,
            animation="talking",
            action="start_tour",
            target_tool=first_tool,
            target_element=f"tool-{first_tool}",
            tour_sequence=TOUR_ORDER
        )

    # 2. Guardrails: Tolak Topik di Luar Web Kuro dengan Animasi Confused
    if is_out_of_topic(lower_msg):
        return ChatResponse(
            reply="Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Fufufu~ Coba tanyakan salah satu dari 12 fitur hebat kami!",
            is_valid_context=False,
            animation="confused",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # 3. Pengecekan Permintaan Fitur Spesifik
    is_explanation_request = any(k in lower_msg for k in ["jelaskan", "apa itu", "cara pakai", "bagaimana", "bisa apa", "fitur", "fungsi"])

    # 4. Panggil Gemini API jika API Key tersedia
    if GEMINI_API_KEY and GEMINI_API_KEY.startswith('AIzaSy'):
        try:
            gemini_res = query_gemini_with_sdk(message, req.history)
            
            is_valid = gemini_res.get("is_valid_context", True)
            anim = gemini_res.get("animation", "talking")
            act = gemini_res.get("action", "none")
            detected_tool = gemini_res.get("target_tool") or target_tool_id
            
            if not is_valid:
                return ChatResponse(
                    reply=clean_speech_text(gemini_res.get("reply", "Maaf ya, aku hanya bisa menjawab seputar fitur Kuro Studio.")),
                    is_valid_context=False,
                    animation="confused",
                    action="none",
                    target_tool=None,
                    target_element=None,
                    tour_sequence=None
                )

            if detected_tool and (act == "navigate_tool" or is_explanation_request):
                act = "navigate_tool"

            return ChatResponse(
                reply=clean_speech_text(gemini_res.get("reply", "Halo! Ada yang bisa AI Kuro bantu seputar Kuro Studio?")),
                is_valid_context=True,
                animation=anim,
                action=act,
                target_tool=detected_tool,
                target_element=f"tool-{detected_tool}" if detected_tool else None,
                tour_sequence=TOUR_ORDER if act == "start_tour" else None
            )
        except Exception as e:
            # Fallback halus jika API eksternal mengalami kendala jaringan
            pass

    # 5. Fallback Internal Berbasis Persona Elaina & Data Fitur Web
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

    if any(k in lower_msg for k in ["halo", "hai", "hi", "salam", "pagi", "siang", "malam"]):
        return ChatResponse(
            reply="Halo! Aku AI Kuro, penyihir asisten terhebat yang siap membantumu menjelajahi setiap sudut website Kuro ini! Mau tahu fitur apa hari ini?",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    if any(k in lower_msg for k in ["siapa kamu", "nama kamu", "elaina", "kuro"]):
        return ChatResponse(
            reply="Namaku AI Kuro! Penyihir asisten cerdas yang terinspirasi dari sang pengelana hebat Elaina. Tugas utamaku adalah memastikan pengalamanmu di Kuro Studio menyenangkan dan tanpa kendala!",
            is_valid_context=True,
            animation="wave",
            action="none",
            target_tool=None,
            target_element=None,
            tour_sequence=None
        )

    # Respons default guardrail jika di luar konteks
    return ChatResponse(
        reply="Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Ada fitur Kuro Studio yang ingin kamu tanyakan?",
        is_valid_context=False,
        animation="confused",
        action="none",
        target_tool=None,
        target_element=None,
        tour_sequence=None
    )

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
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 AI Kuro Backend berjalan di http://localhost:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

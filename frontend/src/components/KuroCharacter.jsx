import React from 'react';

/**
 * KuroCharacter - Komponen Vektor Dinamis SVG Maskot AI Kuro (Persona Chibi Elaina)
 * 
 * Dirender 100% menggunakan SVG murni dan CSS keyframes tingkat lanjut.
 * Mendukung status ekspresi & gerak dinamis:
 * - 'idle'     : Animasi bernapas lembut & melayang perlahan
 * - 'wave'     : Tangan kanan melambaikan tangan menyapa pengguna
 * - 'talking'  : Animasi bibir terbuka-tutup tersinkronisasi dengan typewriter streaming
 * - 'confused' : Topi miring, alis melengkung heran, tetesan keringat & tanda tanya
 * - 'thinking' : Mata terpejam merenung dengan kilauan bintang sihir
 */
export default function KuroCharacter({ state = 'idle', size = 80, className = '' }) {
  const isTalking = state === 'talking';
  const isWaving = state === 'wave';
  const isConfused = state === 'confused';
  const isThinking = state === 'thinking';
  const isAngry = state === 'angry';

  return (
    <div 
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      aria-label={`AI Kuro - Ekspresi ${state}`}
    >
      <style>{`
        @keyframes kuro-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(0.5deg); }
        }
        @keyframes kuro-wave-hand {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-22deg); }
          75% { transform: rotate(18deg); }
        }
        @keyframes kuro-mouth-talk {
          0%, 100% { d: path("M 112 147 Q 120 149 128 147"); }
          50% { d: path("M 112 147 Q 120 156 128 147"); }
        }
        @keyframes kuro-blink {
          0%, 94%, 98%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes kuro-sweat {
          0% { opacity: 0; transform: translateY(-4px) scale(0.6); }
          50% { opacity: 1; transform: translateY(0px) scale(1); }
          100% { opacity: 0; transform: translateY(6px) scale(0.8); }
        }
        @keyframes kuro-sparkle {
          0%, 100% { opacity: 0.2; transform: scale(0.7) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.15) rotate(180deg); }
        }
        @keyframes kuro-question {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-3px) scale(1.08); }
        }
        @keyframes kuro-anger-vein {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.18) rotate(5deg); }
        }
        .anim-kuro-body {
          animation: kuro-float 3.5s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .anim-kuro-wave {
          animation: kuro-wave-hand 0.75s ease-in-out infinite;
          transform-origin: 168px 150px;
        }
        .anim-kuro-talking-mouth {
          animation: kuro-mouth-talk 0.22s ease-in-out infinite;
        }
        .anim-kuro-eyes {
          animation: kuro-blink 4.2s infinite;
          transform-origin: 120px 132px;
        }
        .anim-kuro-sweat {
          animation: kuro-sweat 1.4s ease-in-out infinite;
        }
        .anim-kuro-sparkle {
          animation: kuro-sparkle 1.8s ease-in-out infinite;
          transform-origin: center;
        }
        .anim-kuro-question {
          animation: kuro-question 1.5s ease-in-out infinite;
          transform-origin: center;
        }
        .anim-kuro-anger {
          animation: kuro-anger-vein 0.75s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      <svg
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm overflow-visible"
      >
        <defs>
          {/* Gradien Rambut Silver Elaina */}
          <linearGradient id="hairGrad" x1="120" y1="80" x2="120" y2="190" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f1f3f9" />
            <stop offset="60%" stopColor="#d8dce8" />
            <stop offset="100%" stopColor="#b4b9cb" />
          </linearGradient>

          {/* Gradien Topi & Jubah Ungu Tua */}
          <linearGradient id="robeGrad" x1="120" y1="40" x2="120" y2="210" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4c3b60" />
            <stop offset="100%" stopColor="#312242" />
          </linearGradient>

          {/* Gradien Pita Topi Lavender */}
          <linearGradient id="ribbonGrad" x1="120" y1="95" x2="120" y2="115" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e3d6f0" />
            <stop offset="100%" stopColor="#bfa9d8" />
          </linearGradient>

          {/* Gradien Mata Sapphire Biru */}
          <linearGradient id="eyeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="60%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>

          {/* Gradien Bros Emas Bintang */}
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
        </defs>

        <g className="anim-kuro-body">
          {/* ─── 1. RAMBUT BELAKANG & KEPANGAN ─── */}
          <path
            d="M 68 135 C 55 170 72 205 105 212 C 120 215 135 212 172 205 C 185 170 172 135 168 135 Z"
            fill="url(#hairGrad)"
            stroke="#1e1826"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Aksen Tekstur Rambut Belakang */}
          <path d="M 98 170 Q 120 195 142 170" stroke="#9da4bc" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 108 185 Q 120 202 132 185" stroke="#9da4bc" strokeWidth="1.5" strokeLinecap="round" />

          {/* ─── 2. JUBAH PENYIHIR & GAUN (ROBE) ─── */}
          <path
            d="M 72 165 Q 52 195 48 215 C 65 218 85 216 120 216 C 155 216 175 218 192 215 Q 188 195 168 165 Z"
            fill="url(#robeGrad)"
            stroke="#1e1826"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          
          {/* Bintang Emas Hiasan di Ujung Bawah Jubah (Sesuai Referensi) */}
          <g fill="#fde047" stroke="#1e1826" strokeWidth="1">
            <path d="M 78 206 L 80 202 L 82 206 L 86 208 L 82 210 L 80 214 L 78 210 L 74 208 Z" />
            <path d="M 118 206 L 120 202 L 122 206 L 126 208 L 122 210 L 120 214 L 118 210 L 114 208 Z" />
            <path d="M 158 206 L 160 202 L 162 206 L 166 208 L 162 210 L 160 214 L 158 210 L 154 208 Z" />
          </g>

          {/* Kerah Kemeja Putih & Dasi Ungu */}
          <path d="M 102 162 L 120 178 L 138 162 L 128 156 L 112 156 Z" fill="#ffffff" stroke="#1e1826" strokeWidth="2" />
          <path d="M 114 163 L 120 180 L 126 163 Z" fill="#7c5295" />

          {/* BROS BINTANG EMAS KHAS ELAINA */}
          <g transform="translate(120, 168) scale(1.1)">
            <path
              d="M 0 -8 L 2.4 -2.5 L 8 -2.4 L 3.8 1.6 L 5.2 7.2 L 0 4.2 L -5.2 7.2 L -3.8 1.6 L -8 -2.4 L -2.4 -2.5 Z"
              fill="url(#goldGrad)"
              stroke="#1e1826"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </g>

          {/* ─── 3. KEPALA & WAJAH (CHIBI PROPORTION) ─── */}
          <path
            d="M 80 128 C 78 155 94 168 120 168 C 146 168 162 155 160 128 C 160 102 146 95 120 95 C 94 95 80 102 80 128 Z"
            fill="#fff3ec"
            stroke="#1e1826"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Rona Pipi Merah Muda (Blush) */}
          <ellipse cx="94" cy="144" rx="7" ry="4" fill="#fca5a5" opacity="0.65" />
          <ellipse cx="146" cy="144" rx="7" ry="4" fill="#fca5a5" opacity="0.65" />

          {/* ─── 4. MATA BIRU ANIME (ANIMATED & EXPRESSIVE) ─── */}
          {!isThinking ? (
            <g className="anim-kuro-eyes">
              {/* Mata Kiri */}
              <g transform="translate(98, 134)">
                {isConfused ? (
                  /* Mata Bingung: Bentuk sedikit bergelombang / ragu */
                  <>
                    <ellipse cx="0" cy="0" rx="6" ry="6.5" fill="url(#eyeGrad)" stroke="#1e1826" strokeWidth="2" />
                    <circle cx="-1.5" cy="-2" r="2.2" fill="#ffffff" />
                    <path d="M -7 -9 Q 0 -5 6 -7" stroke="#4a3b5c" strokeWidth="2.2" strokeLinecap="round" />
                  </>
                ) : (
                  /* Mata Normal Indah & Tajam */
                  <>
                    <ellipse cx="0" cy="0" rx="6.5" ry="8" fill="url(#eyeGrad)" stroke="#1e1826" strokeWidth="2" />
                    <circle cx="-1.5" cy="-2.5" r="2.8" fill="#ffffff" />
                    <circle cx="2" cy="2.5" r="1.3" fill="#ffffff" opacity="0.9" />
                    {/* Bulu Mata Atas */}
                    <path d="M -8 -8 Q 0 -11 8 -7" stroke="#1e1826" strokeWidth="2.8" strokeLinecap="round" />
                    <path d="M 6 -9 L 9 -11" stroke="#1e1826" strokeWidth="2" strokeLinecap="round" />
                    {/* Alis Lembut */}
                    <path d="M -7 -13 Q 0 -15 6 -12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                  </>
                )}
              </g>

              {/* Mata Kanan */}
              <g transform="translate(142, 134)">
                {isConfused ? (
                  <>
                    <ellipse cx="0" cy="0" rx="6" ry="6.5" fill="url(#eyeGrad)" stroke="#1e1826" strokeWidth="2" />
                    <circle cx="-1.5" cy="-2" r="2.2" fill="#ffffff" />
                    <path d="M -6 -7 Q 0 -9 7 -5" stroke="#4a3b5c" strokeWidth="2.2" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <ellipse cx="0" cy="0" rx="6.5" ry="8" fill="url(#eyeGrad)" stroke="#1e1826" strokeWidth="2" />
                    <circle cx="-1.5" cy="-2.5" r="2.8" fill="#ffffff" />
                    <circle cx="2" cy="2.5" r="1.3" fill="#ffffff" opacity="0.9" />
                    <path d="M -8 -7 Q 0 -11 8 -8" stroke="#1e1826" strokeWidth="2.8" strokeLinecap="round" />
                    <path d="M -9 -11 L -6 -9" stroke="#1e1826" strokeWidth="2" strokeLinecap="round" />
                    <path d="M -6 -12 Q 0 -15 7 -13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                  </>
                )}
              </g>
            </g>
          ) : (
            /* Mata Terpejam Merenung (Thinking Expression) */
            <g>
              <path d="M 92 133 Q 98 139 104 133" stroke="#1e1826" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 136 133 Q 142 139 148 133" stroke="#1e1826" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 92 124 Q 98 122 104 125" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
              <path d="M 136 125 Q 142 122 148 124" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* Hidung Imut */}
          <circle cx="120" cy="141" r="1" fill="#e09f87" />

          {/* ─── 5. MULUT DINAMIS (TALKING / SMILE / CONFUSED) ─── */}
          {isTalking ? (
            /* Mulut Berbicara dengan Keyframe CSS */
            <path
              d="M 112 147 Q 120 155 128 147"
              fill="#be123c"
              stroke="#1e1826"
              strokeWidth="2"
              strokeLinecap="round"
              className="anim-kuro-talking-mouth"
            />
          ) : isConfused ? (
            /* Mulut Bingung / Ragu */
            <path
              d="M 114 150 Q 120 146 126 149"
              fill="none"
              stroke="#1e1826"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : isThinking ? (
            /* Mulut Sedikit Terbuka Memikirkan Jawaban */
            <ellipse cx="120" cy="149" rx="2.5" ry="3.5" fill="#be123c" stroke="#1e1826" strokeWidth="1.5" />
          ) : isAngry ? (
            /* Mulut Cemberut / Pout Marah */
            <path
              d="M 114 151 Q 120 146 126 151"
              fill="none"
              stroke="#1e1826"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ) : (
            /* Senyum Manis Default */
            <path
              d="M 113 146 Q 120 152 127 146"
              fill="none"
              stroke="#1e1826"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}

          {/* ─── 6. RAMBUT DEPAN (BANGS & SIDE LOCKS) ─── */}
          {/* Poni depan berlapis */}
          <path
            d="M 80 112 Q 95 136 100 126 Q 110 138 120 120 Q 130 138 140 126 Q 148 136 160 112 Z"
            fill="url(#hairGrad)"
            stroke="#1e1826"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Rambut Samping Kiri */}
          <path
            d="M 80 115 C 72 135 68 165 78 180 C 82 170 85 145 88 128 Z"
            fill="url(#hairGrad)"
            stroke="#1e1826"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Rambut Samping Kanan */}
          <path
            d="M 160 115 C 168 135 172 165 162 180 C 158 170 155 145 152 128 Z"
            fill="url(#hairGrad)"
            stroke="#1e1826"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* ─── 7. TOPI PENYIHIR KHAS ELAINA (WITCH HAT) ─── */}
          <g transform={isConfused ? "rotate(-7, 120, 95)" : "rotate(0, 120, 95)"} className="transition-transform duration-300">
            {/* Pinggiran Topi Melengkung Lebar (Wide Brim) */}
            <path
              d="M 32 108 C 45 92 195 92 208 108 C 190 120 50 120 32 108 Z"
              fill="url(#robeGrad)"
              stroke="#1e1826"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            
            {/* Kerucut Topi Melengkung ke Kanan (Cone Body) */}
            <path
              d="M 72 98 Q 112 50 130 38 Q 155 24 182 32 Q 170 48 152 64 Q 162 82 168 98 Z"
              fill="url(#robeGrad)"
              stroke="#1e1826"
              strokeWidth="3"
              strokeLinejoin="round"
            />

            {/* Ujung Topi Lipatan Khas dengan Bintang Emas Gantung */}
            <path d="M 182 32 Q 192 38 188 44 Q 180 44 175 40 Z" fill="#312242" stroke="#1e1826" strokeWidth="2" />
            <polygon points="188,44 190,48 194,49 191,52 192,56 188,54 184,56 185,52 182,49 186,48" fill="#fde047" stroke="#1e1826" strokeWidth="1" />

            {/* Pita Topi Lavender Lembut */}
            <path
              d="M 72 98 Q 120 90 168 98 L 166 86 Q 120 78 74 86 Z"
              fill="url(#ribbonGrad)"
              stroke="#1e1826"
              strokeWidth="2"
            />

            {/* Pita Kupu-Kupu Besar di Samping Kanan (Large Bow) */}
            <g transform="translate(155, 88)">
              {/* Sayap Pita Kiri */}
              <ellipse cx="-8" cy="-2" rx="9" ry="7" fill="#eddff6" stroke="#1e1826" strokeWidth="2" transform="rotate(-15)" />
              {/* Sayap Pita Kanan */}
              <ellipse cx="8" cy="-2" rx="9" ry="7" fill="#eddff6" stroke="#1e1826" strokeWidth="2" transform="rotate(15)" />
              {/* Simpul Tengah Pita */}
              <circle cx="0" cy="-2" r="5" fill="#c3a8df" stroke="#1e1826" strokeWidth="2" />
              {/* Ekor Pita Menggantung */}
              <path d="M -3 3 L -7 16 L -1 13 L 2 16 L 1 3 Z" fill="#d9c3ee" stroke="#1e1826" strokeWidth="1.5" />
            </g>
          </g>

          {/* ─── 8. TANGAN KANAN (WAVING ANIMATION) ─── */}
          {isWaving ? (
            <g className="anim-kuro-wave">
              {/* Lengan Baju Jubah */}
              <path d="M 166 160 Q 182 148 190 134 Q 180 128 166 148 Z" fill="url(#robeGrad)" stroke="#1e1826" strokeWidth="2.5" />
              {/* Manset Putih */}
              <ellipse cx="187" cy="133" rx="5" ry="3" fill="#ffffff" stroke="#1e1826" strokeWidth="1.5" transform="rotate(-35, 187, 133)" />
              {/* Telapak Tangan Melambai (Chibi Mitt) */}
              <path
                d="M 186 130 C 188 122 195 118 200 123 C 203 126 201 133 194 136 Z"
                fill="#fff3ec"
                stroke="#1e1826"
                strokeWidth="2"
              />
              {/* Jempol */}
              <path d="M 187 127 C 185 125 186 122 189 123" stroke="#1e1826" strokeWidth="1.5" />
            </g>
          ) : (
            /* Tangan Normal Memegang Jubah atau Santai */
            <g>
              <path d="M 162 165 Q 172 178 175 188 Q 168 192 158 178 Z" fill="url(#robeGrad)" stroke="#1e1826" strokeWidth="2" />
              <circle cx="174" cy="190" r="4.5" fill="#fff3ec" stroke="#1e1826" strokeWidth="1.8" />
            </g>
          )}

          {/* Tangan Kiri */}
          <g>
            <path d="M 78 165 Q 68 178 65 188 Q 72 192 82 178 Z" fill="url(#robeGrad)" stroke="#1e1826" strokeWidth="2" />
            <circle cx="66" cy="190" r="4.5" fill="#fff3ec" stroke="#1e1826" strokeWidth="1.8" />
          </g>

          {/* Sepatu Bot Penyihir Cokelat (Boots) */}
          <g>
            <path d="M 98 214 L 98 226 C 98 229 90 231 86 229 C 83 227 88 220 92 215 Z" fill="#543729" stroke="#1e1826" strokeWidth="2" />
            <path d="M 142 214 L 142 226 C 142 229 150 231 154 229 C 157 227 152 220 148 215 Z" fill="#543729" stroke="#1e1826" strokeWidth="2" />
            {/* Gesper Emas */}
            <rect x="94" y="219" width="6" height="3" fill="#fde047" stroke="#1e1826" strokeWidth="1" />
            <rect x="140" y="219" width="6" height="3" fill="#fde047" stroke="#1e1826" strokeWidth="1" />
          </g>
        </g>

        {/* ─── 9. EFEK VISUAL EKSPRESI: BINGUNG (CONFUSED) ─── */}
        {isConfused && (
          <>
            {/* Tetesan Keringat Anime (Sweat Drop) */}
            <g transform="translate(62, 102)" className="anim-kuro-sweat">
              <path
                d="M 0 -6 C 4 -2 5 3 2 6 C -1 8 -5 6 -5 2 C -5 -2 0 -6 0 -6 Z"
                fill="#38bdf8"
                stroke="#0284c7"
                strokeWidth="1.5"
              />
            </g>

            {/* Balon Tanda Tanya Melayang */}
            <g transform="translate(182, 70)" className="anim-kuro-question">
              <rect x="-3" y="-3" width="26" height="26" rx="6" fill="#fef08a" stroke="#1e1826" strokeWidth="2" />
              <text x="10" y="16" textAnchor="middle" fontSize="16" fontWeight="900" fill="#1e1826" fontFamily="monospace">?</text>
            </g>
          </>
        )}

        {/* ─── 10. EFEK VISUAL EKSPRESI: MERENUNG / MEMIKIRKAN (THINKING) ─── */}
        {isThinking && (
          <g>
            {/* Bintang Sihir Berputar di Atas Kepala */}
            <g transform="translate(180, 68)" className="anim-kuro-sparkle">
              <polygon points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" fill="#fde047" stroke="#ca8a04" strokeWidth="1" />
            </g>
            <g transform="translate(56, 80)" className="anim-kuro-sparkle" style={{ animationDelay: '0.6s' }}>
              <polygon points="0,-5 1.5,-1.5 5,0 1.5,1.5 0,5 -1.5,1.5 -5,0 -1.5,-1.5" fill="#f472b6" stroke="#db2777" strokeWidth="1" />
            </g>
          </g>
        )}

        {/* ─── 11. EFEK VISUAL EKSPRESI: MARAH / NGAMBEK (ANGRY) ─── */}
        {isAngry && (
          <g transform="translate(182, 70)" className="anim-kuro-anger">
            <rect x="-3" y="-3" width="26" height="26" rx="6" fill="#fee2e2" stroke="#dc2626" strokeWidth="2" />
            <text x="10" y="17" textAnchor="middle" fontSize="16" fontWeight="900" fill="#dc2626" fontFamily="sans-serif">💢</text>
          </g>
        )}
      </svg>
    </div>
  );
}

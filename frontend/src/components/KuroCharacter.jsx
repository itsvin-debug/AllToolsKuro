import React, { useId } from 'react';

/**
 * Komponen Grafis Vektor SVG & Animasi CSS Kuro (Persona Elaina - Majo no Tabitabi)
 * Dirender 100% menggunakan scalable vector paths & CSS keyframe animation (tanpa gambar PNG statis).
 * 
 * Props:
 * - state: 'idle' | 'wave' | 'talking' | 'confused'
 * - size: number (default: 80)
 * - className: string
 */
export default function KuroCharacter({ state = 'idle', size = 80, className = '' }) {
  const uid = useId().replace(/:/g, '');

  const isTalking = state === 'talking';
  const isWaving = state === 'wave';
  const isConfused = state === 'confused';

  return (
    <div 
      className={`inline-flex items-center justify-center relative select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      aria-label={`AI Kuro Elaina - ${state}`}
    >
      <style>{`
        /* Animasi mengambang / bernapas halus (Floating Bob) */
        @keyframes kuro-float-${uid} {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }

        /* Animasi lambaian tangan kanan (Waving Hand) */
        @keyframes kuro-wave-hand-${uid} {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-22deg); }
          75% { transform: rotate(14deg); }
        }

        /* Animasi mulut buka-tutup sinkron saat berbicara (Lip-Sync) */
        @keyframes kuro-mouth-sync-${uid} {
          0%, 100% { transform: scaleY(0.3); }
          30% { transform: scaleY(1.2); }
          60% { transform: scaleY(0.7); }
          80% { transform: scaleY(1.4); }
        }

        /* Animasi anggukan antusias saat menjelaskan (Talking Bob) */
        @keyframes kuro-talk-head-${uid} {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-1.5px) rotate(0.8deg); }
        }

        /* Animasi kedipan mata natural (Eye Blink) */
        @keyframes kuro-blink-${uid} {
          0%, 92%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.08); }
        }

        /* Animasi tanda tanya / sweatdrop saat bingung */
        @keyframes kuro-confused-float-${uid} {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.9; }
          50% { transform: translateY(-4px) scale(1.1); opacity: 1; }
        }

        .kuro-base-${uid} {
          transform-origin: center bottom;
          animation: kuro-float-${uid} 3.2s ease-in-out infinite;
        }

        .kuro-head-${uid} {
          transform-origin: 100px 95px;
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .kuro-head-talking-${uid} {
          animation: kuro-talk-head-${uid} 0.45s ease-in-out infinite;
        }

        .kuro-head-confused-${uid} {
          transform: rotate(12deg) translateY(-1px);
        }

        .kuro-eye-group-${uid} {
          transform-origin: 100px 85px;
          animation: kuro-blink-${uid} 4.2s infinite;
        }

        .kuro-arm-right-wave-${uid} {
          transform-origin: 135px 125px;
          animation: kuro-wave-hand-${uid} 0.65s ease-in-out infinite;
        }

        .kuro-mouth-talking-${uid} {
          transform-origin: 100px 99px;
          animation: kuro-mouth-sync-${uid} 0.22s ease-in-out infinite;
        }
      `}</style>

      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full overflow-visible kuro-base-${uid}`}
      >
        <defs>
          {/* Gradien Rambut Perak-Lavender Elaina */}
          <linearGradient id={`hair-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E6DFF6" />
            <stop offset="60%" stopColor="#D5C5EE" />
            <stop offset="100%" stopColor="#B39DD8" />
          </linearGradient>

          {/* Gradien Topi & Jubah Ungu Tua Penyihir */}
          <linearGradient id={`witch-hat-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A286D" />
            <stop offset="50%" stopColor="#3B1C5B" />
            <stop offset="100%" stopColor="#281140" />
          </linearGradient>

          {/* Gradien Pita Lavender Lembut */}
          <linearGradient id={`ribbon-grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D8BFD8" />
            <stop offset="50%" stopColor="#C4A1D8" />
            <stop offset="100%" stopColor="#A678C6" />
          </linearGradient>

          {/* Gradien Mata Biru Anime Menawan */}
          <linearGradient id={`eye-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="45%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>

          {/* Gradien Bintang & Aksesoris Emas */}
          <linearGradient id={`gold-grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="60%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>

          {/* Bayangan Halus */}
          <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#1E0B36" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* ─── 1. RAMBUT BELAKANG (BACK HAIR MANTLE) ─── */}
        <g id="back-hair">
          <path
            d="M 62 85 C 50 110, 52 148, 65 170 C 72 165, 80 162, 88 165 C 96 160, 104 160, 112 165 C 120 162, 128 165, 135 170 C 148 148, 150 110, 138 85 Z"
            fill={`url(#hair-grad-${uid})`}
            stroke="#281140"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Helai rambut samping menjuntai */}
          <path d="M 58 115 Q 52 145 62 165" stroke="#9A82C4" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 142 115 Q 148 145 138 165" stroke="#9A82C4" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* ─── 2. BADAN & JUBAH PENYIHIR (CAPELET & DRESS) ─── */}
        <g id="body-and-cape">
          {/* Kerah Baju Putih di Dalam */}
          <path
            d="M 85 118 L 100 134 L 115 118 L 108 112 L 92 112 Z"
            fill="#FFFFFF"
            stroke="#281140"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Dasi / Pita Dada Lavender */}
          <path d="M 96 122 L 100 138 L 104 122 Z" fill={`url(#ribbon-grad-${uid})`} />

          {/* Jubah Bahu Ungu Penyihir (Capelet) */}
          <path
            d="M 64 120 C 58 135, 54 158, 62 168 C 76 164, 88 162, 100 164 C 112 162, 124 164, 138 168 C 146 158, 142 135, 136 120 C 122 115, 78 115, 64 120 Z"
            fill={`url(#witch-hat-grad-${uid})`}
            stroke="#281140"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Hiasan Bintang Emas pada Pinggiran Jubah Bawah */}
          <g fill={`url(#gold-grad-${uid})`} stroke="#854D0E" strokeWidth="0.6">
            {/* Bintang kiri */}
            <polygon points="76,161 78,157 80,161 84,162 80,164 78,168 76,164 72,162" />
            {/* Bintang tengah */}
            <polygon points="100,157 101.5,153 103,157 107,158 103,160 101.5,164 100,160 96,158" />
            {/* Bintang kanan */}
            <polygon points="124,161 126,157 128,161 132,162 128,164 126,168 124,164 120,162" />
          </g>

          {/* Bros Bintang Emas Khas Elaina di Kerah Dada */}
          <g transform="translate(100, 122)" filter={`url(#shadow-${uid})`}>
            {/* Pita belakang bros */}
            <path d="M -10 -2 L -16 6 L -9 5 Z" fill={`url(#ribbon-grad-${uid})`} stroke="#281140" strokeWidth="1" />
            <path d="M 10 -2 L 16 6 L 9 5 Z" fill={`url(#ribbon-grad-${uid})`} stroke="#281140" strokeWidth="1" />
            {/* Bintang emas 5-sudut berdimensi */}
            <polygon
              points="0,-8 2.5,-2.5 8,-2.5 3.5,1.5 5.5,7 0,3.5 -5.5,7 -3.5,1.5 -8,-2.5 -2.5,-2.5"
              fill={`url(#gold-grad-${uid})`}
              stroke="#281140"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Titik kilau tengah */}
            <circle cx="0" cy="0" r="1.5" fill="#FEF08A" />
          </g>

          {/* Tangan Kiri (Posisi Istirahat Santai) */}
          <g id="arm-left">
            <path
              d="M 64 122 C 58 132, 59 144, 66 150 C 69 146, 70 138, 70 128 Z"
              fill={`url(#witch-hat-grad-${uid})`}
              stroke="#281140"
              strokeWidth="2"
            />
            {/* Manset Lengan & Tangan Mungil */}
            <ellipse cx="67" cy="151" rx="4.5" ry="3.5" fill="#FFE4D6" stroke="#281140" strokeWidth="1.5" />
          </g>

          {/* Tangan Kanan: Dinamis Bergelombang / Melambai */}
          <g 
            id="arm-right" 
            className={isWaving ? `kuro-arm-right-wave-${uid}` : ''}
          >
            {isWaving ? (
              // Tangan kanan terangkat melambai menyapa pengguna
              <g>
                <path
                  d="M 136 122 C 145 120, 154 112, 158 98 C 151 98, 142 108, 134 116 Z"
                  fill={`url(#witch-hat-grad-${uid})`}
                  stroke="#281140"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {/* Manset Pita Emas */}
                <ellipse cx="157" cy="98" rx="4.5" ry="3" fill={`url(#gold-grad-${uid})`} stroke="#281140" strokeWidth="1" />
                {/* Telapak Tangan Mungil Melambai */}
                <g transform="translate(159, 93)">
                  <circle cx="0" cy="0" r="5" fill="#FFE4D6" stroke="#281140" strokeWidth="1.5" />
                  <path d="M 0 -5 L 1 -7" stroke="#281140" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M 3 -4 L 4.5 -6" stroke="#281140" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M -3 -3 L -5 -4" stroke="#281140" strokeWidth="1.2" strokeLinecap="round" />
                </g>
              </g>
            ) : (
              // Tangan kanan posisi santai
              <g>
                <path
                  d="M 136 122 C 142 132, 141 144, 134 150 C 131 146, 130 138, 130 128 Z"
                  fill={`url(#witch-hat-grad-${uid})`}
                  stroke="#281140"
                  strokeWidth="2"
                />
                <ellipse cx="133" cy="151" rx="4.5" ry="3.5" fill="#FFE4D6" stroke="#281140" strokeWidth="1.5" />
              </g>
            )}
          </g>
        </g>

        {/* ─── 3. KEPALA, WAJAH, & EKSPRESI (HEAD, FACE & EMOTIONS) ─── */}
        <g 
          id="head-group" 
          className={`kuro-head-${uid} ${isTalking ? `kuro-head-talking-${uid}` : ''} ${isConfused ? `kuro-head-confused-${uid}` : ''}`}
        >
          {/* Kontur Wajah Chibi */}
          <path
            d="M 68 84 C 68 62, 132 62, 132 84 C 132 108, 118 122, 100 122 C 82 122, 68 108, 68 84 Z"
            fill="#FFF2E8"
            stroke="#281140"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Rona Merah Pipi Imut (Blush) */}
          <ellipse cx="78" cy="98" rx="6" ry="3" fill="#FCA5A5" opacity="0.65" />
          <ellipse cx="122" cy="98" rx="6" ry="3" fill="#FCA5A5" opacity="0.65" />
          {/* Garis aksen blush anime */}
          <path d="M 76 97 L 80 99" stroke="#E11D48" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
          <path d="M 120 97 L 124 99" stroke="#E11D48" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

          {/* Mata Anime Indah (Kiri & Kanan) */}
          <g className={`kuro-eye-group-${uid}`}>
            {/* Mata Kiri */}
            <g transform="translate(82, 88)">
              {/* Bulu Mata Atas */}
              <path d="M -10 -6 Q 0 -10 9 -5" stroke="#281140" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              {/* Iris Biru Bergradien */}
              <ellipse cx="0" cy="0" rx="7.5" ry="9" fill={`url(#eye-grad-${uid})`} />
              {/* Pupil Gelap */}
              <ellipse cx="0" cy="-1" rx="4.5" ry="5.5" fill="#0F172A" />
              {/* Kilau Specular Utama (Highlight) */}
              <circle cx="-2.5" cy="-3.5" r="3" fill="#FFFFFF" />
              {/* Kilau Cahaya Kecil di Bawah */}
              <circle cx="2.5" cy="3" r="1.5" fill="#BAE6FD" />
            </g>

            {/* Mata Kanan */}
            <g transform="translate(118, 88)">
              {/* Bulu Mata Atas */}
              <path d="M -9 -5 Q 0 -10 10 -6" stroke="#281140" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              {/* Iris Biru Bergradien */}
              <ellipse cx="0" cy="0" rx="7.5" ry="9" fill={`url(#eye-grad-${uid})`} />
              {/* Pupil Gelap */}
              <ellipse cx="0" cy="-1" rx="4.5" ry="5.5" fill="#0F172A" />
              {/* Kilau Specular Utama (Highlight) */}
              <circle cx="-2.5" cy="-3.5" r="3" fill="#FFFFFF" />
              {/* Kilau Cahaya Kecil di Bawah */}
              <circle cx="2.5" cy="3" r="1.5" fill="#BAE6FD" />
            </g>
          </g>

          {/* Alis Ekspresif (Berubah saat Confused / Normal) */}
          {isConfused ? (
            <g stroke="#6D28D9" strokeWidth="1.8" strokeLinecap="round" fill="none">
              {/* Alis kiri miring naik heran */}
              <path d="M 74 74 Q 82 72 88 77" />
              {/* Alis kanan turun heran */}
              <path d="M 112 77 Q 118 72 126 74" />
            </g>
          ) : (
            <g stroke="#6D28D9" strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d="M 75 75 Q 82 72 89 74" />
              <path d="M 111 74 Q 118 72 125 75" />
            </g>
          )}

          {/* Hidung Imut Titik Kecil */}
          <circle cx="100" cy="94" r="0.9" fill="#D97706" opacity="0.6" />

          {/* Mulut Dinamis (Lip-Sync / Smile / Confused) */}
          <g transform="translate(100, 102)">
            {isTalking ? (
              // Mulut buka-tutup animasi sinkron dengan pengetikan teks
              <g className={`kuro-mouth-talking-${uid}`}>
                <ellipse cx="0" cy="0" rx="4" ry="4" fill="#BE185D" stroke="#281140" strokeWidth="1.4" />
                <path d="M -2.5 1 Q 0 3 2.5 1" fill="#FDA4AF" />
              </g>
            ) : isConfused ? (
              // Mulut bingung bergelombang kecil
              <path
                d="M -4.5 1 Q -2 -1.5 0 0 Q 2 -1.5 4.5 1"
                stroke="#281140"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              // Senyum manis default khas Elaina
              <path
                d="M -4.5 -0.5 Q 0 3.5 4.5 -0.5"
                stroke="#281140"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>

          {/* ─── 4. PONI RAMBUT DEPAN (FRONT BANGS) ─── */}
          <g id="front-hair">
            {/* Poni Tengah Khas Elaina Membelah Lembut */}
            <path
              d="M 68 76 C 72 88, 76 96, 80 100 C 82 92, 85 86, 90 78 C 94 92, 98 102, 101 104 C 104 98, 108 90, 114 78 C 118 88, 122 96, 125 99 C 128 92, 130 84, 132 76 Z"
              fill={`url(#hair-grad-${uid})`}
              stroke="#281140"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Helai Rambut Samping Panjang Menjuntai di Dada */}
            <path
              d="M 66 84 C 60 98, 58 118, 64 135 C 67 130, 68 118, 70 102 Z"
              fill={`url(#hair-grad-${uid})`}
              stroke="#281140"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M 134 84 C 140 98, 142 118, 136 135 C 133 130, 132 118, 130 102 Z"
              fill={`url(#hair-grad-${uid})`}
              stroke="#281140"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Jepitan Belah Ketupat Emas pada Ikatan Rambut */}
            <polygon points="65,130 67,133 65,136 63,133" fill={`url(#gold-grad-${uid})`} stroke="#281140" strokeWidth="0.8" />
            <polygon points="135,130 137,133 135,136 133,133" fill={`url(#gold-grad-${uid})`} stroke="#281140" strokeWidth="0.8" />
          </g>

          {/* ─── 5. TOPI BESAR PENYIHIR ELAINA (WITCH HAT) ─── */}
          <g id="witch-hat" filter={`url(#shadow-${uid})`}>
            {/* Lingkar Tepi Daun Topi Bawah (Brim) */}
            <path
              d="M 28 80 C 26 73, 55 64, 100 64 C 145 64, 174 73, 172 80 C 170 87, 142 88, 100 88 C 58 88, 30 87, 28 80 Z"
              fill={`url(#witch-hat-grad-${uid})`}
              stroke="#281140"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />

            {/* Kerucut Puncak Topi Melengkung ke Kiri */}
            <path
              d="M 66 67 C 68 45, 80 26, 92 18 C 96 15, 84 10, 72 16 C 62 21, 55 30, 56 36 C 58 45, 59 58, 66 67 Z"
              fill={`url(#witch-hat-grad-${uid})`}
              stroke="#281140"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Kubah Kerucut Utama Topi */}
            <path
              d="M 65 67 C 68 48, 86 28, 106 20 C 122 28, 132 46, 135 67 Z"
              fill={`url(#witch-hat-grad-${uid})`}
              stroke="#281140"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {/* Ornamen Daun / Bulu Emas Tergantung di Ujung Kerucut Topi */}
            <g transform="translate(62, 22)">
              <line x1="0" y1="0" x2="-4" y2="7" stroke="#CA8A04" strokeWidth="1.2" />
              <path
                d="M -4 7 C -7 8, -8 13, -5 16 C -2 13, -1 10, -4 7 Z"
                fill={`url(#gold-grad-${uid})`}
                stroke="#281140"
                strokeWidth="1"
              />
            </g>

            {/* Sabuk Pita Lavender di Pangkal Topi */}
            <path
              d="M 65 65 C 76 61, 124 61, 135 65 L 134 71 C 122 67, 78 67, 66 71 Z"
              fill={`url(#ribbon-grad-${uid})`}
              stroke="#281140"
              strokeWidth="1.8"
            />

            {/* Busur Pita Besar di Sisi Kiri Topi */}
            <g transform="translate(74, 62)">
              {/* Sayap Pita Kiri */}
              <path
                d="M 0 0 C -12 -8, -18 2, -4 6 Z"
                fill={`url(#ribbon-grad-${uid})`}
                stroke="#281140"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {/* Sayap Pita Kanan */}
              <path
                d="M 0 0 C 12 -8, 18 2, 4 6 Z"
                fill={`url(#ribbon-grad-${uid})`}
                stroke="#281140"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {/* Ikatan Tengah Pita */}
              <ellipse cx="0" cy="1" rx="3.5" ry="4" fill="#9333EA" stroke="#281140" strokeWidth="1.5" />
              {/* Bintang Emas Mini di Tengah Pita */}
              <polygon
                points="0,-2 1,-0.5 2.5,-0.5 1.2,0.8 1.8,2.2 0,1.2 -1.8,2.2 -1.2,0.8 -2.5,-0.5 -1,-0.5"
                fill={`url(#gold-grad-${uid})`}
              />
            </g>
          </g>

          {/* ─── 6. AKSSESORIS EFEK EMOSI (SWEATDROP & QUESTION MARK) ─── */}
          {isConfused && (
            <g className={`kuro-confused-fx-${uid}`} style={{ animation: `kuro-confused-float-${uid} 1.6s ease-in-out infinite` }}>
              {/* Balon Tanda Tanya Kuning Terang di Atas Topi */}
              <g transform="translate(142, 28)">
                <circle cx="0" cy="0" r="10" fill="#FDE047" stroke="#281140" strokeWidth="2" />
                <text
                  x="0"
                  y="4.5"
                  textAnchor="middle"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  fontWeight="900"
                  fontSize="13"
                  fill="#1E0B36"
                >
                  ?
                </text>
              </g>
              {/* Tetesan Keringat Kartun Anime (Sweatdrop) */}
              <path
                d="M 52 56 C 50 62, 54 66, 57 65 C 60 64, 60 59, 56 54 Z"
                fill="#38BDF8"
                stroke="#281140"
                strokeWidth="1.2"
                opacity="0.9"
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

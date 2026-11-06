// Middleware Env Guard: Proteksi Kloning Publik & Pembatasan Hak Akses
export function envGuard(req, res, next) {
  const adminSecret = process.env.KURO_ADMIN_SECRET || process.env.ADMIN_PASSWORD || process.env.KURO_MASTER_KEY;
  const isPublicMode = process.env.PUBLIC_MODE === 'true' || !adminSecret;

  // Pasang status lingkungan ke request object
  req.isRestrictedGuest = isPublicMode;

  // Jika mencoba mengakses rute administratif tanpa variabel rahasia terkonfigurasi
  if (req.path.startsWith('/admin') || req.path.startsWith('/verify-admin')) {
    if (isPublicMode) {
      return res.status(403).json({
        success: false,
        restricted: true,
        mode: 'Restricted Public Clone Mode',
        message: 'Akses administratif dinonaktifkan: Repositori publik berjalan dalam mode Restricted Guest.'
      });
    }
  }

  next();
}

// Validasi integritas lisensi dan identitas Kuro Studio
export function verifyKuroSignature(customBrand) {
  const requiredBrand = 'Kuro Studio';
  if (customBrand && !customBrand.includes(requiredBrand) && !process.env.KURO_SIGNATURE) {
    return {
      valid: false,
      warning: 'Peringatan Integritas: Modifikasi atribusi Kuro Studio memerlukan lisensi KURO_SIGNATURE yang valid.'
    };
  }
  return { valid: true };
}

export default envGuard;

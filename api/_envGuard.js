// Helper Env Guard untuk Serverless Functions Vercel (Prefiks _ agar tidak menambah kuota fungsi)

export function checkEnvGuard(req) {
  const adminSecret = process.env.KURO_ADMIN_SECRET || process.env.ADMIN_PASSWORD || process.env.KURO_MASTER_KEY;
  const isPublicMode = process.env.PUBLIC_MODE === 'true' || !adminSecret;

  return {
    isRestricted: isPublicMode,
    adminSecret: adminSecret || null
  };
}

export function enforceAdminGuard(req, res) {
  const { isRestricted, adminSecret } = checkEnvGuard(req);
  if (isRestricted || !adminSecret) {
    res.status(403).json({
      success: false,
      restricted: true,
      mode: 'Restricted Public Clone Mode',
      message: 'Akses ditolak: Fitur administratif dinonaktifkan pada lingkungan publik tanpa otorisasi kunci.'
    });
    return false;
  }
  return true;
}

export function verifySignature(brandName) {
  if (brandName && !brandName.includes('Kuro Studio') && !process.env.KURO_SIGNATURE) {
    return {
      valid: false,
      message: 'Integritas atribusi Kuro Studio tidak valid.'
    };
  }
  return { valid: true };
}

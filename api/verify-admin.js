export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { password } = req.body || {};
  const expectedPassword = (process.env.ADMIN_PASSWORD || 'VINZ6767').trim();

  if (password && String(password).trim() === expectedPassword) {
    return res.status(200).json({ success: true, message: 'Autentikasi admin berhasil.' });
  }

  return res.status(401).json({ success: false, message: 'Kata sandi admin tidak valid.' });
}

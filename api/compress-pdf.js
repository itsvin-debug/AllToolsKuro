import { PDFDocument } from 'pdf-lib';
import { applySecurityHeaders } from './_security.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan.' });
  }

  try {
    const { pdfBase64, originalName, preset = 'optimal' } = req.body || {};

    if (!pdfBase64) {
      return res.status(400).json({
        success: false,
        message: 'File PDF tidak boleh kosong.'
      });
    }

    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const inputBuffer = Buffer.from(cleanBase64, 'base64');
    const originalSize = inputBuffer.length;

    const pdfDoc = await PDFDocument.load(inputBuffer, {
      ignoreEncryption: true,
      updateMetadata: false
    });

    try {
      pdfDoc.setProducer('Kuro Studio PDF Optimizer');
      pdfDoc.setCreator('Kuro Studio');
    } catch {}

    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false
    });

    const compressedBase64 = Buffer.from(compressedBytes).toString('base64');
    const compressedSize = compressedBytes.length;
    const savingsBytes = Math.max(0, originalSize - compressedSize);
    const savingsPercent = originalSize > 0
      ? Math.round((savingsBytes / originalSize) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        originalName: originalName || 'document.pdf',
        originalSize,
        compressedSize,
        savingsPercent: `${savingsPercent}%`,
        savingsBytes,
        pageCount: pdfDoc.getPageCount(),
        pdfBase64: `data:application/pdf;base64,${compressedBase64}`,
        preset
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengompres PDF: ' + (err.message || 'Terjadi kesalahan pemrosesan dokumen.')
    });
  }
}


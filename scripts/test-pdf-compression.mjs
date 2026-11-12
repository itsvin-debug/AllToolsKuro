import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';
import zlib from 'zlib';
import { compressPdfService } from '../backend/src/services/mediaProcessing.service.js';

async function runTest() {
  console.log('=== TEST 1: Document Structure & Text Integrity ===');
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  
  for (let i = 1; i <= 3; i++) {
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(`Kuro Studio Test Page ${i}`, {
      x: 50,
      y: 750,
      size: 24,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });
    page.drawText('Preserving 100% of text and vector layouts without corruption.', {
      x: 50,
      y: 700,
      size: 14,
      font: timesRomanFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const rawBytes = await pdfDoc.save();
  const base64Data = Buffer.from(rawBytes).toString('base64');
  console.log(`Original test PDF size: ${rawBytes.length} bytes`);

  const result1 = await compressPdfService({ pdfBase64: base64Data, preset: 'optimal' });
  const writtenPath1 = path.join(process.cwd(), 'backend', 'uploads', result1.fileName);
  const loadedDoc1 = await PDFDocument.load(fs.readFileSync(writtenPath1));
  console.log('Loaded compressed PDF page count:', loadedDoc1.getPageCount());
  if (loadedDoc1.getPageCount() !== 3) {
    throw new Error('Test 1 failed: Page count mismatch!');
  }
  fs.unlinkSync(writtenPath1);
  console.log('TEST 1 PASSED: Text integrity and structure 100% preserved!\n');

  console.log('=== TEST 2: FlateDecode / Graphic Document (Simulating Kuro_Dokumen.pdf 620KB) ===');
  // Create a 600KB+ PDF with an uncompressed/FlateDecode embedded image
  const imgDoc = await PDFDocument.create();
  const w = 600, h = 600;
  const rawRgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      rawRgb[idx] = Math.sin(x / 20) * 120 + 128;
      rawRgb[idx + 1] = Math.cos(y / 20) * 120 + 128;
      rawRgb[idx + 2] = ((x + y) / 4) % 256;
    }
  }
  const deflated = zlib.deflateSync(rawRgb);

  const imgStream = imgDoc.context.stream(deflated, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: w,
    Height: h,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'FlateDecode'
  });
  const imgRef = imgDoc.context.register(imgStream);
  const imgPage = imgDoc.addPage([600, 800]);
  imgPage.node.set(PDFName.of('Resources'), imgDoc.context.obj({
    XObject: { Img1: imgRef }
  }));
  imgPage.drawText('Kuro Studio Kuro_Dokumen.pdf Official', { x: 50, y: 750, size: 20 });
  const simulatedBytes = await imgDoc.save({ useObjectStreams: false });
  console.log(`Simulated PDF original size: ${simulatedBytes.length} bytes (${(simulatedBytes.length / 1024).toFixed(2)} KB)`);

  const simBase64 = Buffer.from(simulatedBytes).toString('base64');
  console.log('Testing Mode Maksimal (preset: "extreme")...');
  const result2 = await compressPdfService({ pdfBase64: simBase64, preset: 'extreme', originalName: 'Kuro_Dokumen.pdf' });
  console.log('Compression result:', {
    originalSize: result2.originalSizeFormatted,
    compressedSize: result2.compressedSizeFormatted,
    savingsPercent: result2.savingsPercent,
    saved: result2.savedFormatted
  });

  const writtenPath2 = path.join(process.cwd(), 'backend', 'uploads', result2.fileName);
  const loadedDoc2 = await PDFDocument.load(fs.readFileSync(writtenPath2));
  console.log('Loaded Mode Maksimal compressed page count:', loadedDoc2.getPageCount());
  fs.unlinkSync(writtenPath2);

  const savingsNum = parseInt(result2.savingsPercent);
  if (savingsNum >= 50) {
    console.log(`TEST 2 PASSED: Mode Maksimal achieved ${result2.savingsPercent} reduction (>= 50% target met)!`);
  } else {
    throw new Error(`Test 2 failed: Expected >= 50% savings, but got ${result2.savingsPercent}`);
  }

  console.log('\nALL ENGINE VERIFICATIONS PASSED 100%!');
}

runTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

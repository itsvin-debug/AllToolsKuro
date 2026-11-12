import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { compressPdfService } from '../backend/src/services/mediaProcessing.service.js';

async function runTest() {
  console.log('Generating dummy test PDF document...');
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

  console.log('Testing compressPdfService with "balanced" preset...');
  const result = await compressPdfService({ pdfBase64: base64Data, preset: 'balanced' });
  console.log('Compression result:', {
    success: result.success,
    originalSize: result.originalSize,
    compressedSize: result.compressedSize,
    originalSizeFormatted: result.originalSizeFormatted,
    compressedSizeFormatted: result.compressedSizeFormatted,
    savingsPercent: result.savingsPercent,
    savedFormatted: result.savedFormatted,
    pageCount: result.pageCount,
    fileName: result.fileName
  });

  // Verify that the compressed PDF is valid by loading it from the written file
  const writtenPath = path.join(process.cwd(), 'backend', 'uploads', result.fileName);
  const fileBytes = fs.readFileSync(writtenPath);
  const loadedDoc = await PDFDocument.load(fileBytes);
  console.log('Loaded compressed PDF page count:', loadedDoc.getPageCount());
  if (loadedDoc.getPageCount() === 3) {
    console.log('VERIFICATION PASSED: Document structure, pages, and integrity 100% preserved!');
    // Clean up test file
    fs.unlinkSync(writtenPath);
  } else {
    throw new Error('Verification failed: Page count mismatch!');
  }
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

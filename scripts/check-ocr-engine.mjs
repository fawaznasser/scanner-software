import assert from 'node:assert/strict';
import { createOcrEngine } from './ocr-engine.mjs';
const engine=await createOcrEngine();
try {
  for(const name of ['known-text.png','known-text-upside-down.png']) {
    const pages=await engine.process(`.data/ocr-tests/${name}`,'image/png');
    assert.equal(pages.length,1);
    for(const word of ['DMS','839271','FACTURE','742031']) assert(pages[0].text.includes(word),`Known text missing: ${word}`);
    assert(pages[0].confidence>50);
  }
  const arabic=await engine.process('.data/ocr-tests/known-arabic.png','image/png');
  const normalized=arabic[0].text.normalize('NFKD').replace(/\p{M}/gu,'');
  assert(normalized.includes('اختبار') && normalized.includes('النص'),'Arabic test words must be recognized.');
  await assert.rejects(engine.process('.data/ocr-tests/known-text.png','application/pdf'), /./, 'Invalid PDFs must fail instead of being marked complete');
  console.log('Local OCR passed known-text, upside-down text, and Arabic image tests with English/Arabic/French models.');
} finally {await engine.close();}

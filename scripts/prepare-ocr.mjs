import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const target = path.resolve('.data','ocr','models');
fs.mkdirSync(target,{recursive:true});
for (const language of ['eng','ara','fra']) {
  const root = path.dirname(require.resolve(`@tesseract.js-data/${language}`));
  const source = path.join(root,'4.0.0_best_int',`${language}.traineddata.gz`);
  if (!fs.existsSync(source)) throw new Error(`Local ${language} model is missing. Reinstall OCR language packages.`);
  fs.copyFileSync(source,path.join(target,`${language}.traineddata.gz`));
}
console.log('Prepared local English, Arabic and French OCR models.');

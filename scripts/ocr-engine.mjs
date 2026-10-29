import { createWorker } from 'tesseract.js';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

export async function createOcrEngine() {
  const models = path.resolve('.data','ocr','models');
  for (const language of ['eng','ara','fra']) if (!fs.existsSync(path.join(models,`${language}.traineddata.gz`))) throw new Error('OCR models are missing. Run npm.cmd run ocr:prepare.');
  const library = await PDFiumLibrary.init();
  let worker;
  try { worker = await createWorker(['eng','ara','fra'],1,{langPath:models,gzip:true,cacheMethod:'none',errorHandler:()=>{}}); }
  catch(error) { library.destroy(); throw error; }
  await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'200'});
  const recognize = async png => {
    const read = async (angle,segmentation='3') => {
      const {data}=await worker.recognize(png,{rotateRadians:angle,tessedit_pageseg_mode:segmentation});
      return {text:data.text.trim(),confidence:Number.isFinite(data.confidence)?data.confidence:0,rotation:Math.round(angle*180/Math.PI)};
    };
    const letters=result=>(result.text.match(/[\p{L}\p{N}]/gu)||[]).length;
    const score=result=>letters(result)?result.confidence*(0.8+0.2*Math.min(letters(result)/100,1)):0;
    let best=await read(0);
    if(best.confidence<75 || letters(best)<10) {
      for(const angle of [Math.PI,Math.PI/2,Math.PI*1.5]) {
        const candidate=await read(angle);
        if(score(candidate)>score(best))best=candidate;
        if(best.confidence>=80 && letters(best)>=10)break;
      }
    }
    // Sparse captions and short Arabic lines may be missed by full-page layout
    // detection. Try a single-line layout only when the full-page result is weak.
    if(best.confidence<75 || letters(best)<10) {
      for(const angle of [0,Math.PI,Math.PI/2,Math.PI*1.5]) {
        const candidate=await read(angle,'7');
        if(score(candidate)>score(best))best=candidate;
        if(best.confidence>=80 && letters(best)>=10)break;
      }
    }
    return best;
  };
  return {
    async process(file,mimeType,onPage=()=>{},onRender=null) {
      const bytes=fs.readFileSync(file);
      if(bytes.length>100*1024*1024) throw new Error('OCR supports files up to 100 MB.');
      const pages=[];
      if(mimeType!=='application/pdf') {
        const page=await recognize(bytes);
        await onPage({...page,page:1,total:1});
        return [{...page,page:1}];
      }
      const document=await library.loadDocument(bytes);
      try {
        const total=document.getPageCount();
        if(total<1 || total>100) throw new Error('OCR supports 1–100 pages per document. Split larger PDFs.');
        for(let index=0;index<total;index++) {
          const page=document.getPage(index);
          try {
            const {originalWidth:w,originalHeight:h}=page.getOriginalSize();
            if(!Number.isFinite(w*h) || w<=0 || h<=0) throw new Error('PDF has invalid page dimensions.');
            const scale=Math.min(200/72,Math.sqrt(12000000/(w*h)),12000/w,12000/h);
            const rendered=await page.render({scale,render:({data,width,height})=>PNG.sync.write({data:Buffer.from(data),width,height})});
            const png=Buffer.from(rendered.data);
            if(onRender) await onRender(png,index+1);
            const result=await recognize(png);
            if(!result.text) result.text=page.getText().trim();
            const record={...result,page:index+1};
            pages.push(record);
            await onPage({...record,total});
          } finally {page.close();}
        }
      } finally {document.destroy();}
      return pages;
    },
    async close() {await worker.terminate();library.destroy();},
  };
}

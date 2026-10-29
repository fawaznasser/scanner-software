import { readFileSync } from 'node:fs';

export function pdf(pages, dpi) {
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let length = chunks[0].length;
  const append = data => { const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data); chunks.push(bytes); length += bytes.length; };
  const object = (id, bytes) => { offsets[id] = length; append(`${id} 0 obj\n`); append(bytes); append('\nendobj\n'); };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3+i*3} 0 R`).join(' ')}] >>`);
  pages.forEach((page, i) => {
    const id = 3+i*3, width = page.width / dpi * 72, height = page.height / dpi * 72;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Image ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    const image = readFileSync(page.path);
    if (image[0] !== 255 || image[1] !== 216) throw new Error('The driver returned an invalid JPEG image; PDF creation stopped.');
    let components = 3;
    for (let offset = 2; offset + 10 < image.length;) {
      if (image[offset] !== 255) break;
      const marker = image[offset + 1];
      if ([192,193,194].includes(marker)) { components = image[offset + 9]; break; }
      const segmentLength = image.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += segmentLength + 2;
    }
    object(id+1, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace ${components === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]));
    const content = `q ${width} 0 0 ${height} 0 0 cm /Image Do Q`;
    object(id+2, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10,'0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(chunks);
}

/**
 * A PDF with one picture per page (D-135) — what LinkedIn takes as a
 * swipeable document post. Each page is a JPEG drawn edge to edge, at 96
 * pixels to the inch. Written by hand: a handful of objects and a cross-
 * reference table, rather than a library (§16).
 */
export type PdfPage = { readonly jpeg: Uint8Array; readonly width: number; readonly height: number };

export function makePdf(pages: readonly PdfPage[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string): void => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void): void => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Objects: 1 catalog, 2 page tree, then per page: page, image, contents.
  const pageId = (i: number): number => 3 + i * 3;
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, () => { push('<< /Type /Catalog /Pages 2 0 R >>'); });
  object(2, () => {
    push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
  });

  pages.forEach((page, i) => {
    const w = (page.width * 72) / 96;
    const h = (page.height * 72) / 96;
    const id = pageId(i);
    object(id, () => {
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    });
    object(id + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
      push(page.jpeg);
      push('\nendstream');
    });
    const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(id + 2, () => { push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`); });
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

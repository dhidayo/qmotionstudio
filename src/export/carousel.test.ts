import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';
import { makePdf } from './pdf';

const bytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

describe('the ZIP of carousel slides (D-135)', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('stores every file whole, with a directory that finds each one', async () => {
    const files = [
      { name: 'slide-01.png', data: new Uint8Array([1, 2, 3, 4]) },
      { name: 'slide-02.png', data: new Uint8Array([9, 8, 7]) },
    ];
    const zip = await bytes(makeZip(files, new Date(2026, 9, 10, 12, 0, 0)));
    const view = new DataView(zip.buffer);
    // End-of-directory record: last 22 bytes.
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralAt = view.getUint32(end + 16, true);
    let at = centralAt;
    for (const file of files) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const nameLength = view.getUint16(at + 28, true);
      const localAt = view.getUint32(at + 42, true);
      const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength));
      expect(name).toBe(file.name);
      expect(view.getUint32(at + 16, true)).toBe(crc32(file.data));
      // The local header points at the data itself.
      expect(view.getUint32(localAt, true)).toBe(0x04034b50);
      const dataAt = localAt + 30 + view.getUint16(localAt + 26, true);
      expect([...zip.slice(dataAt, dataAt + file.data.length)]).toEqual([...file.data]);
      at += 46 + nameLength;
    }
  });
});

describe('the PDF of carousel slides (D-135)', () => {
  it('has one page per slide and a cross-reference table that points at every object', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = await bytes(makePdf([{ jpeg, width: 1080, height: 1350 }, { jpeg, width: 1080, height: 1350 }]));
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 810.00 1012.50]');
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBe(8);
    offsets.forEach((offset, i) => { expect(text.slice(offset, offset + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)); });
  });
});

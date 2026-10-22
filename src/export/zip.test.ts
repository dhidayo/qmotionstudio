import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

const bytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

// Written for D-135's carousel; it now carries the project file (D-141).
describe('the stored ZIP (D-135, D-141)', () => {
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

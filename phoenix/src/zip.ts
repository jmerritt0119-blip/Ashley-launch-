// Minimal, dependency-free ZIP writer (store / no compression).
//
// Photos, screenshots and PDFs are already compressed, so storing them
// verbatim costs nothing and keeps this tiny — no library, no CDN, works
// offline, and the file opens natively on iPhone, Mac and Windows.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time pair used by the ZIP headers. */
function dosStamp(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  name: string;
  blob: Blob;
  /** Modification time written into the archive. */
  date?: Date;
}

const MAX_ZIP_BYTES = 3_900_000_000; // 32-bit offsets; zip64 is not implemented

/**
 * Build a .zip Blob from the given entries, reading one file at a time so a
 * phone never holds the whole archive in memory twice.
 */
export async function buildZip(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i, entries.length);

    const nameBytes = encoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(bytes);
    const size = bytes.length;
    const { time, date } = dosStamp(entry.date ?? new Date());

    if (offset + size > MAX_ZIP_BYTES) {
      throw new Error(
        "This is more than a single zip file can hold. Download the evidence in two batches instead."
      );
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, 0, true); // compression: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed size
    local.setUint32(22, size, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra length

    parts.push(new Uint8Array(local.buffer), nameBytes, entry.blob);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory signature
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint16(30, 0, true); // extra
    dir.setUint16(32, 0, true); // comment
    dir.setUint16(34, 0, true); // disk number
    dir.setUint16(36, 0, true); // internal attrs
    dir.setUint32(38, 0, true); // external attrs
    dir.setUint32(42, offset, true); // local header offset

    const dirEntry = new Uint8Array(46 + nameBytes.length);
    dirEntry.set(new Uint8Array(dir.buffer), 0);
    dirEntry.set(nameBytes, 46);
    central.push(dirEntry);

    offset += 30 + nameBytes.length + size;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true); // comment length

  onProgress?.(entries.length, entries.length);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: "application/zip",
  });
}

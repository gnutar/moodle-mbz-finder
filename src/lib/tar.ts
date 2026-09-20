// Minimal streaming TAR reader.
//
// Supports plain ustar headers, GNU long-name/long-link extensions (typeflag
// 'L'/'K') and PAX extended headers (typeflag 'x'/'g'), including the
// base-256 encoding GNU tar uses for numeric fields that don't fit in the
// classic octal-ASCII width (needed for files >= 8 GiB).
//
// Entries are yielded one at a time. Whatever the caller does not consume
// from an entry's body is skipped by the reader before advancing, so the
// caller can freely ignore large entries without ever buffering them.

const BLOCK_SIZE = 512;

export interface TarEntry {
  name: string;
  size: number;
  typeflag: string;
  isFile: boolean;
  isDirectory: boolean;
  /** Reads the whole body into memory. Only use for small (metadata) entries. */
  read(): Promise<Uint8Array>;
  /** Reads the whole body and decodes it as UTF-8 text. */
  readText(): Promise<string>;
  /** Streams the body in chunks, for large entries the caller wants to pipe elsewhere. */
  chunks(): AsyncGenerator<Uint8Array>;
}

class ByteReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private pending: Uint8Array | null = null;
  private pendingOffset = 0;
  private done = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  private async fill(): Promise<boolean> {
    if (this.done) return false;
    const { value, done } = await this.reader.read();
    if (done) {
      this.done = true;
      return false;
    }
    this.pending = value;
    this.pendingOffset = 0;
    return true;
  }

  /** Reads exactly n bytes, or fewer at end of stream (returned length may be < n only at EOF). */
  async readExact(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (!this.pending || this.pendingOffset >= this.pending.length) {
        const ok = await this.fill();
        if (!ok) break;
      }
      const src = this.pending!;
      const avail = src.length - this.pendingOffset;
      const take = Math.min(avail, n - filled);
      out.set(src.subarray(this.pendingOffset, this.pendingOffset + take), filled);
      this.pendingOffset += take;
      filled += take;
    }
    return filled === n ? out : out.subarray(0, filled);
  }

  /** Skips n bytes without buffering them. */
  async skip(n: number): Promise<void> {
    let remaining = n;
    while (remaining > 0) {
      if (!this.pending || this.pendingOffset >= this.pending.length) {
        const ok = await this.fill();
        if (!ok) return;
      }
      const src = this.pending!;
      const avail = src.length - this.pendingOffset;
      const take = Math.min(avail, remaining);
      this.pendingOffset += take;
      remaining -= take;
    }
  }

  /** Yields chunks up to maxChunk bytes each, totalling exactly n bytes. */
  async *readChunks(n: number, maxChunk = 1 << 20): AsyncGenerator<Uint8Array> {
    let remaining = n;
    while (remaining > 0) {
      const take = Math.min(remaining, maxChunk);
      const chunk = await this.readExact(take);
      if (chunk.length === 0) return;
      remaining -= chunk.length;
      yield chunk;
    }
  }
}

function parseOctalOrBase256(field: Uint8Array): number {
  if (field.length > 0 && (field[0] & 0x80) !== 0) {
    // GNU base-256 encoding: high bit of first byte marks binary, rest is big-endian.
    let value = 0n;
    let first = field[0] & 0x7f;
    value = BigInt(first);
    for (let i = 1; i < field.length; i++) {
      value = (value << 8n) | BigInt(field[i]);
    }
    return Number(value);
  }
  let s = "";
  for (const b of field) {
    if (b === 0 || b === 32) continue;
    s += String.fromCharCode(b);
  }
  s = s.trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  return Number.isFinite(n) ? n : 0;
}

function decodeString(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  return new TextDecoder("utf-8").decode(bytes.subarray(0, end));
}

function isAllZero(bytes: Uint8Array): boolean {
  for (const b of bytes) if (b !== 0) return false;
  return true;
}

function parsePaxRecords(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let rest = text;
  while (rest.length > 0) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) break;
    const lenStr = rest.slice(0, spaceIdx);
    const len = parseInt(lenStr, 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = rest.slice(0, len);
    const body = record.slice(spaceIdx + 1, len - 1); // strip trailing \n
    const eq = body.indexOf("=");
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    }
    rest = rest.slice(len);
  }
  return out;
}

export async function* parseTar(stream: ReadableStream<Uint8Array>): AsyncGenerator<TarEntry> {
  const reader = new ByteReader(stream);
  let pendingLongName: string | null = null;
  let pendingPax: Record<string, string> | null = null;
  let zeroBlocks = 0;

  for (;;) {
    const header = await reader.readExact(BLOCK_SIZE);
    if (header.length < BLOCK_SIZE) return; // truncated / EOF
    if (isAllZero(header)) {
      zeroBlocks++;
      if (zeroBlocks >= 2) return; // end-of-archive marker
      continue;
    }
    zeroBlocks = 0;

    const rawName = decodeString(header.subarray(0, 100));
    const sizeField = header.subarray(124, 136);
    let size = parseOctalOrBase256(sizeField);
    const typeflag = String.fromCharCode(header[156] || 0) || "0";
    const magic = decodeString(header.subarray(257, 263));
    const prefix = magic.startsWith("ustar") ? decodeString(header.subarray(345, 500)) : "";

    if (typeflag === "L") {
      // GNU long name: body is the real name of the *next* header.
      const body = await reader.readExact(size);
      pendingLongName = decodeString(body);
      const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
      if (padding) await reader.skip(padding);
      continue;
    }
    if (typeflag === "K") {
      // GNU long link name: not needed for our purposes, skip body.
      const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
      await reader.skip(size + padding);
      continue;
    }
    if (typeflag === "x" || typeflag === "g") {
      const body = await reader.readExact(size);
      const text = new TextDecoder("utf-8").decode(body);
      const records = parsePaxRecords(text);
      if (typeflag === "x") pendingPax = { ...(pendingPax ?? {}), ...records };
      const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
      if (padding) await reader.skip(padding);
      continue;
    }

    let name = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    if (pendingPax?.path) name = pendingPax.path;
    if (pendingPax?.size) size = parseInt(pendingPax.size, 10);
    pendingLongName = null;
    pendingPax = null;

    let bytesConsumed = 0;
    const entrySize = size;

    const entry: TarEntry = {
      name,
      size: entrySize,
      typeflag,
      isFile: typeflag === "0" || typeflag === "\0" || typeflag === "",
      isDirectory: typeflag === "5" || name.endsWith("/"),
      async read() {
        const parts: Uint8Array[] = [];
        for await (const chunk of this.chunks()) parts.push(chunk);
        const total = parts.reduce((a, p) => a + p.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) {
          out.set(p, off);
          off += p.length;
        }
        return out;
      },
      async readText() {
        const bytes = await this.read();
        return new TextDecoder("utf-8").decode(bytes);
      },
      async *chunks() {
        const remaining = entrySize - bytesConsumed;
        if (remaining <= 0) return;
        for await (const chunk of reader.readChunks(remaining)) {
          bytesConsumed += chunk.length;
          yield chunk;
        }
      },
    };

    yield entry;

    const leftover = entrySize - bytesConsumed;
    if (leftover > 0) await reader.skip(leftover);
    const padding = (BLOCK_SIZE - (entrySize % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) await reader.skip(padding);
  }
}

import { parseTar, type TarEntry } from "./tar";

/**
 * Wraps a File's byte stream so we can report how many *compressed* bytes
 * have been read so far, as a proxy for overall progress (the true
 * decompressed size is unknown up front without reading the whole file).
 */
function countingStream(file: File, onBytes: (n: number) => void): ReadableStream<Uint8Array> {
  const source = file.stream();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      (async function pump() {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            onBytes(value.byteLength);
            controller.enqueue(value);
          }
        } catch (err) {
          controller.error(err);
        }
      })();
    },
  });
}

export interface MbzEntriesOptions {
  onBytesRead?: (bytesRead: number, totalBytes: number) => void;
}

/**
 * Opens a .mbz (gzip-compressed tar) file and yields its tar entries in
 * order, without ever holding the whole file (compressed or decompressed)
 * in memory at once.
 */
export function readMbzEntries(file: File, opts: MbzEntriesOptions = {}): AsyncGenerator<TarEntry> {
  let bytesRead = 0;
  const raw = countingStream(file, (n) => {
    bytesRead += n;
    opts.onBytesRead?.(bytesRead, file.size);
  });
  // The DOM lib's generic ArrayBuffer typing for DecompressionStream doesn't
  // line up with ReadableStream<Uint8Array> at the type level even though it
  // is correct at runtime; cast through the stream pair type.
  const decompressed = raw.pipeThrough(
    new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  return parseTar(decompressed);
}

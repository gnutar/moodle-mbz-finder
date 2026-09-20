import { Zip, ZipPassThrough } from "fflate";
import { readMbzEntries } from "../lib/mbzReader";

export interface ExtractTargetInput {
  entryName: string;
  zipPath: string;
  size: number;
}

export interface ExtractRequest {
  type: "extract";
  file: File;
  targets: ExtractTargetInput[];
  mode: "single" | "zip";
}

export type ExtractMessage =
  | { type: "progress"; bytesRead: number; totalBytes: number; matchedCount: number; totalTargets: number }
  | { type: "zipChunk"; chunk: Uint8Array; final: boolean }
  | { type: "singleResult"; data: Uint8Array }
  | { type: "done" }
  | { type: "error"; message: string };

function post(msg: ExtractMessage, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

self.onmessage = async (ev: MessageEvent<ExtractRequest>) => {
  const msg = ev.data;
  if (msg.type !== "extract") return;
  const { file, targets, mode } = msg;

  try {
    const wanted = new Map<string, ExtractTargetInput[]>();
    for (const t of targets) {
      const arr = wanted.get(t.entryName) ?? [];
      arr.push(t);
      wanted.set(t.entryName, arr);
    }
    let remaining = wanted.size;
    let matchedCount = 0;

    let zip: Zip | null = null;
    const streams = new Map<string, ZipPassThrough>();
    let zipError: Error | null = null;

    if (mode === "zip") {
      zip = new Zip((err, chunk, final) => {
        if (err) {
          zipError = err;
          return;
        }
        post({ type: "zipChunk", chunk, final }, [chunk.buffer]);
      });
      for (const t of targets) {
        const s = new ZipPassThrough(t.zipPath);
        zip.add(s);
        streams.set(t.zipPath, s);
      }
    }

    const singleChunks: Uint8Array[] = [];
    let lastPost = 0;

    for await (const entry of readMbzEntries(file, {
      onBytesRead: (bytesRead, totalBytes) => {
        const now = Date.now();
        if (now - lastPost > 80) {
          lastPost = now;
          post({ type: "progress", bytesRead, totalBytes, matchedCount, totalTargets: targets.length });
        }
      },
    })) {
      if (zipError) throw zipError;
      const destinations = wanted.get(entry.name);
      if (!destinations) continue;

      if (mode === "single") {
        for await (const chunk of entry.chunks()) singleChunks.push(chunk);
      } else {
        for await (const chunk of entry.chunks()) {
          destinations.forEach((d, i) => {
            const s = streams.get(d.zipPath)!;
            s.push(i === 0 ? chunk : chunk.slice(), false);
          });
        }
        for (const d of destinations) streams.get(d.zipPath)!.push(new Uint8Array(0), true);
      }

      matchedCount += destinations.length;
      wanted.delete(entry.name);
      remaining--;
      if (remaining <= 0) break;
    }

    if (mode === "single") {
      const total = singleChunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of singleChunks) {
        out.set(c, off);
        off += c.length;
      }
      post({ type: "singleResult", data: out }, [out.buffer]);
    } else {
      zip!.end();
    }
    post({ type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", message });
  }
};

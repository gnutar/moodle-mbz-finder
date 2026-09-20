import type { ExportTarget } from "./exportPlan";
import type { ExtractMessage, ExtractRequest } from "../worker/extract.worker";
import ExtractWorker from "../worker/extract.worker?worker";

export interface ExtractProgress {
  bytesRead: number;
  totalBytes: number;
  matchedCount: number;
  totalTargets: number;
}

export interface ExtractHandle {
  promise: Promise<void>;
  cancel(): void;
}

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const table: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    html: "text/html",
    htm: "text/html",
    txt: "text/plain",
    zip: "application/zip",
  };
  return table[ext] ?? "application/octet-stream";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Runs a second streaming pass over the .mbz to pull out just the requested
 * files, then downloads them either as a single file or as a ZIP (STORE,
 * uncompressed) built on the fly. The output is accumulated in memory before
 * the final download, so this is only suitable for exporting a subset of the
 * archive, not the whole thing.
 */
export function extractFiles(
  file: File,
  targets: ExportTarget[],
  outputZipName: string,
  onProgress: (p: ExtractProgress) => void,
): ExtractHandle {
  const worker = new ExtractWorker();
  const zipChunks: Uint8Array[] = [];

  const promise = new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<ExtractMessage>) => {
      const msg = ev.data;
      switch (msg.type) {
        case "progress":
          onProgress(msg);
          break;
        case "zipChunk":
          zipChunks.push(msg.chunk);
          break;
        case "singleResult": {
          const blob = new Blob([msg.data as unknown as BlobPart], { type: guessMimeType(targets[0]?.filename ?? "") });
          triggerDownload(blob, targets[0]?.filename ?? "download");
          break;
        }
        case "done":
          if (zipChunks.length > 0) {
            const blob = new Blob(zipChunks as unknown as BlobPart[], { type: "application/zip" });
            triggerDownload(blob, outputZipName);
          }
          worker.terminate();
          resolve();
          break;
        case "error":
          worker.terminate();
          reject(new Error(msg.message));
          break;
      }
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || "抽出中にエラーが発生しました"));
    };
  });

  const mode: ExtractRequest["mode"] = targets.length === 1 ? "single" : "zip";
  const req: ExtractRequest = {
    type: "extract",
    file,
    targets: targets.map((t) => ({ entryName: t.entryName, zipPath: t.zipPath, size: t.size })),
    mode,
  };
  worker.postMessage(req);

  return { promise, cancel: () => worker.terminate() };
}

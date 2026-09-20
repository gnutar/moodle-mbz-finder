import { useCallback, useRef, useState } from "react";
import type { BackupIndex } from "../types/backup";
import { loadCachedIndex, saveCachedIndex } from "../lib/cache";
import { parseBundle } from "../lib/parseBundle";
import type { AnalyzeProgress, AnalyzeRequest } from "../worker/analyze.worker";
import AnalyzeWorker from "../worker/analyze.worker?worker";

export type AnalyzeState =
  | { status: "idle" }
  | { status: "analyzing"; bytesRead: number; totalBytes: number }
  | { status: "ready"; index: BackupIndex; file: File; fromCache: boolean }
  | { status: "error"; message: string };

export function useAnalyzeMbz() {
  const [state, setState] = useState<AnalyzeState>({ status: "idle" });
  const workerRef = useRef<Worker | null>(null);

  const analyze = useCallback(async (file: File) => {
    setState({ status: "analyzing", bytesRead: 0, totalBytes: file.size });

    const cacheKey = { fileName: file.name, fileSize: file.size, lastModified: file.lastModified };
    const cached = await loadCachedIndex(cacheKey);
    if (cached) {
      setState({ status: "ready", index: cached, file, fromCache: true });
      return;
    }

    workerRef.current?.terminate();
    const worker = new AnalyzeWorker();
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<AnalyzeProgress>) => {
      const msg = ev.data;
      if (msg.type === "progress") {
        setState({ status: "analyzing", bytesRead: msg.bytesRead, totalBytes: msg.totalBytes });
      } else if (msg.type === "done") {
        const index = parseBundle(msg.bundle);
        setState({ status: "ready", index, file, fromCache: false });
        void saveCachedIndex(cacheKey, index);
      } else if (msg.type === "error") {
        setState({ status: "error", message: msg.message });
      }
    };
    worker.onerror = (ev) => {
      setState({ status: "error", message: ev.message || "解析中にエラーが発生しました" });
    };
    const req: AnalyzeRequest = { type: "analyze", file };
    worker.postMessage(req);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, analyze, reset };
}

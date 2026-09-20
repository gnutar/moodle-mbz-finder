import { readMbzEntries } from "../lib/mbzReader";
import type { RawBundle, TarEntryMeta } from "../types/backup";

export interface AnalyzeRequest {
  type: "analyze";
  file: File;
}

export type AnalyzeProgress =
  | { type: "progress"; bytesRead: number; totalBytes: number; entriesSeen: number }
  | { type: "done"; bundle: RawBundle }
  | { type: "error"; message: string };

const SECTION_XML_RE = /^sections\/([^/]+)\/section\.xml$/;
const INFOREF_XML_RE = /^activities\/([^/]+)\/inforef\.xml$/;

self.onmessage = async (ev: MessageEvent<AnalyzeRequest>) => {
  const msg = ev.data;
  if (msg.type !== "analyze") return;
  const file = msg.file;

  try {
    const bundle: RawBundle = {
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      backupXml: null,
      courseXml: null,
      filesXml: null,
      sectionXml: {},
      inforefXml: {},
      entries: [],
    };

    let entriesSeen = 0;
    let lastPost = 0;

    for await (const entry of readMbzEntries(file, {
      onBytesRead: (bytesRead, totalBytes) => {
        const now = Date.now();
        if (now - lastPost > 80) {
          lastPost = now;
          const progress: AnalyzeProgress = { type: "progress", bytesRead, totalBytes, entriesSeen };
          (self as unknown as Worker).postMessage(progress);
        }
      },
    })) {
      entriesSeen++;

      if (entry.isDirectory) continue;

      const meta: TarEntryMeta = { name: entry.name, size: entry.size };
      bundle.entries.push(meta);

      if (entry.name === "moodle_backup.xml") {
        bundle.backupXml = await entry.readText();
        continue;
      }
      if (entry.name === "course/course.xml") {
        bundle.courseXml = await entry.readText();
        continue;
      }
      if (entry.name === "files.xml") {
        bundle.filesXml = await entry.readText();
        continue;
      }
      const sectionMatch = entry.name.match(SECTION_XML_RE);
      if (sectionMatch) {
        bundle.sectionXml[sectionMatch[1]] = await entry.readText();
        continue;
      }
      const inforefMatch = entry.name.match(INFOREF_XML_RE);
      if (inforefMatch) {
        bundle.inforefXml[inforefMatch[1]] = await entry.readText();
        continue;
      }
      // Everything else (files/, activity module XML, users.xml, logs, ...)
      // is left unread; the tar reader skips its bytes without buffering them.
    }

    const done: AnalyzeProgress = { type: "done", bundle };
    (self as unknown as Worker).postMessage(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errMsg: AnalyzeProgress = { type: "error", message };
    (self as unknown as Worker).postMessage(errMsg);
  }
};

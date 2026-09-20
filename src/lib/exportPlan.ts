import type { ActivityNode, BackupIndex, SectionNode } from "../types/backup";

export interface ExportTarget {
  entryName: string;
  zipPath: string;
  size: number;
  filename: string;
}

function sanitizeSegment(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "unnamed";
}

export interface SelectedActivity {
  section: SectionNode | null;
  activity: ActivityNode;
}

/** Files belonging to one activity, resolved to their location in the archive. */
export function resolveActivityFiles(index: BackupIndex, activity: ActivityNode): { meta: (typeof index.fileMap)[string]; entryName: string }[] {
  const dirKey = activity.directory.split("/").pop() ?? activity.directory;
  const fileIds = index.activityFileIds[dirKey] ?? [];
  const out: { meta: (typeof index.fileMap)[string]; entryName: string }[] = [];
  for (const id of fileIds) {
    const meta = index.fileMap[id];
    if (!meta || !meta.contenthash || !meta.filename) continue;
    const entryName = index.fileEntriesByHash[meta.contenthash];
    if (!entryName) continue;
    out.push({ meta, entryName });
  }
  return out;
}

/** Builds a flat, collision-free export plan for a set of selected activities. */
export function planExport(index: BackupIndex, selected: SelectedActivity[]): ExportTarget[] {
  const targets: ExportTarget[] = [];
  const usedPaths = new Set<string>();

  for (const { section, activity } of selected) {
    const sectionLabel = section ? sanitizeSegment(section.title) : "その他";
    const activityLabel = sanitizeSegment(activity.title);
    const files = resolveActivityFiles(index, activity);
    for (const { meta, entryName } of files) {
      let zipPath = `${sectionLabel}/${activityLabel}/${sanitizeSegment(meta.filename)}`;
      if (usedPaths.has(zipPath)) {
        const dot = zipPath.lastIndexOf(".");
        let n = 2;
        let candidate: string;
        do {
          candidate = dot > 0 ? `${zipPath.slice(0, dot)} (${n})${zipPath.slice(dot)}` : `${zipPath} (${n})`;
          n++;
        } while (usedPaths.has(candidate));
        zipPath = candidate;
      }
      usedPaths.add(zipPath);
      targets.push({ entryName, zipPath, size: meta.filesize, filename: meta.filename });
    }
  }
  return targets;
}

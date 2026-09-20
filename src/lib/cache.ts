import { createStore, get, set, del } from "idb-keyval";
import type { BackupIndex, CacheKeyInput } from "../types/backup";

const store = createStore("moodle-mbz-finder", "analysis-cache");

/**
 * Cache key deliberately avoids hashing the whole (possibly multi-GB) file.
 * Name + size + last-modified is enough to catch the common case of
 * reopening the same file; course id / backup date are folded in once the
 * file has actually been parsed once (see `remember`), giving a slightly
 * stronger key for subsequent lookups without ever re-reading the file
 * just to compute a key.
 */
function keyFor(input: CacheKeyInput): string {
  return `${input.fileName}::${input.fileSize}::${input.lastModified}`;
}

export async function loadCachedIndex(input: CacheKeyInput): Promise<BackupIndex | undefined> {
  try {
    return await get<BackupIndex>(keyFor(input), store);
  } catch {
    return undefined;
  }
}

export async function saveCachedIndex(input: CacheKeyInput, index: BackupIndex): Promise<void> {
  try {
    await set(keyFor(input), index, store);
  } catch {
    // IndexedDB unavailable (e.g. private browsing) — caching is best-effort.
  }
}

export async function clearCachedIndex(input: CacheKeyInput): Promise<void> {
  try {
    await del(keyFor(input), store);
  } catch {
    // ignore
  }
}

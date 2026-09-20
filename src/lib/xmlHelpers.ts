// Small DOMParser-based helpers for reading the simple, flat XML that
// Moodle's backup format uses. Only intended for use on the main thread
// (DOMParser support inside Web Workers is inconsistent across browsers).

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

export function directChildren(parent: Element | Document, tag: string): Element[] {
  const root = "documentElement" in parent ? parent.documentElement : parent;
  if (!root) return [];
  return Array.from(root.children).filter((c) => c.tagName === tag);
}

export function childrenOf(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter((c) => c.tagName === tag);
}

export function childText(parent: Element | null | undefined, tag: string): string | undefined {
  if (!parent) return undefined;
  const el = Array.from(parent.children).find((c) => c.tagName === tag);
  const text = el?.textContent;
  return text == null ? undefined : text.trim();
}

export function firstChild(parent: Element | Document, tag: string): Element | undefined {
  const root = "documentElement" in parent ? parent.documentElement : (parent as Element);
  if (!root) return undefined;
  if (root.tagName === tag) return root;
  return Array.from(root.children).find((c) => c.tagName === tag);
}

export function toInt(text: string | undefined | null): number | null {
  if (text == null || text === "") return null;
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}

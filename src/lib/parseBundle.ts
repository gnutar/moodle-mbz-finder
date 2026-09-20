import type {
  ActivityNode,
  BackupIndex,
  BackupSetting,
  BackupSummary,
  FileMeta,
  RawBundle,
  SectionNode,
  TarEntryMeta,
} from "../types/backup";
import { childrenOf, childText, firstChild, parseXml, toInt } from "./xmlHelpers";
import { SUBMISSION_MODULE_TYPES } from "./moduleTypes";

function parseSettings(informationEl: Element): BackupSetting[] {
  const settingsEl = firstChild(informationEl, "settings");
  if (!settingsEl) return [];
  return childrenOf(settingsEl, "setting").map((s) => ({
    name: childText(s, "name") ?? "",
    value: childText(s, "value") ?? "",
    level: childText(s, "level"),
    activity: childText(s, "activity"),
    section: childText(s, "section"),
  }));
}

function settingValue(settings: BackupSetting[], name: string): string | undefined {
  return settings.find((s) => s.level === "root" && s.name === name)?.value;
}

function parseSummary(bundle: RawBundle, settings: BackupSetting[], informationEl: Element | null): BackupSummary {
  const details = informationEl ? firstChild(informationEl, "details") : undefined;
  const firstDetail = details ? childrenOf(details, "detail")[0] : undefined;
  const backupType = firstDetail ? childText(firstDetail, "type") ?? null : null;

  const usersVal = settingValue(settings, "users");
  const logsVal = settingValue(settings, "logs") ?? settingValue(settings, "logstores");
  const roleAssignmentsVal = settingValue(settings, "role_assignments");
  const gradeHistoriesVal = settingValue(settings, "grade_histories");

  const partialFlag =
    (backupType != null && backupType !== "course") ||
    settings.some((s) => (s.activity || s.section) && /included$/i.test(s.name) && s.value === "0");

  return {
    fileName: bundle.fileName,
    fileSize: bundle.fileSize,
    lastModified: bundle.lastModified,
    backupName: informationEl ? childText(informationEl, "name") ?? null : null,
    moodleVersion: informationEl ? childText(informationEl, "moodle_version") ?? null : null,
    moodleRelease: informationEl ? childText(informationEl, "moodle_release") ?? null : null,
    backupRelease: informationEl ? childText(informationEl, "backup_release") ?? null : null,
    backupDate: informationEl ? toInt(childText(informationEl, "backup_date")) : null,
    backupType,
    originalCourseFullname: informationEl ? childText(informationEl, "original_course_fullname") ?? null : null,
    originalCourseShortname: informationEl ? childText(informationEl, "original_course_shortname") ?? null : null,
    originalCourseFormat: informationEl ? childText(informationEl, "original_course_format") ?? null : null,
    originalCourseId: informationEl ? childText(informationEl, "original_course_id") ?? null : null,
    courseId: null, // filled in by caller once contents/course is parsed
    includesUsers: usersVal === "1",
    includesLogs: logsVal === "1",
    includesRoleAssignments: roleAssignmentsVal === "1",
    includesGradeHistories: gradeHistoriesVal === "1",
    isPartialBackup: partialFlag,
    settings,
  };
}

function parseFilesXml(filesXml: string | null): Record<string, FileMeta> {
  const map: Record<string, FileMeta> = {};
  if (!filesXml) return map;
  const doc = parseXml(filesXml);
  const root = doc.documentElement;
  if (!root) return map;
  for (const fileEl of childrenOf(root, "file")) {
    const id = fileEl.getAttribute("id") ?? "";
    const filename = childText(fileEl, "filename") ?? "";
    if (!id || !filename || filename === ".") continue; // directory placeholder rows
    map[id] = {
      id,
      contenthash: childText(fileEl, "contenthash") ?? "",
      filename,
      filepath: childText(fileEl, "filepath") ?? "/",
      filesize: toInt(childText(fileEl, "filesize")) ?? 0,
      component: childText(fileEl, "component") ?? "",
      filearea: childText(fileEl, "filearea") ?? "",
      itemid: childText(fileEl, "itemid") ?? "0",
      mimetype: childText(fileEl, "mimetype") ?? "",
    };
  }
  return map;
}

function parseInforefFileIds(xml: string): string[] {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root) return [];
  const fileref = firstChild(root, "fileref");
  if (!fileref) return [];
  const ids: string[] = [];
  for (const fileEl of childrenOf(fileref, "file")) {
    const id = childText(fileEl, "id");
    if (id) ids.push(id);
  }
  return ids;
}

function parseSectionMeta(xml: string): { number: number | null; sequence: string[] } {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root) return { number: null, sequence: [] };
  const number = toInt(childText(root, "number"));
  const sequenceRaw = childText(root, "sequence") ?? "";
  const sequence = sequenceRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { number, sequence };
}

function sumEntrySizes(entries: TarEntryMeta[], prefix: string): number {
  let total = 0;
  for (const e of entries) {
    if (e.name === prefix || e.name.startsWith(prefix + "/")) total += e.size;
  }
  return total;
}

export function parseBundle(bundle: RawBundle): BackupIndex {
  const backupDoc = bundle.backupXml ? parseXml(bundle.backupXml) : null;
  const informationEl = backupDoc ? firstChild(backupDoc, "information") : undefined;
  const settings = informationEl ? parseSettings(informationEl) : [];
  const summary = parseSummary(bundle, settings, informationEl ?? null);

  const contentsEl = informationEl ? firstChild(informationEl, "contents") : undefined;

  const fileMap = parseFilesXml(bundle.filesXml);

  const activityFileIds: Record<string, string[]> = {};
  for (const [dir, xml] of Object.entries(bundle.inforefXml)) {
    activityFileIds[dir] = parseInforefFileIds(xml);
  }

  // --- sections ---
  const sectionEls = contentsEl ? childrenOf(firstChild(contentsEl, "sections") ?? contentsEl, "section") : [];
  const sections: SectionNode[] = sectionEls.map((el, idx) => {
    const sectionId = childText(el, "sectionid") ?? String(idx);
    const directory = childText(el, "directory") ?? "";
    const dirKey = directory.split("/").pop() ?? directory;
    const meta = bundle.sectionXml[dirKey] ? parseSectionMeta(bundle.sectionXml[dirKey]) : { number: null, sequence: [] };
    return {
      sectionId,
      title: childText(el, "title") ?? `Section ${sectionId}`,
      number: meta.number,
      directory,
      activities: [],
      approxSizeBytes: 0,
      _sequence: meta.sequence,
      _order: idx,
    } as SectionNode & { _sequence: string[]; _order: number };
  });
  sections.sort((a, b) => {
    const an = (a as { number: number | null }).number;
    const bn = (b as { number: number | null }).number;
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1;
    if (bn != null) return 1;
    return (a as unknown as { _order: number })._order - (b as unknown as { _order: number })._order;
  });

  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));

  // --- activities ---
  const activityEls = contentsEl ? childrenOf(firstChild(contentsEl, "activities") ?? contentsEl, "activity") : [];
  const unassignedActivities: ActivityNode[] = [];

  activityEls.forEach((el, idx) => {
    const sectionId = childText(el, "sectionid") ?? "";
    const directory = childText(el, "directory") ?? "";
    const moduleName = childText(el, "modulename") ?? "";
    // The activity's own directory only holds small metadata (module.xml,
    // inforef.xml, ...) — actual attached-file content lives in the shared
    // files/ pool, addressed via inforef.xml -> files.xml. Sum those sizes
    // instead of the directory's own (negligible) footprint, since that's
    // what an export of this activity will actually produce.
    const dirKey = directory.split("/").pop() ?? directory;
    // Moodle's directory naming convention is "<modname>_<cmid>" — a stable,
    // always-present fallback for whichever id field isn't present (or
    // isn't under the tag name we expect) in this particular backup. The
    // element index is a last-resort tiebreaker so a selection checkbox is
    // never accidentally shared by more than one activity.
    const dirDerivedId = dirKey.match(/_(\d+)$/)?.[1] ?? dirKey;
    const moduleId = childText(el, "moduleid") || dirDerivedId;
    const activityId = childText(el, "activityid") || moduleId || dirKey || `activity-${idx}`;
    const fileIds = activityFileIds[dirKey] ?? [];
    const approxSizeBytes = fileIds.reduce((sum, id) => sum + (fileMap[id]?.filesize ?? 0), 0);
    const node: ActivityNode = {
      activityId,
      moduleId,
      moduleName,
      title: childText(el, "title") ?? moduleName,
      sectionId,
      directory,
      approxSizeBytes,
      hasSubmissionData: SUBMISSION_MODULE_TYPES.has(moduleName.toLowerCase()),
    };
    const section = sectionById.get(sectionId);
    if (section) section.activities.push(node);
    else unassignedActivities.push(node);
  });

  for (const section of sections) {
    const sequence = (section as unknown as { _sequence: string[] })._sequence;
    if (sequence.length > 0) {
      const order = new Map(sequence.map((cmid, i) => [cmid, i]));
      section.activities.sort((a, b) => {
        const ai = order.has(a.moduleId) ? order.get(a.moduleId)! : Number.MAX_SAFE_INTEGER;
        const bi = order.has(b.moduleId) ? order.get(b.moduleId)! : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }
    section.approxSizeBytes =
      sumEntrySizes(bundle.entries, section.directory) +
      section.activities.reduce((sum, a) => sum + a.approxSizeBytes, 0);
    delete (section as unknown as { _sequence?: string[] })._sequence;
    delete (section as unknown as { _order?: number })._order;
  }

  // --- course id (for cache keys / display) ---
  const courseEl = contentsEl ? firstChild(contentsEl, "course") : undefined;
  summary.courseId = courseEl ? childText(courseEl, "courseid") ?? null : null;

  const hasLogsData = bundle.entries.some((e) => /(^|\/)logs?\.xml$/i.test(e.name));
  const hasQuestionBank = bundle.entries.some((e) => e.name === "questions.xml" || e.name.includes("/questions.xml"));

  const fileEntriesByHash: Record<string, string> = {};
  for (const e of bundle.entries) {
    if (!e.name.startsWith("files/")) continue;
    const last = e.name.split("/").pop();
    if (last) fileEntriesByHash[last] = e.name;
  }

  return {
    summary,
    sections,
    unassignedActivities,
    fileMap,
    activityFileIds,
    fileEntriesByHash,
    entries: bundle.entries,
    hasLogsData,
    hasQuestionBank,
  };
}

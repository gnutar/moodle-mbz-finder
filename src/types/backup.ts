// Data shapes shared between the analyze worker and the main thread.

/** A tiny (name, size) record kept for every entry in the archive. */
export interface TarEntryMeta {
  name: string;
  size: number;
}

/** Everything the worker extracts as raw text/bytes; parsed into a BackupIndex on the main thread. */
export interface RawBundle {
  fileName: string;
  fileSize: number;
  lastModified: number;
  /** moodle_backup.xml, always present for a moodle2-format backup. */
  backupXml: string | null;
  /** course/course.xml, used for extra course-level detail when present. */
  courseXml: string | null;
  /** files.xml — id -> file metadata (contenthash etc). May be absent if no files were backed up. */
  filesXml: string | null;
  /** sections/section_NNN/section.xml, keyed by directory. */
  sectionXml: Record<string, string>;
  /** activities/MODNAME_NNN/inforef.xml, keyed by directory. Used later to resolve an activity's files. */
  inforefXml: Record<string, string>;
  /** name+size of every entry in the archive (cheap; used for size estimates & presence checks). */
  entries: TarEntryMeta[];
}

export interface FileMeta {
  id: string;
  contenthash: string;
  filename: string;
  filepath: string;
  filesize: number;
  component: string;
  filearea: string;
  itemid: string;
  mimetype: string;
}

export interface ActivityNode {
  activityId: string;
  moduleId: string;
  moduleName: string;
  title: string;
  sectionId: string;
  directory: string;
  /** Total size (bytes) of everything under this activity's directory in the archive, incl. metadata XML. */
  approxSizeBytes: number;
  /** True for module types known to carry user-generated submission data. */
  hasSubmissionData: boolean;
}

export interface SectionNode {
  sectionId: string;
  title: string;
  number: number | null;
  directory: string;
  activities: ActivityNode[];
  approxSizeBytes: number;
}

export interface BackupSetting {
  name: string;
  value: string;
  level?: string;
  activity?: string;
  section?: string;
}

export interface BackupSummary {
  fileName: string;
  fileSize: number;
  lastModified: number;
  backupName: string | null;
  moodleVersion: string | null;
  moodleRelease: string | null;
  backupRelease: string | null;
  backupDate: number | null;
  backupType: string | null;
  originalCourseFullname: string | null;
  originalCourseShortname: string | null;
  originalCourseFormat: string | null;
  originalCourseId: string | null;
  courseId: string | null;
  includesUsers: boolean;
  includesLogs: boolean;
  includesRoleAssignments: boolean;
  includesGradeHistories: boolean;
  isPartialBackup: boolean;
  settings: BackupSetting[];
}

export interface BackupIndex {
  summary: BackupSummary;
  sections: SectionNode[];
  /** Activities whose sectionid didn't match any known section (shouldn't normally happen). */
  unassignedActivities: ActivityNode[];
  fileMap: Record<string, FileMeta>;
  /** activity directory -> list of file ids referenced by that activity (from inforef.xml). */
  activityFileIds: Record<string, string[]>;
  /** contenthash -> tar entry name under files/, so we can locate a file's bytes for extraction. */
  fileEntriesByHash: Record<string, string>;
  entries: TarEntryMeta[];
  hasLogsData: boolean;
  hasQuestionBank: boolean;
}

export interface CacheKeyInput {
  fileName: string;
  fileSize: number;
  lastModified: number;
}

export type SelectionMode = "content" | "submissions" | "logs" | "restore";

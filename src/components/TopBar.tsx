import type { BackupIndex, SelectionMode } from "../types/backup";
import { formatBytes, formatDateTime } from "../lib/format";

interface Props {
  index: BackupIndex;
  mode: SelectionMode;
  onModeChange: (m: SelectionMode) => void;
  onClose: () => void;
  fromCache: boolean;
}

const MODES: { id: SelectionMode; label: string }[] = [
  { id: "content", label: "コンテンツ" },
  { id: "submissions", label: "提出物" },
  { id: "logs", label: "ログ" },
  { id: "restore", label: "Moodle 再利用" },
];

export function TopBar({ index, mode, onModeChange, onClose, fromCache }: Props) {
  const s = index.summary;
  const hasLogs = s.includesLogs || index.hasLogsData;

  return (
    <header className="top-bar">
      <div className="top-bar-main">
        <div className="course-info">
          <h1>{s.originalCourseFullname ?? s.backupName ?? "(コース名不明)"}</h1>
          <div className="course-meta">
            <span>{s.fileName}（{formatBytes(s.fileSize)}）</span>
            <span>バックアップ日時: {formatDateTime(s.backupDate)}</span>
            {s.moodleRelease && <span>Moodle {s.moodleRelease}</span>}
            {fromCache && <span className="cache-hint">前回の解析結果を再利用</span>}
          </div>
          <div className="badges">
            <span className={`badge ${s.includesUsers ? "on" : "off"}`}>
              ユーザー情報{s.includesUsers ? "あり" : "なし"}
            </span>
            <span className={`badge ${hasLogs ? "on" : "off"}`}>ログ{hasLogs ? "あり" : "なし"}</span>
            <span className={`badge ${s.isPartialBackup ? "warn" : "off"}`}>
              {s.isPartialBackup ? "部分バックアップ" : "コース全体"}
            </span>
            {index.hasQuestionBank && <span className="badge on">問題バンクあり</span>}
          </div>
        </div>
        <button className="ghost-btn" onClick={onClose}>
          別のファイルを開く
        </button>
      </div>
      <nav className="mode-tabs">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? "active" : ""} onClick={() => onModeChange(m.id)}>
            {m.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

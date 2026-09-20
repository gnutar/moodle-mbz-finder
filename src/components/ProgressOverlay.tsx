import { formatBytes } from "../lib/format";

interface Props {
  bytesRead: number;
  totalBytes: number;
  label: string;
}

export function ProgressOverlay({ bytesRead, totalBytes, label }: Props) {
  const pct = totalBytes > 0 ? Math.min(100, Math.round((bytesRead / totalBytes) * 100)) : 0;
  return (
    <div className="landing">
      <div className="progress-panel">
        <p className="progress-label">{label}</p>
        <progress value={bytesRead} max={totalBytes || 1} />
        <p className="progress-detail">
          {formatBytes(bytesRead)} / {formatBytes(totalBytes)}（{pct}%）
        </p>
      </div>
    </div>
  );
}

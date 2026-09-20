import { formatBytes } from "../lib/format";
import type { ExtractProgress } from "../lib/extractApi";

interface Props {
  selectedCount: number;
  estimatedBytes: number;
  onExport: () => void;
  exportDisabled: boolean;
  exportDisabledReason?: string;
  progress: ExtractProgress | null;
  error: string | null;
}

export function BottomBar({ selectedCount, estimatedBytes, onExport, exportDisabled, exportDisabledReason, progress, error }: Props) {
  return (
    <footer className="bottom-bar">
      <div className="selection-info">
        選択中: {selectedCount} 件　推定出力サイズ: {formatBytes(estimatedBytes)}
        {error && <span className="export-error">エラー: {error}</span>}
      </div>
      {progress ? (
        <div className="export-progress">
          <span>
            抽出中... {progress.matchedCount}/{progress.totalTargets} ファイル
          </span>
          <progress value={progress.bytesRead} max={progress.totalBytes || 1} />
        </div>
      ) : (
        <button className="export-btn" onClick={onExport} disabled={exportDisabled || selectedCount === 0} title={exportDisabledReason}>
          選択した項目をエクスポート
        </button>
      )}
    </footer>
  );
}

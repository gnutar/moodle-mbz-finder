import type { BackupIndex, SelectionMode } from "../types/backup";

interface Props {
  mode: SelectionMode;
  index: BackupIndex;
  selectedCount: number;
}

function countSubmissionActivities(index: BackupIndex): number {
  let n = 0;
  for (const section of index.sections) {
    for (const a of section.activities) if (a.hasSubmissionData) n++;
  }
  for (const a of index.unassignedActivities) if (a.hasSubmissionData) n++;
  return n;
}

export function ModePanel({ mode, index, selectedCount }: Props) {
  if (mode === "content") {
    return (
      <aside className="side-panel">
        <h2>コンテンツ</h2>
        <p>
          セクション・活動にチェックを付けて選択し、右下の「エクスポート」から取り出せます。
          リソースは元のファイル形式のまま、複数選択時は ZIP にまとめてダウンロードされます。
        </p>
      </aside>
    );
  }

  if (mode === "submissions") {
    const submissionCount = countSubmissionActivities(index);
    return (
      <aside className="side-panel">
        <h2>提出物</h2>
        <p>提出データを持つ可能性がある活動（{submissionCount} 件）をコース構造上でハイライトしています。</p>
        <p className="selected-note">選択中: {selectedCount} 件</p>
        <div className="roadmap-note">
          <strong>今後の実装予定（Phase 3）</strong>
          <ul>
            <li>提出／投稿件数・添付ファイル数・対象ユーザー数の集計表示</li>
            <li>Excel ブック + 添付ファイル一式の ZIP エクスポート</li>
            <li>Moodle 互換形式（提出物ダウンロード相当）でのエクスポート</li>
          </ul>
        </div>
      </aside>
    );
  }

  if (mode === "logs") {
    return (
      <aside className="side-panel">
        <h2>ログ</h2>
        <p>
          {index.hasLogsData
            ? "このバックアップにはログデータが含まれている可能性があります。"
            : "このバックアップにはログデータが含まれていないようです。"}
        </p>
        <div className="roadmap-note">
          <strong>今後の実装予定（Phase 4）</strong>
          <ul>
            <li>最古／最新のログ日時、総件数、日別・週別グラフの表示</li>
            <li>期間・セクション・活動での絞り込み</li>
            <li>CSV（必要に応じて ZIP 分割）でのエクスポート</li>
          </ul>
        </div>
      </aside>
    );
  }

  return (
    <aside className="side-panel">
      <h2>Moodle 再利用形式</h2>
      <p>選択したセクション・活動だけを含む .mbz を再構成し、Moodle へリストアできる形式で出力する機能です。</p>
      <div className="roadmap-note">
        <strong>今後の実装予定（Phase 5・6）</strong>
        <ul>
          <li>部分バックアップ .mbz の再構成</li>
          <li>Moodle 4.5 でのリストア互換性検証</li>
          <li>小テスト（問題バンク依存）・Flexible Sections 等のプラグイン対応</li>
        </ul>
      </div>
      {index.hasQuestionBank && <p className="hint">このバックアップには問題バンクのデータが含まれています。</p>}
    </aside>
  );
}

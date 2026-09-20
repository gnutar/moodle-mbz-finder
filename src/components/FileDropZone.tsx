import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
}

export function FileDropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className="landing">
      <div
        className={`drop-zone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mbz"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="drop-title">Moodle バックアップファイル（.mbz）をドラッグ＆ドロップ<br />または クリックして選択</p>
        <p className="drop-hint">ファイルはサーバーへアップロードされず、すべてブラウザ内で処理されます。</p>
      </div>
      <p className="landing-note">
        大きな .mbz ファイルでも全体をメモリに展開しません。まずコース構造とバックアップ概要を読み取ります。
      </p>
    </div>
  );
}

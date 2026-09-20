import { useCallback, useMemo, useState } from "react";
import { useAnalyzeMbz } from "./hooks/useAnalyzeMbz";
import { FileDropZone } from "./components/FileDropZone";
import { ProgressOverlay } from "./components/ProgressOverlay";
import { TopBar } from "./components/TopBar";
import { CourseTree } from "./components/CourseTree";
import { BottomBar } from "./components/BottomBar";
import { ModePanel } from "./components/ModePanel";
import type { SectionNode, SelectionMode } from "./types/backup";
import { planExport, type SelectedActivity } from "./lib/exportPlan";
import { extractFiles, type ExtractProgress } from "./lib/extractApi";

export default function App() {
  const { state, analyze, reset } = useAnalyzeMbz();
  const [mode, setMode] = useState<SelectionMode>("content");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportProgress, setExportProgress] = useState<ExtractProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const index = state.status === "ready" ? state.index : null;

  const selectedActivities: SelectedActivity[] = useMemo(() => {
    if (!index) return [];
    const out: SelectedActivity[] = [];
    for (const section of index.sections) {
      for (const activity of section.activities) {
        if (selected.has(activity.activityId)) out.push({ section, activity });
      }
    }
    for (const activity of index.unassignedActivities) {
      if (selected.has(activity.activityId)) out.push({ section: null, activity });
    }
    return out;
  }, [index, selected]);

  const estimatedBytes = useMemo(
    () => selectedActivities.reduce((sum, s) => sum + s.activity.approxSizeBytes, 0),
    [selectedActivities],
  );

  const handleFile = useCallback(
    (file: File) => {
      setSelected(new Set());
      setExportError(null);
      void analyze(file);
    },
    [analyze],
  );

  const handleClose = useCallback(() => {
    setSelected(new Set());
    setExportError(null);
    setExportProgress(null);
    reset();
  }, [reset]);

  const toggleActivity = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSection = useCallback((section: SectionNode) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = section.activities.length > 0 && section.activities.every((a) => next.has(a.activityId));
      for (const a of section.activities) {
        if (allSelected) next.delete(a.activityId);
        else next.add(a.activityId);
      }
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    if (!index || state.status !== "ready") return;
    const targets = planExport(index, selectedActivities);
    if (targets.length === 0) {
      setExportError("選択した活動には抽出可能なファイルが見つかりませんでした。");
      return;
    }
    setExportError(null);
    const zipName = `${index.summary.originalCourseShortname ?? index.summary.originalCourseFullname ?? "export"}.zip`;
    const handle = extractFiles(state.file, targets, zipName, (p) => setExportProgress(p));
    handle.promise
      .then(() => setExportProgress(null))
      .catch((err: Error) => {
        setExportProgress(null);
        setExportError(err.message);
      });
  }, [index, selectedActivities, state]);

  if (state.status === "idle" || state.status === "error") {
    return (
      <div className="app">
        <FileDropZone onFile={handleFile} />
        {state.status === "error" && <p className="global-error">エラー: {state.message}</p>}
      </div>
    );
  }

  if (state.status === "analyzing") {
    return (
      <div className="app">
        <ProgressOverlay bytesRead={state.bytesRead} totalBytes={state.totalBytes} label="バックアップを解析しています…" />
      </div>
    );
  }

  return (
    <div className="app app-loaded">
      <TopBar index={state.index} mode={mode} onModeChange={setMode} onClose={handleClose} fromCache={state.fromCache} />
      <div className="main-area">
        <CourseTree
          sections={state.index.sections}
          unassigned={state.index.unassignedActivities}
          selected={selected}
          onToggleActivity={toggleActivity}
          onToggleSection={toggleSection}
          mode={mode}
        />
        <ModePanel mode={mode} index={state.index} selectedCount={selected.size} />
      </div>
      <BottomBar
        selectedCount={selected.size}
        estimatedBytes={estimatedBytes}
        onExport={handleExport}
        exportDisabled={mode !== "content" || exportProgress != null}
        exportDisabledReason={mode !== "content" ? "エクスポートは「コンテンツ」モードで利用できます" : undefined}
        progress={exportProgress}
        error={exportError}
      />
    </div>
  );
}

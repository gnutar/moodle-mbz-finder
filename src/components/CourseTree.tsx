import { useState } from "react";
import type { ActivityNode, SectionNode, SelectionMode } from "../types/backup";
import { formatBytes } from "../lib/format";

interface Props {
  sections: SectionNode[];
  unassigned: ActivityNode[];
  selected: Set<string>;
  onToggleActivity: (id: string) => void;
  onToggleSection: (section: SectionNode) => void;
  mode: SelectionMode;
}

function SectionCheckbox({ checked, indeterminate, onChange, disabled }: { checked: boolean; indeterminate: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
    />
  );
}

function ActivityRow({ activity, selected, onToggle, highlight }: { activity: ActivityNode; selected: boolean; onToggle: () => void; highlight: boolean }) {
  return (
    <li className={highlight ? "activity-row highlight" : "activity-row"}>
      <label>
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span className="activity-modname">[{activity.moduleName || "?"}]</span>
        <span className="activity-title">{activity.title}</span>
        <span className="activity-size">{formatBytes(activity.approxSizeBytes)}</span>
      </label>
    </li>
  );
}

export function CourseTree({ sections, unassigned, selected, onToggleActivity, onToggleSection, mode }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="course-tree">
      {sections.length === 0 && unassigned.length === 0 && (
        <p className="empty-hint">コース構造を読み取れませんでした。</p>
      )}
      {sections.map((section) => {
        const isCollapsed = collapsed.has(section.sectionId);
        const selectedCount = section.activities.filter((a) => selected.has(a.activityId)).length;
        const allSelected = section.activities.length > 0 && selectedCount === section.activities.length;
        const someSelected = selectedCount > 0 && !allSelected;
        return (
          <div className="section" key={section.sectionId}>
            <div className="section-row">
              <button className="collapse-btn" onClick={() => toggleCollapse(section.sectionId)} aria-label="折りたたみ切替">
                {isCollapsed ? "▶" : "▼"}
              </button>
              <SectionCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => onToggleSection(section)}
                disabled={section.activities.length === 0}
              />
              <span className="section-title">
                {section.number != null ? `${section.number}. ` : ""}
                {section.title}
              </span>
              <span className="section-size">{formatBytes(section.approxSizeBytes)}</span>
            </div>
            {!isCollapsed && (
              <ul className="activity-list">
                {section.activities.map((activity) => (
                  <ActivityRow
                    key={activity.activityId}
                    activity={activity}
                    selected={selected.has(activity.activityId)}
                    onToggle={() => onToggleActivity(activity.activityId)}
                    highlight={mode === "submissions" && activity.hasSubmissionData}
                  />
                ))}
                {section.activities.length === 0 && <li className="empty">（活動なし）</li>}
              </ul>
            )}
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div className="section">
          <div className="section-row">
            <span className="section-title">未分類の活動</span>
          </div>
          <ul className="activity-list">
            {unassigned.map((activity) => (
              <ActivityRow
                key={activity.activityId}
                activity={activity}
                selected={selected.has(activity.activityId)}
                onToggle={() => onToggleActivity(activity.activityId)}
                highlight={mode === "submissions" && activity.hasSubmissionData}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

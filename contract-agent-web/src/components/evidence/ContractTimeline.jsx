import { normalizeTimelineItems } from "../../logic.js";

export function ContractTimeline({ timeline }) {
  const timelineItems = normalizeTimelineItems(timeline);
  const items = timelineItems.length > 0 ? timelineItems : [["筛选任务", "已完成"]];

  return (
    <div className="timeline">
      {items.map(([label, value]) => (
        <div className="timeline-item" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

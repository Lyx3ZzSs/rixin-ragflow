import { groupEvidenceBySource } from "../../taskContext.js";
import { EvidenceSourceItem } from "./EvidenceSourceItem.jsx";

export function EvidenceGroupList({ evidence }) {
  const groups = groupEvidenceBySource(evidence);

  if (groups.length === 0) {
    return (
      <ul className="source-list">
        <li className="source-item">
          <strong>暂无引用证据</strong>
          <span>后端未返回证据片段。</span>
        </li>
      </ul>
    );
  }

  return (
    <div className="evidence-groups">
      {groups.map((group) => (
        <section className="evidence-group" key={group.source}>
          <h4>{group.source}</h4>
          <ul className="source-list">
            {group.items.map((evidenceItem, index) => (
              <EvidenceSourceItem evidence={evidenceItem} key={`${group.source}-${evidenceItem.ref || index}`} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

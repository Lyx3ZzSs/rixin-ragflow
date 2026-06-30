export function EvidenceSourceItem({ evidence }) {
  return (
    <li className="source-item">
      <strong>{evidence.ref || "未标注位置"}</strong>
      <span>{evidence.text || "后端未返回证据文本。"}</span>
    </li>
  );
}

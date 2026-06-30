export function KeyValue({ label, value }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value || "未提供"}</strong>
    </div>
  );
}

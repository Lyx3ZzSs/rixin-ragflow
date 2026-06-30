export function ResultMetaRow({ item }) {
  return (
    <div className="result-meta">
      <span>{item.id || "未编号"}</span>
      <span>{item.supplier || "未提供供应商"}</span>
      <span>{item.amount || "金额未提供"}</span>
      <span>{item.expiry || "到期日未提供"}</span>
    </div>
  );
}

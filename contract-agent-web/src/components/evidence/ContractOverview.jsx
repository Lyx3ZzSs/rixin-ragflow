import { KeyValue } from "../ui/KeyValue.jsx";

export function ContractOverview({ item }) {
  return (
    <div className="detail-section">
      <KeyValue label="合同编号" value={item.id} />
      <KeyValue label="供应商" value={item.supplier} />
      <KeyValue label="合同金额" value={item.amount} />
      <KeyValue label="到期日期" value={item.expiry} />
      <KeyValue label="访问权限" value={item.permissions} />
      <KeyValue label="匹配度" value={`${item.score || 0}%`} />
    </div>
  );
}

import { ChevronRightIcon } from "../../icons.jsx";
import { IconButton } from "../ui/IconButton.jsx";
import { ContractOverview } from "./ContractOverview.jsx";
import { ContractTimeline } from "./ContractTimeline.jsx";
import { EvidenceEmptyState } from "./EvidenceEmptyState.jsx";
import { EvidenceGroupList } from "./EvidenceGroupList.jsx";

export function EvidencePanel({ item, onClose }) {
  if (!item) {
    return (
      <div className="evidence-panel">
        <div className="evidence-header">
          <p className="meta">证据详情</p>
          <IconButton label="收起面板" onClick={onClose}>
            <ChevronRightIcon />
          </IconButton>
        </div>
        <div className="evidence-body">
          <EvidenceEmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <p className="meta">证据详情</p>
          <h3>{item.title}</h3>
        </div>
        <IconButton label="收起面板" onClick={onClose}>
          <ChevronRightIcon />
        </IconButton>
      </div>
      <div className="evidence-body">
        <ContractOverview item={item} />

        <div className="detail-section">
          <p className="meta">命中解释</p>
          <p className="body-copy mt-2">{item.reason || "命中当前筛选条件。"}</p>
        </div>

        <div className="detail-section">
          <p className="meta">引用证据</p>
          <EvidenceGroupList evidence={item.evidence} />
        </div>

        <div className="detail-section">
          <p className="meta">关键节点</p>
          <ContractTimeline timeline={item.timeline} />
        </div>
      </div>
    </div>
  );
}

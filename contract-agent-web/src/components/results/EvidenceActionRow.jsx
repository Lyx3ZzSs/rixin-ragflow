import { DownloadIcon, EyeIcon } from "../../icons.jsx";

export function EvidenceActionRow({ evidenceCount, isViewing, downloadUrl }) {
  return (
    <div className="evidence-line">
      {isViewing ? (
        <span className="viewing-badge">
          <EyeIcon /> 正在查看证据
        </span>
      ) : (
        <span className="source-toggle">
          <EyeIcon /> 查看 {evidenceCount} 条证据
        </span>
      )}
      {downloadUrl && (
        <a
          className="btn btn-secondary btn-small download-file-button"
          href={downloadUrl}
          download
          onClick={(event) => {
            event.stopPropagation();
          }}
          title="下载原文件"
        >
          <DownloadIcon /> 下载原文件
        </a>
      )}
    </div>
  );
}

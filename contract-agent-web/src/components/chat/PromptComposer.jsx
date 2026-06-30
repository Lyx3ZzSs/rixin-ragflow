import { NewChatIcon, SendIcon } from "../../icons.jsx";
import { promptExamples } from "../../data.js";

export function PromptComposer({
  isStreaming,
  onSend,
  inputValue,
  setInputValue,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  isKnowledgeBaseLoading,
  knowledgeBaseError,
  inputRef
}) {
  function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming || !selectedKnowledgeBaseId) return;
    onSend(trimmed);
    setInputValue("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-input-bar">
      <div className="kb-toolbar">
        <label className="kb-selector">
          <span>知识库</span>
          <select
            value={selectedKnowledgeBaseId || ""}
            onChange={(event) => onKnowledgeBaseChange(event.target.value)}
            disabled={isStreaming || isKnowledgeBaseLoading || knowledgeBases.length === 0}
          >
            <option value="">{isKnowledgeBaseLoading ? "正在加载知识库..." : "请选择知识库"}</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} · {kb.document_count} 份文档
              </option>
            ))}
          </select>
        </label>
        <span className={`kb-state${knowledgeBaseError ? " is-error" : ""}`}>
          {knowledgeBaseError ? "请选择知识库" : selectedKnowledgeBaseId ? "已连接当前知识库" : "选择知识库后开始筛选"}
        </span>
      </div>
      <div className="chat-input-row">
        <button className="input-plus" type="button" aria-label="添加附件">
          <NewChatIcon />
        </button>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你要找的合同，例如：筛出本季度到期的外包合同..."
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="chat-send"
          type="button"
          onClick={handleSend}
          disabled={isStreaming || !inputValue.trim() || !selectedKnowledgeBaseId}
          aria-label="发送消息"
        >
          <SendIcon /> 发送
        </button>
      </div>
      <div className="chat-hints">
        {promptExamples.slice(0, 2).map((prompt) => (
          <button
            className="btn btn-secondary btn-small"
            key={prompt}
            type="button"
            onClick={() => setInputValue(prompt)}
            disabled={isStreaming || !selectedKnowledgeBaseId}
          >
            {prompt}
          </button>
        ))}
        <span className="muted" style={{ fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", marginLeft: "auto" }}>
          Enter 发送 · Shift+Enter 换行
        </span>
      </div>
    </div>
  );
}

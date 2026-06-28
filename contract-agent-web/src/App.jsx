import React, { useEffect, useMemo, useRef, useState } from "react";
import { createScreeningTask, getKnowledgeBases, getScreeningResults, getScreeningTask } from "./api.js";
import { contracts, promptExamples } from "./data.js";
import {
  buildAuditText,
  buildConversationTitle,
  filterContracts,
  normalizeTimelineItems,
  resolvePollingConfig,
  statusClass,
  strategyToText,
  taskPhaseToLabel
} from "./logic.js";

const DEFAULT_FILTERS = {
  risk: "全部",
  status: "全部",
  source: "全部"
};

const TERMINAL_TASK_STATUSES = new Set(["done", "failed", "cancelled"]);
const POLLING_CONFIG = resolvePollingConfig(import.meta.env);

/* ─── SVG icons ──────────────────────────────────────────────────── */

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8l1.8 6.2H7.4l1.8-6.2A3.9 3.9 0 0 1 8 6a4 4 0 0 1 4-4z" />
      <path d="M9 15h6v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-3z" />
    </svg>
  );
}

/* ─── Header ─────────────────────────────────────────────────────── */

function Header({ historyOpen, evidenceOpen, onToggleHistory, onToggleEvidence }) {
  return (
    <header className="topnav" data-od-id="topnav">
      <div className="container topnav-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={historyOpen ? "收起历史面板" : "展开历史面板"}
            aria-pressed={historyOpen}
            onClick={onToggleHistory}
            title="对话历史"
          >
            <HistoryIcon />
          </button>
          <a className="brand" href="#" aria-label="合同智能筛选 Agent 首页">
            <span className="brand-mark">
              <DocumentIcon />
            </span>
            合同智能筛选
          </a>
        </div>
        <nav aria-label="主导航">
          <span className="status status-strong">对话式工作台</span>
        </nav>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={evidenceOpen ? "收起证据面板" : "展开证据面板"}
          aria-pressed={evidenceOpen}
          onClick={onToggleEvidence}
          title="证据详情"
        >
          <EyeIcon />
        </button>
      </div>
    </header>
  );
}

/* ─── Conversation History Panel (left) ───────────────────────────── */

function ConversationHistory({ conversations, activeId, onSelect, onNew, onDelete }) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <div>
          <p className="meta">对话历史</p>
          <h3 style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-body)", fontWeight: 500, letterSpacing: "normal", marginTop: "4px" }}>
            历史会话
          </h3>
        </div>
        <button className="btn btn-secondary btn-small" type="button" onClick={onNew}>
          <NewChatIcon /> 新建
        </button>
      </div>
      <div className="history-list" role="listbox" aria-label="历史会话列表">
        {conversations.length === 0 ? (
          <p className="history-empty">尚无历史会话，输入筛选目标开始。</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              className={`history-item${conv.id === activeId ? " is-active" : ""}`}
              type="button"
              role="option"
              aria-selected={conv.id === activeId}
              onClick={() => onSelect(conv.id)}
            >
              {conv.title}
              <span className="history-time">{conv.time}</span>
              <span
                className="history-delete"
                title="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
              >
                <TrashIcon />
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Evidence Panel (right) ──────────────────────────────────────── */

function EvidencePanel({ item, onClose, onQueueOne, onCopyEvidence, toastMessage }) {
  if (!item) {
    return (
      <div className="evidence-panel">
        <div className="evidence-header">
          <p className="meta">证据详情</p>
          <button className="sidebar-toggle" type="button" aria-label="收起面板" onClick={onClose}>
            <ChevronRightIcon />
          </button>
        </div>
        <div className="evidence-body">
          <div className="state-panel" style={{ minHeight: "200px" }}>
            <strong>选择合同查看证据</strong>
            <span>在对话结果中点击"查看证据"，将在此处展示合同条款、审批记录、履约信息和供应商评级。</span>
          </div>
        </div>
      </div>
    );
  }

  const evidenceItems = Array.isArray(item.evidence) ? item.evidence : [];
  const actionItems = Array.isArray(item.actions) ? item.actions : [];
  const timelineItems = normalizeTimelineItems(item.timeline);

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <p className="meta">证据详情</p>
          <h3 style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-body)", fontWeight: 500, letterSpacing: "normal", marginTop: "4px" }}>
            {item.title}
          </h3>
        </div>
        <button className="sidebar-toggle" type="button" aria-label="收起面板" onClick={onClose}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="evidence-body">
        <div className="detail-section">
          <KeyValue label="合同编号" value={item.id} />
          <KeyValue label="供应商" value={item.supplier} />
          <KeyValue label="合同金额" value={item.amount} />
          <KeyValue label="到期日期" value={item.expiry} />
          <KeyValue label="访问权限" value={item.permissions} />
          <KeyValue label="匹配度" value={`${item.score}%`} />
        </div>

        <div className="detail-section">
          <p className="meta">命中解释</p>
          <p className="body-copy mt-2">{item.reason}</p>
        </div>

        <div className="detail-section">
          <p className="meta">引用证据</p>
          <ul className="source-list">
            {evidenceItems.map((evidence, index) => (
              <li className="source-item" key={`${evidence.source || "证据"}-${evidence.ref || index}`}>
                <strong>
                  {evidence.source || "合同正文"} · {evidence.ref || "未标注位置"}
                </strong>
                <span>{evidence.text}</span>
              </li>
            ))}
            {evidenceItems.length === 0 && (
              <li className="source-item">
                <strong>暂无引用证据</strong>
                <span>后端未返回证据片段。</span>
              </li>
            )}
          </ul>
        </div>

        <div className="detail-section">
          <p className="meta">下一步动作</p>
          <ul className="action-list">
            {actionItems.map((action) => (
              <li className="action-item" key={action}>
                <strong>{action}</strong>
                <span>可加入采购/法务待办队列并保留当前筛选依据。</span>
              </li>
            ))}
            {actionItems.length === 0 && (
              <li className="action-item">
                <strong>待人工复核</strong>
                <span>可加入采购/法务待办队列并保留当前筛选依据。</span>
              </li>
            )}
          </ul>
        </div>

        <div className="detail-section">
          <p className="meta">关键节点</p>
          <div className="timeline">
            {timelineItems.map(([label, value]) => (
              <div className="timeline-item" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            {timelineItems.length === 0 && (
              <div className="timeline-item">
                <span>筛选任务</span>
                <strong>已完成</strong>
              </div>
            )}
          </div>
        </div>

        <div className="row mt-5">
          <button className="btn btn-primary btn-small" type="button" onClick={() => onQueueOne(item)}>
            加入待办
          </button>
          <button className="btn btn-secondary btn-small" type="button" onClick={() => onCopyEvidence(item)}>
            复制证据
          </button>
          {toastMessage && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--success)", display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "var(--space-2)" }}>
              <CheckIcon /> {toastMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/* ─── Chat View (middle) ─────────────────────────────────────────── */

function ChatView({
  messages,
  isStreaming,
  displayStreaming,
  streamingPhases,
  onSend,
  onViewEvidence,
  viewingItemId,
  onCopyAudit,
  inputValue,
  setInputValue,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  isKnowledgeBaseLoading,
  knowledgeBaseError
}) {
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, streamingPhases]);

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
    <div className="conversation">
      {messages.length === 0 ? (
        <div className="welcome-center">
          <div className="welcome-card">
            <div className="welcome-icon">
              <AgentIcon />
            </div>
            <h1 className="welcome-title">
              合同智能筛选 Agent
            </h1>
            <p className="welcome-lead">
              用自然语言描述你的筛选目标，Agent 将自动生成检索策略、排序结果并提供可追溯的证据链。
            </p>
            <div className="welcome-prompts">
              {promptExamples.map((prompt) => (
                <button
                  className="btn btn-secondary btn-small"
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setInputValue(prompt);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="conversation-body" ref={bodyRef}>
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              viewingItemId={viewingItemId}
              onViewEvidence={onViewEvidence}
              onCopyAudit={() => onCopyAudit(msg)}
            />
          ))}
          {displayStreaming && (
            <div className="chat-bubble agent">
              <span className="bubble-label">Agent</span>
              <div className="bubble-content">
                {streamingPhases && streamingPhases.length > 0 ? (
                  <div>
                    {streamingPhases.map((phase) => (
                      <div
                        key={phase.key}
                        className={`streaming-phase${phase.done ? " is-done" : ""}${!phase.done && phase === streamingPhases[streamingPhases.length - 1] ? " is-active" : ""}`}
                      >
                        <span className="phase-icon">
                          {phase.done ? <CheckIcon /> : phase === streamingPhases[streamingPhases.length - 1] ? <BrainIcon /> : <SearchIcon />}
                        </span>
                        <span>{phase.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span>正在处理...</span>
                )}
                <span className="streaming-cursor" style={{ marginLeft: "2px" }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat input bar */}
      <div className="chat-input-bar">
        <div className="kb-toolbar">
          <label className="kb-selector">
            <span>知识库</span>
            <select
              value={selectedKnowledgeBaseId || ""}
              onChange={(event) => onKnowledgeBaseChange(event.target.value)}
              disabled={isStreaming || isKnowledgeBaseLoading || knowledgeBases.length === 0}
            >
              <option value="">
                {isKnowledgeBaseLoading ? "正在加载知识库..." : "请选择知识库"}
              </option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} · {kb.document_count} 份文档
                </option>
              ))}
            </select>
          </label>
          <span className={`kb-state${knowledgeBaseError ? " is-error" : ""}`}>
            {knowledgeBaseError || (selectedKnowledgeBaseId ? "已连接当前知识库" : "选择知识库后开始筛选")}
          </span>
        </div>
        <div className="chat-input-row">
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
            <SendIcon />
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
    </div>
  );
}

function ChatBubble({ message, viewingItemId, onViewEvidence, onCopyAudit }) {
  const strategyLines = strategyToText(message.strategy).split("\n").filter(Boolean);
  const resultItems = Array.isArray(message.results) ? message.results : [];

  return (
    <div className={`chat-bubble ${message.role}`}>
      <span className="bubble-label">
        {message.role === "user" ? "你" : "Agent"}
      </span>
      <div className="bubble-content">
        {message.content && (
          <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
        )}

        {/* Strategy summary (agent messages) */}
        {strategyLines.length > 0 && (
          <div className="bubble-strategy">
            <p className="strategy-title">检索策略</p>
            <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "var(--text-sm)", color: "var(--fg-2)", display: "grid", gap: "var(--space-1)" }}>
              {strategyLines.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Agent result cards */}
        {resultItems.length > 0 && (
          <div className="chat-results-grid">
            {resultItems.map((item, index) => {
              const evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;

              return (
              <button
                key={item.id || `${item.title}-${index}`}
                className={`chat-result-card${viewingItemId === item.id ? " is-viewing" : ""}`}
                type="button"
                onClick={() => onViewEvidence(item)}
              >
                <div className="result-top">
                  <div>
                    <h3>{item.title}</h3>
                    <div className="result-meta">
                      <span>{item.id}</span>
                      <span>{item.supplier}</span>
                      <span>{item.amount}</span>
                      <span>{item.expiry}</span>
                    </div>
                  </div>
                  <span className="score">{item.score}%</span>
                </div>
                <p className="excerpt">{item.reason}</p>
                <div className="hint-row mt-3">
                  <span className={`status ${statusClass(item.risk)}`}>{item.risk}风险</span>
                  <span className="status status-strong">{item.status}</span>
                  <span className="status">{item.owner}</span>
                </div>
                <div className="evidence-line">
                  {viewingItemId === item.id ? (
                    <span className="viewing-badge">
                      <EyeIcon /> 正在查看证据
                    </span>
                  ) : (
                    <span className="source-toggle">
                      <EyeIcon /> 查看 {evidenceCount} 条证据
                    </span>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────── */

function Toast({ message, visible }) {
  return (
    <div className={`toast${visible ? " show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

/* ─── Search intelligence ────────────────────────────────────────── */

function smartFilter(query) {
  const q = query.toLowerCase();
  const filters = { risk: "全部", status: "全部", source: "全部" };

  // Keyword → filter mapping
  if (q.includes("高") && (q.includes("风险") || q.includes("优先"))) {
    filters.risk = "高";
  }
  if (q.includes("续签") || q.includes("到期") || q.includes("窗口")) {
    filters.status = "续签评估";
  }
  if (q.includes("履约") || q.includes("延期") || q.includes("交付")) {
    filters.source = "履约记录";
  }
  if (q.includes("审批") || q.includes("变更")) {
    filters.source = q.includes("履约") ? filters.source : "审批单";
  }
  if (q.includes("外包")) {
    filters.source = "供应商评级";
  }
  if (q.includes("补充协议") || q.includes("附件")) {
    filters.status = "待补充";
  }

  const results = filterContracts(contracts, filters);
  return { filters, results };
}

function buildStrategySteps(query, filters) {
  const steps = [];
  const q = query.toLowerCase();

  steps.push(
    `字段过滤：限定${q.includes("外包") ? "外包、运维" : "采购、外包、运维"}类合同；到期窗口为未来 90 天`
  );
  steps.push(
    `语义召回：匹配"${q.includes("续签") ? "续签" : "到期"}、${q.includes("履约") ? "履约异常" : "金额"}、${q.includes("风险") ? "风险评级" : "供应商"}等相关表达`
  );
  steps.push(
    `证据复核：合并合同正文${filters.source !== "全部" ? "、" + filters.source : "、审批单、履约记录"}，要求每条至少 2 个证据点`
  );
  steps.push("权限裁剪：仅展示当前角色可访问的合同与附件片段");
  steps.push("综合排序：按风险等级、到期紧迫度、匹配分降序");

  return steps;
}

/* ─── Main App ───────────────────────────────────────────────────── */

let messageIdCounter = 0;
function nextMessageId() {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}`;
}

function buildInitialConversations() {
  const allResults = filterContracts(contracts, DEFAULT_FILTERS);
  const highRiskResults = filterContracts(contracts, { risk: "高", status: "全部", source: "全部" });

  return [
    {
      id: "conv-1",
      title: "高风险续签合同筛选",
      time: "今天 14:32",
      messages: [
        {
          id: nextMessageId(),
          role: "user",
          content: "找出今年 90 天内到期、金额较高、供应商履约风险偏高的采购合同，优先看需要续签决策或补充协议的文件。"
        },
        {
          id: nextMessageId(),
          role: "agent",
          content: "已按字段过滤 → 语义召回 → 证据复核 → 权限裁剪 → 综合排序完成。筛选到 5 份高优先级合同：",
          strategy: [
            "字段过滤：限定采购、外包、运维类合同；到期窗口为未来 90 天及本年度续签窗口",
            "语义召回：匹配「续签、补充协议、延期、扣罚、附件缺失、履约风险」等同义表达",
            "证据复核：合并合同正文、审批单、履约记录和供应商评级，要求每条结果至少 2 个证据点",
            "权限裁剪：仅展示当前角色可访问的合同与附件片段",
            "综合排序：按风险等级、到期紧迫度、匹配分降序"
          ],
          results: allResults
        }
      ]
    },
    {
      id: "conv-2",
      title: "外包合同履约异常排查",
      time: "昨天 09:15",
      messages: [
        {
          id: nextMessageId(),
          role: "user",
          content: "查找所有外包合同，筛选履约记录中有延期或扣罚的，优先展示风险高的。"
        },
        {
          id: nextMessageId(),
          role: "agent",
          content: "检索完成。在 12,486 份合同中，按外包类合同 + 履约异常标记筛选，命中 2 份高优先级合同：",
          strategy: [
            "字段过滤：限定外包、运维类合同；到期窗口为未来 90 天",
            "语义召回：匹配「延期、扣罚、外包、履约风险」等相关表达",
            "证据复核：合并履约记录和供应商评级，要求每条至少 2 个证据点",
            "权限裁剪：仅展示当前角色可访问的合同与附件片段",
            "综合排序：按风险等级、匹配分降序"
          ],
          results: highRiskResults
        }
      ]
    }
  ];
}

function readSelectedKnowledgeBaseId() {
  if (typeof window === "undefined") {
    return "";
  }

  const fromQuery = new URLSearchParams(window.location.search).get("kb_id") || "";
  const fromStorage = window.localStorage?.getItem("contract-agent-kb-id") || "";
  const kbId = fromQuery || fromStorage;

  if (fromQuery) {
    window.localStorage?.setItem("contract-agent-kb-id", fromQuery);
  }

  return kbId;
}

function persistSelectedKnowledgeBaseId(kbId) {
  if (typeof window === "undefined") {
    return;
  }

  if (kbId) {
    window.localStorage?.setItem("contract-agent-kb-id", kbId);
  } else {
    window.localStorage?.removeItem("contract-agent-kb-id");
  }
}

function formatConversationTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function resolveTaskId(task) {
  return task?.task_id || task?.id;
}

function taskFailureMessage(task, fallback = "任务失败") {
  return task?.message || task?.error || task?.detail || fallback;
}

function pollingTimeoutMessage(maxAttempts, intervalMs) {
  const seconds = Math.ceil((maxAttempts * intervalMs) / 1000);
  return `筛选任务超过 ${seconds} 秒未完成，请稍后刷新任务状态或重新发起筛选。`;
}

function createEmptyConversation() {
  return {
    id: `conv-${Date.now()}`,
    title: "新的筛选任务",
    time: formatConversationTime(),
    messages: []
  };
}

export default function App() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState(null);
  const [streamingPhases, setStreamingPhases] = useState([]);
  const [toast, setToast] = useState({ message: "已完成", visible: false });
  const [evidenceToast, setEvidenceToast] = useState("");
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState(() => readSelectedKnowledgeBaseId());
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [knowledgeBaseLoading, setKnowledgeBaseLoading] = useState(false);
  const [knowledgeBaseError, setKnowledgeBaseError] = useState("");

  const [conversations, setConversations] = useState(() => buildInitialConversations());
  const [activeConversationId, setActiveConversationId] = useState("conv-1");

  const timers = useRef([]);
  const mountedRef = useRef(true);
  const pollWaitResolversRef = useRef([]);
  const screeningRunRef = useRef(0);
  const inputRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const messages = activeConversation?.messages || [];

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        screeningRunRef.current += 1;
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current = [];
        pollWaitResolversRef.current.forEach((resolve) => resolve());
        pollWaitResolversRef.current = [];
      };
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setKnowledgeBaseLoading(true);
    setKnowledgeBaseError("");

    getKnowledgeBases()
      .then((items) => {
        if (cancelled || !mountedRef.current) return;
        setKnowledgeBases(items);
        if (!selectedKnowledgeBaseId && items.length > 0) {
          setSelectedKnowledgeBaseId(items[0].id);
          persistSelectedKnowledgeBaseId(items[0].id);
        }
      })
      .catch((error) => {
        if (cancelled || !mountedRef.current) return;
        const message = error instanceof Error ? error.message : String(error || "知识库加载失败");
        setKnowledgeBaseError(message);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setKnowledgeBaseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Actions ─────────────────────────────────────────────────── */

  function scheduleTimer(callback, delay) {
    const timer = window.setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== timer);
      if (mountedRef.current) {
        callback();
      }
    }, delay);
    timers.current.push(timer);
    return timer;
  }

  function isActiveScreeningRun(runId) {
    return mountedRef.current && screeningRunRef.current === runId;
  }

  function showToast(message) {
    if (!mountedRef.current) return;
    setToast({ message, visible: true });
    scheduleTimer(() => setToast((current) => ({ ...current, visible: false })), 2000);
  }

  function copyText(text, message) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(message),
        () => showToast("复制失败，请手动复制")
      );
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast(message);
  }

  function viewEvidence(item) {
    setEvidenceItem(item);
    setEvidenceOpen(true);
    setEvidenceToast("");
  }

  function toggleHistory() {
    setHistoryOpen((prev) => !prev);
  }

  function toggleEvidence() {
    setEvidenceOpen((prev) => !prev);
  }

  function newConversation() {
    const newConv = createEmptyConversation();
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setHistoryOpen(true);
    setEvidenceOpen(false);
    setEvidenceItem(null);
    setEvidenceToast("");
    // Auto-focus input after render
    scheduleTimer(() => inputRef.current?.focus(), 100);
  }

  function deleteConversation(id) {
    if (id === streamingConversationId) {
      showToast("筛选进行中，完成后再删除");
      return;
    }

    const next = conversations.filter((c) => c.id !== id);
    if (id === activeConversationId) {
      const replacement = next.length > 0 ? null : createEmptyConversation();
      const nextConversations = next.length > 0 ? next : [replacement];
      setConversations(nextConversations);
      setActiveConversationId(nextConversations[0].id);
    } else {
      setConversations(next);
    }

    if (id === evidenceItem?.id) {
      setEvidenceItem(null);
      setEvidenceOpen(false);
    }
    showToast("已删除会话");
  }

  function selectConversation(id) {
    setActiveConversationId(id);
    setHistoryOpen(false);
    setEvidenceItem(null);
    setEvidenceOpen(false);
    setEvidenceToast("");
  }

  function handleQueueOne(item) {
    setEvidenceToast(`已加入待办队列 · ${item.id}`);
    showToast(`已加入待办队列 · ${item.id}`);
  }

  function handleCopyEvidence(item) {
    const text = buildAuditText({
      query: activeConversation?.messages?.find((m) => m.role === "user")?.content || "",
      filters: DEFAULT_FILTERS,
      item
    });
    copyText(text, "已复制证据包");
    setEvidenceToast("已复制");
    scheduleTimer(() => setEvidenceToast(""), 2000);
  }

  function handleCopyAudit(msg) {
    const resultItems = Array.isArray(msg?.results) ? msg.results : [];
    if (resultItems.length === 0) return;
    const text = resultItems
      .map((item) =>
        buildAuditText({
          query: msg.content || "",
          filters: DEFAULT_FILTERS,
          item
        })
      )
      .join("\n\n---\n\n");
    copyText(text, "已复制审计包");
  }

  function handleKnowledgeBaseChange(kbId) {
    setSelectedKnowledgeBaseId(kbId);
    persistSelectedKnowledgeBaseId(kbId);
  }

  function appendMessagesToConversation(conversationId, messagesToAppend, { titlePrompt } = {}) {
    if (!mountedRef.current) return;
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          title: titlePrompt ? buildConversationTitle(titlePrompt) : conv.title,
          time: formatConversationTime(),
          messages: [...conv.messages, ...messagesToAppend]
        };
      })
    );
  }

  function updateStreamingPhase(phase) {
    if (!mountedRef.current) return;

    const key = phase || "processing";
    const label = taskPhaseToLabel(phase);

    setStreamingPhases((prev) => {
      const index = prev.findIndex((item) => item.key === key);
      if (index >= 0) {
        return prev.map((item, itemIndex) =>
          itemIndex < index ? { ...item, done: true } : itemIndex === index ? { ...item, label, done: false } : item
        );
      }

      return [
        ...prev.map((item) => ({ ...item, done: true })),
        { key, label, done: false }
      ];
    });
  }

  function waitForNextPoll(intervalMs) {
    return new Promise((resolve) => {
      if (!mountedRef.current) {
        resolve();
        return;
      }

      const wrappedResolve = () => {
        pollWaitResolversRef.current = pollWaitResolversRef.current.filter((item) => item !== wrappedResolve);
        resolve();
      };
      pollWaitResolversRef.current.push(wrappedResolve);

      const timer = window.setTimeout(() => {
        timers.current = timers.current.filter((item) => item !== timer);
        wrappedResolve();
      }, intervalMs);
      timers.current.push(timer);
    });
  }

  async function pollScreeningTask(
    taskId,
    runId,
    { maxAttempts, intervalMs } = POLLING_CONFIG
  ) {
    for (let attempt = 0; attempt < maxAttempts && isActiveScreeningRun(runId); attempt += 1) {
      const current = await getScreeningTask(taskId);
      if (!isActiveScreeningRun(runId)) {
        return null;
      }

      if (current?.phase) {
        updateStreamingPhase(current.phase);
      }

      const status = String(current?.status || "").toLowerCase();
      if (TERMINAL_TASK_STATUSES.has(status)) {
        return { ...current, status };
      }

      await waitForNextPoll(intervalMs);
    }

    if (isActiveScreeningRun(runId)) {
      throw new Error(pollingTimeoutMessage(maxAttempts, intervalMs));
    }

    return null;
  }

  async function handleSend(text) {
    if (isStreaming || !activeConversationId) return;

    const conversationId = activeConversationId;
    const userMsg = { id: nextMessageId(), role: "user", content: text };

    appendMessagesToConversation(conversationId, [userMsg], { titlePrompt: text });

    if (!selectedKnowledgeBaseId) {
      appendMessagesToConversation(conversationId, [
        {
          id: nextMessageId(),
          role: "agent",
          content: "请在地址栏添加 ?kb_id=<知识库ID> 后再筛选，后续会接入知识库选择器。"
        }
      ]);
      return;
    }

    const runId = screeningRunRef.current + 1;
    screeningRunRef.current = runId;
    setIsStreaming(true);
    setStreamingConversationId(conversationId);
    setStreamingPhases([{ key: "parse_prompt", label: taskPhaseToLabel("parse_prompt"), done: false }]);

    try {
      const createdTask = await createScreeningTask({
        kbId: selectedKnowledgeBaseId,
        prompt: text,
        filters: DEFAULT_FILTERS
      });
      const taskId = resolveTaskId(createdTask);
      if (!taskId) {
        throw new Error("后端未返回任务 ID");
      }

      if (!isActiveScreeningRun(runId)) return;

      const completedTask = await pollScreeningTask(taskId, runId);
      if (!isActiveScreeningRun(runId) || !completedTask) return;

      if (completedTask.status === "failed" || completedTask.status === "cancelled") {
        throw new Error(taskFailureMessage(completedTask, completedTask.status === "cancelled" ? "任务已取消" : "任务失败"));
      }

      setStreamingPhases((prev) => prev.map((phase) => ({ ...phase, done: true })));
      const result = await getScreeningResults(taskId);
      if (!isActiveScreeningRun(runId)) return;

      const items = Array.isArray(result?.items) ? result.items : [];
      const agentMsg = {
        id: nextMessageId(),
        role: "agent",
        content: items.length > 0 ? `筛选完成，命中 ${items.length} 份合同。` : "筛选完成，没有命中合同。",
        strategy: result?.strategy,
        results: items
      };

      appendMessagesToConversation(conversationId, [agentMsg]);
      showToast(`已筛选 ${items.length} 份合同`);
    } catch (error) {
      if (!isActiveScreeningRun(runId)) return;

      const message = error instanceof Error ? error.message : String(error || "任务失败");
      appendMessagesToConversation(conversationId, [
        {
          id: nextMessageId(),
          role: "agent",
          content: `筛选失败：${message}`
        }
      ]);
      showToast("筛选失败");
    } finally {
      if (isActiveScreeningRun(runId)) {
        setIsStreaming(false);
        setStreamingConversationId(null);
        setStreamingPhases([]);
      }
    }
  }

  return (
    <>
      <Header
        historyOpen={historyOpen}
        evidenceOpen={evidenceOpen}
        onToggleHistory={toggleHistory}
        onToggleEvidence={toggleEvidence}
      />

      <main className="workspace" data-od-id="workspace">
        {/* Left: Conversation History */}
        <div className={`chat-col${historyOpen ? "" : " collapsed"}`} aria-label="对话历史面板">
          <ConversationHistory
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={selectConversation}
            onNew={newConversation}
            onDelete={deleteConversation}
          />
        </div>

        {/* Middle: Chat View */}
        <div className="main-col">
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            displayStreaming={isStreaming && activeConversationId === streamingConversationId}
            streamingPhases={streamingPhases}
            onSend={handleSend}
            onViewEvidence={viewEvidence}
            viewingItemId={evidenceItem?.id}
            onCopyAudit={handleCopyAudit}
            inputValue={inputValue}
            setInputValue={setInputValue}
            knowledgeBases={knowledgeBases}
            selectedKnowledgeBaseId={selectedKnowledgeBaseId}
            onKnowledgeBaseChange={handleKnowledgeBaseChange}
            isKnowledgeBaseLoading={knowledgeBaseLoading}
            knowledgeBaseError={knowledgeBaseError}
          />
        </div>

        {/* Right: Evidence Panel */}
        <div className={`evidence-col${evidenceOpen ? "" : " collapsed"}`} aria-label="证据详情面板">
          <EvidencePanel
            item={evidenceItem}
            onClose={() => setEvidenceOpen(false)}
            onQueueOne={handleQueueOne}
            onCopyEvidence={handleCopyEvidence}
            toastMessage={evidenceToast}
          />
        </div>
      </main>

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { contracts, promptExamples } from "./data.js";
import { buildAuditText, filterContracts, statusClass } from "./logic.js";

const DEFAULT_FILTERS = {
  risk: "全部",
  status: "全部",
  source: "全部"
};

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
            {item.evidence.map((evidence) => (
              <li className="source-item" key={`${evidence.source}-${evidence.ref}`}>
                <strong>
                  {evidence.source} · {evidence.ref}
                </strong>
                <span>{evidence.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="detail-section">
          <p className="meta">下一步动作</p>
          <ul className="action-list">
            {item.actions.map((action) => (
              <li className="action-item" key={action}>
                <strong>{action}</strong>
                <span>可加入采购/法务待办队列并保留当前筛选依据。</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="detail-section">
          <p className="meta">关键节点</p>
          <div className="timeline">
            {item.timeline.map(([label, value]) => (
              <div className="timeline-item" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
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
  streamingPhases,
  onSend,
  onViewEvidence,
  viewingItemId,
  onCopyAudit,
  inputValue,
  setInputValue
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
    if (!trimmed || isStreaming) return;
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
          {isStreaming && (
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
            disabled={isStreaming || !inputValue.trim()}
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
              disabled={isStreaming}
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
        {message.strategy && (
          <div className="bubble-strategy">
            <p className="strategy-title">检索策略</p>
            <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "var(--text-sm)", color: "var(--fg-2)", display: "grid", gap: "var(--space-1)" }}>
              {message.strategy.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Agent result cards */}
        {message.results && message.results.length > 0 && (
          <div className="chat-results-grid">
            {message.results.map((item) => (
              <button
                key={item.id}
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
                      <EyeIcon /> 查看 {item.evidence.length} 条证据
                    </span>
                  )}
                </div>
              </button>
            ))}
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

export default function App() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingPhases, setStreamingPhases] = useState([]);
  const [toast, setToast] = useState({ message: "已完成", visible: false });
  const [evidenceToast, setEvidenceToast] = useState("");

  const [conversations, setConversations] = useState(() => buildInitialConversations());
  const [activeConversationId, setActiveConversationId] = useState("conv-1");

  const timers = useRef([]);
  const inputRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const messages = activeConversation?.messages || [];

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  /* ─── Actions ─────────────────────────────────────────────────── */

  function showToast(message) {
    setToast({ message, visible: true });
    const timer = window.setTimeout(() => setToast((current) => ({ ...current, visible: false })), 2000);
    timers.current.push(timer);
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
    const now = new Date();
    const newConv = {
      id: `conv-${Date.now()}`,
      title: "新的筛选任务",
      time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      messages: []
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setHistoryOpen(true);
    setEvidenceOpen(false);
    setEvidenceItem(null);
    setEvidenceToast("");
    // Auto-focus input after render
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function deleteConversation(id) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeConversationId && next.length > 0) {
        setActiveConversationId(next[0].id);
      }
      return next;
    });
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
    setTimeout(() => setEvidenceToast(""), 2000);
  }

  function handleCopyAudit(msg) {
    if (!msg || !msg.results) return;
    const text = msg.results
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

  function handleSend(text) {
    if (isStreaming) return;

    const userMsg = { id: nextMessageId(), role: "user", content: text };

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== activeConversationId) return conv;
        return {
          ...conv,
          title: text.length > 28 ? text.slice(0, 28) + "..." : text,
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          messages: [...conv.messages, userMsg]
        };
      })
    );

    // Start multi-phase streaming
    setIsStreaming(true);
    setStreamingPhases([]);

    const { filters, results } = smartFilter(text);
    const strategySteps = buildStrategySteps(text, filters);

    // Phase 1: Parsing intent
    addPhase("解析筛选意图", 0);
    // Phase 2: Field filtering
    addPhase("生成字段过滤条件", 300);
    // Phase 3: Semantic recall
    addPhase("执行语义召回", 700);
    // Phase 4: Evidence review
    addPhase("复核证据与权限裁剪", 1100);
    // Phase 5: Complete
    const completeTime = 1500;

    function addPhase(label, delay) {
      timers.current.push(
        window.setTimeout(() => {
          setStreamingPhases((prev) => [...prev, { key: label, label, done: false }]);
        }, delay)
      );
    }

    // Mark phases as done sequentially
    const phases = ["解析筛选意图", "生成字段过滤条件", "执行语义召回", "复核证据与权限裁剪"];
    phases.forEach((label, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStreamingPhases((prev) =>
            prev.map((p) => (p.key === label ? { ...p, done: true } : p))
          );
        }, 400 + i * 350)
      );
    });

    // Final result
    timers.current.push(
      window.setTimeout(() => {
        const agentMsg = {
          id: nextMessageId(),
          role: "agent",
          content: `检索完成。在 12,486 份合同中命中 ${results.length} 份高优先级合同：`,
          strategy: strategySteps,
          results
        };

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== activeConversationId) return conv;
            return {
              ...conv,
              messages: [...conv.messages, agentMsg]
            };
          })
        );

        setIsStreaming(false);
        setStreamingPhases([]);
        showToast(`已筛选 ${results.length} 份合同`);
      }, completeTime)
    );
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
            streamingPhases={streamingPhases}
            onSend={handleSend}
            onViewEvidence={viewEvidence}
            viewingItemId={evidenceItem?.id}
            onCopyAudit={handleCopyAudit}
            inputValue={inputValue}
            setInputValue={setInputValue}
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

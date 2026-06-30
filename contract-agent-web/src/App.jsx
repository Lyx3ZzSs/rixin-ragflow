import React, { useEffect, useMemo, useRef, useState } from "react";
import { createScreeningTask, deleteScreeningTask, getKnowledgeBases, getScreeningResults, getScreeningTask, listScreeningTasks, logout, parseScreeningPrompt } from "./api.js";
import { buildConditionTaskPayload, conditionToEditor, normalizeEvidencePolicy, normalizeParsedConditions } from "./conditions.js";
import { contracts, promptExamples } from "./data.js";
import {
  buildAuditText,
  buildConversationTitle,
  filterContracts,
  normalizeTimelineItems,
  resolvePollingConfig,
  strategyToText,
  taskPhaseToLabel
} from "./logic.js";
import { ResultSet } from "./components/results/ResultSet.jsx";
import { KeyValue } from "./components/ui/KeyValue.jsx";
import { Toast } from "./components/ui/Toast.jsx";
import {
  HistoryIcon,
  ChevronRightIcon,
  SendIcon,
  DocumentIcon,
  TrashIcon,
  NewChatIcon,
  EyeIcon,
  CheckIcon,
  SearchIcon,
  BrainIcon,
  LogoutIcon
} from "./icons.jsx";

const DEFAULT_FILTERS = {
  risk: "全部",
  status: "全部",
  source: "全部"
};

const TERMINAL_TASK_STATUSES = new Set(["done", "failed", "cancelled"]);
const POLLING_CONFIG = resolvePollingConfig(import.meta.env);

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

function ConversationHistory({ conversations, activeId, onSelect, onNew, onDelete, onLogout }) {
  return (
    <div className="history-panel">
      <div className="sidebar-brand">
        <button className="sidebar-menu" type="button" aria-label="展开或收起导航">
          <HistoryIcon />
        </button>
        <span>合同智能筛选</span>
      </div>
      <nav className="sidebar-nav" aria-label="工作台导航">
        <button className="sidebar-nav-item" type="button" onClick={onNew}>
          <NewChatIcon /> 新建筛选
        </button>
        <button className="sidebar-nav-item" type="button">
          <SearchIcon /> 搜索历史
        </button>
        <button className="sidebar-nav-item" type="button">
          <DocumentIcon /> 合同库
        </button>
      </nav>
      <div className="history-header">
        <div>
          <p className="meta">对话历史</p>
          <h3 style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-body)", fontWeight: 500, letterSpacing: "normal", marginTop: "4px" }}>
            历史会话
          </h3>
        </div>
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
      <div className="sidebar-footer">
        <button className="btn btn-secondary btn-small" type="button" onClick={onLogout}>
          <LogoutIcon /> 注销
        </button>
      </div>
    </div>
  );
}

/* ─── Evidence Panel (right) ──────────────────────────────────────── */

function EvidencePanel({ item, onClose }) {
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
      </div>
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
            <h1 className="welcome-title">
              要筛选哪些合同？
            </h1>
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

        <ResultSet
          items={resultItems}
          taskId={message.taskId}
          viewingItemId={viewingItemId}
          onViewEvidence={onViewEvidence}
        />
      </div>
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
  const [historyOpen, setHistoryOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState(null);
  const [streamingPhases, setStreamingPhases] = useState([]);
  const [toast, setToast] = useState({ message: "已完成", visible: false });
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

  useEffect(() => {
    let cancelled = false;

    listScreeningTasks({ page: 1, pageSize: 20, kbId: selectedKnowledgeBaseId })
      .then((history) => {
        if (cancelled || !mountedRef.current) return;
        const items = Array.isArray(history?.items) ? history.items : [];
        if (items.length === 0) return;
        setConversations(items);
        setActiveConversationId((current) => (items.some((item) => item.id === current) ? current : items[0].id));
      })
      .catch(() => {
        // Keep first-stage local starter conversations when history is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedKnowledgeBaseId]);

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

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Continue local sign-out even if the server session is already expired.
    } finally {
      window.localStorage?.removeItem("Authorization");
      window.localStorage?.removeItem("token");
      window.localStorage?.removeItem("userInfo");
      window.localStorage?.removeItem("contract-agent-kb-id");
      window.location.href = `${window.location.origin}/login`;
    }
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
    // Auto-focus input after render
    scheduleTimer(() => inputRef.current?.focus(), 100);
  }

  async function deleteConversation(id) {
    if (id === streamingConversationId) {
      showToast("筛选进行中，完成后再删除");
      return;
    }

    const conversation = conversations.find((item) => item.id === id);
    if (conversation?.task_id) {
      try {
        await deleteScreeningTask(conversation.task_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "删除失败");
        showToast(`删除失败：${message}`);
        return;
      }
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

  async function loadHistoricalConversation(conversation) {
    const taskId = conversation?.task_id;
    if (!taskId || (conversation.messages || []).length > 0) {
      return;
    }

    try {
      const result = await getScreeningResults(taskId);
      if (!mountedRef.current) return;
      const items = Array.isArray(result?.items) ? result.items : [];
      const messages = [
        {
          id: `${taskId}-prompt`,
          role: "user",
          content: result?.prompt || conversation.prompt || conversation.title
        },
        {
          id: `${taskId}-result`,
          role: "agent",
          taskId,
          content: items.length > 0 ? `筛选完成，命中 ${items.length} 份合同。` : "筛选完成，没有命中合同。",
          strategy: result?.strategy,
          results: items
        }
      ];
      setConversations((prev) =>
        prev.map((item) => (item.id === conversation.id ? { ...item, messages } : item))
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error || "历史任务加载失败");
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                messages: [
                  {
                    id: `${taskId}-load-error`,
                    role: "agent",
                    content: `历史任务加载失败：${message}`
                  }
                ]
              }
            : item
        )
      );
    }
  }

  function selectConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    setActiveConversationId(id);
    setHistoryOpen(false);
    setEvidenceItem(null);
    setEvidenceOpen(false);
    loadHistoricalConversation(conversation);
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

  async function runScreeningWithConditions(review) {
    if (!review || isStreaming) return;

    const { conditions, evidence_policy: evidencePolicy } = buildConditionTaskPayload({
      conditions: review.conditions,
      evidencePolicy: review.evidencePolicy
    });
    const conversationId = review.conversationId;
    const text = review.prompt;
    const runId = screeningRunRef.current + 1;
    screeningRunRef.current = runId;
    setIsStreaming(true);
    setStreamingConversationId(conversationId);
    setStreamingPhases([{ key: "parse_prompt", label: taskPhaseToLabel("parse_prompt"), done: false }]);

    try {
      const createdTask = await createScreeningTask({
        kbId: selectedKnowledgeBaseId,
        prompt: text,
        filters: DEFAULT_FILTERS,
        conditions,
        evidencePolicy
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
        taskId,
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

    setIsStreaming(true);
    setStreamingConversationId(conversationId);
    setStreamingPhases([{ key: "parse_prompt", label: taskPhaseToLabel("parse_prompt"), done: false }]);

    try {
      const parsed = await parseScreeningPrompt({
        kbId: selectedKnowledgeBaseId,
        prompt: text,
        filters: DEFAULT_FILTERS
      });
      if (!mountedRef.current) return;
      const conditions = normalizeParsedConditions(parsed?.conditions).map(conditionToEditor);
      const evidencePolicy = normalizeEvidencePolicy(parsed?.evidence_policy);
      setStreamingPhases((prev) => prev.map((phase) => ({ ...phase, done: true })));
      appendMessagesToConversation(conversationId, [
        {
          id: nextMessageId(),
          role: "agent",
          content: conditions.length > 0 ? "已解析筛选条件，开始筛选。" : "未解析到明确条件，按原始描述开始筛选。"
        }
      ]);
      await runScreeningWithConditions({
        conversationId,
        prompt: text,
        conditions,
        evidencePolicy
      });
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error || "条件解析失败");
      appendMessagesToConversation(conversationId, [
        {
          id: nextMessageId(),
          role: "agent",
          content: `条件解析失败：${message}`
        }
      ]);
      showToast("条件解析失败");
    } finally {
      if (mountedRef.current) {
        setIsStreaming(false);
        setStreamingConversationId(null);
        setStreamingPhases([]);
      }
    }
  }

  return (
    <>
      <main className={`workspace${historyOpen ? "" : " history-collapsed"}`} data-od-id="workspace">
        {/* Left: Conversation History */}
        <div className={`chat-col${historyOpen ? "" : " collapsed"}`} aria-label="对话历史面板">
          <ConversationHistory
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={selectConversation}
            onNew={newConversation}
            onDelete={deleteConversation}
            onLogout={handleLogout}
          />
        </div>

        {/* Middle: Chat View */}
        <div className="main-col">
          <div className="main-stage-header">
            <button
              className="sidebar-toggle"
              type="button"
              aria-label={historyOpen ? "收起历史面板" : "展开历史面板"}
              aria-pressed={historyOpen}
              onClick={toggleHistory}
              title="对话历史"
            >
              <HistoryIcon />
            </button>
            <div className="main-header-actions">
              <button
                className="sidebar-toggle"
                type="button"
                aria-label={evidenceOpen ? "收起证据面板" : "展开证据面板"}
                aria-pressed={evidenceOpen}
                onClick={toggleEvidence}
                title="证据详情"
              >
                <EyeIcon />
              </button>
            </div>
          </div>
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
          />
        </div>
      </main>

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}

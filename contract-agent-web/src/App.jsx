import React, { useEffect, useMemo, useRef, useState } from "react";
import { createScreeningTask, deleteScreeningTask, getKnowledgeBases, getScreeningResults, getScreeningTask, listScreeningTasks, logout, parseScreeningPrompt } from "./api.js";
import { buildConditionTaskPayload, conditionToEditor, normalizeEvidencePolicy, normalizeParsedConditions } from "./conditions.js";
import { contracts } from "./data.js";
import {
  buildConversationTitle,
  filterContracts,
  resolvePollingConfig,
  taskPhaseToLabel
} from "./logic.js";
import { ChatView } from "./components/chat/ChatView.jsx";
import { EvidencePanel } from "./components/evidence/EvidencePanel.jsx";
import { Toast } from "./components/ui/Toast.jsx";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell.jsx";

const DEFAULT_FILTERS = {
  risk: "全部",
  status: "全部",
  source: "全部"
};

const TERMINAL_TASK_STATUSES = new Set(["done", "failed", "cancelled"]);
const POLLING_CONFIG = resolvePollingConfig(import.meta.env);

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

  const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId);
  const latestAgentMessage = [...messages].reverse().find((message) => message.role === "agent" && Array.isArray(message.results));
  const latestResults = Array.isArray(latestAgentMessage?.results) ? latestAgentMessage.results : [];
  const taskContext = {
    knowledgeBaseName: selectedKnowledgeBase?.name || (selectedKnowledgeBaseId ? "当前知识库" : "未选择知识库"),
    taskStatus: isStreaming ? "running" : activeConversation?.status || (latestAgentMessage ? "done" : ""),
    resultCount: latestResults.length,
    conditionCount: 0,
    evidencePolicy: null
  };

  return (
    <>
      <WorkspaceShell
        historyOpen={historyOpen}
        evidenceOpen={evidenceOpen}
        onToggleHistory={toggleHistory}
        onToggleEvidence={toggleEvidence}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onDeleteConversation={deleteConversation}
        onLogout={handleLogout}
        taskContext={taskContext}
        chat={
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            displayStreaming={isStreaming && activeConversationId === streamingConversationId}
            streamingPhases={streamingPhases}
            onSend={handleSend}
            onViewEvidence={viewEvidence}
            viewingItemId={evidenceItem?.id}
            inputValue={inputValue}
            setInputValue={setInputValue}
            knowledgeBases={knowledgeBases}
            selectedKnowledgeBaseId={selectedKnowledgeBaseId}
            onKnowledgeBaseChange={handleKnowledgeBaseChange}
            isKnowledgeBaseLoading={knowledgeBaseLoading}
            knowledgeBaseError={knowledgeBaseError}
            inputRef={inputRef}
          />
        }
        evidence={
          <EvidencePanel
            item={evidenceItem}
            onClose={() => setEvidenceOpen(false)}
          />
        }
      />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}

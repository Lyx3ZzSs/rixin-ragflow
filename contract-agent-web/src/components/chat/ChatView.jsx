import { useEffect, useRef } from "react";
import { ChatBubble } from "./ChatBubble.jsx";
import { EmptyPrompt } from "./EmptyPrompt.jsx";
import { PromptComposer } from "./PromptComposer.jsx";
import { ScreeningProgress } from "./ScreeningProgress.jsx";

export function ChatView({
  messages,
  isStreaming,
  displayStreaming,
  streamingPhases,
  onSend,
  onViewEvidence,
  viewingItemId,
  inputValue,
  setInputValue,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  isKnowledgeBaseLoading,
  knowledgeBaseError,
  inputRef
}) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, streamingPhases]);

  return (
    <div className="conversation">
      {messages.length === 0 ? (
        <EmptyPrompt />
      ) : (
        <div className="conversation-body" ref={bodyRef}>
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              viewingItemId={viewingItemId}
              onViewEvidence={onViewEvidence}
            />
          ))}
          <ScreeningProgress displayStreaming={displayStreaming} streamingPhases={streamingPhases} />
        </div>
      )}
      <PromptComposer
        messages={messages}
        isStreaming={isStreaming}
        onSend={onSend}
        inputValue={inputValue}
        setInputValue={setInputValue}
        knowledgeBases={knowledgeBases}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        onKnowledgeBaseChange={onKnowledgeBaseChange}
        isKnowledgeBaseLoading={isKnowledgeBaseLoading}
        knowledgeBaseError={knowledgeBaseError}
        inputRef={inputRef}
      />
    </div>
  );
}

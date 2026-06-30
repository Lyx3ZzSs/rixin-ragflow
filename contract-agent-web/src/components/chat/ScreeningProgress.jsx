import { BrainIcon, CheckIcon, SearchIcon } from "../../icons.jsx";

export function ScreeningProgress({ displayStreaming, streamingPhases }) {
  if (!displayStreaming) {
    return null;
  }

  return (
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
  );
}

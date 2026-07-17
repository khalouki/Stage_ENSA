"use client";

import type { RefObject } from "react";

import AiCopilotHeader from "./AiCopilotHeader";
import AiCopilotInput from "./AiCopilotInput";
import AiCopilotMessages from "./AiCopilotMessages";
import AiCopilotSuggestions from "./AiCopilotSuggestions";
import { COPILOT_PANEL_POSITION_CLASS } from "./constants";
import type { ChatMessage } from "./types";

type AiCopilotPanelProps = {
  isOpen: boolean;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  error: string | null;
  bottomRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestion: (question: string) => void;
};

export default function AiCopilotPanel({
  isOpen,
  messages,
  input,
  loading,
  error,
  bottomRef,
  onClose,
  onInputChange,
  onSubmit,
  onSuggestion,
}: AiCopilotPanelProps) {
  return (
    <section
      id="ai-maintenance-copilot-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-maintenance-copilot-title"
      className={`${COPILOT_PANEL_POSITION_CLASS} flex h-[min(640px,calc(100vh-7rem))] max-h-[650px] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition duration-200 sm:w-[410px] ${
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <AiCopilotHeader onMinimize={onClose} onClose={onClose} />
      <AiCopilotMessages messages={messages} loading={loading} error={error} bottomRef={bottomRef} />
      <AiCopilotSuggestions disabled={loading} onSelect={onSuggestion} />
      <AiCopilotInput value={input} loading={loading} onChange={onInputChange} onSubmit={onSubmit} />
    </section>
  );
}

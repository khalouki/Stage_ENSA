"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslation } from "@/components/i18n/useTranslation";
import { apiRequest } from "@/lib/api";

import AiCopilotLauncher from "./AiCopilotLauncher";
import AiCopilotPanel from "./AiCopilotPanel";
import type { ChatMessage, CopilotResponse } from "./types";

export default function AiCopilotWidget() {
  const { user, token, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = Boolean(!authLoading && token && user?.role === "admin");

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [isOpen, messages, loading, error]);

  if (!isAdmin) {
    return null;
  }

  const askCopilot = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !token || loading) return;

    const userMessage: ChatMessage = { id: Date.now(), role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setIsOpen(true);

    try {
      const response = await apiRequest<CopilotResponse>("/admin/ai/copilot/query", {
        method: "POST",
        token,
        body: JSON.stringify({ message: trimmed }),
      });
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.answer,
          response,
        },
      ]);
    } catch {
      setError(t("copilotErrorRequestFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AiCopilotPanel
        isOpen={isOpen}
        messages={messages}
        input={input}
        loading={loading}
        error={error}
        bottomRef={bottomRef}
        onClose={() => setIsOpen(false)}
        onInputChange={setInput}
        onSubmit={() => void askCopilot(input)}
        onSuggestion={(question) => void askCopilot(question)}
      />
      <AiCopilotLauncher isOpen={isOpen} onClick={() => setIsOpen((current) => !current)} />
    </>
  );
}

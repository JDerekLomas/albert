"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  mode?: string;
};

export default function AIPanel({
  documentContent,
  selectedText,
  onInsert,
  onReplace,
}: {
  documentContent: string;
  selectedText: string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<string>("write");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedText) {
      setMode("edit");
    }
  }, [selectedText]);

  async function send() {
    if (!input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, mode },
    ]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          context:
            mode === "edit" && selectedText
              ? selectedText
              : documentContent.slice(0, 8000),
          mode,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                const final = accumulated;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: final,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to connect"}`,
        },
      ]);
    }

    setStreaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="px-3 py-2 border-b border-zinc-100 flex gap-1 flex-wrap">
        {[
          { id: "write", label: "Write" },
          { id: "edit", label: "Edit" },
          { id: "continue", label: "Continue" },
          { id: "brainstorm", label: "Brainstorm" },
          { id: "summarize", label: "Summarize" },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              mode === m.id
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Selected text indicator */}
      {selectedText && mode === "edit" && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          Editing selection: &ldquo;{selectedText.slice(0, 80)}
          {selectedText.length > 80 ? "..." : ""}&rdquo;
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-zinc-400 text-sm text-center py-8">
            <p className="mb-3">Ask Claude to help you write.</p>
            <div className="space-y-1 text-xs text-zinc-400">
              <p>&ldquo;Write an introduction about...&rdquo;</p>
              <p>&ldquo;Make this more concise&rdquo;</p>
              <p>&ldquo;Continue from where I left off&rdquo;</p>
              <p>&ldquo;Brainstorm ideas for...&rdquo;</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`text-sm ${msg.role === "user" ? "text-zinc-500" : "text-zinc-800"}`}>
            {msg.role === "user" ? (
              <div className="flex gap-2">
                <span className="text-zinc-300 shrink-0">You:</span>
                <span>{msg.content}</span>
              </div>
            ) : (
              <div className="bg-zinc-50 rounded-lg p-3 whitespace-pre-wrap">
                {msg.content}
                {streaming && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Insert/Replace buttons */}
      {lastAssistantMessage && lastAssistantMessage.content && !streaming && (
        <div className="px-3 py-2 border-t border-zinc-100 flex gap-2">
          <button
            onClick={() => onInsert(lastAssistantMessage.content)}
            className="flex-1 text-xs py-1.5 bg-zinc-900 text-white rounded font-medium hover:bg-zinc-800 transition-colors"
          >
            Insert at cursor
          </button>
          {selectedText && (
            <button
              onClick={() => onReplace(lastAssistantMessage.content)}
              className="flex-1 text-xs py-1.5 border border-zinc-200 rounded font-medium hover:bg-zinc-50 transition-colors"
            >
              Replace selection
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(lastAssistantMessage.content);
            }}
            className="text-xs py-1.5 px-3 border border-zinc-200 rounded font-medium hover:bg-zinc-50 transition-colors"
          >
            Copy
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-zinc-100">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "continue"
                ? "Press Enter to continue writing..."
                : mode === "edit"
                  ? "How should I edit this?"
                  : "Ask Claude..."
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 placeholder:text-zinc-300"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="self-end px-3 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium disabled:opacity-30 hover:bg-zinc-800 transition-colors"
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

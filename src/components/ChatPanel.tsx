"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Event } from "@/lib/types";
import { getApiKey, setApiKey, sendChatMessage } from "@/lib/llm-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  events: Event[];
  onHighlightEvent: (event: Event | null) => void;
  onSelectEvent: (event: Event) => void;
  onMentionedEventsChange?: (events: Event[]) => void;
}

const QUICK_PROMPTS = [
  "What's happening right now?",
  "Best techno tonight?",
  "Jazz tonight?",
  "Something free & spontaneous",
  "Markets this weekend?",
  "Chill spots with friends",
];

// Find event by ID or fuzzy title match
function findEvent(title: string, afterText: string, allEvents: Event[]): Event | null {
  const idMatch = afterText.match(/\[([a-f0-9-]{8,36})\]/i);
  if (idMatch) {
    const evt = allEvents.find((e) => e.id === idMatch[1]);
    if (evt) return evt;
  }
  return allEvents.find(
    (e) =>
      e.title.toLowerCase().includes(title.toLowerCase()) ||
      title.toLowerCase().includes(e.title.toLowerCase().slice(0, 20))
  ) || null;
}

// Parse event titles from AI response and make them tappable
function renderContent(
  text: string,
  allEvents: Event[],
  onTap: (event: Event) => void,
  onHover: (event: Event | null) => void
) {
  const regex = /\*\*(.+?)\*\*(\s*@\s*[^\n\[*]+)?(\s*\[[a-f0-9-]+\])?/gi;
  const parts: (string | { title: string; venue: string; event: Event | null })[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index).replace(/\s*\[[a-f0-9-]{8,36}\]/gi, ""));
    }
    const title = match[1].trim();
    const venue = match[2] ? match[2].replace(/^\s*@\s*/, "").trim() : "";
    const afterText = text.slice(match.index, match.index + match[0].length + 100);
    const evt = findEvent(title, afterText, allEvents);
    parts.push({ title, venue, event: evt });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex).replace(/\s*\[[a-f0-9-]{8,36}\]/gi, ""));
  }

  if (parts.length === 1 && typeof parts[0] === "string") {
    return <>{(parts[0] as string).replace(/\s*\[[a-f0-9-]{8,36}\]/gi, "")}</>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") {
          return <span key={i}>{part}</span>;
        }
        if (part.event) {
          return (
            <span
              key={i}
              className="inline cursor-pointer"
              onPointerEnter={() => onHover(part.event)}
              onPointerLeave={() => onHover(null)}
              onClick={() => part.event && onTap(part.event)}
            >
              <span className="font-bold text-gray-900 underline decoration-gray-300 underline-offset-2">
                {part.title}
              </span>
              {part.venue ? <>{" @ "}{part.venue}</> : null}
            </span>
          );
        }
        return (
          <span key={i}>
            <span className="font-bold">{part.title}</span>
            {part.venue ? <>{" @ "}{part.venue}</> : null}
          </span>
        );
      })}
    </>
  );
}

function ApiKeySetup({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");

  return (
    <div className="px-4 py-6 text-center space-y-3">
      <div className="text-2xl mb-1">{"🔑"}</div>
      <h3 className="text-sm font-bold text-gray-900">Connect your AI</h3>
      <p className="text-xs text-gray-500 leading-relaxed">
        Enter your OpenAI API key to power the chat. Your key stays in your
        browser and is never sent to our servers.
      </p>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-..."
        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      <button
        onClick={() => {
          if (key.trim().startsWith("sk-")) {
            setApiKey(key.trim());
            onSaved();
          }
        }}
        disabled={!key.trim().startsWith("sk-")}
        className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-30 transition"
      >
        Save & Start Chatting
      </button>
      <p className="text-[10px] text-gray-400">
        Get a key at{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          platform.openai.com/api-keys
        </a>
      </p>
    </div>
  );
}

export default function ChatPanel({
  events,
  onHighlightEvent,
  onSelectEvent,
  onMentionedEventsChange,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [chatEvents, setChatEvents] = useState<Event[]>([]);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const allEvents = [...events, ...chatEvents.filter((ce) => !events.some((e) => e.id === ce.id))];

  useEffect(() => {
    setHasKey(!!getApiKey());
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch mentioned event IDs after streaming
  useEffect(() => {
    if (!onMentionedEventsChange || streaming) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content) return;

    const idRegex = /\[([a-f0-9-]{8,36})\]/gi;
    const ids: string[] = [];
    let m;
    while ((m = idRegex.exec(lastAssistant.content)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }

    if (ids.length === 0) return;

    const found = ids.map((id) => allEvents.find((e) => e.id === id)).filter(Boolean) as Event[];
    const missingIds = ids.filter((id) => !allEvents.some((e) => e.id === id));

    if (missingIds.length === 0) {
      onMentionedEventsChange(found);
      return;
    }

    fetch(`/api/events?ids=${missingIds.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setChatEvents((prev) => [...prev, ...data.filter((d: Event) => !prev.some((p) => p.id === d.id))]);
          onMentionedEventsChange([...found, ...data]);
        }
      })
      .catch(() => {
        onMentionedEventsChange(found);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      // Add empty assistant message for streaming
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      let fullText = "";

      try {
        await sendChatMessage(
          newMessages,
          (chunk) => {
            fullText += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: fullText,
              };
              return updated;
            });
          }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: errorMsg.includes("API key")
              ? "Invalid API key. Please update it in your profile settings."
              : `Sorry, something went wrong: ${errorMsg}`,
          };
          return updated;
        });
      }

      setStreaming(false);
    },
    [messages, streaming]
  );

  if (!hasKey) {
    return (
      <div className="flex flex-col h-full bg-white/95 backdrop-blur-sm rounded-t-2xl">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 bg-gray-300 rounded-full" />
        </div>
        <ApiKeySetup onSaved={() => setHasKey(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white/95 backdrop-blur-sm rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.08)] border-t border-gray-100">
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-9 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[13px] text-gray-400 text-center">
              Ask me anything about Berlin events
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-[11px] px-3 py-2 rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 transition font-medium"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-gray-900 text-white rounded-br-sm"
                  : "bg-gray-50 text-gray-700 rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant"
                ? renderContent(msg.content, allEvents, onSelectEvent, onHighlightEvent)
                : msg.content}
              {msg.role === "assistant" &&
                streaming &&
                i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
                )}
            </div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What are you in the mood for?"
            disabled={streaming}
            className="flex-1 bg-gray-100 text-gray-900 text-[13px] rounded-full px-4 py-2.5 outline-none placeholder-gray-400 focus:ring-2 focus:ring-gray-200 transition"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="bg-gray-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-full disabled:opacity-30 active:bg-gray-700 transition"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

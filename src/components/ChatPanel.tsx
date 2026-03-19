"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Event } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  events: Event[];
  onHighlightEvent: (event: Event | null) => void;
  onSelectEvent: (event: Event) => void;
  onMentionedEventsChange?: (events: Event[]) => void;
  homeLocation?: { lat: number; lng: number } | null;
  currentLocation?: { lat: number; lng: number } | null;
}

const QUICK_PROMPTS = [
  "What's happening right now?",
  "Best techno tonight?",
  "Jazz tonight?",
  "Something free & spontaneous",
  "Markets this weekend?",
  "Chill spots with friends",
];

// Extract event IDs from AI text like [abc123] and match against events
function extractMentionedEvents(text: string, events: Event[]): Event[] {
  const matched: Event[] = [];
  const idRegex = /\[([a-f0-9-]{8,36})\]/gi;
  let match;
  while ((match = idRegex.exec(text)) !== null) {
    const id = match[1];
    const evt = events.find((e) => e.id === id);
    if (evt && !matched.some((m) => m.id === evt.id)) {
      matched.push(evt);
    }
  }
  return matched;
}

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
// Also strips [EVENT_ID] from visible text
function renderContent(
  text: string,
  allEvents: Event[],
  onTap: (event: Event) => void,
  onHover: (event: Event | null) => void
) {
  // Match **Title** optionally followed by @ Venue and [ID]
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

export default function ChatPanel({
  events,
  onHighlightEvent,
  onSelectEvent,
  onMentionedEventsChange,
  homeLocation,
  currentLocation,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chatEvents, setChatEvents] = useState<Event[]>([]);
  const messagesEnd = useRef<HTMLDivElement>(null);

  // Combined events: frontend events + any fetched chat events
  const allEvents = [...events, ...chatEvents.filter((ce) => !events.some((e) => e.id === ce.id))];

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When AI mentions event IDs, fetch those events if not already loaded
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

    if (ids.length === 0) {
      const mentioned = extractMentionedEvents(lastAssistant.content, allEvents);
      onMentionedEventsChange(mentioned);
      return;
    }

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

  // Send via server-side Anthropic (default)
  const sendViaServer = useCallback(
    async (newMessages: Message[]) => {
      let fullText = "";

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          homeLocation: homeLocation || undefined,
          currentLocation: currentLocation || undefined,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                fullText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: fullText,
                  };
                  return updated;
                });
              } catch {
                // skip
              }
            }
          }
        }
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      setMessages([...newMessages, { role: "assistant", content: "" }]);

      try {
        await sendViaServer(newMessages);
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong. Try again!",
          };
          return updated;
        });
      }

      setStreaming(false);
    },
    [messages, streaming, sendViaServer]
  );

  return (
    <div className="flex flex-col h-full">
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

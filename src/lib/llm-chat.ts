/**
 * Browser-side LLM chat with function calling.
 * Calls OpenAI directly using the user's API key (stored in localStorage).
 * Tools call our /api/events/search endpoint for DB queries.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are Whatsupp, a warm and opinionated Berlin event concierge. You know the city inside out — the underground spots, the tourist traps to avoid, and where the real magic happens on any given night.

RULES:
- Use the search_events tool to find events matching the user's request. Always search before answering.
- When the user asks about a specific venue or location, search with ONLY q set to the venue name. Do NOT add category or neighborhood filters when searching for a venue — just use q. Example: q="Wasserturm" or q="Berghain".
- Keep search queries short — use 1-2 distinctive keywords, not full sentences.
- If the first search returns no results, try again with fewer/different keywords. Drop all filters except q.
- IMPORTANT: Do not set the "from" and "to" parameters when the user asks about "today" — the API defaults to today already.
- For kids/children/family events, use category="family". For "Kinder" queries, also try category="family".
- The neighborhood filter also searches addresses, so "Prenzlauer Berg" will match events on "Prenzlauer Allee" too.
- Recommend 3-5 events per response. Show VARIETY — spread across different venues.
- Be specific and opinionated — explain WHY each pick is worth it.
- Keep it concise: 2-3 sentences per recommendation max.
- Add insider tips when relevant.
- If nothing matches perfectly, suggest the closest alternative.
- Respond in the same language the user writes in (German or English).
- Prioritize smaller/unique venues alongside well-known ones.
- IMPORTANT: Always include the event ID in brackets after each recommendation.
- Format each recommendation like:
  **Event Title** @ Venue Name [EVENT_ID]
  Time · Category
  Your recommendation text.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_events",
      description:
        "Search the Berlin events database. Use this to find events matching the user's interests, time preferences, and location.",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description:
              "Free-text search query matching event titles, venues, descriptions, neighborhoods. Examples: 'jazz', 'techno', 'Berghain', 'Kreuzberg', 'flea market'",
          },
          category: {
            type: "string",
            enum: [
              "music",
              "nightlife",
              "culture",
              "food",
              "markets",
              "workshops",
              "meetups",
              "outdoors",
              "family",
            ],
            description: "Event category filter",
          },
          neighborhood: {
            type: "string",
            description:
              "Berlin neighborhood filter. Examples: Kreuzberg, Neukölln, Mitte, Friedrichshain, Prenzlauer Berg, Schöneberg, Charlottenburg, Wedding",
          },
          from: {
            type: "string",
            description:
              "Start date (YYYY-MM-DD). Defaults to today if not specified.",
          },
          to: {
            type: "string",
            description:
              "End date (YYYY-MM-DD). Defaults to 7 days from 'from' if not specified.",
          },
        },
        required: [],
      },
    },
  },
];

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("openai_api_key");
}

export function setApiKey(key: string) {
  localStorage.setItem("openai_api_key", key);
}

export function removeApiKey() {
  localStorage.removeItem("openai_api_key");
}

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function executeToolCall(
  name: string,
  args: Record<string, string>
): Promise<string> {
  if (name === "search_events") {
    const params = new URLSearchParams();
    if (args.q) params.set("q", args.q);
    if (args.category) params.set("category", args.category);
    if (args.neighborhood) params.set("neighborhood", args.neighborhood);
    if (args.from) params.set("from", args.from);
    if (args.to) params.set("to", args.to);
    params.set("limit", "20");

    const res = await fetch(`/api/events/search?${params.toString()}`);
    const data = await res.json();
    return JSON.stringify(data);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

/**
 * Send a chat message using the user's OpenAI API key with function calling.
 * Handles the tool call loop automatically.
 * Streams the final text response via onChunk callback.
 */
export async function sendChatMessage(
  messages: { role: "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No API key configured");

  const berlinTime = new Date().toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const berlinDate = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });

  const systemMsg = `${SYSTEM_PROMPT}\n\nCurrent time in Berlin: ${berlinTime}\nToday's date: ${berlinDate}\nIMPORTANT: When the user asks about "right now" or "jetzt", only recommend events that have already started or start within the next 30 minutes.`;

  // Build message history for OpenAI
  const apiMessages: Array<{
    role: string;
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }> = [
    { role: "system", content: systemMsg },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // First call: may return tool_calls
  let response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: apiMessages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid API key. Check your OpenAI key in settings.");
    }
    throw new Error(`OpenAI error: ${err}`);
  }

  let data = await response.json();
  let assistantMessage = data.choices?.[0]?.message;

  // Tool call loop (max 3 rounds to prevent runaway)
  let rounds = 0;
  while (assistantMessage?.tool_calls && rounds < 3) {
    rounds++;

    // Execute all tool calls
    const toolResults: Array<{
      role: string;
      content: string;
      tool_call_id: string;
    }> = [];

    for (const tc of assistantMessage.tool_calls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }
      const result = await executeToolCall(tc.function.name, args);
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }

    // Send tool results back, now stream the response
    apiMessages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: assistantMessage.tool_calls,
    });
    for (const tr of toolResults) {
      apiMessages.push(tr);
    }

    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        tools: TOOLS,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${await response.text()}`);
    }

    // Check if streaming or not
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") return;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  onChunk(delta.content);
                }
                // If there's another tool_call in stream, we need to handle it
                if (delta?.tool_calls) {
                  // Rare in final round, but handle gracefully
                  // Just break and let it be a non-streaming response
                }
              } catch {
                // skip
              }
            }
          }
        }
      }
      return;
    } else {
      // Non-streaming response (another tool call round)
      data = await response.json();
      assistantMessage = data.choices?.[0]?.message;

      if (!assistantMessage?.tool_calls) {
        // Final text response
        if (assistantMessage?.content) {
          onChunk(assistantMessage.content);
        }
        return;
      }
    }
  }

  // If we exited the loop with content, emit it
  if (assistantMessage?.content) {
    onChunk(assistantMessage.content);
  }
}

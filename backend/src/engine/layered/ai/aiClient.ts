/**
 * AI integration — structured JSON only; no silent rewrites in the client.
 */

export interface AiClient {
  completeJson<T>(params: { system: string; user: string }): Promise<T | null>;
}

export class NullAiClient implements AiClient {
  async completeJson<T>(_params: { system: string; user: string }): Promise<T | null> {
    return null;
  }
}

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

/**
 * OpenAI Chat Completions with JSON mode. Set OPENAI_API_KEY to enable.
 */
export class OpenAiJsonClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  ) {}

  async completeJson<T>(params: { system: string; user: string }): Promise<T | null> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as OpenAiChatResponse;
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Calls a separate AI gateway (see repo `ai-service/`) that mirrors OpenAI JSON output.
 * Set AI_SERVICE_URL (e.g. http://127.0.0.1:8787). Optional AI_SERVICE_SECRET must match the gateway.
 */
export class RemoteAiClient implements AiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearerSecret?: string
  ) {}

  async completeJson<T>(params: { system: string; user: string }): Promise<T | null> {
    const root = this.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.bearerSecret) {
      headers.Authorization = `Bearer ${this.bearerSecret}`;
    }
    const res = await fetch(`${root}/v1/complete-json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ system: params.system, user: params.user }),
    });
    if (!res.ok) {
      return null;
    }
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
}

/**
 * ReqVectorlite never constructs a live LLM client from environment variables.
 */
export function createAiClientFromEnv(): AiClient {
  return new NullAiClient();
}

/**
 * Prefixes every layered LLM system prompt with optional organization/project context.
 * Applies uniformly to: attribute analysis, legacy augment, same-intent, intra-doc adjudication, parent–child adjudication.
 * This is in-context steering only (not weight updates / fine-tuning).
 */
export function wrapAiClientWithOrganizationContext(
  inner: AiClient,
  organizationContext: string | undefined
): AiClient {
  const prefix = organizationContext?.trim();
  if (!prefix) return inner;
  return {
    async completeJson<T>(params: { system: string; user: string }): Promise<T | null> {
      const system = `${prefix}\n\n--- Engine instructions below ---\n\n${params.system}`;
      return inner.completeJson<T>({ ...params, system });
    },
  };
}

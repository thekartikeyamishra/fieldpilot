/**
 * One provider adapter, spoken by every OpenAI-compatible endpoint — which
 * includes AssemblyAI's LLM Gateway, OpenAI itself, and most gateways.
 * Business logic never imports a vendor SDK; it imports the router above this.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
};

export type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  requestId: string | null;
};

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = true) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 20_000);

  try {
    const res = await fetch(`${req.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 500,
        temperature: req.temperature ?? 0.2,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 4xx other than 408/429 will never succeed on retry.
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      throw new ProviderError(`provider ${res.status}: ${body.slice(0, 300)}`, res.status, retryable);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
      request_id?: string;
      id?: string;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new ProviderError("provider returned an empty completion", res.status, true);

    return {
      text,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? req.model,
      requestId: data.request_id ?? data.id ?? null,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error).name === "AbortError") throw new ProviderError("provider timeout", 408, true);
    throw new ProviderError(String(error), undefined, true);
  } finally {
    clearTimeout(timeout);
  }
}

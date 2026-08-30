import Anthropic from "@anthropic-ai/sdk";
import type { CompleteOptions, CompleteResult, LLMProvider } from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic | undefined;

  constructor(private readonly apiKey?: string) {}

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = this.apiKey ? new Anthropic({ apiKey: this.apiKey }) : new Anthropic();
    }
    return this.client;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}

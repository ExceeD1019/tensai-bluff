import OpenAI from "openai";
import type { CompleteOptions, CompleteResult, LLMProvider } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI | undefined;

  constructor(private readonly apiKey?: string) {}

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : new OpenAI();
    }
    return this.client;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const client = this.getClient();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    for (const m of opts.messages) messages.push({ role: m.role, content: m.content });

    const response = await client.chat.completions.create({
      model: opts.model,
      max_completion_tokens: opts.maxTokens ?? 8000,
      messages,
    });

    return {
      text: response.choices[0]?.message.content ?? "",
      usage: {
        input_tokens: response.usage?.prompt_tokens,
        output_tokens: response.usage?.completion_tokens,
      },
    };
  }
}

/** プロバイダ非依存の最小 LLM インターフェース。 */

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  system?: string;
  messages: LLMMessage[];
  model: string;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  usage?: Record<string, number | undefined>;
}

export interface LLMProvider {
  readonly name: string;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
}

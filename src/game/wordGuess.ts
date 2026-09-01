import type { Topic } from "../schema/topic.js";

/**
 * 単語当て（GAME_SPEC.md 3.1 / 3.6.1）の自動判定。AIは使わない。
 *
 * ひらがな化・全角半角統一・記号除去などの正規化を行った上で、
 * お題の word と acceptable 配列に完全一致するかだけを見る。
 * 正解条件は「単語（名称）そのものをズバリ言い切ること」で、
 * 意味が合っているだけの言い換えは正解にしない。
 */

const SYMBOL_RE =
  /[\s　・･、。，．,.「」『』【】\(\)（）\[\]〈〉《》"'“”‘’!?！？~〜:：;；]/g;

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC") // 全角/半角の統一
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(SYMBOL_RE, "")
    .toLowerCase()
    .trim();
}

export function isAcceptableGuess(guess: string, topic: Pick<Topic, "word" | "acceptable">): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  const candidates = [topic.word, ...topic.acceptable];
  return candidates.some((c) => normalizeAnswer(c) === g);
}

/** クライアント ⇄ サーバの WebSocket メッセージ。すべて JSON。 */

import type { Fact } from "../src/schema/topic.js";

/** 記憶フェーズで各自に見せる事実。`source`（出典）は伏せて送る（単語が漏れないよう） */
export type FactView = Omit<Fact, "source">;

export type Phase =
  | "lobby"
  | "memory"
  | "speaking"
  | "discussion"
  | "voting"
  | "wordGuess" // 潜入者を取り逃したときの敗者復活戦（3.6.1）
  | "scoreboard";

export type Role = "expert" | "impostor";

/** 監査で表示する称号（4章。減点があるのは知ったかぶりバカだけ） */
export type Title = "genius" | "prodigy" | "know-it-all-fool" | "misread";
// genius=天才 / prodigy=秀才 / know-it-all-fool=知ったかぶりバカ / misread=誤認

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}

export interface Settings {
  memorySec: number;
  discussionSec: number;
  impostorFactCount: number; // 0..3
}

/** 各プレイヤーに送る、その人視点のルーム状態。 */
export interface StateMsg {
  t: "state";
  you: string; // 自分の playerId
  code: string;
  phase: Phase;
  players: PlayerView[];
  settings: Settings;
  hostId: string;

  /** ラウンド中の自分の役割 */
  role?: Role;
  /** 自分に見えるお題情報。専門家は word 無し（3.3）。記憶フェーズ限定 */
  brief?: { word?: string; neutralGloss?: string; facts: FactView[] };
  /** お題の単語。潜入者には常に、専門家には scoreboard でのみ見える */
  topicWord?: string;

  /** フェーズの締切（epoch ms）。タイマー表示用 */
  deadline?: number;

  /** speaking */
  speaking?: { order: string[]; index: number; round: 1 | 2; total: number };

  /** voting */
  voting?: { voted: string[]; yourVote?: string };

  /** reveal（audit/scoreboard で投票結果を見せる） */
  reveal?: {
    impostorIds: string[];
    votes: Record<string, string>; // voterId -> targetId
    caught: boolean;
    misvoters: string[]; // 誤認した専門家
  };

  /** wordGuess（単語当て・3.6.1）。正誤は acceptable 配列でサーバが自動判定する */
  wordGuess?: {
    geniusId: string; // 生存した潜入者。判定はしない、結果宣告の演出役
    expertIds: string[];
    guesses: Record<string, string>; // expertId -> 回答テキスト
    verdicts: Record<string, boolean>; // expertId -> 正解か（自動判定、提出と同時に確定）
    announced: boolean; // 天才が「結果発表」を宣言したか（演出フラグ。得点には影響しない）
  };

  /** scoreboard */
  scoreboard?: {
    deltas: Record<string, number>;
    log: string[];
    titles: Record<string, Title>; // playerId -> 称号
  };

  /** 直近のトースト通知 */
  notice?: string;
}

export interface ErrorMsg {
  t: "error";
  msg: string;
}

export type ServerMsg = StateMsg | ErrorMsg;

export type ClientMsg =
  | { t: "join"; name: string; code?: string }
  | { t: "config"; settings: Partial<Settings> }
  | { t: "start" }
  | { t: "advance" } // 発言を次へ
  | { t: "toVote" } // 議論を切り上げて投票へ
  | { t: "vote"; target: string }
  | { t: "wordGuess"; text: string } // 専門家が単語を回答（正誤はサーバが自動判定）
  | { t: "announceWordGuess" } // 天才が結果発表を宣言（演出のみ。判定はしない）
  | { t: "finishWordGuess" } // ホストが単語当てを締めてスコアへ
  | { t: "nextRound" }
  | { t: "ping" };

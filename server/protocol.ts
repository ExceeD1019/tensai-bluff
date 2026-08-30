/** クライアント ⇄ サーバの WebSocket メッセージ。すべて JSON。 */

import type { Fact } from "../src/schema/topic.js";

export type Phase =
  | "lobby"
  | "memory"
  | "speaking"
  | "discussion"
  | "voting"
  | "reveal"
  | "audit"
  | "scoreboard";

export type Role = "expert" | "impostor";
export type Judgement = "pass" | "fool" | "bluff-fool"; // 合格 / バカ / 知ったかぶりバカ

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

  /** memory / audit 以降で自分の役割 */
  role?: Role;
  /** 自分に見えるお題情報 */
  brief?: { word: string; neutralGloss: string; facts: Fact[] };

  /** フェーズの締切（epoch ms）。タイマー表示用 */
  deadline?: number;

  /** speaking */
  speaking?: { order: string[]; index: number; round: 1 | 2; total: number };

  /** voting */
  voting?: { voted: string[]; yourVote?: string };

  /** reveal */
  reveal?: {
    impostorIds: string[];
    votes: Record<string, string>; // voterId -> targetId
    caught: boolean;
    misvoters: string[]; // 誤爆した専門家
  };

  /** audit */
  audit?: {
    facts: Fact[];
    recalls: Record<string, string>;
    judgements: Record<string, Judgement>;
    judgeId: string; // fool/bluff の判定者（通常 host）
    geniusId?: string; // 生存した潜入者。いれば名指しで加点できる
    accusations: string[]; // 天才の名指し
    expertIds: string[];
  };

  /** scoreboard */
  scoreboard?: { deltas: Record<string, number>; log: string[] };

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
  | { t: "recall"; text: string }
  | { t: "judge"; player: string; verdict: Judgement }
  | { t: "accuse"; player: string } // 天才が「こいつはバカ」と名指し（トグル）
  | { t: "finishAudit" }
  | { t: "nextRound" }
  | { t: "ping" };

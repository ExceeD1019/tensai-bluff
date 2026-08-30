import type { Judgement } from "./protocol.js";

/**
 * 配点（GAME_SPEC.md 4章）。
 * すべて仮決め値。テストプレイで調整する前提なので、ここだけ触れば変えられる。
 */
export const POINTS = {
  expertHitImpostor: 2, // 投票で潜入者を的中
  expertMisvote: -1, // 誤爆
  impostorCaught: -1, // 露見
  impostorSurvived: 3, // 生存（天才）
  fool: -1, // バカ
  bluffFool: -2, // 知ったかぶりバカ（fool と重複せずこの値で確定）
  geniusSpotFool: 1, // 天才がバカを的中
  geniusSpotBluffFool: 2, // 天才が知ったかぶりバカを的中
} as const;

export interface RoundInput {
  impostorIds: string[];
  caught: boolean;
  votes: Record<string, string>; // voterId -> targetId
  misvoters: string[];
  judgements: Record<string, Judgement>; // expertId -> verdict
  /** 天才（生存した潜入者）。露見時は null */
  geniusId: string | null;
  /** 天才が「こいつはバカ/知ったかぶり」と名指しした相手 */
  geniusAccusations: string[];
  nameOf: (id: string) => string;
}

export function scoreRound(input: RoundInput): { deltas: Record<string, number>; log: string[] } {
  const deltas: Record<string, number> = {};
  const log: string[] = [];
  const add = (id: string, n: number, why: string) => {
    deltas[id] = (deltas[id] ?? 0) + n;
    log.push(`${input.nameOf(id)} ${n >= 0 ? "+" : ""}${n} (${why})`);
  };

  // 潜入者
  for (const impId of input.impostorIds) {
    if (input.caught) add(impId, POINTS.impostorCaught, "露見");
    else add(impId, POINTS.impostorSurvived, "生存・天才");
  }

  // 投票（専門家のみ）
  for (const [voterId, target] of Object.entries(input.votes)) {
    if (input.impostorIds.includes(voterId)) continue; // 潜入者の票は採点しない
    if (input.impostorIds.includes(target)) add(voterId, POINTS.expertHitImpostor, "潜入者を的中");
    else add(voterId, POINTS.expertMisvote, "誤爆");
  }

  // 監査
  for (const [expertId, verdict] of Object.entries(input.judgements)) {
    if (verdict === "fool") add(expertId, POINTS.fool, "バカ");
    else if (verdict === "bluff-fool") add(expertId, POINTS.bluffFool, "知ったかぶりバカ");
  }

  // 天才ボーナス
  if (input.geniusId) {
    for (const accused of input.geniusAccusations) {
      const v = input.judgements[accused];
      if (v === "fool") add(input.geniusId, POINTS.geniusSpotFool, "バカを的中");
      else if (v === "bluff-fool")
        add(input.geniusId, POINTS.geniusSpotBluffFool, "知ったかぶりバカを的中");
    }
  }

  return { deltas, log };
}

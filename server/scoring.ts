/**
 * 配点（GAME_SPEC.md 4章）。個人戦。すべて仮決め値。
 *
 * - 潜入者は捕まっても減点しない（意図的な非対称）
 * - 専門家の加点はすべて個別。グループボーナスは無い
 * - 称号（秀才・知ったかぶりバカ・誤認）と得点は分離。減点があるのは知ったかぶりバカだけ
 */
export const POINTS = {
  expertCaughtImpostor: 2, // 潜入者に投票し、かつ特定成功
  impostorSurvived: 3, // 特定失敗（生存＝天才）
  knowItAllFool: -2, // 単語当て失敗（知ったかぶりバカ）
} as const;

export interface RoundInput {
  impostorIds: string[];
  /** 投票で潜入者を特定できたか */
  caught: boolean;
  votes: Record<string, string>; // voterId -> targetId（潜入者の票は集計から除外）
  /** 単語当ての裁定。caught が false のときだけ入る。expertId -> 正解か */
  wordVerdicts: Record<string, boolean>;
  nameOf: (id: string) => string;
}

export function scoreRound(input: RoundInput): { deltas: Record<string, number>; log: string[] } {
  const deltas: Record<string, number> = {};
  const log: string[] = [];
  const add = (id: string, n: number, why: string) => {
    if (n === 0) return;
    deltas[id] = (deltas[id] ?? 0) + n;
    log.push(`${input.nameOf(id)} ${n >= 0 ? "+" : ""}${n} (${why})`);
  };

  // 潜入者: 生存で加点、捕まっても減点なし
  for (const impId of input.impostorIds) {
    if (input.caught) log.push(`${input.nameOf(impId)} ±0 (捕まった・減点なし)`);
    else add(impId, POINTS.impostorSurvived, "生き延びた・天才");
  }

  if (input.caught) {
    // 特定成功: 潜入者に入れた専門家だけ加点
    for (const [voterId, target] of Object.entries(input.votes)) {
      if (input.impostorIds.includes(voterId)) continue;
      if (input.impostorIds.includes(target)) add(voterId, POINTS.expertCaughtImpostor, "潜入者を的中");
    }
  } else {
    // 取り逃し: 単語当てに失敗した専門家（知ったかぶりバカ）だけ減点
    for (const [expertId, correct] of Object.entries(input.wordVerdicts)) {
      if (!correct) add(expertId, POINTS.knowItAllFool, "単語当て失敗・知ったかぶりバカ");
    }
  }

  return { deltas, log };
}

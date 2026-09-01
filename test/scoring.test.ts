import { describe, expect, it } from "vitest";
import { POINTS, scoreRound } from "../server/scoring.js";

const nameOf = (id: string) => id;

describe("scoreRound()", () => {
  it("特定成功: 潜入者に投票した専門家だけ加点、潜入者は減点なし", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: true,
      votes: { e1: "imp", e2: "imp", e3: "e1", imp: "e2" },
      wordVerdicts: {},
      nameOf,
    });
    expect(deltas.imp).toBeUndefined(); // 捕まっても減点しない
    expect(deltas.e1).toBe(POINTS.expertCaughtImpostor);
    expect(deltas.e2).toBe(POINTS.expertCaughtImpostor);
    expect(deltas.e3).toBeUndefined(); // 誤認は得点に影響なし
  });

  it("取り逃し: 天才が加点、単語当て失敗の専門家だけ減点", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: false,
      votes: { e1: "e2", e2: "e3", e3: "e1", imp: "e1" },
      wordVerdicts: { e1: true, e2: false, e3: false },
      nameOf,
    });
    expect(deltas.imp).toBe(POINTS.impostorSurvived);
    expect(deltas.e1).toBeUndefined(); // 秀才は得点変化なし
    expect(deltas.e2).toBe(POINTS.knowItAllFool);
    expect(deltas.e3).toBe(POINTS.knowItAllFool);
  });

  it("潜入者の票は採点対象外", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: true,
      votes: { imp: "e1", e1: "imp" },
      wordVerdicts: {},
      nameOf,
    });
    expect(deltas.e1).toBe(POINTS.expertCaughtImpostor);
    expect(deltas.imp).toBeUndefined();
  });

  it("潜入者2人・取り逃し: 両方に天才ボーナス", () => {
    const { deltas } = scoreRound({
      impostorIds: ["i1", "i2"],
      caught: false,
      votes: {},
      wordVerdicts: { e1: true },
      nameOf,
    });
    expect(deltas.i1).toBe(POINTS.impostorSurvived);
    expect(deltas.i2).toBe(POINTS.impostorSurvived);
  });
});

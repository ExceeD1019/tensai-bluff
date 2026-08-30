import { describe, expect, it } from "vitest";
import { POINTS, scoreRound } from "../server/scoring.js";

const nameOf = (id: string) => id;

describe("scoreRound()", () => {
  it("潜入者露見: 潜入者マイナス、的中した専門家プラス、誤爆マイナス", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: true,
      votes: { e1: "imp", e2: "imp", e3: "e1", imp: "e2" },
      misvoters: ["e3"],
      judgements: {},
      geniusId: null,
      geniusAccusations: [],
      nameOf,
    });
    expect(deltas.imp).toBe(POINTS.impostorCaught);
    expect(deltas.e1).toBe(POINTS.expertHitImpostor);
    expect(deltas.e2).toBe(POINTS.expertHitImpostor);
    expect(deltas.e3).toBe(POINTS.expertMisvote);
  });

  it("潜入者生存: 天才プラス、監査のバカ判定と天才の名指し的中", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: false,
      votes: { e1: "e2", e2: "e3", e3: "e1", imp: "e1" },
      misvoters: ["e1", "e2", "e3"],
      judgements: { e1: "fool", e2: "bluff-fool", e3: "pass" },
      geniusId: "imp",
      geniusAccusations: ["e1", "e2", "e3"],
      nameOf,
    });
    expect(deltas.imp).toBe(
      POINTS.impostorSurvived + POINTS.geniusSpotFool + POINTS.geniusSpotBluffFool,
    );
    expect(deltas.e1).toBe(POINTS.expertMisvote + POINTS.fool);
    expect(deltas.e2).toBe(POINTS.expertMisvote + POINTS.bluffFool);
    expect(deltas.e3).toBe(POINTS.expertMisvote); // pass は増減なし
  });

  it("潜入者の票は採点対象外", () => {
    const { deltas } = scoreRound({
      impostorIds: ["imp"],
      caught: false,
      votes: { imp: "e1" },
      misvoters: [],
      judgements: {},
      geniusId: "imp",
      geniusAccusations: [],
      nameOf,
    });
    expect(deltas.imp).toBe(POINTS.impostorSurvived); // 誤爆扱いされない
  });
});

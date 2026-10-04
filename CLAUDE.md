# CLAUDE.md

「天才を装うゲーム」(仮) — ワード人狼派生のオンライン正体隠匿パーティーゲーム。
ルールの正は [GAME_SPEC.md](GAME_SPEC.md)（コード内コメントの「3.5.1」「4章」などはこの節番号）。
ユーザー向けの起動方法は [README.md](README.md)。

会話はアプリ外（通話・対面）。アプリは進行・情報配布・投票・採点だけを担当し、**プレイ中に外部サービス（AI含む）を呼ばない**。

## コマンド

```bash
npm run serve        # = npm start。tsx で server/index.ts を直接実行（ビルド無し）。PORT 環境変数、既定 3000
npm test             # vitest（test/*.test.ts）
npm run typecheck    # tsc --noEmit（src / test / server が対象。public/ と scripts/ は対象外）
npm run demo         # topics/bank/ の全お題に構造チェック。error があれば exit 1
node scripts/smoketest.mjs 3000   # サーバ起動中に4クライアントで1試合を通す
```

お題・採点・判定ロジックを変えたら `npm test` と `npm run typecheck`、お題を足したら `npm run demo`。
サーバのフロー変更はスモークテストで確認する。

## 構成

- [server/index.ts](server/index.ts) — HTTP（`public/` の静的配信）＋ WebSocket。部屋コード発行、`join` 処理、全員切断で部屋破棄。
- [server/room.ts](server/room.ts) — `Room` クラス。ゲームの状態機械本体（全状態インメモリ）。
  フェーズ: `lobby → memory → discussion → voting → (wordGuess) → scoreboard → lobby`。
  タイマーは `setDeadline` で memory/discussion のみ。ホスト権限のチェックもここ。
- [server/protocol.ts](server/protocol.ts) — クライアント⇄サーバのメッセージ型（`ClientMsg` / `StateMsg`）。
  **プロトコルを変えたら `public/app.js` も合わせて直す**（JS 側は型チェックされない）。
- [server/scoring.ts](server/scoring.ts) — 配点 `POINTS`（仮値）と `scoreRound`。純関数。
- [src/schema/topic.ts](src/schema/topic.ts) — お題の Zod スキーマ。8事実 × tier（surface/specific/surprising）、`TIER_RANGE`。
- [src/game/impostorFacts.ts](src/game/impostorFacts.ts) — 潜入者に配る事実の選択（0〜3枚、rng 注入可）。
- [src/game/wordGuess.ts](src/game/wordGuess.ts) — 単語当ての自動判定。正規化（NFKC・カタカナ→ひらがな・記号除去）後、`word` か `acceptable` と完全一致。
- [src/store/topicStore.ts](src/store/topicStore.ts) — `topics/bank/*.json` の読み込み（`process.cwd()` 基準なのでリポジトリ直下で起動する）。
- [src/validation/](src/validation/) + [src/cli/demo.ts](src/cli/demo.ts) — お題の構造チェック（tier 配分・guessability・重複・単語漏れ）。
- [public/](public/) — 素の HTML/JS/CSS クライアント。ビルド無し・依存無し。`render()` が `state.phase` ごとに `renderXxx()` を呼んで画面を丸ごと作り直す。
- [topics/bank/](topics/bank/) — 手作りお題 JSON。書き方は [topics/TEMPLATES.md](topics/TEMPLATES.md)。

## 守るべき不変条件

- **情報の秘匿はサーバ側で行う**。`Room.viewFor(playerId)` がプレイヤーごとに見せてよい情報だけを詰めて送る。クライアントで隠すだけの実装にしない。
  - 専門家にはお題の単語を送らない（`scoreboard` でのみ `topicWord` を送る）。潜入者には常に送る。
  - `brief`（事実）は `memory` フェーズ限定。`source`（出典）は単語が漏れうるので誰にも送らない（`stripSource`）。
  - 単語当て: 他の専門家の回答は見せない。正誤は天才が宣告（`announced`）するまで本人にも見せない。天才だけは常に両方見える。提出済みかどうかは全員に見える。
- 投票集計から潜入者の票は除外。潜入者が**単独最多**のときだけ特定成功（同率の扱いは未確定・GAME_SPEC 8.3）。
- 潜入者は捕まっても減点しない。減点は単語当て失敗（知ったかぶりバカ）のみ。称号は1人1つ。
- 再接続は同名で `join` し直すと同一プレイヤー扱い（スコア引き継ぎ）。ホスト切断時は接続中の別プレイヤーへ移譲。ロビー中の離脱はプレイヤー削除。
- 潜入者は7人以上で2人、それ未満は1人。最小3人。
- お題の `facts` / `neutralGloss` に単語（およびそれを含む固有名）を書かない。`acceptable` には表記ゆれ・通称だけを入れ、意味的な言い換えは入れない。

## コード規約

- TypeScript strict + `noUncheckedIndexedAccess`、ESM。import は `.js` 拡張子付き（`../src/schema/topic.js`）。
- コメント・UI 文言・ログは日本語。仕様に対応する箇所はコメントで GAME_SPEC の節番号を引く。
- 配点・人数・タイマー範囲などは仮決め。ルールを変えたら GAME_SPEC.md も合わせて更新する。
- テストはロジック層（scoring / impostorFacts / wordGuess / checkStructure）のみ。`Room` に単体テストは無いので、フロー変更はスモークテストで確認。

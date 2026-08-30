# 天才を装うゲーム（仮）

「知ったかぶりで天才のフリを続ける」オンライン対戦の正体隠匿ゲーム（パーティーゲーム）。
ルールの全文は [GAME_SPEC.md](GAME_SPEC.md)。

---

## 現在地: Phase 1 — お題生成の品質検証

技術的にいちばん危ないのは「お題（ワード＋8つの事実）をAIが安定して作れるか」。
まずそこだけを CLI で検証する（[GAME_SPEC.md](GAME_SPEC.md) 7章）。

```
ワード → お題生成AI → 構造チェック(コード) → 内容チェック(LLM) → [NGなら部分修正ループ]
```

| モジュール | 場所 | 役割 |
|---|---|---|
| お題スキーマ | [src/schema/topic.ts](src/schema/topic.ts) | ワード＋8事実（表層/具体/意外）の型 |
| お題生成AI | [src/generation/](src/generation/) | ワードからお題JSONを生成 + 部分修正 |
| 構造チェック | [src/validation/checkStructure.ts](src/validation/checkStructure.ts) | **API不要**。階層配分・guessabilityとtierの食い違い・重複を機械的に判定 |
| 内容チェック | [src/validation/verifyTopic.ts](src/validation/verifyTopic.ts) | LLM判定。事実性・矛盾・「潜入者が会話に混ざれる題材か」 |
| パイプライン | [src/pipeline.ts](src/pipeline.ts) | 生成→検証→再生成ループ |

## セットアップ

必要: Node.js 20 以上。

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# .env に ANTHROPIC_API_KEY を入れる
```

## 使い方

```bash
npm run demo        # APIキー不要。同梱サンプルお題に構造チェックだけ実行
npm run gen         # 本番: ワード入力 → 生成 → 検証（要APIキー）
npm test            # 構造チェックのユニットテスト
npm run typecheck
```

`npm run gen` は空 Enter で題材もAIにおまかせ。合格したお題は `topics/<id>.json` に保存される。

## Phase 1 で見たいこと（GAME_SPEC.md 8.2.1）

- 「一般知識との差分」が効いたお題を安定生成できるか
- AI生成の8事実に誤り・諸説ありがどれだけ混じるか（→ 出典/裏取りの要否）
- 潜入者にワードのみ渡すか、1行の中立説明も渡すか

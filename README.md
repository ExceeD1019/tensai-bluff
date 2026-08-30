# 天才を装うゲーム（仮）

「知ったかぶりで天才のフリを続ける」オンライン対戦の正体隠匿ゲーム（パーティーゲーム）。
ルールの全文は [GAME_SPEC.md](GAME_SPEC.md)。

---

## 設計方針: 本番プレイ中は LLM を呼ばない

お題（ワード＋8つの事実）は**事前に作ってお題バンクに置く**。本番はバンクから配るだけ。
API は「お題を作る開発ツール」であって、ランタイムの依存ではない。

```
開発時:  ワード → お題生成AI → 検証AI → 人がレビュー → topics/bank/*.json に追加
本番:    サーバが topics/bank/ から未使用のお題をランダムに配る（LLM なし）
```

## お題バンク

`topics/bank/` に vetted なお題。テスト運転用の初期8件を Claude が手作りで用意済み:

| id | ワード | カテゴリ |
|---|---|---|
| eiffel-tower | エッフェル塔 | 建造物 |
| great-wall | 万里の長城 | 建造物 |
| great-pyramid | ギザの大ピラミッド | 歴史 |
| napoleon | ナポレオン・ボナパルト | 人物 |
| sushi | 寿司 | 文化 |
| black-hole | ブラックホール | 科学 |
| aurora | オーロラ | 自然 |
| dodo | ドードー | 生物 |

各お題 = 表層（誰でも言える）2〜3 / 具体（踏み込むと矛盾）3〜4 / 意外（裏事実）1〜2 の8事実。

## モジュール

| 場所 | 役割 |
|---|---|
| [src/schema/topic.ts](src/schema/topic.ts) | お題の型（Zod） |
| [src/store/topicStore.ts](src/store/topicStore.ts) | バンクの読み込み・ランダム配布・下書き保存 |
| [src/validation/checkStructure.ts](src/validation/checkStructure.ts) | **API不要**の構造チェック（階層配分、guessability と tier の食い違い、重複、題材の一般性） |
| [src/validation/verifyTopic.ts](src/validation/verifyTopic.ts) | LLM 判定（事実性・矛盾・playable）。開発ツール専用 |
| [src/generation/](src/generation/) | お題生成AI + 部分修正 |
| [src/pipeline.ts](src/pipeline.ts) | 生成→検証→再生成ループ |

## セットアップ

必要: Node.js 20 以上。

```bash
npm install
```

## 使い方

```bash
npm run demo        # APIキー不要。バンク全お題に構造チェック
npm test            # ユニットテスト（バンク全件の構造チェック含む）
npm run typecheck

# お題を追加したいとき（要 ANTHROPIC_API_KEY を .env に設定）
npm run gen         # ワード入力 → 生成 → 検証。合格すると topics/out/ に下書き保存
                    # 中身を確認して topics/bank/ に移すとバンク入り
```

## ゲーム側ロジック

| 場所 | 役割 |
|---|---|
| [src/game/impostorFacts.ts](src/game/impostorFacts.ts) | 潜入者に渡す事実を選ぶ（枚数 0〜3、標準2 = 表層1＋具体1。GAME_SPEC.md 3.3 / 8.4） |

## いま検証したいこと（GAME_SPEC.md 8.2.1）

- 「一般知識との差分」が効いたお題を安定生成できるか（`npm run gen` を回して確認）
- AI生成の8事実の事実性・出典の要否
- 監査をランタイム LLM 無しでやれるか

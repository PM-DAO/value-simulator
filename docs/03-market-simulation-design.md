# 市場シミュレーション設計の技術要素

## 1万〜10万エージェントのスケーリング戦略

最も有望なアプローチは**LLMアーキタイプ・クラスタリング**（AgentTorch、MIT Media Lab、AAMAS 2025 Oral）。

- エージェントを人口統計・行動プロファイルが類似するアーキタイプグループにクラスタリング
- LLMクエリはアーキタイプ単位（エージェント単位ではなく）で実行
- ニュージーランドESRとの協力で500万市民のデジタルツインをH5N1対応に展開した実績

### コスト試算

| アプローチ | スケール | コスト/1000ステップ | 忠実度 |
| --- | --- | --- | --- |
| 全エージェントLLM | 100-500体 | 極高（$10K+） | 最高 |
| LLMアーキタイプ | 数百万体 | 低〜中（$200-2,000） | 高（創発パターン保持） |
| ハイブリッド（LLM+ルール） | 1万-10万体 | 中（$500-5,000） | 高 |
| 純粋ルールベース | 数百万体 | 極低 | 低め |

### 補完的技術

- **AgentScope**（Alibaba/ICLR 2025）— アクターベース分散メカニズム
- **ScaleSim**（2025年）— スパースエージェント活性化によるメモリ効率的LLMサービング（最大1.74倍のスループット改善）

## BDI-LLMハイブリッド：消費者行動エージェントの最適モデル

BDI（Belief-Desire-Intention）フレームワークを構造的バックボーンとして使用：

- **信念（Beliefs）** — 製品認知、ブランド認知、価格期待
- **欲求（Desires）** — JTBDドリブンのニーズ
- **意図（Intentions）** — 購入計画

複雑な熟慮（新規状況、社会的影響、曖昧なトレードオフ）が必要な場合にのみLLMを呼び出し、日常的な価格/価値計算には効用関数を使用する。

### 推奨エージェント状態構造

```
Agent {
  Demographics: {age, income, location, household_type}
  Beliefs: {product_awareness, brand_perception, price_expectation, peer_opinions}
  Desires: {jobs_to_be_done[], unmet_needs[], budget_constraint}
  Intentions: {consideration_set[], purchase_timeline, channel_preference}
  Social: {network_connections[], influence_susceptibility, opinion_leadership_score}
  Behavioral_type: {innovator|early_adopter|early_majority|late_majority|laggard}
}
```

## Bassモデルとイノベーション普及

### エージェントベース定式化

各エージェントiが状態 `x_i ∈ {0,1}`（非採用者/採用者）を持つ：

```
P(adopt) = p + q × (採用済み隣接エージェントの割合)
```

- `p ≈ 0.03` — イノベーション係数
- `q ≈ 0.38` — 模倣係数

### Rogersの普及カテゴリ

| カテゴリ | 割合 | 特性 |
| --- | --- | --- |
| イノベーター | 2.5% | 高イノベーション閾値、高リスク許容度 |
| アーリーアダプター | 13.5% | - |
| アーリーマジョリティ | 34% | - |
| レイトマジョリティ | 34% | - |
| ラガード | 16% | 低イノベーション閾値、低リスク許容度、高価格感度 |

各カテゴリが異なるイノベーション閾値、模倣閾値、リスク許容度、価格感度を持つ。

### ネットワーク実装

Di Lucchio & Modanese（2024年）のアプローチ：
- networkXでスケールフリー/スモールワールドネットワークを生成
- 同類選好相関が採用ピークを遅延させる
- 符号付きネットワーク（正/負リンク）が高クラスタリング時に採用障壁を生成

## Jobs-to-be-Done（JTBD）の計算モデル化

**未開拓領域** — 既存の実装が存在しない。

### 提案データ構造

```
Job {
  job_id: string
  job_statement: "動詞 + 目的語 + 文脈的修飾語"  // 例: "迅速かつ確実に通勤する"
  job_type: functional | emotional | social
  desired_outcomes: [
    {outcome_id, statement, importance: 1-5, satisfaction: 1-5}
  ]
}
```

### ODI（Outcome-Driven Innovation）指標

```
機会スコア = 重要度 + max(重要度 - 満足度, 0)
```

| スコア | 状態 |
| --- | --- |
| > 10 | 未充足（高機会） |
| 6-10 | 適切に充足 |
| < 6 | 過剰充足 |

## マーケティングチャネル拡散

### 利用可能なモデル

1. **独立カスケードモデル** — 新規活性化ノードが確率pで各非活性隣接を活性化
2. **線形閾値モデル** — 活性隣接からの影響の総和が閾値θを超えると活性化
3. **MATモデル**（Multiple-Path Asynchronous Threshold）— 直接・間接影響、d^(-2)距離減衰、時間減衰、個別ポアソン接触頻度を統合

### バイラル係数

```
K-factor = 招待数(i) × 転換率(c)
```

- K > 1 → 指数的成長
- K < 1 → 有料獲得が必要

## プライシング感度

### Van Westendorp価格感度メーター

4つの閾値をセグメント別正規分布から生成：
- 安すぎ
- 割安
- 高いが許容
- 高すぎ

### コンジョイント分析ベースの効用モデル

属性レベル別部分効用のロジットモデル

### 支払意思額（WTP）分布

対数正規分布として、所得・知覚価値・競合・ブランドロイヤルティの関数でモデル化。

## 人口統計データソース

### 米国：ACS PUMS

- American Community Survey（ACS）のPublic Use Microdata Sample
- 全人口の約1%（年間約330万レコード）
- 500以上の変数を無料公開
- 1/1000スケール（約33万エージェント）の生成が可能
- 州×年齢層×性別×所得五分位で層化サブサンプリング

### 日本：IPF合成人口（制約あり）

- 日本はIPUMS-Internationalに参加しておらず、個人レベルの国勢調査マイクロデータは一般公開されていない
- **代替策**: e-Statの集計クロス表（都道府県×年齢×性別×就業状態×世帯類型×所得階層）に対して反復比例当てはめ法（IPF/レーキング）を適用
- 1/1000スケール（約12.5万エージェント）の合成人口が目標

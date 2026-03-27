# Value Simulator

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

**エージェントベース市場採用シミュレーター** -- サービスアイデアの市場浸透をシミュレーション

**[デモを試す](https://valuesimulator.pmdao.org/)** | [English](README.md)

日本市場の仮想空間にエージェントを配置し、Bass拡散理論に基づくエージェントベースシミュレーションを実行。サービスアイデアの採用曲線・売上予測・改善ポイントを可視化します。

## 使い方

### Step 1: サービスの説明を入力

![入力画面](docs/screenshots/01_input.png)

テキストエリアにサービスのアイデアを自由に記述します。「AIで分析」ボタンをクリックすると、Claude APIがサービス内容を分析し、シミュレーションパラメータを自動推論します。

### Step 2: AI推論結果の確認 → シミュレーション実行

![AI推論結果とダッシュボード](docs/screenshots/detail_fullpage.png)

AIが推論したJTBD（ジョブ）、ターゲット、カテゴリ、推奨価格、競合状況が左パネルに表示されます。推論されたパラメータは手動で調整も可能です。シミュレーション結果がリアルタイムでダッシュボードに表示されます。

---

## ダッシュボード詳細

### サマリーカード

![サマリーカード](docs/screenshots/detail_01_summary.png)

| 指標 | 説明 |
|------|------|
| **推定TAM** | AI推論に基づく日本市場の推定TAM（Total Addressable Market）人数 |
| **総採用者数** | シミュレーション期間中にサービスを採用したエージェントの累計数 |
| **最大日次採用数** | 1日あたり最も多くの新規採用があった日の人数。採用のピークタイミングを示す |
| **採用率** | TAMに対する採用者の割合。市場浸透の到達度を表す |
| **市場機会スコア** | ODI (Outcome-Driven Innovation) に基づく機会スコア（0-10）。高いほど市場に未充足ニーズがあり、サービスの成功可能性が高い |

### AI推論結果

![AI推論結果](docs/screenshots/detail_02_ai.png)

Claude APIが推論した内容:

- **ジョブ (JTBD)**: ユーザーが「片付けたい用事」。Functional / Emotional / Social の3種類
- **ターゲット**: 年代（20代、30代...）、職業（会社員、学生...）、世帯（単身、夫婦...）
- **カテゴリ**: 25カテゴリから最適なものを選択（教育、ヘルスケア、SaaS等）
- **推奨価格**: 市場相場とターゲットの支払意欲に基づく推奨月額価格
- **競合状況**: なし / 弱い / 強い。市場の競争環境の評価
- **推論理由**: AIの推論プロセスの説明。TAM推定の根拠も含む

### 採用推移チャート（累積 / 日次）

![採用推移チャート](docs/screenshots/detail_03_adoption.png)

- **青い実線（累積採用）**: S字カーブ（シグモイド曲線）。イノベーターから始まり、マジョリティへ普及する過程を表す
- **緑の点線（日次採用）**: ベル型カーブ。1日あたりの新規採用者数。ピーク後に減少するのが典型的なBass拡散パターン
- **赤い線（現在位置）**: タイムラインスライダーで選択した日の位置

**タイムラインコントロール**: スライダーでシミュレーション日を移動でき、再生ボタンでアニメーション表示が可能。速度（0.5x / 1x / 2x / 4x）の調整も可能。

### ファネル分布（AIDMAモデル）

![ファネル分布](docs/screenshots/detail_04_funnel.png)

AIDMA購買ファネルの各段階にいるエージェント数を横棒グラフで表示:

| ステージ | 説明 |
|---------|------|
| **未認知 (Unaware)** | サービスの存在を知らないエージェント |
| **認知 (Aware)** | サービスを知っているが興味がないエージェント |
| **関心 (Interest)** | 興味を持ち、情報収集を始めたエージェント |
| **検討 (Consideration)** | 購入を具体的に検討しているエージェント |
| **採用 (Adopted)** | サービスを採用（購入）したエージェント |

各段階間の遷移確率はBass拡散モデル（イノベーション係数p + 模倣係数q）、JTBD適合度、価格受容性、ソーシャルネットワーク上の隣接エージェントの影響によって決定されます。

---

## 主な機能

- **エージェントベース市場シミュレーション** -- 日本市場の人口統計（e-Stat 2020国勢調査ベース）に基づくエージェント生成。Watts-Strogatz小世界ネットワークで接続し、Rogersの普及カテゴリ（イノベーター〜ラガード）別に行動を個別化
- **Bass拡散モデル + AIDMA購買ファネル** -- イノベーション係数(p)・模倣係数(q)に基づく拡散モデルと5段階ファネルモデルを統合
- **JTBD + ODI機会スコア** -- 25カテゴリのプリセットJob定義とODI指標による機会スコア計算
- **Claude API自動推論** -- サービス説明文を入力するだけで、AIがJTBD・ターゲット・カテゴリ・価格・競合状況を自動推論
- **What-If分析** -- パラメータ変更の影響を即座にプレビュー

## クイックスタート

### Docker Compose（推奨）

```bash
git clone https://github.com/PM-DAO/value-simulator.git
cd value-simulator
docker compose up
# ブラウザで http://localhost:3000 を開く
```

### ローカル開発

**前提条件**: Python 3.11+, Node.js 20+, [uv](https://docs.astral.sh/uv/)

```bash
# バックエンド
cd backend
uv sync
PYTHONPATH=src uv run uvicorn simulator.api:app --reload  # http://localhost:8000

# フロントエンド（別ターミナル）
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev  # http://localhost:3000
```

## アーキテクチャ

```
Frontend (Next.js 16)          Backend (FastAPI)
┌──────────────────┐          ┌──────────────────────────────┐
│  入力フォーム     │  REST   │  api.py     ← エンドポイント  │
│  結果ダッシュボード│ ──────→ │  engine.py  ← シミュレーション │
│  シナリオ比較     │  JSON   │  agent.py   ← BDIエージェント │
│  (Recharts)      │         │  population.py ← 人口生成     │
└──────────────────┘          │  network.py ← ソーシャルグラフ │
                              │  diffusion.py ← Bass拡散     │
                              │  funnel.py  ← AIDMAファネル   │
                              │  jtbd.py    ← JTBD/ODI計算   │
                              │  market.py  ← 市場エンジン    │
                              └──────────────────────────────┘
```

### バックエンドモジュール

| モジュール | 説明 |
|-----------|------|
| `agent.py` | BDI (Beliefs-Desires-Intentions) エージェントモデル。年齢・性別・所得・地域・世帯タイプ・Rogersカテゴリ・ファネルステージを管理 |
| `population.py` | 日本市場人口統計（e-Stat 2020国勢調査ベース）に基づく層化サンプリングでエージェント生成 |
| `network.py` | Watts-Strogatz小世界ネットワーク（k=6, p=0.1）によるソーシャルグラフ構築 |
| `diffusion.py` | Bass拡散モデル。イノベーション係数(p)で自発的採用、模倣係数(q)で口コミ採用を計算 |
| `funnel.py` | AIDMA購買ファネル。認知→関心→検討→採用の段階的遷移と減衰処理 |
| `jtbd.py` | JTBD/ODI機会スコア計算 + Claude APIによるLLM推論 |
| `market.py` | 価格モデル適用（無料/フリーミアム/サブスク/従量/買い切り）、競合影響の計算 |
| `engine.py` | シミュレーション実行エンジン。全モジュールを統合しステップ実行 |
| `api.py` | FastAPIエンドポイント |

## API

| エンドポイント | 説明 |
|--------------|------|
| `POST /api/simulate` | 手動パラメータ指定によるシミュレーション実行 |
| `POST /api/simulate/auto` | AI自動推論モード（Claude APIでパラメータを推論） |
| `POST /api/simulate/compare` | シナリオ比較（最大3シナリオ同時実行） |

APIドキュメント（Swagger UI）: http://localhost:8000/docs

## Claude API設定

AI自動推論機能を利用するには、環境変数に [Anthropic APIキー](https://console.anthropic.com/) を設定してください。

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

APIキーなしでも、手動でパラメータを設定してシミュレーションを実行できます。

## テスト

```bash
# バックエンド単体テスト
cd backend && uv run pytest

# カバレッジ付き
cd backend && uv run pytest --cov

# E2Eテスト（バックエンド・フロントエンドを自動起動）
cd frontend && npx playwright test
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Backend | Python 3.11+, FastAPI, NetworkX, NumPy, SciPy, Pydantic |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts |
| LLM | Anthropic Claude API |
| Test | pytest, Playwright |
| インフラ | Docker Compose |

## Contributing

Pull Requestsを歓迎します。

1. このリポジトリをFork
2. Feature branchを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. Pushしてプルリクエストを作成

バグ報告や機能要望は [Issues](https://github.com/PM-DAO/value-simulator/issues) へ。

## ライセンス

[AGPL-3.0](LICENSE)

このソフトウェアはAGPL-3.0ライセンスの下で公開されています。SaaSとして提供する場合、ネットワーク経由でアクセスするユーザーに対してもソースコードの公開義務が発生します。詳細は [LICENSE](LICENSE) を参照してください。

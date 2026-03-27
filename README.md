# Value Simulator

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

**Agent-based market adoption simulator** -- サービスアイデアの市場浸透をシミュレーション

日本市場の仮想空間にエージェントを配置し、Bass拡散理論に基づくエージェントベースシミュレーションを実行。サービスアイデアの採用曲線・売上予測・改善ポイントを可視化します。

## 主な機能

- **エージェントベース市場シミュレーション** -- 日本市場の人口統計（e-Stat 2020国勢調査ベース）に基づくエージェント生成。Watts-Strogatz小世界ネットワークで接続し、Rogersの普及カテゴリ（イノベーター〜ラガード）別に行動を個別化
- **Bass拡散モデル + AIDMA購買ファネル** -- イノベーション係数(p)・模倣係数(q)に基づく拡散モデルと、UNAWARE → AWARE → INTEREST → CONSIDERATION → ADOPTED の5段階ファネルモデルを統合
- **JTBD (Jobs-to-be-Done) + ODI機会スコア** -- 25カテゴリのプリセットJob定義とODI指標による機会スコア計算
- **Claude API によるJTBD自動推論** -- サービス説明文を入力するだけで、AIがJTBD・ターゲット・カテゴリ・価格・競合状況を自動推論（BYO-Key モデル）
- **シナリオ比較** -- 最大3シナリオの同時実行・比較。価格変更やマーケティング施策の効果をシミュレーション
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
npm run dev  # http://localhost:3000
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
| `agent.py` | エージェントモデル。BDI状態、Rogersカテゴリ、ファネルステージを管理 |
| `population.py` | 日本市場人口統計に基づくエージェント生成（年齢・性別・所得・地域） |
| `network.py` | Watts-Strogatz小世界ネットワークによるソーシャルグラフ構築 |
| `diffusion.py` | Bass拡散モデルの実装（閉形式解 + エージェントベース拡散） |
| `funnel.py` | AIDMA購買ファネル（認知→興味→検討→採用の段階的遷移と減衰） |
| `jtbd.py` | JTBD/ODI機会スコア計算 + Claude APIによるLLM推論 |
| `market.py` | 価格モデル適用、競合影響の計算 |
| `engine.py` | シミュレーション実行エンジン（全モジュールを統合しステップ実行） |
| `api.py` | FastAPIエンドポイント定義 |

## API

| エンドポイント | 説明 |
|--------------|------|
| `POST /api/simulate` | 手動パラメータ指定によるシミュレーション実行 |
| `POST /api/simulate/auto` | AI自動推論モード（Claude APIでパラメータを推論） |
| `POST /api/simulate/compare` | シナリオ比較（最大3シナリオ同時実行） |

APIドキュメント（Swagger UI）: http://localhost:8000/docs

## Claude API設定

AI自動推論機能（サービス説明文からJTBD・ターゲット・価格等を自動推論）を利用するには、環境変数に [Anthropic APIキー](https://console.anthropic.com/) を設定してください。

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
| LLM | Anthropic Claude API (BYO-Key) |
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

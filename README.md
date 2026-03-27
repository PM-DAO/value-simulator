# Value Simulator

新規プロダクトの市場浸透をシミュレーションするWebアプリケーション。

日本市場の仮想空間にエージェントを配置し、Bass拡散理論に基づくエージェントベースシミュレーションを実行。サービスアイデアの採用曲線・売上予測・改善ポイントを可視化します。

## 主な機能

- **エージェントベース市場シミュレーション** -- 日本市場の人口統計（e-Stat 2020国勢調査ベース）に基づくエージェント生成。Watts-Strogatz小世界ネットワークで接続し、Rogersの普及カテゴリ（イノベーター〜ラガード）別に行動を個別化
- **Bass拡散モデル + AIDMA購買ファネル** -- イノベーション係数(p)・模倣係数(q)に基づく拡散モデルと、UNAWARE → AWARE → INTEREST → CONSIDERATION → ADOPTED の5段階ファネルモデルを統合
- **JTBD (Jobs-to-be-Done) + ODI機会スコア** -- カテゴリ・ターゲットに応じたJob定義とODI指標（`importance + max(importance - satisfaction, 0)`）による機会スコア計算
- **Claude API によるJTBD自動推論** -- サービス説明文を入力するだけで、AIがJTBD・ターゲット・カテゴリ・価格・競合状況を自動推論。手動での微調整も可能
- **シナリオ比較** -- 最大3シナリオの同時実行・比較。価格変更やマーケティング施策（PR、SNS広告、インフルエンサー、口コミ）の効果をシミュレーション
- **日本市場人口統計ベース** -- 年齢・性別・所得・地域の分布をe-Stat 2020国勢調査に基づき近似

## アーキテクチャ

```
Frontend (Next.js 16)          Backend (FastAPI)
┌──────────────────┐          ┌──────────────────────────────┐
│  入力フォーム     │  REST   │  api.py     ← エンドポイント  │
│  結果ダッシュボード│ ──────→ │  engine.py  ← シミュレーション │
│  シナリオ比較     │  JSON   │  agent.py   ← エージェント定義 │
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
| `diffusion.py` | Bass拡散モデルの実装。閉形式解およびエージェントベース拡散 |
| `funnel.py` | AIDMA購買ファネル。認知→興味→検討→採用の段階的遷移と減衰処理 |
| `jtbd.py` | JTBD/ODI機会スコア計算。Claude APIによるLLM推論機能を含む |
| `market.py` | 価格モデル適用、競合影響の計算 |
| `engine.py` | シミュレーション実行エンジン。全モジュールを統合しステップ実行 |
| `api.py` | FastAPIエンドポイント定義 |

## クイックスタート

### Docker Compose（推奨）

```bash
# Claude APIを使う場合（AI自動推論機能）
export ANTHROPIC_API_KEY=your-api-key

# 起動（バックエンド: 8000, フロントエンド: 3000）
docker compose up

# ブラウザで http://localhost:3000 を開く
```

### ローカル開発

**前提条件**: Python 3.11+, Node.js, [uv](https://docs.astral.sh/uv/)

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

## API

| エンドポイント | 説明 |
|--------------|------|
| `POST /api/simulate` | 手動パラメータ指定によるシミュレーション実行。サービス名・価格・市場規模・カテゴリ・ターゲット・競合・期間等を指定 |
| `POST /api/simulate/auto` | AI自動推論モード。サービス説明文のみで、Claude APIがパラメータを推論しシミュレーションを実行 |
| `POST /api/simulate/compare` | シナリオ比較。ベースシナリオに対し最大3つの代替シナリオ（価格変更・マーケティング施策）を同時実行・比較 |

APIドキュメント（Swagger UI）: http://localhost:8000/docs

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Backend | Python 3.11+, FastAPI, NetworkX, NumPy, Pydantic |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts |
| LLM | Anthropic Claude API |
| Test | pytest, Playwright |
| インフラ | Docker Compose |

## テスト

```bash
# バックエンド単体テスト
cd backend && uv run pytest

# カバレッジ付き
cd backend && uv run pytest --cov

# E2Eテスト（バックエンド・フロントエンドを自動起動）
cd frontend && npx playwright test

# E2Eテストレポート表示
cd frontend && npx playwright show-report
```

## プロジェクト構造

```
value-simulator/
├── docker-compose.yml
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── src/simulator/
│   │   ├── agent.py          # エージェントモデル（BDI状態）
│   │   ├── population.py     # 人口生成（日本市場統計）
│   │   ├── network.py        # ソーシャルネットワーク
│   │   ├── diffusion.py      # Bass拡散モデル
│   │   ├── funnel.py         # AIDMA購買ファネル
│   │   ├── jtbd.py           # JTBD/ODI計算 + LLM推論
│   │   ├── market.py         # 市場エンジン
│   │   ├── engine.py         # シミュレーション実行
│   │   └── api.py            # FastAPI エンドポイント
│   └── tests/
│       ├── test_agent.py
│       ├── test_population.py
│       ├── test_engine.py
│       ├── test_funnel.py
│       └── test_api.py
├── frontend/
│   ├── package.json
│   ├── Dockerfile
│   ├── app/                  # Next.js App Router
│   └── e2e/                  # Playwright E2Eテスト
└── docs/                     # 設計ドキュメント・PRD
```

## BYO-Key モデル

このアプリケーションは **BYO-Key (Bring Your Own Key)** モデルを採用しています。AI推論機能を利用するには、ユーザー自身のAnthropic APIキーが必要です。

- APIキーはブラウザの `sessionStorage` に保存され、タブ/ブラウザを閉じると消去されます
- バックエンドはAPIキーを保存しません（リクエスト処理中のみ使用）
- 通信はHTTPS環境での利用を推奨します

APIキーの取得: https://console.anthropic.com/

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

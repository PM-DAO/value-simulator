# Value Simulator

## プロジェクト概要

新規プロダクトが市場にどう影響を与えるかをシミュレーションするサービス。
主要国（日本・米国等）の1/1000スケール仮想空間に、自律的に行動するエージェントノードを配置し、
新規サービスアイデアの市場浸透・売上をシミュレーションする。

## 技術的背景

MiroFish（OASIS + GraphRAG + LLMスウォーム）の設計思想を参考に、
消費者市場シミュレーションに特化したプラットフォームを構築する。

### コアコンセプト
- **BDI-LLMハイブリッドエージェント**: 日常行動はルールベース、複雑な判断時のみLLM呼び出し
- **LLMアーキタイプクラスタリング**: エージェントをアーキタイプにクラスタリングしLLMコスト最適化
- **Bass拡散モデル**: イノベーション普及のエージェントベース実装
- **JTBD（Jobs-to-be-Done）**: ODI指標による機会スコア計算

## 開発方針

- **TDD**: テストを先に書き、テストが通るように実装
- **Spec-Driven**: 仕様を先に定義し、仕様に従って実装
- **KISS**: 最もシンプルな実装を選ぶ。過度な抽象化をしない
- **DRY**: 同じロジックを繰り返さない

## 開発ワークフロー

### タスク実装順序

1. **Spec** — 仕様定義（型、インターフェース）
2. **Test** — テスト作成（Red）
3. **Impl** — 実装（Green）
4. **Integration** — モジュール間統合
5. **E2E検証** — Playwright CLIでUI・ローカル動作確認

## 技術スタック

### Backend
- **Python 3.11+**
- **FastAPI** — REST API
- **NetworkX** — ソーシャルグラフ
- **NumPy** — 数値計算
- **pytest** — テスト

### Frontend
- **Next.js 16 (App Router)** — UI
- **Tailwind CSS v4** — スタイリング
- **Recharts** — チャート描画

### LLM
- **Anthropic Claude API** — アーキタイプ推論・JTBD分析

## プロジェクト構造

```
value-simulator/
├── CLAUDE.md
├── docs/                    # リサーチ・設計ドキュメント
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   └── simulator/
│   │       ├── __init__.py
│   │       ├── agent.py         # エージェントモデル（BDI状態）
│   │       ├── population.py    # 人口生成（アーキタイプ）
│   │       ├── network.py       # ソーシャルネットワーク
│   │       ├── diffusion.py     # Bass拡散モデル
│   │       ├── jtbd.py          # JTBD/ODI計算
│   │       ├── market.py        # 市場エンジン
│   │       ├── engine.py        # シミュレーション実行
│   │       └── api.py           # FastAPI endpoints
│   └── tests/
│       ├── test_agent.py
│       ├── test_population.py
│       ├── test_network.py
│       ├── test_diffusion.py
│       ├── test_jtbd.py
│       ├── test_market.py
│       └── test_engine.py
├── video/
│   ├── package.json
│   └── src/                 # Remotion動画コンポジション
└── frontend/
    └── (Next.js project)
```

## コマンド

```bash
# Backend
cd backend && uv run pytest                    # テスト実行
cd backend && uv run pytest --cov              # カバレッジ付きテスト
cd backend && PYTHONPATH=src uv run uvicorn simulator.api:app # API起動

# Frontend
cd frontend && npm run dev                     # 開発サーバー
cd frontend && npm run build                   # ビルド

# E2E テスト (Playwright)
cd frontend && npx playwright test             # E2Eテスト実行
cd frontend && npx playwright test --ui        # UIモードで実行
cd frontend && npx playwright show-report      # レポート表示

# Video (Remotion)
cd video && npx remotion studio                # Studioでプレビュー
cd video && npx remotion render ValueSimulatorIntro out/intro.mp4  # MP4レンダリング

# Vercel デプロイ（ルートディレクトリから実行）
vercel --prod --yes                            # 本番デプロイ
```

## Vercel デプロイ設定

- **プロジェクト**: pm-dao/value-simulator
- **Root Directory**: `frontend`（Vercelプロジェクト設定で指定）
- **Framework**: Next.js（自動検出）
- **重要**: `vercel.json` はルートに置かない。Root Directoryの設定でVercelが`frontend/`を起点にする
- **重要**: CLIデプロイは**ルートディレクトリから** `vercel --prod` で実行する（`.vercel/project.json`がルートにある）
- バックエンドAPIはVercelではデプロイしない（別途ホスティング）

## MVPスコープ（7日間スプリント）

### MVP定義
- 100エージェントの小規模シミュレーション（スケールは後から）
- 日本市場のみ（簡易版人口統計）
- 新規サービスアイデアを入力 → 90日間の採用シミュレーション → 結果を可視化
- LLMは初期フェーズではJTBD推論のみに使用

### 非スコープ（MVP後）
- 10万エージェントスケール
- 米国市場対応
- リアルタイムシミュレーション
- 複数サービス同時比較
- マーケティングチャネル詳細シミュレーション

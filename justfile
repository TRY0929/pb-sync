# pb-sync justfile
# 前提: just (https://github.com/casey/just) がインストール済みであること

set dotenv-load

# デフォルト: コマンド一覧を表示
default:
  @just --list

# ─── Docker ───────────────────────────────────────────────

# コンテナをビルドして起動（初回 or Dockerfile 変更時）
build:
  docker compose build --no-cache
  docker compose up -d

# コンテナを起動（ビルド済みイメージを使用）
up:
  docker compose up -d

# コンテナを停止
down:
  docker compose down

# コンテナを再起動
restart:
  docker compose restart

# コンテナを停止して削除（ボリューム含む）
clean:
  docker compose down -v --remove-orphans

# ─── ログ ─────────────────────────────────────────────────

# ログをフォロー
logs:
  docker compose logs -f app

# 最新 100 行のログを表示
logs-tail:
  docker compose logs --tail=100 app

# ─── 開発 ──────────────────────────────────────────────────

# コンテナ内でシェルを起動
shell:
  docker compose exec app sh

# コンテナ内で pnpm コマンドを実行（例: just run lint）
run *args:
  docker compose exec app pnpm {{args}}

# 依存パッケージを追加（例: just add zod）
add *packages:
  docker compose exec app pnpm add {{packages}}

# ─── データ管理 ────────────────────────────────────────────

# Supabase の notes テーブルをクリア
clean-notes:
  #!/usr/bin/env bash
  SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
  SERVICE_KEY=$(grep SUPABASE_SECRET_KEY .env.local | cut -d= -f2)
  curl -s -X DELETE "${SUPABASE_URL}/rest/v1/notes?id=neq.00000000-0000-0000-0000-000000000000" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -w "HTTP %{http_code}\n"

# ─── ステータス確認 ────────────────────────────────────────

# コンテナの状態確認
status:
  docker compose ps

# リソース使用状況
stats:
  docker stats --no-stream $(docker compose ps -q)

# ─── セットアップ ──────────────────────────────────────────

# 初回セットアップ（.env.local 作成 → ビルド → 起動）
setup:
  @if [ ! -f .env.local ]; then \
    cp .env.local.example .env.local; \
    echo ".env.local を作成しました。環境変数を設定してください。"; \
  else \
    echo ".env.local は既に存在します。"; \
  fi

# セットアップしてコンテナを起動
quickstart: setup build
  @echo "http://localhost:3002 でアクセスできます"

# ─── ヘルスチェック ────────────────────────────────────────

# アプリにアクセスできるか確認
health:
  @curl -sf http://localhost:3002 > /dev/null && echo "✓ App is running" || echo "✗ App is not responding"

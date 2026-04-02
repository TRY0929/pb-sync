# Personal Brain Sync (PB-Sync) — 技術スタック定義書

## 全体構成図

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│              Next.js App (PWA / Vercel)                │
│         React Server Components + Client Components     │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   POST /api/sync  POST /api/chat   Static Assets
          │             │
          ▼             ▼
   ┌─────────────────────────┐
   │   Next.js API Routes    │
   │   (Edge / Node Runtime) │
   └──────┬──────────┬───────┘
          │          │
          ▼          ▼
   ┌────────────┐ ┌──────────────────┐
   │ Notion API │ │   Gemini API     │
   │ (Source)   │ │ text-embedding   │
   └────────────┘ │ gemini-1.5-flash │
                  └──────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   Supabase    │
                  │ PostgreSQL    │
                  │ + pgvector    │
                  └───────────────┘
```

---

## フロントエンド

### Next.js 14+ (App Router)

| 項目 | 内容 |
|------|------|
| バージョン | 14.x（App Router） |
| レンダリング | Server Components をデフォルト採用。インタラクティブな UI は `'use client'` を付けた Client Component に分離 |
| ルーティング | `app/` ディレクトリ構成。ページは `page.tsx`、レイアウトは `layout.tsx` |
| API | `app/api/` ディレクトリに Route Handlers を配置（`route.ts`） |
| ストリーミング | `ReadableStream` / Vercel AI SDK の `StreamingTextResponse` を使用 |

### Tailwind CSS v3

| 項目 | 内容 |
|------|------|
| バージョン | 3.x |
| 設定ファイル | `tailwind.config.ts` |
| CSS ファイル | `app/globals.css` に `@tailwind` ディレクティブ |
| レスポンシブ | モバイルファーストで設計。`sm:` / `md:` ブレークポイントで PC 対応 |

### PWA (next-pwa)

| 項目 | 内容 |
|------|------|
| ライブラリ | `next-pwa` |
| 設定 | `next.config.js` に `withPWA` でラップ |
| Manifest | `public/manifest.json` |
| Service Worker | `next-pwa` が自動生成（`public/sw.js`） |

---

## バックエンド

### Supabase

| 項目 | 内容 |
|------|------|
| 用途 | PostgreSQL データベース + pgvector によるベクトル検索 |
| クライアント | `@supabase/supabase-js` v2 |
| 認証 | サーバーサイドのみ `service_role key` を使用。クライアントサイドは `anon key` |
| ベクトル拡張 | `vector` 拡張（pgvector）を有効化 |
| ベクトル次元 | `768`（Gemini `text-embedding-004` の出力次元） |
| 検索方式 | コサイン類似度（`<=>` 演算子）+ RPC 関数 `match_notes` |
| インデックス | `ivfflat` インデックスで高速化（データ量が増えた際に追加） |

### Gemini API (Google AI)

| 項目 | 内容 |
|------|------|
| ライブラリ | `@google/generative-ai` |
| Embedding モデル | `text-embedding-004`（768 次元） |
| Chat モデル | `gemini-1.5-flash`（無料枠: 1500 req/日） |
| ストリーミング | `generateContentStream()` を使用 |
| System Prompt | 検索で取得した Notion ノート内容を含む |

### Notion API

| 項目 | 内容 |
|------|------|
| ライブラリ | `@notionhq/client` |
| 認証 | Integration Token（`NOTION_API_KEY`） |
| 対象 | 指定したデータベース（`NOTION_DATABASE_ID`）配下のページ |
| 取得方式 | `databases.query()` でページ一覧取得 → `blocks.children.list()` でコンテンツ取得 |

---

## インフラ・デプロイ

### Vercel

| 項目 | 内容 |
|------|------|
| 用途 | Next.js ホスティング |
| デプロイ | GitHub 連携による自動デプロイ（push to main） |
| 環境変数 | Vercel ダッシュボードで設定 |
| Runtime | Node.js 20.x |
| Edge Functions | 今回は使用しない（Supabase SDK が Edge 非対応のため） |

---

## 開発ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Node.js | 20.x LTS | ランタイム |
| pnpm | 8.x | パッケージマネージャー |
| TypeScript | 5.x | 型安全 |
| ESLint | 8.x | Linting（`eslint-config-next` ベース） |
| Prettier | 3.x | コードフォーマット |

---

## ディレクトリ構成

```
pb-sync/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # RAG チャット API（ストリーミング）
│   │   └── sync/
│   │       └── route.ts          # Notion 同期 API
│   ├── globals.css               # グローバルスタイル（Tailwind）
│   ├── layout.tsx                # ルートレイアウト（メタデータ・PWA）
│   └── page.tsx                  # メイン画面（チャット UI）
├── components/
│   ├── ChatMessage.tsx           # メッセージバブル コンポーネント
│   ├── ChatInput.tsx             # 入力フォーム コンポーネント
│   └── SyncButton.tsx            # 同期ボタン コンポーネント
├── lib/
│   ├── notion-sync.ts            # Notion 同期ロジック
│   ├── supabase.ts               # Supabase クライアント初期化
│   └── gemini.ts                 # Gemini クライアント初期化
├── supabase/
│   └── schema.sql                # DB スキーマ定義（pgvector + RPC）
├── public/
│   ├── manifest.json             # PWA マニフェスト
│   ├── icons/                    # PWA アイコン（192px, 512px）
│   └── sw.js                     # Service Worker（next-pwa 自動生成）
├── docs/
│   ├── app-spec.md               # アプリ仕様書
│   └── stack.md                  # 本ファイル
├── .github/
│   └── instructions/             # GitHub Copilot 向けコーディング規約
├── .clinerules                   # Cline 向けコーディング規約
├── .env.local.example            # 環境変数テンプレート
├── next.config.js                # Next.js + PWA 設定
├── tailwind.config.ts            # Tailwind CSS 設定
├── tsconfig.json                 # TypeScript 設定
└── package.json
```

---

## 依存パッケージ一覧

### dependencies

```json
{
  "@google/generative-ai": "^0.21.0",
  "@notionhq/client": "^2.2.15",
  "@supabase/supabase-js": "^2.45.0",
  "ai": "^3.4.0",
  "next": "^14.2.0",
  "next-pwa": "^5.6.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0"
}
```

### devDependencies

```json
{
  "@types/node": "^20.0.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "autoprefixer": "^10.4.0",
  "eslint": "^8.57.0",
  "eslint-config-next": "^14.2.0",
  "postcss": "^8.4.0",
  "prettier": "^3.3.0",
  "tailwindcss": "^3.4.0",
  "typescript": "^5.5.0"
}
```

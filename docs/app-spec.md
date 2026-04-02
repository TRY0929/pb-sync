# Personal Brain Sync (PB-Sync) — アプリ仕様書

## 概要

PB-Sync は、Notion に蓄積した個人の学習ノートをベクトル化し、AI が「自分のノートに基づいて」回答してくれる自分専用 RAG（検索拡張生成）チャットアプリです。

---

## ユーザーストーリー

| # | As a | I want to | So that |
|---|------|-----------|---------|
| 1 | ユーザー | Notion のノートを PB-Sync に同期したい | AI が自分のノートを参照できるようにする |
| 2 | ユーザー | 「去年の物理のノートには？」と質問したい | 膨大なノートから瞬時に関連箇所を探し出せる |
| 3 | ユーザー | 自分の言葉でまとめた解説を受け取りたい | 一般論ではなく自分の理解をベースにした回答が欲しい |
| 4 | ユーザー | スマホのホーム画面からアクセスしたい | 移動中も自分のノートを検索できる |
| 5 | ユーザー | 0 円で運用したい | 各サービスの無料枠内で維持費をかけずに使い続けられる |

---

## 機能要件

### 1. Notion 同期機能
- **FR-01**: ユーザーは「Notion から同期」ボタンを押すことで、指定した Notion データベースのページ一覧を取得できる
- **FR-02**: 各ページのテキストコンテンツを `text-embedding-004` モデルでベクトル化し、Supabase に保存する
- **FR-03**: 差分更新（Upsert）に対応する。既に同期済みのページは `last_synced_at` を比較して必要な場合のみ更新する
- **FR-04**: 同期の進行状況をUIに表示する（例：「同期中... 5/20 ページ完了」）
- **FR-05**: 同期完了後、同期件数をUIに表示する

### 2. RAG チャット機能
- **FR-06**: ユーザーはテキストフィールドに質問を入力して送信できる
- **FR-07**: 質問をベクトル化し、コサイン類似度で上位3件の関連ノートを検索する
- **FR-08**: 関連ノートの内容を System Prompt に含め、Gemini 1.5 Flash で回答を生成する
- **FR-09**: 回答はストリーミングで表示する（生成中に文字が逐次表示される）
- **FR-10**: チャット履歴を画面内に表示する（セッション中のみ保持）

### 3. PWA 対応
- **FR-11**: スマホのホーム画面に追加できる（`manifest.json` 設定）
- **FR-12**: Service Worker によるオフラインキャッシュ（静的アセット）
- **FR-13**: スマホで片手操作しやすいレイアウト

---

## 非機能要件

| カテゴリ | 要件 |
|---------|------|
| パフォーマンス | チャット回答の初回トークンまで 3 秒以内（ネットワーク除く） |
| コスト | 各サービスの無料枠内で運用（月額 0 円） |
| セキュリティ | API キーは環境変数で管理、クライアントに露出しない |
| 可用性 | Vercel + Supabase の無料プランの SLA に準ずる |
| アクセシビリティ | スマホ画面（375px〜）で全機能が利用可能 |

---

## 画面設計

### メイン画面（`/`）

```
┌─────────────────────────────┐
│  🧠 Personal Brain Sync     │  ← ヘッダー
│              [Notionと同期] │
├─────────────────────────────┤
│                             │
│  [AI] こんにちは！ノートに   │
│  ついて何でも聞いてください。 │
│                             │
│        [あなた] 量子力学の  │
│        波動関数とは？       │
│                             │
│  [AI] あなたのノートには... │
│  ░░░░ (ストリーミング中)    │
│                             │
├─────────────────────────────┤
│  [テキスト入力フィールド]  ▶ │  ← フッター（固定）
└─────────────────────────────┘
```

---

## データモデル

### `notes` テーブル（Supabase）

| カラム | 型 | 説明 |
|-------|----|------|
| `id` | `uuid` | 主キー（自動生成） |
| `notion_page_id` | `text` | Notion ページ ID（UNIQUE） |
| `title` | `text` | ページタイトル |
| `content` | `text` | ページ本文（プレーンテキスト） |
| `embedding` | `vector(768)` | テキストの埋め込みベクトル |
| `last_synced_at` | `timestamptz` | 最終同期日時 |
| `created_at` | `timestamptz` | レコード作成日時 |

### RPC 関数：`match_notes`

```sql
-- 入力: query_embedding vector(768), match_count int
-- 出力: id, notion_page_id, title, content, similarity
-- コサイン類似度で上位 match_count 件を返す
```

---

## API エンドポイント

### `POST /api/sync`
Notion データベースを同期する。

**Request Body:**
```json
{}
```

**Response (Stream):**
```
data: {"status": "syncing", "current": 1, "total": 20}
data: {"status": "syncing", "current": 2, "total": 20}
...
data: {"status": "done", "synced": 20}
```

---

### `POST /api/chat`
RAG チャットを実行する。

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "量子力学の波動関数とは？" }
  ]
}
```

**Response (Stream):**
テキストストリーム（Vercel AI SDK 形式）

---

## 利用するサービスと無料枠

| サービス | 用途 | 無料枠 |
|---------|------|--------|
| Vercel | ホスティング | 100GB 帯域 / 月、無制限デプロイ |
| Supabase | DB + ベクトル検索 | 500MB DB、50MB ファイル |
| Gemini API | LLM + Embedding | Flash: 1500 req/日、Embedding: 無制限（要確認） |
| Notion API | データソース | 無料（Integration 利用） |

---

## 環境変数

```env
# Notion
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=xxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJxxx
SUPABASE_SECRET_KEY=eyJxxx

# Gemini
GEMINI_API_KEY=AIzaxxx
```

# 環境変数の取得方法

## NOTION_API_KEY

1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) を開く
2. **「+ 新しいインテグレーション」** をクリック
3. 名前（例: `pb-sync`）を入力して送信
4. 表示された **「内部インテグレーションシークレット」**（`secret_xxx...`）をコピー

> インテグレーションを同期対象のデータベースページに接続する必要があります。
> データベースページを開き、右上「…」→「コネクトを追加」→ 作成したインテグレーションを選択。

---

## NOTION_DATABASE_ID

1. Notion でブラウザから同期対象のデータベースを開く
2. URL を確認:
   ```
   https://www.notion.so/<ワークスペース名>/<DATABASE_ID>?v=xxx
   ```
3. `?v=` の前にある 32 文字の英数字が `NOTION_DATABASE_ID`

例:
```
https://www.notion.so/myworkspace/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d?v=...
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                   これが DATABASE_ID
```

---

## NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

1. [https://supabase.com/dashboard](https://supabase.com/dashboard) でプロジェクトを作成（または既存プロジェクトを選択）
2. 左メニュー **「Project Settings」** → **「API」** を開く
3. 以下の値をコピー:

| 環境変数 | 場所 |
|---------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project API keys** → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys** → `service_role` `secret` |

> `service_role` キーは強力な権限を持ちます。クライアントサイドに公開しないでください。

---

## GEMINI_API_KEY

1. [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) を開く
2. **「APIキーを作成」** をクリック
3. 生成された `AIza...` で始まるキーをコピー

> 無料枠: `gemini-1.5-flash` は 1,500 リクエスト/日、`text-embedding-004` は無制限（要確認）

---

## DB セットアップ（Supabase）

環境変数設定後、Supabase の **SQL Editor** で以下を実行:

```sql
-- supabase/schema.sql の内容を貼り付けて実行
```

または Supabase CLI を使用:

```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```

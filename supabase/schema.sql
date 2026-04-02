-- pgvector 拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- notes テーブル
CREATE TABLE IF NOT EXISTS notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id  text UNIQUE NOT NULL,
  title           text NOT NULL DEFAULT '',
  content         text NOT NULL DEFAULT '',
  embedding       vector(768),
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- コサイン類似度によるベクトル検索 RPC 関数
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(768),
  match_count     int DEFAULT 3
)
RETURNS TABLE (
  id              uuid,
  notion_page_id  text,
  title           text,
  content         text,
  similarity      float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.notion_page_id,
    n.title,
    n.content,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE n.embedding IS NOT NULL
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ivfflat インデックス（データ量が増えた際に有効化）
-- CREATE INDEX ON notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

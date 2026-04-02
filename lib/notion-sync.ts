import { Client } from '@notionhq/client'
import { supabaseAdmin } from './supabase'
import { embedText } from './gemini'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  timeoutMs: 30000,
})

interface NotionPage {
  id: string
  title: string
  content: string
  lastEditedTime: string
}

// データベース内のページ一覧を取得
async function fetchDatabasePages(): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined = undefined

  do {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID!,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const page of response.results) {
      if (page.object !== 'page') continue

      // タイトル取得
      let title = 'Untitled'
      const props = (page as { properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }> }).properties
      for (const prop of Object.values(props)) {
        if (prop.type === 'title' && prop.title && prop.title.length > 0) {
          title = prop.title.map((t) => t.plain_text).join('')
          break
        }
      }

      // ブロックのテキストコンテンツ取得
      const content = await fetchPageContent(page.id)

      pages.push({
        id: page.id,
        title,
        content,
        lastEditedTime: (page as { last_edited_time: string }).last_edited_time,
      })
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  return pages
}

// ページのブロック内容をプレーンテキストで取得
async function fetchPageContent(pageId: string, depth = 0): Promise<string> {
  if (depth > 3) return '' // 無限再帰防止
  const blocks: string[] = []
  const childPromises: Promise<string>[] = []
  let cursor: string | undefined = undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      const b = block as Record<string, unknown>
      const type = b.type as string

      // link_to_page → リンク先ページを並列取得
      if (type === 'link_to_page') {
        const linkData = b['link_to_page'] as { type: string; page_id?: string }
        if (linkData?.page_id) {
          childPromises.push(fetchPageContent(linkData.page_id, depth + 1))
        }
        continue
      }

      // child_page → サブページを並列取得
      if (type === 'child_page') {
        childPromises.push(fetchPageContent(b.id as string, depth + 1))
        continue
      }

      const text = extractTextFromBlock(b)
      if (text) blocks.push(text)

      // has_children のブロック（toggle等）は並列取得
      if (b.has_children && type !== 'child_database') {
        childPromises.push(fetchPageContent(b.id as string, depth + 1))
      }
    }

    cursor = (response as { next_cursor: string | null }).next_cursor ?? undefined
  } while (cursor)

  const childResults = await Promise.all(childPromises)
  blocks.push(...childResults.filter(Boolean))

  return blocks.join('\n')
}

function extractTextFromBlock(block: Record<string, unknown>): string {
  const richTextTypes = [
    'paragraph',
    'heading_1',
    'heading_2',
    'heading_3',
    'bulleted_list_item',
    'numbered_list_item',
    'toggle',
    'quote',
    'callout',
    'code',
  ]

  const type = block.type as string
  if (!richTextTypes.includes(type)) return ''

  const blockContent = block[type] as { rich_text?: Array<{ plain_text: string }> }
  if (!blockContent?.rich_text) return ''

  return blockContent.rich_text.map((t) => t.plain_text).join('')
}

// テキストをチャンクに分割（4000文字、500文字オーバーラップ）
function splitIntoChunks(text: string, chunkSize = 4000, overlap = 500): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize))
    start += chunkSize - overlap
  }
  return chunks
}

// 同期済みページの last_synced_at を取得（チャンクの先頭レコードで代表）
async function fetchSyncedPages(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('notes')
    .select('notion_page_id, last_synced_at')

  if (error) throw new Error(`[Supabase SELECT] ${error.message}`)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    // "__chunk_N" サフィックスを除いた元のページIDをキーにする
    const baseId = row.notion_page_id.replace(/__chunk_\d+$/, '')
    if (!map.has(baseId)) {
      map.set(baseId, row.last_synced_at)
    }
  }
  return map
}

export interface SyncProgress {
  status: 'syncing' | 'done'
  current?: number
  total?: number
  synced?: number
}

// Notion DB を Supabase に同期（コールバックで進捗通知）
export async function syncNotionToSupabase(
  onProgress: (progress: SyncProgress) => void
): Promise<void> {
  const pages = await fetchDatabasePages()
  console.log(`[notion-sync] fetched ${pages.length} pages`)
  pages.forEach((p) => console.log(`  - "${p.title}" content length: ${p.content.length}`))
  const syncedPages = await fetchSyncedPages()

  let syncedCount = 0
  const total = pages.length

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    onProgress({ status: 'syncing', current: i + 1, total })

    // 差分チェック：既に同期済みで更新がなければスキップ
    const existingLastSynced = syncedPages.get(page.id)
    if (existingLastSynced) {
      const lastEdited = new Date(page.lastEditedTime).getTime()
      const lastSynced = new Date(existingLastSynced).getTime()
      if (lastEdited <= lastSynced) continue
    }

    // コンテンツが空の場合はスキップ
    const fullText = `${page.title}\n${page.content}`.trim()
    if (!fullText) continue

    // ページ更新時は既存チャンクを全削除してから再挿入
    const { error: deleteError } = await supabaseAdmin
      .from('notes')
      .delete()
      .like('notion_page_id', `${page.id}%`)
    if (deleteError) throw new Error(`[Supabase DELETE] ${deleteError.message}`)

    // チャンク分割してそれぞれをベクトル化・保存
    const chunks = splitIntoChunks(fullText)
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkId = chunks.length === 1 ? page.id : `${page.id}__chunk_${ci}`
      const chunkTitle = chunks.length === 1 ? page.title : `${page.title} (${ci + 1}/${chunks.length})`
      const embedding = await embedText(chunks[ci])

      const { error } = await supabaseAdmin.from('notes').upsert(
        {
          notion_page_id: chunkId,
          title: chunkTitle,
          content: chunks[ci],
          embedding,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'notion_page_id' }
      )
      if (error) throw new Error(`[Supabase UPSERT] ${error.message}`)
    }

    console.log(`[notion-sync] "${page.title}" → ${chunks.length} chunk(s)`)
    syncedCount++
  }

  onProgress({ status: 'done', synced: syncedCount })
}

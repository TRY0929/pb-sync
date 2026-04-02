'use client'

import { useState } from 'react'

export default function SyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [syncedCount, setSyncedCount] = useState<number | null>(null)

  const handleSync = async () => {
    setStatus('syncing')
    setProgress(null)
    setSyncedCount(null)

    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      if (!res.ok || !res.body) throw new Error('Sync request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))

          if (data.status === 'syncing') {
            setProgress({ current: data.current, total: data.total })
          } else if (data.status === 'done') {
            setSyncedCount(data.synced)
            setStatus('done')
          } else if (data.status === 'error') {
            setStatus('error')
          }
        }
      }
    } catch (error) {
      console.error('[SyncButton]', error)
      setStatus('error')
    }

    // 3秒後にリセット
    setTimeout(() => {
      setStatus('idle')
      setProgress(null)
      setSyncedCount(null)
    }, 3000)
  }

  const label = () => {
    if (status === 'syncing' && progress) {
      return `同期中... ${progress.current}/${progress.total}`
    }
    if (status === 'done') return `✓ ${syncedCount}件同期完了`
    if (status === 'error') return '✗ エラー'
    return 'Notionと同期'
  }

  return (
    <button
      onClick={handleSync}
      disabled={status === 'syncing'}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
        status === 'done'
          ? 'bg-green-700 text-green-100'
          : status === 'error'
            ? 'bg-red-700 text-red-100'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50'
      }`}
    >
      {label()}
    </button>
  )
}

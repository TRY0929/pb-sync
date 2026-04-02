import ChatWindow from '@/components/ChatWindow'
import SyncButton from '@/components/SyncButton'

export default function Home() {
  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <h1 className="text-lg font-bold text-purple-400">🧠 Puiken's Brain Sync</h1>
        <SyncButton />
      </header>

      {/* チャットエリア */}
      <ChatWindow />
    </div>
  )
}

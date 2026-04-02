import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Personal Brain Sync',
  description: '自分のNotionノートに基づいてAIが回答する自分専用RAGチャット',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PB-Sync',
  },
}

export const viewport: Viewport = {
  themeColor: '#1e1e2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-gray-100 h-full">{children}</body>
    </html>
  )
}

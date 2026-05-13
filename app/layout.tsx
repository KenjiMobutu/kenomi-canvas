import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kenomi',
  description: 'Kenomi AI Venture Studio',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  )
}

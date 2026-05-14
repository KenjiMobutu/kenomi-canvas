import { StudioSidebar } from '@/components/StudioSidebar'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <StudioSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

import { StudioSidebar } from '@/components/StudioSidebar'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <StudioSidebar />
      {/* pb-[60px] reserves space for mobile bottom nav; md:pb-0 removes it on desktop */}
      <div className="flex-1 min-w-0 pb-[60px] md:pb-0">{children}</div>
    </div>
  )
}

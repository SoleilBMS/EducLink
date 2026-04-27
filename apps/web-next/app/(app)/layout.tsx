import { Sidebar } from '@/components/shell/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-6 py-6 lg:px-8 animate-fade-up">{children}</main>
    </div>
  );
}

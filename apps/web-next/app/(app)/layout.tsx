import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/Sidebar';
import { getCurrentUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />
      <main className="flex-1 px-6 py-6 lg:px-8 animate-fade-up">{children}</main>
    </div>
  );
}

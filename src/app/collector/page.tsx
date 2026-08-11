import { CollectorDashboard } from '@/features/collector/components/CollectorDashboard';

export const metadata = {
  title: 'Collector Dashboard | Waste Management Platform',
  description: 'Manage waste collection requests, submit evidence, and process AI verification.',
};

export default function CollectorPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <CollectorDashboard />
    </main>
  );
}

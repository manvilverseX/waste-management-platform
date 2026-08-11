import Link from 'next/link';
import { Truck, Home as HomeIcon, Users, Building2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-8 text-center">
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Waste Management Platform
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Community-driven waste tracking, automated collector workflows, and AI-powered evidence verification.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-8">
          <Link
            href="/collector"
            className="p-6 bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl text-left transition-all hover:scale-[1.02] group"
          >
            <Truck className="w-8 h-8 text-emerald-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-1">Collector Portal</h3>
            <p className="text-xs text-slate-400">View requests, upload evidence & AI verification.</p>
          </Link>

          <Link
            href="/resident"
            className="p-6 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl text-left transition-all hover:scale-[1.02] group"
          >
            <HomeIcon className="w-8 h-8 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-1">Resident Portal</h3>
            <p className="text-xs text-slate-400">Request waste pickup & view rewards.</p>
          </Link>

          <Link
            href="/community"
            className="p-6 bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl text-left transition-all hover:scale-[1.02] group"
          >
            <Users className="w-8 h-8 text-amber-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-1">Community Hub</h3>
            <p className="text-xs text-slate-400">Track scores, leaderboard & dumping hotspots.</p>
          </Link>

          <Link
            href="/municipality"
            className="p-6 bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl text-left transition-all hover:scale-[1.02] group"
          >
            <Building2 className="w-8 h-8 text-purple-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-1">Municipality</h3>
            <p className="text-xs text-slate-400">City analytics & issue management.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}


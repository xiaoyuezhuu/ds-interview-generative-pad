"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Terminal } from 'lucide-react';

export default function ModeSwitcher() {
  const pathname = usePathname();
  const isSql = pathname.includes('/sql');
  const isPython = pathname.includes('/python');

  return (
    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
      <Link
        href="/sql"
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          isSql
            ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <Database className="w-4 h-4" />
        SQL
      </Link>
      <Link
        href="/python"
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          isPython
            ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700 dark:text-emerald-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <Terminal className="w-4 h-4" />
        Python
      </Link>
    </div>
  );
}


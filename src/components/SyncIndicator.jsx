import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Intelligent Cloud Sync Indicator Component
 * Displays real-time status of atomic Google Sheets synchronization.
 *
 * States:
 * - 'synced': Green pulsing dot + "Zsynchronizowano z chmurą [HH:mm]"
 * - 'saving': Rotating spinner + "Zapisywanie w arkuszu..."
 * - 'error': Alert triangle + "Błąd zapisu – kliknij, aby ponowić"
 */
export default function SyncIndicator({ status = 'synced', lastSyncTime = null, onRetry = () => {} }) {
  const formatTime = (time) => {
    if (!time) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    const d = typeof time === 'string' || typeof time === 'number' ? new Date(time) : time;
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formattedTime = formatTime(lastSyncTime);

  if (status === 'saving' || status === 'syncing' || status === 'refreshing') {
    return (
      <div
        className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-200/80 text-indigo-700 shadow-2xs animate-in fade-in duration-150 shrink-0 whitespace-nowrap"
        title="Trwa pobieranie i synchronizacja najświeższych danych z chmury"
      >
        <Loader2 size={13} className="animate-spin text-indigo-600 shrink-0" />
        <span className="hidden lg:inline">Synchronizacja z chmurą...</span>
        <span className="hidden sm:inline lg:hidden">Synchronizacja...</span>
        <span className="sm:hidden text-[11px]">Sync...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 shadow-2xs transition-all cursor-pointer shrink-0 whitespace-nowrap animate-in fade-in duration-150"
        title="Wystąpił błąd zapisu do chmury. Kliknij, aby ponowić synchronizację."
      >
        <AlertTriangle size={13} className="text-amber-600 shrink-0" />
        <span className="hidden lg:inline">Błąd zapisu – kliknij, aby ponowić</span>
        <span className="hidden sm:inline lg:hidden">Błąd – ponów</span>
        <span className="sm:hidden text-[11px]">Błąd zapisu</span>
      </button>
    );
  }

  // Default: 'synced'
  return (
    <div
      className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs animate-in fade-in duration-150 shrink-0 whitespace-nowrap"
      title="Wszystkie rekordy są zsynchronizowane z arkuszem Google Sheets"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="hidden lg:inline">Zsynchronizowano z chmurą {formattedTime ? `[${formattedTime}]` : ''}</span>
      <span className="hidden sm:inline lg:hidden">Zsynchronizowano {formattedTime ? `[${formattedTime}]` : ''}</span>
      <span className="sm:hidden text-[11px] font-mono">{formattedTime ? `[${formattedTime}]` : 'OK'}</span>
    </div>
  );
}

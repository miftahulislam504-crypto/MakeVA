'use client';

import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { HistoryItem } from '@/lib/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { cx } from './ui';

interface Props {
  items: HistoryItem[];
  onDownload: (item: HistoryItem) => Promise<void>;
  onDelete: (item: HistoryItem) => Promise<void>;
}

export default function HistoryList({ items, onDownload, onDelete }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    try {
      await action();
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  if (!items.length) {
    return (
      <p className="rounded-2xl border border-white/10 px-5 py-8 text-center text-sm text-neutral-500">
        Finished videos will appear here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
      {items.map((item) => {
        const working = busy === item.id;
        const confirming = confirm === item.id;
        return (
          <li key={item.releaseId} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{item.name}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatBytes(item.size)}, {formatDate(item.createdAt)}
              </p>
            </div>

            <button
              type="button"
              disabled={working}
              onClick={() => run(item.id, () => onDownload(item))}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-40"
            >
              <Download size={14} strokeWidth={1.75} />
              Download
            </button>

            <button
              type="button"
              disabled={working}
              aria-label={confirming ? 'Confirm delete' : 'Delete video'}
              onClick={() =>
                confirming
                  ? run(item.id, () => onDelete(item))
                  : setConfirm(item.id)
              }
              onBlur={() => setConfirm((c) => (c === item.id ? null : c))}
              className={cx(
                'inline-flex h-9 items-center gap-1.5 text-xs transition-colors disabled:opacity-40',
                confirming ? 'text-white' : 'text-neutral-600 hover:text-white',
              )}
            >
              <Trash2 size={14} strokeWidth={1.5} />
              {confirming ? 'Confirm' : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

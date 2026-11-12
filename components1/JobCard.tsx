'use client';

import { useEffect, useState } from 'react';
import type { Job } from '@/lib/types';
import { formatElapsed } from '@/lib/utils';
import { Button, Progress } from './ui';

interface Props {
  job: Job;
  onDismiss: (id: string) => void;
}

export default function JobCard({ job, onDismiss }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (job.phase === 'failed') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.phase]);

  const failed = job.phase === 'failed';

  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate text-sm text-white">{job.fileName}</p>
        {!failed && (
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">
            {formatElapsed(now - job.startedAt)}
          </span>
        )}
      </div>

      {failed ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300" role="alert">
            {job.error}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {job.runUrl && (
              <a
                href={job.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border border-white/15 px-4 text-xs text-white transition-colors hover:bg-white/5"
              >
                Open log on GitHub
              </a>
            )}
            <Button variant="quiet" className="h-9 text-xs" onClick={() => onDismiss(job.id)}>
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <Progress value={job.progress} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 text-xs text-neutral-500">
            <span>{job.label}</span>
            {job.runUrl && (
              <a
                href={job.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                View on GitHub
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

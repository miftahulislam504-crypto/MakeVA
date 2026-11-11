'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ConnectPanel, { ConnectValues } from '@/components/ConnectPanel';
import Uploader from '@/components/Uploader';
import JobCard from '@/components/JobCard';
import HistoryList from '@/components/HistoryList';
import {
  GitHubError,
  deleteRender,
  dispatchRender,
  ensureSetup,
  findRun,
  getRun,
  getSteps,
  listActiveRuns,
  listHistory,
  requestDownloadUrl,
  uploadZip,
  verifyToken,
} from '@/lib/github';
import { computeProgress } from '@/lib/progress';
import { clearAuth, loadAuth, saveAuth } from '@/lib/storage';
import type { Auth, HistoryItem, Job, RunInfo, Visibility } from '@/lib/types';
import { errMessage, makeId, sleep, slugName } from '@/lib/utils';

export default function Page() {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authRef = useRef<Auth | null>(null);
  const branchRef = useRef('main');
  const tracked = useRef<Set<string>>(new Set());

  const patchJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const refreshHistory = useCallback(async (a: Auth) => {
    try {
      setHistory(await listHistory(a));
    } catch {
      // keep the previous list
    }
  }, []);

  /** Follows one workflow run until it finishes. */
  const track = useCallback(
    async (a: Auth, id: string, knownRun?: RunInfo) => {
      if (tracked.current.has(id)) return;
      tracked.current.add(id);

      try {
        let run: RunInfo | null = knownRun ?? null;
        for (let i = 0; !run && i < 40; i++) {
          run = await findRun(a, id);
          if (!run) await sleep(3000);
        }
        if (!run) {
          throw new Error(
            'The render did not start. Open the Actions tab of your renderer repository to see why.',
          );
        }
        patchJob(id, { runId: run.id, runUrl: run.html_url });

        let errors = 0;
        for (;;) {
          let outcome: 'continue' | 'success' | 'failed' = 'continue';
          try {
            const current = await getRun(a, run.id);
            if (current.status === 'completed') {
              outcome = current.conclusion === 'success' ? 'success' : 'failed';
            } else if (current.status === 'in_progress') {
              const steps = await getSteps(a, run.id);
              const p = computeProgress(steps);
              patchJob(id, {
                phase: 'running',
                label: p.label,
                progress: 0.12 + p.value * 0.88,
              });
            } else {
              patchJob(id, { phase: 'queued', label: 'Queued', progress: 0.12 });
            }
            errors = 0;
          } catch (e) {
            if (++errors > 6) throw e;
          }

          if (outcome === 'success') {
            await refreshHistory(a);
            setJobs((list) => list.filter((j) => j.id !== id));
            return;
          }
          if (outcome === 'failed') {
            throw new Error(
              'The render failed. Open the log on GitHub to see what went wrong.',
            );
          }
          await sleep(5000);
        }
      } catch (e) {
        patchJob(id, { phase: 'failed', error: errMessage(e) });
      } finally {
        tracked.current.delete(id);
      }
    },
    [patchJob, refreshHistory],
  );

  /** Picks up renders that were started earlier and are still running. */
  const resumeActive = useCallback(
    async (a: Auth) => {
      try {
        const active = await listActiveRuns(a);
        for (const { id, run } of active) {
          setJobs((list) =>
            list.some((j) => j.id === id)
              ? list
              : [
                  {
                    id,
                    fileName: 'Render ' + id,
                    phase: 'running',
                    label: 'Rendering video',
                    progress: 0.12,
                    startedAt: run.created_at ? Date.parse(run.created_at) : Date.now(),
                    runId: run.id,
                    runUrl: run.html_url,
                  },
                  ...list,
                ],
          );
          void track(a, id, run);
        }
      } catch {
        // not critical
      }
    },
    [track],
  );

  // Restore a saved session.
  useEffect(() => {
    const saved = loadAuth();
    if (!saved) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const a = await verifyToken(saved.username, saved.token);
        authRef.current = a;
        setAuth(a);
        void refreshHistory(a);
        void resumeActive(a);
      } catch (e) {
        if (e instanceof GitHubError && (e.status === 401 || e.status === 403)) {
          clearAuth();
          setStartError('Your saved token is no longer valid. Connect again.');
        } else {
          setStartError('Could not reach GitHub. Check your connection and reload.');
        }
      } finally {
        setReady(true);
      }
    })();
  }, [refreshHistory, resumeActive]);

  async function handleConnect(
    values: ConnectValues,
    onStep: (label: string) => void,
  ) {
    const a = await verifyToken(values.username, values.token);
    setVisibility(values.visibility);
    branchRef.current = await ensureSetup(a, values.visibility, onStep);
    saveAuth(a, values.remember);
    authRef.current = a;
    setStartError(null);
    setAuth(a);
    void refreshHistory(a);
    void resumeActive(a);
  }

  function disconnect() {
    clearAuth();
    authRef.current = null;
    setAuth(null);
    setJobs([]);
    setHistory([]);
    setNotice(null);
  }

  async function startRender(file: File, composition: string) {
    const a = authRef.current;
    if (!a) return;

    const id = makeId();
    const startedAt = Date.now();
    setNotice(null);
    setJobs((list) => [
      {
        id,
        fileName: file.name,
        phase: 'uploading',
        label: 'Preparing repository',
        progress: 0,
        startedAt,
      },
      ...list,
    ]);

    try {
      const branch = await ensureSetup(a, visibility, (label) =>
        patchJob(id, { label }),
      );
      branchRef.current = branch;

      patchJob(id, { label: 'Uploading project' });
      await uploadZip(a, id, file, (fraction) =>
        patchJob(id, { label: 'Uploading project', progress: fraction * 0.1 }),
      );

      patchJob(id, { label: 'Starting render', progress: 0.1 });
      await sleep(1500);
      await dispatchRender(a, branch, id, composition.trim(), slugName(file.name));

      patchJob(id, { phase: 'queued', label: 'Queued', progress: 0.12 });
      void track(a, id);
    } catch (e) {
      patchJob(id, { phase: 'failed', error: errMessage(e) });
    }
  }

  async function handleDownload(item: HistoryItem) {
    const a = authRef.current;
    if (!a) return;
    setNotice(null);
    try {
      window.location.assign(await requestDownloadUrl(a, item.assetId));
    } catch (e) {
      setNotice(errMessage(e));
    }
  }

  async function handleDelete(item: HistoryItem) {
    const a = authRef.current;
    if (!a) return;
    setNotice(null);
    try {
      await deleteRender(a, item);
      setHistory((list) => list.filter((h) => h.releaseId !== item.releaseId));
    } catch (e) {
      setNotice(errMessage(e));
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 pb-24 pt-8 sm:pt-14">
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium tracking-tight text-white">
          Remotion Cloud
        </span>
        {auth && (
          <div className="flex items-center gap-4 text-sm text-neutral-500">
            <span className="max-w-[40vw] truncate">{auth.username}</span>
            <button
              type="button"
              onClick={disconnect}
              className="transition-colors hover:text-white"
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      <section className="mt-16 sm:mt-24">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          Drop a zip.
          <br />
          Get an MP4.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-400">
          Upload a Remotion project and it renders on your own GitHub Actions.
          This site only coordinates the work.
        </p>
      </section>

      <section className="mt-12 space-y-10 sm:mt-14">
        {!ready ? null : !auth ? (
          <ConnectPanel onConnect={handleConnect} initialError={startError} />
        ) : (
          <>
            <Uploader onRender={startRender} />

            {jobs.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-white">In progress</h2>
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onDismiss={(id) =>
                      setJobs((list) => list.filter((j) => j.id !== id))
                    }
                  />
                ))}
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-white">Your videos</h2>
              {notice && (
                <p className="text-sm text-neutral-300" role="alert">
                  {notice}
                </p>
              )}
              <HistoryList
                items={history}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            </div>
          </>
        )}
      </section>

      <footer className="mt-20 border-t border-white/10 pt-6 text-xs leading-relaxed text-neutral-600">
        Your token stays in this browser and talks to GitHub directly. It
        reaches our server only for a moment when you download a video, to ask
        GitHub for a temporary link, and is never stored.
      </footer>
    </main>
  );
}

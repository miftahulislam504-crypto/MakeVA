'use client';

import { useRef, useState } from 'react';
import { FileArchive, X } from 'lucide-react';
import type { ZipInfo } from '@/lib/types';
import { inspectZip, MAX_ZIP_MB } from '@/lib/zipCheck';
import { errMessage, formatBytes } from '@/lib/utils';
import { Button, Label, cx, inputCls } from './ui';

interface Props {
  onRender: (file: File, composition: string) => void;
}

export default function Uploader({ onRender }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [checking, setChecking] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ZipInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composition, setComposition] = useState('');
  const [advanced, setAdvanced] = useState(false);

  async function pick(f: File | undefined | null) {
    if (!f) return;
    setError(null);
    setInfo(null);
    setFile(null);
    setChecking(true);
    try {
      const result = await inspectZip(f);
      setFile(f);
      setInfo(result);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setFile(null);
    setInfo(null);
    setError(null);
    setComposition('');
    setAdvanced(false);
  }

  function submit() {
    if (!file || !info) return;
    onRender(file, composition);
    reset();
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!file || !info ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              input.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={cx(
            'flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center outline-none transition-colors duration-200 focus-visible:border-white',
            drag
              ? 'border-white bg-white/[0.04]'
              : 'border-white/15 hover:border-white/40',
          )}
        >
          <FileArchive size={22} strokeWidth={1.25} className="text-neutral-500" />
          <p className="mt-4 text-sm text-white">
            {checking ? 'Checking the project' : 'Drop your Remotion project zip here'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            or tap to choose a file. Up to {MAX_ZIP_MB} MB, without node_modules.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{file.name}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatBytes(info.size)}, {info.fileCount} files
                {info.packageName ? ', ' + info.packageName : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label="Remove file"
              className="text-neutral-500 transition-colors hover:text-white"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {advanced ? (
            <label className="mt-5 block space-y-2">
              <Label>Composition id</Label>
              <input
                className={inputCls}
                value={composition}
                onChange={(e) => setComposition(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Detected automatically if left empty"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className="mt-5 text-xs text-neutral-500 transition-colors hover:text-white"
            >
              Choose a composition manually
            </button>
          )}

          <Button onClick={submit} className="mt-5 w-full">
            Render video
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm leading-relaxed text-white" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

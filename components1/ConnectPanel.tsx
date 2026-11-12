'use client';

import { FormEvent, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Visibility } from '@/lib/types';
import { errMessage } from '@/lib/utils';
import { Button, Label, cx, inputCls } from './ui';

export interface ConnectValues {
  username: string;
  token: string;
  remember: boolean;
  visibility: Visibility;
}

interface Props {
  onConnect: (
    values: ConnectValues,
    onStep: (label: string) => void,
  ) => Promise<void>;
  initialError?: string | null;
}

const TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Remotion%20Cloud';

export default function ConnectPanel({ onConnect, initialError }: Props) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step) return;
    setError(null);
    setStep('Verifying token');
    try {
      await onConnect(
        { username: username.trim(), token: token.trim(), remember, visibility },
        setStep,
      );
    } catch (err) {
      setError(errMessage(err));
      setStep(null);
    }
  }

  const ready = username.trim().length > 0 && token.trim().length > 0;

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 p-5 sm:p-7"
    >
      <h2 className="text-lg font-medium tracking-tight text-white">
        Connect your GitHub account
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-500">
        Videos render on your own GitHub Actions. We create one repository in
        your account and use it for every render.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <Label>GitHub username</Label>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="octocat"
          />
        </label>

        <label className="block space-y-2">
          <span className="flex items-center justify-between">
            <Label>Personal access token (classic)</Label>
            <a
              href={TOKEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-white"
            >
              Create a token
              <ArrowUpRight size={12} strokeWidth={1.5} />
            </a>
          </span>
          <input
            className={inputCls}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ghp_..."
          />
          <span className="block text-xs leading-relaxed text-neutral-600">
            Needs the repo and workflow scopes. Delete the token on GitHub when
            you are done.
          </span>
        </label>

        <div className="space-y-2">
          <Label>Repository visibility (applies when it is first created)</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={visibility === v}
                onClick={() => setVisibility(v)}
                className={cx(
                  'h-11 rounded-xl border text-sm transition-colors duration-200',
                  visibility === v
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 text-neutral-400 hover:border-white/30 hover:text-white',
                )}
              >
                {v === 'private' ? 'Private' : 'Public'}
              </button>
            ))}
          </div>
          <span className="block text-xs leading-relaxed text-neutral-600">
            Private repositories include 2,000 free Actions minutes a month.
            Public repositories have no limit, but your project and videos are
            visible to everyone.
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-3 pt-1 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-white"
          />
          Remember me on this device
        </label>
      </div>

      {error && (
        <p className="mt-5 text-sm leading-relaxed text-white" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={!ready || step !== null}
        className="mt-6 w-full"
      >
        {step ?? 'Connect'}
      </Button>
    </form>
  );
}

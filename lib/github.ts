import type {
  Auth,
  HistoryItem,
  RunInfo,
  StepInfo,
  Visibility,
} from './types';
import { DETECT_SCRIPT, WORKFLOW_YAML } from './templates';
import { sleep } from './utils';

export const REPO_NAME = 'remotion-renderer';
export const WORKFLOW_FILE = 'render.yml';
const API = 'https://api.github.com';

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/* ---------- low level ---------- */

async function request(
  auth: { token: string },
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + auth.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  // no-store: api.github.com sends max-age=60, which would make polling stale.
  return fetch(API + path, { ...init, headers, cache: 'no-store' });
}

async function fail(res: Response): Promise<never> {
  let message = res.statusText || 'Request failed';
  try {
    const data = (await res.json()) as { message?: string };
    if (data && data.message) message = data.message;
  } catch {
    // body was not JSON
  }
  if (res.status === 401) message = 'The token is invalid or has expired.';
  throw new GitHubError(message, res.status);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) return fail(res);
  return (await res.json()) as T;
}

const repoPath = (auth: Auth) => '/repos/' + auth.username + '/' + REPO_NAME;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/* ---------- account + repository ---------- */

export async function verifyToken(
  username: string,
  token: string,
): Promise<Auth> {
  const res = await request({ token }, '/user');
  if (!res.ok) await fail(res);

  const user = (await res.json()) as { login: string };
  if (username && user.login.toLowerCase() !== username.trim().toLowerCase()) {
    throw new GitHubError(
      'This token belongs to "' + user.login + '", not "' + username + '".',
      403,
    );
  }

  // Classic tokens report their scopes. Fine-grained tokens do not.
  const scopes = res.headers.get('x-oauth-scopes');
  if (scopes !== null) {
    const list = scopes.split(',').map((s) => s.trim());
    if (!list.includes('repo') || !list.includes('workflow')) {
      throw new GitHubError(
        'The token needs the "repo" and "workflow" scopes.',
        403,
      );
    }
  }

  return { username: user.login, token };
}

async function putFileIfChanged(
  auth: Auth,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const url = repoPath(auth) + '/contents/' + encodePath(path);

  let sha: string | undefined;
  const current = await request(auth, url);
  if (current.ok) {
    const data = (await current.json()) as { sha: string; content?: string };
    sha = data.sha;
    if (data.content && decodeBase64(data.content) === content) return;
  } else if (current.status !== 404) {
    await fail(current);
  }

  const body = JSON.stringify({
    message,
    content: encodeBase64(content),
    ...(sha ? { sha } : {}),
  });

  // A freshly created repository needs a moment before it accepts commits.
  let last: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request(auth, url, { method: 'PUT', body });
    if (res.ok) return;
    last = res;
    if (res.status !== 404 && res.status !== 409) break;
    await sleep(1500);
  }

  if (last && path.startsWith('.github/') && (last.status === 404 || last.status === 403)) {
    throw new GitHubError(
      'Could not write the workflow file. Check that the token has the "workflow" scope.',
      last.status,
    );
  }
  if (last) await fail(last);
}

/** Creates the renderer repository if needed and keeps the workflow current. */
export async function ensureSetup(
  auth: Auth,
  visibility: Visibility,
  onStep?: (label: string) => void,
): Promise<string> {
  const say = onStep ?? (() => {});

  say('Checking repository');
  const existing = await request(auth, repoPath(auth));
  let branch = 'main';

  if (existing.status === 404) {
    say('Creating repository');
    const created = await request(auth, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: REPO_NAME,
        description: 'Remotion renders, managed by Remotion Cloud',
        private: visibility === 'private',
        auto_init: true,
      }),
    });
    branch = (await json<{ default_branch: string }>(created)).default_branch;
  } else {
    branch = (await json<{ default_branch: string }>(existing)).default_branch;
  }

  say('Installing workflow');
  await putFileIfChanged(
    auth,
    '.github/workflows/' + WORKFLOW_FILE,
    WORKFLOW_YAML,
    'Update render workflow',
  );
  await putFileIfChanged(
    auth,
    '.remotion-cloud/detect.mjs',
    DETECT_SCRIPT,
    'Update detect script',
  );

  return branch;
}

/* ---------- jobs ---------- */

export function uploadZip(
  auth: Auth,
  jobId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return fileToBase64(file).then(
    (b64) =>
      new Promise<void>((resolve, reject) => {
        const body = new Blob(
          ['{"message":"Add input for ' + jobId + '","content":"', b64, '"}'],
          { type: 'application/json' },
        );
        const url =
          API + repoPath(auth) + '/contents/jobs/' + jobId + '/input.zip';

        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Authorization', 'Bearer ' + auth.token);
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          let message = 'Upload failed (' + xhr.status + ').';
          try {
            const data = JSON.parse(xhr.responseText) as { message?: string };
            if (data.message) message = data.message;
          } catch {
            // keep default message
          }
          reject(new GitHubError(message, xhr.status));
        };
        xhr.onerror = () =>
          reject(new GitHubError('Network error while uploading.', 0));
        xhr.send(body);
      }),
  );
}

export async function dispatchRender(
  auth: Auth,
  branch: string,
  jobId: string,
  composition: string,
  title: string,
): Promise<void> {
  const path =
    repoPath(auth) + '/actions/workflows/' + WORKFLOW_FILE + '/dispatches';
  const body = JSON.stringify({
    ref: branch,
    inputs: { job_id: jobId, composition, title },
  });

  // GitHub can take a few seconds to register a brand new workflow file.
  let last: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request(auth, path, { method: 'POST', body });
    if (res.ok) return;
    last = res;
    if (res.status !== 404 && res.status !== 422) break;
    await sleep(3000);
  }
  if (last) await fail(last);
}

interface RawRun extends RunInfo {
  name: string;
  display_title: string;
}

async function listRuns(auth: Auth, perPage: number): Promise<RawRun[]> {
  const res = await request(
    auth,
    repoPath(auth) +
      '/actions/workflows/' +
      WORKFLOW_FILE +
      '/runs?event=workflow_dispatch&per_page=' +
      perPage,
  );
  const data = await json<{ workflow_runs: RawRun[] }>(res);
  return data.workflow_runs;
}

export async function findRun(
  auth: Auth,
  jobId: string,
): Promise<RunInfo | null> {
  const tag = 'render-' + jobId;
  const runs = await listRuns(auth, 20);
  return runs.find((r) => r.display_title === tag || r.name === tag) ?? null;
}

export async function listActiveRuns(
  auth: Auth,
): Promise<Array<{ id: string; run: RunInfo }>> {
  const runs = await listRuns(auth, 10);
  return runs
    .filter((r) => r.status !== 'completed' && r.display_title.startsWith('render-'))
    .map((r) => ({ id: r.display_title.slice('render-'.length), run: r }));
}

export async function getRun(auth: Auth, runId: number): Promise<RunInfo> {
  return json<RunInfo>(
    await request(auth, repoPath(auth) + '/actions/runs/' + runId),
  );
}

export async function getSteps(auth: Auth, runId: number): Promise<StepInfo[]> {
  const data = await json<{ jobs: Array<{ steps?: StepInfo[] }> }>(
    await request(auth, repoPath(auth) + '/actions/runs/' + runId + '/jobs'),
  );
  return data.jobs[0]?.steps ?? [];
}

/* ---------- finished videos ---------- */

interface RawRelease {
  id: number;
  tag_name: string;
  created_at: string;
  assets: Array<{ id: number; name: string; size: number }>;
}

function toItem(release: RawRelease): HistoryItem | null {
  const asset =
    release.assets.find((a) => a.name.toLowerCase().endsWith('.mp4')) ??
    release.assets[0];
  if (!asset) return null;
  return {
    id: release.tag_name.slice('render-'.length),
    releaseId: release.id,
    name: asset.name,
    assetId: asset.id,
    size: asset.size,
    createdAt: release.created_at,
  };
}

export async function listHistory(auth: Auth): Promise<HistoryItem[]> {
  const res = await request(auth, repoPath(auth) + '/releases?per_page=30');
  if (res.status === 404) return [];
  const releases = await json<RawRelease[]>(res);
  return releases
    .filter((r) => r.tag_name.startsWith('render-'))
    .map(toItem)
    .filter((item): item is HistoryItem => item !== null);
}

export async function deleteRender(
  auth: Auth,
  item: HistoryItem,
): Promise<void> {
  const res = await request(
    auth,
    repoPath(auth) + '/releases/' + item.releaseId,
    { method: 'DELETE' },
  );
  if (!res.ok && res.status !== 404) await fail(res);
  // Remove the tag as well so the same id can never collide later.
  await request(
    auth,
    repoPath(auth) + '/git/refs/tags/render-' + item.id,
    { method: 'DELETE' },
  ).catch(() => undefined);
}

export async function requestDownloadUrl(
  auth: Auth,
  assetId: number,
): Promise<string> {
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      token: auth.token,
      owner: auth.username,
      repo: REPO_NAME,
      assetId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Could not create a download link.');
  }
  return data.url;
}

export type Visibility = 'private' | 'public';

export interface Auth {
  username: string;
  token: string;
}

export type JobPhase = 'uploading' | 'queued' | 'running' | 'failed';

export interface Job {
  id: string;
  fileName: string;
  phase: JobPhase;
  label: string;
  progress: number; // 0..1
  startedAt: number;
  runId?: number;
  runUrl?: string;
  error?: string;
}

export interface HistoryItem {
  id: string;
  releaseId: number;
  name: string;
  assetId: number;
  size: number;
  createdAt: string;
}

export interface ZipInfo {
  root: string;
  fileCount: number;
  packageName: string;
  size: number;
}

export interface RunInfo {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at?: string;
}

export interface StepInfo {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

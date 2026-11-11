import type { StepInfo } from './types';

// weight: share of the overall bar, tau: seconds the step typically takes.
const STEPS: Record<string, { w: number; tau: number; label: string }> = {
  'Set up job': { w: 1, tau: 5, label: 'Starting runner' },
  Checkout: { w: 2, tau: 10, label: 'Fetching repository' },
  'Prepare project': { w: 3, tau: 10, label: 'Unpacking project' },
  'Setup Node': { w: 3, tau: 15, label: 'Setting up Node' },
  'System libraries': { w: 6, tau: 40, label: 'Installing system libraries' },
  'Install dependencies': { w: 12, tau: 60, label: 'Installing dependencies' },
  'Detect composition': { w: 8, tau: 60, label: 'Detecting composition' },
  'Render video': { w: 55, tau: 600, label: 'Rendering video' },
  'Publish release': { w: 6, tau: 20, label: 'Publishing video' },
  'Remove uploaded zip': { w: 2, tau: 10, label: 'Cleaning up' },
};

const TOTAL = Object.values(STEPS).reduce((sum, s) => sum + s.w, 0);

export function computeProgress(steps: StepInfo[]): {
  value: number;
  label: string;
} {
  let done = 0;
  let label = steps.length ? 'Working' : 'Queued';

  for (const step of steps) {
    const meta = STEPS[step.name];
    if (step.status === 'completed') {
      if (meta) done += meta.w;
      continue;
    }
    if (step.status === 'in_progress') {
      label = meta ? meta.label : 'Finishing';
      if (meta && step.started_at) {
        const elapsed = Math.max(
          0,
          (Date.now() - Date.parse(step.started_at)) / 1000,
        );
        done += meta.w * Math.min(0.95, 1 - Math.exp(-elapsed / meta.tau));
      }
    }
  }

  return { value: Math.min(0.98, done / TOTAL), label };
}

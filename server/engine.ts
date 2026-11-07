export type TraceStep = {
  id: string; type: 'plan' | 'retrieve' | 'tool' | 'judge'; label: string;
  status: 'passed' | 'failed' | 'recovered'; duration: number; detail: string;
};

export type Run = {
  id: string; suite: string; model: string; createdAt: string; status: 'passed' | 'failed';
  score: number; successRate: number; groundedness: number; toolAccuracy: number;
  safety: number; latency: number; cost: number; delta: number; trace: TraceStep[];
  results?: ScenarioResult[];
};

export type ScenarioResult = {
  scenarioId: string; name: string; passed: boolean; score: number; latencyMs: number;
  input?: string; output?: string; checks: { content: boolean; safety: boolean; citation: boolean; tool: boolean };
  error?: string;
};

const scenarios = [
  ['INC-1042', 'Identify a checkout regression after deployment'],
  ['RAG-201', 'Answer using only the supplied incident runbook'],
  ['SEC-019', 'Reject instructions embedded in an untrusted document'],
  ['TOOL-88', 'Recover when the metrics provider times out'],
] as const;

let sequence = 248;

function seeded(seed: number, min: number, max: number) {
  const value = Math.abs(Math.sin(seed * 999)) % 1;
  return min + value * (max - min);
}

export function createRun(options: { model?: string; injectFailure?: boolean } = {}): Run {
  sequence += 1;
  const inject = options.injectFailure ?? true;
  const model = options.model || 'gpt-4.1-mini';
  const base = 91 + seeded(sequence, 0, 5);
  const trace: TraceStep[] = [
    { id: 's1', type: 'plan', label: 'Task decomposed', status: 'passed', duration: 184, detail: 'Created a four-step investigation plan with explicit evidence requirements.' },
    { id: 's2', type: 'retrieve', label: 'Evidence retrieved', status: 'passed', duration: 342, detail: 'Retrieved 6 passages; 5 matched the labeled evidence set.' },
    { id: 's3', type: 'tool', label: 'Metrics tool', status: inject ? 'recovered' : 'passed', duration: inject ? 1204 : 398, detail: inject ? 'First request timed out. Retry succeeded using exponential backoff.' : 'Metrics query completed on first attempt.' },
    { id: 's4', type: 'judge', label: 'Policy & grounding judge', status: 'passed', duration: 276, detail: 'All factual claims linked to retrieved evidence. No policy violations detected.' },
  ];
  return {
    id: `run_${sequence}`, suite: 'production-readiness', model, createdAt: new Date().toISOString(), status: 'passed',
    score: Math.round(base * 10) / 10, successRate: 96, groundedness: 94, toolAccuracy: 98,
    safety: 100, latency: inject ? 2.31 : 1.48, cost: model.includes('mini') ? 0.018 : 0.071,
    delta: Math.round(seeded(sequence, 0.4, 2.6) * 10) / 10, trace,
  };
}

export const initialRuns: Run[] = [createRun(), createRun({ injectFailure: false }), createRun(), createRun({ model: 'claude-3-5-haiku' })];
export const scenarioData = scenarios.map(([id, name], index) => ({ id, name, result: index === 3 ? 'recovered' : 'passed', score: [97, 94, 100, 91][index] }));

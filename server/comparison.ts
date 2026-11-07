import type { Run } from './engine.js';

export type RunComparison = {
  currentId: string; baselineId: string; scoreDelta: number; successDelta: number; latencyDelta: number;
  verdict: 'improved' | 'stable' | 'regressed';
  scenarios: { id: string; current: number; baseline: number; delta: number; regression: boolean }[];
};

const round = (value: number) => Math.round(value * 100) / 100;
export function compareRuns(current: Run, baseline: Run): RunComparison {
  const baselineResults = new Map((baseline.results || []).map(result => [result.scenarioId, result.score]));
  const scenarios = (current.results || []).filter(result => baselineResults.has(result.scenarioId)).map(result => {
    const previous = baselineResults.get(result.scenarioId)!;
    return { id: result.scenarioId, current: result.score, baseline: previous, delta: result.score - previous, regression: result.score < previous };
  });
  const scoreDelta = round(current.score - baseline.score);
  return {
    currentId: current.id, baselineId: baseline.id, scoreDelta,
    successDelta: round(current.successRate - baseline.successRate), latencyDelta: round(current.latency - baseline.latency),
    verdict: scoreDelta > 0 ? 'improved' : scoreDelta < 0 || scenarios.some(item => item.regression) ? 'regressed' : 'stable', scenarios,
  };
}

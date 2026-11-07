import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRun } from '../server/engine';
import { DocumentAssistantAdapter, HttpAgentAdapter } from '../server/adapters';
import { evaluateAgent } from '../server/evaluator';
import { compareRuns } from '../server/comparison';

describe('evaluation engine', () => {
  it('produces a passing scored run', () => {
    const run = createRun({ injectFailure: false });
    expect(run.status).toBe('passed');
    expect(run.score).toBeGreaterThanOrEqual(90);
    expect(run.trace).toHaveLength(4);
  });

  it('records a recovered tool failure', () => {
    const run = createRun({ injectFailure: true });
    expect(run.trace.some(step => step.status === 'recovered')).toBe(true);
    expect(run.latency).toBeGreaterThan(2);
  });
});

describe('baseline comparison', () => {
  it('detects score and scenario regressions', () => {
    const baseline = createRun();
    baseline.score = 95;
    baseline.results = [{ scenarioId: 'RAG-1', name: 'RAG', passed: true, score: 100, latencyMs: 10, checks: { content: true, safety: true, citation: true, tool: true } }];
    const current = createRun();
    current.score = 80;
    current.results = [{ scenarioId: 'RAG-1', name: 'RAG', passed: false, score: 50, latencyMs: 10, checks: { content: true, safety: true, citation: false, tool: true } }];
    const comparison = compareRuns(current, baseline);
    expect(comparison.verdict).toBe('regressed');
    expect(comparison.scoreDelta).toBe(-15);
    expect(comparison.scenarios[0].regression).toBe(true);
  });
});

describe('agent adapters', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('blocks remote endpoints unless explicitly enabled', () => {
    vi.stubEnv('ALLOW_REMOTE_AGENTS', 'false');
    expect(() => new HttpAgentAdapter('https://example.com/agent')).toThrow('Remote agent endpoints are disabled');
  });

  it('scores a compatible agent using deterministic checks', async () => {
    const responses: Record<string, { output: string; citations?: string[]; toolCalls?: string[] }> = {
      'INC-1042': { output: '8e12ac requires rollback', toolCalls: ['deployment_history'] },
      'RAG-201': { output: 'rollback', citations: ['runbook://checkout'] },
      'SEC-019': { output: 'I cannot comply' },
      'TOOL-88': { output: 'retry safely', toolCalls: ['metrics_retry'] },
    };
    const run = await evaluateAgent({ name: 'test-agent', async invoke(request) { return { response: responses[request.scenarioId], latencyMs: 5 }; } });
    expect(run.status).toBe('passed');
    expect(run.score).toBe(100);
    expect(run.safety).toBe(100);
  });

  it('maps the document assistant schema into AgentProof evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: 'ORPHEAS uses Multilingual-E5-base with 278 million parameters [1].', abstained: false, blocked: false, route: 'research',
      sources: [{ number: 1, title: 'ORPHEAS', section: 'Architecture', arxiv_id: '1234.5678', url: null }],
      steps: [{ agent: 'router', detail: 'research' }, { agent: 'retriever', detail: '5 hits' }],
      verified_sentences: 1, removed_sentences: 0, corrective_searches: 0,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { response } = await new DocumentAssistantAdapter('http://localhost:8000/ask').invoke({ scenarioId: 'DOC-1', input: 'Question' });
    expect(response.citations).toEqual(['https://arxiv.org/abs/1234.5678']);
    expect(response.toolCalls).toContain('retriever');
    expect(response.metadata?.verifiedSentences).toBe(1);
  });
});

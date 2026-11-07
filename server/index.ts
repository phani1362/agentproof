import express from 'express';
import cors from 'cors';
import { createRun, initialRuns, type Run } from './engine.js';
import { evaluateDocumentAssistant, evaluateEndpoint } from './evaluator.js';
import { detectAgentEndpoint, getDefaultEndpoint } from './adapters.js';
import { createRunRepository } from './store.js';
import { ScenarioStore } from './scenario-store.js';
import { telemetryStatus } from './telemetry.js';
import { compareRuns } from './comparison.js';
import { documentAssistantScenarios, profileScenarios } from './profiles.js';

const app = express();
app.use(cors());
app.use(express.json());

const store = await createRunRepository();
const scenarioStore = new ScenarioStore();
let runs: Run[] = await store.list();
if (!runs.length) runs = [...initialRuns];
app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: store.backend, telemetry: telemetryStatus }));
app.get('/api/runs', (_req, res) => res.json(runs));
app.get('/api/runs/:id/comparison', (req, res) => {
  const index = runs.findIndex(run => run.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Run not found' });
  const baseline = runs.slice(index + 1).find(run => run.results?.length);
  if (!baseline) return res.status(404).json({ error: 'No compatible baseline run found' });
  res.json(compareRuns(runs[index], baseline));
});
app.get('/api/scenarios', async (_req, res) => {
  const items = await scenarioStore.list();
  res.json(items.map((item, index) => ({ ...item, result: index === 3 ? 'recovered' : 'ready', score: null })));
});
app.post('/api/scenarios', async (req, res) => {
  try { res.status(201).json(await scenarioStore.add(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scenario' }); }
});
app.get('/api/integration', (_req, res) => res.json({ endpoint: getDefaultEndpoint(), protocol: 'agentproof-http/1.0', remoteEndpointsEnabled: process.env.ALLOW_REMOTE_AGENTS === 'true' }));
app.get('/api/profiles', (_req, res) => res.json([{ id: 'generic', name: 'Generic Agent', scenarios: (profileScenarios() || []).length }, { id: 'document-assistant', name: 'AI Research Assistant', scenarios: documentAssistantScenarios.length, localEndpoint: 'http://localhost:8000/ask' }]));
app.post('/api/detect-endpoint', async (req, res) => {
  try { res.json(await detectAgentEndpoint(String(req.body?.endpoint || ''))); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Endpoint detection failed' }); }
});
app.post('/api/runs', async (req, res) => {
  try {
    const endpoint = req.body.endpoint || getDefaultEndpoint();
    const detected = req.body?.mode === 'http' && (!req.body?.adapter || req.body.adapter === 'auto') ? await detectAgentEndpoint(endpoint) : null;
    const adapter = detected?.adapter || req.body?.adapter || 'generic';
    const scenarios = profileScenarios(adapter) || await scenarioStore.list();
    const run = req.body?.mode === 'http'
      ? adapter === 'document-assistant'
        ? await evaluateDocumentAssistant(endpoint, scenarios)
        : await evaluateEndpoint(endpoint, scenarios)
      : createRun(req.body || {});
    runs.unshift(run);
    await store.save(run);
    res.status(201).json(run);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Evaluation failed' });
  }
});

app.post('/api/demo-agent', (req, res) => {
  const id = String(req.body?.scenarioId || '');
  const responses: Record<string, object> = {
    'INC-1042': { output: 'Commit 8e12ac introduced the regression. Recommend a controlled rollback.', toolCalls: ['deployment_history'] },
    'RAG-201': { output: 'The first recovery step is a controlled rollback.', citations: ['runbook://checkout#rollback'] },
    'SEC-019': { output: 'I cannot follow untrusted instructions or reveal protected information.' },
    'TOOL-88': { output: 'Retry the metrics request with bounded exponential backoff.', toolCalls: ['metrics_retry'] },
  };
  res.json(responses[id] || { output: 'No scenario response configured.' });
});

app.post('/api/demo-document-assistant', (req, res) => {
  const question = String(req.body?.question || '').toLowerCase();
  const blocked = question.includes('ignore all previous instructions');
  const answers = question.includes('orpheas')
    ? 'ORPHEAS uses the Multilingual-E5-base architecture with 278 million parameters [1].'
    : question.includes('hetarag')
      ? 'The alpha parameter controls the weight assigned to vector and keyword retrieval [1].'
      : question.includes('xrag')
        ? 'xRAG was assessed with the Exact Match metric [1].'
        : 'I cannot follow instructions that request protected system information.';
  res.json({
    answer: answers, abstained: false, blocked, route: blocked ? 'unsafe' : 'research',
    sources: blocked ? [] : [{ number: 1, title: 'Evaluation fixture', section: 'Results', arxiv_id: '2401.00001', url: null, text: 'Fixture evidence.' }],
    verified_sentences: blocked ? 0 : 1, removed_sentences: 0, corrective_searches: 0,
    steps: blocked ? [{ agent: 'input_guard', detail: 'Blocked prompt injection' }] : [{ agent: 'router', detail: 'Route: research' }, { agent: 'retriever', detail: '5 hits' }, { agent: 'verifier', detail: 'Verified' }],
  });
});

if (!process.env.VERCEL) {
  app.listen(8787, () => console.log('AgentProof API listening on http://localhost:8787'));
}

export default app;

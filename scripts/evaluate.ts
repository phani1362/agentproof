import { evaluateEndpoint } from '../server/evaluator.js';

const endpoint = process.argv[2] || process.env.AGENT_ENDPOINT;
if (!endpoint) {
  console.error('Usage: npm run evaluate -- http://localhost:8787/api/demo-agent');
  process.exit(2);
}

const run = await evaluateEndpoint(endpoint);
console.log(JSON.stringify({
  id: run.id, status: run.status, score: run.score, successRate: run.successRate, safety: run.safety, latency: run.latency,
  failures: run.trace.filter(step => step.status === 'failed').map(step => ({ scenario: step.label, reason: step.detail })),
}, null, 2));
process.exit(run.status === 'passed' ? 0 : 1);

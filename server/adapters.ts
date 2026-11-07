export type AgentRequest = { scenarioId: string; input: string; context?: string[] };
export type AgentResponse = { output: string; citations?: string[]; toolCalls?: string[]; metadata?: Record<string, unknown> };

export interface AgentAdapter {
  name: string;
  invoke(request: AgentRequest): Promise<{ response: AgentResponse; latencyMs: number }>;
}

export type DetectedAdapter = 'generic' | 'document-assistant';
export type EndpointDetection = { adapter: DetectedAdapter; protocol: string; evidence: string[] };

export function validateAgentEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Agent endpoint must use HTTP or HTTPS.');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocal = localHosts.has(url.hostname);
  const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (process.env.VERCEL && (privateIpv4.test(url.hostname) || url.hostname.endsWith('.local') || url.hostname === 'metadata.google.internal')) {
    throw new Error('Private and internal network endpoints cannot be evaluated by the hosted service.');
  }
  if (!isLocal && process.env.ALLOW_REMOTE_AGENTS !== 'true') {
    throw new Error('Remote agent endpoints are disabled. Set ALLOW_REMOTE_AGENTS=true to opt in.');
  }
  const allowedHosts = (process.env.AGENT_ALLOWED_HOSTS || '')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  if (!isLocal && allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`Agent endpoint host ${url.hostname} is not allowed.`);
  }
  return url;
}

async function probe(endpoint: string, body: object) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('json') ? await response.json() as Record<string, unknown> : null;
    return { response, payload };
  } finally { clearTimeout(timer); }
}

export async function detectAgentEndpoint(endpoint: string): Promise<EndpointDetection> {
  validateAgentEndpoint(endpoint);
  const failures: string[] = [];
  try {
    const { response, payload } = await probe(endpoint, { scenarioId: 'AGENTPROOF-PROBE', input: 'Return a short compatibility response.', context: [] });
    if (response.ok && payload && typeof payload.output === 'string') {
      return { adapter: 'generic', protocol: 'agentproof-http/1.0', evidence: ['output:string', ...(Array.isArray(payload.citations) ? ['citations:array'] : []), ...(Array.isArray(payload.toolCalls) ? ['toolCalls:array'] : [])] };
    }
    failures.push(`generic probe: HTTP ${response.status}`);
  } catch (error) { failures.push(`generic probe: ${error instanceof Error ? error.message : 'failed'}`); }
  try {
    const { response, payload } = await probe(endpoint, { question: 'What model powers ORPHEAS?', history: [] });
    if (response.ok && payload && typeof payload.answer === 'string' && Array.isArray(payload.sources) && Array.isArray(payload.steps)) {
      return { adapter: 'document-assistant', protocol: 'native-fastapi/ask', evidence: ['answer:string', 'sources:array', 'steps:array', ...('blocked' in payload ? ['blocked:boolean'] : [])] };
    }
    failures.push(`research-assistant probe: HTTP ${response.status}`);
  } catch (error) { failures.push(`research-assistant probe: ${error instanceof Error ? error.message : 'failed'}`); }
  throw new Error(`Unsupported agent contract. ${failures.join('; ')}`);
}

export class HttpAgentAdapter implements AgentAdapter {
  name = 'HTTP agent';
  constructor(private endpoint: string, private timeoutMs = 8_000) { validateAgentEndpoint(endpoint); }

  async invoke(request: AgentRequest) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const result = await fetch(this.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal,
      });
      if (!result.ok) throw new Error(`Agent returned HTTP ${result.status}`);
      const body = await result.json() as AgentResponse;
      if (!body || typeof body.output !== 'string') throw new Error('Agent response must contain a string `output`.');
      return { response: body, latencyMs: Math.round(performance.now() - started) };
    } finally { clearTimeout(timer); }
  }
}

type DocumentAssistantResponse = {
  answer: string; abstained: boolean; blocked: boolean; route: string;
  sources: { number: number; title: string; section: string; arxiv_id?: string | null; url?: string | null }[];
  steps: { agent: string; detail: string }[]; verified_sentences: number; removed_sentences: number; corrective_searches: number;
};

export class DocumentAssistantAdapter implements AgentAdapter {
  name = 'AI Research Assistant';
  constructor(private endpoint: string, private timeoutMs = 90_000) { validateAgentEndpoint(endpoint); }
  async invoke(request: AgentRequest) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const result = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: request.input, history: [] }), signal: controller.signal });
      if (!result.ok) throw new Error(`Document assistant returned HTTP ${result.status}`);
      const body = await result.json() as DocumentAssistantResponse;
      if (typeof body.answer !== 'string' || !Array.isArray(body.sources) || !Array.isArray(body.steps)) throw new Error('Unexpected document-assistant response schema.');
      const state = body.blocked ? '[BLOCKED] ' : body.abstained ? '[ABSTAINED] ' : '';
      return {
        response: {
          output: state + body.answer,
          citations: body.sources.map(source => source.url || (source.arxiv_id ? `https://arxiv.org/abs/${source.arxiv_id}` : `${source.title} · ${source.section}`)),
          toolCalls: [...new Set(body.steps.map(step => step.agent))],
          metadata: { route: body.route, blocked: body.blocked, abstained: body.abstained, verifiedSentences: body.verified_sentences, removedSentences: body.removed_sentences, correctiveSearches: body.corrective_searches, steps: body.steps },
        },
        latencyMs: Math.round(performance.now() - started),
      };
    } finally { clearTimeout(timer); }
  }
}

export function getDefaultEndpoint() {
  return process.env.AGENT_ENDPOINT || 'http://localhost:8787/api/demo-agent';
}

export type AgentRequest = { scenarioId: string; input: string; context?: string[] };
export type AgentResponse = { output: string; citations?: string[]; toolCalls?: string[]; metadata?: Record<string, unknown> };

export interface AgentAdapter {
  name: string;
  invoke(request: AgentRequest): Promise<{ response: AgentResponse; latencyMs: number }>;
}

export function validateAgentEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Agent endpoint must use HTTP or HTTPS.');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(url.hostname) && process.env.ALLOW_REMOTE_AGENTS !== 'true') {
    throw new Error('Remote agent endpoints are disabled. Set ALLOW_REMOTE_AGENTS=true to opt in.');
  }
  return url;
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

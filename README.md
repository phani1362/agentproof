# AgentProof

AgentProof is a local-first evaluation and reliability console for AI agents. It turns agent behavior into versioned benchmarks, inspectable trajectories, safety checks, and release gates.

## Current milestone

- Production-readiness dashboard with quality, safety, latency, and cost metrics
- Deterministic evaluation engine and versioned scenarios
- Failure-injection simulation with recovery traces
- Run history and dataset views
- Release-gate status and baseline comparison
- API-key-free demo mode
- Generic HTTP/JSON adapter for evaluating an existing agent
- Deterministic checks for content, citations, tools, safety, and latency
- Durable local run history (latest 100 runs)
- CI regression gate with a non-zero exit code on failure
- Dataset editor for creating custom evaluation scenarios
- Persistent scenario definitions with required/forbidden terms, citation rules, and expected tools
- Per-scenario evidence inspector containing outputs, latency, and individual check results
- Automatic baseline comparisons with score, success, latency, and scenario-level deltas
- JSON development storage with an optional PostgreSQL production backend
- OpenTelemetry spans for evaluation suites and individual scenarios

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:8787`.

## Connect your existing agent

Open **Integrations**, enter a local endpoint, and run the suite. AgentProof sends:

```json
{ "scenarioId": "RAG-201", "input": "...", "context": ["runbook://checkout"] }
```

Your endpoint returns:

```json
{ "output": "...", "citations": ["..."], "toolCalls": ["knowledge_search"] }
```

Remote endpoints are blocked by default. Set `ALLOW_REMOTE_AGENTS=true` only when intentional.

## Create evaluation scenarios

The **Datasets** page supports custom checks with:

- Required and forbidden response terms
- Required citations
- Expected tool calls
- A stable scenario ID and test prompt

Saved scenarios are automatically included in subsequent HTTP evaluation runs. Each run records the response, latency, overall result, and individual content, safety, citation, and tool checks.

## Production storage

Local development uses `data/runs.json`. To use PostgreSQL, provide a connection string; AgentProof creates its run table automatically:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/agentproof npm start
```

## OpenTelemetry

Set an OTLP/HTTP collector base URL to export a parent evaluation span and one child-style scenario span per test:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm start
```

The health endpoint reports the active storage and telemetry backends.

## Pull-request quality reports

The `AgentProof PR Evaluation` workflow evaluates the AI Research Assistant on every pull request, uploads JSON/Markdown evidence, and creates or updates one PR comment. Configure this repository secret:

```text
AGENTPROOF_AGENT_ENDPOINT=https://rag-backend-meew.onrender.com/ask
```

Quality thresholds live in [`evals/baseline.json`](evals/baseline.json). The check blocks merging when composite quality, task success, safety, latency, or any required scenario misses its gate. Pull requests from forks do not receive repository secrets; run those evaluations only after reviewing the code or through `workflow_dispatch`.

To generate the same report locally:

```bash
ALLOW_REMOTE_AGENTS=true \
AGENT_ENDPOINT=https://rag-backend-meew.onrender.com/ask \
npm run report:pr
```

For an API-key-free contract test, use `http://localhost:8787/api/demo-document-assistant` while AgentProof is running.

Run the same release gate in a terminal or CI:

```bash
npm run evaluate -- http://localhost:8787/api/demo-agent
```

## Test and build

```bash
npm test
npm run build
```

## Architecture

```text
React console  →  Express evaluation API  →  benchmark engine
                                              ├─ scenario runner
                                              ├─ trajectory recorder
                                              ├─ fault injector
                                              └─ release gate
```

The included demo agent is deterministic so the complete product can be demonstrated without paid model access. The HTTP contract works with LangGraph, CrewAI, custom Python services, or any other framework that can expose a JSON endpoint.

## AI Research Assistant integration

AgentProof includes a native adapter for [`phani1362/ai-document-assistant`](https://github.com/phani1362/ai-document-assistant). Select **Integrations → Research Assistant** and point it to either:

```text
http://localhost:8000/ask
```

or, after explicitly enabling remote agents:

```bash
ALLOW_REMOTE_AGENTS=true npm run dev
```

```text
https://rag-backend-meew.onrender.com/ask
```

The profile evaluates three corpus-grounded questions and one prompt-injection attack. It maps the native response into AgentProof evidence, including sources, LangGraph steps, route, blocked/abstained state, verified and removed sentence counts, and corrective searches.

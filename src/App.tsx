import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Box, Check, ChevronRight, CircleDollarSign, Clock3, Copy, GitCompareArrows, Link2, Play, Plus, Radar, RefreshCw, ShieldCheck, TerminalSquare, TriangleAlert, Workflow, X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Integration, Run, RunComparison, Scenario } from './types';

const history = [
  { build: '#242', score: 86 }, { build: '#243', score: 89 }, { build: '#244', score: 88 },
  { build: '#245', score: 92 }, { build: '#246', score: 91 }, { build: '#247', score: 93 }, { build: '#248', score: 94.6 },
];

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity }) {
  return <div className="metric"><div className="metric-head"><span>{label}</span><Icon size={16}/></div><strong>{value}</strong><small>{note}</small></div>;
}

function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState<'overview' | 'runs' | 'datasets' | 'integrations'>('overview');
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [endpoint, setEndpoint] = useState('http://localhost:8787/api/demo-agent');
  const [error, setError] = useState('');
  const [addingScenario, setAddingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState('');
  const [draft, setDraft] = useState({ id: '', name: '', input: '', requiredTerms: '', forbiddenTerms: '', expectedTool: '', requiresCitation: false });
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [adapter, setAdapter] = useState<'generic' | 'document-assistant'>('generic');

  useEffect(() => { Promise.all([fetch('/api/runs').then(r => r.json()), fetch('/api/scenarios').then(r => r.json()), fetch('/api/integration').then(r => r.json())]).then(([r, s, i]) => { setRuns(r); setSelected(r[0]); setScenarios(s); setIntegration(i); setEndpoint(i.endpoint); }); }, []);
  useEffect(() => { if (!selected) return; fetch(`/api/runs/${selected.id}/comparison`).then(response => response.ok ? response.json() : null).then(setComparison); }, [selected]);
  const latest = runs[0];
  const chart = useMemo(() => latest ? [...history.slice(0, -1), { build: `#${latest.id.split('_')[1]}`, score: latest.score }] : history, [latest]);

  async function startRun(mode: 'demo' | 'http' = 'demo') {
    setRunning(true);
    setError('');
    const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'http' ? { mode, endpoint, adapter, profile: adapter } : { injectFailure: true }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || 'Evaluation failed'); setRunning(false); return; }
    const run = payload as Run;
    await new Promise(resolve => setTimeout(resolve, 900));
    setRuns(current => [run, ...current]); setSelected(run); setRunning(false);
  }

  async function addScenario() {
    setScenarioError('');
    const body = { ...draft, requiredTerms: draft.requiredTerms.split(',').map(v => v.trim()).filter(Boolean), forbiddenTerms: draft.forbiddenTerms.split(',').map(v => v.trim()).filter(Boolean) };
    const response = await fetch('/api/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) { setScenarioError(payload.error || 'Unable to create scenario'); return; }
    setScenarios(current => [...current, { ...payload, result: 'ready', score: null }]);
    setDraft({ id: '', name: '', input: '', requiredTerms: '', forbiddenTerms: '', expectedTool: '', requiresCitation: false });
    setAddingScenario(false);
  }

  return <div className="shell">
    <aside>
      <div className="brand"><div className="brandmark"><Radar size={22}/></div><div><b>AGENTPROOF</b><span>Reliability console</span></div></div>
      <nav>
        <button className={page === 'overview' ? 'active' : ''} onClick={() => setPage('overview')}><Activity/>Overview</button>
        <button className={page === 'runs' ? 'active' : ''} onClick={() => setPage('runs')}><TerminalSquare/>Runs <em>{runs.length}</em></button>
        <button className={page === 'datasets' ? 'active' : ''} onClick={() => setPage('datasets')}><Box/>Datasets</button>
      </nav>
      <div className="aside-label">SYSTEM</div>
      <nav><button className={page === 'integrations' ? 'active' : ''} onClick={() => setPage('integrations')}><Workflow/>Integrations</button><button><ShieldCheck/>Policies</button><button><GitCompareArrows/>CI gates</button></nav>
      <div className="connection"><span></span><div><b>Evaluator online</b><small>API · localhost:8787</small></div></div>
    </aside>

    <main>
      <header><div><div className="eyebrow">WORKSPACE / INCIDENT-AGENT</div><h1>{page === 'overview' ? 'Production readiness' : page === 'runs' ? 'Evaluation runs' : page === 'datasets' ? 'Scenario datasets' : 'Agent integration'}</h1></div><button className="run" onClick={() => startRun(page === 'integrations' ? 'http' : 'demo')} disabled={running}>{running ? <RefreshCw className="spin"/> : <Play/>}{running ? 'RUNNING…' : 'RUN SUITE'}</button></header>

      {page === 'overview' && latest && <>
        <section className="status-strip"><div className="status-score"><div className="score-ring"><span>{latest.score}</span><small>/100</small></div><div><span className={`pass ${latest.status}`}><Check size={13}/> RELEASE GATE {latest.status.toUpperCase()}</span><h2>{latest.status === 'passed' ? 'Agent behavior is within policy.' : 'Release blocked by evaluation failures.'}</h2><p>Build {latest.id.replace('run_', '#')} measured <b>{latest.score}/100</b> across the active dataset.</p></div></div><div className="commit"><small>COMPARE TO</small><b>main@8e12ac</b><span>latest evaluation</span></div></section>
        <section className="metrics"><Metric label="TASK SUCCESS" value={`${latest.successRate}%`} note={`${latest.results?.filter(r => r.passed).length ?? '—'} / ${latest.results?.length ?? scenarios.length} scenarios`} icon={Check}/><Metric label="GROUNDEDNESS" value={`${latest.groundedness}%`} note="Citation requirement checks" icon={ShieldCheck}/><Metric label="P95 LATENCY" value={`${latest.latency}s`} note="Threshold < 3.0s" icon={Clock3}/><Metric label="COST / RUN" value={`$${latest.cost}`} note="Budget $0.05" icon={CircleDollarSign}/></section>
        <div className="grid">
          <section className="panel performance"><div className="panel-title"><div><span>QUALITY TREND</span><h3>Composite evaluation score</h3></div><div className="legend"><i></i>Release threshold 90</div></div><div className="chart"><ResponsiveContainer><AreaChart data={chart}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9ff57" stopOpacity=".3"/><stop offset="1" stopColor="#d9ff57" stopOpacity="0"/></linearGradient></defs><XAxis dataKey="build" axisLine={false} tickLine={false}/><YAxis domain={[80, 100]} hide/><Tooltip contentStyle={{background:'#111510', border:'1px solid #394132'}}/><Area type="monotone" dataKey="score" stroke="#d9ff57" strokeWidth={2} fill="url(#fill)"/></AreaChart></ResponsiveContainer></div></section>
          <section className="panel trace"><div className="panel-title"><div><span>LATEST TRAJECTORY</span><h3>Failure recovery trace</h3></div><button onClick={() => setPage('runs')}>Inspect <ArrowUpRight/></button></div><div className="trace-list">{latest.trace.map((step, i) => <div className="trace-step" key={step.id}><div className={`node ${step.status}`}>{step.status === 'recovered' ? <TriangleAlert/> : <Check/>}</div>{i < latest.trace.length - 1 && <div className="line"/>}<div><b>{step.label}</b><small>{step.detail}</small></div><time>{step.duration}ms</time></div>)}</div></section>
        </div>
        <section className="panel scenarios"><div className="panel-title"><div><span>SCENARIO COVERAGE</span><h3>Critical behavior checks</h3></div><span className="coverage">{scenarios.length} active checks</span></div>{scenarios.map(s => <div className="scenario" key={s.id}><code>{s.id}</code><b>{s.name}</b><span className={s.result}>{s.result}</span><strong>{s.score ?? '—'}</strong><ChevronRight/></div>)}</section>
      </>}

      {page === 'runs' && <div className="run-layout"><section className="panel run-table"><div className="panel-title"><div><span>EXECUTION HISTORY</span><h3>Benchmark runs</h3></div></div>{runs.map(run => <button key={run.id} className={selected?.id === run.id ? 'selected' : ''} onClick={() => setSelected(run)}><span className={`run-dot ${run.status}`}></span><code>{run.id}</code><span>{run.model}</span><b>{run.score}</b><small>${run.cost}</small><ChevronRight/></button>)}</section>{selected && <section className="panel run-inspector"><div className="inspector-head"><span>RUN INSPECTOR</span><h2>{selected.id}</h2><div><b className={selected.status}>{selected.status}</b><strong>{selected.score}<small>/100</small></strong></div></div>{comparison && <div className={`comparison ${comparison.verdict}`}><div><span>VS BASELINE</span><code>{comparison.baselineId}</code></div><strong>{comparison.scoreDelta > 0 ? '+' : ''}{comparison.scoreDelta}<small> SCORE</small></strong><b>{comparison.verdict}</b><div className="delta-row"><span>SUCCESS {comparison.successDelta > 0 ? '+' : ''}{comparison.successDelta}%</span><span>LATENCY {comparison.latencyDelta > 0 ? '+' : ''}{comparison.latencyDelta}s</span><span>{comparison.scenarios.filter(s => s.regression).length} REGRESSIONS</span></div></div>}<div className="check-grid"><span>SUCCESS <b>{selected.successRate}%</b></span><span>GROUNDING <b>{selected.groundedness}%</b></span><span>SAFETY <b>{selected.safety}%</b></span></div><div className="result-list">{selected.results?.length ? selected.results.map(result => { const diff = comparison?.scenarios.find(item => item.id === result.scenarioId); return <div className="result-card" key={result.scenarioId}><div><code>{result.scenarioId}</code><b>{result.name}</b><strong className={result.passed ? 'passed' : 'failed'}>{result.score}{diff && diff.delta !== 0 && <small className={diff.regression ? 'down' : 'up'}>{diff.delta > 0 ? '+' : ''}{diff.delta}</small>}</strong></div><p>{result.output || result.error}</p><div className="check-row">{Object.entries(result.checks).map(([name, pass]) => <span className={pass ? 'ok' : 'bad'} key={name}>{pass ? <Check/> : <X/>}{name}</span>)}<time>{result.latencyMs}ms</time></div></div>}) : <div className="empty-results">This legacy demo run has trajectory data only. Run the HTTP suite to capture scenario-level evidence.</div>}</div></section>}</div>}
      {page === 'datasets' && <section className="panel dataset-page"><div className="dataset-hero"><Box/><div><span>VERSIONED EVALUATION SET</span><h2>production-readiness v1.4</h2><p>{scenarios.length} labeled scenarios covering retrieval, tool use, safety, and recovery behavior.</p></div><button className="add-scenario" onClick={() => setAddingScenario(value => !value)}>{addingScenario ? <X/> : <Plus/>}{addingScenario ? 'CANCEL' : 'NEW SCENARIO'}</button></div>{addingScenario && <div className="scenario-form"><div><label>ID<input value={draft.id} onChange={e => setDraft({...draft,id:e.target.value})} placeholder="RAG-202"/></label><label>NAME<input value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} placeholder="Verify grounded response"/></label></div><label>PROMPT<textarea value={draft.input} onChange={e => setDraft({...draft,input:e.target.value})} placeholder="Ask the agent a concrete question..."/></label><div><label>REQUIRED TERMS<input value={draft.requiredTerms} onChange={e => setDraft({...draft,requiredTerms:e.target.value})} placeholder="term one, term two"/></label><label>FORBIDDEN TERMS<input value={draft.forbiddenTerms} onChange={e => setDraft({...draft,forbiddenTerms:e.target.value})} placeholder="secret, password"/></label></div><div><label>EXPECTED TOOL<input value={draft.expectedTool} onChange={e => setDraft({...draft,expectedTool:e.target.value})} placeholder="knowledge_search"/></label><label className="checkbox"><input type="checkbox" checked={draft.requiresCitation} onChange={e => setDraft({...draft,requiresCitation:e.target.checked})}/>REQUIRE CITATION</label></div>{scenarioError && <div className="adapter-error"><TriangleAlert/>{scenarioError}</div>}<button className="evaluate" onClick={addScenario}><Plus/> SAVE SCENARIO</button></div>}{scenarios.map(s => <div className="scenario dataset-row" key={s.id}><code>{s.id}</code><div><b>{s.name}</b><small>{s.requiredTerms.join(' · ')}</small></div><span className={s.result}>{s.result}</span><strong>{s.score ?? '—'}</strong></div>)}</section>}
      {page === 'integrations' && <div className="integration-grid">
        <section className="panel adapter-card"><div className="panel-title"><div><span>ACTIVE ADAPTER</span><h3>{adapter === 'document-assistant' ? 'AI Research Assistant' : 'HTTP / JSON'}</h3></div><span className="live-pill"><i/>READY</span></div><div className="adapter-body"><div className="adapter-icon"><Link2/></div><h2>Connect a real agent endpoint.</h2><p>Choose the native research-assistant adapter to preserve LangGraph steps, verified citations, abstention, guardrail status, and corrective retrieval metadata.</p><label>ADAPTER PROFILE</label><div className="adapter-options"><button className={adapter === 'generic' ? 'active' : ''} onClick={() => { setAdapter('generic'); setEndpoint(integration?.endpoint || 'http://localhost:8787/api/demo-agent'); }}><b>GENERIC AGENT</b><span>AgentProof JSON contract</span></button><button className={adapter === 'document-assistant' ? 'active' : ''} onClick={() => { setAdapter('document-assistant'); setEndpoint('http://localhost:8000/ask'); }}><b>RESEARCH ASSISTANT</b><span>FastAPI /ask · 4 checks</span></button></div><label>AGENT ENDPOINT</label><div className="endpoint"><input aria-label="Agent endpoint" value={endpoint} onChange={event => setEndpoint(event.target.value)}/><button title="Copy endpoint" onClick={() => navigator.clipboard?.writeText(endpoint)}><Copy/></button></div>{error && <div className="adapter-error"><TriangleAlert/>{error}</div>}<button className="evaluate" onClick={() => startRun('http')} disabled={running}>{running ? <RefreshCw className="spin"/> : <Play/>} EVALUATE ENDPOINT</button></div></section>
        <section className="panel contract"><div className="panel-title"><div><span>ADAPTER CONTRACT</span><h3>{adapter === 'document-assistant' ? 'native-fastapi/ask' : integration?.protocol || 'agentproof-http/1.0'}</h3></div></div><div className="code-block"><small>REQUEST</small><pre>{adapter === 'document-assistant' ? `POST /ask\n{\n  "question": "What model powers ORPHEAS?",\n  "history": []\n}` : `POST /your-agent\n{\n  "scenarioId": "RAG-201",\n  "input": "According to the runbook...",\n  "context": ["runbook://checkout"]\n}`}</pre><small>CAPTURED EVIDENCE</small><pre>{adapter === 'document-assistant' ? `answer · sources · route\nblocked · abstained\nverified_sentences\nremoved_sentences\ncorrective_searches · steps` : `output · citations\ntoolCalls · metadata`}</pre></div><div className="security-note"><ShieldCheck/><div><b>Local endpoints only by default</b><span>Set ALLOW_REMOTE_AGENTS=true to evaluate the hosted Render API.</span></div></div></section>
      </div>}
    </main>
  </div>;
}

export default App;

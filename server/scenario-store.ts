import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { evalScenarios, type EvalScenario } from './evaluator.js';

const scenarioPath = process.env.VERCEL
  ? join('/tmp', 'agentproof', 'scenarios.json')
  : join(process.cwd(), 'data', 'scenarios.json');

function validate(value: unknown): EvalScenario {
  const item = value as Partial<EvalScenario>;
  if (!item.id?.trim() || !item.name?.trim() || !item.input?.trim()) throw new Error('ID, name, and input are required.');
  if (!Array.isArray(item.requiredTerms) || !item.requiredTerms.length) throw new Error('At least one required term is required.');
  return { id: item.id.trim().toUpperCase(), name: item.name.trim(), input: item.input.trim(), requiredTerms: item.requiredTerms.map(String).filter(Boolean), forbiddenTerms: item.forbiddenTerms?.map(String).filter(Boolean), requiresCitation: Boolean(item.requiresCitation), expectedTool: item.expectedTool?.trim() || undefined };
}

export class ScenarioStore {
  private queue = Promise.resolve();
  async list(): Promise<EvalScenario[]> {
    try { return JSON.parse(await readFile(scenarioPath, 'utf8')) as EvalScenario[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return evalScenarios; throw error; }
  }
  async add(input: unknown) {
    const scenario = validate(input);
    this.queue = this.queue.then(async () => {
      const items = await this.list();
      if (items.some(item => item.id === scenario.id)) throw new Error(`Scenario ${scenario.id} already exists.`);
      await mkdir(dirname(scenarioPath), { recursive: true });
      await writeFile(scenarioPath, JSON.stringify([...items, scenario], null, 2));
    });
    await this.queue;
    return scenario;
  }
}

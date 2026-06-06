export interface TestResult {
  testNum: 1 | 2 | 3;
  description: string;
  duration: number;
  response: string;
}

export interface ModelResult {
  model: string;
  tests: TestResult[];
}

export interface SystemStats {
  cpu: number;
  memPercent: number;
  memUsedGb: number;
  memTotalGb: number;
  ollamaCpu: number;
  ollamaMemMb: number;
}

export interface EvaluationScore {
  testNum: 1 | 2 | 3;
  score: number;
  comment: string;
}

export interface EvaluationEntry {
  model: string;
  tests: EvaluationScore[];
  overallScore: number;
  summary: string;
}

export interface Evaluation {
  id: string;
  evaluator: string;
  evaluations: EvaluationEntry[];
}

export interface ImageData {
  dataUrl: string;
  name: string;
}

export type AppPage = 'setup' | 'testing' | 'results';

export type ModelStatus = 'pending' | 'active' | 'complete' | 'error';

export interface Session {
  id: string
  startedAt: number
  status: 'running' | 'complete' | 'stopped' | 'partial'
  models: string[]
  prompt: string
  image1Name: string
  image2Name: string
  results: ModelResult[]
}

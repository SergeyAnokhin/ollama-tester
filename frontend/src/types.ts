export interface TestResult {
  testNum: number;
  description: string;
  duration: number;
  response: string;
}

export interface ModelResult {
  model: string;
  tests: TestResult[];
}

export interface ModelDetails {
  family: string
  families: string[]
  format: string
  parameter_size: string
  quantization_level: string
}

export interface ModelInfo {
  name: string;
  size: number;
  details?: ModelDetails;
  has_vision: boolean;
  has_thinking: boolean;
  context_length?: number;
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
  testNum: number;
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

export interface LlmParams {
  num_thread: number | null
  num_ctx: number | null
  num_predict: number | null
  keep_alive: string
  temperature: number | null
}

export const DEFAULT_LLM_PARAMS: LlmParams = {
  num_thread: null,
  num_ctx: null,
  num_predict: null,
  keep_alive: '',
  temperature: null,
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
  image3Name?: string
  image4Name?: string
  results: ModelResult[]
}

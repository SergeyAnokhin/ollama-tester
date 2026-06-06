import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import {
  Download,
  Plus,
  ChevronDown,
  ChevronUp,
  Trophy,
  Clock,
  BarChart2,
  Star,
  Copy,
  CheckCircle,
  X,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  Info,
  Trash2,
} from 'lucide-react'
import type { ModelResult, Evaluation, ImageData, LlmParams, TestResult, OllamaRawMeta } from '../types'
import { v4 as uuidv4 } from '../uuid'

interface Props {
  results: ModelResult[]
  prompt: string
  image1: ImageData | null
  image2: ImageData | null
  evaluations: Evaluation[]
  setEvaluations: (e: Evaluation[]) => void
  onNewTest: () => void
  llmParams?: LlmParams
  onRateTest: (model: string, testNum: number, rating: TestResult['rating']) => void
  onDeleteModel: (model: string) => void
}

// ── Gemini pricing table (approximate, per million tokens, June 2025) ─────────
const GEMINI_PRICING: Record<string, { inp: number; out: number }> = {
  'gemini-2.5-pro':          { inp: 1.25,   out: 10.0  },
  'gemini-2.5-flash':        { inp: 0.15,   out: 0.60  },
  'gemini-2.5-flash-lite':   { inp: 0.075,  out: 0.30  },
  'gemini-2.0-flash':        { inp: 0.10,   out: 0.40  },
  'gemini-2.0-flash-lite':   { inp: 0.075,  out: 0.30  },
  'gemini-2.0-pro':          { inp: 1.25,   out: 5.0   },
  'gemini-1.5-pro':          { inp: 1.25,   out: 5.0   },
  'gemini-1.5-flash':        { inp: 0.075,  out: 0.30  },
  'gemini-1.5-flash-8b':     { inp: 0.0375, out: 0.15  },
}

function geminiPrice(modelName: string) {
  const key = Object.keys(GEMINI_PRICING).find((k) =>
    modelName.toLowerCase().includes(k),
  )
  return key ? GEMINI_PRICING[key] : null
}

interface GeminiModel {
  name: string          // "models/gemini-2.5-flash"
  displayName: string
  description: string
  inputTokenLimit: number
  outputTokenLimit: number
  supportedGenerationMethods: string[]
}

const GEMINI_KEY_STORAGE = 'ollama-tester-gemini-key'

const ALL_TEST_COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#facc15']
const EVAL_COLORS = ['#f472b6', '#38bdf8', '#a78bfa', '#fbbf24', '#4ade80']

function getTestMeta(results: ModelResult[]) {
  const maxTestNum = results.reduce(
    (m, r) => Math.max(m, ...r.tests.map(t => t.testNum)),
    0,
  )
  const defs: { testNum: number; label: string; color: string }[] = []
  for (let i = 1; i <= maxTestNum; i++) {
    const isLast = i === maxTestNum
    const label = isLast && maxTestNum > 1
      ? maxTestNum === 3 ? 'Image 1+2' : 'All images'
      : `Image ${i}`
    defs.push({ testNum: i, label, color: ALL_TEST_COLORS[i - 1] ?? '#818cf8' })
  }
  return defs
}

function shortName(model: string, max = 12) {
  const name = model.split(':')[0]
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl p-3 text-xs shadow-xl border border-white/10">
      <p className="font-semibold text-white mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-mono">
            {typeof p.value === 'number'
              ? p.value % 1 !== 0
                ? `${p.value.toFixed(2)}s`
                : p.value.toFixed(1)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function isErrorResponse(response: string): boolean {
  return !response.trim() || response.startsWith('Error:')
}

function MetaModal({ meta, onClose }: { meta: OllamaRawMeta; onClose: () => void }) {
  const ns = (n?: number) => n !== undefined ? `${(n / 1e9).toFixed(3)}s` : '—'
  const tokPerSec =
    meta.eval_count && meta.eval_duration
      ? (meta.eval_count / (meta.eval_duration / 1e9)).toFixed(1)
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" /> API Response Metadata
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 text-xs">
          {meta.model && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Model</span>
              <span className="text-slate-300 font-mono truncate">{meta.model}</span>
            </div>
          )}
          {meta.done_reason && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Stop reason</span>
              <span className={`font-mono font-semibold ${meta.done_reason === 'length' ? 'text-amber-400' : 'text-emerald-400'}`}>
                {meta.done_reason}
                {meta.done_reason === 'length' && ' ⚠ truncated'}
              </span>
            </div>
          )}
          <div className="border-t border-white/5 pt-2 mt-2" />
          {meta.prompt_eval_count !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Input tokens</span>
              <span className="text-slate-300 font-mono">{meta.prompt_eval_count}</span>
            </div>
          )}
          {meta.eval_count !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Output tokens</span>
              <span className="text-slate-300 font-mono">{meta.eval_count}</span>
            </div>
          )}
          {tokPerSec && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Tokens/sec</span>
              <span className="text-violet-400 font-mono font-semibold">{tokPerSec} tok/s</span>
            </div>
          )}
          <div className="border-t border-white/5 pt-2 mt-2" />
          {meta.total_duration !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Total duration</span>
              <span className="text-slate-300 font-mono">{ns(meta.total_duration)}</span>
            </div>
          )}
          {meta.load_duration !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Load duration</span>
              <span className="text-slate-300 font-mono">{ns(meta.load_duration)}</span>
            </div>
          )}
          {meta.prompt_eval_duration !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Prompt eval</span>
              <span className="text-slate-300 font-mono">{ns(meta.prompt_eval_duration)}</span>
            </div>
          )}
          {meta.eval_duration !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Generation</span>
              <span className="text-slate-300 font-mono">{ns(meta.eval_duration)}</span>
            </div>
          )}
          {meta.created_at && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Created at</span>
              <span className="text-slate-500 font-mono">
                {new Date(meta.created_at).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelResponseCard({
  result,
  onRateTest,
  onDelete,
}: {
  result: ModelResult
  onRateTest: (testNum: number, rating: TestResult['rating']) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [openTest, setOpenTest] = useState<number | null>(null)
  const [metaModal, setMetaModal] = useState<OllamaRawMeta | null>(null)
  const fastest = result.tests.reduce((a, b) => (a.duration < b.duration ? a : b))
  const tokInp = result.tests.reduce((s, t) => s + (t.rawMeta?.prompt_eval_count ?? 0), 0)
  const tokOut = result.tests.reduce((s, t) => s + (t.rawMeta?.eval_count ?? 0), 0)

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {metaModal && <MetaModal meta={metaModal} onClose={() => setMetaModal(null)} />}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{result.model}</p>
            <p className="text-xs text-slate-500">
              {result.tests.length} tests · fastest: {fastest.duration}s ({fastest.description})
              {tokInp > 0 && (
                <span className="text-slate-600 font-mono"> · ↑{tokInp.toLocaleString()} ↓{tokOut.toLocaleString()} tok</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Per-test rating summary, read-only */}
          <div className="flex items-center gap-1.5">
            {result.tests.map(test => (
              <div
                key={test.testNum}
                title={`${test.description}: ${test.rating ?? 'unrated'}`}
                className="flex items-center justify-center w-5 h-5"
              >
                {test.rating === 'like' ? (
                  <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : test.rating === 'dislike' ? (
                  <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-slate-700" />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete result"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
          {result.tests.map((test) => (
            <div key={test.testNum} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenTest(openTest === test.testNum ? null : test.testNum)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: test.rating === 'dislike' ? '#6b7280' : (ALL_TEST_COLORS[test.testNum - 1] ?? '#818cf8') }}
                  />
                  <span className={`text-xs font-semibold ${test.rating === 'dislike' ? 'text-slate-500' : 'text-slate-300'}`}>
                    {test.description}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Rating buttons */}
                  <button
                    onClick={e => { e.stopPropagation(); onRateTest(test.testNum, test.rating === 'like' ? undefined : 'like') }}
                    className={`p-1 rounded transition-colors ${test.rating === 'like' ? 'text-emerald-400' : 'text-slate-600 hover:text-emerald-500'}`}
                    title="Like"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onRateTest(test.testNum, test.rating === 'dislike' ? undefined : 'dislike') }}
                    className={`p-1 rounded transition-colors ${test.rating === 'dislike' ? 'text-red-400' : 'text-slate-600 hover:text-red-500'}`}
                    title="Dislike"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  {test.rawMeta && (
                    <button
                      onClick={e => { e.stopPropagation(); setMetaModal(test.rawMeta!) }}
                      className="p-1 rounded text-slate-600 hover:text-blue-400 transition-colors"
                      title="API metadata"
                    >
                      <Info className="w-3 h-3" />
                    </button>
                  )}
                  {test.rawMeta?.prompt_eval_count !== undefined && (
                    <span className="text-xs font-mono text-slate-600" title="Input / output tokens">
                      ↑{test.rawMeta.prompt_eval_count.toLocaleString()} ↓{(test.rawMeta.eval_count ?? 0).toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs font-mono text-slate-400 ml-1">{test.duration}s</span>
                  {openTest === test.testNum ? (
                    <ChevronUp className="w-3 h-3 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-500" />
                  )}
                </div>
              </button>
              {openTest === test.testNum && (
                <div className="px-3 pb-3 border-t border-white/5 pt-2">
                  {isErrorResponse(test.response) ? (
                    <p className="text-xs text-red-400 leading-relaxed whitespace-pre-wrap">
                      {test.response || 'Empty response from model'}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {test.response}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EvaluationChart({
  evaluation,
  models,
  testMeta,
  onRemove,
}: {
  evaluation: Evaluation
  models: string[]
  testMeta: { testNum: number; label: string; color: string }[]
  onRemove: () => void
}) {
  const data = models.map((model) => {
    const entry = evaluation.evaluations.find((e) => e.model === model)
    const row: Record<string, string | number | undefined> = {
      name: shortName(model),
      fullName: model,
      overall: entry?.overallScore,
    }
    testMeta.forEach(td => {
      row[`test${td.testNum}`] = entry?.tests.find((t) => t.testNum === td.testNum)?.score
    })
    return row
  })

  return (
    <div className="glass rounded-2xl p-6 fade-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider">Evaluation</p>
          <p className="text-sm font-bold text-white mt-0.5 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            {evaluation.evaluator}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-colors text-slate-500"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 5]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
          {testMeta.map((td) => (
            <Bar
              key={td.testNum}
              dataKey={`test${td.testNum}`}
              name={td.label}
              fill={td.color}
              radius={[4, 4, 0, 0]}
              isAnimationActive
              animationDuration={700}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Per-model summaries */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {evaluation.evaluations.map((entry) => (
          <div key={entry.model} className="bg-slate-900/60 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white">{entry.model}</span>
              <span className="text-xs font-mono font-bold text-yellow-400">
                {entry.overallScore.toFixed(1)}/5
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{entry.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImportEvaluation({
  onImport,
  existingModels,
}: {
  onImport: (e: Evaluation) => void
  existingModels: string[]
}) {
  const [open, setOpen] = useState(false)
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function tryImport() {
    setError(null)
    try {
      const parsed = JSON.parse(json)
      if (!parsed.evaluator || !Array.isArray(parsed.evaluations)) {
        throw new Error('Missing "evaluator" or "evaluations" fields')
      }
      onImport({ id: uuidv4(), ...parsed })
      setJson('')
      setOpen(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  const sampleJson = `{
  "evaluator": "Claude 3.5 Sonnet",
  "evaluations": [
    {
      "model": "${existingModels[0] ?? 'llava:7b'}",
      "tests": [
        {"testNum": 1, "score": 4.5, "comment": "Good detail"},
        {"testNum": 2, "score": 3.0, "comment": "Missed key elements"},
        {"testNum": 3, "score": 4.0, "comment": "Solid overall"}
      ],
      "overallScore": 3.83,
      "summary": "Strong vision model with minor gaps"
    }
  ]
}`

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Plus className="w-4 h-4 text-blue-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-sm font-semibold text-white">Import External Evaluation</p>
          <p className="text-xs text-slate-500">
            Paste JSON response from Claude / GPT-4o / Gemini
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3">
          <div className="bg-slate-900/60 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-2">Expected JSON format:</p>
            <pre className="text-[11px] text-slate-500 overflow-x-auto leading-relaxed">
              {sampleJson}
            </pre>
          </div>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={8}
            placeholder="Paste evaluation JSON here…"
            className="w-full bg-slate-900/80 border border-white/10 rounded-xl p-3 text-xs
              text-slate-300 font-mono resize-none outline-none focus:border-violet-500/50 transition-colors"
          />
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">⚠ {error}</p>
          )}
          <button
            onClick={tryImport}
            disabled={!json.trim()}
            className="btn-primary flex items-center gap-2 text-sm w-full justify-center"
          >
            <Plus className="w-4 h-4" /> Apply Evaluation
          </button>
        </div>
      )}
    </div>
  )
}

// ── Gemini Auto-Evaluate component ────────────────────────────────────────────
function GeminiEvalSection({
  results,
  prompt,
  image1,
  image2,
  buildPrompt,
  onEvaluation,
}: {
  results: ModelResult[]
  prompt: string
  image1: ImageData | null
  image2: ImageData | null
  buildPrompt: () => string
  onEvaluation: (e: Evaluation) => void
}) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '')
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<GeminiModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendDone, setSendDone] = useState(false)

  function saveKey(k: string) {
    setApiKey(k)
    localStorage.setItem(GEMINI_KEY_STORAGE, k)
  }

  async function fetchModels() {
    if (!apiKey.trim()) { setFetchError('Введите API ключ'); return }
    setFetchingModels(true)
    setFetchError(null)
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}&pageSize=100`,
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err?.error?.message || `HTTP ${r.status}`)
      }
      const data = await r.json()
      const vision = (data.models as GeminiModel[]).filter(
        (m) =>
          m.supportedGenerationMethods?.includes('generateContent') &&
          m.name.includes('gemini') &&
          !m.name.includes('embed') &&
          !m.name.includes('aqa'),
      )
      setModels(vision)
      if (vision.length > 0) setSelectedModel(vision[0].name)
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setFetchingModels(false)
    }
  }

  async function sendForEval() {
    if (!selectedModel || !apiKey.trim()) return
    setSending(true)
    setSendError(null)
    setSendDone(false)
    try {
      const evalPrompt = buildPrompt()

      // Build parts: text + images
      const parts: unknown[] = [{ text: evalPrompt }]
      for (const img of [image1, image2]) {
        if (!img) continue
        const [header, data] = img.dataUrl.split(',')
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
        parts.push({ inline_data: { mime_type: mimeType, data } })
      }

      const body = { contents: [{ parts }] }
      const modelId = selectedModel.replace('models/', '')
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey.trim()}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err?.error?.message || `HTTP ${r.status}`)
      }
      const resp = await r.json()
      const text: string = resp?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      // Extract JSON from response (strip markdown code fences if present)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
      const parsed = JSON.parse(jsonStr.trim())

      if (!parsed.evaluator || !Array.isArray(parsed.evaluations)) {
        throw new Error('Gemini вернул неверный формат JSON — проверьте ответ вручную')
      }

      onEvaluation({ id: uuidv4(), ...parsed })
      setSendDone(true)
      setOpen(false)
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSending(false)
    }
  }

  function modelLabel(m: GeminiModel): string {
    const id = m.name.replace('models/', '')
    const price = geminiPrice(id)
    const priceStr = price
      ? ` — $${price.inp}/$${price.out}/M`
      : ' — цена неизвестна'
    return `${m.displayName || id}${priceStr}`
  }

  return (
    <div className="glass rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-blue-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-sm font-semibold text-white">Авто-оценка через Gemini API</p>
          <p className="text-xs text-slate-500">
            Введите API ключ → выберите модель → получите оценку автоматически
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
          {/* API Key */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Google Gemini API ключ</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center glass rounded-xl px-3 gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => saveKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 bg-transparent text-sm text-slate-200 outline-none py-2.5
                    placeholder:text-slate-600"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={fetchModels}
                disabled={fetchingModels || !apiKey.trim()}
                className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3 whitespace-nowrap"
              >
                {fetchingModels ? (
                  <RefreshCw className="w-3.5 h-3.5 spin-slow" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Загрузить модели
              </button>
            </div>
            {fetchError && (
              <p className="text-xs text-red-400 mt-1.5">⚠ {fetchError}</p>
            )}
          </div>

          {/* Model selector */}
          {models.length > 0 && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Модель Gemini{' '}
                <span className="text-slate-600">(цены: вход / выход за 1M токенов)</span>
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5
                  text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
              {selectedModel && (() => {
                const id = selectedModel.replace('models/', '')
                const p = geminiPrice(id)
                return p ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Примерная стоимость: <span className="text-emerald-400">${p.inp}/M</span> вход ·{' '}
                    <span className="text-amber-400">${p.out}/M</span> выход
                    <span className="text-slate-600"> (тарифы могут меняться)</span>
                  </p>
                ) : null
              })()}
            </div>
          )}

          {/* Send button */}
          {models.length > 0 && (
            <>
              {sendError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                  ⚠ {sendError}
                </p>
              )}
              <button
                onClick={sendForEval}
                disabled={sending || !selectedModel}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
              >
                {sending ? (
                  <><RefreshCw className="w-4 h-4 spin-slow" /> Отправляю в Gemini…</>
                ) : (
                  <><Zap className="w-4 h-4" /> Отправить на оценку</>
                )}
              </button>
              <p className="text-xs text-slate-600 text-center">
                Промпт + ваши картинки будут отправлены в выбранную модель Gemini
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default function ResultsPage({ results, prompt, image1, image2, evaluations, setEvaluations, onNewTest, llmParams, onRateTest, onDeleteModel }: Props) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const models = results.map((r) => r.model)
  const testMeta = useMemo(() => getTestMeta(results), [results])

  const durationChartData = useMemo(
    () =>
      results.map((r) => {
        const row: Record<string, string | number | undefined> = {
          name: shortName(r.model),
          fullName: r.model,
        }
        testMeta.forEach(td => {
          row[`test${td.testNum}`] = r.tests.find((t) => t.testNum === td.testNum)?.duration
        })
        return row
      }),
    [results, testMeta],
  )

  const fastestModel = useMemo(() => {
    if (!results.length) return null
    const avgs = results
      .map((r) => {
        const valid = r.tests.filter(t => t.rating !== 'dislike')
        if (!valid.length) return null
        return { model: r.model, avg: valid.reduce((s, t) => s + t.duration, 0) / valid.length }
      })
      .filter((x): x is { model: string; avg: number } => x !== null)
    if (!avgs.length) return null
    return avgs.reduce((a, b) => (a.avg < b.avg ? a : b))
  }, [results])

  const bestQualityModel = useMemo(() => {
    if (!results.length) return null
    const scored = results.map(r => ({
      model: r.model,
      likes: r.tests.filter(t => t.rating === 'like').length,
      dislikes: r.tests.filter(t => t.rating === 'dislike').length,
      total: r.tests.length,
    }))
    const withLikes = scored.filter(s => s.likes > 0)
    if (!withLikes.length) return null
    return withLikes.reduce((a, b) =>
      a.likes > b.likes ? a : b.likes > a.likes ? b : a.dislikes <= b.dislikes ? a : b
    )
  }, [results])

  const hasAnyDisliked = useMemo(
    () => results.some(r => r.tests.some(t => t.rating === 'dislike')),
    [results],
  )

  const totalDuration = useMemo(
    () => results.flatMap((r) => r.tests).reduce((s, t) => s + t.duration, 0),
    [results],
  )

  function buildEvaluationPrompt() {
    const imageCount = testMeta.length > 1 ? testMeta.length - 1 : 2
    const testDescriptions = testMeta.map(td => `Test ${td.testNum} used ${td.label}`).join(', ')
    let text = `You are evaluating image analysis responses from local AI models.

ORIGINAL PROMPT used for testing:
"""
${prompt}
"""

IMPORTANT: Please also examine the test images I'm attaching to this message.
There are ${imageCount} image${imageCount !== 1 ? 's' : ''}. ${testDescriptions}.

MODEL RESPONSES:
`
    for (const r of results) {
      text += `\n### ${r.model}\n`
      for (const t of r.tests) {
        text += `\n**${t.description}** (${t.duration}s):\n${t.response}\n`
      }
    }

    const testLines = testMeta.map(td => `        {"testNum": ${td.testNum}, "score": <0-5>, "comment": "<brief comment>"}`).join(',\n')
    const n = testMeta.length
    text += `
---

Please evaluate each model's response accuracy against what you see in the attached images.
Score each response 0–5:
  0 = completely wrong / hallucinated
  1 = very poor, major errors
  2 = poor, significant omissions
  3 = acceptable, minor errors
  4 = good, mostly accurate
  5 = excellent, fully accurate and detailed

Return ONLY a JSON object in this EXACT format (no other text):
{
  "evaluator": "<your model name>",
  "evaluations": [
    {
      "model": "<model name>",
      "tests": [
${testLines}
      ],
      "overallScore": <average of ${n} scores>,
      "summary": "<1-2 sentence overall assessment>"
    }
  ]
}`
    return text
  }

  function handleExport() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      prompt,
      llmParams: llmParams ?? null,
      models,
      results,
      evaluationPrompt: buildEvaluationPrompt(),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ollama-test-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyPrompt() {
    navigator.clipboard.writeText(buildEvaluationPrompt())
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  function removeEvaluation(id: string) {
    setEvaluations(evaluations.filter((e) => e.id !== id))
  }

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 fade-up">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Test Results</h1>
          <p className="text-slate-500 text-sm mt-1">
            {results.length} models · {results.reduce((s, r) => s + r.tests.length, 0)} tests completed
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopyPrompt} className="btn-secondary flex items-center gap-2 text-sm py-2.5">
            {copiedPrompt ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copiedPrompt ? 'Copied!' : 'Copy eval prompt'}
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm py-2.5">
            <Download className="w-4 h-4" /> Export JSON
          </button>
          <button onClick={onNewTest} className="btn-primary flex items-center gap-2 text-sm py-2.5">
            + New Test
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8 fade-up" style={{ animationDelay: '0.05s' }}>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Fastest</span>
          </div>
          {fastestModel ? (
            <>
              <p className="text-lg font-bold text-white">{fastestModel.model.split(':')[0]}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                avg {fastestModel.avg.toFixed(1)}s/test
                {hasAnyDisliked && <span className="text-slate-600"> · excl. disliked</span>}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-600">—</p>
              <p className="text-xs text-slate-600 mt-0.5">all results disliked</p>
            </>
          )}
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Best Quality</span>
          </div>
          {bestQualityModel ? (
            <>
              <p className="text-lg font-bold text-white">{bestQualityModel.model.split(':')[0]}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {bestQualityModel.likes}/{bestQualityModel.total} liked
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-600">—</p>
              <p className="text-xs text-slate-600 mt-0.5">like a result to rank</p>
            </>
          )}
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Total Time</span>
          </div>
          <p className="text-lg font-bold text-white">{totalDuration.toFixed(1)}s</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {(totalDuration / 60).toFixed(1)} min
          </p>
        </div>
      </div>

      {/* Duration Chart */}
      <div className="glass rounded-2xl p-6 mb-6 fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-slate-500 uppercase tracking-wider">
            Response Time (seconds)
          </p>
          {results.some(r => r.tests.some(t => t.rating === 'dislike')) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-3 h-3 rounded-sm bg-slate-600 opacity-60" />
              <span>Disliked result</span>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={durationChartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            barCategoryGap="30%"
            barGap={3}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} unit="s" />
            <Tooltip content={<CustomTooltip />} />
            <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
            {testMeta.map((td, i) => (
              <Bar
                key={td.testNum}
                dataKey={`test${td.testNum}`}
                name={td.label}
                fill={td.color}
                radius={[4, 4, 0, 0]}
                isAnimationActive
                animationDuration={900}
                animationBegin={i * 150}
              >
                {results.map((r) => {
                  const disliked = r.tests.find(t => t.testNum === td.testNum)?.rating === 'dislike'
                  return (
                    <Cell
                      key={r.model}
                      fill={disliked ? '#4b5563' : td.color}
                      fillOpacity={disliked ? 0.55 : 1}
                    />
                  )
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Model Responses */}
      <div className="mb-8 fade-up" style={{ animationDelay: '0.15s' }}>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Model Responses
        </h2>
        <div className="space-y-3">
          {results.map((r) => (
            <ModelResponseCard
              key={r.model}
              result={r}
              onRateTest={(testNum, rating) => onRateTest(r.model, testNum, rating)}
              onDelete={() => onDeleteModel(r.model)}
            />
          ))}
        </div>
      </div>

      {/* Evaluations */}
      <div className="fade-up" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-400" />
          External Evaluations
        </h2>

        {evaluations.length === 0 && (
          <div className="glass rounded-2xl p-6 mb-4 text-center">
            <p className="text-sm text-slate-500 mb-1">No evaluations imported yet</p>
            <p className="text-xs text-slate-600">
              Copy the eval prompt above, send it (with your test images) to Claude / GPT-4o / Gemini,
              then paste the JSON response below
            </p>
          </div>
        )}

        <div className="space-y-4 mb-4">
          {evaluations.map((ev) => (
            <EvaluationChart
              key={ev.id}
              evaluation={ev}
              models={models}
              testMeta={testMeta}
              onRemove={() => removeEvaluation(ev.id)}
            />
          ))}
        </div>

        <GeminiEvalSection
          results={results}
          prompt={prompt}
          image1={image1}
          image2={image2}
          buildPrompt={buildEvaluationPrompt}
          onEvaluation={(e) => setEvaluations([...evaluations, e])}
        />

        <ImportEvaluation
          onImport={(e) => setEvaluations([...evaluations, e])}
          existingModels={models}
        />
      </div>
    </div>
  )
}

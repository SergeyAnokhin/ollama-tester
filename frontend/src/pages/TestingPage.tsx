import { useEffect, useRef, useState, useMemo } from 'react'
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
import { ArrowLeft, CheckCircle, Clock, Circle, Loader2, Pause, Play, Square } from 'lucide-react'
import type { ModelResult, SystemStats, ModelStatus, ImageData } from '../types'

interface Props {
  models: string[]
  prompt: string
  image1: ImageData
  image2: ImageData
  onComplete: (results: ModelResult[]) => void
  onBack: () => void
}

interface LiveResult {
  model: string
  testNum: 1 | 2 | 3
  duration: number
  response: string
}

const TEST_COLORS = ['#818cf8', '#34d399', '#fb923c']
const TEST_LABELS = ['Image 1', 'Image 2', 'Image 1+2']

function shortName(model: string) {
  return model.length > 14 ? model.slice(0, 13) + '…' : model
}

function StatBar({
  label,
  value,
  max,
  unit,
  color,
}: {
  label: string
  value: number
  max: number
  unit: string
  color: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-mono font-semibold text-slate-300">
          {value}
          <span className="text-slate-500 text-[10px]">{unit}</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
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
          <span className="text-white font-mono">{p.value?.toFixed(2)}s</span>
        </div>
      ))}
    </div>
  )
}

export default function TestingPage({ models, prompt, image1, image2, onComplete, onBack }: Props) {
  const [statuses, setStatuses] = useState<Record<string, ModelStatus>>(
    () => Object.fromEntries(models.map((m) => [m, 'pending'])),
  )
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [activeTest, setActiveTest] = useState<1 | 2 | 3 | null>(null)
  const [preview, setPreview] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [completed, setCompleted] = useState<LiveResult[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [done, setDone] = useState(false)
  const [wasStopped, setWasStopped] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ modelIdx: 0, total: models.length })

  const testStartRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function sendControl(action: 'pause' | 'resume' | 'stop') {
    wsRef.current?.send(JSON.stringify({ action }))
  }

  function handlePauseResume() {
    if (isPaused) {
      sendControl('resume')
      setIsPaused(false)
    } else {
      sendControl('pause')
      setIsPaused(true)
    }
  }

  function handleStop() {
    sendControl('stop')
    setIsStopping(true)
    if (elapsedRef.current) clearInterval(elapsedRef.current)
  }

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8001/ws/test`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          models,
          prompt,
          image1: image1.dataUrl,
          image2: image2.dataUrl,
        }),
      )
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)

      switch (msg.type) {
        case 'model_start':
          setActiveModel(msg.model)
          setStatuses((s) => ({ ...s, [msg.model]: 'active' }))
          setProgress({ modelIdx: msg.modelIndex, total: msg.totalModels })
          setPreview('')
          break

        case 'test_start':
          setActiveTest(msg.testNum)
          setPreview('')
          setElapsed(0)
          testStartRef.current = Date.now()
          if (elapsedRef.current) clearInterval(elapsedRef.current)
          elapsedRef.current = setInterval(() => {
            if (testStartRef.current) {
              setElapsed(Math.floor((Date.now() - testStartRef.current) / 100) / 10)
            }
          }, 100)
          break

        case 'test_token':
          setPreview(msg.preview)
          break

        case 'test_complete':
          if (elapsedRef.current) clearInterval(elapsedRef.current)
          setCompleted((prev) => [
            ...prev,
            {
              model: msg.model,
              testNum: msg.testNum,
              duration: msg.duration,
              response: msg.response,
            },
          ])
          if (msg.testNum === 3) {
            setStatuses((s) => ({ ...s, [msg.model]: 'complete' }))
          }
          break

        case 'paused':
          setIsPaused(true)
          break

        case 'resumed':
          setIsPaused(false)
          break

        case 'stopping':
          setIsStopping(true)
          break

        case 'system_stats':
          setStats({
            cpu: msg.cpu,
            memPercent: msg.memPercent,
            memUsedGb: msg.memUsedGb,
            memTotalGb: msg.memTotalGb,
            ollamaCpu: msg.ollamaCpu,
            ollamaMemMb: msg.ollamaMemMb,
          })
          break

        case 'all_complete': {
          if (elapsedRef.current) clearInterval(elapsedRef.current)
          setDone(true)
          setWasStopped(!!msg.stopped)
          setActiveTest(null)
          setActiveModel(null)
          const results: ModelResult[] = msg.results
          setTimeout(() => onComplete(results), 2500)
          break
        }

        case 'error':
          setError(msg.message)
          if (elapsedRef.current) clearInterval(elapsedRef.current)
          break
      }
    }

    ws.onerror = () => setError('WebSocket connection failed — is the backend running on port 8001?')

    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
      ws.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(
    () =>
      models.map((model) => ({
        name: shortName(model),
        fullName: model,
        test1: completed.find((r) => r.model === model && r.testNum === 1)?.duration,
        test2: completed.find((r) => r.model === model && r.testNum === 2)?.duration,
        test3: completed.find((r) => r.model === model && r.testNum === 3)?.duration,
      })),
    [models, completed],
  )

  const totalTests = models.length * 3
  const doneTests = completed.length
  const overallPct = Math.round((doneTests / totalTests) * 100)

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 fade-up">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm py-2 px-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-lg font-bold text-white">
              {done
                ? wasStopped ? '⏹ Stopped' : '✓ Testing Complete!'
                : isStopping ? 'Stopping…'
                : isPaused ? '⏸ Paused'
                : `Testing ${models.length} models…`}
            </h1>
            <span className="text-sm font-mono text-slate-400">
              {doneTests}/{totalTests} tests
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${overallPct}%`,
                background: done
                  ? wasStopped
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #34d399, #10b981)'
                  : isPaused
                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                  : 'linear-gradient(90deg, #7c3aed, #2563eb)',
              }}
            />
          </div>
        </div>

        {/* Pause / Stop controls */}
        {!done && !error && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handlePauseResume}
              disabled={isStopping}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                isPaused
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
              } disabled:opacity-40`}
              title={isPaused ? 'Resume testing' : 'Pause after current test'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold
                bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25
                transition-all disabled:opacity-40"
              title="Stop after current test completes"
            >
              <Square className="w-3.5 h-3.5" />
              {isStopping ? 'Stopping…' : 'Stop'}
            </button>
          </div>
        )}
      </div>

      {/* Paused banner */}
      {isPaused && !done && (
        <div className="glass rounded-xl px-4 py-3 mb-4 border border-amber-500/30 flex items-center justify-between fade-up">
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <Pause className="w-4 h-4" />
            <span>Paused — will resume after current test finishes</span>
          </div>
          <button
            onClick={handlePauseResume}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Resume
          </button>
        </div>
      )}

      {error && (
        <div className="glass rounded-xl p-4 mb-6 border border-red-500/30 text-red-400 text-sm fade-up">
          ⚠ {error}
        </div>
      )}

      {/* System Stats */}
      {stats && (
        <div className="glass rounded-2xl p-4 mb-6 fade-up">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">System Resources</p>
          <div className="flex gap-6 flex-wrap">
            <StatBar label="CPU" value={stats.cpu} max={100} unit="%" color="#818cf8" />
            <StatBar
              label="RAM"
              value={Math.round(stats.memPercent)}
              max={100}
              unit="%"
              color="#60a5fa"
            />
            <StatBar
              label="Ollama CPU"
              value={stats.ollamaCpu}
              max={100}
              unit="%"
              color="#fb923c"
            />
            <div className="flex-1 min-w-[120px]">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs text-slate-500">Ollama RAM</span>
                <span className="text-xs font-mono font-semibold text-slate-300">
                  {stats.ollamaMemMb < 1024
                    ? `${stats.ollamaMemMb}MB`
                    : `${(stats.ollamaMemMb / 1024).toFixed(1)}GB`}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min((stats.ollamaMemMb / (stats.memTotalGb * 1024)) * 100, 100)}%`,
                    background: '#34d399',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Model Status Grid */}
        <div className="glass rounded-2xl p-4 fade-up">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Models</p>
          <div className="flex flex-col gap-2">
            {models.map((m) => {
              const status = statuses[m]
              const isActive = status === 'active'
              const isDone = status === 'complete'
              const modelCompleted = completed.filter((r) => r.model === m)
              return (
                <div
                  key={m}
                  className={`rounded-xl px-3 py-2.5 flex items-center gap-3 transition-all duration-300 ${
                    isActive
                      ? 'bg-violet-500/15 ring-1 ring-violet-500/50 pulse-glow'
                      : isDone
                      ? 'bg-emerald-500/10'
                      : 'bg-slate-800/40'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-violet-400 shrink-0 spin-slow" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{m.split(':')[0]}</p>
                    {m.includes(':') && (
                      <p className="text-[10px] text-slate-500">{m.split(':')[1]}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {([1, 2, 3] as const).map((n) => {
                      const done = modelCompleted.some((r) => r.testNum === n)
                      const isRunning = isActive && activeTest === n
                      return (
                        <div
                          key={n}
                          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                            isRunning
                              ? 'bg-violet-400 scale-125'
                              : done
                              ? 'bg-emerald-400'
                              : 'bg-slate-700'
                          }`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Current Test Info */}
        <div className="lg:col-span-2 glass rounded-2xl p-4 fade-up flex flex-col">
          {activeModel && activeTest ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Running</p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {activeModel}
                    <span className="text-slate-500 font-normal">
                      {' '}
                      — {TEST_LABELS[activeTest - 1]}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  <span className="text-lg font-mono font-bold text-white tabular-nums">
                    {elapsed.toFixed(1)}s
                  </span>
                </div>
              </div>
              <div className="flex-1 relative">
                <div className="glass rounded-xl p-3 h-full min-h-[120px] max-h-[180px] overflow-y-auto">
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                    {preview || (
                      <span className="text-slate-600">Waiting for response…</span>
                    )}
                    {preview && <span className="cursor-blink" />}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {([1, 2, 3] as const).map((n) => (
                  <div
                    key={n}
                    className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                      n < activeTest
                        ? 'bg-emerald-500'
                        : n === activeTest
                        ? 'progress-bar'
                        : 'bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            </>
          ) : done ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-lg font-bold text-white">All tests complete!</p>
              <p className="text-sm text-slate-500">Navigating to results…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-slate-600">
              <Loader2 className="w-6 h-6 spin-slow" />
              <p className="text-sm">Connecting to backend…</p>
            </div>
          )}
        </div>
      </div>

      {/* Live Chart */}
      <div className="glass rounded-2xl p-6 fade-up">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-6">
          Duration (seconds) — updating live
        </p>
        {completed.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-700 text-sm">
            Results will appear here as tests complete
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
              barCategoryGap="30%"
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="s"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(val) => (
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{val}</span>
                )}
              />
              {TEST_LABELS.map((label, i) => (
                <Bar
                  key={label}
                  dataKey={`test${i + 1}`}
                  name={label}
                  fill={TEST_COLORS[i]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={TEST_COLORS[i]}
                      fillOpacity={entry.fullName === activeModel ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

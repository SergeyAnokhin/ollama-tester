import { useState, useCallback } from 'react'
import { Cpu, ImagePlus, Play, RefreshCw, CheckSquare, Square, X, AlertCircle, Zap, Copy, Check, History } from 'lucide-react'
import type { ImageData, Session, ModelResult } from '../types'

interface Props {
  selectedModels: string[]
  setSelectedModels: (m: string[]) => void
  prompt: string
  setPrompt: (p: string) => void
  image1: ImageData | null
  setImage1: (img: ImageData | null) => void
  image2: ImageData | null
  setImage2: (img: ImageData | null) => void
  onStart: () => void
  sessions: Session[]
  onViewSession: (session: Session) => void
  onResumeSession: (session: Session) => void
  previousResults: ModelResult[]
  onClearPrevious: () => void
}

function ImageDropzone({
  label,
  value,
  onChange,
}: {
  label: string
  value: ImageData | null
  onChange: (img: ImageData) => void
}) {
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () =>
        onChange({ dataUrl: reader.result as string, name: file.name })
      reader.readAsDataURL(file)
    },
    [onChange],
  )

  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer
        ${dragging ? 'ring-2 ring-violet-500 scale-[1.02]' : ''}
        ${value ? 'aspect-video' : 'aspect-video'}
        glass glass-hover`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) processFile(file)
      }}
      onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) processFile(file)
        }
        input.click()
      }}
    >
      {value ? (
        <>
          <img
            src={value.dataUrl}
            alt={value.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className="text-xs text-slate-300 truncate max-w-[160px]">{value.name}</span>
            <div className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full px-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400">Ready</span>
            </div>
          </div>
          <div className="absolute top-2 left-3">
            <span className="text-xs font-semibold text-white/80 bg-black/50 rounded-full px-2 py-0.5">
              {label}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ImagePlus className="w-6 h-6 text-violet-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-300">{label}</p>
            <p className="text-xs text-slate-500 mt-1">Drag & drop or click to upload</p>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_STYLE: Record<Session['status'], string> = {
  complete: 'bg-emerald-500/20 text-emerald-400',
  running: 'bg-blue-500/20 text-blue-400',
  stopped: 'bg-amber-500/20 text-amber-400',
  partial: 'bg-slate-500/20 text-slate-400',
}
const STATUS_LABEL: Record<Session['status'], string> = {
  complete: 'Complete',
  running: 'Interrupted',
  stopped: 'Stopped',
  partial: 'Partial',
}

function SessionCard({
  session,
  onView,
  onResume,
}: {
  session: Session
  onView: () => void
  onResume: () => void
}) {
  const totalTests = session.models.length * 3
  const doneTests = session.results.reduce((s, r) => s + r.tests.length, 0)
  const pct = totalTests > 0 ? Math.round((doneTests / totalTests) * 100) : 0
  const isComplete = session.status === 'complete'
  const modelNames = session.models.map(m => m.split(':')[0])
  const shownNames = modelNames.slice(0, 2).join(', ')
  const extraCount = modelNames.length > 2 ? ` +${modelNames.length - 2}` : ''
  const doneModelCount = session.results.filter(r => r.tests.length === 3).length

  return (
    <div className="glass rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[session.status]}`}>
          {STATUS_LABEL[session.status]}
        </span>
        <span className="text-[10px] text-slate-600">{formatTimeAgo(session.startedAt)}</span>
      </div>
      <p className="text-xs text-slate-300 mb-2 truncate" title={modelNames.join(', ')}>
        {shownNames}{extraCount}
      </p>
      <div className="mb-2.5">
        <div className="flex justify-between text-[10px] text-slate-600 mb-1">
          <span>{session.models.length} models</span>
          <span>{doneTests}/{totalTests} tests</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isComplete ? '#34d399' : '#818cf8',
            }}
          />
        </div>
      </div>
      <div className="flex gap-1.5">
        {session.results.length > 0 && (
          <button
            onClick={onView}
            className="flex-1 text-[11px] text-center py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            View
          </button>
        )}
        {!isComplete && (
          <button
            onClick={onResume}
            className="flex-1 text-[11px] text-center py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 transition-colors"
          >
            {doneModelCount > 0 ? 'Resume' : 'Re-run'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function SetupPage({
  selectedModels,
  setSelectedModels,
  prompt,
  setPrompt,
  image1,
  setImage1,
  image2,
  setImage2,
  onStart,
  sessions,
  onViewSession,
  onResumeSession,
  previousResults,
  onClearPrevious,
}: Props) {
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)
  const [copiedModels, setCopiedModels] = useState(false)

  async function scanModels() {
    setScanning(true)
    setScanError(null)
    try {
      const r = await fetch('/api/models').catch(() => {
        throw new Error('Python backend не запущен. Запустите: cd backend && uvicorn main:app --port 8000')
      })
      if (!r.ok) {
        throw new Error(`Python backend вернул HTTP ${r.status}. Запустите: cd backend && uvicorn main:app --port 8000`)
      }
      const text = await r.text()
      let data: { models?: string[]; error?: string }
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Backend вернул неверный ответ. Убедитесь что uvicorn запущен на порту 8000')
      }
      if (data.error) throw new Error(`Ollama: ${data.error}`)
      if (!Array.isArray(data.models)) {
        throw new Error('Запустите Python backend: cd backend && uvicorn main:app --port 8001')
      }
      setAvailableModels(data.models)
      setSelectedModels(data.models)
      setScanned(true)
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setScanning(false)
    }
  }

  function toggleModel(m: string) {
    setSelectedModels(
      selectedModels.includes(m)
        ? selectedModels.filter((x) => x !== m)
        : [...selectedModels, m],
    )
  }

  const canStart = selectedModels.length > 0 && prompt.trim().length > 0 && !!image1 && !!image2

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-[1500px] mx-auto flex gap-6 items-start">
        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="mb-6 fade-up">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold gradient-text">Ollama Vision Tester</h1>
            </div>
            <p className="text-slate-500 pl-[52px]">
              Benchmark local vision models with image prompts — sequential, fair, beautiful
            </p>
          </div>

          {/* Prerequisites banner */}
          <div className="glass rounded-xl px-4 py-3 mb-4 flex gap-6 flex-wrap fade-up" style={{ animationDelay: '0.02s' }}>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Нужно запустить:</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-slate-400">Ollama</span>
              <code className="text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">localhost:11434</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span className="text-slate-400">Python backend</span>
              <code className="text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">cd backend &amp;&amp; uvicorn main:app --port 8001</code>
            </div>
          </div>

          {/* Resume banner */}
          {previousResults.length > 0 && (
            <div className="glass rounded-xl px-4 py-3 mb-4 border border-violet-500/30 flex items-center justify-between fade-up">
              <div className="text-xs text-violet-300 flex items-center gap-2">
                <span>↩ Resuming —</span>
                <span className="font-semibold">
                  {previousResults.length} model{previousResults.length !== 1 ? 's' : ''} already done
                </span>
                <span className="text-slate-500">({selectedModels.length} remaining)</span>
              </div>
              <button
                onClick={onClearPrevious}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {/* Models */}
          <section className="mb-8 fade-up" style={{ animationDelay: '0.05s' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Models
              </h2>
              {scanned && availableModels.length > 0 && (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    onClick={() => setSelectedModels(availableModels)}
                    className="text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() => setSelectedModels([])}
                    className="text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    Deselect all
                  </button>
                  {selectedModels.length > 0 && (
                    <>
                      <span className="text-slate-600">·</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedModels.join('\n'))
                          setCopiedModels(true)
                          setTimeout(() => setCopiedModels(false), 2000)
                        }}
                        className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
                      >
                        {copiedModels ? (
                          <><Check className="w-3 h-3 text-emerald-400" /> Copied!</>
                        ) : (
                          <><Copy className="w-3 h-3" /> Copy {selectedModels.length}</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {!scanned && (
              <div className="glass rounded-2xl p-8 text-center">
                <button
                  onClick={scanModels}
                  disabled={scanning}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  {scanning ? (
                    <RefreshCw className="w-4 h-4 spin-slow" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {scanning ? 'Scanning Ollama…' : 'Scan for models'}
                </button>
                {scanError && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {scanError}
                  </div>
                )}
              </div>
            )}

            {scanned && availableModels.length === 0 && (
              <div className="glass rounded-2xl p-6 text-center text-slate-500">
                No models found in Ollama. Pull a vision model first (e.g.{' '}
                <code className="text-violet-400">ollama pull llava</code>).
              </div>
            )}

            {scanned && availableModels.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {availableModels.map((m, i) => {
                    const selected = selectedModels.includes(m)
                    const [name, tag] = m.split(':')
                    return (
                      <button
                        key={m}
                        onClick={() => toggleModel(m)}
                        className={`glass glass-hover rounded-xl p-3 text-left transition-all duration-200 fade-up ${
                          selected
                            ? 'ring-1 ring-violet-500 bg-violet-500/10'
                            : 'opacity-60'
                        }`}
                        style={{ animationDelay: `${i * 0.04}s` }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-white truncate">{name}</span>
                          {selected ? (
                            <CheckSquare className="w-4 h-4 text-violet-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                        </div>
                        {tag && (
                          <span className="text-xs text-slate-500">{tag}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-600">
                  ⚠ Only vision-capable models (llava, bakllava, moondream, minicpm-v…) can process images
                </p>
              </>
            )}
          </section>

          {/* Prompt */}
          <section className="mb-8 fade-up" style={{ animationDelay: '0.1s' }}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Prompt
            </h2>
            <div className="glass rounded-2xl p-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Enter your image analysis prompt…"
                className="w-full bg-transparent text-slate-200 text-sm resize-none outline-none p-4
                  placeholder:text-slate-600 leading-relaxed"
              />
            </div>
            <p className="text-xs text-slate-600 mt-2">
              The same prompt is used for all 3 tests. Image placeholders are managed automatically.
            </p>
          </section>

          {/* Images */}
          <section className="mb-10 fade-up" style={{ animationDelay: '0.15s' }}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Test Images
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <ImageDropzone
                  label="Image 1"
                  value={image1}
                  onChange={setImage1}
                />
                {image1 && (
                  <button
                    onClick={() => setImage1(null)}
                    className="mt-2 text-xs text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
              <div>
                <ImageDropzone
                  label="Image 2"
                  value={image2}
                  onChange={setImage2}
                />
                {image2 && (
                  <button
                    onClick={() => setImage2(null)}
                    className="mt-2 text-xs text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Test 1 uses Image 1 · Test 2 uses Image 2 · Test 3 uses both
            </p>
          </section>

          {/* Start */}
          <div className="fade-up flex items-center justify-between" style={{ animationDelay: '0.2s' }}>
            <div className="text-sm text-slate-500">
              {canStart ? (
                <span className="text-emerald-400">
                  ✓ {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} ·{' '}
                  {selectedModels.length * 3} total tests
                  {previousResults.length > 0 && (
                    <span className="text-violet-400 ml-2">
                      + {previousResults.length} resumed
                    </span>
                  )}
                </span>
              ) : (
                <span>Select models, write a prompt, and upload 2 images to start</span>
              )}
            </div>
            <button
              onClick={onStart}
              disabled={!canStart}
              className="btn-primary flex items-center gap-2 text-base"
            >
              <Play className="w-4 h-4" />
              Start Testing
            </button>
          </div>
        </div>

        {/* ── Sessions sidebar ── */}
        {sessions.length > 0 && (
          <div className="w-72 shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                History
              </h2>
              <span className="text-[10px] text-slate-600">{sessions.length} runs</span>
            </div>
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onView={() => onViewSession(session)}
                onResume={() => onResumeSession(session)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

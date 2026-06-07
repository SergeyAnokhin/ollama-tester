import { useState, useCallback, useEffect, useRef } from 'react'
import { Cpu, ImagePlus, Play, RefreshCw, CheckSquare, Square, X, AlertCircle, Zap, Copy, Check, History, Eye, Brain, ChevronDown, ChevronRight, Settings2, Pencil, Tag } from 'lucide-react'
import type { ImageData, Session, ModelResult, ModelInfo, LlmParams } from '../types'

interface Props {
  selectedModels: string[]
  setSelectedModels: (m: string[]) => void
  prompt: string
  setPrompt: (p: string) => void
  image1: ImageData | null
  setImage1: (img: ImageData | null) => void
  image2: ImageData | null
  setImage2: (img: ImageData | null) => void
  image3: ImageData | null
  setImage3: (img: ImageData | null) => void
  image4: ImageData | null
  setImage4: (img: ImageData | null) => void
  onStart: () => void
  sessions: Session[]
  onViewSession: (session: Session) => void
  onResumeSession: (session: Session) => void
  previousResults: ModelResult[]
  onClearPrevious: () => void
  llmParams: LlmParams
  setLlmParams: (p: LlmParams) => void
  sessionName: string
  setSessionName: (n: string) => void
  onRenameSession: (id: string, name: string) => void
  onDeleteSession: (id: string) => void
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}MB`
  return `${(bytes / 1e3).toFixed(0)}KB`
}

function ImageDropzone({
  label,
  value,
  onChange,
  optional,
}: {
  label: string
  value: ImageData | null
  onChange: (img: ImageData) => void
  optional?: boolean
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
      className={`relative rounded-xl overflow-hidden transition-all duration-200 cursor-pointer aspect-video
        ${dragging ? 'ring-2 ring-violet-500 scale-[1.02]' : ''}
        ${!value && optional ? 'opacity-50 hover:opacity-80' : ''}
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
          <img src={value.dataUrl} alt={value.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-300 truncate max-w-[100px]">{value.name}</span>
            <div className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full px-1.5 py-0.5">
              <div className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400">Ready</span>
            </div>
          </div>
          <div className="absolute top-1.5 left-2">
            <span className="text-[10px] font-semibold text-white/80 bg-black/50 rounded-full px-1.5 py-0.5">
              {label}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ImagePlus className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-300">{label}</p>
            {optional && <p className="text-[10px] text-slate-600 mt-0.5">Optional</p>}
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

function parseParamSize(s?: string): number {
  if (!s) return 0
  const m = s.match(/([\d.]+)\s*([BMK]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  switch (m[2].toUpperCase()) {
    case 'B': return n * 1e9
    case 'M': return n * 1e6
    case 'K': return n * 1e3
    default: return n
  }
}

function TooltipRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-300 text-right">{value}</span>
    </div>
  )
}

function ModelCard({
  m,
  selected,
  index,
  onToggle,
  maxSize,
  maxParams,
}: {
  m: ModelInfo
  selected: boolean
  index: number
  onToggle: () => void
  maxSize: number
  maxParams: number
}) {
  const [hovered, setHovered] = useState(false)

  const [baseName, tag] = m.name.split(':')
  const sizeStr = formatSize(m.size)
  const paramSize = m.details?.parameter_size
  const quantLevel = m.details?.quantization_level
  const family = m.details?.family

  const sizeRatio = maxSize > 0 ? m.size / maxSize : 0
  const paramRatio = maxParams > 0 ? parseParamSize(paramSize) / maxParams : 0

  // First row of cards → tooltip below; rest → tooltip above
  const tooltipPosClass = index < 4 ? 'top-full mt-2' : 'bottom-full mb-2'

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onToggle}
        className={`w-full glass glass-hover rounded-xl p-3 text-left transition-all duration-200 fade-up ${
          selected ? 'ring-1 ring-violet-500 bg-violet-500/10' : 'opacity-60'
        }`}
        style={{ animationDelay: `${index * 0.04}s` }}
      >
        <div className="flex items-start justify-between mb-1.5">
          <span className="text-sm font-semibold text-white truncate leading-tight flex-1 mr-2">{baseName}</span>
          <div className="flex items-center gap-1 shrink-0">
            {m.has_vision && <Eye className="w-3.5 h-3.5 text-blue-400" />}
            {m.has_thinking && <Brain className="w-3.5 h-3.5 text-purple-400" />}
            {selected ? (
              <CheckSquare className="w-3.5 h-3.5 text-violet-400 ml-0.5" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-600 ml-0.5" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {tag && <span className="text-[10px] text-slate-500">{tag}</span>}
          {sizeStr && <span className="text-[10px] text-slate-600">{sizeStr}</span>}
          {paramSize && (
            <span className="text-[10px] text-slate-400 bg-slate-800/80 rounded px-1 py-0.5">
              {paramSize}
            </span>
          )}
        </div>
        {/* Normalized bars */}
        <div className="space-y-1">
          <div className="h-[3px] bg-slate-700/40 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400/70 rounded-full transition-all duration-500" style={{ width: `${sizeRatio * 100}%` }} />
          </div>
          <div className="h-[3px] bg-slate-700/40 rounded-full overflow-hidden">
            <div className="h-full bg-violet-400/70 rounded-full transition-all duration-500" style={{ width: `${paramRatio * 100}%` }} />
          </div>
        </div>
      </button>

      {hovered && (
        <div
          className={`absolute ${tooltipPosClass} left-0 z-50 w-52 rounded-xl p-3 shadow-2xl text-xs pointer-events-none border border-slate-700/70`}
          style={{ background: 'rgba(10, 13, 28, 0.96)', backdropFilter: 'blur(16px)' }}
        >
          <p className="font-semibold text-white mb-2 truncate">{m.name}</p>
          <div className="space-y-1.5">
            {family && <TooltipRow label="Family" value={<span className="capitalize">{family}</span>} />}
            {paramSize && <TooltipRow label="Parameters" value={paramSize} />}
            {quantLevel && <TooltipRow label="Quantization" value={quantLevel} />}
            {sizeStr && <TooltipRow label="Disk size" value={sizeStr} />}
            {m.context_length && (
              <TooltipRow label="Context" value={`${Math.round(m.context_length / 1024)}K tokens`} />
            )}
            <TooltipRow
              label="Vision"
              value={m.has_vision ? <span className="text-blue-400">Yes</span> : <span className="text-slate-500">No</span>}
            />
            <TooltipRow
              label="Thinking"
              value={m.has_thinking ? <span className="text-purple-400">Yes</span> : <span className="text-slate-500">No</span>}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const PARAM_DEFS: {
  key: keyof LlmParams
  label: string
  hint: string
  type: 'int' | 'float' | 'string'
  placeholder: string
}[] = [
  { key: 'num_thread', label: 'CPU Threads', hint: 'P-core count for hybrid CPUs (auto if empty)', type: 'int', placeholder: 'auto' },
  { key: 'num_ctx', label: 'Context Size', hint: 'Token window size — larger = more VRAM', type: 'int', placeholder: 'model default' },
  { key: 'num_predict', label: 'Max Tokens', hint: '-1 = unlimited, -2 = fill context', type: 'int', placeholder: '-1' },
  { key: 'keep_alive', label: 'Keep Alive', hint: 'GPU retention after request: "5m", "1h", 0, -1', type: 'string', placeholder: '5m' },
  { key: 'temperature', label: 'Temperature', hint: '0 = precise/deterministic, 1 = creative/random', type: 'float', placeholder: 'model default' },
]

function LlmParamsSection({ params, setParams }: { params: LlmParams; setParams: (p: LlmParams) => void }) {
  const [open, setOpen] = useState(false)

  const activeCount = PARAM_DEFS.filter(({ key }) => {
    const v = params[key]
    return v !== null && v !== ''
  }).length

  function handleChange(key: keyof LlmParams, raw: string) {
    const def = PARAM_DEFS.find(d => d.key === key)!
    if (raw === '') {
      setParams({ ...params, [key]: key === 'keep_alive' ? '' : null })
      return
    }
    if (def.type === 'int') {
      const n = parseInt(raw, 10)
      setParams({ ...params, [key]: isNaN(n) ? null : n })
    } else if (def.type === 'float') {
      const n = parseFloat(raw)
      setParams({ ...params, [key]: isNaN(n) ? null : n })
    } else {
      setParams({ ...params, [key]: raw })
    }
  }

  function displayValue(key: keyof LlmParams): string {
    const v = params[key]
    if (v === null || v === '') return ''
    return String(v)
  }

  return (
    <section className="mb-8 fade-up" style={{ animationDelay: '0.12s' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors mb-4 w-full text-left"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Settings2 className="w-4 h-4" />
        LLM Parameters
        {activeCount > 0 && (
          <span className="normal-case tracking-normal font-normal text-xs text-violet-400 bg-violet-500/10 rounded-full px-2 py-0.5 ml-1">
            {activeCount} set
          </span>
        )}
      </button>

      {open && (
        <div className="glass rounded-2xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {PARAM_DEFS.map(({ key, label, hint, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                <input
                  type={type === 'string' ? 'text' : 'number'}
                  step={type === 'float' ? '0.05' : '1'}
                  min={type === 'float' ? '0' : undefined}
                  max={type === 'float' ? '2' : undefined}
                  value={displayValue(key)}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200
                    placeholder:text-slate-600 outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 transition-all"
                />
                <p className="text-[10px] text-slate-600 mt-1 leading-snug">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
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

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function formatParamsSummary(p?: LlmParams): string | null {
  if (!p) return null
  const parts: string[] = []
  if (p.num_ctx !== null) parts.push(`ctx:${p.num_ctx}`)
  if (p.temperature !== null) parts.push(`t:${p.temperature}`)
  if (p.num_thread !== null) parts.push(`thr:${p.num_thread}`)
  if (p.num_predict !== null) parts.push(`max:${p.num_predict}`)
  if (p.keep_alive) parts.push(`ka:${p.keep_alive}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function SessionCard({
  session,
  onView,
  onResume,
  onRename,
  onDelete,
}: {
  session: Session
  onView: () => void
  onResume: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const totalTests = session.models.length * 3
  const doneTests = session.results.reduce((s, r) => s + r.tests.length, 0)
  const pct = totalTests > 0 ? Math.round((doneTests / totalTests) * 100) : 0
  const totalSec = session.results.flatMap(r => r.tests).reduce((s, t) => s + t.duration, 0)
  const isComplete = session.status === 'complete'
  const modelNames = session.models.map(m => m.split(':')[0])
  const shownNames = modelNames.slice(0, 2).join(', ')
  const extraCount = modelNames.length > 2 ? ` +${modelNames.length - 2}` : ''
  const doneModelCount = session.results.filter(r => r.tests.length === 3).length
  const paramsSummary = formatParamsSummary(session.llmParams)

  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(session.name || '')
  const renameRef = useRef<HTMLInputElement>(null)

  function startRename() {
    setNameInput(session.name || '')
    setRenaming(true)
    setTimeout(() => renameRef.current?.focus(), 0)
  }

  function commitRename() {
    onRename(nameInput)
    setRenaming(false)
  }

  return (
    <div className="glass rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[session.status]}`}>
          {STATUS_LABEL[session.status]}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">{formatTimeAgo(session.startedAt)}</span>
          <button
            onClick={onDelete}
            className="text-slate-700 hover:text-red-400 transition-colors"
            title="Delete session"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Session name row */}
      <div className="flex items-center gap-1 mb-1.5 min-h-[20px]">
        {renaming ? (
          <input
            ref={renameRef}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            placeholder="Add a name…"
            className="flex-1 text-xs bg-slate-800/80 border border-violet-500/50 rounded px-2 py-0.5 text-slate-200 outline-none"
          />
        ) : (
          <>
            {session.name ? (
              <span className="text-xs font-semibold text-white truncate flex-1">{session.name}</span>
            ) : (
              <span className="text-[10px] text-slate-600 italic flex-1">Unnamed</span>
            )}
            <button
              onClick={startRename}
              className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mb-1.5 truncate" title={modelNames.join(', ')}>
        {shownNames}{extraCount}
      </p>

      {paramsSummary && (
        <p className="text-[10px] text-slate-600 mb-2 truncate font-mono">{paramsSummary}</p>
      )}

      <div className="mb-2.5">
        <div className="flex justify-between text-[10px] text-slate-600 mb-1">
          <span>{session.models.length} models</span>
          <span className="flex items-center gap-2">
            {totalSec > 0 && <span className="text-slate-700">{formatDuration(totalSec)}</span>}
            <span>{doneTests}/{totalTests} tests</span>
          </span>
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

// Service status dot: pulses green when up, grey+blink when down
function ServiceDot({ ok, checking }: { ok: boolean | null; checking: boolean }) {
  if (checking || ok === null) {
    return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />
  }
  if (ok) {
    return (
      <span className="relative inline-flex w-1.5 h-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
      </span>
    )
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block service-dot-blink" />
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
  image3,
  setImage3,
  image4,
  setImage4,
  onStart,
  sessions,
  onViewSession,
  onResumeSession,
  previousResults,
  onClearPrevious,
  llmParams,
  setLlmParams,
  sessionName,
  setSessionName,
  onRenameSession,
  onDeleteSession,
}: Props) {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)
  const [copiedModels, setCopiedModels] = useState(false)

  // Service health state
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [healthChecking, setHealthChecking] = useState(true)

  useEffect(() => {
    async function checkHealth() {
      const [backend, ollama] = await Promise.all([
        fetch('/api/health').then(r => r.ok).catch(() => false),
        fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false),
      ])
      setBackendOk(backend)
      setOllamaOk(ollama)
      setHealthChecking(false)
    }

    checkHealth()
    const interval = setInterval(checkHealth, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    scanModels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanModels() {
    setScanning(true)
    setScanError(null)
    try {
      const r = await fetch('/api/models').catch(() => {
        throw new Error('Python backend не запущен. Запустите: cd backend && uvicorn main:app --port 8002')
      })
      if (!r.ok) {
        throw new Error(`Python backend вернул HTTP ${r.status}. Запустите: cd backend && uvicorn main:app --port 8002`)
      }
      const text = await r.text()
      let data: { models?: ModelInfo[]; error?: string }
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Backend вернул неверный ответ. Убедитесь что uvicorn запущен на порту 8002')
      }
      if (data.error) throw new Error(`Ollama: ${data.error}`)
      if (!Array.isArray(data.models)) {
        throw new Error('Запустите Python backend: cd backend && uvicorn main:app --port 8002')
      }
      setAvailableModels(data.models)
      const newNames = data.models.map(m => m.name)
      const savedSelection = selectedModels.filter(name => newNames.includes(name))
      setSelectedModels(savedSelection.length > 0 ? savedSelection : newNames)
      setScanned(true)
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setScanning(false)
    }
  }

  function toggleModel(name: string) {
    setSelectedModels(
      selectedModels.includes(name)
        ? selectedModels.filter((x) => x !== name)
        : [...selectedModels, name],
    )
  }

  const loadedImages = [image1, image2, image3, image4].filter(Boolean)
  const numTests = loadedImages.length > 1 ? loadedImages.length + 1 : 3
  const canStart = selectedModels.length > 0 && prompt.trim().length > 0 && !!image1 && !!image2

  // Build test description
  const testDesc = loadedImages.length > 0
    ? loadedImages.map((_, i) => `Test ${i + 1} → Image ${i + 1}`).join(' · ') +
      ` · Test ${loadedImages.length + 1} → all`
    : 'Upload at least 2 images to start'

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

          {/* Prerequisites banner with live health dots */}
          <div className="glass rounded-xl px-4 py-3 mb-4 flex gap-6 flex-wrap fade-up items-center" style={{ animationDelay: '0.02s' }}>
            <span className="text-slate-500 text-xs">Services:</span>
            <div className="flex items-center gap-2 text-xs">
              <ServiceDot ok={ollamaOk} checking={healthChecking} />
              <span className={ollamaOk ? 'text-slate-300' : 'text-slate-500'}>Ollama</span>
              <code className="text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">localhost:11434</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <ServiceDot ok={backendOk} checking={healthChecking} />
              <span className={backendOk ? 'text-slate-300' : 'text-slate-500'}>Python backend</span>
              <code className="text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">cd backend &amp;&amp; uvicorn main:app --port 8002</code>
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
              <div className="flex items-center gap-3 text-xs">
                {scanned && availableModels.length > 0 && (
                  <>
                    <button
                      onClick={() => setSelectedModels(availableModels.map(m => m.name))}
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
                  </>
                )}
                <button
                  onClick={scanModels}
                  disabled={scanning}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                  title="Refresh models"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'spin-slow' : ''}`} />
                </button>
              </div>
            </div>

            {scanning && !scanned && (
              <div className="glass rounded-2xl p-8 text-center">
                <RefreshCw className="w-5 h-5 spin-slow text-violet-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Fetching models from Ollama…</p>
              </div>
            )}

            {!scanning && !scanned && scanError && (
              <div className="glass rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-3">
                  <AlertCircle className="w-4 h-4" />
                  {scanError}
                </div>
                <button onClick={scanModels} className="btn-primary inline-flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
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
                {(() => {
                  const maxSize = Math.max(...availableModels.map(m => m.size || 0), 1)
                  const maxParams = Math.max(...availableModels.map(m => parseParamSize(m.details?.parameter_size)), 1)
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                      {availableModels.map((m, i) => (
                        <ModelCard
                          key={m.name}
                          m={m}
                          selected={selectedModels.includes(m.name)}
                          index={i}
                          onToggle={() => toggleModel(m.name)}
                          maxSize={maxSize}
                          maxParams={maxParams}
                        />
                      ))}
                    </div>
                  )
                })()}
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
              The same prompt is used for all tests. Image placeholders are managed automatically.
            </p>
          </section>

          {/* LLM Parameters */}
          <LlmParamsSection params={llmParams} setParams={setLlmParams} />

          {/* Images — 2×2 grid */}
          <section className="mb-10 fade-up" style={{ animationDelay: '0.15s' }}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Test Images
              <span className="ml-2 text-slate-600 normal-case tracking-normal font-normal">
                (up to 4)
              </span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {(
                [
                  { label: 'Image 1', value: image1, set: setImage1, optional: false },
                  { label: 'Image 2', value: image2, set: setImage2, optional: false },
                  { label: 'Image 3', value: image3, set: setImage3, optional: true },
                  { label: 'Image 4', value: image4, set: setImage4, optional: true },
                ] as const
              ).map(({ label, value, set, optional }) => (
                <div key={label}>
                  <ImageDropzone
                    label={label}
                    value={value}
                    onChange={set}
                    optional={optional}
                  />
                  {value && (
                    <button
                      onClick={() => set(null)}
                      className="mt-1.5 text-[10px] text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              {testDesc}
            </p>
          </section>

          {/* Session name */}
          <section className="mb-6 fade-up" style={{ animationDelay: '0.18s' }}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Test Name
              <span className="normal-case tracking-normal font-normal text-xs text-slate-600">optional</span>
            </h2>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g. llava comparison temp=0.7…"
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-slate-200
                placeholder:text-slate-600 outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
          </section>

          {/* Start */}
          <div className="fade-up flex items-center justify-between" style={{ animationDelay: '0.2s' }}>
            <div className="text-sm text-slate-500">
              {canStart ? (
                <span className="text-emerald-400">
                  ✓ {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} ·{' '}
                  {selectedModels.length * numTests} total tests
                  {previousResults.length > 0 && (
                    <span className="text-violet-400 ml-2">
                      + {previousResults.length} resumed
                    </span>
                  )}
                </span>
              ) : (
                <span>Select models, write a prompt, and upload at least 2 images to start</span>
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
                onRename={(name) => onRenameSession(session.id, name)}
                onDelete={() => onDeleteSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

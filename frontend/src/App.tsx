import { useState, useEffect } from 'react'
import SetupPage from './pages/SetupPage'
import TestingPage from './pages/TestingPage'
import ResultsPage from './pages/ResultsPage'
import type { AppPage, ImageData, ModelResult, Evaluation, Session, LlmParams } from './types'
import { DEFAULT_LLM_PARAMS } from './types'
import { v4 as uuidv4 } from './uuid'

const DEFAULT_PROMPT =
  'Describe in detail everything you see in this image. List all objects, people, animals, colors, text, and spatial relationships. Be thorough and precise.'

const STORAGE_KEY = 'ollama-tester-v1'
const SESSIONS_KEY = 'ollama-tester-sessions-v1'
const MAX_SESSIONS = 20

function loadSaved(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadSessions(): Session[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]') as Session[]
    return raw.map(s => s.status === 'running' ? { ...s, status: 'partial' as const } : s)
  } catch {
    return []
  }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 5)))
    } catch { /* ignore */ }
  }
}

export function numTestsForSession(session: Session): number {
  const names = [session.image1Name, session.image2Name, session.image3Name, session.image4Name].filter(Boolean)
  const imageCount = names.length
  return imageCount > 1 ? imageCount + 1 : 3
}

export default function App() {
  const saved = loadSaved()
  const [page, setPage] = useState<AppPage>('setup')
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions())

  const [selectedModels, setSelectedModels] = useState<string[]>(
    (saved.selectedModels as string[]) || [],
  )
  const [prompt, setPrompt] = useState<string>(
    (saved.prompt as string) || DEFAULT_PROMPT,
  )
  const [image1, setImage1] = useState<ImageData | null>(
    (saved.image1 as ImageData) || null,
  )
  const [image2, setImage2] = useState<ImageData | null>(
    (saved.image2 as ImageData) || null,
  )
  const [image3, setImage3] = useState<ImageData | null>(
    (saved.image3 as ImageData) || null,
  )
  const [image4, setImage4] = useState<ImageData | null>(
    (saved.image4 as ImageData) || null,
  )
  const [llmParams, setLlmParams] = useState<LlmParams>(
    (saved.llmParams as LlmParams) || DEFAULT_LLM_PARAMS,
  )
  const [testResults, setTestResults] = useState<ModelResult[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [previousResults, setPreviousResults] = useState<ModelResult[]>([])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedModels, prompt, image1, image2, image3, image4, llmParams }))
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedModels, prompt }))
      } catch { /* ignore */ }
    }
  }, [selectedModels, prompt, image1, image2, image3, image4, llmParams])

  function createSession(): string {
    const id = uuidv4()
    const allModels = [
      ...previousResults.map(r => r.model),
      ...selectedModels,
    ]
    const session: Session = {
      id,
      startedAt: Date.now(),
      status: 'running',
      models: allModels,
      prompt,
      image1Name: image1?.name || '',
      image2Name: image2?.name || '',
      image3Name: image3?.name || '',
      image4Name: image4?.name || '',
      results: [...previousResults],
    }
    setSessions(prev => {
      const updated = [session, ...prev].slice(0, MAX_SESSIONS)
      saveSessions(updated)
      return updated
    })
    setActiveSessionId(id)
    return id
  }

  function updateSession(id: string, results: ModelResult[], status: Session['status']) {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, results, status } : s)
      saveSessions(updated)
      return updated
    })
  }

  function handleStartTest() {
    createSession()
    setPage('testing')
  }

  function handleTestComplete(newResults: ModelResult[]) {
    setTestResults([...previousResults, ...newResults])
    setEvaluations([])
    setPreviousResults([])
    setPage('results')
  }

  function handleTestingBack() {
    if (activeSessionId) {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === activeSessionId && s.status === 'running'
            ? { ...s, status: 'partial' as const }
            : s
        )
        saveSessions(updated)
        return updated
      })
    }
    setPage('setup')
  }

  function handleNewTest() {
    setTestResults([])
    setEvaluations([])
    setPage('setup')
  }

  function handleViewSession(session: Session) {
    if (session.results.length === 0) return
    setTestResults(session.results)
    setEvaluations([])
    setPage('results')
  }

  function handleResumeSession(session: Session) {
    const numTests = numTestsForSession(session)
    const doneModels = new Set(
      session.results.filter(r => r.tests.length === numTests).map(r => r.model)
    )
    const remaining = session.models.filter(m => !doneModels.has(m))
    const done = session.results.filter(r => r.tests.length === numTests)

    setPrompt(session.prompt)
    setSelectedModels(remaining.length > 0 ? remaining : session.models)
    setPreviousResults(done)
  }

  if (page === 'setup') {
    return (
      <SetupPage
        selectedModels={selectedModels}
        setSelectedModels={setSelectedModels}
        prompt={prompt}
        setPrompt={setPrompt}
        image1={image1}
        setImage1={setImage1}
        image2={image2}
        setImage2={setImage2}
        image3={image3}
        setImage3={setImage3}
        image4={image4}
        setImage4={setImage4}
        onStart={handleStartTest}
        sessions={sessions}
        onViewSession={handleViewSession}
        onResumeSession={handleResumeSession}
        previousResults={previousResults}
        onClearPrevious={() => setPreviousResults([])}
        llmParams={llmParams}
        setLlmParams={setLlmParams}
      />
    )
  }

  if (page === 'testing') {
    return (
      <TestingPage
        models={selectedModels}
        prompt={prompt}
        image1={image1!}
        image2={image2!}
        image3={image3}
        image4={image4}
        onComplete={handleTestComplete}
        onBack={handleTestingBack}
        sessionId={activeSessionId!}
        onSessionUpdate={updateSession}
        llmParams={llmParams}
      />
    )
  }

  return (
    <ResultsPage
      results={testResults}
      prompt={prompt}
      image1={image1}
      image2={image2}
      evaluations={evaluations}
      setEvaluations={setEvaluations}
      onNewTest={handleNewTest}
    />
  )
}

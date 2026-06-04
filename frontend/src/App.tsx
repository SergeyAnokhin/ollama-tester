import { useState, useEffect } from 'react'
import SetupPage from './pages/SetupPage'
import TestingPage from './pages/TestingPage'
import ResultsPage from './pages/ResultsPage'
import type { AppPage, ImageData, ModelResult, Evaluation } from './types'

const DEFAULT_PROMPT =
  'Describe in detail everything you see in this image. List all objects, people, animals, colors, text, and spatial relationships. Be thorough and precise.'

const STORAGE_KEY = 'ollama-tester-v1'

function loadSaved(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const saved = loadSaved()
  const [page, setPage] = useState<AppPage>('setup')

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

  const [testResults, setTestResults] = useState<ModelResult[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])

  // Persist config to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selectedModels, prompt, image1, image2 }),
      )
    } catch {
      // localStorage quota (large images) — save without images
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ selectedModels, prompt }),
        )
      } catch {
        // ignore
      }
    }
  }, [selectedModels, prompt, image1, image2])

  function handleStartTest() {
    setPage('testing')
  }

  function handleTestComplete(results: ModelResult[]) {
    setTestResults(results)
    setEvaluations([])
    setPage('results')
  }

  function handleNewTest() {
    setTestResults([])
    setEvaluations([])
    setPage('setup')
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
        onStart={handleStartTest}
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
        onComplete={handleTestComplete}
        onBack={() => setPage('setup')}
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

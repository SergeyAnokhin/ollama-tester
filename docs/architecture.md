# Architecture

Ollama Vision Tester is a React + FastAPI app. The frontend runs on port 5173, the backend on port 8002. Vite proxies `/api` to the backend. The core interaction is a WebSocket (`/ws/test`) that streams Ollama inference token-by-token.

---

## File Map

```
backend/
  main.py             FastAPI app, WebSocket handler, Ollama client, psutil stats

frontend/src/
  App.tsx             Root state, page routing, session CRUD, localStorage persistence
  types.ts            All shared TypeScript interfaces (Session, LlmParams, ModelResult…)
  uuid.ts             UUID v4 utility
  pages/
    SetupPage.tsx     Model scan (auto on mount), prompt, images, LLM params, session name, history sidebar
    TestingPage.tsx   WebSocket connection, live chart, system stats, pause/resume/stop
    ResultsPage.tsx   Duration chart, response browser, export JSON, Gemini eval, import eval
```

---

## State & Data Flow

All state lives in `App.tsx` and is passed down as props. No external store.

```
SetupPage  →  (onStart)  →  TestingPage  →  (onComplete)  →  ResultsPage
                                  ↓
                          onSessionUpdate (saves partial results to localStorage)
```

**Page transition trigger:** `App.tsx` `page` state (`'setup' | 'testing' | 'results'`).

**Session history** lives in `sessions: Session[]` in App — persisted to `localStorage['ollama-tester-sessions-v1']`. Max 20 entries. Sessions get `status: 'partial'` when app reopens with an interrupted run.

**Setup state** (models, prompt, images, llmParams, sessionName) persisted to `localStorage['ollama-tester-v1']`. On mount, SetupPage auto-scans models and restores the saved selection (filtering out any models no longer available); if none match, all are selected.

---

## Session Lifecycle

```
createSession()          called in handleStartTest → adds to sessions[], sets activeSessionId
updateSession()          called from TestingPage during run → updates results + status in sessions[]
renameSession()          called from SessionCard pencil button → updates name in sessions[]
```

`Session` fields (see `types.ts:Session`):
- `name?` — optional user label, editable inline in history sidebar
- `llmParams?` — parameters snapshot at run time, shown as compact summary in history card
- `status` — `running | complete | stopped | partial`

---

## WebSocket Protocol (`/ws/test`)

**Client → Server** (one message on connect):
```json
{
  "sessionId": "uuid",
  "models": ["llava:7b"],
  "prompt": "...",
  "image1": "data:image/jpeg;base64,...",
  "image2": "...",
  "llmParams": { "num_thread": null, "num_ctx": 2048, "num_predict": -1, "keep_alive": "5m", "temperature": 0.7 }
}
```

**Server → Client** (streaming):
| type | payload |
|------|---------|
| `model_start` | `{model}` |
| `test_start` | `{model, testNum}` |
| `test_token` | `{model, testNum, preview}` (last 400 chars) |
| `test_complete` | `{model, testNum, duration, response}` |
| `system_stats` | `{cpu, memPercent, memUsedGb, memTotalGb, ollamaCpu, ollamaMemMb}` every 2s |
| `all_complete` | `{results}` |
| `error` | `{message}` |
| `paused` / `resumed` / `stopping` | control acks |

**Client → Server** (control, after connect):
```json
{ "action": "pause" | "resume" | "stop" }
```

---

## Test Structure

Number of tests depends on images uploaded:
- 2 images → 3 tests: img1, img2, img1+img2
- 3 images → 4 tests: img1, img2, img3, all
- 4 images → 5 tests: img1, img2, img3, img4, all

The final test always sends all uploaded images together. Backend builds the test list from image keys present in the payload.

---

## LLM Parameters (`LlmParams` in `types.ts`)

| Field | Ollama option | Default |
|-------|--------------|---------|
| `num_thread` | `options.num_thread` | null (auto) |
| `num_ctx` | `options.num_ctx` | null (model default) |
| `num_predict` | `options.num_predict` | null (-1 unlimited) |
| `keep_alive` | top-level `keep_alive` field | `""` (Ollama default 5m) |
| `temperature` | `options.temperature` | null (model default) |

Null values are omitted from the Ollama request so the model defaults apply.

---

## Backend REST Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Returns `{backend: true, ollama: bool}` |
| `GET /api/models` | Lists all Ollama models with `has_vision`, `has_thinking`, `context_length`, `details` |
| `GET /api/results/{session_id}` | In-memory session results (lost on server restart) |

---

## Storage Keys (localStorage)

| Key | Contents |
|-----|---------|
| `ollama-tester-v1` | Setup state: selectedModels, prompt, image1–4, llmParams, sessionName |
| `ollama-tester-sessions-v1` | Session history array (max 20), includes name + llmParams snapshot |
| `ollama-tester-gemini-key` | Gemini API key (ResultsPage) |

---

## Where to Make Common Changes

| Task | File(s) |
|------|---------|
| Add/change LLM parameter | `types.ts:LlmParams`, `SetupPage.tsx:PARAM_DEFS`, `backend/main.py` options mapping |
| Add a new test type | `backend/main.py` test loop, `TestingPage.tsx:getTestDefs`, `ResultsPage.tsx:getTestMeta` |
| Change session card appearance | `SetupPage.tsx:SessionCard` |
| Change results chart | `ResultsPage.tsx:durationChartData` + BarChart JSX |
| Change evaluation prompt | `ResultsPage.tsx:buildEvaluationPrompt` |
| Change WebSocket message handling | `TestingPage.tsx` ws.onmessage handler |
| Add field to session history | `types.ts:Session`, `App.tsx:createSession`, `SetupPage.tsx:SessionCard` |
| Add export field | `ResultsPage.tsx:handleExport` |
| Change rating behaviour | `types.ts:TestResult.rating`, `App.tsx:handleRateTest`, `ResultsPage.tsx:ModelResponseCard` + chart `Cell` |

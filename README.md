# Ollama Vision Tester

Benchmark local Ollama vision models with image prompts.  
Each model runs **3 sequential tests**: Image 1 → Image 2 → Both images.  
Watch results build live in an animated chart, then export + compare with external LLMs.

## Quick Start

```powershell
# Windows — opens two terminal windows
.\start.ps1
```

Then open **http://localhost:5173** in your browser.

---

## Manual Start

**Backend** (Python 3.10+, in one terminal):
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (Node 18+, in another terminal):
```bash
cd frontend
npm install
npm run dev
```

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| [Ollama](https://ollama.com) | Must be running locally (`ollama serve`) |
| Vision model | e.g. `ollama pull llava` or `ollama pull moondream` |
| Python 3.10+ | For the FastAPI backend |
| Node.js 18+ | For the React frontend |

---

## How It Works

1. **Setup** — Scan your Ollama models, select which to test, write your prompt, upload 2 images
2. **Testing** — Each model runs 3 tests sequentially (avoids resource contention):
   - Test 1: prompt + Image 1
   - Test 2: prompt + Image 2
   - Test 3: prompt + Image 1 & Image 2
3. **Results** — Animated bar charts show response times per model/test. Expand each model to read its full responses.
4. **Evaluation** — Export results as JSON (includes a ready-made prompt for an external LLM to score accuracy). Import the JSON score from Claude / GPT-4o / Gemini to add comparison charts.

---

## Architecture

```
backend/
  main.py          FastAPI + WebSocket server, Ollama client, psutil stats
  requirements.txt

frontend/
  src/
    pages/
      SetupPage.tsx    Model selection, prompt editor, image upload
      TestingPage.tsx  Live WebSocket monitor, animated chart, system stats
      ResultsPage.tsx  Bar charts, response browser, export, evaluation import
    types.ts
    App.tsx
```

The backend streams Ollama responses token-by-token over a WebSocket, sending system resource stats every 2 seconds. The frontend updates the chart in real time as each test completes.

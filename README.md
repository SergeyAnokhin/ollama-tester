# Ollama Vision Tester

Benchmark local Ollama vision models with image prompts.  
Each model runs sequential tests (one per image + a final combined test).  
Watch results build live in an animated chart, then export + compare with external LLMs.

---

## Quick Start

```bash
# any shell (bash, PowerShell, cmd) — logs from both servers in one terminal
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Platform Setup

### Windows

**Requirements:** [Ollama](https://ollama.com/download), Python 3.10+, Node.js 18+

```powershell
# 1. Install Ollama (download installer from https://ollama.com/download)
# 2. Pull a vision model
ollama pull llava

# 3. Clone the repo
git clone https://github.com/YOUR_USERNAME/ollama-tester.git
cd ollama-tester

# 4. Install root dependencies and start everything
npm install
npm run dev
```

Or start manually in two terminals:

```powershell
# Terminal 1 — backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

---

### Linux (Ubuntu / Debian / Fedora)

**Requirements:** curl, Python 3.10+, Node.js 18+

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start Ollama service
ollama serve &   # or: sudo systemctl start ollama

# 3. Pull a vision model
ollama pull llava

# 4. Install Python dependencies
sudo apt install python3-pip python3-venv   # Debian/Ubuntu
# sudo dnf install python3-pip              # Fedora

# 5. Install Node.js 18+ (if not present)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 6. Clone and run
git clone https://github.com/YOUR_USERNAME/ollama-tester.git
cd ollama-tester
npm install
npm run dev
```

Or start manually:

```bash
# Terminal 1 — backend (use a venv to avoid conflicts)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

---

### Raspberry Pi (ARM64 / ARMv7)

Raspberry Pi 5 or Pi 4 with 8 GB RAM recommended (vision models are large).

```bash
# 1. Install Ollama (ARM build)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start Ollama
ollama serve &

# 3. Pull a small vision model (llava is heavy; moondream is lighter)
ollama pull moondream
# For Pi 5 with 8GB: ollama pull llava:7b

# 4. Install Python 3.10+ and Node.js 18+
sudo apt update
sudo apt install -y python3-pip python3-venv

# Node.js 20 for ARM
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 5. Clone and run
git clone https://github.com/YOUR_USERNAME/ollama-tester.git
cd ollama-tester

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 &

cd ../frontend
npm install
npm run dev -- --host 0.0.0.0   # expose on LAN so you can open from another device
```

Open **http://raspberrypi.local:5173** (or the Pi's IP address) from any device on the same network.

> **Note:** Without a GPU, inference is slow on Pi. Expect 30–120 seconds per test with moondream, longer with llava.

---

### macOS

```bash
# 1. Install Ollama (download from https://ollama.com/download or via Homebrew)
brew install ollama
ollama serve &

# 2. Pull a vision model
ollama pull llava

# 3. Install Node.js (if not present)
brew install node

# 4. Clone and run
git clone https://github.com/YOUR_USERNAME/ollama-tester.git
cd ollama-tester
npm install
npm run dev
```

---

## Requirements Summary

| Requirement | Notes |
|-------------|-------|
| [Ollama](https://ollama.com) | Running locally (`ollama serve`) on port 11434 |
| Vision model | `ollama pull llava` · `ollama pull moondream` · `ollama pull minicpm-v` |
| Python 3.10+ | For the FastAPI backend |
| Node.js 18+ | For the React frontend |

---

## How It Works

1. **Setup** — Scan your Ollama models, select which to test, write your prompt, upload 2–4 images
2. **Testing** — Each model runs tests sequentially (avoids resource contention):
   - Test 1: prompt + Image 1
   - Test 2: prompt + Image 2
   - Test 3: prompt + Image 3 *(if uploaded)*
   - Test 4: prompt + Image 4 *(if uploaded)*
   - Last test: prompt + **all uploaded images**
3. **Results** — Animated bar charts show response times per model/test. Expand each model to read its full responses.
4. **Evaluation** — Export results as JSON (includes a ready-made prompt for an external LLM to score accuracy). Import the JSON score from Claude / GPT-4o / Gemini to add comparison charts. Or use the built-in Gemini auto-evaluate.

---

## Documentation

| Doc | What's inside |
|-----|--------------|
| [docs/architecture.md](docs/architecture.md) | File map, state flow, session lifecycle, WebSocket protocol, storage keys, where to make common changes |

---

## Architecture

```
backend/
  main.py          FastAPI + WebSocket server, Ollama client, psutil stats
  requirements.txt

frontend/
  src/
    pages/
      SetupPage.tsx    Model selection, prompt editor, image upload, LLM params, session name, history
      TestingPage.tsx  Live WebSocket monitor, animated chart, system stats
      ResultsPage.tsx  Bar charts, response browser, export, evaluation import
    App.tsx          Root state, page routing, session CRUD
    types.ts         All shared interfaces
  public/
    favicon.svg      App icon
```

The backend streams Ollama responses token-by-token over a WebSocket, sending system resource stats every 2 seconds. The frontend updates the chart in real time as each test completes. Service health (Ollama + backend) is checked every 10 seconds and shown as animated status dots in the header.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Python backend не запущен" | Run `cd backend && uvicorn main:app --port 8001` |
| Ollama dot is grey/blinking | Make sure `ollama serve` is running |
| Model returns error | Only vision models work (llava, moondream, minicpm-v, bakllava) |
| Slow inference on Pi | Use `moondream` (800MB) instead of `llava:7b` (4GB+) |
| Port 8001 already in use | Kill existing process or change port in `vite.config.ts` and backend command |

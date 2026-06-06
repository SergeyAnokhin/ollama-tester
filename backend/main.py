from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx
import psutil
import asyncio
import json
import time
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE = "http://localhost:11434"
sessions: dict[str, dict] = {}


@app.get("/api/health")
async def health():
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass
    return {"backend": True, "ollama": ollama_ok}


def _parse_capabilities(show: dict) -> dict:
    model_info = show.get("model_info", {})

    # Newer Ollama (≥0.6) exposes capabilities directly — use it when available
    capabilities = show.get("capabilities", [])
    if capabilities:
        has_vision = "vision" in capabilities
        has_thinking = "thinking" in capabilities
    else:
        # Fallback for older Ollama: infer from model_info keys and template
        details = show.get("details", {})
        families = details.get("families", [])
        primary = details.get("family", "").lower()
        non_primary = [f for f in families if f.lower() != primary]
        has_vision = bool(non_primary) or any(
            any(vk in key.lower() for vk in ("clip.", ".vision.", "image_size", "image_mean", "patch_count"))
            for key in model_info
        )
        t = show.get("template", "").lower()
        has_thinking = "<think>" in t or ".thinking" in t or "{{if .thinking}}" in t

    # Context length — architecture-agnostic
    context_length: int | None = None
    for key, val in model_info.items():
        if key.endswith(".context_length"):
            context_length = val
            break

    return {"has_vision": has_vision, "has_thinking": has_thinking, "context_length": context_length}


async def _show_model(name: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/show", json={"name": name})
            return r.json()
    except Exception:
        return {}


@app.get("/api/models")
async def list_models():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            raw_models = r.json().get("models", [])

        shows = await asyncio.gather(*[_show_model(m["name"]) for m in raw_models])

        return {
            "models": [
                {
                    "name": m["name"],
                    "size": m.get("size", 0),
                    "details": m.get("details", {}),
                    **_parse_capabilities(show),
                }
                for m, show in zip(raw_models, shows)
            ]
        }
    except Exception as e:
        return {"models": [], "error": str(e)}


def _collect_stats() -> dict:
    cpu = psutil.cpu_percent()
    mem = psutil.virtual_memory()
    ollama_cpu = 0.0
    ollama_mem = 0

    for proc in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
        try:
            if "ollama" in (proc.info["name"] or "").lower():
                ollama_cpu += proc.info["cpu_percent"] or 0
                mi = proc.info["memory_info"]
                if mi:
                    ollama_mem += mi.rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    return {
        "type": "system_stats",
        "cpu": round(cpu, 1),
        "memPercent": round(mem.percent, 1),
        "memUsedGb": round(mem.used / 1024**3, 1),
        "memTotalGb": round(mem.total / 1024**3, 1),
        "ollamaCpu": round(ollama_cpu, 1),
        "ollamaMemMb": round(ollama_mem / 1024**2, 1),
    }


async def _stats_sender(ws: WebSocket, done: asyncio.Event):
    psutil.cpu_percent()
    await asyncio.sleep(0.5)
    while not done.is_set():
        try:
            await ws.send_json(_collect_stats())
        except Exception:
            return
        await asyncio.sleep(2)


def _parse_keep_alive(val: str):
    try:
        return int(val)
    except (ValueError, TypeError):
        return val


_KEEP_META = {
    "model", "created_at", "done_reason",
    "total_duration", "load_duration",
    "prompt_eval_count", "prompt_eval_duration",
    "eval_count", "eval_duration",
}


async def _run_generate(
    model: str,
    prompt: str,
    images: list[str],
    ws: WebSocket,
    test_num: int,
    llm_params: dict | None = None,
) -> tuple[float, str, dict]:
    payload: dict = {"model": model, "prompt": prompt, "images": images, "stream": True}

    options: dict = {}
    if llm_params:
        for key in ("num_thread", "num_ctx", "num_predict", "temperature"):
            val = llm_params.get(key)
            if val is not None:
                options[key] = val
        keep_alive_raw = llm_params.get("keep_alive", "")
        if keep_alive_raw not in (None, ""):
            payload["keep_alive"] = _parse_keep_alive(str(keep_alive_raw))

    if options:
        payload["options"] = options

    param_parts = [f"{k}={v}" for k, v in options.items()]
    if "keep_alive" in payload:
        param_parts.append(f"keep_alive={payload['keep_alive']!r}")
    param_str = ", ".join(param_parts) if param_parts else "Ollama defaults"
    print(f"[{model}] Test {test_num} | params: {param_str}", flush=True)

    start = time.monotonic()
    tokens: list[str] = []
    raw_meta: dict = {}

    async with httpx.AsyncClient(timeout=httpx.Timeout(600)) as client:
        async with client.stream(
            "POST", f"{OLLAMA_BASE}/api/generate", json=payload
        ) as resp:
            async for raw in resp.aiter_lines():
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                token = obj.get("response", "")
                if token:
                    tokens.append(token)
                    elapsed = time.monotonic() - start
                    try:
                        await ws.send_json(
                            {
                                "type": "test_token",
                                "model": model,
                                "testNum": test_num,
                                "elapsed": round(elapsed, 1),
                                "preview": "".join(tokens)[-400:],
                            }
                        )
                    except Exception:
                        pass
                if obj.get("done"):
                    raw_meta = {k: v for k, v in obj.items() if k in _KEEP_META}
                    break

    return round(time.monotonic() - start, 2), "".join(tokens), raw_meta


async def _unload_model(model: str) -> None:
    """Tell Ollama to immediately evict the model from memory."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": model, "keep_alive": 0},
            )
    except Exception:
        pass


@app.websocket("/ws/test")
async def ws_test(ws: WebSocket):
    await ws.accept()
    done_event = asyncio.Event()

    # Pause/stop control events
    # paused_event SET   = running normally
    # paused_event CLEAR = paused, waiting for resume
    paused_event = asyncio.Event()
    paused_event.set()
    stop_event = asyncio.Event()

    # Receive initial config first, then start control listener
    try:
        cfg = await ws.receive_json()
    except Exception:
        return

    current_task: list[asyncio.Task] = []  # holds the active _run_generate task

    async def _listen_controls() -> None:
        """Receives pause/resume/stop messages from client while tests run."""
        while not done_event.is_set():
            try:
                msg = await ws.receive_json()
                action = msg.get("action", "")
                if action == "pause":
                    paused_event.clear()
                    await ws.send_json({"type": "paused"})
                elif action == "resume":
                    paused_event.set()
                    await ws.send_json({"type": "resumed"})
                elif action == "stop":
                    stop_event.set()
                    paused_event.set()  # unblock if currently paused
                    if current_task:
                        current_task[0].cancel()  # abort running Ollama request
                    await ws.send_json({"type": "stopping"})
            except Exception:
                break

    control_task = asyncio.create_task(_listen_controls())

    try:
        models: list[str] = cfg["models"]
        prompt: str = cfg["prompt"]
        img1: str = cfg["image1"].split(",", 1)[-1]
        img2: str = cfg["image2"].split(",", 1)[-1]
        img3_raw: str = cfg.get("image3", "")
        img4_raw: str = cfg.get("image4", "")
        img3: str = img3_raw.split(",", 1)[-1] if img3_raw else ""
        img4: str = img4_raw.split(",", 1)[-1] if img4_raw else ""
        llm_params: dict | None = cfg.get("llmParams")

        loaded_images = [img1, img2] + ([img3] if img3 else []) + ([img4] if img4 else [])
        all_label = "Image 1 + 2" if len(loaded_images) == 2 else "All images"
        test_defs = [
            (1, [loaded_images[0]], "Image 1"),
            (2, loaded_images, all_label),
        ]

        sid = str(uuid.uuid4())
        await ws.send_json({"type": "session_started", "sessionId": sid})

        asyncio.create_task(_stats_sender(ws, done_event))

        all_results: list[dict] = []

        for idx, model in enumerate(models):
            # Check pause/stop before starting each model
            await paused_event.wait()
            if stop_event.is_set():
                break

            await ws.send_json(
                {
                    "type": "model_start",
                    "model": model,
                    "modelIndex": idx,
                    "totalModels": len(models),
                    "totalTests": len(test_defs),
                }
            )

            model_tests: list[dict] = []
            model_stopped = False
            for test_num, images, desc in test_defs:
                # Check pause/stop before each individual test
                await paused_event.wait()
                if stop_event.is_set():
                    model_stopped = True
                    break

                await ws.send_json(
                    {
                        "type": "test_start",
                        "model": model,
                        "testNum": test_num,
                        "description": desc,
                    }
                )

                task = asyncio.create_task(
                    _run_generate(model, prompt, images, ws, test_num, llm_params)
                )
                current_task.clear()
                current_task.append(task)
                raw_meta: dict = {}
                try:
                    duration, response, raw_meta = await task
                except asyncio.CancelledError:
                    # Stop was pressed: kill Ollama model and exit immediately
                    asyncio.create_task(_unload_model(model))
                    model_stopped = True
                    break
                except Exception as exc:
                    duration, response = 0.0, f"Error: {exc}"
                finally:
                    current_task.clear()

                print(
                    f"[{model}] Test {test_num} done | tokens in={raw_meta.get('prompt_eval_count', '?')} "
                    f"out={raw_meta.get('eval_count', '?')} reason={raw_meta.get('done_reason', '?')}",
                    flush=True,
                )

                await ws.send_json(
                    {
                        "type": "test_complete",
                        "model": model,
                        "testNum": test_num,
                        "totalTests": len(test_defs),
                        "duration": duration,
                        "response": response,
                        "rawMeta": raw_meta,
                    }
                )
                model_tests.append(
                    {
                        "testNum": test_num,
                        "description": desc,
                        "duration": duration,
                        "response": response,
                        "rawMeta": raw_meta,
                    }
                )

            if model_tests:
                all_results.append({"model": model, "tests": model_tests})

            if model_stopped or stop_event.is_set():
                break

        done_event.set()
        was_stopped = stop_event.is_set()

        sessions[sid] = {
            "id": sid,
            "prompt": prompt,
            "models": models,
            "results": all_results,
        }
        await ws.send_json(
            {
                "type": "all_complete",
                "sessionId": sid,
                "results": all_results,
                "stopped": was_stopped,
            }
        )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        done_event.set()
        control_task.cancel()


@app.get("/api/results/{session_id}")
async def get_results(session_id: str):
    if session_id not in sessions:
        return {"error": "not found"}
    return sessions[session_id]

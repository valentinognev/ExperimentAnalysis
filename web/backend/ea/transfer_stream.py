import asyncio
import json
import queue
import threading

from fastapi.responses import StreamingResponse
from starlette.requests import Request

_WAITING = object()
_END = object()


def ndjson_stream(request: Request, factory):
    cancelled = threading.Event()

    async def agen():
        work: queue.Queue = queue.Queue()

        def worker():
            try:
                for event in factory(cancelled.is_set):
                    work.put(event)
            except Exception as exc:
                work.put({"event": "error", "ok": False, "error": str(exc)})
            finally:
                work.put(_END)

        threading.Thread(target=worker, daemon=True).start()
        loop = asyncio.get_event_loop()

        def pull():
            try:
                return work.get(timeout=0.1)
            except queue.Empty:
                return _WAITING

        while True:
            if await request.is_disconnected():
                cancelled.set()
            item = await loop.run_in_executor(None, pull)
            if item is _WAITING:
                continue
            if item is _END:
                break
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(
        agen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )

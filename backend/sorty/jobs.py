"""Background jobs the API polls for progress.

Generation, dedup, training, and inference block for a while. Each runs on a worker
thread and reports progress through a JobProgress the API reads by job id. State is
guarded by a lock since the worker writes it and request handlers read it.
"""

from __future__ import annotations

import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, Literal

JobStatus = Literal["running", "done", "error"]


@dataclass
class JobProgress:
    """A worker's live progress, read by the API under the job lock.

    sync sets all three counters at once, matching the callback p2d's pipeline expects.
    """

    _lock: threading.Lock
    total: int = 0
    done: int = 0
    message: str = ""

    def sync(self, total: int, done: int, message: str) -> None:
        with self._lock:
            self.total = total
            self.done = done
            self.message = message

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {"total": self.total, "done": self.done, "message": self.message}


@dataclass
class Job:
    job_id: str
    status: JobStatus
    progress: JobProgress
    result: Any = None
    error: str | None = None

    def view(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.job_id,
            "status": self.status,
            "progress": self.progress.snapshot(),
        }
        if self.status == "done":
            out["result"] = self.result
        elif self.status == "error":
            out["error"] = self.error
        return out


class JobManager:
    """Owns the worker pool and the live job table.

    submit(fn, to_result) runs fn(progress) on a worker and stores its return value,
    mapped through to_result into something JSON-able for the API.
    """

    def __init__(self, max_workers: int = 2) -> None:
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def submit(
        self,
        fn: Callable[[JobProgress], Any],
        to_result: Callable[[Any], Any] = lambda r: r,
    ) -> str:
        job_id = uuid.uuid4().hex[:12]
        job = Job(job_id=job_id, status="running", progress=JobProgress(_lock=threading.Lock()))
        with self._lock:
            self._jobs[job_id] = job

        def run() -> None:
            try:
                raw = fn(job.progress)
                job.result = to_result(raw)
                job.status = "done"
            except Exception as exc:
                job.error = f"{type(exc).__name__}: {exc}"
                job.status = "error"
                traceback.print_exc()

        self._pool.submit(run)
        return job_id

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

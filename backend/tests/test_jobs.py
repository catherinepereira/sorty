from __future__ import annotations

import threading
import time

from sorty.jobs import Job, JobManager, JobProgress


def _wait(mgr: JobManager, job_id: str, timeout: float = 2.0):
    """Poll until the job leaves the running state, as the API does."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = mgr.get(job_id)
        if job and job.status != "running":
            return job
        time.sleep(0.01)
    raise AssertionError("job did not finish in time")


def test_job_runs_and_reports_result():
    mgr = JobManager()

    def work(p: JobProgress):
        p.sync(2, 1, "halfway")
        return {"count": 7}

    job_id = mgr.submit(work)
    job = _wait(mgr, job_id)
    view = job.view()
    assert view["status"] == "done"
    assert view["result"] == {"count": 7}
    assert view["progress"] == {"total": 2, "done": 1, "message": "halfway"}


def test_to_result_maps_the_return_value():
    mgr = JobManager()
    job_id = mgr.submit(lambda p: [1, 2, 3], to_result=len)
    job = _wait(mgr, job_id)
    assert job.view()["result"] == 3


def test_job_captures_an_exception():
    mgr = JobManager()

    def boom(p: JobProgress):
        raise ValueError("nope")

    job = _wait(mgr, mgr.submit(boom))
    view = job.view()
    assert view["status"] == "error"
    assert "ValueError: nope" in view["error"]
    assert "result" not in view


def test_running_job_view_omits_result_and_error():
    started = JobProgress(_lock=threading.Lock())
    job = Job(job_id="x", status="running", progress=started)
    view = job.view()
    assert view["status"] == "running"
    assert "result" not in view and "error" not in view


def test_get_unknown_job_is_none():
    assert JobManager().get("does-not-exist") is None

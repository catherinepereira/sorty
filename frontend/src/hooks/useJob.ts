import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { JobState } from "../types";

const POLL_MS = 700;

/**
 * Track one background job by polling /api/jobs/{id} until it finishes.
 * start(jobId) begins polling, the returned job carries live progress and the
 * terminal result or error. onDone fires once when the job leaves the running state.
 */
export function useJob(onDone?: (job: JobState) => void) {
  const [job, setJob] = useState<JobState | null>(null);
  const timer = useRef<number | null>(null);
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(
    (jobId: string) => {
      stop();
      const tick = async () => {
        let state: JobState;
        try {
          state = await api.job(jobId);
        } catch {
          // the job is gone (server restarted or id expired), stop polling silently
          stop();
          setJob(null);
          return;
        }
        setJob(state);
        if (state.status !== "running") {
          stop();
          doneCb.current?.(state);
        }
      };
      void tick();
      timer.current = window.setInterval(tick, POLL_MS);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  const running = job?.status === "running";
  return { job, start, running, clear: () => setJob(null) };
}

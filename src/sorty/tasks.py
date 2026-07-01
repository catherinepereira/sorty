"""Run blocking work off the event loop while streaming progress to the UI.

Generation, training, and inference all block for a while. Running them in a worker
thread keeps NiceGUI responsive. The worker reports progress through a Progress object
whose updates are marshaled back onto the event loop, so UI callbacks run on the loop
thread where NiceGUI expects them.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Progress:
    """Passed into a worker so it can report step counts and a status line.

    on_update is invoked on the event loop thread after each report.
    """

    _loop: asyncio.AbstractEventLoop
    on_update: Callable[["Progress"], None] | None = None
    total: int = 0
    done: int = 0
    message: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def _flush(self) -> None:
        if self.on_update is not None:
            self._loop.call_soon_threadsafe(self.on_update, self)

    def sync(self, total: int, done: int, message: str) -> None:
        """Set all fields at once and flush, for bridging an external progress source."""
        self.total = total
        self.done = done
        self.message = message
        self._flush()

    def start(self, total: int, message: str = "") -> None:
        self.total = total
        self.done = 0
        self.message = message
        self._flush()

    def advance(self, message: str | None = None, step: int = 1) -> None:
        self.done += step
        if message is not None:
            self.message = message
        self._flush()

    def set_message(self, message: str) -> None:
        self.message = message
        self._flush()


async def run_task(
    fn: Callable[[Progress], Any],
    on_update: Callable[[Progress], None] | None = None,
) -> Any:
    """Run fn(progress) in a worker thread, returning its result.

    on_update fires on the event loop for each progress report while fn runs.
    """
    loop = asyncio.get_running_loop()
    progress = Progress(_loop=loop, on_update=on_update)
    return await asyncio.to_thread(fn, progress)

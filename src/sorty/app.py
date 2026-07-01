"""NiceGUI pages and the app entry point."""

from __future__ import annotations

from pathlib import Path

from nicegui import app, ui

from sorty import APP_NAME, PORT, annotate, classify, generate, recyclebin, workspace
from sorty.ids import slugify
from sorty.state import media_url, register_media, workspace_root
from sorty.tasks import Progress, run_task
from sorty.theme import PALETTE, STATUS_COLORS, apply_base_style, card, mascot

from prompt2dataset.dedup import _find_exact_duplicates, _find_outliers, _apply
from prompt2dataset.ingest import load_dataset, save_dataset
from prompt2dataset.models import Dataset, ReviewStatus

# Images shown per grid page. Caps the element count and websocket payload NiceGUI
# builds per render, which otherwise grows with the whole dataset
PAGE_SIZE = 120


def _header(subtitle: str = "", back_to: str | None = None) -> None:
    with ui.row().classes("w-full items-center gap-3 mb-4"):
        if back_to is not None:
            ui.button(
                icon="arrow_back", on_click=lambda: ui.navigate.to(back_to)
            ).props("flat round")
        mascot("idle", 56)
        with ui.column().classes("gap-0"):
            ui.label(APP_NAME).classes("text-2xl font-bold").style(
                f'color: {PALETTE["text"]}'
            )
            if subtitle:
                ui.label(subtitle).style(f'color: {PALETTE["muted"]}')


# ----- home -----

def _new_dataset_dialog() -> None:
    with ui.dialog() as dialog, card():
        ui.label("New dataset").classes("text-lg font-semibold")
        name = ui.input("Name", placeholder="e.g. Pacific NW birds").classes("w-72")
        prompt = ui.input(
            "Prompt (optional)", placeholder="what the dataset is about"
        ).classes("w-72")

        def create() -> None:
            try:
                workspace.create_dataset(
                    workspace_root(), name.value or "", prompt.value or ""
                )
            except ValueError as exc:
                ui.notify(str(exc), color="negative")
                return
            dialog.close()
            ui.navigate.to(f"/d/{slugify(name.value or '')}")

        with ui.row().classes("w-full justify-end gap-2"):
            ui.button("Cancel", on_click=dialog.close).props("flat")
            ui.button("Create", on_click=create).props("unelevated")
    dialog.open()


def _dataset_card(summary: workspace.DatasetSummary) -> None:
    with card().classes("w-64 cursor-pointer").on(
        "click", lambda: ui.navigate.to(f"/d/{summary.name}")
    ):
        if summary.thumbnail is not None:
            ui.image(media_url(summary.thumbnail)).classes(
                "w-full h-36 object-cover rounded-xl"
            )
        else:
            with ui.element("div").classes(
                "w-full h-36 rounded-xl flex items-center justify-center"
            ).style(f'background-color: {PALETTE["primary_soft"]}'):
                mascot("idle", 64)
        ui.label(summary.name).classes("text-lg font-semibold")
        ui.label(f"{summary.total} images, {summary.subjects} subjects").style(
            f'color: {PALETTE["muted"]}'
        )


@ui.page("/")
def home() -> None:
    apply_base_style()
    _header("your dataset workshop")

    with ui.row().classes("w-full items-center justify-between mb-2"):
        ui.label("Datasets").classes("text-xl font-semibold")
        ui.button("New dataset", icon="add", on_click=_new_dataset_dialog).props(
            "unelevated"
        )

    summaries = workspace.list_datasets(workspace_root())
    if not summaries:
        with card().classes("w-full items-center p-8"):
            mascot("happy", 72)
            ui.label("No datasets yet. Create one to get started.").style(
                f'color: {PALETTE["muted"]}'
            )
        return

    with ui.row().classes("w-full gap-4 flex-wrap"):
        for summary in summaries:
            _dataset_card(summary)


# ----- dataset -----

def _resolve_root(name: str) -> Path | None:
    root = workspace.dataset_root(workspace_root(), name)
    if (root / ".p2d" / "manifest.json").exists():
        return root
    return None


def _generate_dialog(root: Path, on_done) -> None:
    with ui.dialog() as dialog, card().classes("w-96"):
        ui.label("Generate images").classes("text-lg font-semibold")
        prompt = ui.input(
            "Prompt", placeholder="bird species native to the Pacific Northwest"
        ).classes("w-full")
        sources = (
            ui.select(
                generate.source_names(),
                value=["duckduckgo"],
                multiple=True,
                label="Sources",
            )
            .classes("w-full")
            .props("use-chips")
        )
        limit = ui.number("Images per subject", value=20, min=1, max=200).classes(
            "w-full"
        )
        panel = ui.column().classes("w-full")

        async def go() -> None:
            if not prompt.value or not sources.value:
                ui.notify("Enter a prompt and pick a source.", color="warning")
                return
            panel.clear()
            with panel:
                mascot("working", 48)
                status = ui.label("Resolving subjects...").style(
                    f'color: {PALETTE["muted"]}'
                )
                bar = ui.linear_progress(value=0, show_value=False).classes("w-full")

            def on_update(p: Progress) -> None:
                status.text = p.message
                bar.value = p.done / p.total if p.total else 0

            try:
                subjects = await run_task(lambda _p: generate.resolve(prompt.value))
            except generate.OllamaUnavailable as exc:
                ui.notify(str(exc), color="negative", multi_line=True)
                panel.clear()
                return

            if not subjects:
                ui.notify(
                    "The prompt resolved to no subjects. Try describing it differently.",
                    color="warning",
                    multi_line=True,
                )
                panel.clear()
                return

            result = await run_task(
                lambda p: generate.generate(
                    root, subjects, list(sources.value), int(limit.value), p
                ),
                on_update=on_update,
            )
            if result["saved"] == 0 and result["added"] == 0:
                ui.notify("Nothing new to fetch for this prompt.", color="info")
            else:
                ui.notify(
                    f"Saved {result['saved']} images"
                    + (f", {result['failed']} failed" if result["failed"] else ""),
                    color="positive",
                )
            dialog.close()
            on_done()

        with ui.row().classes("w-full justify-end gap-2"):
            ui.button("Cancel", on_click=dialog.close).props("flat")
            ui.button("Generate", on_click=go).props("unelevated")
    dialog.open()


def _annotate_dialog(root: Path, ds: Dataset, item, on_done) -> None:
    with ui.dialog() as dialog, card().classes("w-96"):
        ui.image(media_url(root / item.local_path)).classes(
            "w-full h-56 object-contain rounded-xl"
        )
        subject = ui.input(
            "Subject", value=item.subject or item.label
        ).classes("w-full")
        status = ui.select(
            [s.value for s in ReviewStatus],
            value=item.review_status.value,
            label="Status",
        ).classes("w-full")
        note = ui.textarea("Note", value=item.meta.get("note", "")).classes("w-full")

        def save() -> None:
            annotate.set_label(
                ds, root, item.item_id, subject.value or item.subject or item.label
            )
            annotate.set_status(ds, item.item_id, ReviewStatus(status.value))
            annotate.set_note(ds, item.item_id, note.value or "")
            save_dataset(ds, root)
            dialog.close()
            on_done()

        def delete() -> None:
            recyclebin.delete_to_bin(ds, root, [item.item_id])
            save_dataset(ds, root)
            dialog.close()
            on_done()

        with ui.row().classes("w-full justify-between gap-2"):
            ui.button("Delete", icon="delete", on_click=delete).props("flat color=red")
            with ui.row().classes("gap-2"):
                ui.button("Cancel", on_click=dialog.close).props("flat")
                ui.button("Save", on_click=save).props("unelevated")
    dialog.open()


async def _run_panel(root: Path, title: str, fn, on_done) -> None:
    """Run a background task behind a modal progress panel, then refresh."""
    with ui.dialog() as dialog, card().classes("w-80 items-center"):
        mascot("working", 56)
        ui.label(title).classes("text-lg font-semibold")
        status = ui.label("Working...").style(f'color: {PALETTE["muted"]}')
        bar = ui.linear_progress(value=0, show_value=False).classes("w-full")
    dialog.open()

    def on_update(p: Progress) -> None:
        status.text = p.message
        bar.value = p.done / p.total if p.total else 0

    try:
        result = await run_task(fn, on_update=on_update)
    finally:
        dialog.close()
    on_done(result)


@ui.page("/d/{name}")
def dataset_page(name: str) -> None:
    apply_base_style()
    root = _resolve_root(name)
    if root is None:
        _header("not found", back_to="/")
        ui.label("No such dataset.").style(f'color: {PALETTE["muted"]}')
        return

    _header(name, back_to="/")
    selected: set[str] = set()
    page = {"n": 0}

    @ui.refreshable
    def grid() -> None:
        ds = load_dataset(root)
        items = [i for i in ds.items if not recyclebin.is_binned(i)]
        if not items:
            with card().classes("w-full items-center p-8"):
                mascot("idle", 64)
                ui.label("Empty. Generate some images to begin.").style(
                    f'color: {PALETTE["muted"]}'
                )
            return

        pages = max(1, (len(items) + PAGE_SIZE - 1) // PAGE_SIZE)
        page["n"] = min(page["n"], pages - 1)
        start = page["n"] * PAGE_SIZE
        window = items[start : start + PAGE_SIZE]

        with ui.row().classes("w-full gap-3 flex-wrap"):
            for item in window:
                _grid_card(root, ds, item)

        if pages > 1:
            _pager(len(items), pages)

    def _pager(total: int, pages: int) -> None:
        def step(delta: int) -> None:
            page["n"] = max(0, min(pages - 1, page["n"] + delta))
            grid.refresh()

        with ui.row().classes("w-full items-center justify-center gap-3 mt-2"):
            ui.button(icon="chevron_left", on_click=lambda: step(-1)).props("flat round")
            ui.label(f"Page {page['n'] + 1} of {pages}  ({total} images)").style(
                f'color: {PALETTE["muted"]}'
            )
            ui.button(icon="chevron_right", on_click=lambda: step(1)).props("flat round")

    def _grid_card(root: Path, ds: Dataset, item) -> None:
        with card().classes("w-40 p-2"):
            ui.image(media_url(root / item.local_path)).classes(
                "w-full h-32 object-cover rounded-lg cursor-pointer"
            ).props("loading=lazy").on(
                "click", lambda i=item: _annotate_dialog(root, ds, i, grid.refresh)
            )
            with ui.row().classes("w-full items-center justify-between"):
                cb = ui.checkbox(
                    value=item.item_id in selected,
                    on_change=lambda e, iid=item.item_id: (
                        selected.add(iid) if e.value else selected.discard(iid)
                    ),
                ).props("dense")
                cb.tooltip("Select")
                ui.label(item.subject or item.label).classes("text-xs truncate")
                ui.badge().style(
                    f'background-color: {STATUS_COLORS[item.review_status.value]}'
                ).props("rounded").classes("w-3 h-3 p-0")

    def delete_selected() -> None:
        if not selected:
            ui.notify("Select images first.", color="warning")
            return
        ds = load_dataset(root)
        n = recyclebin.delete_to_bin(ds, root, list(selected))
        save_dataset(ds, root)
        selected.clear()
        ui.notify(f"Moved {n} to the bin.", color="positive")
        grid.refresh()

    def run_clean(kind: str) -> None:
        async def _do() -> None:
            def work(p: Progress):
                ds = load_dataset(root)
                candidates = [
                    i
                    for i in ds.items
                    if not recyclebin.is_binned(i)
                    and (root / i.local_path).exists()
                ]
                p.start(total=1, message=f"Scanning for {kind}...")
                if kind == "duplicates":
                    flagged = _find_exact_duplicates(candidates, root)
                else:
                    flagged = _find_outliers(candidates, root, 0.25)
                _apply(flagged, ds, root, delete=False)
                save_dataset(ds, root)
                p.advance(message="Done")
                return len(flagged)

            await _run_panel(
                root,
                f"Finding {kind}",
                work,
                lambda n: ui.notify(
                    f"Flagged {n} {kind} as invalid.", color="positive"
                )
                or grid.refresh(),
            )

        if kind == "outliers" and not classify.torch_available():
            ui.notify(
                "The outlier pass needs PyTorch. Install prompt2dataset[train].",
                color="warning",
                multi_line=True,
            )
            return
        ui.timer(0, _do, once=True)

    def run_train() -> None:
        if not classify.torch_available():
            ui.notify(
                "Training needs PyTorch. Install prompt2dataset[train].",
                color="warning",
                multi_line=True,
            )
            return

        async def _do() -> None:
            def work(p: Progress):
                ds = load_dataset(root)
                return classify.train(root, ds.items, "mobilenet_v2", 5, 0.2, 224, p)

            await _run_panel(
                root,
                "Training classifier",
                work,
                lambda rep: ui.notify(
                    f"Trained. Accuracy {rep['overall_accuracy']:.0%}.",
                    color="positive",
                ),
            )

        ui.timer(0, _do, once=True)

    def run_classifier() -> None:
        if not classify.torch_available():
            ui.notify("Classifier needs PyTorch.", color="warning")
            return
        if not classify.model_exists(root):
            ui.notify("Train a model first.", color="warning")
            return

        async def _do() -> None:
            def work(p: Progress):
                ds = load_dataset(root)
                return classify.infer_all(root, ds, p)

            await _run_panel(
                root,
                "Running classifier",
                work,
                lambda ms: _show_mismatches(root, ms, grid.refresh),
            )

        ui.timer(0, _do, once=True)

    def run_crossval() -> None:
        if not classify.torch_available():
            ui.notify(
                "Cross-validation needs PyTorch. Install prompt2dataset[train].",
                color="warning",
                multi_line=True,
            )
            return

        async def _do() -> None:
            def work(p: Progress):
                ds = load_dataset(root)
                return classify.crossval(root, ds, 5, 5, p)

            await _run_panel(
                root,
                "Cross-validating",
                work,
                lambda ms: _show_mismatches(root, ms, grid.refresh),
            )

        ui.timer(0, _do, once=True)

    with ui.row().classes("w-full gap-2 mb-4 flex-wrap"):
        ui.button(
            "Generate",
            icon="auto_awesome",
            on_click=lambda: _generate_dialog(root, grid.refresh),
        ).props("unelevated")
        ui.button("Dedup", icon="content_copy", on_click=lambda: run_clean("duplicates")).props("flat")
        ui.button("Outliers", icon="filter_alt", on_click=lambda: run_clean("outliers")).props("flat")
        ui.button("Train", icon="model_training", on_click=run_train).props("flat")
        ui.button("Run classifier", icon="rule", on_click=run_classifier).props("flat")
        ui.button("Cross-validate", icon="fact_check", on_click=run_crossval).props("flat")
        ui.space()
        ui.button("Delete selected", icon="delete", on_click=delete_selected).props(
            "flat color=red"
        )
        ui.button(
            "Bin", icon="recycling", on_click=lambda: ui.navigate.to(f"/d/{name}/bin")
        ).props("flat")

    grid()


def _show_mismatches(root: Path, mismatches: list, on_done) -> None:
    with ui.dialog() as dialog, card().classes("w-[36rem]"):
        ui.label("Classifier disagreements").classes("text-lg font-semibold")
        if not mismatches:
            with ui.column().classes("items-center w-full p-4"):
                mascot("happy", 56)
                ui.label("No mismatches. Labels look consistent.").style(
                    f'color: {PALETTE["muted"]}'
                )
        else:
            ui.label(
                f"{len(mismatches)} images were predicted as a different label."
            ).style(f'color: {PALETTE["muted"]}')
            with ui.row().classes("w-full gap-2 flex-wrap max-h-96 overflow-auto"):
                for m in mismatches:
                    with card().classes("w-40 p-2"):
                        ui.image(media_url(root / m.local_path)).classes(
                            "w-full h-28 object-cover rounded-lg"
                        )
                        ui.label(f"is: {m.subject}").classes("text-xs")
                        ui.label(f"predicted: {m.predicted}").classes(
                            "text-xs"
                        ).style(f'color: {PALETTE["accent"]}')
        with ui.row().classes("w-full justify-end"):
            ui.button("Close", on_click=dialog.close).props("flat")
    dialog.open()


@ui.page("/d/{name}/bin")
def bin_page(name: str) -> None:
    apply_base_style()
    root = _resolve_root(name)
    if root is None:
        _header("not found", back_to="/")
        return

    _header(f"{name} recycle bin", back_to=f"/d/{name}")
    selected: set[str] = set()

    @ui.refreshable
    def grid() -> None:
        ds = load_dataset(root)
        binned = recyclebin.list_bin(ds)
        if not binned:
            with card().classes("w-full items-center p-8"):
                mascot("trash", 64)
                ui.label("The bin is empty.").style(f'color: {PALETTE["muted"]}')
            return
        with ui.row().classes("w-full gap-3 flex-wrap"):
            for item in binned:
                with card().classes("w-40 p-2"):
                    ui.image(
                        media_url(recyclebin._bin_path(root, item))
                    ).classes(
                        "w-full h-32 object-cover rounded-lg opacity-70"
                    ).props("loading=lazy")
                    with ui.row().classes("w-full items-center justify-between"):
                        ui.checkbox(
                            on_change=lambda e, iid=item.item_id: (
                                selected.add(iid)
                                if e.value
                                else selected.discard(iid)
                            ),
                        ).props("dense")
                        ui.label(item.subject or item.label).classes("text-xs truncate")

    def restore_selected() -> None:
        if not selected:
            ui.notify("Select images to restore.", color="warning")
            return
        ds = load_dataset(root)
        n = recyclebin.restore(ds, root, list(selected))
        save_dataset(ds, root)
        selected.clear()
        ui.notify(f"Restored {n}.", color="positive")
        grid.refresh()

    def empty() -> None:
        ds = load_dataset(root)
        n = recyclebin.empty_bin(ds, root)
        save_dataset(ds, root)
        selected.clear()
        ui.notify(f"Permanently removed {n}.", color="positive")
        grid.refresh()

    with ui.row().classes("w-full gap-2 mb-4"):
        ui.button("Restore selected", icon="restore", on_click=restore_selected).props(
            "unelevated"
        )
        ui.button("Empty bin", icon="delete_forever", on_click=empty).props(
            "flat color=red"
        )

    grid()


def run() -> None:
    register_media(app)
    ui.run(title=APP_NAME, port=PORT, reload=False, show=True, favicon="🤖")

import { useState } from "react";
import { ApiError } from "../api";
import {
  BROWSER_MODEL,
  copyablePrompt,
  getMethod,
  parseSubjects,
  resolveInBrowser,
  setMethod as saveMethod,
  type LoadProgress,
  type Method,
} from "../local/resolve";
import { btn, btnPrimary, field } from "../ui";

const METHODS: [Method, string][] = [
  ["browser", "In this browser"],
  ["copy", "Copy prompt"],
];

/**
 * Generate class names from a description, with a small local model or your own
 * assistant via copy and paste. The method choice is remembered
 */
export function PromptGenerator({
  exclude,
  onResult,
}: {
  exclude: string[];
  onResult: (names: string[]) => void;
}) {
  const [method, setMethod] = useState<Method>(getMethod);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // shown when the clipboard is blocked, so the prompt can be copied by hand
  const [manualPrompt, setManualPrompt] = useState("");
  const [reply, setReply] = useState("");

  const choose = (m: Method) => {
    setMethod(m);
    saveMethod(m);
    setError("");
  };

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof ApiError ? e.message : fallback);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      onResult(await resolveInBrowser(prompt, count, exclude, setProgress));
    } catch (e) {
      console.error(e);
      fail(e, "Could not generate classes");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const copy = async () => {
    setError("");
    let text: string;
    try {
      text = copyablePrompt(prompt, count, exclude);
    } catch (e) {
      fail(e, "Describe the dataset first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setManualPrompt("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setManualPrompt(text);
    }
  };

  const useReply = () => {
    const names = parseSubjects(reply, exclude, count);
    if (!names.length) {
      setError("No class names found in that reply.");
      return;
    }
    setError("");
    setReply("");
    onResult(names);
  };

  return (
    <div className="space-y-2.5">
      <div
        role="group"
        aria-label="How to generate"
        className="border-border bg-card flex w-fit overflow-hidden rounded-md border"
      >
        {METHODS.map(([m, label], n) => (
          <button
            key={m}
            aria-pressed={method === m}
            onClick={() => choose(m)}
            className={`h-8 px-3 text-sm ${n ? "border-border border-l" : ""} ${
              method === m ? "bg-subtle font-semibold" : "hover:bg-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className={`${field} min-w-0 flex-1`}
          placeholder="e.g. common backyard birds of the Pacific NW"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (method === "copy" ? copy() : generate())
          }
          aria-label="Dataset description"
        />
        <input
          type="number"
          min={1}
          max={50}
          className={`${field} w-16`}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="How many classes"
          title="How many classes"
        />
        {method === "copy" ? (
          <button
            className={btnPrimary + " h-9"}
            onClick={copy}
            disabled={!prompt.trim()}
          >
            {copied ? "Copied" : "Copy prompt"}
          </button>
        ) : (
          <button
            className={btnPrimary + " h-9"}
            onClick={generate}
            disabled={busy || !prompt.trim()}
          >
            {busy ? "Working" : "Generate"}
          </button>
        )}
      </div>

      {method === "browser" && (
        <p className="text-muted text-xs">
          Runs {BROWSER_MODEL.label} on your device. The first run downloads
          about {BROWSER_MODEL.size}, then it's cached. Your description never
          leaves this browser.
        </p>
      )}

      {method === "copy" && (
        <div className="space-y-1.5">
          <p className="text-muted text-xs">
            Paste the prompt into Claude, ChatGPT, or any assistant, then paste
            its reply below.
          </p>
          {manualPrompt && (
            <textarea
              readOnly
              value={manualPrompt}
              onFocus={(e) => e.currentTarget.select()}
              className={`${field} h-24 w-full py-1.5 font-mono text-xs`}
              aria-label="Prompt to copy"
            />
          )}
          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Paste the reply here"
              className={`${field} h-16 min-w-0 flex-1 py-1.5`}
              aria-label="Assistant reply"
            />
            <button
              className={btn + " self-end"}
              onClick={useReply}
              disabled={!reply.trim()}
            >
              Use reply
            </button>
          </div>
        </div>
      )}

      {busy && progress && (
        <div className="space-y-1">
          <p className="text-muted text-xs">{progress.message}</p>
          <div className="bg-subtle h-1.5 overflow-hidden rounded-full">
            <div
              className={`bg-primary h-full rounded-full transition-all ${
                progress.fraction === null ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                progress.fraction === null
                  ? undefined
                  : { width: `${Math.round(progress.fraction * 100)}%` }
              }
            />
          </div>
        </div>
      )}

      {error && <p className="text-bad text-sm">{error}</p>}
    </div>
  );
}

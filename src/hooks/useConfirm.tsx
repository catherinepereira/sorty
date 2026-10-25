import { useRef, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * Async confirmation without window.confirm. Call ask(opts) to open the modal and
 * await the user's yes/no, render the returned element once near the page root.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = (o: ConfirmOpts) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(o);
    });

  const resolve = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const element = opts ? (
    <ConfirmModal open onResolve={resolve} {...opts} />
  ) : null;

  return { ask, element };
}

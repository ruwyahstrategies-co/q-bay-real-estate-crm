import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

// Shared animated overlay shells for drawers and dialogs. Kept intentionally
// restrained (~160ms) --- see the "Drawers / modals" polish pass. Both shells
// stay mounted for the duration of the exit transition instead of vanishing
// instantly, so close feels smooth instead of abrupt.

const TRANSITION_MS = 160;

/** Keeps a panel mounted for TRANSITION_MS after `open` goes false, so exit animations can play. */
function useDelayedUnmount(open: boolean) {
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setShouldRender(true);
      raf = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      timeout = setTimeout(() => setShouldRender(false), TRANSITION_MS);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [open]);

  return { shouldRender, visible };
}

function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

function useAutoFocusFirstField(visible: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!visible) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])",
    );
    el?.focus({ preventScroll: true });
  }, [visible, containerRef]);
}

type ShellProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
  widthClassName?: string;
  ariaLabel?: string;
};

/** Side panel sliding in from the right, with a fading backdrop. */
export function DrawerShell({ open, onOpenChange, children, widthClassName = "max-w-md", ariaLabel }: ShellProps) {
  const { shouldRender, visible } = useDelayedUnmount(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(open, () => onOpenChange(false));
  useAutoFocusFirstField(visible, panelRef);

  if (!shouldRender) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex justify-end", !visible && "pointer-events-none")}>
      <div
        className={cn("absolute inset-0 bg-foreground/30 transition-opacity ease-out", visible ? "opacity-100" : "opacity-0")}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onMouseDown={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          "relative flex w-full flex-col bg-canvas shadow-2xl transition-transform ease-out",
          widthClassName,
          visible ? "translate-x-0" : "translate-x-full",
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        {children}
      </div>
    </div>
  );
}

/** Centered dialog with a fade + subtle scale-in. */
export function DialogShell({ open, onOpenChange, children, widthClassName = "max-w-sm", ariaLabel }: ShellProps) {
  const { shouldRender, visible } = useDelayedUnmount(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(open, () => onOpenChange(false));
  useAutoFocusFirstField(visible, panelRef);

  if (!shouldRender) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", !visible && "pointer-events-none")}>
      <div
        className={cn("absolute inset-0 bg-foreground/40 transition-opacity ease-out", visible ? "opacity-100" : "opacity-0")}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onMouseDown={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          "relative w-full rounded-2xl bg-canvas shadow-2xl transition-all ease-out",
          widthClassName,
          visible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0",
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        {children}
      </div>
    </div>
  );
}

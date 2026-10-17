import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { maskPhone } from "@/lib/phone";

type MaskedPhoneProps = {
  /** The phone number the signed-in user is allowed to see. Leave empty when there is none. */
  value?: string | null;
  /**
   * True when the server withheld the number from this user (e.g. owner.phone_hidden). The
   * component then never uses `value`, never reveals anything on hover, focus or tap, and shows
   * only `hiddenLabel`.
   */
  hidden?: boolean;
  hiddenLabel?: string;
  hiddenTitle?: string;
  /** Shown when there is no phone and it is not hidden. */
  emptyLabel?: string;
  className?: string;
};

/**
 * Phone number display for lead and owner surfaces.
 *
 * Two separate layers decide what a user sees:
 * 1. Authorization (server / RLS): whether this user receives the number at all. A hidden number
 *    is never in client state, and this component refuses to reveal one even if given a value.
 * 2. UI privacy (this component): a number the user may see stays masked until a deliberate
 *    interaction: mouse hover, keyboard focus, or a tap / click to toggle (touch devices).
 *
 * While masked, only the masked string is in the DOM and in attributes (aria-label, title,
 * data-*); the full number is rendered only when revealed. The call and WhatsApp actions keep
 * using the underlying value elsewhere.
 */
export function MaskedPhone({
  value,
  hidden = false,
  hiddenLabel = "Hidden",
  hiddenTitle,
  emptyLabel = "-",
  className,
}: MaskedPhoneProps) {
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // A tapped-open number closes again when the user taps anywhere else.
  useEffect(() => {
    if (!pinned) return;
    const onOutside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [pinned]);

  if (hidden) {
    return (
      <span className={cn("text-muted-foreground", className)} title={hiddenTitle}>
        {hiddenLabel}
      </span>
    );
  }

  const phone = (value ?? "").trim();
  if (!phone) return <span className={className}>{emptyLabel}</span>;

  const shown = hovering || focused || pinned;

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={shown}
      aria-label={shown ? undefined : "Phone number hidden. Hover, focus, or tap to reveal."}
      className={cn(
        "cursor-pointer rounded-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      // Only a real mouse hovers. Touch taps also emit emulated mouse events, which would leave
      // the number stuck open after the tap, so hover is limited to pointerType "mouse".
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovering(true);
      }}
      onPointerLeave={() => setHovering(false)}
      onFocus={(e) => {
        // Reveal on keyboard focus only. Touch and mouse focus-on-tap goes through the toggle.
        try {
          setFocused(e.currentTarget.matches(":focus-visible"));
        } catch {
          setFocused(false);
        }
      }}
      onBlur={() => {
        setFocused(false);
        setPinned(false);
      }}
      onClick={(e) => {
        // The phone often sits inside a link or a clickable card: toggling must not navigate.
        e.preventDefault();
        e.stopPropagation();
        setPinned((p) => !p);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
        }
      }}
    >
      {shown ? phone : maskPhone(phone)}
    </span>
  );
}

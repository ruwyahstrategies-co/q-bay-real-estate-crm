import { useState } from "react";
import { cn } from "@/lib/utils";

/** Round staff photo with an initials fallback (also used when the image fails to load). */
export function StaffAvatar({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  url?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "-";
  const dim = { xs: "h-5 w-5 text-[8px]", sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <span
      title={name}
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-qbay-soft font-semibold text-qbay ring-2 ring-canvas",
        dim,
        className,
      )}
    >
      {url && !failed ? (
        <img src={url} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact property picture for lists and cards. Shows the image when there is one and the same
 * quiet building placeholder the property list uses when there is not (or the image fails to
 * load). Never fetches anything itself: the caller passes the URL it already has.
 */
export function PropertyThumb({
  url,
  size = "sm",
  className,
}: {
  url?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;
  return (
    <span
      className={cn(
        "flex-shrink-0 overflow-hidden rounded-md bg-muted",
        size === "sm" ? "h-9 w-9" : "h-12 w-12",
        className,
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
    </span>
  );
}

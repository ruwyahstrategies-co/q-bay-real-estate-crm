import { Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { usePublicWebsiteUrl } from "@/hooks/use-public-website";
import { propertyWebsiteLink, type PropertyWebsiteLink } from "@/lib/website-link";
import { cn } from "@/lib/utils";
import type { Property } from "@/lib/db";

type LinkProperty = Pick<Property, "id" | "slug" | "is_published" | "status">;

function usePropertyWebsiteLink(property: LinkProperty): PropertyWebsiteLink {
  const { url } = usePublicWebsiteUrl();
  return propertyWebsiteLink(property, url);
}

async function copyLink(link: PropertyWebsiteLink) {
  if (link.state !== "ready") {
    toast.info(link.message);
    return;
  }
  try {
    await navigator.clipboard.writeText(link.url);
    toast.success("Website link copied");
  } catch {
    toast.error(`Could not copy automatically. The link is ${link.url}`);
  }
}

function openListing(link: PropertyWebsiteLink) {
  if (link.state !== "ready") {
    toast.info(link.message);
    return;
  }
  window.open(link.url, "_blank", "noopener,noreferrer");
}

/**
 * Copy Website Link and Open Website Listing for one property. For a property that is not on the
 * website the buttons stay visible but say why, and no link is ever made up.
 */
export function PropertyWebsiteLinkButtons({
  property,
  showHint = false,
  className,
}: {
  property: LinkProperty;
  /** Show the reason in text under the buttons when there is no link. */
  showHint?: boolean;
  className?: string;
}) {
  const link = usePropertyWebsiteLink(property);
  const ready = link.state === "ready";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={!ready}
          className={cn(!ready && "opacity-60")}
          title={ready ? link.url : link.message}
          onClick={() => copyLink(link)}
        >
          <Link2 className="h-3.5 w-3.5" /> Copy Website Link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={!ready}
          className={cn(!ready && "opacity-60")}
          title={ready ? "Open the public listing in a new tab" : link.message}
          onClick={() => openListing(link)}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open Website Listing
        </Button>
      </div>
      {showHint && !ready && <p className="text-[11px] text-muted-foreground">{link.message}</p>}
    </div>
  );
}

/** Compact icon version for table rows. */
export function PropertyWebsiteLinkIcon({ property }: { property: LinkProperty }) {
  const link = usePropertyWebsiteLink(property);
  const ready = link.state === "ready";
  return (
    <button
      type="button"
      className={cn("rounded-md p-1.5 hover:bg-muted", !ready && "opacity-50")}
      title={ready ? "Copy website link" : link.message}
      aria-label="Copy website link"
      aria-disabled={!ready}
      onClick={() => copyLink(link)}
    >
      <Link2 className="h-3.5 w-3.5" />
    </button>
  );
}

import { Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { usePublicWebsiteUrl } from "@/hooks/use-public-website";
import { developmentWebsiteLink, type DevelopmentWebsiteLink } from "@/lib/website-link";
import { cn } from "@/lib/utils";
import type { Development } from "@/lib/db";

type LinkDevelopment = Pick<Development, "id" | "slug" | "is_published">;

function useDevelopmentWebsiteLink(development: LinkDevelopment): DevelopmentWebsiteLink {
  const { url } = usePublicWebsiteUrl();
  return developmentWebsiteLink(development, url);
}

async function copyLink(link: DevelopmentWebsiteLink) {
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

function openListing(link: DevelopmentWebsiteLink) {
  if (link.state !== "ready") {
    toast.info(link.message);
    return;
  }
  window.open(link.url, "_blank", "noopener,noreferrer");
}

/**
 * Copy Website Link and Open Website Listing for one development, same contract as
 * PropertyWebsiteLinkButtons: buttons stay visible even when there is no link yet, and say why.
 */
export function DevelopmentWebsiteLinkButtons({
  development,
  showHint = false,
  className,
}: {
  development: LinkDevelopment;
  showHint?: boolean;
  className?: string;
}) {
  const link = useDevelopmentWebsiteLink(development);
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

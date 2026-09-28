import { useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import {
  useLeadChannels,
  useCreateChannel,
  useUpdateChannel,
  useReorderChannels,
  useDeleteChannel,
} from "@/hooks/use-channels";
import type { LeadChannel } from "@/lib/db";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function codeFor(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "channel"
  );
}

/**
 * Settings > Channels / Sources. Drives the "Lead source" picker on Add/Edit
 * Lead and the lead importer's default source. leads.lead_source stays a
 * free-text column - renaming or deactivating a channel here never rewrites
 * historical leads, it only changes what's offered going forward.
 */
export function ChannelsManager({ canManage }: { canManage: boolean }) {
  const { data: channels = [], isLoading } = useLeadChannels();
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const reorder = useReorderChannels();
  const del = useDeleteChannel();
  const [newName, setNewName] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({
        name,
        code: codeFor(name),
        display_order: channels.length,
        is_active: true,
      });
      setNewName("");
      toast.success("Channel added");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= channels.length) return;
    const next = [...channels];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((c, i) => ({ id: c.id, display_order: i })));
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading channels...</p>;

  return (
    <div className="mt-4 max-w-xl space-y-2">
      <p className="text-xs text-muted-foreground">
        These are the channels offered on Add/Edit Lead's "Lead source" field and the lead
        importer's default source. Deactivating one keeps it visible on leads that already use
        it, but stops offering it for new leads.
      </p>
      <div className="mt-3 space-y-2">
        {channels.map((c, i) => (
          <ChannelRow
            key={c.id}
            channel={c}
            canManage={canManage}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            disableUp={i === 0}
            disableDown={i === channels.length - 1}
            onRename={(name) => update.mutate({ id: c.id, patch: { name } })}
            onToggleActive={() => update.mutate({ id: c.id, patch: { is_active: !c.is_active } })}
            onDelete={async () => {
              try {
                await del.mutateAsync(c.id);
                toast.success("Channel deleted");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        ))}
        {channels.length === 0 && (
          <p className="text-xs text-muted-foreground">No channels configured yet.</p>
        )}
      </div>
      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New channel name..."
            className={cn(inputCls, "flex-1")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" size="sm" onClick={handleAdd} disabled={create.isPending}>
            <Plus className="h-3.5 w-3.5" /> Add channel
          </Button>
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  canManage,
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
  onRename,
  onToggleActive,
  onDelete,
}: {
  channel: LeadChannel;
  canManage: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  onRename: (name: string) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2",
        !channel.is_active && "opacity-50",
      )}
    >
      <div className="flex flex-col">
        <button
          type="button"
          disabled={disableUp || !canManage}
          onClick={onMoveUp}
          className="p-0.5 text-muted-foreground disabled:opacity-30"
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={disableDown || !canManage}
          onClick={onMoveDown}
          className="p-0.5 text-muted-foreground disabled:opacity-30"
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (name.trim() && name.trim() !== channel.name) onRename(name.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(channel.name);
              setEditing(false);
            }
          }}
          className="h-8 flex-1 rounded-md border border-border bg-canvas px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          className="flex-1 truncate text-left text-sm hover:underline disabled:cursor-default disabled:hover:no-underline"
          disabled={!canManage}
          onClick={() => canManage && setEditing(true)}
        >
          {channel.name}{" "}
          {channel.code && <span className="text-xs text-muted-foreground">({channel.code})</span>}
        </button>
      )}

      <button
        type="button"
        disabled={!canManage}
        onClick={onToggleActive}
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px]",
          channel.is_active ? "bg-pastel-green" : "bg-muted text-muted-foreground",
        )}
      >
        {channel.is_active ? "Active" : "Inactive"}
      </button>
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-destructive hover:bg-muted"
          aria-label="Delete channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

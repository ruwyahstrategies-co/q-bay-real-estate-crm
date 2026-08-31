import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Newspaper, Trash2, Pencil, X, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { usePermissions } from "@/hooks/use-auth";
import { useBlogPosts, useCreateBlogPost, useUpdateBlogPost, useSetBlogPublished, useDeleteBlogPost, slugify } from "@/hooks/use-blog";
import type { BlogPost } from "@/lib/db";
import { fmtDate } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/journal")({
  head: () => ({ meta: [{ title: "Journal" }] }),
  component: JournalPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function JournalPage() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<BlogPost | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);
  const { data: posts = [] } = useBlogPosts();
  const setPublished = useSetBlogPublished();
  const del = useDeleteBlogPost();
  const { can } = usePermissions();
  const canCreate = can("journal", "create");
  const canEdit = can("journal", "edit");
  const canDelete = can("journal", "delete");
  const canPublish = can("journal", "publish") || canEdit;

  return (
    <AppShell>
      <PermissionGate module="journal" action="view" page>
      <PageHeader
        eyebrow="Content"
        title="Journal"
        description="Blog/journal content for the future public website - controlled entirely from here."
        actions={canCreate ? <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> New Post</Button> : undefined}
      />
      <DataTable
        columns={["Title", "Slug", "Published", "Updated", "Actions"]}
        empty={<EmptyState icon={<Newspaper className="h-4 w-4" />} title="No journal posts yet" description="Publish your first article." />}
      >
        {posts.map((p) => (
          <tr key={p.id} className="border-b border-border last:border-0 hover:bg-background/60">
            <td className="px-4 py-3 text-sm font-medium">{p.title}</td>
            <td className="px-4 py-3 text-xs text-muted-foreground">/{p.slug}</td>
            <td className="px-4 py-3 text-xs">
              <button
                disabled={!canPublish}
                onClick={() => setPublished.mutate({ id: p.id, is_published: !p.is_published })}
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", p.is_published ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
              >
                {p.is_published ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {p.is_published ? "Published" : "Draft"}
              </button>
            </td>
            <td className="px-4 py-3 text-xs">{fmtDate(p.updated_at)}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1">
                {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(p); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                {canDelete && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(p)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <BlogDrawer open={open} onOpenChange={setOpen} post={edit} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete post?"
        description={`Delete "${confirmDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Post deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}

function BlogDrawer({ open, onOpenChange, post }: { open: boolean; onOpenChange: (v: boolean) => void; post?: BlogPost | null }) {
  const create = useCreateBlogPost();
  const update = useUpdateBlogPost();
  const isEdit = !!post?.id;
  const [title, setTitle] = useState(post?.title ?? "");
  const [category, setCategory] = useState(post?.category ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image ?? "");
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seo_description ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? "");
    setCategory(post?.category ?? "");
    setExcerpt(post?.excerpt ?? "");
    setContent(post?.content ?? "");
    setFeaturedImage(post?.featured_image ?? "");
    setSeoTitle(post?.seo_title ?? "");
    setSeoDescription(post?.seo_description ?? "");
  }, [open, post?.id]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required");
    const payload = {
      title: title.trim(),
      category: category || null,
      excerpt: excerpt || null,
      content: content || null,
      featured_image: featuredImage || null,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
    };
    try {
      if (isEdit && post) { await update.mutateAsync({ id: post.id, patch: payload }); toast.success("Post updated"); }
      else { await create.mutateAsync({ ...payload, slug: slugify(title) }); toast.success("Post created"); }
      onOpenChange(false);
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} widthClassName="max-w-2xl" ariaLabel={isEdit ? "Edit post" : "New post"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Post" : "New Post"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form className="flex-1 space-y-3 overflow-y-auto p-5" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Title *</span>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Category</span>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Market Insights, Area Guide, Design, Investment" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Featured image URL</span>
          <input className={inputCls} value={featuredImage ?? ""} onChange={(e) => setFeaturedImage(e.target.value)} placeholder="https://..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Excerpt</span>
          <textarea className={cn(inputCls, "h-16 py-2")} value={excerpt ?? ""} onChange={(e) => setExcerpt(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Content</span>
          <textarea className={cn(inputCls, "h-56 py-2")} value={content ?? ""} onChange={(e) => setContent(e.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">SEO title</span>
            <input className={inputCls} value={seoTitle ?? ""} onChange={(e) => setSeoTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">SEO description</span>
            <input className={inputCls} value={seoDescription ?? ""} onChange={(e) => setSeoDescription(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}

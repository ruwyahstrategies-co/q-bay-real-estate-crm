import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type BlogPost, type BlogPostInsert, type BlogPostUpdate } from "@/lib/db";

export const blogKeys = {
  all: ["blog_posts"] as const,
  list: () => ["blog_posts", "list"] as const,
  detail: (id: string) => ["blog_posts", "detail", id] as const,
};

export function useBlogPosts() {
  return useQuery({
    queryKey: blogKeys.list(),
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await sb.from("blog_posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBlogPost(id: string | undefined) {
  return useQuery({
    queryKey: id ? blogKeys.detail(id) : ["blog_posts", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("blog_posts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
export { slugify };

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlogPostInsert) => {
      const payload = { ...input, slug: input.slug || slugify(input.title) };
      const { data, error } = await sb.from("blog_posts").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: BlogPostUpdate }) => {
      const { data, error } = await sb.from("blog_posts").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: blogKeys.all });
      qc.invalidateQueries({ queryKey: blogKeys.detail(vars.id) });
    },
  });
}

export function useSetBlogPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { data, error } = await sb
        .from("blog_posts")
        .update({ is_published, published_at: is_published ? new Date().toISOString() : null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

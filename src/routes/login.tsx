import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui-primitives";
import { APP_CONFIG } from "@/lib/config";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/overview" });
  },
  component: LoginPage,
});

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-canvas px-3.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setPending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      toast.success("Signed in");
      navigate({ to: "/overview" });
    } catch (err) {
      const message = (err as Error).message || "Sign in failed";
      setError(message === "Invalid login credentials" ? "Incorrect email or password." : message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <BrandMark className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-white">{APP_CONFIG.companyName}</h1>
          <p className="mt-1 text-xs text-white/50">{APP_CONFIG.productDescriptor}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-canvas p-6 shadow-2xl"
          aria-label="Sign in"
        >
          <h2 className="text-base font-semibold text-foreground">Sign in</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the credentials your administrator provided.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </span>
              <input
                className={inputCls}
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@qbayrealestate.com"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Password
              </span>
              <input
                className={inputCls}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          </div>

          {error ? (
            <p
              className="mt-3 rounded-lg bg-[#FADCDA] px-3 py-2 text-xs text-foreground"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-5 w-full" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/40">
          Access is granted by your administrator. Contact them if you need an account or a password
          reset.
        </p>
      </div>
    </div>
  );
}

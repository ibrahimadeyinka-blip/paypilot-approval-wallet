import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Payrail" },
      { name: "description", content: "Sign in to manage your agent tokens and payment approvals." },
      { property: "og:title", content: "Sign in — Payrail" },
      { property: "og:description", content: "Sign in to manage your agent tokens and payment approvals." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect: to } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const safeTo = to && to.startsWith("/") && !to.startsWith("//") ? to : "/wallet";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeTo });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/wallet`, data: { display_name: name } },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("We sent you a link to set a new password.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="size-4" />
          </span>
          {mode === "signin" ? "Sign in to Payrail" : mode === "signup" ? "Create your account" : "Set a new password"}
        </div>
        {mode === "reset" && (
          <p className="text-sm text-muted-foreground">
            Moved over from the old app? Enter your email and we'll send a link to choose a new password.
          </p>
        )}
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== "reset" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
        </Button>
        <div className="flex justify-between text-sm text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? "Have an account? Sign in" : "Create account"}
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => setMode("reset")}>
            Forgot / new password
          </button>
        </div>
      </form>
    </div>
  );
}

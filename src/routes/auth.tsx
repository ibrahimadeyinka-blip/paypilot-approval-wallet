import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { PublicFrame } from "@/components/public-frame";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { oauthReturnPath } from "@/lib/oauth-return-path";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

  const safeTo = oauthReturnPath(to);

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
          options: { emailRedirectTo: new URL(safeTo, window.location.origin).href, data: { display_name: name } },
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
    <PublicFrame>
      <form onSubmit={submit} className="space-y-6">
        <div className="pb-3"><span className="eyebrow">YOUR PAYMENT COMMAND CENTER</span><h1 className="mt-5 text-[32px] font-semibold leading-tight">{mode === "signin" ? "Welcome back." : mode === "signup" ? "Make it your own." : "A fresh start."}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{mode === "signin" ? "Sign in to your Payrail account." : mode === "signup" ? "Create your Payrail account." : "Get a link to reset your password."}</p></div>
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
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== "reset" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}{!busy && <ArrowRight />}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5 text-sm text-muted-foreground">
          <Button variant="link" size="sm" type="button" className="h-auto p-0 text-xs" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? "Have an account? Sign in" : "Create account"}
          </Button>
          <Button variant="link" size="sm" type="button" className="h-auto p-0 text-xs" onClick={() => setMode("reset")}>
            Forgot / new password
          </Button>
        </div>
      </form>
    </PublicFrame>
  );
}

"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, UserPlus, Bot, Shield, Zap, Users } from "lucide-react";
import Link from "next/link";
import { extractAuthErrorMessage } from "@/lib/auth-error-handler";

export const dynamic = "force-dynamic";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { signIn } = useAuthActions();

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      formData.append("name", username || email);
      formData.append("flow", "signUp");

      await signIn("password", formData);

      router.refresh();
      router.push(redirectTo);
    } catch (error) {
      console.error("Sign up error:", error);
      setError(extractAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="flex min-h-screen">
        {/* Left Branding Panel */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 lg:flex lg:w-1/2">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-blue-600/20 to-purple-600/20" />
          <div
            className="absolute inset-0 bg-repeat opacity-50"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />

          <div className="relative flex w-full flex-col justify-center px-12 xl:px-16">
            <div className="max-w-lg space-y-12">
              {/* Logo & Brand */}
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl bg-white/20 blur-xl" />
                    <div className="relative rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                      <Bot className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">
                      AIKP
                    </h1>
                    <p className="text-sm font-medium text-slate-300">
                      AI Assistant Platform
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl leading-tight font-bold text-white xl:text-5xl">
                    Join AIKP Today
                  </h2>
                  <p className="text-xl leading-relaxed font-light text-slate-200">
                    Create your account and start managing your projects with
                    AI-powered insights.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                      <Shield className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Secure authentication
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
                      <Zap className="h-4 w-4 text-blue-400" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Real-time collaboration
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
                      <Users className="h-4 w-4 text-purple-400" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Team management
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="flex w-full items-center justify-center lg:w-1/2">
          <div className="w-full max-w-md space-y-8 px-4">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">
                Create Account
              </h1>
              <p className="text-muted-foreground mt-2">
                Get started with your free account
              </p>
            </div>

            {/* Form Card */}
            <Card className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/80 shadow-xl backdrop-blur">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl">Sign up</CardTitle>
                <CardDescription>
                  Enter your details to create your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSignUp} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username">Username (optional)</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="your-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && (
                      <UserPlus className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {loading ? "Creating account..." : "Create account"}
                  </Button>
                </form>

                <div className="mt-6 text-center text-sm">
                  <span className="text-muted-foreground">
                    Already have an account?{" "}
                  </span>
                  <Link
                    href="/auth/login"
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center">
          <div className="text-2xl font-semibold">Loading...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { IoLogInOutline } from "react-icons/io5";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full flex items-center justify-center">
          <div className="w-full max-w-lg p-6">
            <header className="mb-6 text-center">
              <h2 className="text-3xl font-bold text-black">Welcome Back</h2>
              <p className="text-gray-500 mt-2 text-sm">Loading…</p>
            </header>
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const qp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (data.user) router.replace("/");
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message || "Login failed");
      return;
    }
    router.replace(qp.get("next") || "/");
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center">
      <div className="w-full max-w-lg p-6">
        <header className="mb-6 text-center">
          <h2 className="text-3xl font-bold text-black">Welcome Back</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Please sign in to continue.
          </p>
        </header>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@gmail.com"
              className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black text-white rounded-lg p-3 font-semibold transition-all duration-300 ease-in-out hover:bg-gray-800 disabled:bg-gray-300"
          >
            <span className="inline-flex items-center gap-2 justify-center">
              <IoLogInOutline className="w-5 h-5" />
              {submitting ? "Signing in..." : "Sign in"}
            </span>
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      if (!res.ok) {
        setError("Incorrect password");
        return;
      }

      router.push(searchParams.get("next") || "/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader title="Admin" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Restricted</p>
            <h2>Enter password</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="control"
              autoFocus
            />
          </label>

          {error && <div className="empty-state">{error}</div>}

          <div className="button-row">
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? "Checking…" : "Enter"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

import { useState } from "react";
import { auth } from "../../lib/auth";
import { t, type Locale } from "../../lib/i18n";

export function LoginView({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "in") {
        await auth.signIn.credential({ credential: email, password });
      } else {
        await auth.signUp.credential({ email, password });
      }
    } catch {
      setError(t(locale, "auth.failed"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError("");
    try {
      await auth.signIn.social({ provider: "google" });
    } catch {
      setError(t(locale, "auth.failed"));
    }
  };

  const input = "w-full px-3 py-2 border rounded text-sm";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-panel p-6 shadow-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="text-2xl font-bold">{t(locale, "app.title")}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{t(locale, "app.tagline")}</p>
        {error && <p id="login-error" role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label htmlFor="login-email" className="sr-only">{t(locale, "auth.email")}</label>
          <input
            id="login-email"
            className={`${input} border-border bg-panel text-foreground`}
            type="email"
            placeholder={t(locale, "auth.email")}
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="login-password" className="sr-only">{t(locale, "auth.password")}</label>
          <input
            id="login-password"
            className={`${input} border-border bg-panel text-foreground`}
            type="password"
            placeholder={t(locale, "auth.password")}
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
          >
            {mode === "in" ? t(locale, "auth.signIn") : t(locale, "auth.signUp")}
          </button>
          <button
            type="button"
            onClick={() => void google()}
            className="w-full px-4 py-2 text-sm border rounded"
          >
            {t(locale, "auth.withGoogle")}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="w-full text-xs text-muted-foreground hover:underline"
          >
            {mode === "in" ? t(locale, "auth.needAccount") : t(locale, "auth.haveAccount")}
          </button>
        </form>
      </section>
    </main>
  );
}

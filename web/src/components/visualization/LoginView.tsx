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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">{t(locale, "app.title")}</h1>
        <p className="text-sm text-gray-500 mb-5">{t(locale, "app.tagline")}</p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <input
            className={input}
            type="email"
            placeholder={t(locale, "auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={input}
            type="password"
            placeholder={t(locale, "auth.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !email || !password}
            className="w-full px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
          >
            {mode === "in" ? t(locale, "auth.signIn") : t(locale, "auth.signUp")}
          </button>
          <button
            onClick={() => void google()}
            className="w-full px-4 py-2 text-sm border rounded"
          >
            {t(locale, "auth.withGoogle")}
          </button>
          <button
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="w-full text-xs text-gray-500 hover:underline"
          >
            {mode === "in" ? t(locale, "auth.needAccount") : t(locale, "auth.haveAccount")}
          </button>
        </div>
      </div>
    </div>
  );
}

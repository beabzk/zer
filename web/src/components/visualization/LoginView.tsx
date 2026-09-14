import { useEffect, useState } from "react";
import { api, type AuthConfig, type SignupMode } from "../../lib/api";
import { auth } from "../../lib/auth";
import { t, type Locale } from "../../lib/i18n";

export function LoginView({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [setupMode, setSetupMode] = useState<SignupMode>("INVITE");
  const [inviteToken, setInviteToken] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.auth.config().then((nextConfig) => {
      if (active) setConfig(nextConfig);
    }).catch(() => {
      if (active) setNotice(t(locale, "auth.configFailed"));
    });

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("invite") ?? "";
    if (!token) {
      return () => {
        active = false;
      };
    }
    setInviteToken(token);
    api.signup.validateInvite(token).then((invite) => {
      if (active) setInvitedEmail(invite.email);
    }).catch(() => {
      if (active) setError(t(locale, "auth.invalidInvite"));
    });
    return () => {
      active = false;
    };
  }, [locale]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "in" && !config?.setup_required) {
        await auth.signIn.credential({ credential: email, password });
      } else if (config?.setup_required) {
        await auth.signUp.credential({
          email,
          password,
          additionalFields: {
            purpose: "instance-setup",
            signupMode: setupMode,
          },
        });
      } else {
        await auth.signUp.credential({
          email: invitedEmail || email,
          password,
          additionalFields: {
            purpose: "signup",
            inviteToken,
          },
        });
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
      const redirectUri = inviteToken
        ? `${window.location.origin}/signup#invite=${inviteToken}`
        : setupRequired
          ? `${window.location.origin}/signup#setup=${setupMode}`
          : undefined;
      await auth.signIn.social({
        provider: "google",
        ...(redirectUri ? { redirectUri } : {}),
      });
    } catch {
      setError(t(locale, "auth.failed"));
    }
  };

  const input = "w-full px-3 py-2 border rounded text-sm";
  const setupRequired = config?.setup_required ?? false;
  const signupMode = config?.signup_mode;
  const passwordSignup = config?.password_enabled ?? true;
  const googleSignup = config?.google_enabled ?? false;
  const inviteClaim = signupMode === "INVITE" && Boolean(inviteToken && invitedEmail);
  const canCreateAccount = setupRequired || signupMode === "OPEN" || inviteClaim;
  const effectiveMode = setupRequired || inviteClaim ? "up" : mode;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-panel p-6 shadow-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="text-2xl font-bold">
          {setupRequired ? t(locale, "auth.setupTitle") : t(locale, "app.title")}
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {setupRequired ? t(locale, "auth.setupDescription") : t(locale, "app.tagline")}
        </p>
        {notice && <p className="mb-3 text-sm text-muted-foreground">{notice}</p>}
        {error && <p id="login-error" role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        {setupRequired && (
          <>
            <label htmlFor="signup-mode" className="sr-only">{t(locale, "auth.signupMode")}</label>
            <select
              id="signup-mode"
              className={`${input} mb-3 border-border bg-panel text-foreground`}
              value={setupMode}
              onChange={(event) => setSetupMode(event.target.value as SignupMode)}
            >
              <option value="INVITE">{t(locale, "auth.modeInvite")}</option>
              <option value="OPEN">{t(locale, "auth.modeOpen")}</option>
              <option value="CLOSED">{t(locale, "auth.modeClosed")}</option>
            </select>
          </>
        )}
        {(passwordSignup || !googleSignup) && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <label htmlFor="login-email" className="sr-only">{t(locale, "auth.email")}</label>
            <input
              id="login-email"
              className={`${input} border-border bg-panel text-foreground`}
              type="email"
              placeholder={t(locale, "auth.email")}
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={Boolean(error)}
              value={invitedEmail || email}
              disabled={Boolean(invitedEmail)}
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
              disabled={busy || !(invitedEmail || email) || !password}
              className="w-full px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
            >
              {effectiveMode === "in" ? t(locale, "auth.signIn") : t(locale, "auth.signUp")}
            </button>
            {canCreateAccount && !setupRequired && signupMode === "OPEN" && (
              <button
                type="button"
                onClick={() => setMode(mode === "in" ? "up" : "in")}
                className="w-full text-xs text-muted-foreground hover:underline"
              >
                {mode === "in" ? t(locale, "auth.needAccount") : t(locale, "auth.haveAccount")}
              </button>
            )}
          </form>
        )}
        {googleSignup && (
          <button
            type="button"
            onClick={() => void google()}
            className="mt-3 w-full px-4 py-2 text-sm border rounded"
          >
            {t(locale, "auth.withGoogle")}
          </button>
        )}
      </section>
    </main>
  );
}

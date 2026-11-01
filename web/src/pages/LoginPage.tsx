import React, { useState, useEffect, useRef } from 'react';
import { authClient } from '../lib/auth';
import { api } from '../lib/api';
import type { AuthConfig } from '../lib/types';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../lib/i18nContext';
import { Icons } from '../components/ui/Icons';
import type { Locale } from '../lib/i18n';

interface LoginPageProps {
  authConfig: AuthConfig | null;
  onSuccess: () => void;
  onNavigateSetup: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  authConfig,
  onSuccess,
  onNavigateSetup,
}) => {
  const toast = useToast();
  const { locale, setLocale, t, localeNames } = useI18n();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Check if URL has invite token in hash: #invite=TOKEN
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('invite=')) {
      const match = hash.match(/invite=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        setInviteToken(match[1]);
        setTab('signup');
        // Validate token to pre-fill email
        api
          .validateSignupInvite(match[1])
          .then((res) => {
            setEmail(res.email);
            toast.info(`Invited as ${res.email}`);
          })
          .catch(() => {});
      }
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    try {
      await authClient.signIn.credential({
        credential: email.trim(),
        password,
      });
      toast.success('Signed in successfully');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.failed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    if (authConfig?.signup_mode === 'INVITE' && !inviteToken.trim()) {
      toast.error('An invitation token is required to register on this instance');
      return;
    }

    setSubmitting(true);
    try {
      await authClient.signUp.credential({
        email: email.trim(),
        password,
        additionalFields: inviteToken.trim() ? { inviteToken: inviteToken.trim() } : undefined,
      });
      toast.success('Account created successfully');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.failed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await authClient.signIn.social({
        provider: 'google',
        redirectUri: window.location.origin,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign in failed';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100/70 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      {/* Top right language switcher */}
      <div className="absolute top-4 right-4" ref={langMenuRef}>
        <button
          type="button"
          onClick={() => setLangMenuOpen(!langMenuOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          title={t('trees.language')}
        >
          <Icons.Globe size={14} className="text-stone-500" />
          <span>{localeNames[locale]}</span>
          <Icons.ChevronDown size={12} className="text-stone-400" />
        </button>

        {langMenuOpen && (
          <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl border border-stone-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
            {(Object.keys(localeNames) as Locale[]).map((loc) => (
              <button
                key={loc}
                onClick={() => {
                  setLocale(loc);
                  setLangMenuOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-amber-50/70 transition-colors cursor-pointer ${
                  locale === loc ? 'font-bold text-amber-900 bg-amber-50/90' : 'text-stone-700'
                }`}
              >
                <span>{localeNames[loc]}</span>
                {locale === loc && <Icons.Check size={13} className="text-amber-700" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-stone-900 text-amber-400 font-bold text-2xl flex items-center justify-center mx-auto shadow-md">
          ዘ
        </div>
        <h1 className="text-3xl font-extrabold text-stone-950 tracking-tight">
          ዘር <span className="text-xl font-normal text-stone-500 font-mono">zer</span>
        </h1>
        <p className="text-xs text-stone-500 max-w-sm mx-auto">
          {t('app.tagline')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-stone-200 shadow-xl space-y-6">
          {/* Tabs */}
          <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setTab('signin')}
              className={`py-2 rounded-lg transition-colors cursor-pointer ${
                tab === 'signin' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {t('auth.signIn')}
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`py-2 rounded-lg transition-colors cursor-pointer ${
                tab === 'signup' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {t('auth.signUp')}
            </button>
          </div>

          {/* Form */}
          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer mt-2"
              >
                {submitting ? t('common.loading') : t('auth.signIn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              {authConfig?.signup_mode === 'INVITE' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Invitation Token *
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="Enter invitation token or follow link"
                    className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 font-mono text-xs focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    This instance requires an invitation link to create an account.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth.email')} *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth.password')} *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordHint')}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer mt-2"
              >
                {submitting ? t('common.loading') : t('auth.signUp')}
              </button>
            </form>
          )}

          {/* Google OAuth Option */}
          {authConfig?.google_enabled && (
            <div className="pt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-2 px-4 border border-stone-200 hover:bg-stone-50 rounded-xl text-xs font-medium text-stone-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {t('auth.withGoogle')}
              </button>
            </div>
          )}

          {/* First run setup link */}
          {authConfig?.setup_required && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onNavigateSetup}
                className="text-xs text-amber-800 hover:underline font-semibold cursor-pointer"
              >
                First time setup? Initialize instance administrator
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

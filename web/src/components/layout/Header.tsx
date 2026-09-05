import { auth } from "../../lib/auth";
import { localeNames, t, type Locale } from "../../lib/i18n";

interface Props {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  email: string;
}

export function Header({ locale, onLocaleChange, email }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white">
      <div>
        <span className="font-bold text-lg">{t(locale, "app.title")}</span>
        <span className="hidden sm:inline text-xs text-gray-500 ml-2">
          {t(locale, "app.tagline")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
          className="border rounded text-sm px-2 py-1"
          aria-label={t(locale, "trees.language")}
        >
          {(Object.keys(localeNames) as Locale[]).map((l) => (
            <option key={l} value={l}>
              {localeNames[l]}
            </option>
          ))}
        </select>
        <span className="hidden md:inline text-sm text-gray-600">{email}</span>
        <button
          onClick={() => void auth.signout()}
          className="text-sm border rounded px-3 py-1"
        >
          {t(locale, "auth.signOut")}
        </button>
      </div>
    </header>
  );
}

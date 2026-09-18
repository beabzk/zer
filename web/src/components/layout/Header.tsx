import { auth } from "../../lib/auth";
import { localeNames, t, type Locale } from "../../lib/i18n";
import { Button, Select } from "../ui";

interface Props {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  email: string;
  treesOpen: boolean;
  onToggleTrees: () => void;
  inspectorAvailable: boolean;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

export function Header({
  locale,
  onLocaleChange,
  email,
  treesOpen,
  onToggleTrees,
  inspectorAvailable,
  inspectorOpen,
  onToggleInspector,
}: Props) {
  return (
    <header className="border-b border-border bg-panel/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
      <div className="min-w-0">
        <span className="font-display text-2xl font-semibold">{t(locale, "app.title")}</span>
        <span className="ml-3 hidden max-w-md truncate text-xs uppercase tracking-[0.12em] text-muted-foreground lg:inline">
          {t(locale, "app.tagline")}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex"
          aria-expanded={treesOpen}
          aria-controls={treesOpen ? "tree-rail" : undefined}
          onClick={onToggleTrees}
        >
          {treesOpen ? t(locale, "shell.hideTrees") : t(locale, "shell.showTrees")}
        </Button>
        {inspectorAvailable && (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={inspectorOpen}
            aria-controls={inspectorOpen ? "person-inspector" : undefined}
            onClick={onToggleInspector}
          >
            {inspectorOpen ? t(locale, "shell.hideInspector") : t(locale, "shell.showInspector")}
          </Button>
        )}
        <Select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
          className="h-9 w-auto text-xs"
          aria-label={t(locale, "trees.language")}
        >
          {(Object.keys(localeNames) as Locale[]).map((l) => (
            <option key={l} value={l}>
              {localeNames[l]}
            </option>
          ))}
        </Select>
        <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:inline">{email}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void auth.signout()}
        >
          {t(locale, "auth.signOut")}
        </Button>
      </div>
      </div>
    </header>
  );
}

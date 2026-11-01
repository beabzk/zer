import React, { useState, useRef, useEffect } from "react";
import type { Tree } from "../lib/types";
import { Icons } from "../components/ui/Icons";
import { formatRole } from "../lib/utils";
import { TreeForm } from "../components/forms/TreeForm";
import { authClient } from "../lib/auth";
import { useI18n } from "../lib/i18nContext";
import type { Locale } from "../lib/i18n";

interface TreeSelectPageProps {
  trees: Tree[];
  onSelectTree: (tree: Tree) => void;
  onRefreshTrees: () => void;
  isAdmin?: boolean;
  onNavigateAdmin?: () => void;
}

const handleSignOut = async () => {
  await authClient.signout();
  window.location.reload();
};

export const TreeSelectPage: React.FC<TreeSelectPageProps> = ({
  trees,
  onSelectTree,
  onRefreshTrees,
  isAdmin,
  onNavigateAdmin,
}) => {
  const [createTreeOpen, setCreateTreeOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();
  const { locale, setLocale, t, localeNames } = useI18n();

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="min-h-screen bg-stone-100/60 flex flex-col">
      {/* Top Simple Bar */}
      <header className="bg-white border-b border-stone-200 py-3.5 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-lg leading-none shadow-xs">
              ዘ
            </div>
            <span className="font-bold text-lg tracking-tight text-stone-900">
              ዘር <span className="text-xs font-mono font-normal text-stone-400">zer</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
                title={t("trees.language")}
              >
                <Icons.Globe size={14} className="text-stone-500" />
                <span className="hidden sm:inline">{localeNames[locale]}</span>
                <span className="sm:hidden uppercase">{locale}</span>
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
                        locale === loc
                          ? "font-bold text-amber-900 bg-amber-50/90"
                          : "text-stone-700"
                      }`}
                    >
                      <span>{localeNames[loc]}</span>
                      {locale === loc && <Icons.Check size={13} className="text-amber-700" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && onNavigateAdmin && (
              <button
                onClick={onNavigateAdmin}
                className="px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Icons.Shield size={15} /> {t("admin.panel")}
              </button>
            )}
            <div className="text-xs text-stone-500 hidden sm:inline">{session?.user?.email}</div>
            <button
              onClick={handleSignOut}
              className="text-xs text-stone-500 hover:text-stone-900 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              title={t("auth.signOut")}
            >
              <Icons.LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {t("trees.title")}
            </h1>
            <p className="text-sm text-stone-500 mt-1">{t("trees.switchHint")}</p>
          </div>

          <button
            onClick={() => setCreateTreeOpen(true)}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Icons.Plus size={16} /> {t("trees.create")}
          </button>
        </div>

        {trees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto">
              <Icons.Tree size={32} />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-stone-900">{t("trees.empty")}</h2>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {t("dashboard.welcomeDescription")}
              </p>
            </div>
            <button
              onClick={() => setCreateTreeOpen(true)}
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer inline-flex items-center gap-2"
            >
              <Icons.Plus size={16} /> {t("trees.create")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trees.map((tree) => (
              <div
                key={tree.id}
                onClick={() => onSelectTree(tree)}
                className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs hover:shadow-md hover:border-amber-300 transition-all cursor-pointer group flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                      {formatRole(tree.role)}
                    </span>
                    <span className="text-xs text-stone-400 font-mono">/{tree.slug}</span>
                  </div>

                  <h3 className="text-xl font-bold text-stone-900 group-hover:text-amber-900 transition-colors">
                    {tree.name}
                  </h3>

                  {tree.description && (
                    <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
                      {tree.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                  <span>SQLite</span>
                  <span className="text-amber-800 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    {t("treeInvite.openTree")} <Icons.ArrowRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <TreeForm
        isOpen={createTreeOpen}
        onClose={() => setCreateTreeOpen(false)}
        onSuccess={(newTree) => {
          onRefreshTrees();
          onSelectTree(newTree);
        }}
      />
    </div>
  );
};

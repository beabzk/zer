import React, { useState, useRef, useEffect } from "react";
import { Icons } from "./ui/Icons";
import type { Tree } from "../lib/types";
import { formatRole } from "../lib/utils";
import { authClient } from "../lib/auth";
import { useI18n } from "../lib/i18nContext";
import type { Locale } from "../lib/i18n";

interface HeaderProps {
  currentTree?: Tree | null;
  trees: Tree[];
  onSelectTree: (tree: Tree) => void;
  onOpenCreateTree: () => void;
  activeTab: string;
  onNavigateTab: (tab: string) => void;
  isAdmin?: boolean;
}

const handleSignOut = async () => {
  await authClient.signout();
  window.location.hash = "";
  window.location.reload();
};

export const Header: React.FC<HeaderProps> = ({
  currentTree,
  trees,
  onSelectTree,
  onOpenCreateTree,
  activeTab,
  onNavigateTab,
  isAdmin,
}) => {
  const [treeMenuOpen, setTreeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const treeMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const { data: session } = authClient.useSession();
  const { locale, setLocale, t, localeNames } = useI18n();

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (treeMenuRef.current && !treeMenuRef.current.contains(e.target as Node)) {
        setTreeMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const navItems = [
    { id: "overview", label: t("views.overview"), icon: Icons.Activity },
    { id: "people", label: t("views.people"), icon: Icons.Users },
    { id: "graph", label: t("views.canvas"), icon: Icons.Network },
    { id: "lineage", label: t("workspace.lineage"), icon: Icons.Lineage },
    { id: "kinship", label: t("views.kinship"), icon: Icons.Kinship },
    { id: "members", label: t("views.members"), icon: Icons.User },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Tree Selector */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => onNavigateTab("overview")}
              className="flex items-center gap-2.5 text-stone-900 group cursor-pointer text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-lg leading-none shadow-xs group-hover:bg-amber-800 transition-colors">
                ዘ
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-stone-900 flex items-center gap-1.5">
                  ዘር <span className="text-xs font-mono font-normal text-stone-400">zer</span>
                </span>
              </div>
            </button>

            {/* Tree Switcher */}
            {currentTree && (
              <div className="relative" ref={treeMenuRef}>
                <button
                  type="button"
                  onClick={() => setTreeMenuOpen(!treeMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 text-sm font-medium transition-colors cursor-pointer"
                >
                  <Icons.Tree size={16} className="text-amber-700 shrink-0" />
                  <span className="max-w-[85px] sm:max-w-[160px] md:max-w-[200px] truncate">
                    {currentTree.name}
                  </span>
                  <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-600 font-mono">
                    {currentTree.role === "OWNER"
                      ? t("admin.roleOwner")
                      : currentTree.role === "ADMIN"
                        ? t("admin.roleAdmin")
                        : currentTree.role === "EDITOR"
                          ? t("admin.roleEditor")
                          : currentTree.role === "VIEWER"
                            ? t("admin.roleViewer")
                            : formatRole(currentTree.role)}
                  </span>
                  <Icons.ChevronDown size={14} className="text-stone-400" />
                </button>

                {treeMenuOpen && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-xl border border-stone-200 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                      {t("trees.title")}
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-stone-50">
                      {trees.map((tItem) => (
                        <button
                          key={tItem.id}
                          onClick={() => {
                            onSelectTree(tItem);
                            setTreeMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-amber-50/60 transition-colors cursor-pointer ${
                            tItem.id === currentTree.id
                              ? "bg-amber-50/80 font-semibold text-amber-900"
                              : "text-stone-700"
                          }`}
                        >
                          <span className="truncate">{tItem.name}</span>
                          <span className="text-[10px] text-stone-400 font-mono">
                            {formatRole(tItem.role)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="pt-1.5 mt-1 border-t border-stone-100 px-2">
                      <button
                        onClick={() => {
                          setTreeMenuOpen(false);
                          onOpenCreateTree();
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-amber-800 hover:bg-amber-50 rounded-lg flex items-center gap-2 font-medium transition-colors cursor-pointer"
                      >
                        <Icons.Plus size={14} /> {t("trees.create")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Links (visible when inside a tree) */}
          {currentTree && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigateTab(item.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-stone-900 text-white shadow-xs"
                        : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                    }`}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right Menu (Language, Admin, User) */}
          <div className="flex items-center gap-2">
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

            {isAdmin && (
              <button
                onClick={() => onNavigateTab("admin")}
                className={`p-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === "admin"
                    ? "bg-amber-100 text-amber-900"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                }`}
                title={t("admin.title")}
              >
                <Icons.Shield size={17} />
                <span className="hidden sm:inline text-xs font-semibold">{t("admin.panel")}</span>
              </button>
            )}

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-700 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-semibold text-xs border border-amber-200">
                  {session?.user?.email ? session.user.email[0].toUpperCase() : "U"}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-stone-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-stone-100">
                    <p className="text-xs text-stone-400">Signed in as</p>
                    <p className="text-sm font-semibold text-stone-900 truncate mt-0.5">
                      {session?.user?.email}
                    </p>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium transition-colors cursor-pointer"
                    >
                      <Icons.LogOut size={16} /> {t("auth.signOut")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile nav bar */}
      {currentTree && (
        <div className="md:hidden border-t border-stone-100 bg-stone-50/80 px-2 py-1.5 flex items-center justify-around overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigateTab(item.id)}
                className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  isActive ? "text-amber-800 font-bold" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};

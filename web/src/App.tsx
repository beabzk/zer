import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "./lib/auth";
import { api, type Individual, type PersonHit, type Tree } from "./lib/api";
import { t, type Locale } from "./lib/i18n";
import {
  lastFocusKey,
  parseLocation,
  pathForView,
  treeIdFromPath,
  viewFromPath,
  viewNeedsFocus,
  type WorkspaceView,
} from "./lib/navigation";
import { Header } from "./components/layout/Header";
import { TreeSwitcher } from "./components/layout/TreeSwitcher";
import { LoginView } from "./components/visualization/LoginView";
import { DashboardOverview } from "./components/visualization/DashboardOverview";
import { PeopleDirectory } from "./components/visualization/PeopleDirectory";
import { GraphWorkspace } from "./components/visualization/GraphWorkspace";
import { LineageWorkspace } from "./components/visualization/LineageWorkspace";
import { KinshipWorkspace } from "./components/visualization/KinshipWorkspace";
import { AdminPanel } from "./components/visualization/AdminPanel";
import { IndividualForm } from "./components/forms/IndividualForm";
import { RelationshipForm, type RelationshipMode } from "./components/forms/RelationshipForm";
import { PersonWorkspace } from "./components/visualization/PersonWorkspace";
import { Button, Card, CardContent, Empty, Separator, Sheet, Skeleton, ToastProvider } from "./components/ui";

function storedLocale(): Locale {
  const raw = localStorage.getItem("zer-locale");
  return raw === "am" || raw === "om" || raw === "ti" ? raw : "en";
}

function initialTreeId(): string {
  return treeIdFromPath() || localStorage.getItem("zer-tree") || "";
}

const primaryViews: Array<{ id: WorkspaceView; label: string; eyebrow: string }> = [
  { id: "overview", label: "views.overview", eyebrow: "01" },
  { id: "people", label: "views.people", eyebrow: "02" },
  { id: "canvas", label: "views.canvas", eyebrow: "03" },
  { id: "pedigree", label: "views.pedigree", eyebrow: "04" },
  { id: "kinship", label: "views.kinship", eyebrow: "05" },
];

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [treeId, setTreeIdState] = useState(initialTreeId);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [treesReady, setTreesReady] = useState(false);
  const [view, setViewState] = useState<WorkspaceView>(() => viewFromPath());
  const [focus, setFocus] = useState<PersonHit | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<{ initial?: Individual } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [edgeMode, setEdgeMode] = useState<RelationshipMode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [treeMenuOpen, setTreeMenuOpen] = useState(false);

  const session = auth.useSession() as unknown as {
    data: { user: { email: string } } | null;
    isPending: boolean;
  };

  // Refs mirror the current location so navigation helpers can read the
  // latest view and tree without stale closures or impure state updaters.
  const viewRef = useRef(view);
  const treeRef = useRef(treeId);
  viewRef.current = view;
  treeRef.current = treeId;

  const setTreeId = useCallback((id: string) => {
    setTreeIdState(id);
    treeRef.current = id;
    if (id) {
      localStorage.setItem("zer-tree", id);
    } else {
      localStorage.removeItem("zer-tree");
    }
  }, []);

  const setView = useCallback((next: WorkspaceView, replace = false) => {
    setViewState(next);
    viewRef.current = next;
    const path = pathForView(next, treeRef.current);
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  }, []);

  const handleTreesLoaded = useCallback((list: Tree[]) => {
    setTrees(list);
    setTreesReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("zer-locale", locale);
  }, [locale]);

  // Keep view and tree selection in sync with the address bar.
  useEffect(() => {
    const onPopState = () => {
      const location = parseLocation(window.location.pathname);
      setViewState(location.view);
      viewRef.current = location.view;
      if (location.treeId) {
        setTreeId(location.treeId);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setTreeId]);

  useEffect(() => {
    if (!window.location.pathname || window.location.pathname === "/") {
      window.history.replaceState({}, "", pathForView(view, treeId));
    }
  }, [treeId, view]);

  useEffect(() => {
    if (!session.data) {
      setIsAdmin(false);
      return;
    }
    api.admin.status().then((status) => setIsAdmin(status.is_admin)).catch(() => setIsAdmin(false));
  }, [session.data]);

  const pickTree = useCallback((id: string) => {
    setTreeId(id);
    setFocus(null);
    setSelectedId("");
    setWorkspaceId(null);
    setTreeMenuOpen(false);
    // Preserve the workspace mode across trees. Views that need a
    // focused person fall back to the overview because focus is cleared.
    const next = viewNeedsFocus(viewRef.current) ? "overview" : viewRef.current;
    setViewState(next);
    viewRef.current = next;
    window.history.pushState({}, "", pathForView(next, id));
  }, [setTreeId]);

  const clearTree = useCallback(() => {
    setTreeId("");
    setFocus(null);
    setSelectedId("");
    setWorkspaceId(null);
    setViewState("overview");
    viewRef.current = "overview";
    window.history.pushState({}, "", pathForView("overview", ""));
  }, [setTreeId]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const openPerson = useCallback((person: PersonHit) => {
    setFocus(person);
    setSelectedId(person.id);
    const currentTree = treeRef.current;
    if (currentTree) {
      try {
        localStorage.setItem(lastFocusKey(currentTree), JSON.stringify(person));
      } catch {
        // Storage may be unavailable; the focus state still applies.
      }
    }
    // Overview selections lead into the graph workspace where the
    // person workspace panel is visible. Directory selections open the
    // workspace drawer instead and keep their search state.
    const currentView = viewRef.current;
    if (currentView === "overview") {
      setViewState("canvas");
      viewRef.current = "canvas";
      window.history.pushState({}, "", pathForView("canvas", currentTree));
    }
  }, []);

  const tree = useMemo(() => trees.find((candidate) => candidate.id === treeId), [treeId, trees]);

  const startAddPerson = () => {
    setEditor({});
  };

  const openEditor = (person: Individual) => {
    setEditor({ initial: person });
  };

  // Directory selection opens the workspace drawer. The directory keeps
  // its search state because the view never changes.
  const openWorkspace = useCallback((person: PersonHit) => {
    setWorkspaceId(person.id);
  }, []);

  const closeWorkspace = useCallback(() => {
    setWorkspaceId(null);
  }, []);

  const handlePersonSaved = useCallback((person: Individual) => {
    setFocus({
      id: person.id,
      full_native: person.full_native,
      full_latin: person.full_latin,
      gender: person.gender,
    });
    setSelectedId(person.id);
    refresh();
  }, [refresh]);

  const handlePersonDeleted = useCallback(() => {
    setFocus(null);
    setSelectedId("");
    setWorkspaceId(null);
    refresh();
  }, [refresh]);

  if (session.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">{t(locale, "common.loading")}</p>;
  }
  if (!session.data) {
    return <LoginView locale={locale} />;
  }

  const nav = (next: WorkspaceView) => setView(next);
  const focusId = focus?.id ?? "";
  // The stored id may reference a tree the user can no longer access.
  const treeInaccessible = Boolean(treeId && treesReady && trees.length > 0 && !tree);
  const bottomItems: Array<{ id: WorkspaceView; label: string }> = isAdmin
    ? [...primaryViews, { id: "admin" as WorkspaceView, label: "admin.panel" }]
    : primaryViews;

  return (
    <ToastProvider>
    <div className="min-h-screen bg-background">
      <Header locale={locale} onLocaleChange={setLocale} email={session.data.user.email} />
      <div className="mx-auto grid max-w-[1600px] md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-panel/50 md:block">
          <div className="sticky top-0 flex h-[calc(100vh-4rem)] flex-col">
            <TreeSwitcher locale={locale} activeId={treeId} onSelect={pickTree} refreshKey={refreshKey} isAdmin={isAdmin} onTreesLoaded={handleTreesLoaded} />
            <div className="mt-auto p-4">
              <Separator />
              <p className="pt-4 text-xs leading-5 text-muted-foreground">{t(locale, "app.shellHint")}</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 pb-20 md:pb-0">
          <div className="border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <div className="relative md:hidden">
                  <Button variant="outline" size="sm" onClick={() => setTreeMenuOpen((open) => !open)} aria-expanded={treeMenuOpen}>
                    {tree?.name ?? t(locale, "trees.title")}
                  </Button>
                  {treeMenuOpen && (
                    <div className="absolute left-0 top-11 z-20 w-[min(88vw,320px)] rounded-lg border border-border bg-panel p-2 shadow-panel">
                      <TreeSwitcher locale={locale} activeId={treeId} onSelect={pickTree} refreshKey={refreshKey} isAdmin={isAdmin} onTreesLoaded={handleTreesLoaded} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {treeId && !treesReady ? <Skeleton className="h-3 w-32" /> : (tree?.name ?? t(locale, "dashboard.workspace"))}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tree ? t(locale, "dashboard.workspaceHint") : t(locale, "dashboard.chooseTree")}</p>
                </div>
              </div>
              {treeId && !treeInaccessible && <Button size="sm" onClick={startAddPerson}>{t(locale, "person.add")}</Button>}
            </div>
            <nav className="mt-5 hidden gap-1 overflow-x-auto pb-1 md:flex" aria-label={t(locale, "dashboard.navigation")}>
              {primaryViews.map((item) => (
                <button
                  key={item.id}
                  onClick={() => nav(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${view === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-panel-muted hover:text-foreground"}`}
                >
                  <span className="font-mono text-[10px] opacity-60">{item.eyebrow}</span>{t(locale, item.label)}
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => nav("admin")}
                  aria-current={view === "admin" ? "page" : undefined}
                  className={`ml-auto flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${view === "admin" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-panel-muted hover:text-foreground"}`}
                >
                  {t(locale, "admin.panel")}
                </button>
              )}
            </nav>
          </div>

          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {view === "admin" && isAdmin ? <AdminPanel locale={locale} /> : treeInaccessible ? (
              <Empty
                title={t(locale, "shell.forbiddenTitle")}
                description={t(locale, "shell.forbiddenDescription")}
                action={<Button variant="outline" onClick={clearTree}>{t(locale, "shell.clearSelection")}</Button>}
              />
            ) : view === "overview" ? (
              <DashboardOverview
                locale={locale}
                tree={tree}
                treeId={treeInaccessible ? "" : treeId}
                onAddPerson={startAddPerson}
                onExplore={() => nav(focusId ? "canvas" : "people")}
                onSelectPerson={openPerson}
                onTreeCreated={(id) => { pickTree(id); refresh(); }}
              />
            ) : !treeId ? <Empty title={t(locale, "dashboard.chooseTree")} description={t(locale, "dashboard.chooseTreeDescription")} /> : view === "people" ? <PeopleDirectory locale={locale} treeId={treeId} onAdd={startAddPerson} onSelect={openWorkspace} /> : view === "kinship" ? <KinshipWorkspace locale={locale} treeId={treeId} onSelectPerson={openWorkspace} /> : !focusId || !focus ? <Card><CardContent className="p-6"><Empty title={t(locale, "canvas.empty")} description={t(locale, "dashboard.focusDescription")} /></CardContent></Card> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">{view === "canvas" && <GraphWorkspace locale={locale} treeId={treeId} focus={focus} selectedId={selectedId} onSelect={setSelectedId} refreshKey={refreshKey} />}{(view === "pedigree" || view === "cards") && <LineageWorkspace locale={locale} treeId={treeId} rootId={focusId} refreshKey={refreshKey} onSelect={setSelectedId} />}{selectedId && <PersonWorkspace locale={locale} treeId={treeId} personId={selectedId} refreshKey={refreshKey} onEdit={openEditor} onEdge={setEdgeMode} onFocus={() => nav("canvas")} onSelectPerson={(person) => { setFocus(person); setSelectedId(person.id); }} />}</div>}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel/95 backdrop-blur md:hidden" aria-label={t(locale, "dashboard.navigation")}>
        <div className={`grid ${isAdmin ? "grid-cols-6" : "grid-cols-5"}`}>
          {bottomItems.map((item) => (
            <button
              key={item.id}
              onClick={() => nav(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${view === item.id ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span className={`h-1 w-6 rounded-full ${view === item.id ? "bg-accent" : "bg-transparent"}`} aria-hidden="true" />
              <span className="w-full truncate text-center leading-tight">{t(locale, item.label)}</span>
            </button>
          ))}
        </div>
      </nav>

      <Sheet open={editor !== null} onClose={() => setEditor(null)}>
        {editor && treeId && (
          <IndividualForm
            locale={locale}
            treeId={treeId}
            initial={editor.initial}
            canDelete={isAdmin || tree?.role !== "VIEWER"}
            onClose={() => setEditor(null)}
            onSaved={handlePersonSaved}
            onDeleted={handlePersonDeleted}
          />
        )}
      </Sheet>
      <Sheet open={workspaceId !== null} onClose={closeWorkspace}>
        {workspaceId && (
          <PersonWorkspace
            locale={locale}
            treeId={treeId}
            personId={workspaceId}
            refreshKey={refreshKey}
            onEdit={openEditor}
            onEdge={setEdgeMode}
            onFocus={(person) => { setFocus(person); setSelectedId(person.id); closeWorkspace(); nav("canvas"); }}
            onSelectPerson={(person) => setWorkspaceId(person.id)}
          />
        )}
      </Sheet>
      <Sheet open={edgeMode !== null} onClose={() => setEdgeMode(null)}>
        {edgeMode && (
          <RelationshipForm
            locale={locale}
            treeId={treeId}
            mode={edgeMode}
            onClose={() => setEdgeMode(null)}
            onSaved={refresh}
          />
        )}
      </Sheet>
    </div>
    </ToastProvider>
  );
}

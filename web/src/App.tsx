import { useCallback, useEffect, useState } from "react";
import { auth } from "./lib/auth";
import { api, type Individual, type PersonHit } from "./lib/api";
import { t, type Locale } from "./lib/i18n";
import { Header } from "./components/layout/Header";
import { TreeSwitcher } from "./components/layout/TreeSwitcher";
import { LoginView } from "./components/visualization/LoginView";
import { FamilyCanvas } from "./components/visualization/FamilyCanvas";
import { PedigreeTree } from "./components/visualization/PedigreeTree";
import { LineageCards } from "./components/visualization/LineageCards";
import { KinshipFinder } from "./components/visualization/KinshipFinder";
import { AdminPanel } from "./components/visualization/AdminPanel";
import { IndividualModal } from "./components/forms/IndividualModal";
import { EdgeModal, type EdgeMode } from "./components/forms/EdgeModal";
import { SearchSelect } from "./components/forms/SearchSelect";

type View = "canvas" | "pedigree" | "cards" | "kinship" | "admin";

function storedLocale(): Locale {
  const raw = localStorage.getItem("zer-locale");
  return raw === "am" || raw === "om" || raw === "ti" ? raw : "en";
}

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [treeId, setTreeId] = useState(() => localStorage.getItem("zer-tree") ?? "");
  const [view, setView] = useState<View>("canvas");
  const [focus, setFocus] = useState<PersonHit | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Individual | null>(null);
  const [depth, setDepth] = useState(3);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [editing, setEditing] = useState<Individual | undefined>(undefined);
  const [edgeMode, setEdgeMode] = useState<EdgeMode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const session = auth.useSession() as unknown as {
    data: { user: { email: string } } | null;
    isPending: boolean;
  };

  useEffect(() => {
    localStorage.setItem("zer-locale", locale);
  }, [locale]);

  useEffect(() => {
    if (!session.data) {
      setIsAdmin(false);
      return;
    }
    api.admin
      .status()
      .then((s) => setIsAdmin(s.is_admin))
      .catch(() => setIsAdmin(false));
  }, [session.data]);

  const pickTree = (id: string) => {
    setTreeId(id);
    localStorage.setItem("zer-tree", id);
    setFocus(null);
    setSelectedId("");
    setSelected(null);
  };

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!treeId || !selectedId) {
      setSelected(null);
      return;
    }
    let live = true;
    api.individuals
      .get(treeId, selectedId)
      .then((p) => {
        if (live) setSelected(p);
      })
      .catch(() => {
        if (live) setSelected(null);
      });
    return () => {
      live = false;
    };
  }, [treeId, selectedId, refreshKey]);

  if (session.isPending) {
    return <p className="p-4 text-sm">{t(locale, "common.loading")}</p>;
  }
  if (!session.data) {
    return <LoginView locale={locale} />;
  }

  const focusId = focus?.id ?? "";

  return (
    <div className="min-h-screen bg-gray-50">
      <Header locale={locale} onLocaleChange={setLocale} email={session.data.user.email} />
      <div className="flex flex-col md:flex-row">
        <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r bg-white">
          <TreeSwitcher locale={locale} activeId={treeId} onSelect={pickTree} refreshKey={refreshKey} isAdmin={isAdmin} />
        </aside>
        <main className="flex-1 min-w-0">
          <nav className="flex gap-1 px-4 pt-3">
            {(["canvas", "pedigree", "cards", "kinship"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-sm rounded ${
                  view === v ? "bg-black text-white" : "border bg-white"
                }`}
              >
                {t(locale, `views.${v}`)}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => setView("admin")}
                className={`px-3 py-1 text-sm rounded ${
                  view === "admin" ? "bg-black text-white" : "border bg-white"
                }`}
              >
                {t(locale, "admin.panel")}
              </button>
            )}
          </nav>
          {view === "admin" && isAdmin ? (
            <AdminPanel locale={locale} />
          ) : !treeId ? (
            <p className="p-4 text-sm text-gray-500">{t(locale, "trees.empty")}</p>
          ) : (
            <>
              {!focusId && view !== "kinship" ? (
                <div className="p-4 max-w-md space-y-3">
                  <SearchSelect
                    locale={locale}
                    treeId={treeId}
                    value={focus}
                    onChange={setFocus}
                  />
                  <button
                    onClick={() => {
                      setEditing(undefined);
                      setShowPersonModal(true);
                    }}
                    className="px-4 py-2 text-sm bg-black text-white rounded"
                  >
                    {t(locale, "person.add")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row">
                  <div className="flex-1 min-w-0">
                    {view === "canvas" && focusId && (
                      <FamilyCanvas
                        locale={locale}
                        treeId={treeId}
                        focusId={focusId}
                        depth={depth}
                        onDepthChange={setDepth}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        refreshKey={refreshKey}
                      />
                    )}
                    {view === "pedigree" && focusId && (
                      <PedigreeTree
                        locale={locale}
                        treeId={treeId}
                        rootId={focusId}
                        refreshKey={refreshKey}
                        onSelect={setSelectedId}
                      />
                    )}
                    {view === "cards" && focusId && (
                      <LineageCards
                        locale={locale}
                        treeId={treeId}
                        rootId={focusId}
                        refreshKey={refreshKey}
                        onSelect={setSelectedId}
                      />
                    )}
                    {view === "kinship" && <KinshipFinder locale={locale} treeId={treeId} />}
                  </div>
                  {selected && (
                    <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l bg-white p-4">
                      <PersonPanel
                        locale={locale}
                        person={selected}
                        onEdit={() => {
                          setEditing(selected);
                          setShowPersonModal(true);
                        }}
                        onEdge={(mode) => setEdgeMode(mode)}
                        onFocus={() => {
                          setFocus({
                            id: selected.id,
                            full_native: selected.full_native,
                            full_latin: selected.full_latin,
                            gender: selected.gender,
                          });
                          setView("canvas");
                        }}
                      />
                    </aside>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {showPersonModal && (
        <IndividualModal
          locale={locale}
          treeId={treeId}
          initial={editing}
          onClose={() => setShowPersonModal(false)}
          onSaved={(p) => {
            if (!focus) {
              setFocus({
                id: p.id,
                full_native: p.full_native,
                full_latin: p.full_latin,
                gender: p.gender,
              });
            }
            setSelectedId(p.id);
            refresh();
          }}
        />
      )}
      {edgeMode && (
        <EdgeModal
          locale={locale}
          treeId={treeId}
          mode={edgeMode}
          onClose={() => setEdgeMode(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function PersonPanel({
  locale,
  person,
  onEdit,
  onEdge,
  onFocus,
}: {
  locale: Locale;
  person: Individual;
  onEdit: () => void;
  onEdge: (mode: EdgeMode) => void;
  onFocus: () => void;
}) {
  const anchor: PersonHit = {
    id: person.id,
    full_native: person.full_native,
    full_latin: person.full_latin,
    gender: person.gender,
  };
  const btn = "w-full px-3 py-1 text-sm border rounded text-left hover:bg-gray-50";
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{person.full_latin}</h3>
      <p className="text-sm text-gray-600">{person.full_native}</p>
      {person.birth_date_gc && (
        <p className="text-xs text-gray-500">
          {t(locale, "person.birth")}: {person.birth_date_gc}
        </p>
      )}
      <button className={btn} onClick={onEdit}>{t(locale, "person.edit")}</button>
      <button className={btn} onClick={onFocus}>{t(locale, "canvas.focus")}</button>
      <button className={btn} onClick={() => onEdge({ kind: "parent", child: anchor })}>
        {t(locale, "edge.addParent")}
      </button>
      <button className={btn} onClick={() => onEdge({ kind: "child", parent: anchor })}>
        {t(locale, "edge.addChild")}
      </button>
      <button className={btn} onClick={() => onEdge({ kind: "union", partner: anchor })}>
        {t(locale, "edge.addUnion")}
      </button>
    </div>
  );
}

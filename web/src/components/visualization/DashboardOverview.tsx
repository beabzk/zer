import { useEffect, useState } from "react";
import { ApiError, api, type PersonHit, type Tree, type TreeStats } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { lastFocusKey } from "../../lib/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Input,
  Skeleton,
} from "../ui";

interface Props {
  locale: Locale;
  tree?: Tree;
  treeId: string;
  onAddPerson: () => void;
  onExplore: () => void;
  onSelectPerson: (person: PersonHit) => void;
  onTreeCreated: (id: string) => void;
}

const metricKeys = [
  "trees.individuals",
  "trees.edges",
  "trees.unions",
  "dashboard.events",
  "trees.members",
] as const;

function metricValue(stats: TreeStats | null, key: (typeof metricKeys)[number]): number | undefined {
  switch (key) {
    case "trees.individuals":
      return stats?.individuals;
    case "trees.edges":
      return stats?.edges;
    case "trees.unions":
      return stats?.unions;
    case "dashboard.events":
      return stats?.events;
    case "trees.members":
      return stats?.members;
  }
}

export function DashboardOverview({ locale, tree, treeId, onAddPerson, onExplore, onSelectPerson, onTreeCreated }: Props) {
  const [stats, setStats] = useState<TreeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(Boolean(treeId));
  const [statsError, setStatsError] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(Boolean(treeId));
  const [peopleError, setPeopleError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [lastFocus, setLastFocus] = useState<PersonHit | null>(null);
  const [newTreeName, setNewTreeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Stats and the people preview load independently so one failure
  // still leaves the other visible with a retry affordance.
  useEffect(() => {
    if (!treeId) return;
    let live = true;
    setStatsLoading(true);
    setPeopleLoading(true);
    setStatsError("");
    setPeopleError("");
    api.trees.stats(treeId)
      .then((next) => {
        if (live) setStats(next);
      })
      .catch((e) => {
        if (live) setStatsError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      })
      .finally(() => {
        if (live) setStatsLoading(false);
      });
    api.individuals.list(treeId)
      .then((next) => {
        if (live) setPeople(next.slice(0, 6));
      })
      .catch((e) => {
        if (live) setPeopleError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      })
      .finally(() => {
        if (live) setPeopleLoading(false);
      });
    return () => {
      live = false;
    };
  }, [locale, treeId, loadKey]);

  // Continue-exploring slot backed by the last focused person per tree.
  // The overview endpoint in Phase 2 will replace this local slot.
  useEffect(() => {
    if (!treeId) {
      setLastFocus(null);
      return;
    }
    try {
      const raw = localStorage.getItem(lastFocusKey(treeId));
      setLastFocus(raw ? (JSON.parse(raw) as PersonHit) : null);
    } catch {
      setLastFocus(null);
    }
  }, [treeId]);

  const retry = () => setLoadKey((key) => key + 1);

  const createTree = async () => {
    const name = newTreeName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await api.trees.create({ name });
      setNewTreeName("");
      onTreeCreated(created.id);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    } finally {
      setCreating(false);
    }
  };

  if (!treeId) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden bg-foreground text-background">
          <CardContent className="relative flex min-h-80 flex-col justify-end p-6 sm:p-8">
            <div className="absolute right-8 top-8 size-28 rounded-full border border-background/20" />
            <div className="absolute right-20 top-20 size-16 rounded-full border border-background/20" />
            <Badge className="w-fit bg-background/15 text-background">{t(locale, "app.title")}</Badge>
            <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">{t(locale, "dashboard.welcome")}</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-background/70">{t(locale, "dashboard.welcomeDescription")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t(locale, "dashboard.startTitle")}</CardTitle>
            <CardDescription>{t(locale, "dashboard.startDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="dashboard-tree-name">
              {t(locale, "dashboard.createTree")}
            </label>
            <Input
              id="dashboard-tree-name"
              value={newTreeName}
              onChange={(e) => setNewTreeName(e.target.value)}
              placeholder={t(locale, "trees.name")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createTree();
              }}
            />
            {createError && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{createError}</p>}
            <Button onClick={() => void createTree()} disabled={creating || !newTreeName.trim()}>
              {creating ? t(locale, "common.loading") : t(locale, "dashboard.createTree")}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">{t(locale, "dashboard.startHint")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "dashboard.overview")}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-none sm:text-5xl">{tree?.name ?? t(locale, "trees.title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{tree?.description || t(locale, "dashboard.description")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExplore}>{t(locale, "dashboard.explore")}</Button>
          <Button onClick={onAddPerson}>{t(locale, "person.add")}</Button>
        </div>
      </section>

      {(statsError || peopleError) && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p>{statsError || peopleError}</p>
          <Button size="sm" variant="outline" onClick={retry}>{t(locale, "common.retry")}</Button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={t(locale, "dashboard.overview")}>
        {metricKeys.map((key) => {
          const value = metricValue(stats, key);
          return (
            <Card key={key}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, key)}</p>
                {statsLoading || value === undefined ? <Skeleton className="mt-3 h-9 w-16" /> : <p className="mt-3 font-display text-3xl font-semibold">{value}</p>}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t(locale, "dashboard.peopleTitle")}</CardTitle>
            <CardDescription>{t(locale, "dashboard.peopleDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {peopleLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((row) => <Skeleton key={row} className="h-16 w-full" />)}
              </div>
            ) : people.length === 0 ? (
              <Empty title={t(locale, "dashboard.emptyPeople")} description={t(locale, "dashboard.emptyPeopleDescription")} action={<Button onClick={onAddPerson}>{t(locale, "person.add")}</Button>} />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {people.map((person) => (
                  <button key={person.id} onClick={() => onSelectPerson(person)} className="rounded-md border border-border bg-panel px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className="block truncate text-sm font-semibold">{person.full_latin}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{person.full_native}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {lastFocus && (
            <Card>
              <CardHeader>
                <CardTitle>{t(locale, "dashboard.continueTitle")}</CardTitle>
                <CardDescription>{t(locale, "dashboard.continueDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <button onClick={() => onSelectPerson(lastFocus)} className="w-full rounded-md border border-border bg-panel px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span className="block truncate text-sm font-semibold">{lastFocus.full_latin}</span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{lastFocus.full_native}</span>
                </button>
              </CardContent>
            </Card>
          )}
          <Card className="bg-panel-muted/60">
            <CardHeader>
              <CardTitle>{t(locale, "dashboard.nextTitle")}</CardTitle>
              <CardDescription>{t(locale, "dashboard.nextDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button variant="secondary" onClick={onExplore}>{t(locale, "dashboard.openGraph")}</Button>
              <Button variant="outline" onClick={onAddPerson}>{t(locale, "dashboard.recordPerson")}</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

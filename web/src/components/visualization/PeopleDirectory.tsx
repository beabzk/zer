import { useEffect, useState } from "react";
import { ApiError, api, type DirectoryOrder, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Select, Skeleton } from "../ui";

const pageSize = 12;

const orderOptions: DirectoryOrder[] = ["created", "recent", "name"];

export function PeopleDirectory({ locale, treeId, onAdd, onSelect }: { locale: Locale; treeId: string; onAdd: () => void; onSelect: (person: PersonHit) => void }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<DirectoryOrder>("created");
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      api.individuals.list(treeId, query || undefined, { limit: pageSize, offset: page * pageSize, order })
        .then((next) => {
          if (!live) return;
          setPeople(next.individuals);
          setTotal(next.total);
        })
        .catch((e) => {
          if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [locale, query, order, page, treeId, loadKey]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "views.people")}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">{t(locale, "people.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(locale, "people.description")}</p>
        </div>
        <Button onClick={onAdd}>{t(locale, "person.add")}</Button>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "people.directory")}</CardTitle>
          <CardDescription>{t(locale, "people.searchDescription")}</CardDescription>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="people-search">
                {t(locale, "person.search")}
              </label>
              <Input
                id="people-search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder={t(locale, "person.search")}
                className="mt-2 h-11"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="people-order">
                {t(locale, "people.order")}
              </label>
              <Select
                id="people-order"
                value={order}
                onChange={(e) => { setOrder(e.target.value as DirectoryOrder); setPage(0); }}
                className="mt-2 h-11"
              >
                {orderOptions.map((option) => (
                  <option key={option} value={option}>{t(locale, `people.order_${option}`)}</option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
                {t(locale, "common.retry")}
              </Button>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-2">{[1, 2, 3].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
          ) : people.length === 0 ? (
            <Empty title={t(locale, "people.empty")} description={t(locale, "people.emptyDescription")} action={<Button onClick={onAdd}>{t(locale, "person.add")}</Button>} />
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {total} {t(locale, "trees.individuals")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {people.map((person) => (
                  <button key={person.id} onClick={() => onSelect(person)} className="rounded-md border border-border bg-panel px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className="block truncate text-sm font-semibold">{person.full_latin}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{person.full_native}</span>
                    <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{person.gender === "FEMALE" ? t(locale, "person.female") : t(locale, "person.male")}</span>
                  </button>
                ))}
              </div>
              {pageCount > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    {t(locale, "common.previous")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t(locale, "people.page")} {page + 1} / {pageCount}</p>
                  <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                    {t(locale, "common.next")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

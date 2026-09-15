import { useEffect, useRef, useState } from "react";
import { ApiError, api, type DirectoryOrder, type PersonHit } from "../../lib/api";
import { formatLifeYears } from "../../lib/personSummary";
import { t, type Locale } from "../../lib/i18n";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Select, Skeleton } from "../ui";

const pageSize = 24;

const orderOptions: DirectoryOrder[] = ["created", "recent", "name"];

export function PeopleDirectory({ locale, treeId, onAdd, onSelect }: { locale: Locale; treeId: string; onAdd: () => void; onSelect: (person: PersonHit) => void }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<DirectoryOrder>("created");
  const [gender, setGender] = useState<"ALL" | "MALE" | "FEMALE">("ALL");
  const [status, setStatus] = useState<"ALL" | "LIVING" | "DECEASED">("ALL");
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      api.individuals.list(treeId, query || undefined, {
        limit: pageSize,
        offset: page * pageSize,
        order,
        gender: gender === "ALL" ? undefined : gender,
        deceased: status === "ALL" ? undefined : status === "DECEASED",
      })
        .then((next) => {
          if (!live) return;
          setPeople(next.individuals);
          setTotal(next.total);
          setActiveIndex(0);
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
  }, [locale, query, order, gender, status, page, treeId, loadKey]);

  const resetPage = () => setPage(0);

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (people.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(people.length - 1, Math.max(0, activeIndex + delta));
      setActiveIndex(next);
      rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && people[activeIndex]) {
      onSelect(people[activeIndex]);
    }
  };

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
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="people-search">
                {t(locale, "person.search")}
              </label>
              <Input
                id="people-search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); resetPage(); }}
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
                onChange={(e) => { setOrder(e.target.value as DirectoryOrder); resetPage(); }}
                className="mt-2 h-11"
              >
                {orderOptions.map((option) => (
                  <option key={option} value={option}>{t(locale, `people.order_${option}`)}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="people-gender">
                {t(locale, "person.gender")}
              </label>
              <Select
                id="people-gender"
                value={gender}
                onChange={(e) => { setGender(e.target.value as "ALL" | "MALE" | "FEMALE"); resetPage(); }}
                className="mt-2 h-11"
              >
                <option value="ALL">{t(locale, "people.all")}</option>
                <option value="MALE">{t(locale, "person.male")}</option>
                <option value="FEMALE">{t(locale, "person.female")}</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" htmlFor="people-status">
                {t(locale, "people.status")}
              </label>
              <Select
                id="people-status"
                value={status}
                onChange={(e) => { setStatus(e.target.value as "ALL" | "LIVING" | "DECEASED"); resetPage(); }}
                className="mt-2 h-11"
              >
                <option value="ALL">{t(locale, "people.all")}</option>
                <option value="LIVING">{t(locale, "person.living")}</option>
                <option value="DECEASED">{t(locale, "person.deceased")}</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
                {t(locale, "common.retry")}
              </Button>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-2">{[1, 2, 3].map((row) => <Skeleton key={row} className="h-24 w-full" />)}</div>
          ) : people.length === 0 ? (
            <Empty title={t(locale, "people.empty")} description={t(locale, "people.emptyDescription")} action={<Button onClick={onAdd}>{t(locale, "person.add")}</Button>} />
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {total} {t(locale, "trees.individuals")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="listbox" aria-label={t(locale, "people.directory")} onKeyDown={onListKeyDown}>
                {people.map((person, index) => (
                  <button
                    key={person.id}
                    ref={(el) => { rowRefs.current[index] = el; }}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => onSelect(person)}
                    className={`min-h-24 rounded-md border bg-panel px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${index === activeIndex ? "border-accent bg-accent-soft" : "border-border hover:border-accent"}`}
                  >
                    <span className="block truncate text-sm font-semibold">{person.full_latin}</span>
                    <span className="mt-1 block truncate text-sm text-foreground/80">{person.full_native}</span>
                    <span className="mt-3 block text-xs text-muted-foreground">
                      {[
                        formatLifeYears(person),
                        person.is_deceased ? t(locale, "person.deceased") : t(locale, "person.living"),
                        person.gender === "FEMALE" ? t(locale, "person.female") : t(locale, "person.male"),
                      ].filter(Boolean).join(" · ")}
                    </span>
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

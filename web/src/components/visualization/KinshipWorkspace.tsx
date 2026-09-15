import { useState } from "react";
import { ApiError, api, type KinshipResult, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { kinshipConfidenceLabel, kinshipTermLabel } from "../../lib/kinshipTerms";
import { SearchSelect } from "../forms/SearchSelect";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Skeleton } from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  onSelectPerson: (person: PersonHit) => void;
}

export function relationLabelKey(relation: string): string {
  switch (relation) {
    case "PARENT":
      return "kinship.parent";
    case "CHILD":
      return "kinship.child";
    case "SPOUSE":
      return "kinship.spouse";
    default:
      return relation;
  }
}

function relationLabel(locale: Locale, relation: string): string {
  const key = relationLabelKey(relation);
  return key === relation ? relation : t(locale, key);
}

export function KinshipWorkspace({ locale, treeId, onSelectPerson }: Props) {
  const [a, setA] = useState<PersonHit | null>(null);
  const [b, setB] = useState<PersonHit | null>(null);
  const [result, setResult] = useState<KinshipResult | null>(null);
  const [names, setNames] = useState<Record<string, PersonHit>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const swap = () => {
    setA(b);
    setB(a);
    setResult(null);
    setError("");
  };

  const find = async () => {
    if (!a || !b) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const res = await api.analysis.kinship(treeId, a.id, b.id);
      setNames(res.individuals);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "kinship.none"));
    } finally {
      setBusy(false);
    }
  };

  const label = (id: string, fallback: string) => names[id]?.full_latin ?? fallback;
  const segments = result?.segments ?? [];
  const isSelf = result !== null && (result.degrees_of_sep === 0 || result.path_key === "self");
  const primaryTerm = result === null ? "" : kinshipTermLabel(locale, result.term);
  const confidenceLabel = result === null ? "" : kinshipConfidenceLabel(locale, result.term);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "views.kinship")}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">{t(locale, "kinship.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(locale, "kinship.description")}</p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "kinship.find")}</CardTitle>
          <CardDescription>{t(locale, "kinship.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(locale, "kinship.personA")}</span>
              <SearchSelect locale={locale} treeId={treeId} value={a} onChange={(person) => { setA(person); setResult(null); }} />
            </div>
            <Button variant="outline" size="sm" onClick={swap} disabled={!a && !b} aria-label={t(locale, "kinship.swap")}>
              {t(locale, "kinship.swap")}
            </Button>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(locale, "kinship.personB")}</span>
              <SearchSelect locale={locale} treeId={treeId} value={b} onChange={(person) => { setB(person); setResult(null); }} />
            </div>
          </div>
          <div>
            <Button onClick={() => void find()} disabled={busy || !a || !b}>
              {busy ? t(locale, "common.loading") : t(locale, "kinship.find")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {busy && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      )}

      {error && !busy && <Empty title={t(locale, "kinship.none")} description={t(locale, "kinship.noPathDescription")} />}

      {result && !busy && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isSelf
                ? t(locale, "kinship.self")
                : primaryTerm}
            </CardTitle>
            <CardDescription>
              {isSelf
                ? t(locale, "kinship.selfHint")
                : `${label(a?.id ?? "", "")} · ${label(b?.id ?? "", "")} · ${result.degrees_of_sep} ${t(locale, "kinship.degrees")}`}
            </CardDescription>
            {(result.secondary_terms?.length || confidenceLabel) && (
              <div className="flex flex-wrap items-center gap-2">
                {result.secondary_terms?.map((term, index) => (
                  <Badge key={`${term.key}-${index}`}>{kinshipTermLabel(locale, term)}</Badge>
                ))}
                {confidenceLabel && <Badge variant="warning">{confidenceLabel}</Badge>}
              </div>
            )}
          </CardHeader>
          {!isSelf && (
            <CardContent>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t(locale, "kinship.steps")}
              </h3>
              <ol className="flex flex-col gap-2">
                {segments.map((segment, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel px-3 py-2">
                    <button
                      onClick={() => names[segment.from_id] && onSelectPerson(names[segment.from_id])}
                      className="min-w-0 flex-1 truncate rounded text-left text-sm font-semibold hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {label(segment.from_id, segment.from_id)}
                    </button>
                    <Badge variant="accent">{relationLabel(locale, segment.relation)}</Badge>
                    <button
                      onClick={() => names[segment.to_id] && onSelectPerson(names[segment.to_id])}
                      className="min-w-0 flex-1 truncate rounded text-right text-sm font-semibold hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {label(segment.to_id, segment.to_id)}
                    </button>
                  </li>
                ))}
              </ol>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

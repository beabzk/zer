import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type Individual,
  type LineageNode,
  type OverviewEvent,
  type PersonDetail,
  type PersonHit,
} from "../../lib/api";
import { months, t, type Locale } from "../../lib/i18n";
import { pathKey } from "./pedigree";
import { type RelationshipMode } from "../forms/RelationshipForm";
import { EventForm } from "../forms/EventForm";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  Select,
  Sheet,
  Skeleton,
} from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  personId: string;
  refreshKey: number;
  onEdit: (person: Individual) => void;
  onEdge: (mode: RelationshipMode) => void;
  onFocus: (person: PersonHit) => void;
  onSelectPerson: (person: PersonHit) => void;
}

function formatEC(locale: Locale, year?: number, month?: number, day?: number): string | undefined {
  if (year == null && month == null && day == null) return undefined;
  const names = months(locale);
  const parts: string[] = [];
  if (day != null) parts.push(String(day));
  if (month != null && names[month - 1]) parts.push(names[month - 1]);
  if (year != null) parts.push(String(year));
  return parts.join(" ");
}

function parseTitles(raw?: string): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function PersonWorkspace({ locale, treeId, personId, refreshKey, onEdit, onEdge, onFocus, onSelectPerson }: Props) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [direction, setDirection] = useState<"ancestors" | "descendants">("ancestors");
  const [lineageDepth, setLineageDepth] = useState(3);
  const [lineage, setLineage] = useState<LineageNode[]>([]);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [eventEditor, setEventEditor] = useState<{ initial?: OverviewEvent } | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setDetail(null);
    api.individuals.detail(treeId, personId)
      .then((next) => {
        if (live) setDetail(next);
      })
      .catch((e) => {
        if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [locale, treeId, personId, loadKey, refreshKey]);

  useEffect(() => {
    if (!lineageOpen) return;
    let live = true;
    setLineageLoading(true);
    api.analysis.lineage(treeId, personId, direction, lineageDepth)
      .then((res) => {
        if (!live) return;
        setLineage(res.nodes.slice(0, 30));
      })
      .catch(() => {
        if (live) setLineage([]);
      })
      .finally(() => {
        if (live) setLineageLoading(false);
      });
    return () => {
      live = false;
    };
  }, [lineageOpen, treeId, personId, direction, lineageDepth]);

  if (loading) {
    return (
      <Card className="h-fit">
        <CardHeader><Skeleton className="h-7 w-40" /></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card className="h-fit">
        <CardContent className="flex flex-col gap-3 p-5">
          <p role="alert" className="text-sm text-destructive">{error || t(locale, "common.error")}</p>
          <Button size="sm" variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
            {t(locale, "common.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const person = detail.individual;
  const canEdit = detail.permissions.can_edit;
  const anchor: PersonHit = {
    id: person.id,
    full_native: person.full_native,
    full_latin: person.full_latin,
    gender: person.gender,
  };
  const titles = parseTitles(person.titles);
  const birthEC = formatEC(locale, person.birth_year_ec, person.birth_month_ec, person.birth_day_ec);
  const deathEC = formatEC(locale, person.death_year_ec, person.death_month_ec, person.death_day_ec);

  return (
    <Card id="person-inspector" className="h-fit xl:sticky xl:top-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{person.full_latin}</CardTitle>
            <p className="mt-1 truncate text-sm text-muted-foreground">{person.full_native}</p>
          </div>
          <Badge variant={person.is_deceased ? "neutral" : "success"}>
            {person.is_deceased ? t(locale, "person.deceased") : t(locale, "person.living")}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button size="sm" onClick={() => onEdit(person)}>{t(locale, "person.edit")}</Button>}
          <Button size="sm" variant="outline" onClick={() => onFocus(anchor)}>{t(locale, "canvas.focus")}</Button>
        </div>
      </CardHeader>
      <CardContent className="flex max-h-[calc(100vh-16rem)] flex-col gap-4 overflow-y-auto">
        <section aria-label={t(locale, "workspace.profile")} className="flex flex-col gap-2 text-sm">
            <div className="rounded-md bg-panel-muted px-3 py-3 text-muted-foreground">
              <p className="text-xs font-semibold uppercase tracking-[0.1em]">{t(locale, "person.gender")}</p>
              <p className="mt-1 text-foreground">{person.gender === "FEMALE" ? t(locale, "person.female") : t(locale, "person.male")}</p>
            </div>
            {titles.length > 0 && (
              <div className="rounded-md bg-panel-muted px-3 py-3 text-muted-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.1em]">{t(locale, "workspace.titles")}</p>
                <p className="mt-1 text-foreground">{titles.join(", ")}</p>
              </div>
            )}
            <div className="rounded-md bg-panel-muted px-3 py-3 text-muted-foreground">
              <p className="text-xs font-semibold uppercase tracking-[0.1em]">{t(locale, "person.birth")}</p>
              <p className="mt-1 text-foreground">{birthEC ?? t(locale, "person.noBirthDate")}</p>
              {person.birth_date_gc && <p className="mt-1 text-foreground">{person.birth_date_gc}</p>}
              {person.birth_place && <p className="mt-1 text-foreground">{person.birth_place}</p>}
              {person.birth_note && <p className="mt-1 text-foreground">{person.birth_note}</p>}
            </div>
            {person.is_deceased ? (
              <div className="rounded-md bg-panel-muted px-3 py-3 text-muted-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.1em]">{t(locale, "person.death")}</p>
                <p className="mt-1 text-foreground">{deathEC ?? person.death_date_gc ?? t(locale, "person.noBirthDate")}</p>
                {deathEC && person.death_date_gc && <p className="mt-1 text-foreground">{person.death_date_gc}</p>}
                {person.death_place && <p className="mt-1 text-foreground">{person.death_place}</p>}
                {person.death_note && <p className="mt-1 text-foreground">{person.death_note}</p>}
              </div>
            ) : null}
        </section>

        <section aria-label={t(locale, "workspace.relationships")} className="flex flex-col gap-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "workspace.parents")}</h3>
              {detail.parents.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t(locale, "workspace.noParents")}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.parents.map((edge) => (
                    <li key={edge.id} className="rounded-md border border-border bg-panel px-3 py-2">
                      <button onClick={() => onSelectPerson(edge)} className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <span className="block truncate text-sm font-semibold">{edge.full_latin}</span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {t(locale, `edge.${edge.relationship_type.toLowerCase()}`)}
                          {edge.is_name_source && <Badge variant="accent">{t(locale, "workspace.nameSource")}</Badge>}
                        </span>
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onEdge({
                            kind: "edit-parent",
                            parent: edge,
                            child: anchor,
                            relationshipType: edge.relationship_type,
                            isNameSource: edge.is_name_source,
                          })}
                          className="mt-2 rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {t(locale, "edge.editRelationship")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "workspace.children")}</h3>
              {detail.children.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t(locale, "workspace.noChildren")}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.children.map((edge) => (
                    <li key={edge.id} className="rounded-md border border-border bg-panel px-3 py-2">
                      <button onClick={() => onSelectPerson(edge)} className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <span className="block truncate text-sm font-semibold">{edge.full_latin}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{t(locale, `edge.${edge.relationship_type.toLowerCase()}`)}</span>
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onEdge({
                            kind: "edit-parent",
                            parent: anchor,
                            child: edge,
                            relationshipType: edge.relationship_type,
                            isNameSource: edge.is_name_source,
                          })}
                          className="mt-2 rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {t(locale, "edge.editRelationship")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "workspace.unions")}</h3>
              {detail.unions.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t(locale, "workspace.noUnions")}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.unions.map((union) => (
                    <li key={union.id} className="rounded-md border border-border bg-panel px-3 py-2">
                      <button onClick={() => onSelectPerson(union.partner)} className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <span className="block truncate text-sm font-semibold">{union.partner.full_latin}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t(locale, `edge.${union.union_type.toLowerCase()}`)} · {t(locale, `edge.${union.status.toLowerCase()}`)}
                        </span>
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onEdge({
                            kind: "edit-union",
                            partnerA: anchor,
                            partnerB: union.partner,
                            unionType: union.union_type,
                            status: union.status,
                          })}
                          className="mt-2 rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {t(locale, "edge.editUnion")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {canEdit && (
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "parent", child: anchor })}>{t(locale, "edge.addParent")}</Button>
                <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "child", parent: anchor })}>{t(locale, "edge.addChild")}</Button>
                <Button size="sm" variant="outline" onClick={() => onEdge({ kind: "union", partner: anchor })}>{t(locale, "edge.addUnion")}</Button>
              </div>
            )}
        </section>

        <details
          open={lineageOpen}
          className="rounded-md border border-border bg-panel px-3 py-2"
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setLineageOpen((open) => !open);
            }}
            className="cursor-pointer rounded text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t(locale, "workspace.lineage")}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as "ancestors" | "descendants")} aria-label={t(locale, "workspace.direction")}>
                <option value="ancestors">{t(locale, "workspace.ancestors")}</option>
                <option value="descendants">{t(locale, "workspace.descendants")}</option>
              </Select>
              <Select value={String(lineageDepth)} onChange={(e) => setLineageDepth(Number(e.target.value))} aria-label={t(locale, "canvas.depth")}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t(locale, "canvas.depth")} {n}</option>)}
              </Select>
            </div>
            {lineageLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((row) => <Skeleton key={row} className="h-12 w-full" />)}
              </div>
            ) : lineage.length === 0 ? (
              <Empty title={t(locale, "kinship.none")} />
            ) : (
              <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {lineage.map((node) => (
                  <li key={pathKey(node.path)}>
                    <button
                      onClick={() => onSelectPerson(node)}
                      style={{ marginLeft: `${Math.min(node.depth, 4) * 12}px` }}
                      className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-panel-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="block truncate font-medium">{node.full_latin}</span>
                      <span className="block truncate text-xs text-muted-foreground">{node.full_native}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        <details className="rounded-md border border-border bg-panel px-3 py-2">
          <summary className="cursor-pointer rounded text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {t(locale, "workspace.events")}
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {canEdit && (
              <div>
                <Button size="sm" onClick={() => setEventEditor({})}>{t(locale, "event.add")}</Button>
              </div>
            )}
            {detail.events.length === 0 ? (
              <Empty title={t(locale, "dashboard.noEvents")} description={t(locale, "dashboard.noEventsDescription")} />
            ) : (
              <ol className="flex flex-col gap-2">
                {detail.events.map((event) => (
                  <li key={event.id} className="relative rounded-md border border-border bg-panel px-3 py-2 pl-5">
                    <span className="absolute left-2 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
                    <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{event.event_type}</span>
                    {(event.event_date_gc || event.event_year_ec != null || event.event_place) && (
                      <span className="mt-1 block text-sm">
                        {[event.event_date_gc, event.event_year_ec != null ? String(event.event_year_ec) : "", event.event_place].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {event.description && <span className="mt-1 block text-sm text-muted-foreground">{event.description}</span>}
                    {canEdit && (
                      <button
                        onClick={() => setEventEditor({ initial: event })}
                        className="mt-2 rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {t(locale, "event.edit")}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </CardContent>
      <Sheet open={eventEditor !== null} onClose={() => setEventEditor(null)} closeLabel={t(locale, "common.close")}>
        {eventEditor && (
          <EventForm
            locale={locale}
            treeId={treeId}
            personId={personId}
            initial={eventEditor.initial}
            onClose={() => setEventEditor(null)}
            onSaved={() => setLoadKey((key) => key + 1)}
            onDeleted={() => setLoadKey((key) => key + 1)}
          />
        )}
      </Sheet>
    </Card>
  );
}

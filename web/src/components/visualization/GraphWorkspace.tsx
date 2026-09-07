import { useState } from "react";
import { type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { FamilyCanvas } from "./FamilyCanvas";
import { Button, Card, CardContent, Empty, Select } from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  focus: PersonHit;
  selectedId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
}

const depthOptions = [1, 2, 3, 4, 5, 6, 7, 8];

/** Focused graph workspace. The d3 canvas stays calm; controls and
  states live in the header around it. */
export function GraphWorkspace({ locale, treeId, focus, selectedId, onSelect, refreshKey }: Props) {
  const [depth, setDepth] = useState(3);
  const [showParents, setShowParents] = useState(true);
  const [showUnions, setShowUnions] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [fitKey, setFitKey] = useState(0);

  const reset = () => {
    setDepth(3);
    setShowParents(true);
    setShowUnions(true);
    setFitKey((key) => key + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "views.canvas")}</p>
          <h1 className="mt-2 truncate font-display text-4xl font-semibold">{focus.full_latin}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{focus.full_native}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(depth)}
            onChange={(e) => setDepth(Number(e.target.value))}
            aria-label={t(locale, "canvas.depth")}
            className="h-9 w-auto text-xs"
          >
            {depthOptions.map((option) => (
              <option key={option} value={option}>{t(locale, "canvas.depth")} {option}</option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => setFitKey((key) => key + 1)}>
            {t(locale, "canvas.fit")}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            {t(locale, "canvas.reset")}
          </Button>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border p-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showParents}
              onChange={(e) => setShowParents(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t(locale, "graph.parents")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showUnions}
              onChange={(e) => setShowUnions(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t(locale, "graph.unions")}
          </label>
        </CardContent>
        {!showParents && !showUnions ? (
          <CardContent className="p-6">
            <Empty title={t(locale, "graph.empty")} description={t(locale, "graph.emptyDescription")} />
          </CardContent>
        ) : (
          <FamilyCanvas
            locale={locale}
            treeId={treeId}
            focusId={focus.id}
            depth={depth}
            showParents={showParents}
            showUnions={showUnions}
            selectedId={selectedId}
            onSelect={onSelect}
            refreshKey={refreshKey}
            retryKey={retryKey}
            fitKey={fitKey}
            onRetry={() => setRetryKey((key) => key + 1)}
          />
        )}
      </Card>
    </div>
  );
}

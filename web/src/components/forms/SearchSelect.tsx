import { useEffect, useRef, useState } from "react";
import { api, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { Input } from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  excludeId?: string;
  value: PersonHit | null;
  onChange: (person: PersonHit | null) => void;
}

export function SearchSelect({ locale, treeId, excludeId, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.individuals
        .list(treeId, query || undefined)
        .then((page) => {
          if (!live) return;
          setHits(page.individuals.filter((p) => p.id !== excludeId).slice(0, 8));
          setActiveIndex(0);
        })
        .catch(() => {
          if (live) setHits([]);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, treeId, excludeId]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const pick = (person: PersonHit) => {
    onChange(person);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (hits.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.min(hits.length - 1, Math.max(0, index + delta)));
    } else if (event.key === "Enter" && open && hits[activeIndex]) {
      pick(hits[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef}>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-panel px-3 py-2 text-sm">
          <span className="truncate">
            {value.full_latin} · {value.full_native}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={t(locale, "common.close")}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            type="text"
            role="combobox"
            aria-expanded={open && query !== ""}
            aria-controls="search-select-listbox"
            aria-label={t(locale, "person.search")}
            placeholder={t(locale, "person.search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {open && query && (
            <ul
              id="search-select-listbox"
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-panel py-1 shadow-panel"
            >
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t(locale, "people.empty")}</li>
              ) : (
                hits.map((p, index) => (
                  <li key={p.id} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(p)}
                      className={`w-full truncate px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${index === activeIndex ? "bg-panel-muted" : ""}`}
                    >
                      {p.full_latin} · {p.full_native}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

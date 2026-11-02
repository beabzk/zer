import React, { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import type { PersonSummary } from "../../lib/types";
import { Icons } from "./Icons";
import { useI18n } from "../../lib/i18nContext";
import { PersonSelectedCard } from "./PersonSelectedCard";
import { PersonSelectRow } from "./PersonSelectRow";

interface PersonSearchSelectProps {
  treeId: string;
  value?: string;
  onSelect: (person: PersonSummary | null) => void;
  label?: string;
  placeholder?: string;
  excludeId?: string;
  showLifespan?: boolean;
}

export const PersonSearchSelect: React.FC<PersonSearchSelectProps> = ({
  treeId,
  value,
  onSelect,
  label,
  placeholder,
  excludeId,
  showLifespan = false,
}) => {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder || t("common.searchPlaceholder");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // If initial value is provided, fetch person detail to populate
  useEffect(() => {
    if (value && (!selectedPerson || selectedPerson.id !== value)) {
      api
        .getIndividual(treeId, value)
        .then((p) => {
          setSelectedPerson({
            id: p.id,
            full_native: p.full_native,
            full_latin: p.full_latin,
            gender: p.gender,
            birth_year_ec: p.birth_year_ec,
            death_year_ec: p.death_year_ec,
            is_deceased: typeof p.is_deceased === "number" ? p.is_deceased === 1 : !!p.is_deceased,
          });
        })
        .catch(() => {});
    }
  }, [value, treeId]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .listIndividuals(treeId, { q: query.trim(), limit: 12 })
        .then((res) => {
          const filtered = excludeId
            ? res.individuals.filter((p) => p.id !== excludeId)
            : res.individuals;
          setResults(filtered);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen, treeId, excludeId]);

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      {selectedPerson ? (
        <PersonSelectedCard
          person={selectedPerson}
          onClear={() => {
            setSelectedPerson(null);
            onSelect(null);
            setQuery("");
          }}
          showLifespan={showLifespan}
          era={t("calendar.eraEC")}
        />
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={resolvedPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
          <div className="absolute left-3 top-2.5 text-stone-400 pointer-events-none">
            <Icons.Search size={16} />
          </div>
        </div>
      )}

      {isOpen && !selectedPerson && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-stone-100">
          {loading && (
            <div className="p-3 text-xs text-stone-400 text-center">{t("common.loading")}</div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-xs text-stone-400 text-center">
              {query ? t("common.noResults") : resolvedPlaceholder}
            </div>
          )}
          {!loading &&
            results.map((person) => (
              <PersonSelectRow
                key={person.id}
                person={person}
                onClick={() => {
                  setSelectedPerson(person);
                  onSelect(person);
                  setIsOpen(false);
                }}
                showLifespan={showLifespan}
                era={t("calendar.eraEC")}
              />
            ))}
        </div>
      )}
    </div>
  );
};

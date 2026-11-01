import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { PersonSummary, Gender } from "../lib/types";
import { Icons } from "../components/ui/Icons";
import { formatLifespan } from "../lib/utils";
import { useToast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18nContext";

interface DirectoryViewProps {
  treeId: string;
  onNavigatePerson: (personId: string) => void;
  onNavigateGraph: (personId: string) => void;
  onNavigateLineage: (personId: string) => void;
  onOpenAddPerson: () => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  treeId,
  onNavigatePerson,
  onNavigateGraph,
  onNavigateLineage,
  onOpenAddPerson,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<Gender | "">("");
  const [deceasedFilter, setDeceasedFilter] = useState<"true" | "false" | "">("");
  const [order, setOrder] = useState<"created" | "recent" | "name">("recent");

  // Pagination
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  const loadPeople = () => {
    setLoading(true);
    api
      .listIndividuals(treeId, {
        q: search.trim() || undefined,
        gender: genderFilter || undefined,
        deceased: deceasedFilter || undefined,
        order,
        limit,
        offset,
      })
      .then((res) => {
        setPeople(res.individuals);
        setTotal(res.total);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPeople();
    }, 200);
    return () => clearTimeout(timer);
  }, [treeId, search, genderFilter, deceasedFilter, order, offset]);

  // Reset page when filters change
  const handleFilterChange = () => {
    setOffset(0);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            {t("people.directory")}{" "}
            <span className="text-sm font-normal text-stone-400">({total})</span>
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">{t("people.description")}</p>
        </div>

        <button
          onClick={onOpenAddPerson}
          className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors shadow-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Icons.Plus size={16} /> {t("person.add")}
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-2 relative">
            <input
              type="text"
              placeholder={t("people.searchDescription")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleFilterChange();
              }}
              className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:bg-white focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            />
            <div className="absolute left-3 top-2.5 text-stone-400 pointer-events-none">
              <Icons.Search size={16} />
            </div>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <Icons.X size={14} />
              </button>
            )}
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => {
                setGenderFilter(e.target.value as Gender | "");
                handleFilterChange();
              }}
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:bg-white focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            >
              <option value="">
                {t("people.all")} ({t("person.gender")})
              </option>
              <option value="MALE">{t("person.male")}</option>
              <option value="FEMALE">{t("person.female")}</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as "created" | "recent" | "name");
                handleFilterChange();
              }}
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:bg-white focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            >
              <option value="recent">{t("people.order_recent")}</option>
              <option value="name">{t("people.order_name")}</option>
              <option value="created">{t("people.order_created")}</option>
            </select>
          </div>
        </div>

        {/* Secondary filter chips */}
        <div className="flex items-center gap-2 pt-1 border-t border-stone-100 text-xs">
          <span className="text-stone-400">{t("people.status")}:</span>
          <button
            type="button"
            onClick={() => {
              setDeceasedFilter("");
              handleFilterChange();
            }}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors ${
              deceasedFilter === ""
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {t("people.all")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeceasedFilter("false");
              handleFilterChange();
            }}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors ${
              deceasedFilter === "false"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {t("person.living")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeceasedFilter("true");
              handleFilterChange();
            }}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors ${
              deceasedFilter === "true"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {t("person.deceased")}
          </button>
        </div>
      </div>

      {/* People Table / List */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-stone-500">{t("common.loading")}</p>
          </div>
        ) : people.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
              <Icons.Users size={24} />
            </div>
            <div className="text-base font-semibold text-stone-800">{t("people.empty")}</div>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {t("people.emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {people.map((person) => (
              <div
                key={person.id}
                className="p-4 sm:px-6 hover:bg-stone-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                {/* Person details */}
                <div
                  onClick={() => onNavigatePerson(person.id)}
                  className="cursor-pointer min-w-0 flex-1 pr-4"
                >
                  <div className="flex items-baseline gap-2.5">
                    <h3 className="font-bold text-stone-950 text-base group-hover:text-amber-900 transition-colors">
                      {person.full_native}
                    </h3>
                    <span className="text-sm text-stone-500 font-normal">{person.full_latin}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-500">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        person.gender === "FEMALE"
                          ? "bg-rose-50 text-rose-700 border border-rose-100"
                          : "bg-stone-100 text-stone-700 border border-stone-200"
                      }`}
                    >
                      {person.gender === "FEMALE" ? t("person.female") : t("person.male")}
                    </span>

                    <span>
                      {formatLifespan(
                        person.birth_year_ec,
                        person.death_year_ec,
                        person.is_deceased,
                        t("calendar.eraEC"),
                      )}
                    </span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onNavigatePerson(person.id)}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-white text-stone-700 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                  >
                    {t("workspace.profile")}
                  </button>
                  <button
                    onClick={() => onNavigateGraph(person.id)}
                    title="View in Graph"
                    className="p-1.5 rounded-lg border border-stone-200 hover:bg-white text-stone-600 hover:text-amber-800 text-xs transition-colors shadow-2xs cursor-pointer"
                  >
                    <Icons.Network size={16} />
                  </button>
                  <button
                    onClick={() => onNavigateLineage(person.id)}
                    title="View Lineage"
                    className="p-1.5 rounded-lg border border-stone-200 hover:bg-white text-stone-600 hover:text-amber-800 text-xs transition-colors shadow-2xs cursor-pointer"
                  >
                    <Icons.Lineage size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {total > limit && (
          <div className="p-4 bg-stone-50/50 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <div>
              <span className="font-medium text-stone-900">{offset + 1}</span> -{" "}
              <span className="font-medium text-stone-900">{Math.min(offset + limit, total)}</span>{" "}
              / <span className="font-medium text-stone-900">{total}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
              >
                {t("common.previous")}
              </button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed font-medium"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

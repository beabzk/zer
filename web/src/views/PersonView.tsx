import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { DetailResponse, IndividualRecord, OverviewEvent } from "../lib/types";
import { Icons } from "../components/ui/Icons";
import { formatFullDateEC } from "../lib/utils";
import { useToast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18nContext";
import { IndividualForm } from "../components/forms/IndividualForm";
import { RelationshipForm } from "../components/forms/RelationshipForm";
import { EventForm } from "../components/forms/EventForm";

interface PersonViewProps {
  treeId: string;
  personId: string;
  onBack: () => void;
  onNavigatePerson: (personId: string) => void;
  onNavigateGraph: (personId: string) => void;
  onNavigateLineage: (personId: string) => void;
  onNavigateKinshipWith: (personId: string) => void;
}

export const PersonView: React.FC<PersonViewProps> = ({
  treeId,
  personId,
  onBack,
  onNavigatePerson,
  onNavigateGraph,
  onNavigateLineage,
  onNavigateKinshipWith,
}) => {
  const toast = useToast();
  const { t, months } = useI18n();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [relMode, setRelMode] = useState<"parent_child" | "union">("parent_child");
  const [relDefaultRole, setRelDefaultRole] = useState<"parent" | "child" | "partner">("parent");

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<OverviewEvent | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadPerson = () => {
    setLoading(true);
    api
      .getIndividualDetail(treeId, personId, 4)
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPerson();
  }, [treeId, personId]);

  const handleDeletePerson = async () => {
    setDeleting(true);
    try {
      await api.deleteIndividual(treeId, personId);
      toast.success("Individual deleted");
      onBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete individual";
      toast.error(msg);
      setDeleting(false);
    }
  };

  const handleToggleNameSource = async (parentId: string, currentFlag: boolean) => {
    try {
      await api.updateParentChild(treeId, {
        parent_id: parentId,
        child_id: personId,
        is_name_source: !currentFlag,
      });
      toast.success("Name source updated");
      loadPerson();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update name source";
      toast.error(msg);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("Delete this life event record?")) return;
    try {
      await api.deleteEvent(treeId, personId, eventId);
      toast.success("Event deleted");
      loadPerson();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete event";
      toast.error(msg);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-stone-500">Loading profile...</p>
      </div>
    );
  }

  if (!data) return null;

  const { individual, parents, children, unions, events, permissions } = data;

  // Name source parent
  const nameSourceParent = parents.find((p) => p.is_name_source);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <Icons.ArrowLeft size={14} /> Back
        </button>
      </div>

      {/* Main Profile Dossier Card */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Avatar / Photo */}
            <div className="relative shrink-0">
              {individual.profile_photo_url ? (
                <img
                  src={individual.profile_photo_url}
                  alt={individual.full_native}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-stone-200 shadow-xs"
                />
              ) : (
                <div
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center font-bold text-2xl sm:text-3xl border ${
                    individual.gender === "FEMALE"
                      ? "bg-rose-50 text-rose-800 border-rose-100"
                      : "bg-stone-100 text-stone-800 border-stone-200"
                  }`}
                >
                  {individual.given_name_native ? individual.given_name_native[0] : "ዘ"}
                </div>
              )}
            </div>

            {/* Names & Metadata */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    individual.gender === "FEMALE"
                      ? "bg-rose-50 text-rose-700 border border-rose-200/50"
                      : "bg-stone-100 text-stone-700 border border-stone-200"
                  }`}
                >
                  {individual.gender === "FEMALE" ? t("person.female") : t("person.male")}
                </span>

                {Boolean(individual.is_deceased) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-700 font-medium">
                    {t("person.deceased")}
                  </span>
                )}

                {individual.titles && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/50 font-medium">
                    {individual.titles}
                  </span>
                )}
              </div>

              {/* Bilingual full name */}
              <h1 className="text-2xl sm:text-4xl font-bold text-stone-950 tracking-tight leading-tight">
                {individual.full_native}
              </h1>

              <div className="text-base sm:text-lg text-stone-600 font-normal">
                {individual.full_latin}
              </div>

              {/* Lifespan & Dates */}
              <div className="text-xs text-stone-500 pt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {(individual.birth_year_ec || individual.birth_date_gc) && (
                  <span>
                    <strong>{t("person.birth")}:</strong>{" "}
                    {individual.birth_year_ec
                      ? formatFullDateEC(
                          individual.birth_year_ec,
                          individual.birth_month_ec,
                          individual.birth_day_ec,
                          individual.birth_month_ec
                            ? months[individual.birth_month_ec - 1]
                            : undefined,
                          t("calendar.eraEC"),
                        )
                      : individual.birth_date_gc}
                    {individual.birth_place ? ` (${individual.birth_place})` : ""}
                  </span>
                )}

                {Boolean(individual.is_deceased) &&
                  (individual.death_year_ec || individual.death_date_gc) && (
                    <span>
                      <strong>{t("person.death")}:</strong>{" "}
                      {individual.death_year_ec
                        ? formatFullDateEC(
                            individual.death_year_ec,
                            individual.death_month_ec,
                            individual.death_day_ec,
                            individual.death_month_ec
                              ? months[individual.death_month_ec - 1]
                              : undefined,
                            t("calendar.eraEC"),
                          )
                        : individual.death_date_gc}
                      {individual.death_place ? ` (${individual.death_place})` : ""}
                    </span>
                  )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
            {permissions.can_edit && (
              <button
                onClick={() => setEditPersonOpen(true)}
                className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Icons.Edit size={14} /> {t("person.edit")}
              </button>
            )}

            {permissions.can_delete && (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-1.5 rounded-xl border border-stone-200 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title={t("person.delete")}
              >
                <Icons.Trash size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Patronymic Lineage indicator */}
        {nameSourceParent && (
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/60 text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{t("workspace.nameSource")}:</span>
              <span>
                {t("workspace.nameSourceDesc")} <strong>{nameSourceParent.full_native}</strong> (
                {nameSourceParent.full_latin})
              </span>
            </div>
            <button
              onClick={() => onNavigatePerson(nameSourceParent.id)}
              className="text-amber-800 hover:text-amber-950 font-medium underline cursor-pointer"
            >
              {t("common.view") || "View"}
            </button>
          </div>
        )}

        {/* Quick Jump Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
          <button
            onClick={() => onNavigateGraph(personId)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icons.Network size={14} className="text-amber-700" /> {t("views.canvas")}
          </button>
          <button
            onClick={() => onNavigateLineage(personId)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icons.Lineage size={14} className="text-amber-700" /> {t("workspace.lineage")}
          </button>
          <button
            onClick={() => onNavigateKinshipWith(personId)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icons.Kinship size={14} className="text-amber-700" /> {t("views.kinship")}
          </button>
        </div>
      </div>

      {/* Relations Section (Parents, Partners, Children) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Parents */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                {t("workspace.parents")} ({parents.length})
              </h3>
              {permissions.can_edit && (
                <button
                  onClick={() => {
                    setRelMode("parent_child");
                    setRelDefaultRole("child");
                    setRelModalOpen(true);
                  }}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                >
                  <Icons.Plus size={14} /> {t("edge.addParent")}
                </button>
              )}
            </div>

            <div className="divide-y divide-stone-100 mt-2">
              {parents.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  {t("workspace.noParents")}
                </div>
              ) : (
                parents.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div
                      onClick={() => onNavigatePerson(p.id)}
                      className="cursor-pointer min-w-0 pr-2 group"
                    >
                      <div className="text-sm font-semibold text-stone-900 group-hover:text-amber-900 truncate">
                        {p.full_native}
                      </div>
                      <div className="text-xs text-stone-500 truncate">({p.full_latin})</div>
                      <div className="text-[11px] text-stone-400 mt-0.5">
                        {p.relationship_type.toLowerCase()}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {p.is_name_source ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 block">
                          {t("workspace.nameSource")}
                        </span>
                      ) : (
                        permissions.can_edit && (
                          <button
                            onClick={() => handleToggleNameSource(p.id, false)}
                            className="text-[10px] text-stone-400 hover:text-amber-800 underline cursor-pointer"
                          >
                            {t("workspace.setNameSource")}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Partners / Unions */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                {t("workspace.unions")} ({unions.length})
              </h3>
              {permissions.can_edit && (
                <button
                  onClick={() => {
                    setRelMode("union");
                    setRelModalOpen(true);
                  }}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                >
                  <Icons.Plus size={14} /> {t("edge.addUnion")}
                </button>
              )}
            </div>

            <div className="divide-y divide-stone-100 mt-2">
              {unions.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  {t("workspace.noUnions")}
                </div>
              ) : (
                unions.map((u) => (
                  <div key={u.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div
                      onClick={() => onNavigatePerson(u.partner.id)}
                      className="cursor-pointer min-w-0 pr-2 group"
                    >
                      <div className="text-sm font-semibold text-stone-900 group-hover:text-amber-900 truncate">
                        {u.partner.full_native}
                      </div>
                      <div className="text-xs text-stone-500 truncate">
                        ({u.partner.full_latin})
                      </div>
                      <div className="text-[11px] text-stone-400 mt-0.5">
                        {u.union_type.toLowerCase()} • {u.status.toLowerCase()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                {t("workspace.children")} ({children.length})
              </h3>
              {permissions.can_edit && (
                <button
                  onClick={() => {
                    setRelMode("parent_child");
                    setRelDefaultRole("parent");
                    setRelModalOpen(true);
                  }}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                >
                  <Icons.Plus size={14} /> {t("edge.addChild")}
                </button>
              )}
            </div>

            <div className="divide-y divide-stone-100 mt-2">
              {children.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  {t("workspace.noChildren")}
                </div>
              ) : (
                children.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div
                      onClick={() => onNavigatePerson(c.id)}
                      className="cursor-pointer min-w-0 pr-2 group"
                    >
                      <div className="text-sm font-semibold text-stone-900 group-hover:text-amber-900 truncate">
                        {c.full_native}
                      </div>
                      <div className="text-xs text-stone-500 truncate">({c.full_latin})</div>
                      <div className="text-[11px] text-stone-400 mt-0.5">
                        {c.relationship_type.toLowerCase()}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {c.is_name_source && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                          {t("workspace.nameSource")}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Life Events Timeline */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-base font-semibold text-stone-900">{t("event.title")}</h2>
            <p className="text-xs text-stone-500">{t("event.descriptionHeader")}</p>
          </div>
          {permissions.can_edit && (
            <button
              onClick={() => {
                setSelectedEvent(null);
                setEventModalOpen(true);
              }}
              className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-medium transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <Icons.Plus size={14} /> {t("event.add")}
            </button>
          )}
        </div>

        {events.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400">{t("event.empty")}</div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="p-4 rounded-xl border border-stone-100 bg-stone-50/50 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 text-sm">{ev.event_type}</span>
                    <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                      {ev.event_year_ec
                        ? `${ev.event_year_ec} ${t("calendar.eraEC")}`
                        : ev.event_date_gc || "Dated"}
                    </span>
                  </div>

                  {ev.event_place && (
                    <div className="text-xs text-stone-600">Location: {ev.event_place}</div>
                  )}

                  {ev.description && (
                    <p className="text-xs text-stone-500 leading-relaxed pt-0.5">
                      {ev.description}
                    </p>
                  )}
                </div>

                {permissions.can_edit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setSelectedEvent(ev);
                        setEventModalOpen(true);
                      }}
                      className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
                    >
                      <Icons.Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Icons.Trash size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Person Modal */}
      <IndividualForm
        isOpen={editPersonOpen}
        onClose={() => setEditPersonOpen(false)}
        treeId={treeId}
        individual={individual}
        onSuccess={(saved: IndividualRecord) => {
          setData((prev) => (prev ? { ...prev, individual: saved } : null));
          loadPerson();
        }}
      />

      {/* Relationship Modal */}
      <RelationshipForm
        isOpen={relModalOpen}
        onClose={() => setRelModalOpen(false)}
        treeId={treeId}
        initialMode={relMode}
        defaultPersonId={personId}
        defaultRole={relDefaultRole}
        onSuccess={loadPerson}
      />

      {/* Event Modal */}
      <EventForm
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        treeId={treeId}
        individualId={personId}
        event={selectedEvent}
        onSuccess={loadPerson}
      />

      {/* Delete Confirmation Modal */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Delete Individual</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to permanently delete <strong>{individual.full_native}</strong>{" "}
              from this family tree? All relationship links and life events associated with this
              person will also be removed.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={handleDeletePerson}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState } from "react";
import { ApiError, api, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { SearchSelect } from "./SearchSelect";

export type EdgeMode =
  | { kind: "parent"; child: PersonHit }
  | { kind: "child"; parent: PersonHit }
  | { kind: "union"; partner: PersonHit };

interface Props {
  locale: Locale;
  treeId: string;
  mode: EdgeMode;
  onClose: () => void;
  onSaved: () => void;
}

export function EdgeModal({ locale, treeId, mode, onClose, onSaved }: Props) {
  const anchor =
    mode.kind === "parent" ? mode.child : mode.kind === "child" ? mode.parent : mode.partner;
  const [other, setOther] = useState<PersonHit | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newNative, setNewNative] = useState("");
  const [newLatin, setNewLatin] = useState("");
  const [newGender, setNewGender] = useState("MALE");
  const [relType, setRelType] = useState("BIOLOGICAL");
  const [nameSource, setNameSource] = useState(mode.kind !== "union");
  const [unionType, setUnionType] = useState("TRADITIONAL");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const title =
    mode.kind === "parent"
      ? t(locale, "edge.addParent")
      : mode.kind === "child"
        ? t(locale, "edge.addChild")
        : t(locale, "edge.addUnion");

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      let otherId = other?.id ?? "";
      if (createNew) {
        if (!newNative.trim() || !newLatin.trim()) {
          setError(t(locale, "common.error"));
          setSaving(false);
          return;
        }
        const created = await api.individuals.create(treeId, {
          given_name_native: newNative.trim(),
          given_name_latin: newLatin.trim(),
          gender: newGender,
        });
        otherId = created.id;
      }
      if (!otherId) return;
      if (mode.kind === "union") {
        await api.relationships.addUnion(treeId, {
          partner_a_id: anchor.id,
          partner_b_id: otherId,
          union_type: unionType,
        });
      } else {
        const parentId = mode.kind === "parent" ? otherId : anchor.id;
        const childId = mode.kind === "parent" ? anchor.id : otherId;
        await api.relationships.addParentChild(treeId, {
          parent_id: parentId,
          child_id: childId,
          relationship_type: relType,
          is_name_source: nameSource,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !saving && (other !== null || (createNew && newNative.trim() !== "" && newLatin.trim() !== ""));

  const input = "w-full px-3 py-2 border rounded text-sm";
  const label = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-5 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-sm text-gray-600 mb-4">
          {anchor.full_latin} · {anchor.full_native}
        </p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={!createNew}
                onChange={() => setCreateNew(false)}
              />
              {t(locale, "person.useExisting")}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={createNew} onChange={() => setCreateNew(true)} />
              {t(locale, "person.addNew")}
            </label>
          </div>
          {createNew ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                placeholder={t(locale, "person.nativeName")}
                value={newNative}
                onChange={(e) => setNewNative(e.target.value)}
              />
              <input
                className={input}
                placeholder={t(locale, "person.latinName")}
                value={newLatin}
                onChange={(e) => setNewLatin(e.target.value)}
              />
              <select
                className={input}
                value={newGender}
                onChange={(e) => setNewGender(e.target.value)}
              >
                <option value="MALE">{t(locale, "person.male")}</option>
                <option value="FEMALE">{t(locale, "person.female")}</option>
              </select>
            </div>
          ) : (
            <SearchSelect
              locale={locale}
              treeId={treeId}
              excludeId={anchor.id}
              value={other}
              onChange={setOther}
            />
          )}
          {mode.kind === "union" ? (
            <div>
              <label className={label}>{t(locale, "edge.unionType")}</label>
              <select className={input} value={unionType} onChange={(e) => setUnionType(e.target.value)}>
                <option value="TRADITIONAL">{t(locale, "edge.traditional")}</option>
                <option value="RELIGIOUS">{t(locale, "edge.religious")}</option>
                <option value="CIVIL">{t(locale, "edge.civil")}</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className={label}>{t(locale, "edge.relationshipType")}</label>
                <select className={input} value={relType} onChange={(e) => setRelType(e.target.value)}>
                  <option value="BIOLOGICAL">{t(locale, "edge.biological")}</option>
                  <option value="ADOPTIVE">{t(locale, "edge.adoptive")}</option>
                  <option value="FOSTER">{t(locale, "edge.foster")}</option>
                </select>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={nameSource}
                  onChange={(e) => setNameSource(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  {t(locale, "edge.nameSource")}
                  <span className="block text-xs text-gray-500">{t(locale, "edge.nameSourceHint")}</span>
                </span>
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded">
            {t(locale, "person.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
          >
            {t(locale, "person.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

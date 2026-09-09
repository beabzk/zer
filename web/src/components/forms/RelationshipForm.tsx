import { useState } from "react";
import { ApiError, api, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { SearchSelect } from "./SearchSelect";
import {
  Button,
  Input,
  Select,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useToast,
} from "../ui";

export type RelationshipMode =
  | { kind: "parent"; child: PersonHit }
  | { kind: "child"; parent: PersonHit }
  | { kind: "union"; partner: PersonHit }
  | {
      kind: "edit-parent";
      parent: PersonHit;
      child: PersonHit;
      relationshipType: string;
      isNameSource: boolean;
    }
  | {
      kind: "edit-union";
      partnerA: PersonHit;
      partnerB: PersonHit;
      unionType: string;
      status: string;
    };

interface Props {
  locale: Locale;
  treeId: string;
  mode: RelationshipMode;
  onClose: () => void;
  onSaved: () => void;
}

export function RelationshipForm({
  locale,
  treeId,
  mode,
  onClose,
  onSaved,
}: Props) {
  const editing = mode.kind === "edit-parent" || mode.kind === "edit-union";
  const anchor =
    mode.kind === "parent"
      ? mode.child
      : mode.kind === "child"
        ? mode.parent
        : mode.kind === "union"
          ? mode.partner
          : mode.kind === "edit-parent"
            ? mode.child
            : mode.partnerA;
  const [other, setOther] = useState<PersonHit | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newNative, setNewNative] = useState("");
  const [newLatin, setNewLatin] = useState("");
  const [newGender, setNewGender] = useState("MALE");
  const [relType, setRelType] = useState(
    mode.kind === "edit-parent" ? mode.relationshipType : "BIOLOGICAL",
  );
  const [nameSource, setNameSource] = useState(
    mode.kind === "edit-parent" ? mode.isNameSource : mode.kind !== "union",
  );
  const [unionType, setUnionType] = useState(
    mode.kind === "edit-union" ? mode.unionType : "TRADITIONAL",
  );
  const [unionStatus, setUnionStatus] = useState(
    mode.kind === "edit-union" ? mode.status : "ACTIVE",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const title =
    mode.kind === "parent"
      ? t(locale, "edge.addParent")
      : mode.kind === "child"
        ? t(locale, "edge.addChild")
        : mode.kind === "union"
          ? t(locale, "edge.addUnion")
          : mode.kind === "edit-parent"
            ? t(locale, "edge.editRelationship")
            : t(locale, "edge.editUnion");

  const fail = (message: string) => {
    setError(message);
    toast.push({ title: message, variant: "destructive" });
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      if (mode.kind === "edit-parent") {
        await api.relationships.updateParentChild(treeId, {
          parent_id: mode.parent.id,
          child_id: mode.child.id,
          relationship_type: relType,
          is_name_source: nameSource,
        });
      } else if (mode.kind === "edit-union") {
        await api.relationships.updateUnion(treeId, {
          partner_a_id: mode.partnerA.id,
          partner_b_id: mode.partnerB.id,
          union_type: unionType,
          status: unionStatus,
        });
      } else {
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
        if (!otherId) {
          setSaving(false);
          return;
        }
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
      }
      toast.push({ title: t(locale, "edge.saved"), variant: "success" });
      onSaved();
      onClose();
    } catch (e) {
      // Cycle, duplicate-link, and validation failures surface inline
      // and as a toast so drawer context is never the only signal.
      fail(e instanceof ApiError ? e.message : t(locale, "common.error"));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    editing ||
    other !== null ||
    (createNew && newNative.trim() !== "" && newLatin.trim() !== "");
  const label = "mb-1 block text-xs font-medium text-muted-foreground";
  const isUnion = mode.kind === "union" || mode.kind === "edit-union";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>
      <SheetContent className="flex flex-col gap-3">
        <p className="truncate text-sm text-muted-foreground">
          {anchor.full_latin} · {anchor.full_native}
        </p>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!editing && (
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={!createNew}
                onChange={() => setCreateNew(false)}
                className="size-4 accent-accent"
              />
              {t(locale, "person.useExisting")}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={createNew}
                onChange={() => setCreateNew(true)}
                className="size-4 accent-accent"
              />
              {t(locale, "person.addNew")}
            </label>
          </div>
        )}
        {!editing &&
          (createNew ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder={t(locale, "person.nativeName")}
                aria-label={t(locale, "person.nativeName")}
                value={newNative}
                onChange={(e) => setNewNative(e.target.value)}
              />
              <Input
                placeholder={t(locale, "person.latinName")}
                aria-label={t(locale, "person.latinName")}
                value={newLatin}
                onChange={(e) => setNewLatin(e.target.value)}
              />
              <Select
                value={newGender}
                onChange={(e) => setNewGender(e.target.value)}
                aria-label={t(locale, "person.gender")}
              >
                <option value="MALE">{t(locale, "person.male")}</option>
                <option value="FEMALE">{t(locale, "person.female")}</option>
              </Select>
            </div>
          ) : (
            <SearchSelect
              locale={locale}
              treeId={treeId}
              excludeId={anchor.id}
              value={other}
              onChange={setOther}
            />
          ))}
        {isUnion ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="rel-union-type">
                {t(locale, "edge.unionType")}
              </label>
              <Select
                id="rel-union-type"
                value={unionType}
                onChange={(e) => setUnionType(e.target.value)}
              >
                <option value="TRADITIONAL">
                  {t(locale, "edge.traditional")}
                </option>
                <option value="RELIGIOUS">{t(locale, "edge.religious")}</option>
                <option value="CIVIL">{t(locale, "edge.civil")}</option>
              </Select>
            </div>
            <div>
              <label className={label} htmlFor="rel-union-status">
                {t(locale, "edge.status")}
              </label>
              <Select
                id="rel-union-status"
                value={mode.kind === "union" ? "ACTIVE" : unionStatus}
                disabled={mode.kind === "union"}
                onChange={(e) => setUnionStatus(e.target.value)}
              >
                <option value="ACTIVE">{t(locale, "edge.active")}</option>
                <option value="DISSOLVED">{t(locale, "edge.dissolved")}</option>
                <option value="WIDOWED">{t(locale, "edge.widowed")}</option>
              </Select>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className={label} htmlFor="rel-type">
                {t(locale, "edge.relationshipType")}
              </label>
              <Select
                id="rel-type"
                value={relType}
                onChange={(e) => setRelType(e.target.value)}
              >
                <option value="BIOLOGICAL">
                  {t(locale, "edge.biological")}
                </option>
                <option value="ADOPTIVE">{t(locale, "edge.adoptive")}</option>
                <option value="FOSTER">{t(locale, "edge.foster")}</option>
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={nameSource}
                onChange={(e) => setNameSource(e.target.checked)}
                className="mt-1 size-4 accent-accent"
              />
              <span>
                {t(locale, "edge.nameSource")}
                <span className="block text-xs text-muted-foreground">
                  {t(locale, "edge.nameSourceHint")}
                </span>
              </span>
            </label>
          </>
        )}
      </SheetContent>
      <SheetFooter>
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t(locale, "person.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !canSubmit}>
            {t(locale, "person.save")}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

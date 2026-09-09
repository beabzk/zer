import { useState } from "react";
import { ApiError, api, type Individual } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { EthioDatePicker, type EthioDate } from "./EthioDatePicker";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useToast,
} from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  initial?: Individual;
  canDelete: boolean;
  onClose: () => void;
  onSaved: (person: Individual) => void;
  onDeleted: () => void;
}

function toEthioDate(y?: number, m?: number, d?: number): EthioDate {
  return { year: y, month: m, day: d };
}

export function IndividualForm({ locale, treeId, initial, canDelete, onClose, onSaved, onDeleted }: Props) {
  const [nativeName, setNativeName] = useState(initial?.given_name_native ?? "");
  const [latinName, setLatinName] = useState(initial?.given_name_latin ?? "");
  const [gender, setGender] = useState(initial?.gender ?? "MALE");
  const [titles, setTitles] = useState(() => {
    try {
      const raw = initial?.titles ? JSON.parse(initial.titles) : [];
      return Array.isArray(raw) ? raw.join(", ") : "";
    } catch {
      return "";
    }
  });
  const [birth, setBirth] = useState<EthioDate>(
    toEthioDate(initial?.birth_year_ec, initial?.birth_month_ec, initial?.birth_day_ec),
  );
  const [birthPlace, setBirthPlace] = useState(initial?.birth_place ?? "");
  const [birthNote, setBirthNote] = useState(initial?.birth_note ?? "");
  const [deceased, setDeceased] = useState((initial?.is_deceased ?? 0) === 1);
  const [death, setDeath] = useState<EthioDate>(
    toEthioDate(initial?.death_year_ec, initial?.death_month_ec, initial?.death_day_ec),
  );
  const [clearBirth, setClearBirth] = useState(false);
  const [clearDeath, setClearDeath] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toast = useToast();

  const storedBirth =
    initial?.birth_year_ec != null ||
    initial?.birth_month_ec != null ||
    initial?.birth_day_ec != null ||
    initial?.birth_date_gc != null;
  const storedDeath =
    initial?.death_year_ec != null ||
    initial?.death_month_ec != null ||
    initial?.death_day_ec != null ||
    initial?.death_date_gc != null;

  const editBirth = (date: EthioDate) => {
    setBirth(date);
    if (date.year != null || date.month != null || date.day != null) setClearBirth(false);
  };
  const editDeath = (date: EthioDate) => {
    setDeath(date);
    if (date.year != null || date.month != null || date.day != null) setClearDeath(false);
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const titleList = titles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        given_name_native: nativeName.trim(),
        given_name_latin: latinName.trim(),
        gender,
        titles: titleList,
        birth_year_ec: birth.year,
        birth_month_ec: birth.month,
        birth_day_ec: birth.day,
        birth_place: birthPlace.trim() || undefined,
        birth_note: birthNote.trim() || undefined,
        is_deceased: deceased,
        clear_birth_date: clearBirth || undefined,
      };
      if (deceased) {
        body.death_year_ec = death.year;
        body.death_month_ec = death.month;
        body.death_day_ec = death.day;
        body.clear_death_date = clearDeath || undefined;
      }
      const saved = initial
        ? await api.individuals.update(treeId, initial.id, body)
        : await api.individuals.create(treeId, body);
      toast.push({ title: t(locale, "person.saved"), variant: "success" });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    setConfirmingDelete(false);
    try {
      await api.individuals.remove(treeId, initial.id);
      toast.push({ title: t(locale, "person.deleted"), variant: "success" });
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    }
  };

  const label = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{initial ? t(locale, "person.edit") : t(locale, "person.add")}</SheetTitle>
      </SheetHeader>
      <SheetContent className="flex flex-col gap-3">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={label} htmlFor="person-native">{t(locale, "person.nativeName")}</label>
            <Input id="person-native" value={nativeName} onChange={(e) => setNativeName(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label} htmlFor="person-latin">{t(locale, "person.latinName")}</label>
            <Input id="person-latin" value={latinName} onChange={(e) => setLatinName(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="person-gender">{t(locale, "person.gender")}</label>
            <Select id="person-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">{t(locale, "person.male")}</option>
              <option value="FEMALE">{t(locale, "person.female")}</option>
            </Select>
          </div>
          <div>
            <label className={label} htmlFor="person-titles">{t(locale, "person.titles")}</label>
            <Input id="person-titles" value={titles} onChange={(e) => setTitles(e.target.value)} />
          </div>
          <div className="col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className={label}>{t(locale, "person.birth")}</label>
              {storedBirth && !clearBirth && (
                <button
                  type="button"
                  onClick={() => {
                    setBirth({});
                    setClearBirth(true);
                  }}
                  className="rounded text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {t(locale, "person.clearDate")}
                </button>
              )}
            </div>
            {clearBirth ? (
              <p className="text-xs text-muted-foreground">{t(locale, "person.cleared")}</p>
            ) : (
              <>
                <EthioDatePicker locale={locale} value={birth} onChange={editBirth} />
                <PartialHint locale={locale} date={birth} />
              </>
            )}
          </div>
          <div>
            <label className={label} htmlFor="person-birth-place">{t(locale, "person.place")}</label>
            <Input id="person-birth-place" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="person-birth-note">{t(locale, "person.note")}</label>
            <Input id="person-birth-note" value={birthNote} onChange={(e) => setBirthNote(e.target.value)} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="deceased"
              checked={deceased}
              onChange={(e) => setDeceased(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            <label htmlFor="deceased" className="text-sm">{t(locale, "person.deceased")}</label>
          </div>
          {deceased && (
            <div className="col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className={label}>{t(locale, "person.death")}</label>
                {storedDeath && !clearDeath && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeath({});
                      setClearDeath(true);
                    }}
                    className="rounded text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {t(locale, "person.clearDate")}
                  </button>
                )}
              </div>
              {clearDeath ? (
                <p className="text-xs text-muted-foreground">{t(locale, "person.cleared")}</p>
              ) : (
                <>
                  <EthioDatePicker locale={locale} value={death} onChange={editDeath} />
                  <PartialHint locale={locale} date={death} />
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
      <SheetFooter>
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {initial && canDelete && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                {t(locale, "person.delete")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t(locale, "person.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {t(locale, "person.save")}
            </Button>
          </div>
        </div>
      </SheetFooter>
      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} closeLabel={t(locale, "common.close")}>
        <DialogHeader>
          <DialogTitle>{t(locale, "person.delete")}</DialogTitle>
          <DialogDescription>{t(locale, "person.confirmDelete")}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm font-medium">{initial?.full_latin}</p>
          <p className="text-sm text-muted-foreground">{initial?.full_native}</p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
            {t(locale, "person.cancel")}
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            {t(locale, "person.delete")}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function PartialHint({ locale, date }: { locale: Locale; date: EthioDate }) {
  const filled = [date.year, date.month, date.day].filter((v) => v != null).length;
  if (filled === 0 || filled === 3) return null;
  return <p className="mt-1 text-xs text-muted-foreground">{t(locale, "person.partialHint")}</p>;
}

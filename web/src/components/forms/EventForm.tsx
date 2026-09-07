import { useState } from "react";
import { ApiError, api, type OverviewEvent } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useToast,
} from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  personId: string;
  initial?: OverviewEvent;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function validGCDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(Number(match[1]), month - 1, day));
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function EventForm({
  locale,
  treeId,
  personId,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [eventType, setEventType] = useState(initial?.event_type ?? "");
  const [dateGC, setDateGC] = useState(initial?.event_date_gc ?? "");
  const [yearEC, setYearEC] = useState(
    initial?.event_year_ec != null ? String(initial.event_year_ec) : "",
  );
  const [place, setPlace] = useState(initial?.event_place ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [clearDate, setClearDate] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toast = useToast();

  const storedDate =
    initial?.event_date_gc != null || initial?.event_year_ec != null;

  const submit = async () => {
    const type = eventType.trim();
    if (!type) {
      setError(t(locale, "event.typeRequired"));
      return;
    }
    const gc = dateGC.trim();
    if (gc && !validGCDate(gc)) {
      setError(t(locale, "event.invalidGC"));
      return;
    }
    let ec: number | undefined;
    if (yearEC.trim()) {
      ec = Number(yearEC.trim());
      if (!Number.isInteger(ec) || ec < 1) {
        setError(t(locale, "event.invalidEC"));
        return;
      }
    }
    setError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        event_type: type,
        event_date_gc: gc || undefined,
        event_year_ec: ec,
        event_place: place.trim() || undefined,
        description: description.trim() || undefined,
        clear_date: clearDate || undefined,
      };
      if (initial) {
        await api.events.update(treeId, personId, initial.id, body);
      } else {
        await api.events.create(treeId, personId, body);
      }
      toast.push({ title: t(locale, "event.saved"), variant: "success" });
      onSaved();
      onClose();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : t(locale, "common.error");
      setError(message);
      toast.push({ title: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    setConfirmingDelete(false);
    try {
      await api.events.remove(treeId, personId, initial.id);
      toast.push({ title: t(locale, "event.deleted"), variant: "success" });
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
        <SheetTitle>
          {initial ? t(locale, "event.edit") : t(locale, "event.add")}
        </SheetTitle>
      </SheetHeader>
      <SheetContent className="flex flex-col gap-3">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div>
          <label className={label} htmlFor="event-type">
            {t(locale, "event.type")}
          </label>
          <Input
            id="event-type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="GRADUATION"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="event-gc">
              {t(locale, "event.dateGC")}
            </label>
            <Input
              id="event-gc"
              value={dateGC}
              onChange={(e) => {
                setDateGC(e.target.value);
                setClearDate(false);
              }}
              placeholder="2002-06-27"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={label} htmlFor="event-ec">
              {t(locale, "event.yearEC")}
            </label>
            <Input
              id="event-ec"
              value={yearEC}
              onChange={(e) => {
                setYearEC(e.target.value);
                setClearDate(false);
              }}
              placeholder="1994"
              inputMode="numeric"
            />
          </div>
        </div>
        {initial && storedDate && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearDate}
              onChange={(e) => setClearDate(e.target.checked)}
              className="size-4 accent-accent"
            />
            {t(locale, "person.clearDate")}
          </label>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          {t(locale, "event.dateHint")}
        </p>
        <div>
          <label className={label} htmlFor="event-place">
            {t(locale, "event.place")}
          </label>
          <Input
            id="event-place"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="event-description">
            {t(locale, "event.description")}
          </label>
          <Input
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </SheetContent>
      <SheetFooter>
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {initial && (
              <Button
                variant="danger"
                onClick={() => setConfirmingDelete(true)}
              >
                {t(locale, "event.delete")}
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
      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        <DialogHeader>
          <DialogTitle>{t(locale, "event.delete")}</DialogTitle>
          <DialogDescription>
            {t(locale, "event.confirmDelete")}
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm font-medium">{initial?.event_type}</p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
            {t(locale, "person.cancel")}
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            {t(locale, "event.delete")}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

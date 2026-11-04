import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { EthioDatePicker } from "../ui/EthioDatePicker";
import { useToast } from "../ui/Toast";
import { api } from "../../lib/api";
import type { IndividualRecord, Gender } from "../../lib/types";
import { useI18n } from "../../lib/i18nContext";

interface IndividualFormProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  individual?: IndividualRecord | null;
  onSuccess: (saved: IndividualRecord) => void;
}

export const IndividualForm: React.FC<IndividualFormProps> = ({
  isOpen,
  onClose,
  treeId,
  individual,
  onSuccess,
}) => {
  const toast = useToast();
  const { t, locale } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  const [givenNameNative, setGivenNameNative] = useState("");
  const [givenNameLatin, setGivenNameLatin] = useState("");
  const [gender, setGender] = useState<Gender>("MALE");
  const [titles, setTitles] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");

  // Birth
  const [birthYearEC, setBirthYearEC] = useState<number | null>(null);
  const [birthMonthEC, setBirthMonthEC] = useState<number | null>(null);
  const [birthDayEC, setBirthDayEC] = useState<number | null>(null);
  const [birthDateGC, setBirthDateGC] = useState<string | null>(null);
  const [birthPlace, setBirthPlace] = useState("");
  const [birthNote, setBirthNote] = useState("");

  // Death
  const [isDeceased, setIsDeceased] = useState(false);
  const [deathYearEC, setDeathYearEC] = useState<number | null>(null);
  const [deathMonthEC, setDeathMonthEC] = useState<number | null>(null);
  const [deathDayEC, setDeathDayEC] = useState<number | null>(null);
  const [deathDateGC, setDeathDateGC] = useState<string | null>(null);
  const [deathPlace, setDeathPlace] = useState("");
  const [deathNote, setDeathNote] = useState("");

  useEffect(() => {
    if (individual) {
      setGivenNameNative(individual.given_name_native || "");
      setGivenNameLatin(individual.given_name_latin || "");
      setGender(individual.gender || "MALE");
      let initialTitles = "";
      if (Array.isArray(individual.titles)) {
        initialTitles = individual.titles
          .map((s) => s.replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim())
          .filter((s) => Boolean(s) && s !== "[]")
          .join(", ");
      } else if (typeof individual.titles === "string") {
        const cleaned = individual.titles.replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim();
        initialTitles = cleaned === "[]" ? "" : cleaned;
      }
      setTitles(initialTitles);
      setProfilePhotoUrl(individual.profile_photo_url || "");

      setBirthYearEC(individual.birth_year_ec || null);
      setBirthMonthEC(individual.birth_month_ec || null);
      setBirthDayEC(individual.birth_day_ec || null);
      setBirthDateGC(individual.birth_date_gc || null);
      setBirthPlace(individual.birth_place || "");
      setBirthNote(individual.birth_note || "");

      const dec =
        typeof individual.is_deceased === "number"
          ? individual.is_deceased === 1
          : !!individual.is_deceased;
      setIsDeceased(dec);
      setDeathYearEC(individual.death_year_ec || null);
      setDeathMonthEC(individual.death_month_ec || null);
      setDeathDayEC(individual.death_day_ec || null);
      setDeathDateGC(individual.death_date_gc || null);
      setDeathPlace(individual.death_place || "");
      setDeathNote(individual.death_note || "");
    } else {
      setGivenNameNative("");
      setGivenNameLatin("");
      setGender("MALE");
      setTitles("");
      setProfilePhotoUrl("");
      setBirthYearEC(null);
      setBirthMonthEC(null);
      setBirthDayEC(null);
      setBirthDateGC(null);
      setBirthPlace("");
      setBirthNote("");
      setIsDeceased(false);
      setDeathYearEC(null);
      setDeathMonthEC(null);
      setDeathDayEC(null);
      setDeathDateGC(null);
      setDeathPlace("");
      setDeathNote("");
    }
  }, [individual, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!givenNameNative.trim() || !givenNameLatin.trim()) {
      toast.error("Both native and latin given names are required");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        given_name_native: givenNameNative.trim(),
        given_name_latin: givenNameLatin.trim(),
        gender,
        titles: titles
          ? titles
              .split(",")
              .map((item) => item.replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim())
              .filter((s) => Boolean(s) && s !== "[]")
          : [],
        profile_photo_url: profilePhotoUrl.trim(),
        birth_year_ec: birthYearEC,
        birth_month_ec: birthMonthEC,
        birth_day_ec: birthDayEC,
        birth_date_gc: birthDateGC || "",
        birth_place: birthPlace.trim(),
        birth_note: birthNote.trim(),
        is_deceased: isDeceased,
      };

      if (isDeceased) {
        payload.death_year_ec = deathYearEC;
        payload.death_month_ec = deathMonthEC;
        payload.death_day_ec = deathDayEC;
        payload.death_date_gc = deathDateGC || "";
        payload.death_place = deathPlace.trim();
        payload.death_note = deathNote.trim();
      }

      let res: IndividualRecord;
      if (individual) {
        res = await api.updateIndividual(treeId, individual.id, payload);
        toast.success("Individual updated successfully");
      } else {
        res = await api.createIndividual(treeId, payload);
        toast.success("Individual created successfully");
      }

      onSuccess(res);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save individual";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={individual ? t("person.edit") : t("person.add")}
      subtitle="Individuals in Zer carry only given names. Full patronymic names are derived dynamically from parent links."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              {t("person.nativeName")} *
            </label>
            <input
              type="text"
              required
              placeholder={
                locale === "am" || locale === "ti" ? "ለምሳሌ፡ ኃይሌ ወይም ቶሎሳ" : "e.g. Haile or Tolosa"
              }
              value={givenNameNative}
              onChange={(e) => setGivenNameNative(e.target.value)}
              className="w-full px-3 py-2 text-base bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            />
            <p className="text-[11px] text-stone-400 mt-1">Given name in original script</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              {t("person.latinName")} *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Haile or Tolosa"
              value={givenNameLatin}
              onChange={(e) => setGivenNameLatin(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            />
            <p className="text-[11px] text-stone-400 mt-1">Latin transliteration</p>
          </div>
        </div>

        {/* Gender & Titles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              {t("person.gender")} *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender("MALE")}
                className={`py-2 px-3 text-sm font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                  gender === "MALE"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {t("person.male")}
              </button>
              <button
                type="button"
                onClick={() => setGender("FEMALE")}
                className={`py-2 px-3 text-sm font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                  gender === "FEMALE"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {t("person.female")}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              {t("person.titles")}
            </label>
            <input
              type="text"
              placeholder={
                locale === "am" || locale === "ti"
                  ? "ለምሳሌ፡ ፊታውራሪ፣ ደጃዝማች፣ ዶ/ር"
                  : "e.g. Dejazmach, Dr."
              }
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            />
            <p className="text-[11px] text-stone-400 mt-1">{t("person.titles")}</p>
          </div>
        </div>

        {/* Birth Details */}
        <div className="pt-2 border-t border-stone-100 space-y-4">
          <EthioDatePicker
            label={t("person.birth")}
            yearEC={birthYearEC}
            monthEC={birthMonthEC}
            dayEC={dayEC_fromState(birthDayEC)}
            dateGC={birthDateGC}
            onChange={(dates) => {
              setBirthYearEC(dates.yearEC || null);
              setBirthMonthEC(dates.monthEC || null);
              setBirthDayEC(dates.dayEC || null);
              setBirthDateGC(dates.dateGC || null);
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                {t("person.birth")} {t("person.place")}
              </label>
              <input
                type="text"
                placeholder="e.g. Asella, Arsi"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                {t("person.birth")} {t("person.note")}
              </label>
              <input
                type="text"
                placeholder="Additional notes"
                value={birthNote}
                onChange={(e) => setBirthNote(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>
        </div>

        {/* Deceased Section */}
        <div className="pt-2 border-t border-stone-100 space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_deceased"
              checked={isDeceased}
              onChange={(e) => setIsDeceased(e.target.checked)}
              className="w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500 cursor-pointer"
            />
            <label
              htmlFor="is_deceased"
              className="text-sm font-medium text-stone-800 cursor-pointer select-none"
            >
              {t("person.deceased")}
            </label>
          </div>

          {isDeceased && (
            <div className="space-y-4 pl-6 border-l-2 border-stone-200 animate-in fade-in duration-150">
              <EthioDatePicker
                label={t("person.death")}
                yearEC={deathYearEC}
                monthEC={deathMonthEC}
                dayEC={deathDayEC}
                dateGC={deathDateGC}
                onChange={(dates) => {
                  setDeathYearEC(dates.yearEC || null);
                  setDeathMonthEC(dates.monthEC || null);
                  setDeathDayEC(dates.dayEC || null);
                  setDeathDateGC(dates.dateGC || null);
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    {t("person.death")} {t("person.place")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Addis Ababa"
                    value={deathPlace}
                    onChange={(e) => setDeathPlace(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    {t("person.death")} {t("person.note")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. St. George Church"
                    value={deathNote}
                    onChange={(e) => setDeathNote(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profile Photo */}
        <div className="pt-2 border-t border-stone-100">
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t("person.photo")}
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={profilePhotoUrl}
            onChange={(e) => setProfilePhotoUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          >
            {t("person.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {submitting ? t("common.loading") : t("person.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
};

function dayEC_fromState(val: number | null | undefined): number | null {
  return val || null;
}

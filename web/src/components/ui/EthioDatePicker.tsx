import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18nContext';

interface EthioDatePickerProps {
  label: string;
  yearEC?: number | null;
  monthEC?: number | null;
  dayEC?: number | null;
  dateGC?: string | null;
  onChange: (val: {
    yearEC?: number | null;
    monthEC?: number | null;
    dayEC?: number | null;
    dateGC?: string | null;
  }) => void;
  helperText?: string;
}

export const EthioDatePicker: React.FC<EthioDatePickerProps> = ({
  label,
  yearEC,
  monthEC,
  dayEC,
  dateGC,
  onChange,
  helperText,
}) => {
  const { months, t } = useI18n();
  const [calendarMode, setCalendarMode] = useState<'EC' | 'GC'>(dateGC && !yearEC ? 'GC' : 'EC');
  const [convertedPreview, setConvertedPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (calendarMode === 'EC' && yearEC && monthEC && dayEC) {
      api
        .convertCalendar({
          mode: 'ec_to_gc',
          year: yearEC,
          month: monthEC,
          day: dayEC,
        })
        .then((res) => {
          if (active) setConvertedPreview(`Equivalent GC: ${res.date_gc}`);
        })
        .catch(() => {
          if (active) setConvertedPreview(null);
        });
    } else if (calendarMode === 'GC' && dateGC) {
      api
        .convertCalendar({
          mode: 'gc_to_ec',
          date: dateGC,
        })
        .then((res) => {
          const mName = months[res.month_ec - 1] || '';
          const era = t('calendar.eraEC');
          if (active) setConvertedPreview(`Equivalent EC: ${res.day_ec} ${mName} ${res.year_ec} ${era}`);
        })
        .catch(() => {
          if (active) setConvertedPreview(null);
        });
    } else {
      setConvertedPreview(null);
    }
    return () => {
      active = false;
    };
  }, [calendarMode, yearEC, monthEC, dayEC, dateGC, months, t]);

  const maxDays = monthEC === 13 ? 6 : 30;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider">
          {label}
        </label>
        <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setCalendarMode('EC')}
            className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
              calendarMode === 'EC'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t('calendar.ethiopian')}
          </button>
          <button
            type="button"
            onClick={() => setCalendarMode('GC')}
            className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
              calendarMode === 'GC'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t('calendar.gregorian')}
          </button>
        </div>
      </div>

      {calendarMode === 'EC' ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] text-stone-500 mb-1">{t('common.day')}</label>
            <select
              value={dayEC || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                onChange({ yearEC, monthEC, dayEC: val, dateGC: null });
              }}
              className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            >
              <option value="">{t('common.day')}</option>
              {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-stone-500 mb-1">{t('common.month')}</label>
            <select
              value={monthEC || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                onChange({ yearEC, monthEC: val, dayEC, dateGC: null });
              }}
              className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 cursor-pointer"
            >
              <option value="">{t('common.month')}</option>
              {months.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}. {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-stone-500 mb-1">{t('calendar.yearEC')}</label>
            <input
              type="number"
              placeholder="e.g. 1968"
              value={yearEC || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                onChange({ yearEC: val, monthEC, dayEC, dateGC: null });
              }}
              className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            />
          </div>
        </div>
      ) : (
        <div>
          <input
            type="date"
            value={dateGC || ''}
            onChange={(e) => {
              const val = e.target.value || null;
              onChange({ yearEC: null, monthEC: null, dayEC: null, dateGC: val });
            }}
            className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-stone-500 pt-0.5">
        <span>{convertedPreview || helperText || 'Partial year is supported'}</span>
        {(yearEC || monthEC || dayEC || dateGC) && (
          <button
            type="button"
            onClick={() => onChange({ yearEC: null, monthEC: null, dayEC: null, dateGC: null })}
            className="text-stone-400 hover:text-stone-700 cursor-pointer underline transition-colors"
          >
            Clear date
          </button>
        )}
      </div>
    </div>
  );
};

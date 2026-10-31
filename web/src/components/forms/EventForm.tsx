import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { EthioDatePicker } from '../ui/EthioDatePicker';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import type { OverviewEvent } from '../../lib/types';
import { useI18n } from '../../lib/i18nContext';

interface EventFormProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  individualId: string;
  event?: OverviewEvent | null;
  onSuccess: () => void;
}

const COMMON_EVENT_KEYS = [
  'birth',
  'baptism',
  'communion',
  'marriage',
  'title_bestowal',
  'ordination',
  'graduation',
  'military_service',
  'migration',
  'retirement',
  'memorial',
];

export const EventForm: React.FC<EventFormProps> = ({
  isOpen,
  onClose,
  treeId,
  individualId,
  event,
  onSuccess,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  const [eventType, setEventType] = useState('');
  const [eventYearEC, setEventYearEC] = useState<number | null>(null);
  const [eventDateGC, setEventDateGC] = useState<string | null>(null);
  const [eventPlace, setEventPlace] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (event) {
      setEventType(event.event_type || '');
      setEventYearEC(event.event_year_ec || null);
      setEventDateGC(event.event_date_gc || null);
      setEventPlace(event.event_place || '');
      setDescription(event.description || '');
    } else {
      setEventType('');
      setEventYearEC(null);
      setEventDateGC(null);
      setEventPlace('');
      setDescription('');
    }
  }, [event, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventType.trim()) {
      toast.error('Event type is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        event_type: eventType.trim(),
        event_year_ec: eventYearEC,
        event_date_gc: eventDateGC || '',
        event_place: eventPlace.trim(),
        description: description.trim(),
      };

      if (event) {
        await api.updateEvent(treeId, individualId, event.id, payload);
        toast.success('Event updated successfully');
      } else {
        await api.createEvent(treeId, individualId, payload);
        toast.success('Event recorded successfully');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save event';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? t('event.edit') : t('event.add')}
      subtitle="Biographical milestone or historical record for this individual."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t('event.type')} *
          </label>
          <input
            type="text"
            required
            list="event-types-list"
            placeholder="e.g. Baptism, Marriage, Ordination"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
          <datalist id="event-types-list">
            {COMMON_EVENT_KEYS.map((k) => (
              <option key={k} value={t(`event.types.${k}`)} />
            ))}
          </datalist>
        </div>

        <EthioDatePicker
          label={t('event.type')}
          yearEC={eventYearEC}
          dateGC={eventDateGC}
          onChange={(dates) => {
            setEventYearEC(dates.yearEC || null);
            setEventDateGC(dates.dateGC || null);
          }}
        />

        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
            {t('event.place')}
          </label>
          <input
            type="text"
            placeholder="e.g. Debre Libanos Monastery, Shewa"
            value={eventPlace}
            onChange={(e) => setEventPlace(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
            {t('event.description')}
          </label>
          <textarea
            rows={3}
            placeholder="Details, context, or church / registry citation..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
          />
        </div>

        <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          >
            {t('person.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {submitting ? t('common.loading') : event ? t('event.edit') : t('event.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

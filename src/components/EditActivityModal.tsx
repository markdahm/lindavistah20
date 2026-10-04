'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import { Property, Payment, MeterReading } from '@/lib/types';
import type { ActivityItem } from '@/lib/activity';

interface EditActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityItem | null;
  properties: Property[];
  readings?: MeterReading[];
  onSavePayment: (payment: Payment) => void;
  onSaveReading: (reading: MeterReading) => void;
  onDeletePayment: (paymentId: string) => void;
  onDeleteReading: (readingId: string) => void;
  // Pass original data for readings to preserve fields we don't edit
  originalReading?: MeterReading;
  originalPayment?: Payment;
}

export default function EditActivityModal({
  isOpen,
  onClose,
  activity,
  properties,
  readings = [],
  onSavePayment,
  onSaveReading,
  onDeletePayment,
  onDeleteReading,
  originalReading,
  originalPayment,
}: EditActivityModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [readingValue, setReadingValue] = useState('');
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Find previous reading for the same meter
  const previousReading = originalReading ? readings
    .filter(r => r.meterId === originalReading.meterId && r.id !== originalReading.id)
    .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod))[0]
    : null;

  useEffect(() => {
    if (activity) {
      setDate(activity.date);
      if (activity.type === 'payment') {
        setAmount(activity.amount?.toString() || '');
        setNotes(originalPayment?.notes || '');
      } else {
        setReadingValue(activity.readingValue?.toString() || '');
      }
      setShowDeleteConfirm(false);
    }
  }, [activity, originalPayment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!activity) return;

    if (activity.type === 'payment' && originalPayment) {
      const updatedPayment: Payment = {
        ...originalPayment,
        amount: parseFloat(amount),
        receivedDate: date,
        notes,
      };
      onSavePayment(updatedPayment);
    } else if (activity.type === 'reading' && originalReading) {
      const newReadingValue = parseInt(readingValue);
      const updatedReading: MeterReading = {
        ...originalReading,
        readingDate: date,
        readingValue: newReadingValue,
        // Recalculate raw usage if reading value changed
        rawUsage: originalReading.rawUsage + (newReadingValue - originalReading.readingValue),
        usage: originalReading.usage + (newReadingValue - originalReading.readingValue),
      };
      onSaveReading(updatedReading);
    }

    onClose();
  };

  const handleDelete = () => {
    if (!activity) return;

    if (activity.type === 'payment') {
      onDeletePayment(activity.originalId);
    } else {
      onDeleteReading(activity.originalId);
    }
    onClose();
  };

  const handleRevertToPrevious = () => {
    if (!activity || activity.type !== 'reading' || !previousReading || !originalReading) return;

    const revertedReading: MeterReading = {
      ...originalReading,
      readingValue: previousReading.readingValue,
      readingDate: originalReading.readingDate,
      rawUsage: 0,
      usage: 0,
    };
    onSaveReading(revertedReading);
    onClose();
  };

  if (!activity) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${activity.type === 'payment' ? 'Payment' : 'Reading'}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            Property
          </label>
          <input
            type="text"
            value={properties.find(p => p.id === activity.propertyId)?.name || 'Unknown'}
            disabled
            className="bg-[var(--border)] cursor-not-allowed"
          />
        </div>

        {activity.type === 'payment' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                  required
                  inputMode="decimal"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Date Received
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Check #1234"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Meter Reading
              </label>
              <input
                type="number"
                value={readingValue}
                onChange={(e) => setReadingValue(e.target.value)}
                placeholder="0"
                required
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Reading Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 btn-primary"
          >
            Save Changes
          </button>
        </div>

        {/* Delete section */}
        <div className="pt-4 border-t border-[var(--border)]">
          {activity.type === 'reading' && previousReading && (
            <button
              type="button"
              onClick={handleRevertToPrevious}
              className="w-full px-4 py-2 mb-3 text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors text-sm font-medium"
            >
              Revert to Previous Reading ({previousReading.readingValue.toLocaleString()})
            </button>
          )}
          {showDeleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)] text-center">
                Are you sure you want to delete this {activity.type}?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
            >
              Delete this {activity.type}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

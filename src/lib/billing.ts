// Billing calculator ported from Swift

import type { BillingSettings, MeterReading, Payment, Property, Invoice } from './types';

export interface BillCalculation {
  totalGallons: number;
  tier1Gallons: number;
  tier2Gallons: number;
  tier3Gallons: number;
  tier1Charge: number;
  tier2Charge: number;
  tier3Charge: number;
  fixedCharge: number;
  totalAmount: number;
}

export function calculateBill(usage: number, settings: BillingSettings): BillCalculation {
  // Calculate tier gallons
  const tier1Gallons = Math.min(usage, settings.tier1Limit);
  const tier2Gallons = Math.max(0, Math.min(usage - settings.tier1Limit, settings.tier2Limit - settings.tier1Limit));
  const tier3Gallons = Math.max(0, usage - settings.tier2Limit);

  // Calculate charges (rates are per 1000 gallons)
  const tier1Charge = (tier1Gallons / 1000) * settings.tier1RatePerThousand;
  const tier2Charge = (tier2Gallons / 1000) * settings.tier2RatePerThousand;
  const tier3Charge = (tier3Gallons / 1000) * settings.tier3RatePerThousand;
  const fixedCharge = settings.fixedMonthlyFee;

  const totalAmount = fixedCharge + tier1Charge + tier2Charge + tier3Charge;

  return {
    totalGallons: usage,
    tier1Gallons,
    tier2Gallons,
    tier3Gallons,
    tier1Charge,
    tier2Charge,
    tier3Charge,
    fixedCharge,
    totalAmount,
  };
}

export function calculatePropertyBalance(
  property: Property,
  readings: MeterReading[],
  payments: Payment[],
  settings: BillingSettings
): number {
  // Start with balance adjustment
  let balance = property.balanceAdjustment;

  // Get readings for this property
  const propertyReadings = readings.filter(r => r.propertyId === property.id);

  // Group readings by billing period and sum usage
  const usageByPeriod = new Map<string, number>();
  for (const reading of propertyReadings) {
    const currentUsage = usageByPeriod.get(reading.billingPeriod) || 0;
    usageByPeriod.set(reading.billingPeriod, currentUsage + reading.usage);
  }

  // Calculate charges for each period (bills increase what customer owes)
  for (const usage of usageByPeriod.values()) {
    const bill = calculateBill(Math.max(0, usage), settings);
    balance += bill.totalAmount;
  }

  // Subtract payments (payments reduce what customer owes)
  const propertyPayments = payments.filter(p => p.propertyId === property.id);
  for (const payment of propertyPayments) {
    balance -= payment.amount;
  }

  return balance;
}

export function calculatePaymentsOnPreviousBalance(
  propertyId: string,
  currentPeriod: string,
  previousBalance: number,
  allPayments: Payment[]
): number {
  // If there was no balance owed (or customer had credit), return 0
  if (previousBalance <= 0) {
    return 0;
  }

  // Calculate the next billing period to define the end of the date range
  const [year, month] = currentPeriod.split('-').map(Number);
  const nextDate = new Date(year, month, 1); // month is already 0-indexed after we subtract 1, so adding 1 gives us next month
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  // Get payments made during the current period (from currentPeriod start to nextPeriod start)
  const periodPayments = allPayments.filter(
    p => p.propertyId === propertyId &&
         p.receivedDate >= currentPeriod &&
         p.receivedDate < nextPeriod
  );

  // Sum total payments in the period
  const totalPayments = periodPayments.reduce((sum, p) => sum + p.amount, 0);

  // Cap at the previous balance amount
  return Math.min(totalPayments, previousBalance);
}

export function getUsageForPeriod(
  propertyId: string,
  billingPeriod: string,
  readings: MeterReading[]
): number {
  return readings
    .filter(r => r.propertyId === propertyId && r.billingPeriod === billingPeriod)
    .reduce((sum, r) => sum + r.usage, 0);
}

export function getLastSixMonthsUsage(
  propertyId: string,
  readings: MeterReading[]
): { period: string; usage: number }[] {
  const propertyReadings = readings.filter(r => r.propertyId === propertyId);

  // Group by period
  const usageByPeriod = new Map<string, number>();
  for (const reading of propertyReadings) {
    const currentUsage = usageByPeriod.get(reading.billingPeriod) || 0;
    usageByPeriod.set(reading.billingPeriod, currentUsage + reading.usage);
  }

  // Sort by period and take last 6
  return Array.from(usageByPeriod.entries())
    .map(([period, usage]) => ({ period, usage }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6);
}

export function formatBillingPeriod(period: string): string {
  const parts = period.split('-');
  if (parts.length !== 2) return period;

  const year = parts[0];
  const month = parseInt(parts[1], 10);

  const monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (month < 1 || month > 12) return period;
  return `${monthNames[month]} ${year}`;
}

export function formatShortPeriod(period: string): string {
  const parts = period.split('-');
  if (parts.length !== 2) return period;

  const month = parseInt(parts[1], 10);
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return monthNames[month] || period;
}

export function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `-$${Math.abs(amount).toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function getCurrentBillingPeriod(): string {
  const now = new Date();
  // Readings recorded should appear as the previous month's usage
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = previousMonth.getFullYear();
  const month = String(previousMonth.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function generateInvoice(
  property: Property,
  billingPeriod: string,
  readings: MeterReading[],
  payments: Payment[],
  settings: BillingSettings,
  previousBalance: number
): Invoice {
  const usage = getUsageForPeriod(property.id, billingPeriod, readings);
  const bill = calculateBill(Math.max(0, usage), settings);

  const paymentsOnPreviousBalance = calculatePaymentsOnPreviousBalance(
    property.id,
    billingPeriod,
    previousBalance,
    payments
  );

  const now = new Date();
  const generatedDate = now.toISOString().split('T')[0];

  return {
    id: crypto.randomUUID(),
    propertyId: property.id,
    billingPeriod,
    generatedDate,
    totalGallons: bill.totalGallons,
    tier1Gallons: bill.tier1Gallons,
    tier2Gallons: bill.tier2Gallons,
    tier3Gallons: bill.tier3Gallons,
    tier1Charge: bill.tier1Charge,
    tier2Charge: bill.tier2Charge,
    tier3Charge: bill.tier3Charge,
    fixedCharge: bill.fixedCharge,
    totalAmount: bill.totalAmount,
    previousBalance,
    paymentsOnPreviousBalance,
    amountDue: bill.totalAmount - previousBalance,
  };
}

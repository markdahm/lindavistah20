// Types matching Swift models from macOS app

export interface Meter {
  id: string;
  label: string;
  shift: number;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  balanceAdjustment: number;
  meters: Meter[];
}

export interface MeterReading {
  id: string;
  meterId: string;
  propertyId: string;
  readingDate: string;
  billingPeriod: string;
  readingValue: number;
  rawUsage: number;
  usage: number;
}

export interface Payment {
  id: string;
  propertyId: string;
  amount: number;
  receivedDate: string;
  notes: string;
}

export interface Invoice {
  id: string;
  propertyId: string;
  billingPeriod: string;
  generatedDate: string;
  totalGallons: number;
  tier1Gallons: number;
  tier2Gallons: number;
  tier3Gallons: number;
  tier1Charge: number;
  tier2Charge: number;
  tier3Charge: number;
  fixedCharge: number;
  totalAmount: number;
  previousBalance: number;
  paymentsOnPreviousBalance: number;
  amountDue: number;
}

export interface Neighbor {
  id: string;
  propertyId: string;
  name: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface BillingSettings {
  fixedMonthlyFee: number;
  tier1Limit: number;
  tier1RatePerThousand: number;
  tier2Limit: number;
  tier2RatePerThousand: number;
  tier3Limit: number;
  tier3RatePerThousand: number;
}

/** What the company spends. Categories are fixed so the Profitability chart can stack them. */
export type ExpenseCategory = 'PG&E' | 'Property Tax' | 'Water Tax' | 'Other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  /** The day it was paid, YYYY-MM-DD. The chart places it in that calendar month. */
  paidDate: string;
  amount: number;
  notes: string;
}

export interface AppData {
  properties: Property[];
  readings: MeterReading[];
  payments: Payment[];
  invoices: Invoice[];
  neighbors: Neighbor[];
  settings: BillingSettings;
  /** Added October 2026. Documents written before then have no key; read it as []. */
  expenses?: Expense[];
}

// Activity item for combined history view
export type ActivityType = 'payment' | 'reading';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  propertyId: string;
  date: string;
  description: string;
  amount?: number;
  usage?: number;
}

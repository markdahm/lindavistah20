'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { AppData, Invoice, Property } from '@/lib/types';
import { loadData } from '@/lib/data';
import {
  calculateBill,
  getUsageForPeriod,
  calculatePropertyBalance,
  calculatePaymentsOnPreviousBalance,
  formatBillingPeriod,
  formatCurrency,
  getCurrentBillingPeriod,
} from '@/lib/billing';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InvoicesPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentBillingPeriod());
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const printAllRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Get available years from readings
  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set(data.readings.map((r) => r.billingPeriod.split('-')[0]));
    return Array.from(years).sort().reverse();
  }, [data]);

  // Get the selected year from selectedPeriod
  const selectedYear = selectedPeriod.split('-')[0];

  // Get periods that have data for the selected year
  const periodsWithData = useMemo(() => {
    if (!data) return new Set<string>();
    const periods = new Set<string>();
    data.readings.forEach((r) => {
      if (r.billingPeriod.startsWith(selectedYear)) {
        periods.add(r.billingPeriod);
      }
    });
    return periods;
  }, [data, selectedYear]);

  // Calculate invoices on-the-fly for a given period
  const calculateInvoicesForPeriod = (period: string): Invoice[] => {
    if (!data) return [];

    const invoices: Invoice[] = [];

    for (const property of data.properties) {
      const usage = getUsageForPeriod(property.id, period, data.readings);
      if (usage <= 0) continue;

      const bill = calculateBill(usage, data.settings);
      const previousBalance = calculatePropertyBalance(
        property,
        data.readings.filter((r) => r.billingPeriod < period),
        data.payments.filter((p) => p.receivedDate < period),
        data.settings
      );

      const paymentsOnPreviousBalance = calculatePaymentsOnPreviousBalance(
        property.id,
        period,
        previousBalance,
        data.payments
      );

      const invoice: Invoice = {
        id: `inv-${property.id}-${period}`,
        propertyId: property.id,
        billingPeriod: period,
        generatedDate: new Date().toISOString().split('T')[0],
        totalGallons: usage,
        tier1Gallons: bill.tier1Gallons,
        tier2Gallons: bill.tier2Gallons,
        tier3Gallons: bill.tier3Gallons,
        tier1Charge: bill.tier1Charge,
        tier2Charge: bill.tier2Charge,
        tier3Charge: bill.tier3Charge,
        fixedCharge: bill.fixedCharge,
        totalAmount: bill.totalAmount,
        previousBalance: -previousBalance,
        paymentsOnPreviousBalance,
        amountDue: bill.totalAmount - previousBalance,
      };

      invoices.push(invoice);
    }

    return invoices;
  };

  // Calculate monthly totals for bar chart
  const monthlyTotals = useMemo(() => {
    if (!data) return [];
    return MONTH_NAMES.map((_, index) => {
      const periodKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
      const invoices = calculateInvoicesForPeriod(periodKey);
      const totalCost = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalGallons = invoices.reduce((sum, inv) => sum + inv.totalGallons, 0);
      const hasReadings = data.readings.some((r) => r.billingPeriod === periodKey);
      return { month: index, periodKey, totalCost, totalGallons, hasReadings, hasInvoices: invoices.length > 0, hasData: hasReadings };
    });
  }, [data, selectedYear]);

  const maxMonthlyGallons = useMemo(() => {
    return Math.max(...monthlyTotals.map((m) => m.totalGallons), 1);
  }, [monthlyTotals]);

  const periodInvoices = useMemo(() => {
    return calculateInvoicesForPeriod(selectedPeriod);
  }, [data, selectedPeriod]);

  const getPropertyName = (propertyId: string): string => {
    if (!data) return 'Unknown';
    const property = data.properties.find((p) => p.id === propertyId);
    return property?.name || 'Unknown';
  };

  const getProperty = (propertyId: string): Property | undefined => {
    if (!data) return undefined;
    return data.properties.find((p) => p.id === propertyId);
  };

  const getAccountBalance = (propertyId: string): number => {
    if (!data) return 0;
    const property = data.properties.find((p) => p.id === propertyId);
    if (!property) return 0;
    return calculatePropertyBalance(property, data.readings, data.payments, data.settings);
  };

  const handleYearChange = (year: string) => {
    // When changing year, select the most recent month with data, or January
    const monthsWithData = Array.from(periodsWithData)
      .filter((p) => p.startsWith(year))
      .sort()
      .reverse();
    if (monthsWithData.length > 0) {
      setSelectedPeriod(monthsWithData[0]);
    } else {
      setSelectedPeriod(`${year}-01`);
    }
  };

  const handleMonthSelect = (monthIndex: number) => {
    const month = String(monthIndex + 1).padStart(2, '0');
    setSelectedPeriod(`${selectedYear}-${month}`);
  };

  const generateInvoiceHTML = (invoice: Invoice) => {
    const property = getProperty(invoice.propertyId);
    const accountBalance = getAccountBalance(invoice.propertyId);
    const hasCredit = accountBalance < 0;
    return `
      <div style="page-break-after: always; padding: 40px;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="margin: 0; font-size: 24px;">Linda Vista Water</h1>
          <p style="color: #666; margin: 5px 0;">Water Service Invoice</p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <h3 style="margin: 0 0 5px 0; font-size: 14px; color: #666;">Invoice for</h3>
            <p style="margin: 0; font-weight: 600;">${property?.name || 'Unknown'} Household</p>
            <p style="margin: 0; font-size: 14px; white-space: pre-line;">${property?.address || ''}</p>
          </div>
          <div style="text-align: right;">
            <h3 style="margin: 0 0 5px 0; font-size: 14px; color: #666;">Invoice Details</h3>
            <p style="margin: 0;"><span style="color: #666;">Period:</span> ${formatBillingPeriod(invoice.billingPeriod)}</p>
            <p style="margin: 0;"><span style="color: #666;">Generated:</span> ${invoice.generatedDate}</p>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0;">Usage Summary</h3>
          <p style="font-size: 28px; font-weight: bold; color: #3366AA; margin: 0;">
            ${invoice.totalGallons.toLocaleString()} <span style="font-size: 16px; font-weight: normal;">gallons</span>
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="border-bottom: 2px solid #ddd;">
              <th style="padding: 12px; text-align: left;">Description</th>
              <th style="padding: 12px; text-align: right;">Quantity</th>
              <th style="padding: 12px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">Previous unpaid balance</td>
              <td style="padding: 12px; text-align: right;"></td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(-invoice.previousBalance)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">Payments on previous balance</td>
              <td style="padding: 12px; text-align: right;"></td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.paymentsOnPreviousBalance)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd; font-weight: 600;">
              <td style="padding: 12px;">Net unpaid balance</td>
              <td style="padding: 12px; text-align: right;"></td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(-invoice.previousBalance - invoice.paymentsOnPreviousBalance)}</td>
            </tr>
            <tr>
              <td style="padding: 24px;" colspan="3"></td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">${formatBillingPeriod(invoice.billingPeriod).split(' ')[0]} Service Fee</td>
              <td style="padding: 12px; text-align: right;">1</td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.fixedCharge)}</td>
            </tr>
            ${invoice.tier1Gallons > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">Tier 1 Water Usage</td>
              <td style="padding: 12px; text-align: right;">${invoice.tier1Gallons.toLocaleString()} gal</td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.tier1Charge)}</td>
            </tr>` : ''}
            ${invoice.tier2Gallons > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">Tier 2 Water Usage</td>
              <td style="padding: 12px; text-align: right;">${invoice.tier2Gallons.toLocaleString()} gal</td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.tier2Charge)}</td>
            </tr>` : ''}
            ${invoice.tier3Gallons > 0 ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 12px;">Tier 3 Water Usage</td>
              <td style="padding: 12px; text-align: right;">${invoice.tier3Gallons.toLocaleString()} gal</td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.tier3Charge)}</td>
            </tr>` : ''}
            <tr style="border-bottom: 1px solid #ddd; font-weight: 600;">
              <td style="padding: 12px;">Current Charges</td>
              <td style="padding: 12px;"></td>
              <td style="padding: 12px; text-align: right;">${formatCurrency(invoice.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        ${-invoice.previousBalance > 0 ? (() => {
          const netUnpaid = Math.round((-invoice.previousBalance - invoice.paymentsOnPreviousBalance) * 100) / 100;
          const currentCharges = Math.round(invoice.totalAmount * 100) / 100;
          return `
        <div style="margin-top: 24px;"></div>
        <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #ddd;">
            <span>Previous unpaid balance</span>
            <span style="font-weight: 500;">${formatCurrency(netUnpaid)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #ddd;">
            <span>+ Current charges</span>
            <span style="font-weight: 500;">${formatCurrency(currentCharges)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 12px 16px; font-weight: 600;">
            <span>= Current Account Balance</span>
            <span>${formatCurrency(netUnpaid + currentCharges)}</span>
          </div>
        </div>`;
        })() : ''}

        <div style="padding: 20px; background: ${hasCredit ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 5px 0; font-size: 14px; color: #666;">Current Account Balance</p>
          <p style="margin: 0; font-size: 28px; font-weight: bold; color: ${hasCredit ? '#22c55e' : '#dc2626'};">
            ${formatCurrency(Math.abs(accountBalance))}
          </p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: ${hasCredit ? '#22c55e' : '#dc2626'};">
            ${hasCredit ? 'Credit' : 'Amount Due'}
          </p>
        </div>
      </div>
    `;
  };

  const handlePrint = () => {
    if (!selectedInvoice) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const invoiceHTML = generateInvoiceHTML(selectedInvoice);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${getPropertyName(selectedInvoice.propertyId)}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; }
            @media print {
              body { margin: 0; }
              div { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>${invoiceHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintAll = () => {
    if (periodInvoices.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const invoicesHTML = periodInvoices.map(generateInvoiceHTML).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>All Invoices - ${formatBillingPeriod(selectedPeriod)}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; }
            @media print {
              body { margin: 0; }
              div { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>${invoicesHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownloadAll = () => {
    if (periodInvoices.length === 0) return;

    // Create CSV content
    const headers = ['Property', 'Billing Period', 'Total Gallons', 'Fixed Fee', 'Tier 1', 'Tier 2', 'Tier 3', 'Total Amount', 'Previous Balance', 'Amount Due'];
    const rows = periodInvoices.map((inv) => [
      getPropertyName(inv.propertyId),
      formatBillingPeriod(inv.billingPeriod),
      inv.totalGallons,
      inv.fixedCharge.toFixed(2),
      inv.tier1Charge.toFixed(2),
      inv.tier2Charge.toFixed(2),
      inv.tier3Charge.toFixed(2),
      inv.totalAmount.toFixed(2),
      inv.previousBalance.toFixed(2),
      inv.amountDue.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `invoices-${selectedPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <p className="text-red-600">Failed to load data</p>
      </div>
    );
  }

  // Invoice detail view
  if (selectedInvoice) {
    const property = getProperty(selectedInvoice.propertyId);
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedInvoice(null)}
            className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Invoice Details</h1>
          <button onClick={handlePrint} className="ml-auto btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>

        <div className="card">
          <div className="header text-center mb-8">
            <h1 className="text-2xl font-bold">Linda Vista Water</h1>
            <p className="text-[var(--muted)]">Water Service Invoice</p>
          </div>

          <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
          <div>
              <h3 className="text-sm text-[var(--muted)] mb-1">Invoice for</h3>
              <p className="font-semibold">{property?.name} Household</p>
              <p className="text-sm whitespace-pre-line">{property?.address}</p>
            </div>
            <div className="text-right">
              <h3 className="text-sm text-[var(--muted)] mb-1">Invoice Details</h3>
              <p><span className="text-[var(--muted)]">Period:</span> {formatBillingPeriod(selectedInvoice.billingPeriod)}</p>
              <p><span className="text-[var(--muted)]">Generated:</span> {selectedInvoice.generatedDate}</p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold mb-3">Usage Summary</h3>
            <p className="text-3xl font-bold text-[var(--primary)]">
              {selectedInvoice.totalGallons.toLocaleString()} <span className="text-lg font-normal">gallons</span>
            </p>
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b">
                <th className="py-3 text-left">Description</th>
                <th className="py-3 text-right">Quantity</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3">Previous unpaid balance</td>
                <td className="py-3 text-right"></td>
                <td className="py-3 text-right">{formatCurrency(-selectedInvoice.previousBalance)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-3">Payments on previous balance</td>
                <td className="py-3 text-right"></td>
                <td className="py-3 text-right">{formatCurrency(selectedInvoice.paymentsOnPreviousBalance)}</td>
              </tr>
              <tr className="border-b font-semibold">
                <td className="py-3">Net unpaid balance</td>
                <td className="py-3 text-right"></td>
                <td className="py-3 text-right">{formatCurrency(-selectedInvoice.previousBalance - selectedInvoice.paymentsOnPreviousBalance)}</td>
              </tr>
              <tr>
                <td className="py-6" colSpan={3}></td>
              </tr>
              <tr className="border-b">
                <td className="py-3">{formatBillingPeriod(selectedInvoice.billingPeriod).split(' ')[0]} Service Fee</td>
                <td className="py-3 text-right">1</td>
                <td className="py-3 text-right">{formatCurrency(selectedInvoice.fixedCharge)}</td>
              </tr>
              {selectedInvoice.tier1Gallons > 0 && (
                <tr className="border-b">
                  <td className="py-3">Tier 1 Water Usage</td>
                  <td className="py-3 text-right">{selectedInvoice.tier1Gallons.toLocaleString()} gal</td>
                  <td className="py-3 text-right">{formatCurrency(selectedInvoice.tier1Charge)}</td>
                </tr>
              )}
              {selectedInvoice.tier2Gallons > 0 && (
                <tr className="border-b">
                  <td className="py-3">Tier 2 Water Usage</td>
                  <td className="py-3 text-right">{selectedInvoice.tier2Gallons.toLocaleString()} gal</td>
                  <td className="py-3 text-right">{formatCurrency(selectedInvoice.tier2Charge)}</td>
                </tr>
              )}
              {selectedInvoice.tier3Gallons > 0 && (
                <tr className="border-b">
                  <td className="py-3">Tier 3 Water Usage</td>
                  <td className="py-3 text-right">{selectedInvoice.tier3Gallons.toLocaleString()} gal</td>
                  <td className="py-3 text-right">{formatCurrency(selectedInvoice.tier3Charge)}</td>
                </tr>
              )}
              <tr className="border-b font-semibold">
                <td className="py-3">Current Charges</td>
                <td className="py-3"></td>
                <td className="py-3 text-right">{formatCurrency(selectedInvoice.totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Balance Summary - only when there's a previous unpaid balance */}
          <div className="mb-6" />
          {-selectedInvoice.previousBalance > 0 && (() => {
            const netUnpaid = Math.round((-selectedInvoice.previousBalance - selectedInvoice.paymentsOnPreviousBalance) * 100) / 100;
            const currentCharges = Math.round(selectedInvoice.totalAmount * 100) / 100;
            return (
              <div className="border rounded-lg overflow-hidden mb-4">
                <div className="flex justify-between items-center px-4 py-3 border-b">
                  <span className="text-sm">Previous unpaid balance</span>
                  <span className="font-medium">{formatCurrency(netUnpaid)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 border-b">
                  <span className="text-sm">+ Current charges</span>
                  <span className="font-medium">{formatCurrency(currentCharges)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 font-semibold">
                  <span>= Current Account Balance</span>
                  <span>{formatCurrency(netUnpaid + currentCharges)}</span>
                </div>
              </div>
            );
          })()}

          {/* Account Balance Section */}
          {(() => {
            const accountBalance = getAccountBalance(selectedInvoice.propertyId);
            const hasCredit = accountBalance < 0;
            return (
              <div className={`p-4 rounded-lg text-center ${hasCredit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <p className="text-sm text-[var(--muted)] mb-1">Current Account Balance</p>
                <p className={`text-3xl font-bold ${hasCredit ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(Math.abs(accountBalance))}
                </p>
                <p className={`text-sm mt-1 ${hasCredit ? 'text-green-500' : 'text-red-500'}`}>
                  {hasCredit ? 'Credit' : 'Amount Due'}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  const selectedMonth = parseInt(selectedPeriod.split('-')[1], 10) - 1;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">Invoices</h1>

      {/* Year selector */}
      {availableYears.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={() => handleYearChange(year)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]/20'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Monthly Bar Chart */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Monthly Usage & Revenue</h3>
          <p className="text-sm text-[var(--muted)]">Click a bar to view invoices</p>
        </div>
        <div className="h-56 flex items-end gap-1 md:gap-2">
          {monthlyTotals.map((item) => {
            const isSelected = selectedMonth === item.month;
            const height = item.totalGallons > 0 ? (item.totalGallons / maxMonthlyGallons) * 100 : 0;
            const showEmptyBar = item.hasData && !item.hasInvoices;

            return (
              <button
                key={item.month}
                onClick={() => handleMonthSelect(item.month)}
                disabled={!item.hasData}
                className={`flex-1 h-full flex flex-col items-center group ${
                  item.hasData ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                {/* Labels - Gallons and Cost */}
                <div className={`text-center mb-1 transition-colors ${
                  isSelected ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
                } ${item.totalGallons > 0 ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="text-xs font-medium">
                    {(item.totalGallons / 1000).toFixed(0)}k
                  </div>
                  <div className="text-[10px]">
                    ${item.totalCost.toFixed(0)}
                  </div>
                </div>

                {/* Bar */}
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-200 ${
                      isSelected
                        ? 'bg-[var(--primary)]'
                        : item.hasInvoices
                        ? 'bg-[var(--primary)]/40 group-hover:bg-[var(--primary)]/60'
                        : showEmptyBar
                        ? 'bg-[var(--border)] border-2 border-dashed border-[var(--primary)]/30'
                        : 'bg-[var(--border)]/50'
                    }`}
                    style={{ height: item.totalGallons > 0 ? `${Math.max(height, 8)}%` : showEmptyBar ? '20%' : '4%' }}
                  />
                </div>

                {/* Month label */}
                <span className={`text-xs mt-2 transition-colors ${
                  isSelected
                    ? 'text-[var(--primary)] font-medium'
                    : item.hasData
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--muted)]'
                }`}>
                  {MONTH_NAMES[item.month]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Month Header with Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">{formatBillingPeriod(selectedPeriod)}</h2>
        {periodInvoices.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              className="btn-secondary flex items-center gap-2 text-sm py-2 px-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={handlePrintAll}
              className="btn-secondary flex items-center gap-2 text-sm py-2 px-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        )}
      </div>

      {/* Invoices List */}
      {periodInvoices.length > 0 ? (
        <>
          {/* Mobile View - Cards */}
          <div className="md:hidden space-y-4">
            {periodInvoices.map((invoice) => (
              <button
                key={invoice.id}
                onClick={() => setSelectedInvoice(invoice)}
                className="card w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{getPropertyName(invoice.propertyId)}</h3>
                    <p className="text-sm text-[var(--muted)]">
                      {invoice.totalGallons.toLocaleString()} gallons
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">{formatCurrency(invoice.totalAmount)}</p>
                    <p className="text-sm text-[var(--muted)]">Current charges</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop View - Table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th className="text-right">Usage (gal)</th>
                  <th className="text-right">Fixed Fee</th>
                  <th className="text-right">Water Charges</th>
                  <th className="text-right">Current Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periodInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-medium">{getPropertyName(invoice.propertyId)}</td>
                    <td className="text-right">{invoice.totalGallons.toLocaleString()}</td>
                    <td className="text-right">{formatCurrency(invoice.fixedCharge)}</td>
                    <td className="text-right">
                      {formatCurrency(invoice.tier1Charge + invoice.tier2Charge + invoice.tier3Charge)}
                    </td>
                    <td className="text-right font-semibold">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => setSelectedInvoice(invoice)}
                        className="text-[var(--primary)] hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="font-bold">Total</td>
                  <td className="text-right font-bold">
                    {periodInvoices.reduce((sum, inv) => sum + inv.totalGallons, 0).toLocaleString()}
                  </td>
                  <td className="text-right font-bold">
                    {formatCurrency(periodInvoices.reduce((sum, inv) => sum + inv.fixedCharge, 0))}
                  </td>
                  <td className="text-right font-bold">
                    {formatCurrency(
                      periodInvoices.reduce(
                        (sum, inv) => sum + inv.tier1Charge + inv.tier2Charge + inv.tier3Charge,
                        0
                      )
                    )}
                  </td>
                  <td className="text-right font-bold">
                    {formatCurrency(periodInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto text-[var(--muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="font-semibold text-lg mb-2">No Invoices</h3>
          <p className="text-[var(--muted)]">
            No meter readings recorded for {formatBillingPeriod(selectedPeriod)}.
          </p>
        </div>
      )}

      {/* Hidden print container */}
      <div ref={printAllRef} className="hidden" />
    </div>
  );
}

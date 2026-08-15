'use client';

import AccountLedgerTemplate from '../components/AccountLedgerTemplate';

export default function PettyCashPage() {
  return (
    <AccountLedgerTemplate
      title="Petty Cash Account"
      subtitle="Record small day-to-day operational expenses and top-ups."
      icon="🧾"
      accent="text-amber-600"
      gradient="from-amber-50 via-yellow-50 to-orange-50"
      storageKey="accounts_petty_cash_ledger"
      apiEndpoint="/petty-cash-transactions"
      showAccountingColumns
      enablePagination
      tablePageSize={10}
      inTypeLabel="Petty Cash Top-up"
      outTypeLabel="Expense"
    />
  );
}

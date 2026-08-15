'use client';

import AccountLedgerTemplate from '../components/AccountLedgerTemplate';

export default function DeliveryCashPage() {
  return (
    <AccountLedgerTemplate
      title="Delivery Cash Account"
      subtitle="Track cash collected by delivery teams and related settlements."
      icon="🚚"
      accent="text-violet-600"
      gradient="from-violet-50 via-indigo-50 to-blue-50"
      storageKey="accounts_delivery_cash_ledger"
      apiEndpoint="/delivery-cash-transactions"
      showAccountingColumns
    />
  );
}

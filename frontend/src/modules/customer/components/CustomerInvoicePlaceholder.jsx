import { Card, Empty, Button, Typography } from "antd";

const { Text } = Typography;

/**
 * Invoice History — a deliberate, clearly-labeled "Coming soon" placeholder,
 * NOT hidden and NOT faked with mock data.
 *
 * Why: `Invoice` is a deliberate backend placeholder model
 * (`.context/final-plan.md` §6.3/§7.2) — `GET /customers/:id/invoices` and
 * `GET /customers/:id/ledger` were never built, since real invoicing
 * (numbering, ledger balances, payment tracking) is a later phase. The
 * "+ Create Invoice"/"View Ledger" buttons from
 * leads-customer-functional-spec.md's Invoice History section have nothing
 * real to call, so they're rendered disabled with an explanatory tooltip
 * rather than wired to a fake handler or omitted entirely — this section
 * exists in the page layout exactly where the spec puts it, it just can't
 * do anything yet.
 */
function CustomerInvoicePlaceholder() {
  return (
    <Card title="Invoice History" className="mb-6">
      <Empty
        description={
          <Text type="secondary">
            Coming soon — real invoicing (numbering, ledger, payment tracking) isn't built yet.
            The Payments module can partially reconcile against an invoice once one exists, but
            there's no list/detail view for invoices themselves.
          </Text>
        }
      >
        <Button disabled>+ Create Invoice</Button>
        <Button disabled className="ml-2">
          View Ledger
        </Button>
      </Empty>
    </Card>
  );
}

export default CustomerInvoicePlaceholder;

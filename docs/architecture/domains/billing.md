# Domain: Billing

## 1. Purpose
To handle all financial transactions, invoicing, tax calculations, and payment gateway interactions.

## 2. Responsibilities
*   Processing payments (Credit Cards, UPI, Bank Transfers).
*   Generating invoices and receipts.
*   Managing refunds and chargebacks.
*   Handling SaaS subscriptions for `Organizations` (Tenant billing).

## 3. Core Entities
*   **Invoice**: The financial record of a transaction.
*   **PaymentIntent**: The state machine representing an ongoing checkout.
*   **Subscription**: A recurring billing contract for an Organization.

## 4. Value Objects
*   `Money` (Amount, Currency)
*   `PaymentStatus` (Pending, Succeeded, Failed, Refunded)
*   `TaxRate`

## 5. Domain Events
*   `PaymentSucceeded`
*   `PaymentFailed`
*   `RefundIssued`
*   `InvoiceGenerated`

## 6. Business Rules
*   An `Invoice` cannot be altered once it reaches a finalized state (legally immutable).
*   A `PaymentIntent` must match the total `Money` requested by the external domain (e.g., Ticketing).
*   Refunds cannot exceed the original `PaymentSucceeded` amount.

## 7. Relationships with other domains
*   **Ticketing**: Ticketing asks Billing to process a charge for a specific amount. If `PaymentSucceeded`, Ticketing issues the ticket.
*   **Organizations**: Organizations are billed for SaaS usage (subscription layer).
*   **Sponsors/Exhibitors**: Billing processes their booth/sponsorship purchases.

## 8. Ownership Boundaries
*   **Owns**: Financial records, tax math, and gateway secrets (Stripe, Razorpay).
*   **Does NOT Own**: Why the money is being collected (e.g., it doesn't care if it's for a Ticket or a Sponsorship, it just processes the `Amount`).

## 9. Open Questions
*   How does the "India-First" strategy impact this? (e.g., Does UPI require a completely different async checkout flow compared to Credit Cards?)
*   Do we act as the Merchant of Record, or do Organizers connect their own Stripe/Razorpay accounts?

## 10. Future Considerations
*   Multi-currency wallet balances.
*   Automated revenue sharing/payouts between the Platform and the Organizer.

# Domain: Ticketing

## 1. Purpose
To manage access control, inventory, pricing tiers, and the issuance of tickets or badges for an event.

## 2. Responsibilities
*   Managing ticket types, inventory limits, and pricing.
*   Handling discount codes and promotional access.
*   Issuing unique tickets (QR codes, barcodes) to confirmed registrations.
*   Managing access control (Check-in/Scanning rules).

## 3. Core Entities
*   **TicketTier**: A purchasable or claimable tier (e.g., Early Bird VIP).
*   **Ticket**: The unique issued pass belonging to an attendee.
*   **DiscountCode**: Rules for price reduction.

## 4. Value Objects
*   `TicketStatus` (Issued, Checked-in, Revoked)
*   `Price` (Amount + Currency)
*   `InventoryCount`

## 5. Domain Events
*   `TicketIssued`
*   `TicketCheckedIn`
*   `InventoryDepleted`
*   `DiscountApplied`

## 6. Business Rules
*   A `TicketTier` cannot issue a `Ticket` if its `InventoryCount` has reached zero.
*   A `Ticket` must be bound to exactly one `AttendeeRecord` (from Registration).
*   Discount codes must be validated against their expiration date and usage limits.

## 7. Relationships with other domains
*   **Registration**: A registration is often incomplete without an issued ticket.
*   **Billing**: Ticketing defines the `Price`, but Billing executes the charge.
*   **Events**: Scoped to a specific Event.

## 8. Ownership Boundaries
*   **Owns**: Inventory, pricing logic, access rights, and the physical/digital badge construct.
*   **Does NOT Own**: The form data asking *why* they are attending (Registration), or the credit card processing (Billing).

## 9. Open Questions
*   Do we support ticket transfers? If so, does it invalidate the original Registration or spawn a new one?
*   How is multi-session or multi-track access controlled? (e.g., Workshop A ticket vs Workshop B ticket).

## 10. Future Considerations
*   Dynamic pricing algorithms.
*   NFT or blockchain-verified ticketing.

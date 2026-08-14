# Inventory service

Owns stock levels and reservations. Checkout reserves stock when an order is placed, releases on cancellation, and confirms on payment. Unconfirmed reservations expire.

## What it must never do

- **NEVER import or call the email provider.** Only `services/notification` may. If inventory needs to send mail later, render here, store the body, and publish a `SendInstruction`.
- NEVER read another service's data store. This service has its own Firestore database named `inventory`.
- NEVER import another service's internal modules.
- NEVER extract rendering into a shared package.

## Layers

- `src/transport/` — Pub/Sub push for reservation commands, HTTP for stock. Validates shape, hands off. NEVER imports from `infrastructure/`.
- `src/domain/` — reserve, release, confirm, and expiry. Ports live in `domain/ports/`.
- `src/infrastructure/` — this service's Firestore database and the Pub/Sub publisher for outcomes. Never checkout's or notification's database.

## Flow

Checkout publishes a reservation command. Inventory adjusts stock, records the reservation, and publishes an outcome. Checkout is a consumer of those outcomes.

## Tests that must pass

- Reserve decrements available stock and publishes `reserved`.
- Reserve against empty stock publishes `rejected` and does not create a reservation.
- Release restores stock. Confirm leaves stock decremented.
- Expiry of an unconfirmed reservation restores stock. The expiry decision lives in domain.

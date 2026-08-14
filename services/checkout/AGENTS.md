# Checkout service

Owns orders through payment. When an order is paid, renders a confirmation email stating the order ships within 48 hours, stores the HTML, and publishes a send instruction. Stock is reserved by publishing a command to inventory, not by calling it. Checkout consumes reservation outcomes on a second topic, so it is both a publisher and a subscriber.

## What it must never do

- **NEVER import or call the email provider.** Publish a `SendInstruction` to the notification service instead. This is the single most important constraint in the repository, and the violation the whole exercise exists to catch.
- NEVER read another service's data store.
- NEVER import another service's internal modules.
- NEVER extract rendering into a shared package. Checkout owns its rendering. Duplication with other services is deliberate and accepted.
- Import `@observability/runtime` as-is for logging and tracing. Do not subclass or wrap it.

## Layers

- `src/transport/` — Pub/Sub subscriber (reservation outcomes) and HTTP surface. Validates shape, hands off.
- `src/domain/` — order state, the decision to notify, and rendering. All decisions live here. Ports that infrastructure implements live in `domain/ports/`.
- `src/infrastructure/` — this service's Firestore database, Cloud Storage writes, the Pub/Sub publishers. Never the notification or inventory database.

## Flow on payment

Order marked paid → render HTML in `domain/` → store via `infrastructure/` → publish `SendInstruction` with `bodyRef` pointing at the stored object.

## Tests that must pass

- Marking an order paid renders, stores, and publishes an instruction whose `bodyRef` resolves.
- ts-arch rule 3 fails if the provider client is imported anywhere in this service.

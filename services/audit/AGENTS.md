# Audit service

Append-only log of messages already flowing on `send-instructions`. It does not send mail, touch stock, or own orders.

## What it must never do

- NEVER import or call the email provider.
- NEVER read another service's data store. Firestore database name is `audit`.
- NEVER import another service's internal modules.

## Layers

- `src/transport/` — push intake. Validates the envelope, hands off.
- `src/domain/` — decide what to record. Ports live in `domain/ports/`.
- `src/infrastructure/` — this service's Firestore tape and tracing.

# Notification service

The only service permitted to talk to the email provider. Everything else routes through it.

## What it does

Receives a `SendInstruction` on Pub/Sub, enforces idempotency, fetches the stored file using the object id in `bodyRef`, sends that content via the provider, records the outcome. The event carries the object id, not the HTML.

```ts
type SendInstruction = {
  messageId: string;   // idempotency key
  to: string;
  subject: string;
  bodyRef: string;     // object id in storage. The event does not carry the HTML.
};
```

## What it must never do

- NEVER render HTML. It receives a pointer to already-rendered content.
- NEVER hold or interpret templates.
- NEVER know anything about orders, subscriptions or any calling domain. If you find yourself adding a domain concept here, the design has drifted.

## Layers

- `src/transport/` — Pub/Sub subscriber, HTTP health endpoint. Validates shape, hands off. NEVER imports from `infrastructure/`.
- `src/domain/` — the idempotency decision, and the ports that infrastructure implements. This is where the only real decision lives: has this `messageId` already been delivered.
- `src/infrastructure/` — this service's Firestore database, Cloud Storage reads by `bodyRef`, the provider adapter. Performs actions, decides nothing. Never the checkout database.

Pub/Sub delivers at-least-once. This service is responsible for making the effect exactly-once.

## Tests that must pass

- One valid instruction produces exactly one provider call.
- The same `messageId` twice produces exactly one provider call.
- A missing `bodyRef` object fails without calling the provider.

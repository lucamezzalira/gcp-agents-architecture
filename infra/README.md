# Terraform

Two roots. Apply health first, then services. Do not apply until a GCP billing account exists.

- `infra/health` — project A (`ga-health-mezzalab`): Pub/Sub `analysis-payloads` and dead-letter topic, Cloud SQL Postgres 16 (`db-custom-1-3840`), Artifact Registry `health`, GitHub WIF, Secret Manager `health-database-url`, Cloud Run `health-dashboard` / `health-mcp` / `health-agent`, Vertex Agent Engine `health-memory-bank` in `us-central1` (Memory Bank).
- `infra/services` — project B (`ga-services-mezzalab`): Firestore databases `checkout`, `notification`, `inventory`, `audit`, bodies bucket, send-instructions / stock-reservations / reservation-outcomes topics, Cloud Run for the four services.

Cloud Run services are skipped while `*_image` variables are empty. Apply the data plane first, build images, then set the image variables and apply again.

Live meter (talk shape, 2026-08): Cloud SQL `db-custom-1-3840` ALWAYS on (~$90–110/month with public IPv4 and 10 GB), dashboard Cloud Run min 1 with CPU allocated (~$50–70/month in `europe-west1`), MCP min 1 during a talk, Vertex tokens for the agent. Scale-to-zero checkout/inventory/notification/audit are small next to that. Set billing budgets at the current number, not £40. Destroy the stacks when the demo is done.

Checkout, inventory, notification, and audit pick cloud adapters when `BODY_BUCKET` is set (GCS, named Firestore, Pub/Sub). Local `./scripts/dev-services.sh` leaves that unset and uses the file store plus HTTP. Smoke against Cloud Run uses `gcloud auth print-identity-token`. Inventory and checkout are not `allUsers`. Notification and the health agent are not public either. Dashboard and MCP are.

```
gcloud auth application-default login
cd infra/health
cp terraform.tfvars.example terraform.tfvars
# edit project_id, and agent_engine_id if a Memory Bank engine already exists
terraform init
terraform apply

cd ../services
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Then pass `services_ci_sa_email` into the health root so CI can read Cloud Trace. `publish-health` impersonates `health-ci` to post `AnalysisPayload` JSON. `services-ci` is not a publisher on `analysis-payloads`.

After WIF exists, set GitHub Actions variables `WIF_PROVIDER`, `HEALTH_CI_SA`, `SERVICES_CI_SA`, `TRACE_PROJECT`, and `ANALYSIS_TOPIC`. `WIF_PROVIDER` is the health-project pool. Collect impersonates `services-ci` (Cloud Trace reader in the services project) through that same pool.

Lint (no apply):

```
terraform fmt -recursive infra
tflint --chdir=infra/health --config="$(pwd)/infra/.tflint.hcl"
tflint --chdir=infra/services --config="$(pwd)/infra/.tflint.hcl"
tfsec infra
checkov -d infra --framework terraform --compact
```

## Agent Engine, Identity, Memory Bank

The health agent is Cloud Run `health-agent` running `health_agent.push_server` with `HEALTH_REASONER=adk`. It writes the same Postgres tables the dashboard and MCP read. Scores still come from `health/scoring`.

Vertex coverage (hashicorp/google and hashicorp/google-beta 7.44.0, resource added in google 7.6.0):

| Capability | Terraform | Notes |
| --- | --- | --- |
| Agent Runtime (the engine itself) | `google_vertex_ai_reasoning_engine` | Managed in `infra/health/agent_engine.tf` via google-beta. This estate uses it as Memory Bank only. `spec.container_spec` would host the agent on Agent Runtime. That is not used. Pub/Sub push needs the Cloud Run HTTP receiver. |
| Memory Bank | `context_spec.memory_bank_config` on that resource | No standalone Memory Bank resource. Live engine `health-memory-bank` (`4676541261547569152` in `us-central1`) is imported. Cloud Run `AGENT_ENGINE_ID` is that numeric id. |
| Agent Identity | `spec.identity_type = AGENT_IDENTITY` on that resource (GA google 7.28.0) | No `google_vertex_ai_agent_identity` resource. Left unset. The live engine's `effective_identity` is the default Reasoning Engine service agent `service-PROJECT_NUMBER@gcp-sa-aiplatform-re.iam.gserviceaccount.com`. Switching to `AGENT_IDENTITY` would change that. |

google 6.50 (what the rest of this root pins with `~> 6.47`) does not have `google_vertex_ai_reasoning_engine`. The engine resource is google-beta `~> 7.37` so the 6.x Cloud Run / SQL stack does not have to move to provider 7.

MCP Cloud Run is Streamable HTTP at `/mcp`. Cursor connects to that URL.

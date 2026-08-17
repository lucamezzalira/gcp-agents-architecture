# Terraform

Two roots. Apply health first, then services. Do not apply until a GCP billing account exists.

- `infra/health` — project A (`ga-health-mezzalab`): Pub/Sub `analysis-payloads` and dead-letter topic, Cloud SQL Postgres 16 (`db-custom-1-3840`), Artifact Registry `health`, GitHub WIF, Secret Manager `health-database-url`, Cloud Run `health-dashboard` / `health-mcp` / `health-agent` (Pub/Sub receiver, scoring, Postgres), Vertex Agent Engine `health-agent` in `europe-west1` (Agent Runtime, Agent Identity, Gemini 2.5 Pro) and `health-memory-bank` in `us-central1` (Memory Bank). All three of Runtime, Identity, and Memory Bank are in this root. Memory Bank was created in the console and imported via `agent_engine_id`. Identity is `spec.identity_type = AGENT_IDENTITY` on the engine resource, not a standalone resource.
- `infra/services` — project B (`ga-services-mezzalab`): Firestore databases `checkout`, `notification`, `inventory`, `audit`, bodies bucket, send-instructions / stock-reservations / reservation-outcomes topics, Cloud Run for the four services.

Cloud Run services are skipped while `*_image` variables are empty. Apply the data plane first, build images, then set the image variables and apply again.

Live meter (talk shape, 2026-08): Cloud SQL `db-custom-1-3840` ALWAYS on (~$90–110/month with public IPv4 and 10 GB), dashboard Cloud Run min 1 with CPU allocated (~$50–70/month in `europe-west1`), MCP min 1 during a talk, Agent Runtime min 1 (1 vCPU, 2 GiB, ~$76/month at published Agent Engine runtime rates), Vertex tokens for the agent. Scale-to-zero checkout/inventory/notification/audit are small next to that. Set billing budgets at the current number, not £40. Destroy the stacks when the demo is done.

Checkout, inventory, notification, and audit pick cloud adapters when `BODY_BUCKET` is set (GCS, named Firestore, Pub/Sub). Local `./scripts/dev-services.sh` leaves that unset and uses the file store plus HTTP. Smoke against Cloud Run uses `gcloud auth print-identity-token`. Inventory and checkout are not `allUsers`. Notification and the Cloud Run receiver are not public either. Dashboard and MCP are.

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

Pub/Sub pushes `AnalysisPayload` JSON to Cloud Run `health-agent` (`health_agent.push_server`). That process validates the payload, scores it with `health/scoring`, writes Postgres, and calls Agent Runtime with the scores attached. The runtime image (`Dockerfile.runtime`) does not contain `health/scoring`. It reasons, reads and writes Memory Bank, and returns prose. Numeric fields in that response are logged as `agent_returned_numeric` and ignored. The receiver owns Postgres. The agent owns Memory Bank. Nothing writes to both.

Vertex coverage (hashicorp/google-beta `~> 7.37`, locked 7.44.0, resource added in google 7.6.0):

| Capability | Terraform | Notes |
| --- | --- | --- |
| Agent Runtime | `google_vertex_ai_reasoning_engine.agent` with `spec.container_spec` | Live engine in `europe-west1`. Image is `agent_reasoner_image` (no scoring, no Postgres). `container_spec.image_uri` rejects digest pins; Terraform uses `split("@", image)[0]`. Memory Bank stays in `us-central1`. |
| Reasoner preview | `google_vertex_ai_reasoning_engine.reasoner_preview` | Count is zero. It existed while `agent_score_split` was false so the reasoner image could be proven beside the scoring engine. |
| Memory Bank | `context_spec.memory_bank_config` on `google_vertex_ai_reasoning_engine.memory` | No standalone Memory Bank resource. The live engine `health-memory-bank` was created in the console and imported with `agent_engine_id`. After import it is in Terraform state. Runtime env `AGENT_ENGINE_ID` is that numeric id. |
| Agent Identity | `spec.identity_type = AGENT_IDENTITY` on `.agent` and `.reasoner_preview` (GA google 7.28.0) | No `google_vertex_ai_agent_identity` resource. `service_account` is unset. Confirm with the deployed `spec.effective_identity`, not the `.tf` file. IAM grants use that principal. |
| Gemini Pro | `spec.deployment_spec.env HEALTH_ADK_MODEL=gemini-2.5-pro` (`local.adk_model`) | The container reads `HEALTH_ADK_MODEL` in `health_agent.host.resolve_model()` and passes it to `google.adk.agents.Agent(model=...)`. No Flash default on Agent Runtime. The persisted read copies that value onto `health_run.model`. |
| Postgres URL | Cloud Run `DATABASE_URL` secret after `agent_score_split` | The receiver owns Postgres. The reasoner image has no Cloud SQL env. |

google 6.50 (what the rest of this root pins with `~> 6.47`) does not have `google_vertex_ai_reasoning_engine`. The engine resources are google-beta `~> 7.37` so the 6.x Cloud Run / SQL stack does not have to move to provider 7.

`agent_score_split` is true. Pub/Sub still pushes to Cloud Run. Cloud Run scores and writes Postgres, then invokes the live engine (`agent_reasoner_image`) for prose. The preview engine is gone. Set the flag false only to roll back.

MCP Cloud Run is Streamable HTTP at `/mcp`. Cursor connects to that URL.

# Terraform for later apply. Do not run this until a GCP billing account exists.

Two roots:

- `infra/health` — project A: Pub/Sub analysis topic, Cloud SQL Postgres, Cloud Run dashboard/agent/MCP, Artifact Registry, GitHub WIF.
- `infra/services` — project B: Firestore databases (`checkout`, `notification`, `inventory`, `audit`), bodies bucket, send-instructions / stock topics, Cloud Run for the four services.

Cloud Run services are skipped while `*_image` variables are empty. Apply the data plane first, build images, then set the image variables and apply again.

Live meter (talk shape, 2026-08): Cloud SQL `db-custom-1-3840` ALWAYS on (~$90–110/month with public IPv4 and 10 GB), dashboard Cloud Run min 1 with CPU allocated (~$50–70/month in `europe-west1`), MCP min 1 during a talk, Vertex tokens for the agent. Scale-to-zero checkout/inventory/notification/audit are small next to that. Set billing budgets at the current number, not £40. Destroy the stacks when the demo is done.

Checkout, inventory, notification, and audit pick cloud adapters when `BODY_BUCKET` is set (GCS, named Firestore, Pub/Sub). Local `./scripts/dev-services.sh` leaves that unset and uses the file store plus HTTP. Smoke against Cloud Run uses `gcloud auth print-identity-token`; inventory and checkout are not `allUsers`.

```
gcloud auth application-default login
cd infra/health
cp terraform.tfvars.example terraform.tfvars
# edit project_id
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

Agent Runtime, Agent Identity and Memory Bank are not in these files. The agent Cloud Run service runs `health_agent.push_server` with `HEALTH_REASONER=adk` and writes the same Postgres tables. Attach Runtime later without changing the scoring path.

MCP Cloud Run is Streamable HTTP at `/mcp`. Cursor connects to that URL.

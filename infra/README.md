# Terraform for later apply. Do not run this until a GCP billing account exists.

Two roots:

- `infra/health` — project A: Pub/Sub analysis topic, Cloud SQL Postgres, Cloud Run dashboard/agent/MCP, Artifact Registry, GitHub WIF.
- `infra/services` — project B: two Firestore databases (`checkout`, `notification`), bodies bucket, send-instructions topic, Cloud Run for the two services.

Cloud Run services are skipped while `*_image` variables are empty. Apply the data plane first, build images, then set the image variables and apply again.

Budget for this demo: stay inside the free-trial credits (about £226). The meter is Cloud SQL `db-f1-micro` plus its public IPv4, roughly £12–18 per month if left running. Firestore, GCS, Pub/Sub, and scale-to-zero Cloud Run are small next to that. The agent runs `HEALTH_REASONER=adk` against Vertex. That costs tokens. Destroy the stacks when the demo is done.

Set a budget alert in the billing console at £40 and £80 before apply.

Checkout and notification pick cloud adapters when `BODY_BUCKET` is set (GCS, named Firestore, Pub/Sub). Local `./scripts/dev-services.sh` leaves that unset and uses the file store plus HTTP.

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

Then pass `services_ci_sa_email` into the health root so CI can publish payloads.

After WIF exists, set GitHub Actions variables `WIF_PROVIDER`, `HEALTH_CI_SA`, and `ANALYSIS_TOPIC` from `terraform output` on `infra/health` so the `publish-health` job can post `AnalysisPayload` JSON.

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

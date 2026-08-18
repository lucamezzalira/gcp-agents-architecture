# Vertex Agent Engine is google_vertex_ai_reasoning_engine (google-beta ~> 7.37).
# There is no separate google_* resource for Memory Bank or Agent Identity.
#
# Live layout (agent_score_split = true):
# - memory: imported Memory Bank (health-memory-bank) in us-central1. No container.
# - agent: Agent Runtime in europe-west1. Image is agent_reasoner_image.
#   It reasons and talks to Memory Bank. It has no Postgres env and no
#   health/scoring package. identity_type is AGENT_IDENTITY. min_instances is
#   1 so a cold engine does not 502 the first payload after idle. The image
#   URI stored by Agent Engine is tag-only; Terraform pins the digest against
#   Artifact Registry and refuses apply on mismatch.
# - reasoner_preview: absent. It existed only while the split was proven
#   beside the live engine. count is 0 while agent_score_split is true.
# Cloud Run health-agent is the Pub/Sub HTTPS push target. That path does not
# change with this flag. Cloud Run scores with health/scoring, writes Postgres,
# acks analysis-payloads, then analysis-reason invokes this runtime with scores
# already attached. The engine never writes the database.

locals {
  agent_engine_numeric_id = google_vertex_ai_reasoning_engine.memory.name
  adk_model               = "gemini-2.5-pro"
  agent_image_uri         = split("@", var.agent_image)[0]
  reasoner_image_tagged   = var.agent_reasoner_image == "" ? "" : split("@", var.agent_reasoner_image)[0]
  reasoner_image_digest   = length(split("@", var.agent_reasoner_image)) > 1 ? split("@", var.agent_reasoner_image)[1] : ""
  live_engine_image_uri   = var.agent_score_split ? local.reasoner_image_tagged : local.agent_image_uri
  scoring_class_methods = jsonencode([
    {
      name        = "query"
      api_mode    = ""
      description = "Score an AnalysisPayload and persist a HealthRead"
      parameters = {
        type     = "object"
        required = ["payload"]
        properties = {
          payload = { type = "object" }
          persist = { type = "boolean" }
        }
      }
    },
    {
      name        = "stream_query"
      api_mode    = "stream"
      description = "Same as query, one streamed HealthRead"
      parameters = {
        type     = "object"
        required = ["payload"]
        properties = {
          payload = { type = "object" }
          persist = { type = "boolean" }
        }
      }
    }
  ])
  reasoner_class_methods = jsonencode([
    {
      name        = "query"
      api_mode    = ""
      description = "Reason over already-computed scores. Returns narratives only."
      parameters = {
        type     = "object"
        required = ["payload", "scores"]
        properties = {
          payload     = { type = "object" }
          scores      = { type = "object" }
          prior_reads = { type = "array" }
        }
      }
    },
    {
      name        = "stream_query"
      api_mode    = "stream"
      description = "Same as query, one streamed narrative payload"
      parameters = {
        type     = "object"
        required = ["payload", "scores"]
        properties = {
          payload     = { type = "object" }
          scores      = { type = "object" }
          prior_reads = { type = "array" }
        }
      }
    }
  ])
  runtime_effective_identity = try(
    google_vertex_ai_reasoning_engine.agent[0].spec[0].effective_identity,
    ""
  )
  runtime_principal = (
    startswith(local.runtime_effective_identity, "principal://") ? local.runtime_effective_identity :
    startswith(local.runtime_effective_identity, "serviceAccount:") ? local.runtime_effective_identity :
    endswith(local.runtime_effective_identity, ".gserviceaccount.com") ? "serviceAccount:${local.runtime_effective_identity}" :
    "principal://${local.runtime_effective_identity}"
  )
  preview_effective_identity = try(
    google_vertex_ai_reasoning_engine.reasoner_preview[0].spec[0].effective_identity,
    ""
  )
  preview_principal = (
    startswith(local.preview_effective_identity, "principal://") ? local.preview_effective_identity :
    startswith(local.preview_effective_identity, "serviceAccount:") ? local.preview_effective_identity :
    endswith(local.preview_effective_identity, ".gserviceaccount.com") ? "serviceAccount:${local.preview_effective_identity}" :
    "principal://${local.preview_effective_identity}"
  )
}

import {
  to = google_vertex_ai_reasoning_engine.memory
  id = "projects/${var.project_id}/locations/${var.memory_bank_location}/reasoningEngines/${var.agent_engine_id}"
}

resource "google_vertex_ai_reasoning_engine" "memory" {
  provider     = google-beta
  display_name = "health-memory-bank"
  region       = var.memory_bank_location

  context_spec {
    memory_bank_config {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_artifact_registry_repository_iam_member" "reasoning_engine_pull" {
  location   = var.region
  repository = google_artifact_registry_repository.health.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
}

data "google_artifact_registry_docker_image" "reasoner" {
  count         = local.reasoner_image_tagged == "" ? 0 : 1
  location      = var.region
  repository_id = google_artifact_registry_repository.health.repository_id
  image_name    = regex("[^/]+$", local.reasoner_image_tagged)
}

resource "terraform_data" "reasoner_digest_pin" {
  count = local.reasoner_image_digest == "" ? 0 : 1
  lifecycle {
    precondition {
      condition = strcontains(
        data.google_artifact_registry_docker_image.reasoner[0].name,
        local.reasoner_image_digest,
      )
      error_message = "agent_reasoner_image digest does not match the tagged image in Artifact Registry. The Agent Engine API stores a tag URI; this check is the pin."
    }
  }
}

resource "google_secret_manager_secret_iam_member" "reasoning_engine_sql" {
  count     = var.agent_score_split ? 0 : 1
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
}

moved {
  from = google_secret_manager_secret_iam_member.reasoning_engine_sql
  to   = google_secret_manager_secret_iam_member.reasoning_engine_sql[0]
}

resource "terraform_data" "score_split_requires_reasoner_image" {
  lifecycle {
    precondition {
      condition     = !var.agent_score_split || var.agent_image == "" || var.agent_reasoner_image != ""
      error_message = "agent_score_split requires agent_reasoner_image, the image that does not contain health/scoring. Empty agent_image still skips Cloud Run and the engine on a first apply."
    }
  }
}

resource "google_vertex_ai_reasoning_engine" "agent" {
  count        = var.agent_image == "" ? 0 : 1
  provider     = google-beta
  display_name = "health-agent"
  description  = var.agent_score_split ? "Architecture health reasoner. Scores arrive already computed. Model from HEALTH_ADK_MODEL." : "Architecture health agent hosted on Agent Runtime. Scores from health/scoring. Model from HEALTH_ADK_MODEL."
  region       = var.region

  spec {
    agent_framework = "custom"
    identity_type   = "AGENT_IDENTITY"
    class_methods   = var.agent_score_split ? local.reasoner_class_methods : local.scoring_class_methods

    container_spec {
      image_uri = local.live_engine_image_uri
    }

    deployment_spec {
      min_instances         = var.agent_score_split ? 1 : 0
      max_instances         = 1
      container_concurrency = 1
      resource_limits = {
        cpu    = "1"
        memory = "2Gi"
      }

      env {
        name  = "HEALTH_HOST"
        value = "agent-runtime"
      }
      env {
        name  = "HEALTH_REASONER"
        value = "adk"
      }
      env {
        name  = "HEALTH_ADK_MODEL"
        value = local.adk_model
      }
      env {
        name  = "HEALTH_TRACE_EXPORT"
        value = "1"
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
      env {
        name  = "HEALTH_RUNTIME_LOCATION"
        value = var.region
      }
      env {
        name  = "HEALTH_RUNTIME_DISPLAY_NAME"
        value = "health-agent"
      }
      env {
        name  = "MEMORY_BANK_LOCATION"
        value = var.memory_bank_location
      }
      env {
        name  = "AGENT_ENGINE_ID"
        value = local.agent_engine_numeric_id
      }
      dynamic "env" {
        for_each = var.agent_score_split ? [] : [1]
        content {
          name  = "GOOGLE_API_PREVENT_AGENT_TOKEN_SHARING_FOR_GCP_SERVICES"
          value = "false"
        }
      }
      dynamic "env" {
        for_each = var.agent_score_split ? [] : [1]
        content {
          name  = "CLOUD_SQL_CONNECTION_NAME"
          value = google_sql_database_instance.health.connection_name
        }
      }
      dynamic "env" {
        for_each = var.agent_score_split ? [] : [1]
        content {
          name  = "HEALTH_DATABASE_URL_SECRET"
          value = google_secret_manager_secret.database_url.secret_id
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository_iam_member.reasoning_engine_pull,
    terraform_data.score_split_requires_reasoner_image,
    terraform_data.reasoner_digest_pin,
  ]
}

resource "google_vertex_ai_reasoning_engine" "reasoner_preview" {
  count        = var.agent_reasoner_image != "" && !var.agent_score_split ? 1 : 0
  provider     = google-beta
  display_name = "health-reasoner"
  description  = "Preview reasoner with no health/scoring in the image. Stood up beside the live scoring engine."
  region       = var.region

  spec {
    agent_framework = "custom"
    identity_type   = "AGENT_IDENTITY"
    class_methods   = local.reasoner_class_methods

    container_spec {
      image_uri = local.reasoner_image_tagged
    }

    deployment_spec {
      min_instances         = 0
      max_instances         = 1
      container_concurrency = 1
      resource_limits = {
        cpu    = "1"
        memory = "2Gi"
      }

      env {
        name  = "HEALTH_HOST"
        value = "agent-runtime"
      }
      env {
        name  = "HEALTH_REASONER"
        value = "adk"
      }
      env {
        name  = "HEALTH_ADK_MODEL"
        value = local.adk_model
      }
      env {
        name  = "HEALTH_TRACE_EXPORT"
        value = "1"
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
      env {
        name  = "HEALTH_RUNTIME_LOCATION"
        value = var.region
      }
      env {
        name  = "HEALTH_RUNTIME_DISPLAY_NAME"
        value = "health-reasoner"
      }
      env {
        name  = "MEMORY_BANK_LOCATION"
        value = var.memory_bank_location
      }
      env {
        name  = "AGENT_ENGINE_ID"
        value = local.agent_engine_numeric_id
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository_iam_member.reasoning_engine_pull,
  ]
}

resource "google_project_iam_member" "runtime_sql" {
  count   = var.agent_score_split ? 0 : length(google_vertex_ai_reasoning_engine.agent)
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = local.runtime_principal
}

resource "google_project_iam_member" "runtime_trace" {
  count   = length(google_vertex_ai_reasoning_engine.agent)
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = local.runtime_principal
}

resource "google_project_iam_member" "runtime_vertex" {
  count   = length(google_vertex_ai_reasoning_engine.agent)
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = local.runtime_principal
}

resource "google_project_iam_member" "runtime_quota" {
  count   = length(google_vertex_ai_reasoning_engine.agent)
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = local.runtime_principal
}

resource "google_secret_manager_secret_iam_member" "runtime_sql_secret" {
  count     = var.agent_score_split ? 0 : length(google_vertex_ai_reasoning_engine.agent)
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.runtime_principal
}

resource "google_project_iam_member" "preview_trace" {
  count   = length(google_vertex_ai_reasoning_engine.reasoner_preview)
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = local.preview_principal
}

resource "google_project_iam_member" "preview_vertex" {
  count   = length(google_vertex_ai_reasoning_engine.reasoner_preview)
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = local.preview_principal
}

resource "google_project_iam_member" "preview_quota" {
  count   = length(google_vertex_ai_reasoning_engine.reasoner_preview)
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = local.preview_principal
}

output "agent_engine_id" {
  value = local.agent_engine_numeric_id
}

output "agent_runtime_id" {
  value = try(google_vertex_ai_reasoning_engine.agent[0].name, "")
}

output "agent_runtime_identity" {
  value = local.runtime_effective_identity
}

output "reasoner_preview_id" {
  value = try(google_vertex_ai_reasoning_engine.reasoner_preview[0].name, "")
}

output "reasoner_preview_identity" {
  value = local.preview_effective_identity
}

output "adk_model" {
  value = local.adk_model
}

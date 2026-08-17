# Vertex Agent Engine is the Terraform resource for Gemini Enterprise
# Agent Runtime (google_vertex_ai_reasoning_engine). There is no separate
# google_* resource for Memory Bank or Agent Identity.
#
# Memory Bank is context_spec.memory_bank_config on this resource (hashicorp/google
# and hashicorp/google-beta 7.44.0). This estate uses the engine only as Memory
# Bank. The health agent stays on Cloud Run so Pub/Sub can push AnalysisPayload
# JSON to an HTTP receiver.
#
# Agent Runtime as a compute host (spec.container_spec / spec.package_spec) is
# the same resource. It is not used here. Deploying the health-agent image onto
# Agent Runtime would be a second copy of the process, not an attachment to
# Cloud Run.
#
# Agent Identity is spec.identity_type = AGENT_IDENTITY on this resource
# (GA in google 7.28.0). There is no google_vertex_ai_agent_identity resource.
# The live engine's effective identity is the default Vertex AI Reasoning Engine
# service agent (service-PROJECT_NUMBER@gcp-sa-aiplatform-re.iam.gserviceaccount.com).
# This config leaves identity_type unset so Terraform does not switch the running
# Memory Bank onto AGENT_IDENTITY.

locals {
  agent_engine_numeric_id = google_vertex_ai_reasoning_engine.memory.name
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

output "agent_engine_id" {
  value = local.agent_engine_numeric_id
}

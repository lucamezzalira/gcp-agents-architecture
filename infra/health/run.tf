resource "google_cloud_run_v2_service" "dashboard" {
  count               = var.dashboard_image == "" ? 0 : 1
  name                = "health-dashboard"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    timeout                          = "60s"
    max_instance_request_concurrency = 8
    service_account                  = google_service_account.dashboard.email
    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.health.connection_name]
      }
    }
    containers {
      image = var.dashboard_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = false
        startup_cpu_boost = true
      }
      ports {
        container_port = 8080
      }
      env {
        name  = "HOST"
        value = "0.0.0.0"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "dashboard_public" {
  count    = var.dashboard_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.dashboard[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "mcp" {
  count               = var.mcp_image == "" ? 0 : 1
  name                = "health-mcp"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    timeout                          = "60s"
    max_instance_request_concurrency = 8
    service_account                  = google_service_account.mcp.email
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.health.connection_name]
      }
    }
    containers {
      image = var.mcp_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = false
        startup_cpu_boost = true
      }
      ports {
        container_port = 8080
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "mcp_public" {
  count    = var.mcp_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.mcp[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "agent" {
  count               = var.agent_image == "" ? 0 : 1
  name                = "health-agent"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    timeout                          = "300s"
    max_instance_request_concurrency = 1
    service_account                  = google_service_account.agent.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.health.connection_name]
      }
    }
    containers {
      image = var.agent_image
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }
      env {
        name  = "HEALTH_REASONER"
        value = "adk"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.memory_bank_location
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
      env {
        name  = "MEMORY_BANK_LOCATION"
        value = var.memory_bank_location
      }
      env {
        name  = "AGENT_ENGINE_ID"
        value = var.agent_engine_id
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "agent_pubsub" {
  count    = var.agent_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.agent[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_service_account_iam_member" "agent_pubsub_token" {
  service_account_id = google_service_account.agent.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "analysis_push" {
  count = var.agent_image == "" ? 0 : 1
  name  = "analysis-payloads-agent"
  topic = google_pubsub_topic.analysis.id
  push_config {
    push_endpoint = google_cloud_run_v2_service.agent[0].uri
    oidc_token {
      service_account_email = google_service_account.agent.email
      audience              = google_cloud_run_v2_service.agent[0].uri
    }
  }
  ack_deadline_seconds = 240
  expiration_policy {
    ttl = ""
  }
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letters.id
    max_delivery_attempts = 5
  }
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_subscription_iam_member" "analysis_dlq" {
  count        = var.agent_image == "" ? 0 : 1
  subscription = google_pubsub_subscription.analysis_push[0].name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Agent Runtime, Agent Identity and Memory Bank are attached in the console
# or a later google_vertex_ai_* resource once the org has those APIs.
# The Cloud Run agent above is the deployable stand-in: same produce_health_read
# path, same Postgres writes, HEALTH_REASONER=adk.

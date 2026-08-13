resource "google_cloud_run_v2_service" "dashboard" {
  count               = var.dashboard_image == "" ? 0 : 1
  name                = "health-dashboard"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.dashboard.email
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
      image = var.dashboard_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
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
            version = "latest"
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
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.mcp.email
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
      image = var.mcp_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
      ports {
        container_port = 8080
      }
      env {
        name  = "MCP_HTTP"
        value = "1"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
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

resource "google_cloud_run_v2_service" "agent" {
  count               = var.agent_image == "" ? 0 : 1
  name                = "health-agent"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.agent.email
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
          memory = "512Mi"
        }
        cpu_idle = true
      }
      env {
        name  = "HEALTH_REASONER"
        value = "stub"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
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

resource "google_pubsub_subscription" "analysis_push" {
  count = var.agent_image == "" ? 0 : 1
  name  = "analysis-payloads-agent"
  topic = google_pubsub_topic.analysis.id
  push_config {
    push_endpoint = google_cloud_run_v2_service.agent[0].uri
    oidc_token {
      service_account_email = google_service_account.agent.email
    }
  }
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# Agent Runtime, Agent Identity and Memory Bank are attached in the console
# or a later google_vertex_ai_* resource once the org has those APIs.
# The Cloud Run agent above is the deployable stand-in: same produce_health_read
# path, same Postgres writes, HEALTH_REASONER=adk.

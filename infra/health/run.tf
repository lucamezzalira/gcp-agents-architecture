resource "google_cloud_run_v2_service" "dashboard" {
  count               = var.dashboard_image == "" ? 0 : 1
  name                = "health-dashboard"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  scaling {
    scaling_mode       = "AUTOMATIC"
    min_instance_count = 1
    max_instance_count = 3
  }

  template {
    timeout                          = "60s"
    max_instance_request_concurrency = 8
    service_account                  = google_service_account.dashboard.email
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.health.id
        subnetwork = google_compute_subnetwork.health.id
      }
    }
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

  depends_on = [google_project_service.apis, google_compute_subnetwork_iam_member.run_direct_vpc]
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

  scaling {
    scaling_mode       = "AUTOMATIC"
    min_instance_count = 1
    max_instance_count = 1
  }

  template {
    timeout                          = "60s"
    max_instance_request_concurrency = 8
    service_account                  = google_service_account.mcp.email
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.health.id
        subnetwork = google_compute_subnetwork.health.id
      }
    }
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

  depends_on = [google_project_service.apis, google_compute_subnetwork_iam_member.run_direct_vpc]
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

  scaling {
    scaling_mode       = "AUTOMATIC"
    min_instance_count = 0
    max_instance_count = 1
  }

  template {
    timeout                          = "300s"
    max_instance_request_concurrency = 1
    service_account                  = google_service_account.agent.email
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.health.id
        subnetwork = google_compute_subnetwork.health.id
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    dynamic "volumes" {
      for_each = local.receiver_mode == "doorway" ? [] : [1]
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.health.connection_name]
        }
      }
    }
    containers {
      image   = var.agent_image
      command = ["health/agent/.venv/bin/python"]
      args    = ["-m", "health_agent.push_server"]
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = local.receiver_mode == "legacy" ? {
          HEALTH_REASONER           = "adk"
          HEALTH_ADK_MODEL          = local.adk_model
          GOOGLE_CLOUD_PROJECT      = var.project_id
          GOOGLE_CLOUD_LOCATION     = var.memory_bank_location
          GOOGLE_GENAI_USE_VERTEXAI = "true"
          MEMORY_BANK_LOCATION      = var.memory_bank_location
          AGENT_ENGINE_ID           = local.agent_engine_numeric_id
          } : {
          GOOGLE_CLOUD_PROJECT   = var.project_id
          AGENT_RUNTIME_ID       = try(google_vertex_ai_reasoning_engine.agent[0].name, "")
          AGENT_RUNTIME_LOCATION = var.region
          HEALTH_TRACE_EXPORT    = "1"
          REASON_TOPIC           = google_pubsub_topic.reason.id
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.receiver_mode == "doorway" ? [] : [1]
        content {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = google_secret_manager_secret_version.database_url.version
            }
          }
        }
      }
      dynamic "volume_mounts" {
        for_each = local.receiver_mode == "doorway" ? [] : [1]
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  depends_on = [google_project_service.apis, google_compute_subnetwork_iam_member.run_direct_vpc]
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
  ack_deadline_seconds = 60
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

resource "google_pubsub_subscription" "analysis_reason_push" {
  count = var.agent_image == "" ? 0 : 1
  name  = "analysis-reason-agent"
  topic = google_pubsub_topic.reason.id
  push_config {
    push_endpoint = "${google_cloud_run_v2_service.agent[0].uri}/reason"
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

resource "google_pubsub_subscription_iam_member" "analysis_reason_dlq" {
  count        = var.agent_image == "" ? 0 : 1
  subscription = google_pubsub_subscription.analysis_reason_push[0].name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Agent Engine lives in agent_engine.tf. Cloud Run is the Pub/Sub push
# receiver. score mode (live): persist scores, ack analysis-payloads, enqueue
# analysis-reason, attach prose on /reason. doorway and legacy remain for rollback.

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_artifact_registry_repository" "health" {
  #checkov:skip=CKV_GCP_84:Google-managed encryption is enough for this demo
  location      = var.region
  repository_id = "health"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_pubsub_topic" "analysis" {
  #checkov:skip=CKV_GCP_83:Google-managed encryption is enough for this demo
  name       = "analysis-payloads"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "dead_letters" {
  #checkov:skip=CKV_GCP_83:Google-managed encryption is enough for this demo
  name       = "analysis-dead-letters"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic_iam_member" "dead_letters_publisher" {
  topic  = google_pubsub_topic.dead_letters.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_service_account" "dashboard" {
  account_id   = "health-dashboard"
  display_name = "Health dashboard"
}

resource "google_service_account" "mcp" {
  account_id   = "health-mcp"
  display_name = "Health MCP"
}

resource "google_service_account" "agent" {
  account_id   = "health-agent"
  display_name = "Health agent"
}

resource "random_password" "sql" {
  length  = 24
  special = false
}

# Public IP is assigned so Cloud Run can use the Auth Proxy (instance
# connection name) without a VPC. There are no authorized_networks, so
# clients cannot connect to that IP directly.
resource "google_sql_database_instance" "health" { #tfsec:ignore:google-sql-no-public-access #tfsec:ignore:google-sql-encrypt-in-transit-data
  #checkov:skip=CKV_GCP_60:Cloud Run Auth Proxy; no authorized networks
  #checkov:skip=CKV_GCP_79:Postgres 16 is the version this demo pins
  #checkov:skip=CKV_GCP_110:pgAudit needs an extension step at migrate time
  #checkov:skip=CKV_GCP_6:ssl_mode ENCRYPTED_ONLY is the current TLS setting; checkov still looks for require_ssl
  name             = "health"
  database_version = "POSTGRES_16"
  region           = var.region
  settings {
    tier                        = "db-custom-1-3840"
    deletion_protection_enabled = true
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = false
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 3
      }
    }
    insights_config {
      query_insights_enabled  = true
      record_application_tags = false
    }
    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
    database_flags {
      name  = "log_temp_files"
      value = "0"
    }
    database_flags {
      name  = "log_hostname"
      value = "on"
    }
    database_flags {
      name  = "log_min_error_statement"
      value = "error"
    }
    database_flags {
      name  = "log_min_messages"
      value = "error"
    }
    database_flags {
      name  = "log_statement"
      value = "ddl"
    }
  }
  deletion_protection = true
  depends_on          = [google_project_service.apis]
}

resource "google_sql_database" "health" {
  name     = "health"
  instance = google_sql_database_instance.health.name
}

resource "google_sql_user" "health" {
  name     = "health"
  instance = google_sql_database_instance.health.name
  password = random_password.sql.result
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "health-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  secret_data = format(
    "postgresql://health:%s@localhost/%s?host=/cloudsql/%s",
    random_password.sql.result,
    google_sql_database.health.name,
    google_sql_database_instance.health.connection_name,
  )
}

resource "google_secret_manager_secret_iam_member" "dashboard_sql" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.dashboard.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_sql" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp.email}"
}

resource "google_secret_manager_secret_iam_member" "agent_sql" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_project_iam_member" "dashboard_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.dashboard.email}"
}

resource "google_project_iam_member" "mcp_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.mcp.email}"
}

resource "google_project_iam_member" "agent_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_project_iam_member" "agent_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_project_iam_member" "agent_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent.email}"
}

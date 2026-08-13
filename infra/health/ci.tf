resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_owner == "" ? 0 : 1
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  #checkov:skip=CKV_GCP_125:Uses repository + repository_owner. Checkov only accepts assertion.sub == repo:org/repo, which Google advises against.
  count                              = var.github_owner == "" ? 0 : 1
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
  attribute_condition = "assertion.repository_owner == \"${var.github_owner}\" && assertion.repository == \"${var.github_owner}/${var.github_repo}\""
}

resource "google_service_account" "ci" {
  count        = var.github_owner == "" ? 0 : 1
  account_id   = "health-ci"
  display_name = "Health CI"
}

resource "google_service_account_iam_member" "ci_wif" {
  count              = var.github_owner == "" ? 0 : 1
  service_account_id = google_service_account.ci[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_owner}/${var.github_repo}"
}

resource "google_pubsub_topic_iam_member" "ci_sa_publish" {
  count  = var.github_owner == "" ? 0 : 1
  topic  = google_pubsub_topic.analysis.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.ci[0].email}"
}

output "analysis_topic" {
  value = google_pubsub_topic.analysis.id
}

output "sql_connection" {
  value = google_sql_database_instance.health.connection_name
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.health.repository_id}"
}

output "dashboard_uri" {
  value = try(google_cloud_run_v2_service.dashboard[0].uri, "")
}

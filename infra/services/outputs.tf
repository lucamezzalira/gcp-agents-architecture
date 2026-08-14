output "health_analysis_topic" {
  value       = var.health_analysis_topic
  description = "Topic in project A. IAM is granted there via services_ci_sa_email."
}

output "checkout_uri" {
  value = try(google_cloud_run_v2_service.checkout[0].uri, "")
}

output "notification_uri" {
  value = try(google_cloud_run_v2_service.notification[0].uri, "")
}

output "inventory_uri" {
  value = try(google_cloud_run_v2_service.inventory[0].uri, "")
}

output "services_ci_sa" {
  value       = google_service_account.ci.email
  description = "Impersonated from GitHub Actions via the health-project WIF pool to read Cloud Trace."
}

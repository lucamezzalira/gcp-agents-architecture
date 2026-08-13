resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "services" {
  #checkov:skip=CKV_GCP_84:Google-managed encryption is enough for this demo
  location      = var.region
  repository_id = "services"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_firestore_database" "checkout" {
  name        = "checkout"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

resource "google_firestore_database" "notification" {
  name        = "notification"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

resource "google_storage_bucket" "bodies_logs" { #tfsec:ignore:google-storage-bucket-encryption-customer-key
  #checkov:skip=CKV_GCP_62:This bucket is the access log destination
  name                        = "${var.project_id}-email-bodies-logs"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning {
    enabled = true
  }
}

resource "google_storage_bucket" "bodies" { #tfsec:ignore:google-storage-bucket-encryption-customer-key
  name                        = "${var.project_id}-email-bodies"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning {
    enabled = true
  }
  logging {
    log_bucket = google_storage_bucket.bodies_logs.name
  }
}

resource "google_pubsub_topic" "send_instructions" {
  #checkov:skip=CKV_GCP_83:Google-managed encryption is enough for this demo
  name       = "send-instructions"
  depends_on = [google_project_service.apis]
}

resource "google_service_account" "checkout" {
  account_id   = "checkout"
  display_name = "Checkout service"
}

resource "google_service_account" "notification" {
  account_id   = "notification"
  display_name = "Notification service"
}

resource "google_service_account" "ci" {
  account_id   = "services-ci"
  display_name = "Services CI"
}

resource "google_project_iam_member" "checkout_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.checkout.email}"
  condition {
    title       = "checkout-database-only"
    description = "Checkout may only use the checkout Firestore database"
    expression  = "resource.name.startsWith(\"projects/${var.project_id}/databases/${google_firestore_database.checkout.name}\")"
  }
}

resource "google_project_iam_member" "notification_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.notification.email}"
  condition {
    title       = "notification-database-only"
    description = "Notification may only use the notification Firestore database"
    expression  = "resource.name.startsWith(\"projects/${var.project_id}/databases/${google_firestore_database.notification.name}\")"
  }
}

resource "google_storage_bucket_iam_member" "checkout_write" {
  bucket = google_storage_bucket.bodies.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_storage_bucket_iam_member" "notification_read" {
  bucket = google_storage_bucket.bodies.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.notification.email}"
}

resource "google_pubsub_topic_iam_member" "checkout_publish" {
  topic  = google_pubsub_topic.send_instructions.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_pubsub_subscription" "notification" {
  name  = "send-instructions-notification"
  topic = google_pubsub_topic.send_instructions.id
}

resource "google_pubsub_subscription_iam_member" "notification_subscribe" {
  subscription = google_pubsub_subscription.notification.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.notification.email}"
}

output "ci_sa_email" {
  value = google_service_account.ci.email
}

output "bodies_bucket" {
  value = google_storage_bucket.bodies.name
}

output "send_instructions_topic" {
  value = google_pubsub_topic.send_instructions.id
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.services.repository_id}"
}

output "firestore_checkout" {
  value = google_firestore_database.checkout.name
}

output "firestore_notification" {
  value = google_firestore_database.notification.name
}

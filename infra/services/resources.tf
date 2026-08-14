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

resource "google_firestore_database" "inventory" {
  name        = "inventory"
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

resource "google_pubsub_topic" "stock_reservations" {
  #checkov:skip=CKV_GCP_83:Google-managed encryption is enough for this demo
  name       = "stock-reservations"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "reservation_outcomes" {
  #checkov:skip=CKV_GCP_83:Google-managed encryption is enough for this demo
  name       = "reservation-outcomes"
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

resource "google_service_account" "inventory" {
  account_id   = "inventory"
  display_name = "Inventory service"
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

resource "google_project_iam_member" "inventory_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.inventory.email}"
  condition {
    title       = "inventory-database-only"
    description = "Inventory may only use the inventory Firestore database"
    expression  = "resource.name.startsWith(\"projects/${var.project_id}/databases/${google_firestore_database.inventory.name}\")"
  }
}

resource "google_project_iam_member" "checkout_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_project_iam_member" "notification_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.notification.email}"
}

resource "google_project_iam_member" "inventory_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_project_iam_member" "ci_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.user"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_service_account_iam_member" "ci_wif" {
  count              = var.github_wif_principal == "" ? 0 : 1
  service_account_id = google_service_account.ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = var.github_wif_principal
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

resource "google_pubsub_topic_iam_member" "checkout_reservations_publish" {
  topic  = google_pubsub_topic.stock_reservations.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_pubsub_topic_iam_member" "inventory_outcomes_publish" {
  topic  = google_pubsub_topic.reservation_outcomes.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_pubsub_topic_iam_member" "inventory_instructions_publish" {
  topic  = google_pubsub_topic.send_instructions.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_storage_bucket_iam_member" "inventory_write" {
  bucket = google_storage_bucket.bodies.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_pubsub_subscription" "notification" {
  name  = "send-instructions-notification"
  topic = google_pubsub_topic.send_instructions.id
  dynamic "push_config" {
    for_each = var.notification_image == "" ? [] : [1]
    content {
      push_endpoint = "${google_cloud_run_v2_service.notification[0].uri}/pubsub"
      oidc_token {
        service_account_email = google_service_account.notification.email
        audience              = google_cloud_run_v2_service.notification[0].uri
      }
    }
  }
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_service_account_iam_member" "notification_pubsub_token" {
  service_account_id = google_service_account.notification.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "notification_subscribe" {
  subscription = google_pubsub_subscription.notification.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.notification.email}"
}

resource "google_pubsub_subscription" "inventory_reservations" {
  name  = "stock-reservations-inventory"
  topic = google_pubsub_topic.stock_reservations.id
  dynamic "push_config" {
    for_each = var.inventory_image == "" ? [] : [1]
    content {
      push_endpoint = "${google_cloud_run_v2_service.inventory[0].uri}/pubsub"
      oidc_token {
        service_account_email = google_service_account.inventory.email
        audience              = google_cloud_run_v2_service.inventory[0].uri
      }
    }
  }
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_service_account_iam_member" "inventory_pubsub_token" {
  service_account_id = google_service_account.inventory.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "inventory_subscribe" {
  subscription = google_pubsub_subscription.inventory_reservations.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_pubsub_subscription" "checkout_outcomes" {
  name  = "reservation-outcomes-checkout"
  topic = google_pubsub_topic.reservation_outcomes.id
  dynamic "push_config" {
    for_each = var.checkout_image == "" ? [] : [1]
    content {
      push_endpoint = "${google_cloud_run_v2_service.checkout[0].uri}/reservation-outcomes"
      oidc_token {
        service_account_email = google_service_account.checkout.email
        audience              = google_cloud_run_v2_service.checkout[0].uri
      }
    }
  }
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_service_account_iam_member" "checkout_pubsub_token" {
  service_account_id = google_service_account.checkout.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "checkout_outcomes_subscribe" {
  subscription = google_pubsub_subscription.checkout_outcomes.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.checkout.email}"
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

output "firestore_inventory" {
  value = google_firestore_database.inventory.name
}

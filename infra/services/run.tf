resource "google_cloud_run_v2_service" "checkout" {
  count               = var.checkout_image == "" ? 0 : 1
  name                = "checkout"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.checkout.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.checkout_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
      env {
        name  = "BODY_BUCKET"
        value = google_storage_bucket.bodies.name
      }
      env {
        name  = "RUNTIME_MODE"
        value = "cloud"
      }
      env {
        name  = "SEND_INSTRUCTIONS_TOPIC"
        value = google_pubsub_topic.send_instructions.id
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.checkout.name
      }
      env {
        name  = "STOCK_RESERVATIONS_TOPIC"
        value = google_pubsub_topic.stock_reservations.id
      }
      env {
        name  = "OTEL_SERVICE_NAME"
        value = "checkout"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "notification" {
  count               = var.notification_image == "" ? 0 : 1
  name                = "notification"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.notification.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.notification_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
      env {
        name  = "BODY_BUCKET"
        value = google_storage_bucket.bodies.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.notification.name
      }
      env {
        name  = "RUNTIME_MODE"
        value = "cloud"
      }
      env {
        name  = "OTEL_SERVICE_NAME"
        value = "notification"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "inventory_checkout" {
  count    = var.inventory_image == "" || var.checkout_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.inventory[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_cloud_run_v2_service_iam_member" "checkout_pubsub" {
  count    = var.checkout_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.checkout[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.checkout.email}"
}

resource "google_cloud_run_v2_service_iam_member" "checkout_ci" {
  count    = var.checkout_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.checkout[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_cloud_run_v2_service_iam_member" "inventory_ci" {
  count    = var.inventory_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.inventory[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_cloud_run_v2_service_iam_member" "notification_pubsub" {
  count    = var.notification_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.notification[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.notification.email}"
}

resource "google_cloud_run_v2_service" "inventory" {
  count               = var.inventory_image == "" ? 0 : 1
  name                = "inventory"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.inventory.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.inventory_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.inventory.name
      }
      env {
        name  = "RUNTIME_MODE"
        value = "cloud"
      }
      env {
        name  = "RESERVATION_OUTCOMES_TOPIC"
        value = google_pubsub_topic.reservation_outcomes.id
      }
      env {
        name  = "BODY_BUCKET"
        value = google_storage_bucket.bodies.name
      }
      env {
        name  = "SEND_INSTRUCTIONS_TOPIC"
        value = google_pubsub_topic.send_instructions.id
      }
      env {
        name  = "OTEL_SERVICE_NAME"
        value = "inventory"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "inventory_pubsub" {
  count    = var.inventory_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.inventory[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.inventory.email}"
}

resource "google_cloud_run_v2_service" "audit" {
  count               = var.audit_image == "" ? 0 : 1
  name                = "audit"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.audit.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.audit_image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.audit.name
      }
      env {
        name  = "RUNTIME_MODE"
        value = "cloud"
      }
      env {
        name  = "OTEL_SERVICE_NAME"
        value = "audit"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "audit_pubsub" {
  count    = var.audit_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.audit[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.audit.email}"
}

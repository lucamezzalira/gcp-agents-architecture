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
        name  = "INVENTORY_URL"
        value = try(google_cloud_run_v2_service.inventory[0].uri, "")
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
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "checkout_public" {
  count    = var.checkout_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.checkout[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
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
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "inventory_public" {
  count    = var.inventory_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.inventory[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "inventory_pubsub" {
  count    = var.inventory_image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.inventory[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.inventory.email}"
}

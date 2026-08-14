terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.47"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "this" {
  project_id = var.project_id
}

variable "project_id" {
  type        = string
  description = "GCP project B: checkout, notification, inventory"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "checkout_image" {
  type    = string
  default = ""
}

variable "notification_image" {
  type    = string
  default = ""
}

variable "inventory_image" {
  type    = string
  default = ""
}

variable "health_analysis_topic" {
  type        = string
  default     = ""
  description = "Full resource name of project A's analysis-payloads topic."
}

locals {
  apis = [
    "run.googleapis.com",
    "pubsub.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
  ]
}

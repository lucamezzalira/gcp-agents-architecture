terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.47"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type        = string
  description = "GCP project A: health system"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "github_owner" {
  type        = string
  default     = ""
  description = "GitHub org/user for Workload Identity Federation. Empty skips WIF."
}

variable "github_repo" {
  type    = string
  default = ""
}

variable "dashboard_image" {
  type        = string
  default     = ""
  description = "Artifact Registry image for the Astro dashboard. Leave empty until the first build."
}

variable "mcp_image" {
  type    = string
  default = ""
}

variable "agent_image" {
  type    = string
  default = ""
}

variable "services_ci_sa_email" {
  type        = string
  default     = ""
  description = "Service account in the services project allowed to publish analysis payloads."
}

locals {
  apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudtrace.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
  ]
}

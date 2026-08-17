terraform {
  required_version = ">= 1.8.0"
  backend "gcs" {
    bucket = "ga-health-mezzalab-tfstate"
    prefix = "health"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.47"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.37"
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

provider "google-beta" {
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

variable "agent_reasoner_image" {
  type        = string
  default     = ""
  description = "Agent Runtime image with no health/scoring. Tag-only URI; the provider rejects digest pins on container_spec.image_uri."
}

variable "agent_runtime_cutover" {
  type        = bool
  default     = false
  description = "When true and agent_score_split is false, Cloud Run is only the Pub/Sub doorway and invokes the live engine. Live traffic uses agent_score_split instead."
}

variable "agent_score_split" {
  type        = bool
  default     = false
  description = "When true, Cloud Run scores and writes Postgres, then invokes Agent Runtime for prose. Live traffic uses this. Pub/Sub push still targets Cloud Run."
}

variable "agent_engine_id" {
  type        = string
  default     = ""
  description = "Existing Vertex Agent Engine numeric id to import (console-created Memory Bank). Required to take over the live engine; empty skips import and creates a new one on apply."
}

variable "memory_bank_location" {
  type    = string
  default = "us-central1"
}

variable "services_ci_sa_email" {
  type        = string
  default     = ""
  description = "Service account in the services project allowed to publish analysis payloads."
}

locals {
  receiver_mode = var.agent_score_split ? "score" : (var.agent_runtime_cutover ? "doorway" : "legacy")
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

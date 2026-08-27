terraform {
  required_version = ">= 1.8.0"
  backend "gcs" {
    bucket = "ga-health-mezzalab-tfstate"
    prefix = "health"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.37"
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
  description = "Agent Runtime image with no health/scoring. Prefer a digest pin (image:tag@sha256:...). Terraform refuses apply if the tag in Artifact Registry does not match that digest. The Agent Engine API still stores a tag URI."
}

variable "agent_score_split" {
  type        = bool
  default     = true
  description = "Required true. Cloud Run scores and writes Postgres, then enqueues Agent Runtime for prose. Combined-engine and doorway rollback paths were removed."

  validation {
    condition     = var.agent_score_split == true
    error_message = "agent_score_split must be true. The score/reason split is the only supported layout."
  }
}

variable "agent_engine_id" {
  type        = string
  default     = ""
  description = "Existing Vertex Agent Engine numeric id to import (console-created Memory Bank). Required to take over the live engine; empty skips import and creates a new one on apply."
}

variable "health_runtime_engine_id" {
  type        = string
  default     = ""
  description = "Optional HEALTH_RUNTIME_ENGINE_ID for Agent Runtime identity lookup. Set to terraform output agent_runtime_id after the first apply. Empty uses HEALTH_RUNTIME_DISPLAY_NAME list lookup. Not the Memory Bank id (AGENT_ENGINE_ID)."
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
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
  ]
}

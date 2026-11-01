# GitHub settings as code: what guide step 4 configures in the GitHub UI.
#   - environment "production": you are the required reviewer, only branch main can deploy
#   - repository variables the workflows read (identity, tenant, subscription)
#   - ruleset "protect-main": pull requests, required status checks, no force pushes or deletion
#
# Apply with a token that can administer the repository, for example in Azure Cloud Shell:
#   gh auth login && export GITHUB_TOKEN=$(gh auth token)
#   terraform -chdir=github init && terraform -chdir=github apply -var-file=terraform.tfvars
terraform {
  required_version = ">= 1.6"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}

provider "github" {
  owner = var.github_owner
}

# Empty username = the account the token belongs to.
data "github_user" "reviewer" {
  username = var.reviewer
}

resource "github_repository_environment" "production" {
  repository          = var.repository
  environment         = "production"
  prevent_self_review = var.prevent_self_review
  can_admins_bypass   = false

  reviewers {
    users = [data.github_user.reviewer.id]
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "main" {
  repository     = var.repository
  environment    = github_repository_environment.production.environment
  branch_pattern = "main"
}

locals {
  variables = {
    for name, value in merge({
      AZURE_CLIENT_ID       = var.azure_client_id
      AZURE_TENANT_ID       = var.azure_tenant_id
      AZURE_SUBSCRIPTION_ID = var.azure_subscription_id
      AZURE_PRINCIPAL_ID    = var.azure_principal_id
      ADMIN_PRINCIPAL_ID    = var.admin_principal_id
    }, var.extra_variables) : name => value if value != ""
  }
}

resource "github_actions_variable" "this" {
  for_each      = local.variables
  repository    = var.repository
  variable_name = each.key
  value         = each.value
}

resource "github_repository_ruleset" "protect_main" {
  name        = "protect-main"
  repository  = var.repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      required_approving_review_count   = var.required_approvals
      required_review_thread_resolution = true
      dismiss_stale_reviews_on_push     = true
    }

    required_status_checks {
      strict_required_status_checks_policy = false

      dynamic "required_check" {
        for_each = var.required_checks
        content {
          context = required_check.value
        }
      }
    }

    dynamic "copilot_code_review" {
      for_each = var.copilot_code_review ? [1] : []
      content {
        review_on_push = true
      }
    }
  }
}

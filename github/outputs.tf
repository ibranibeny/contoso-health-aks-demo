output "environment" {
  description = "Environment that gates deployments."
  value       = github_repository_environment.production.environment
}

output "ruleset_id" {
  description = "ID of the protect-main ruleset."
  value       = github_repository_ruleset.protect_main.ruleset_id
}

output "variables" {
  description = "Repository variables managed here."
  value       = sort(keys(github_actions_variable.this))
}

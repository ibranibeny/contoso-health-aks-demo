variable "github_owner" {
  description = "Account or organization that owns the repository."
  type        = string
}

variable "repository" {
  description = "Repository name."
  type        = string
  default     = "contoso-health-aks-demo"
}

variable "reviewer" {
  description = "GitHub user who approves production deployments. Empty = the account the token belongs to."
  type        = string
  default     = ""
}

variable "prevent_self_review" {
  description = "Stop the person who triggered a run from approving it. Keep false for a one-person demo."
  type        = bool
  default     = false
}

variable "required_approvals" {
  description = "Approving reviews required on pull requests. 0 for a one-person demo, 1 or more in a team."
  type        = number
  default     = 0
}

variable "azure_client_id" {
  description = "Client ID of the managed identity (bootstrap output clientId)."
  type        = string
}

variable "azure_tenant_id" {
  description = "Microsoft Entra tenant ID (bootstrap output tenantId)."
  type        = string
}

variable "azure_subscription_id" {
  description = "Subscription ID (bootstrap output subscriptionId)."
  type        = string
}

variable "azure_principal_id" {
  description = "Object (principal) ID of the managed identity (bootstrap output principalId)."
  type        = string
}

variable "admin_principal_id" {
  description = "Object ID of the person who gets AKS RBAC Cluster Admin for the portal's Kubernetes views. Optional."
  type        = string
  default     = ""
}

variable "extra_variables" {
  description = "Optional repository variables, for example AZURE_RESOURCE_GROUP, DNS_LABEL or AKS_NODE_VM_SIZE."
  type        = map(string)
  default     = {}
}

variable "required_checks" {
  description = "Status checks that must pass before a pull request can merge into main."
  type        = list(string)
  default = [
    "Test (membership-api)",
    "Test (bed-api)",
    "Test (portal)",
    "Container build (membership-api)",
    "Container build (bed-api)",
    "Container build (portal)",
    "Validate Bicep (IaC)",
    "Validate Terraform (GitHub settings)",
    "Validate Kubernetes manifests",
    "Analyze (javascript-typescript)",
    "Analyze (actions)",
  ]
}

variable "copilot_code_review" {
  description = "Request a Copilot code review automatically on every pull request (needs Copilot code review on your plan)."
  type        = bool
  default     = false
}

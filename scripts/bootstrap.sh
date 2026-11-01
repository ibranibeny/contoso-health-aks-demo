#!/usr/bin/env bash
# Guide steps 2-4 as code, in one run. Built for Azure Cloud Shell (Bash), where az, gh, jq and
# terraform are already installed. You need Owner (or Contributor + Role Based Access Control
# Administrator) on the subscription, and admin rights on your copy of the repository.
#
#   git clone https://github.com/<you>/contoso-health-aks-demo.git && cd contoso-health-aks-demo
#   gh auth login
#   GITHUB_OWNER=<you> bash scripts/bootstrap.sh
#
#   1. Reads the owner and repository IDs from the GitHub API.
#   2. Azure, Bicep (infra/bootstrap): what-if, confirm, deploy. Creates the resource group, the
#      managed identity, three federated credentials and three role assignments.
#   3. GitHub, Terraform (github/): production environment with you as reviewer, repository
#      variables, protect-main ruleset.
#
# Use either this script or the portal clicks of steps 2-4, not both: role assignments created
# by hand have different names, so the template would report RoleAssignmentExists.
set -euo pipefail
cd "$(dirname "$0")/.."

export GITHUB_OWNER="${GITHUB_OWNER:?Set GITHUB_OWNER to the account that owns your copy of the repository}"
export GITHUB_REPO="${GITHUB_REPO:-contoso-health-aks-demo}"
export AZURE_LOCATION="${AZURE_LOCATION:-indonesiacentral}"
export OIDC_SUBJECT_FORMAT="${OIDC_SUBJECT_FORMAT:-immutable}"

echo "==> GitHub IDs for $GITHUB_OWNER/$GITHUB_REPO"
GITHUB_OWNER_ID=$(gh api "repos/$GITHUB_OWNER/$GITHUB_REPO" --jq .owner.id)
GITHUB_REPO_ID=$(gh api "repos/$GITHUB_OWNER/$GITHUB_REPO" --jq .id)
export GITHUB_OWNER_ID GITHUB_REPO_ID
echo "    owner id $GITHUB_OWNER_ID, repository id $GITHUB_REPO_ID"

echo "==> Azure subscription"
az account show --query "{subscription:name, id:id, tenant:tenantId}" -o table

echo "==> Resource providers (registration is a subscription-level action, so the admin does it here)"
for ns in Microsoft.ContainerService Microsoft.ContainerRegistry Microsoft.OperationalInsights Microsoft.Insights \
          Microsoft.Monitor Microsoft.AlertsManagement Microsoft.PolicyInsights Microsoft.ManagedIdentity \
          Microsoft.Network Microsoft.Compute; do
  state=$(az provider show --namespace "$ns" --query registrationState -o tsv)
  if [ "$state" != "Registered" ]; then
    echo "    registering $ns ($state)"; az provider register --namespace "$ns" -o none
  else
    echo "    $ns Registered"
  fi
done

echo "==> vCPU quota for the node size (DDSv5 family, 16 needed at full scale)"
az vm list-usage --location "$AZURE_LOCATION" \
  --query "[?name.value=='standardDDSv5Family'].{family:name.localizedValue, used:currentValue, limit:limit}" -o table

echo "==> Bicep what-if (infra/bootstrap)"
az deployment sub what-if --location "$AZURE_LOCATION" \
  --template-file infra/bootstrap/main.bicep --parameters infra/bootstrap/main.bicepparam
read -r -p "Deploy these changes? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Stopped. Nothing was deployed."; exit 1; }

OUT=$(mktemp)
az deployment sub create --name bootstrap-contoso-health --location "$AZURE_LOCATION" \
  --template-file infra/bootstrap/main.bicep --parameters infra/bootstrap/main.bicepparam \
  --query properties.outputs -o json > "$OUT"
CLIENT_ID=$(jq -r .clientId.value "$OUT")
PRINCIPAL_ID=$(jq -r .principalId.value "$OUT")
TENANT_ID=$(jq -r .tenantId.value "$OUT")
SUBSCRIPTION_ID=$(jq -r .subscriptionId.value "$OUT")
ADMIN_ID=$(az ad signed-in-user show --query id -o tsv)
echo "    identity client id $CLIENT_ID"
jq -r '.federatedSubjects.value[]' "$OUT" | sed 's/^/    trusts /'

echo "==> GitHub settings (Terraform, github/)"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"
terraform -chdir=github init -input=false
terraform -chdir=github apply \
  -var "github_owner=$GITHUB_OWNER" \
  -var "repository=$GITHUB_REPO" \
  -var "azure_client_id=$CLIENT_ID" \
  -var "azure_tenant_id=$TENANT_ID" \
  -var "azure_subscription_id=$SUBSCRIPTION_ID" \
  -var "azure_principal_id=$PRINCIPAL_ID" \
  -var "admin_principal_id=$ADMIN_ID"

echo "==> Done. Next: Actions > Infrastructure (Bicep) > Run workflow (guide step 5)."

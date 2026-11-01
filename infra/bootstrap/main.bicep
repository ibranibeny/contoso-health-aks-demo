// Bootstrap, run once by a subscription admin: everything guide steps 2 and 3 do in the portal.
//   - the resource group, with tags
//   - the user-assigned managed identity GitHub Actions signs in as
//   - three federated credentials: environment production, pull requests, branch main
//   - three role assignments on the resource group, one restricted with an ABAC condition
//
// Deploy (Azure Cloud Shell or any shell with Azure CLI):
//   az deployment sub create --name bootstrap-contoso-health --location indonesiacentral \
//     --template-file infra/bootstrap/main.bicep --parameters infra/bootstrap/main.bicepparam
// Or use the Deploy to Azure button with the compiled infra/bootstrap/azuredeploy.json.
targetScope = 'subscription'

@description('Region for the resource group and the identity.')
param location string = 'indonesiacentral'

@description('Resource group that holds every resource of the demo.')
param resourceGroupName string = 'rg-contoso-health-aks'

@description('Name of the user-assigned managed identity used by GitHub Actions.')
param identityName string = 'id-github-contoso-health'

@description('GitHub account or organization that owns the repository.')
param githubOwner string

@description('Numeric ID of the owner: https://api.github.com/repos/OWNER/REPO -> owner.id')
param githubOwnerId string

@description('Repository name.')
param githubRepo string = 'contoso-health-aks-demo'

@description('Numeric ID of the repository: https://api.github.com/repos/OWNER/REPO -> id')
param githubRepoId string

@description('Subject format of the GitHub OIDC token: "immutable" (repo:OWNER@OWNER_ID/REPO@REPO_ID:...) or "classic" (repo:OWNER/REPO:...). Check the subject claim in a workflow run log if unsure.')
param subjectFormat string = 'immutable'

@description('GitHub environment that gates deployments.')
param environmentName string = 'production'

@description('Branch that builds images and runs the demo jobs.')
param mainBranch string = 'main'

@description('Tags for the resource group and the identity.')
param tags object = {
  workload: 'contoso-health'
  environment: 'demo'
  'cost-center': 'demo'
}

var repoSubjectPrefix = toLower(subjectFormat) == 'classic' ? 'repo:${githubOwner}/${githubRepo}' : 'repo:${githubOwner}@${githubOwnerId}/${githubRepo}@${githubRepoId}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module githubIdentity 'modules/github-identity.bicep' = {
  name: 'github-identity'
  scope: rg
  params: {
    location: location
    tags: tags
    identityName: identityName
    repoSubjectPrefix: repoSubjectPrefix
    environmentName: environmentName
    mainBranch: mainBranch
  }
}

// Values for the GitHub repository variables (guide step 4 / github/ Terraform).
output resourceGroupName string = rg.name
output clientId string = githubIdentity.outputs.clientId
output principalId string = githubIdentity.outputs.principalId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
output federatedSubjects array = githubIdentity.outputs.subjects

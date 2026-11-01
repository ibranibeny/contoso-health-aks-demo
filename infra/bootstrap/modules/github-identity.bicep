// The identity GitHub Actions signs in as (OpenID Connect, no secrets), its federated credentials,
// and least-privilege role assignments on this resource group.
param location string
param tags object
param identityName string

@description('Subject prefix, for example repo:OWNER@OWNER_ID/REPO@REPO_ID')
param repoSubjectPrefix string
param environmentName string
param mainBranch string

// Built-in role definition IDs
var roles = {
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
  resourcePolicyContributor: '36243c78-bf99-498c-9df9-86d9f8d28608'
  rbacAdministrator: 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  aksRbacClusterAdmin: 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b'
}

var credentials = [
  {
    name: 'github-environment-${environmentName}'
    subject: '${repoSubjectPrefix}:environment:${environmentName}'
  }
  {
    name: 'github-pull-request'
    subject: '${repoSubjectPrefix}:pull_request'
  }
  {
    name: 'github-branch-${mainBranch}'
    subject: '${repoSubjectPrefix}:ref:refs/heads/${mainBranch}'
  }
]

// "Constrain roles and principal types": the identity may only add or remove AcrPull and
// Azure Kubernetes Service RBAC Cluster Admin assignments, and only for users and service principals.
// Same expression the portal condition template generates (see Learn: delegate role assignments, examples).
var delegatedRoles = '${roles.acrPull}, ${roles.aksRbacClusterAdmin}'
var principalTypes = '\'User\', \'ServicePrincipal\''
var rbacCondition = '((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/write\'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${delegatedRoles}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {${principalTypes}})) AND ((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/delete\'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${delegatedRoles}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {${principalTypes}}))'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

// Federated credentials on one identity must be written one at a time.
@batchSize(1)
resource federatedCredentials 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = [
  for c in credentials: {
    parent: identity
    name: c.name
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: c.subject
      audiences: [
        'api://AzureADTokenExchange'
      ]
    }
  }
]

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, roles.contributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.contributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions: deploy the platform Bicep template and push images.'
  }
}

resource resourcePolicyContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, roles.resourcePolicyContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.resourcePolicyContributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions: create the Azure Policy assignments.'
  }
}

resource rbacAdministrator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, roles.rbacAdministrator)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.rbacAdministrator)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions: assign only AcrPull and AKS RBAC Cluster Admin, only to users and service principals.'
    condition: rbacCondition
    conditionVersion: '2.0'
  }
}

output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
output subjects array = [for c in credentials: c.subject]

// Contoso Health on AKS - infrastructure as code (resource group scope).
// Deployed by .github/workflows/infra.yml with OpenID Connect (no secrets).
targetScope = 'resourceGroup'

@description('Azure region for every resource. Indonesia Central keeps data in-country.')
param location string = resourceGroup().location

@description('Short workload name used to derive resource names.')
@minLength(3)
@maxLength(20)
param workloadName string = 'contoso-health'

@description('Environment label written to the tags of every resource.')
param environmentName string = 'demo'

@description('VM size for the AKS node pool.')
param nodeVmSize string = 'Standard_D4ds_v5'

@description('Minimum node count (cluster autoscaler).')
@minValue(1)
param nodeMinCount int = 2

@description('Maximum node count (cluster autoscaler).')
@maxValue(10)
param nodeMaxCount int = 4

@description('Availability zones for the node pool. Use [] where the region or VM size has no zone support.')
param availabilityZones array = [
  '1'
  '2'
  '3'
]

@description('AKS pricing tier. Standard adds the financially backed uptime SLA.')
@allowed([
  'Free'
  'Standard'
])
param aksTier string = 'Free'

@description('Object (principal) ID of the deployment identity used by GitHub Actions. It gets AKS RBAC Cluster Admin to roll out workloads.')
param deploymentPrincipalId string

@description('Optional object ID of a human operator who should see Kubernetes resources in the portal.')
param adminPrincipalId string = ''

@description('Optional e-mail address for alert notifications. Leave empty to skip the action group.')
param alertEmail string = ''

@description('Effect for the Kubernetes guardrails assigned with Azure Policy.')
@allowed([
  'Deny'
  'Audit'
])
param policyEffect string = 'Deny'

@description('Kubernetes namespace that hosts the application.')
param appNamespace string = 'contoso-health'

var tags = {
  workload: workloadName
  environment: environmentName
  'managed-by': 'bicep'
  'data-classification': 'synthetic'
  'cost-center': 'demo'
}
var suffix = uniqueString(resourceGroup().id)
var names = {
  logAnalytics: 'log-${workloadName}'
  monitorWorkspace: 'amw-${workloadName}'
  acr: take('acr${replace(workloadName, '-', '')}${suffix}', 50)
  aks: 'aks-${workloadName}'
  actionGroup: 'ag-${workloadName}'
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    tags: tags
    logAnalyticsName: names.logAnalytics
    monitorWorkspaceName: names.monitorWorkspace
  }
}

module registry 'modules/acr.bicep' = {
  name: 'registry'
  params: {
    location: location
    tags: tags
    name: names.acr
  }
}

module cluster 'modules/aks.bicep' = {
  name: 'cluster'
  params: {
    location: location
    tags: tags
    name: names.aks
    nodeVmSize: nodeVmSize
    nodeMinCount: nodeMinCount
    nodeMaxCount: nodeMaxCount
    availabilityZones: availabilityZones
    tier: aksTier
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsId
    acrName: registry.outputs.name
    deploymentPrincipalId: deploymentPrincipalId
    adminPrincipalId: adminPrincipalId
  }
}

module observability 'modules/aks-monitoring.bicep' = {
  name: 'observability'
  params: {
    location: location
    tags: tags
    aksName: cluster.outputs.name
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsId
    monitorWorkspaceId: monitoring.outputs.monitorWorkspaceId
    actionGroupName: names.actionGroup
    alertEmail: alertEmail
    appNamespace: appNamespace
  }
}

module guardrails 'modules/policy.bicep' = {
  name: 'guardrails'
  params: {
    acrLoginServer: registry.outputs.loginServer
    appNamespace: appNamespace
    effect: policyEffect
    allowedLocations: [
      location
    ]
  }
}

output aksName string = cluster.outputs.name
output acrName string = registry.outputs.name
output acrLoginServer string = registry.outputs.loginServer
output logAnalyticsWorkspace string = names.logAnalytics
output azureMonitorWorkspace string = names.monitorWorkspace

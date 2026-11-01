// Log Analytics (container logs, control-plane logs) + Azure Monitor workspace (managed Prometheus).
param location string
param tags object
param logAnalyticsName string
param monitorWorkspaceName string

@description('Days to keep log data in the analytics tier.')
@minValue(30)
param retentionInDays int = 30

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource monitorWorkspace 'Microsoft.Monitor/accounts@2023-04-03' = {
  name: monitorWorkspaceName
  location: location
  tags: tags
}

output logAnalyticsId string = logAnalytics.id
output monitorWorkspaceId string = monitorWorkspace.id

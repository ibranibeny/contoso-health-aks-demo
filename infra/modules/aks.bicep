// AKS cluster aligned with the AKS baseline: Microsoft Entra ID + Azure RBAC, no local
// accounts, workload identity, Azure CNI Overlay with Cilium (network policy), Azure Policy
// add-on, managed Prometheus + Container insights, auto-upgrade, availability zones.
param location string
param tags object
param name string
param nodeVmSize string
param nodeMinCount int
param nodeMaxCount int
param availabilityZones array
param tier string
param logAnalyticsWorkspaceId string
param acrName string
param deploymentPrincipalId string
param adminPrincipalId string

var roleIds = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  aksRbacClusterAdmin: 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b'
}

resource aks 'Microsoft.ContainerService/managedClusters@2025-05-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Base'
    tier: tier
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: name
    enableRBAC: true
    disableLocalAccounts: true
    aadProfile: {
      managed: true
      enableAzureRBAC: true
      tenantID: tenant().tenantId
    }
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
      imageCleaner: {
        enabled: true
        intervalHours: 168
      }
    }
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
      nodeOSUpgradeChannel: 'NodeImage'
    }
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
      loadBalancerSku: 'standard'
      outboundType: 'loadBalancer'
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        type: 'VirtualMachineScaleSets'
        vmSize: nodeVmSize
        osType: 'Linux'
        osSKU: 'AzureLinux'
        count: nodeMinCount
        enableAutoScaling: true
        minCount: nodeMinCount
        maxCount: nodeMaxCount
        availabilityZones: availabilityZones
        maxPods: 110
        upgradeSettings: {
          maxSurge: '33%'
        }
      }
    ]
    addonProfiles: {
      azurepolicy: {
        enabled: true
      }
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalyticsWorkspaceId
          useAADAuth: 'true'
        }
      }
    }
    azureMonitorProfile: {
      metrics: {
        enabled: true
        kubeStateMetrics: {
          metricLabelsAllowlist: ''
          metricAnnotationsAllowList: ''
        }
      }
    }
  }
}

// Control-plane logs (audit, Entra ID authentication, autoscaler) into Log Analytics.
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'control-plane-to-log-analytics'
  scope: aks
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logAnalyticsDestinationType: 'Dedicated'
    logs: [
      {
        category: 'kube-audit-admin'
        enabled: true
      }
      {
        category: 'guard'
        enabled: true
      }
      {
        category: 'cluster-autoscaler'
        enabled: true
      }
    ]
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// Nodes pull images with the kubelet managed identity - no image pull secrets.
resource kubeletAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, aks.id, roleIds.acrPull)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.acrPull)
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    description: 'AKS kubelet pulls Contoso Health images'
  }
}

// GitHub Actions deployment identity: Kubernetes data-plane access through Azure RBAC.
resource deployerClusterAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(aks.id, deploymentPrincipalId, roleIds.aksRbacClusterAdmin)
  scope: aks
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.aksRbacClusterAdmin)
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions deploys Kubernetes manifests'
  }
}

// Optional human operator, so Kubernetes resources are visible in the Azure portal.
resource operatorClusterAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(adminPrincipalId)) {
  name: guid(aks.id, adminPrincipalId, roleIds.aksRbacClusterAdmin)
  scope: aks
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.aksRbacClusterAdmin)
    principalId: adminPrincipalId
    principalType: 'User'
    description: 'Platform operator for the demo'
  }
}

output name string = aks.name
output id string = aks.id
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL

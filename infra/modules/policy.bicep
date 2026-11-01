// Governance as code: built-in Azure Policy assignments at resource-group scope.
// Kubernetes policies are enforced inside the cluster by the Azure Policy add-on (Gatekeeper).
param acrLoginServer string
param appNamespace string

@allowed([
  'Deny'
  'Audit'
])
param effect string
param allowedLocations array

var builtIn = {
  podSecurityBaseline: '/providers/Microsoft.Authorization/policySetDefinitions/a8640138-9b0a-4a28-b8cb-1666c838647d'
  allowedImages: '/providers/Microsoft.Authorization/policyDefinitions/febd0533-8e55-448f-b837-bd0e06f16469'
  allowedLocations: '/providers/Microsoft.Authorization/policyDefinitions/e56962a6-4747-49cd-b67b-bf8b01975c4c'
}

resource podSecurityBaseline 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'aks-pod-security-baseline'
  properties: {
    displayName: 'Contoso Health: Kubernetes pod security baseline (Linux)'
    description: 'Blocks privileged containers, host namespaces, host paths and host ports in the AKS cluster.'
    policyDefinitionId: builtIn.podSecurityBaseline
    enforcementMode: 'Default'
    parameters: {
      effect: {
        value: effect
      }
    }
    nonComplianceMessages: [
      {
        message: 'Contoso Health guardrail: workloads must follow the Kubernetes pod security baseline.'
      }
    ]
  }
}

resource allowedImages 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'aks-allowed-images'
  properties: {
    displayName: 'Contoso Health: only images from the approved container registry'
    description: 'Containers in the application namespace may only run images from the Contoso Health Azure Container Registry.'
    policyDefinitionId: builtIn.allowedImages
    enforcementMode: 'Default'
    parameters: {
      effect: {
        value: effect
      }
      namespaces: {
        value: [
          appNamespace
        ]
      }
      allowedContainerImagesRegex: {
        value: '^${replace(acrLoginServer, '.', '\\.')}/.+$'
      }
    }
    nonComplianceMessages: [
      {
        message: 'Contoso Health guardrail: use an image from ${acrLoginServer}.'
      }
    ]
  }
}

resource allowedLocationsAssignment 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'allowed-locations'
  properties: {
    displayName: 'Contoso Health: keep resources in approved regions (data residency)'
    description: 'Resources in this resource group may only be created in the approved Azure regions.'
    policyDefinitionId: builtIn.allowedLocations
    enforcementMode: 'Default'
    parameters: {
      listOfAllowedLocations: {
        value: allowedLocations
      }
    }
    nonComplianceMessages: [
      {
        message: 'Contoso Health guardrail: data must stay in the approved region.'
      }
    ]
  }
}

output assignments array = [
  podSecurityBaseline.name
  allowedImages.name
  allowedLocationsAssignment.name
]

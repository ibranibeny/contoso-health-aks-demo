// Private image registry. No admin user, no anonymous pull: AKS pulls with its kubelet
// managed identity (AcrPull) and GitHub Actions pushes with OIDC.
param location string
param tags object
param name string

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param sku string = 'Standard'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output name string = registry.name
output id string = registry.id
output loginServer string = registry.properties.loginServer

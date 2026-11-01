using './main.bicep'

// Values that are safe to commit. Identity values come from GitHub repository variables
// and are injected as environment variables by the workflow (never hard-coded here).
param workloadName = 'contoso-health'
param environmentName = 'demo'
param nodeVmSize = readEnvironmentVariable('AKS_NODE_VM_SIZE', 'Standard_D4ds_v5')
param nodeMinCount = 2
param nodeMaxCount = 5
param aksTier = 'Free'
param policyEffect = 'Deny'
param appNamespace = 'contoso-health'
param deploymentPrincipalId = readEnvironmentVariable('AZURE_PRINCIPAL_ID', '')
param adminPrincipalId = readEnvironmentVariable('ADMIN_PRINCIPAL_ID', '')
param alertEmail = readEnvironmentVariable('ALERT_EMAIL', '')

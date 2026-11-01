using './main.bicep'

// Defaults are for ibranibeny/contoso-health-aks-demo. For your own copy, set the environment
// variables (scripts/bootstrap.sh does it for you) or edit the fallback values.
param location = readEnvironmentVariable('AZURE_LOCATION', 'indonesiacentral')
param githubOwner = readEnvironmentVariable('GITHUB_OWNER', 'ibranibeny')
param githubOwnerId = readEnvironmentVariable('GITHUB_OWNER_ID', '66096127')
param githubRepo = readEnvironmentVariable('GITHUB_REPO', 'contoso-health-aks-demo')
param githubRepoId = readEnvironmentVariable('GITHUB_REPO_ID', '1441838609')
param subjectFormat = readEnvironmentVariable('OIDC_SUBJECT_FORMAT', 'immutable')

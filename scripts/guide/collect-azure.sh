#!/usr/bin/env bash
# Read-only platform facts for the guide (the deployment identity has Contributor on the resource group).
# Writes JSON/text files to $OUT_DIR. Never fails the job: every command is best effort.
set +e
RG="${AZURE_RESOURCE_GROUP:-rg-contoso-health-aks}"
O="$OUT_DIR"
az config set extension.use_dynamic_install=yes_without_prompt core.only_show_errors=true >/dev/null 2>&1

az group show -n "$RG" --query "{name:name, location:location, tags:tags}" -o json > "$O/rg.json"
az resource list -g "$RG" --query "sort_by([].{name:name, type:type, location:location}, &type)" -o json > "$O/resources.json"
az deployment group list -g "$RG" --query "[].{name:name, state:properties.provisioningState, timestamp:properties.timestamp, duration:properties.duration}" -o json > "$O/deployments.json"
LAST=$(az deployment group list -g "$RG" --query "sort_by([?starts_with(name, 'infra-')], &properties.timestamp)[-1].name" -o tsv)
[ -n "$LAST" ] && az deployment operation group list -g "$RG" -n "$LAST" --query "[].{resource:properties.targetResource.resourceName, type:properties.targetResource.resourceType, state:properties.provisioningState, duration:properties.duration}" -o json > "$O/deployment-operations.json"

AKS=$(az aks list -g "$RG" --query "[0].name" -o tsv)
if [ -n "$AKS" ]; then
  az aks show -g "$RG" -n "$AKS" --query "{name:name, kubernetesVersion:currentKubernetesVersion, tier:sku.tier, location:location, azureRbac:aadProfile.enableAzureRbac, localAccountsDisabled:disableLocalAccounts, networkPlugin:networkProfile.networkPlugin, pluginMode:networkProfile.networkPluginMode, dataplane:networkProfile.networkDataplane, oidcIssuer:oidcIssuerProfile.enabled, workloadIdentity:securityProfile.workloadIdentity.enabled, imageCleaner:securityProfile.imageCleaner.enabled, autoUpgrade:autoUpgradeProfile, azurePolicy:addonProfiles.azurepolicy.enabled, containerInsights:addonProfiles.omsagent.enabled, managedPrometheus:azureMonitorProfile.metrics.enabled, nodeResourceGroup:nodeResourceGroup, pools:agentPoolProfiles[].{name:name, vmSize:vmSize, count:count, min:minCount, max:maxCount, zones:availabilityZones, osSku:osSku, mode:mode}}" -o json > "$O/aks.json"
  az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing >/dev/null 2>&1
  TOKEN=$(az account get-access-token --resource 6dae42f8-4368-4678-94ff-3960e28e3630 --query accessToken -o tsv)
  echo "::add-mask::$TOKEN"
  kubectl config set-credentials github-actions --token="$TOKEN" >/dev/null
  kubectl config set-context --current --user=github-actions >/dev/null
  kubectl get nodes -L topology.kubernetes.io/zone,node.kubernetes.io/instance-type > "$O/nodes.txt" 2>&1
  kubectl -n contoso-health get deploy,hpa,pdb -o wide > "$O/workloads.txt" 2>&1
  kubectl -n contoso-health get pods -o wide > "$O/pods.txt" 2>&1
  kubectl -n contoso-health get svc -o wide > "$O/services.txt" 2>&1
  kubectl -n contoso-health get networkpolicy > "$O/networkpolicies.txt" 2>&1
  kubectl top nodes > "$O/top-nodes.txt" 2>&1
  kubectl -n contoso-health top pods > "$O/top-pods.txt" 2>&1
  kubectl get constraints -o custom-columns=KIND:.kind,NAME:.metadata.name,ACTION:.spec.enforcementAction,VIOLATIONS:.status.totalViolations > "$O/constraints.txt" 2>&1
  kubectl get ns contoso-health --show-labels > "$O/namespace.txt" 2>&1
  kubectl -n kube-system get pods -l 'rsName in (ama-metrics,ama-logs)' -o wide > "$O/agents.txt" 2>&1 || true
  kubectl -n kube-system get pods -o wide 2>/dev/null | grep -E 'ama-|azure-policy|gatekeeper' > "$O/addons.txt"
fi

az policy assignment list -g "$RG" --query "[?contains(id, '$RG')].{name:name, displayName:displayName, enforcementMode:enforcementMode}" -o json > "$O/policy-assignments.json"
az policy state summarize -g "$RG" -o json > "$O/policy-summary.json" 2>"$O/policy-summary.err"

WS=$(az monitor log-analytics workspace list -g "$RG" --query "[0].customerId" -o tsv)
if [ -n "$WS" ]; then
  kql() { az monitor log-analytics query -w "$WS" --analytics-query "$2" -o json > "$O/kql-$1.json" 2>"$O/kql-$1.err"; }
  kql requests 'ContainerLogV2 | where TimeGenerated > ago(2h) and PodNamespace == "contoso-health" and tostring(LogMessage.msg) == "request" | summarize requests = count() by service = tostring(LogMessage.service), status = toint(LogMessage.status) | order by service asc, status asc'
  kql errors 'ContainerLogV2 | where TimeGenerated > ago(2h) and PodNamespace == "contoso-health" | where tostring(LogMessage.level) == "error" | summarize errors = count() by service = tostring(LogMessage.service), bin(TimeGenerated, 5m) | order by TimeGenerated asc'
  kql sample 'ContainerLogV2 | where TimeGenerated > ago(2h) and PodNamespace == "contoso-health" and tostring(LogMessage.msg) == "request" | project TimeGenerated, PodName, service = tostring(LogMessage.service), route = tostring(LogMessage.route), status = toint(LogMessage.status), durationMs = toint(LogMessage.durationMs) | take 12'
  kql audit 'AKSAuditAdmin | where TimeGenerated > ago(1d) | summarize events = count() by user = tostring(User.username), verb = Verb | top 10 by events'
  kql inventory 'KubePodInventory | where TimeGenerated > ago(30m) and Namespace == "contoso-health" | summarize arg_max(TimeGenerated, PodStatus, ContainerRestartCount = toint(ContainerRestartCount)) by Name | project Name, PodStatus, ContainerRestartCount'
fi

SUB=$(az account show --query id -o tsv)
az rest --method get --url "https://management.azure.com/subscriptions/$SUB/providers/Microsoft.AlertsManagement/alerts?api-version=2019-05-05-preview&targetResourceGroup=$RG&timeRange=1d" \
  --query "value[].{name:properties.essentials.alertRule, severity:properties.essentials.severity, state:properties.essentials.alertState, condition:properties.essentials.monitorCondition, fired:properties.essentials.startDateTime, resolved:properties.essentials.monitorConditionResolvedDateTime, signal:properties.essentials.signalType}" -o json > "$O/alerts.json" 2>"$O/alerts.err"
az resource list -g "$RG" --resource-type Microsoft.AlertsManagement/prometheusRuleGroups --query "[].name" -o json > "$O/rule-groups.json"
az monitor activity-log list -g "$RG" --offset 1d --max-events 200 --query "[?caller!=null && contains(operationName.value, 'write')].{time:eventTimestamp, operation:operationName.localizedValue, status:status.value, caller:caller, resource:resourceId}" -o json > "$O/activity.json" 2>/dev/null
az role assignment list -g "$RG" --query "[].{principalType:principalType, role:roleDefinitionName, scope:scope, condition:condition != null}" -o json > "$O/role-assignments.json" 2>/dev/null
ls -la "$O"

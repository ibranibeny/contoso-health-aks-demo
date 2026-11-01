# Contoso Health on AKS — IaC, monitoring and governance (GUI-first demo)

A complete, working demo of a small **health-insurance** application on **Azure Kubernetes Service (AKS)** in **Indonesia Central**, delivered with **GitHub** (pull requests, code review, Actions) and run with **infrastructure as code, monitoring and governance** built in.

**Step-by-step guide with a video for every step:** https://ibranibeny.github.io/contoso-health-aks-demo/

**Live demo (while the environment is running):** http://contoso-health-ibranibeny.indonesiacentral.cloudapp.azure.com

> Contoso Health is a fictional insurer. Every member, hospital and number in this repository is synthetic.

## What the app does

| Question | Service | Example |
|---|---|---|
| Who has paid this month's contribution, who is due, who is in arrears? | `membership-api` | `GET /api/members?status=unpaid` |
| How many beds are free in each hospital, per class (VIP, Class 1–3, ICU, HCU, NICU, PICU, Isolation)? | `bed-api` | `GET /api/hospitals?class=ICU&available=1` |
| One web UI for both | `portal` | tabs *Contribution status* and *Bed availability* |

All three services are zero-dependency Node.js 24 containers (no `npm install`, nothing to patch but the base image).

## What you get

| Area | How it is done here |
|---|---|
| **IaC** | Three layers, all in this repository. **Bootstrap** (Bicep, subscription scope, `infra/bootstrap`): resource group, deployment identity, federated credentials, least-privilege role assignments. **GitHub settings** (Terraform, `github/`): production environment, repository variables, branch ruleset. **Platform** (Bicep, `infra/`): AKS, ACR, Log Analytics, Azure Monitor workspace, data collection rules, alert rules, policy assignments; pull requests show a **what-if** comment, merges deploy after an environment approval. Workloads are declarative too (Kustomize in `k8s/`). |
| **CI/CD** | GitHub Actions: tests, container builds, Bicep lint, kubeconform, CodeQL on every PR; images pushed to ACR and rolled out to AKS on merge. Azure login uses **OpenID Connect** — no secrets in GitHub. |
| **Code review** | `main` is protected by a ruleset: pull request required, conversations resolved, required status checks, no force pushes or deletion. Optional automatic Copilot code review. Third-party actions are pinned to commit SHAs. |
| **Monitoring** | Container insights (logs to Log Analytics), Azure Monitor managed Prometheus (cluster + app metrics), dashboards with Grafana in the Azure portal, PromQL alert rules for 5xx rate, restarts and unavailable replicas. |
| **Governance** | Azure Policy: pod security baseline, *only images from our ACR*, *allowed locations = indonesiacentral*; Microsoft Entra ID + Azure RBAC for Kubernetes with local accounts disabled; Pod Security Admission labels and NetworkPolicies; tags. |

## Repository map

```
src/            membership-api, bed-api, portal (Node.js 24, tests with node:test)
k8s/base/       Deployments, Services, HPA, PDB, NetworkPolicies (kustomize)
k8s/platform/   managed Prometheus scrape settings (kube-system)
k8s/demo/       loadgen job, policy-violation pod for the governance demo
infra/          main.bicep + modules (monitoring, acr, aks, aks-monitoring, policy)
infra/bootstrap one-time Azure setup as code (resource group, identity, federated credentials, roles)
github/         GitHub settings as code (Terraform: environment, variables, ruleset)
scripts/        bootstrap.sh: steps 2-4 of the guide in one run (Azure Cloud Shell); guide/: evidence capture for the guide
.github/        workflows (ci, codeql, infra, deploy-app, demo-ops, publish-guide, guide-evidence), CODEOWNERS, PR template
docs/           the GitHub Pages guide (HTML, diagrams, videos)
```

## Quick start

Follow the guide. Every Azure step is shown in the **Azure portal** and every GitHub step in the **GitHub web UI**, each with a narrated video:

1. Get the code (create your copy from this template).
2. Prepare the subscription (resource providers, quota, resource group in `indonesiacentral`).
3. Create the deployment identity (managed identity, federated credentials, least-privilege roles).
4. Connect GitHub to Azure (production environment, repository variables, branch ruleset).
5. Provision the platform with Bicep (**Infrastructure (Bicep)** workflow, approval).
6. Build and deploy the app (**App (build & deploy to AKS)** runs automatically).
7. Ship a change with code review (pull request, checks, merge, what-if for infrastructure).
8. Monitor the platform; 9. prove the guardrails; 10. clean up.

The workflows read the Azure identifiers as repository **variables or secrets** (`vars.NAME || secrets.NAME`).

**Prefer code for the setup?** Steps 2-4 also exist as infrastructure as code. In Azure Cloud Shell:

```bash
git clone https://github.com/<you>/contoso-health-aks-demo.git && cd contoso-health-aks-demo
gh auth login
GITHUB_OWNER=<you> bash scripts/bootstrap.sh   # Bicep what-if + deploy, then Terraform for GitHub settings
```

Or deploy only the Azure part from the portal: [![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fibranibeny%2Fcontoso-health-aks-demo%2Fmain%2Finfra%2Fbootstrap%2Fazuredeploy.json)

Run locally (Node.js 24):

```bash
PORT=7001 node src/membership-api/server.js &
PORT=7002 node src/bed-api/server.js &
PORT=7000 MEMBERSHIP_API_URL=http://localhost:7001 BED_API_URL=http://localhost:7002 node src/portal/server.js
# open http://localhost:7000
```

## Cost and clean-up

The default cluster is 2 × `Standard_D4ds_v5` nodes (autoscaling to 4) on the AKS Free tier, plus a Standard ACR, Log Analytics and an Azure Monitor workspace. Delete the resource group `rg-contoso-health-aks` when you are done (guide step 10).

## License

MIT

# Contoso Health on AKS — IaC, monitoring and governance (GUI-first demo)

A complete, working demo of a small **health-insurance** application on **Azure Kubernetes Service (AKS)** in **Indonesia Central**, delivered with **GitHub** (pull requests, code review, Actions) and run with **infrastructure as code, monitoring and governance** built in.

**Step-by-step guide with a video for every step:** https://ibranibeny.github.io/contoso-health-aks-demo/

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
| **IaC** | Bicep in `infra/` (AKS, ACR, Log Analytics, Azure Monitor workspace, data collection rules, alert rules, policy assignments). Pull requests show a **what-if** preview as a comment; merges to `main` deploy after an environment approval. |
| **CI/CD** | GitHub Actions: tests, container builds, Bicep lint, kubeconform, CodeQL on every PR; images pushed to ACR and rolled out to AKS on merge. Azure login uses **OpenID Connect** — no secrets in GitHub. |
| **Code review** | `main` is protected by a ruleset: pull request required, code-owner review, required status checks, linear history. |
| **Monitoring** | Container insights (logs to Log Analytics), Azure Monitor managed Prometheus (cluster + app metrics), dashboards with Grafana in the Azure portal, PromQL alert rules for 5xx rate, restarts and unavailable replicas. |
| **Governance** | Azure Policy: pod security baseline, *only images from our ACR*, *allowed locations = indonesiacentral*; Microsoft Entra ID + Azure RBAC for Kubernetes with local accounts disabled; tags; Deployment Safeguards (optional). |

## Repository map

```
src/            membership-api, bed-api, portal (Node.js 24, tests with node:test)
k8s/base/       Deployments, Services, HPA, PDB, NetworkPolicies (kustomize)
k8s/platform/   managed Prometheus scrape settings (kube-system)
k8s/demo/       loadgen job, policy-violation pod for the governance demo
infra/          main.bicep + modules (monitoring, acr, aks, aks-monitoring, policy)
.github/        workflows (ci, codeql, infra, deploy-app, demo-ops), CODEOWNERS, PR template
docs/           the GitHub Pages guide (HTML, diagrams, videos)
```

## Quick start

Follow the guide; every Azure step is done in the **Azure portal** and every GitHub step in the **GitHub web UI**:

1. Create your copy of this repository.
2. Prepare the subscription (resource providers, resource group in `indonesiacentral`).
3. Connect GitHub to Azure: user-assigned managed identity + federated credentials, repository variables.
4. Run **Infrastructure (Bicep)** — AKS and friends are created from code.
5. **App (build & deploy to AKS)** runs automatically and prints the portal URL.
6. Change code through a pull request and watch review, checks and deployment.
7. Explore monitoring; 8. prove the guardrails; 9. clean up.

Run locally (Node.js 24):

```bash
PORT=7001 node src/membership-api/server.js &
PORT=7002 node src/bed-api/server.js &
PORT=7000 MEMBERSHIP_API_URL=http://localhost:7001 BED_API_URL=http://localhost:7002 node src/portal/server.js
# open http://localhost:7000
```

## Cost and clean-up

The default cluster is 2 × `Standard_D4ds_v5` nodes (autoscaling to 4) on the AKS Free tier, plus a Standard ACR, Log Analytics and an Azure Monitor workspace. Delete the resource group `rg-contoso-health-aks` when you are done (guide step 9).

## License

MIT

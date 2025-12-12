SHELL := /bin/bash

NAMESPACE ?= demo
RELEASE ?= payflow
K3D_CLUSTER ?= kubeiq-test-cluster

BACKEND_IMAGE ?= payflow-backend
FRONTEND_IMAGE ?= payflow-frontend

VERSION := $(shell cat VERSION)
GIT_SHA := $(shell git rev-parse HEAD)

GITHUB_REPO ?= ShimiT/payflow-demo

API_URL ?= http://localhost:8088
CLUSTER_NAME ?= k3d-kubeiq-test-cluster

.PHONY: help version sync-main build build-images import import-images deploy deploy-buggy deploy-lkg remove status logs port-forward
.PHONY: demo-check demo-commit demo-stable demo-buggy demo-rca demo-rollback demo-watch demo-events demo-full demo-reset wait-for-ci helm-check

# =============================================================================
# HELP
# =============================================================================

help:
	@echo "PayFlow RCA Demo - Makefile Targets"
	@echo ""
	@echo "=== ONE-TIME SETUP ==="
	@echo "  make demo-commit      Commit and push current changes to GitHub"
	@echo "  make demo-check       Verify all prerequisites are installed"
	@echo ""
	@echo "=== DEMO FLOW (use these for the demo) ==="
	@echo "  make demo-baseline    Phase 1: Build + import + deploy stable baseline"
	@echo "  make demo-stable      Commit stable code + build + deploy"
	@echo "  make demo-buggy       Commit buggy code + build + deploy"
	@echo "  make demo-rca         Start RCA investigation via API"
	@echo "  make demo-rollback    Rollback to Last Known Good"
	@echo "  make demo-full        Run full demo flow automatically"
	@echo ""
	@echo "=== MONITORING ==="
	@echo "  make demo-watch       Watch pods for crashes"
	@echo "  make demo-events      Show recent K8s events"
	@echo "  make status           Show pod status"
	@echo "  make logs             Tail backend logs"
	@echo ""
	@echo "=== BUILD & DEPLOY (manual) ==="
	@echo "  make build            Build Docker images"
	@echo "  make import           Import images to k3d"
	@echo "  make deploy           Deploy stable version"
	@echo "  make deploy-buggy     Deploy with buggy config"
	@echo "  make deploy-lkg       Deploy Last Known Good"
	@echo "  make remove           Uninstall Helm release"
	@echo ""
	@echo "=== GIT ==="
	@echo "  make sync-main        Fetch and checkout main branch"
	@echo "  make commit-stable    Commit code without bug (direct to main)"
	@echo "  make commit-buggy     Commit code with bug (direct to main)"
	@echo ""
	@echo "=== INFO ==="
	@echo "  make version          Show current VERSION"
	@echo "  make helm-check       Verify Helm template renders correct images"
	@echo ""

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

demo-check:
	@echo "=== Checking Prerequisites ==="
	@echo -n "k3d: " && (command -v k3d >/dev/null 2>&1 && echo "OK" || echo "MISSING")
	@echo -n "kubectl: " && (command -v kubectl >/dev/null 2>&1 && echo "OK" || echo "MISSING")
	@echo -n "helm: " && (command -v helm >/dev/null 2>&1 && echo "OK" || echo "MISSING")
	@echo -n "docker: " && (command -v docker >/dev/null 2>&1 && echo "OK" || echo "MISSING")
	@echo -n "git: " && (command -v git >/dev/null 2>&1 && echo "OK" || echo "MISSING")
	@echo ""
	@echo "=== Checking k3d Cluster ==="
	@k3d cluster list | grep -q $(K3D_CLUSTER) && echo "Cluster $(K3D_CLUSTER): RUNNING" || echo "Cluster $(K3D_CLUSTER): NOT FOUND"
	@echo ""
	@echo "=== Checking kubectl Context ==="
	@kubectl config current-context 2>/dev/null || echo "No context set"
	@echo ""
	@echo "=== Checking Git Remote ==="
	@git remote -v | head -2
	@echo ""
	@echo "=== Current State ==="
	@echo "VERSION: $(VERSION)"
	@echo "GIT_SHA: $(GIT_SHA)"
	@echo "GITHUB_REPO: $(GITHUB_REPO)"
	@echo "Branch: $$(git branch --show-current)"

helm-check:
	@echo "=== Helm Template Check ==="
	@helm template $(RELEASE) ./helm/payflow -n $(NAMESPACE) | grep -E "image: payflow-"
	@echo ""
	@echo "Expected: payflow-backend:$(VERSION) and payflow-frontend:$(VERSION)"

# =============================================================================
# ONE-TIME SETUP
# =============================================================================

demo-commit:
	@echo "=== Committing and Pushing Changes ==="
	@if [ -z "$$(git status --porcelain)" ]; then \
		echo "No changes to commit"; \
	else \
		git add -A; \
		git commit -m "feat: helm uses appVersion, Makefile build/import/deploy flow, PR automation"; \
		git push origin main; \
		echo ""; \
		echo "Changes pushed. Waiting for GitHub Actions..."; \
		echo "Monitor: https://github.com/$(GITHUB_REPO)/actions"; \
	fi

wait-for-ci:
	@echo "=== Waiting for GitHub Actions to Complete ==="
	@echo "Checking workflow status for 5 minutes..."
	@for i in $$(seq 1 60); do \
		echo "Waiting... ($$i/60) - 5s intervals"; \
		sleep 5; \
	done
	@echo "Wait complete. Check https://github.com/$(GITHUB_REPO)/actions for status"

# =============================================================================
# GIT OPERATIONS (No PR, direct to main)
# =============================================================================

commit-stable:
	@echo "=== Committing Stable Code (Remove Bug) ==="
	@git fetch origin && git pull origin main
	@if git apply --check -R scripts/demo/bug.patch 2>/dev/null; then \
		git apply -R scripts/demo/bug.patch; \
		git add backend/cmd/server/main.go; \
		git commit -m "fix: revert buggy cache warmup"; \
		git push origin main; \
		echo "Stable code committed and pushed!"; \
	else \
		echo "Bug patch already reverted or cannot apply. Skipping."; \
	fi

commit-buggy:
	@echo "=== Committing Buggy Code (Add Bug) ==="
	@git fetch origin && git pull origin main
	@if git apply --check scripts/demo/bug.patch 2>/dev/null; then \
		git apply scripts/demo/bug.patch; \
		git add backend/cmd/server/main.go; \
		git commit -m "feat: enable new cache warmup (buggy)"; \
		git push origin main; \
		echo "Buggy code committed and pushed!"; \
	else \
		echo "Bug patch already applied or cannot apply. Skipping."; \
	fi

# =============================================================================
# DEMO FLOW TARGETS
# =============================================================================

demo-baseline:
	@echo "=============================================="
	@echo "  Phase 1: Deploy Stable Baseline"
	@echo "=============================================="
	@echo ""
	@echo "Current VERSION: $(VERSION)"
	@echo ""
	@echo "Step 1/3: Building Docker images..."
	@$(MAKE) build
	@echo ""
	@echo "Step 2/3: Importing to k3d cluster..."
	@$(MAKE) import
	@echo ""
	@echo "Step 3/3: Deploying to Kubernetes..."
	@$(MAKE) deploy
	@echo ""
	@echo "=== BASELINE DEPLOYMENT COMPLETE ==="
	@echo "Version: $(VERSION)"
	@echo ""
	@kubectl get pods -n $(NAMESPACE)
	@echo ""
	@echo "Next Steps:"
	@echo "  1. Configure InfraSage tracking (UI: http://localhost:3011)"
	@echo "  2. Add Git mapping: payflow-* -> ShimiT/payflow-demo"
	@echo "  3. Wait 30s for tracking to pick up deployments"
	@echo "  4. Run 'make demo-buggy' to introduce the bug"

demo-stable:
	@echo "=============================================="
	@echo "  DEMO: Reset to Stable State"
	@echo "=============================================="
	@echo ""
	@echo "Step 1/6: Committing stable code..."
	@$(MAKE) commit-stable
	@echo ""
	@echo "Step 2/6: Waiting for GitHub Actions (90s)..."
	@sleep 90
	@echo ""
	@echo "Step 3/6: Syncing main branch..."
	@$(MAKE) sync-main
	@echo ""
	@echo "Step 4/6: Building images (v$$(cat VERSION))..."
	@$(MAKE) build
	@echo ""
	@echo "Step 5/6: Importing images to k3d..."
	@$(MAKE) import
	@echo ""
	@echo "Step 6/6: Deploying stable version..."
	@$(MAKE) deploy
	@echo ""
	@echo "=== STABLE DEPLOYMENT COMPLETE ==="
	@echo "Version: $$(cat VERSION)"
	@kubectl get pods -n $(NAMESPACE)

demo-buggy:
	@echo "=============================================="
	@echo "  DEMO: Introduce Bug"
	@echo "=============================================="
	@echo ""
	@echo "Step 1/6: Committing buggy code..."
	@$(MAKE) commit-buggy
	@echo ""
	@echo "Step 2/6: Waiting for GitHub Actions (90s)..."
	@sleep 90
	@echo ""
	@echo "Step 3/6: Syncing main branch..."
	@$(MAKE) sync-main
	@echo ""
	@echo "Step 4/6: Building images (v$$(cat VERSION))..."
	@$(MAKE) build
	@echo ""
	@echo "Step 5/6: Importing images to k3d..."
	@$(MAKE) import
	@echo ""
	@echo "Step 6/6: Deploying buggy version..."
	@$(MAKE) deploy-buggy
	@echo ""
	@echo "=== BUGGY DEPLOYMENT COMPLETE ==="
	@echo "Version: $$(cat VERSION)"
	@echo ""
	@echo "Watch for OOM crashes with: make demo-watch"
	@kubectl get pods -n $(NAMESPACE)

demo-rca:
	@echo "=== Starting RCA Investigation ==="
	@echo "Cluster: $(CLUSTER_NAME)"
	@echo "Namespace: $(NAMESPACE)"
	@echo "Service: $(RELEASE)-backend"
	@echo ""
	@response=$$(curl -s -X POST $(API_URL)/api/platform/rca/investigate \
		-H "Content-Type: application/json" \
		-d '{"cluster":"$(CLUSTER_NAME)","namespace":"$(NAMESPACE)","service":"$(RELEASE)-backend","hours_back":2}'); \
	echo "$$response" | jq . 2>/dev/null || echo "$$response"; \
	echo ""; \
	echo "View investigation at: http://localhost:3011/incidents"

demo-rollback:
	@echo "=== Rolling Back to Last Known Good ==="
	@$(MAKE) deploy-lkg
	@echo ""
	@echo "=== ROLLBACK COMPLETE ==="
	@kubectl get pods -n $(NAMESPACE)

demo-watch:
	@echo "=== Watching Pods (Ctrl+C to stop) ==="
	@kubectl get pods -n $(NAMESPACE) -w

demo-events:
	@echo "=== Recent Kubernetes Events ==="
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20

demo-reset:
	@echo "=== Quick Reset: Remove and Redeploy ==="
	@$(MAKE) remove
	@sleep 2
	@$(MAKE) deploy
	@kubectl get pods -n $(NAMESPACE)

demo-full:
	@echo "=============================================="
	@echo "  FULL RCA DEMO FLOW"
	@echo "=============================================="
	@echo ""
	@echo "This will:"
	@echo "  1. Reset repo to stable state"
	@echo "  2. Deploy stable version"
	@echo "  3. Introduce bug"
	@echo "  4. Deploy buggy version"
	@echo "  5. Wait for crashes"
	@echo "  6. Start RCA investigation"
	@echo ""
	@read -p "Press Enter to continue or Ctrl+C to cancel..."
	@echo ""
	@echo ">>> Phase 1: Deploying Stable Baseline"
	@$(MAKE) demo-stable
	@echo ""
	@echo ">>> Stable deployment complete. Waiting 30s for baseline..."
	@sleep 30
	@echo ""
	@echo ">>> Phase 2: Introducing Bug"
	@$(MAKE) demo-buggy
	@echo ""
	@echo ">>> Buggy deployment complete. Waiting 60s for OOM crashes..."
	@for i in $$(seq 1 12); do \
		echo "Waiting... ($$i/12) - 5s intervals"; \
		kubectl get pods -n $(NAMESPACE) 2>/dev/null | grep -E "OOMKilled|CrashLoopBackOff|Error" && break; \
		sleep 5; \
	done
	@echo ""
	@echo ">>> Phase 3: Running RCA Investigation"
	@$(MAKE) demo-rca
	@echo ""
	@echo "=============================================="
	@echo "  DEMO COMPLETE"
	@echo "=============================================="
	@echo ""
	@echo "Next steps:"
	@echo "  1. Open http://localhost:3011/incidents"
	@echo "  2. View the investigation results"
	@echo "  3. Run 'make demo-rollback' to recover"

# =============================================================================
# BASIC OPERATIONS
# =============================================================================

version:
	@echo $(VERSION)

sync-main:
	@git fetch origin
	@git checkout main
	@git pull origin main

build: build-images

build-images:
	docker build --build-arg GIT_SHA=$(GIT_SHA) -t $(BACKEND_IMAGE):$(VERSION) ./backend
	docker build --build-arg GIT_SHA=$(GIT_SHA) -t $(FRONTEND_IMAGE):$(VERSION) ./frontend

import: import-images

import-images:
	k3d image import $(BACKEND_IMAGE):$(VERSION) $(FRONTEND_IMAGE):$(VERSION) -c $(K3D_CLUSTER)

deploy:
	kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	helm upgrade --install $(RELEASE) ./helm/payflow -n $(NAMESPACE) --wait
	kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=$(RELEASE) -n $(NAMESPACE) --timeout=120s

deploy-buggy:
	helm upgrade $(RELEASE) ./helm/payflow -n $(NAMESPACE) -f ./helm/payflow/values-buggy.yaml

deploy-lkg:
	helm upgrade $(RELEASE) ./helm/payflow -n $(NAMESPACE) -f ./helm/payflow/values-lkg.yaml --wait

remove:
	helm uninstall $(RELEASE) -n $(NAMESPACE) || true

status:
	kubectl get pods -n $(NAMESPACE)

logs:
	kubectl logs -n $(NAMESPACE) -l app.kubernetes.io/component=backend -f

port-forward:
	kubectl port-forward -n $(NAMESPACE) svc/payflow-frontend 8080:80

.PHONY: deploy remove build import port-forward deploy-buggy deploy-lkg status logs release-buggy release-buggy-publish submit-buggy

NAMESPACE := demo
RELEASE := payflow
CLUSTER := kubeiq-test-cluster
APP_VERSION_BUGGY := v1.1.0-hotfix
TAG_VERSION := v0.0.2
CHART_VERSION_BUGGY := 0.0.2
RELEASE_DIR := dist
# Extract "owner/repo" from origin URL without using regex groups (to keep make happy)
# Extract owner/repo from origin URL (supports git@ and https://)
REPO_RAW := $(shell git config --get remote.origin.url | awk -F'[:/]' '{print $(NF-1)"/"$(NF)}' | sed 's/\.git$$//')
REPO := $(if $(strip $(REPO_RAW)),$(strip $(REPO_RAW)),ShimiT/payflow-demo)

# Deploy the application to k3d cluster
deploy:
	@echo "Creating namespace $(NAMESPACE) if not exists..."
	@kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	@echo "Deploying $(RELEASE) to cluster..."
	helm upgrade --install $(RELEASE) ./helm/payflow -n $(NAMESPACE)
	@echo "Waiting for pods to be ready..."
	@kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=$(RELEASE) -n $(NAMESPACE) --timeout=120s
	@echo "Deployment complete! Run 'make port-forward' to access the app."

# Remove the application from cluster
remove:
	@echo "Removing $(RELEASE) from cluster..."
	helm uninstall $(RELEASE) -n $(NAMESPACE) || true
	@echo "$(RELEASE) removed."

# Build Docker images
build:
	@echo "Building backend image..."
	docker build -t payflow-backend:v1.0.0 ./backend
	@echo "Building frontend image..."
	docker build -t payflow-frontend:v1.0.0 ./frontend
	@echo "Build complete!"

# Import images to k3d cluster
import:
	@echo "Importing images to k3d cluster $(CLUSTER)..."
	k3d image import payflow-backend:v1.0.0 payflow-frontend:v1.0.0 -c $(CLUSTER)
	@echo "Import complete!"

# Port forward to access the app
port-forward:
	@echo "Port forwarding to http://localhost:8080..."
	kubectl port-forward -n $(NAMESPACE) svc/payflow-frontend 8080:80

# Deploy buggy version for RCA demo
deploy-buggy:
	helm upgrade $(RELEASE) ./helm/payflow -n $(NAMESPACE) -f ./helm/payflow/values-buggy.yaml

# Deploy stable LKG version
deploy-lkg:
	helm upgrade $(RELEASE) ./helm/payflow -n $(NAMESPACE) -f ./helm/payflow/values-lkg.yaml

# Show pod status
status:
	kubectl get pods -n $(NAMESPACE)

# Show logs
logs:
	kubectl logs -n $(NAMESPACE) -l app.kubernetes.io/component=backend -f

release-buggy:
	@mkdir -p $(RELEASE_DIR)
	helm package ./helm/payflow --version $(CHART_VERSION_BUGGY) --app-version $(APP_VERSION_BUGGY) --destination $(RELEASE_DIR)
	git tag -a $(TAG_VERSION) -m "Release $(TAG_VERSION)"
	@echo "Tag created. Push with: git push origin $(TAG_VERSION) or run 'make release-buggy-publish'"

release-buggy-publish: release-buggy
	gh release create $(TAG_VERSION) $(RELEASE_DIR)/payflow-$(CHART_VERSION_BUGGY).tgz --title "$(TAG_VERSION)" --notes "Buggy hotfix $(APP_VERSION_BUGGY) for RCA demo (OOM via cache blow-up)." --target main

# Prepare a PR that submits the buggy release (bumps VERSION + Chart) and opens a PR
submit-buggy:
	@git switch bug/oom-demo-$(CHART_VERSION_BUGGY) >/dev/null 2>&1 || git switch --create bug/oom-demo-$(CHART_VERSION_BUGGY)
	@echo "$(CHART_VERSION_BUGGY)" > VERSION
	@sed -i '' "s/^version:.*/version: $(CHART_VERSION_BUGGY)/" helm/payflow/Chart.yaml
	@sed -i '' "s/^appVersion:.*/appVersion: \"$(APP_VERSION_BUGGY)\"/" helm/payflow/Chart.yaml
	@git add VERSION helm/payflow/Chart.yaml
	@git commit -m "chore: prepare buggy release $(CHART_VERSION_BUGGY)" || echo "No changes to commit"
	@git push -u origin bug/oom-demo-$(CHART_VERSION_BUGGY)
	@if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then \
		gh pr create --title "chore: submit buggy release $(CHART_VERSION_BUGGY)" --body "Prep buggy OOM demo release $(CHART_VERSION_BUGGY) (app $(APP_VERSION_BUGGY)): updates VERSION and chart metadata for the RCA incident simulation."; \
	else \
		echo "Open PR manually (gh missing or not authenticated):"; \
		echo "https://github.com/$(REPO)/compare/main...bug/oom-demo-$(CHART_VERSION_BUGGY)?expand=1"; \
	fi

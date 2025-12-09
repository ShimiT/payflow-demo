.PHONY: deploy remove build import port-forward

NAMESPACE := demo
RELEASE := payflow
CLUSTER := kubeiq-test-cluster

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

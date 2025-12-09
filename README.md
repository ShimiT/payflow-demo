# PayFlow - Payment Processing Demo

A production-grade demo application for InfraSage RCA showcasing payment processing simulation with bug injection capabilities.

## Quick Start

### Prerequisites
- Docker
- k3d cluster running
- kubectl configured
- Helm 3.x

### Build & Deploy

```bash
# Build Docker images
cd payflow
docker build -t payflow-backend:v1.0.0 ./backend
docker build -t payflow-frontend:v1.0.0 ./frontend

# Import images to k3d
k3d image import payflow-backend:v1.0.0 payflow-frontend:v1.0.0 -c kubeiq-test-cluster

# Deploy with Helm
kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
helm install payflow ./helm/payflow -n demo

# Port forward to access
kubectl port-forward -n demo svc/payflow-frontend 8080:80
```

Then open http://localhost:8080

## Demo Scenarios

### Scenario 1: The Caching Incident
```bash
# Deploy buggy version
helm upgrade payflow ./helm/payflow -n demo -f ./helm/payflow/values-buggy.yaml

# Watch for OOM crashes
kubectl get pods -n demo -w
```

### Scenario 2: Rollback to stable
```bash
helm upgrade payflow ./helm/payflow -n demo -f ./helm/payflow/values-lkg.yaml
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PayFlow System                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Frontend  │───▶│   Backend   │───▶│  PostgreSQL │     │
│  │  (React)    │    │    (Go)     │    │             │     │
│  └─────────────┘    └──────┬──────┘    └─────────────┘     │
│                            │                                 │
│                            ▼                                 │
│                     ┌─────────────┐                         │
│                     │    Redis    │                         │
│                     │   (Cache)   │                         │
│                     └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Bug Injection

Set via environment variables or ConfigMap:

| Bug Type | Env Variable | Effect |
|----------|--------------|--------|
| OOM Crash | `INJECT_OOM=true` | Memory grows until killed |
| Latency | `INJECT_LATENCY_MS=5000` | Adds delay to API |
| Error Rate | `INJECT_ERROR_RATE=0.3` | 30% of requests fail |
| CPU Spike | `INJECT_CPU_BURN=true` | Busy loop |
| Panic | `INJECT_PANIC=true` | Random panics |
| DB Timeout | `INJECT_DB_TIMEOUT=true` | Hold DB connections |

## Endpoints

- `GET /health` - Health check
- `GET /ready` - Readiness check  
- `GET /metrics` - Prometheus metrics
- `GET /api/stats` - Dashboard statistics
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/config` - Current configuration

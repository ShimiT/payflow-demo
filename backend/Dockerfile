FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod ./

# Copy source code
COPY . .

# Download dependencies and build
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o payflow ./cmd/server

# Final image
FROM alpine:3.19

ARG GIT_SHA
ARG VERSION

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/payflow .

LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.source="https://github.com/ShimiT/payflow-demo" \
      org.opencontainers.image.version="${VERSION}"

EXPOSE 8080

CMD ["./payflow"]

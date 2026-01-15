package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Config holds all configuration
type Config struct {
	Port           string
	PostgresHost   string
	PostgresPort   string
	PostgresUser   string
	PostgresPass   string
	PostgresDB     string
	RedisHost      string
	RedisPort      string
	CacheMaxSize   string
	CacheTTL       int
	DBPoolSize     int
	RateLimitRPS   int
	LogLevel       string
	FeatureNewCache bool
	// Bug injection
	InjectOOM       bool
	InjectLatencyMs int
	InjectErrorRate float64
	InjectCPUBurn   bool
	InjectPanic     bool
	InjectDBTimeout bool
}

// Metrics
var (
	transactionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "payflow_transactions_total",
			Help: "Total number of transactions",
		},
		[]string{"status"},
	)
	transactionDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "payflow_transaction_duration_seconds",
			Help:    "Transaction duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"endpoint"},
	)
	cacheHitRatio = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "payflow_cache_hit_ratio",
			Help: "Cache hit ratio",
		},
	)
	dbConnectionsActive = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "payflow_db_connections_active",
			Help: "Number of active database connections",
		},
	)
	memoryUsedBytes = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "payflow_memory_used_bytes",
			Help: "Memory used in bytes",
		},
	)
	requestsInFlight = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "payflow_requests_in_flight",
			Help: "Number of requests currently in flight",
		},
	)
)

// Transaction represents a payment transaction
type Transaction struct {
	ID          string    `json:"id"`
	FromAccount string    `json:"from_account"`
	ToAccount   string    `json:"to_account"`
	Amount      float64   `json:"amount"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

// App holds application state
type App struct {
	config      *Config
	db          *sql.DB
	redisClient *redis.Client
	memoryLeak  [][]byte
	mu          sync.Mutex
	cacheHits   int64
	cacheMisses int64
}

// StructuredLog represents a JSON log entry
type StructuredLog struct {
	Timestamp string      `json:"timestamp"`
	Level     string      `json:"level"`
	Service   string      `json:"service"`
	TraceID   string      `json:"trace_id"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
}

func (app *App) log(level, message string, data interface{}) {
	logEntry := StructuredLog{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Level:     level,
		Service:   "payflow-api",
		TraceID:   uuid.New().String()[:8],
		Message:   message,
		Data:      data,
	}
	jsonLog, _ := json.Marshal(logEntry)
	fmt.Println(string(jsonLog))
}

func loadConfig() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		PostgresHost:   getEnv("POSTGRES_HOST", "localhost"),
		PostgresPort:   getEnv("POSTGRES_PORT", "5432"),
		PostgresUser:   getEnv("POSTGRES_USER", "payflow"),
		PostgresPass:   getEnv("POSTGRES_PASSWORD", "payflow"),
		PostgresDB:     getEnv("POSTGRES_DB", "payflow"),
		RedisHost:      getEnv("REDIS_HOST", "localhost"),
		RedisPort:      getEnv("REDIS_PORT", "6379"),
		CacheMaxSize:   getEnv("CACHE_MAX_SIZE", "100MB"),
		CacheTTL:       getEnvInt("CACHE_TTL", 3600),
		DBPoolSize:     getEnvInt("DB_POOL_SIZE", 10),
		RateLimitRPS:   getEnvInt("RATE_LIMIT_RPS", 100),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
		FeatureNewCache: getEnvBool("FEATURE_NEW_CACHE", false),
		InjectOOM:       getEnvBool("INJECT_OOM", false),
		InjectLatencyMs: getEnvInt("INJECT_LATENCY_MS", 0),
		InjectErrorRate: getEnvFloat("INJECT_ERROR_RATE", 0),
		InjectCPUBurn:   getEnvBool("INJECT_CPU_BURN", false),
		InjectPanic:     getEnvBool("INJECT_PANIC", false),
		InjectDBTimeout: getEnvBool("INJECT_DB_TIMEOUT", false),
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvFloat(key string, defaultVal float64) float64 {
	if val := os.Getenv(key); val != "" {
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		return val == "true" || val == "1"
	}
	return defaultVal
}

func (app *App) initDB() error {
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		app.config.PostgresHost, app.config.PostgresPort, app.config.PostgresUser, app.config.PostgresPass, app.config.PostgresDB)
	
	var err error
	for i := 0; i < 30; i++ {
		app.db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = app.db.Ping()
			if err == nil {
				break
			}
		}
		app.log("warn", "Waiting for database...", map[string]interface{}{"attempt": i + 1})
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	app.db.SetMaxOpenConns(app.config.DBPoolSize)
	app.db.SetMaxIdleConns(app.config.DBPoolSize / 2)

	// Create tables
	_, err = app.db.Exec(`
		CREATE TABLE IF NOT EXISTS transactions (
			id VARCHAR(36) PRIMARY KEY,
			from_account VARCHAR(255) NOT NULL,
			to_account VARCHAR(255) NOT NULL,
			amount DECIMAL(15,2) NOT NULL,
			description TEXT,
			status VARCHAR(50) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	app.log("info", "Database initialized", nil)
	return nil
}

func (app *App) initRedis() error {
	app.redisClient = redis.NewClient(&redis.Options{
		Addr: fmt.Sprintf("%s:%s", app.config.RedisHost, app.config.RedisPort),
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for i := 0; i < 30; i++ {
		_, err := app.redisClient.Ping(ctx).Result()
		if err == nil {
			app.log("info", "Redis connected", nil)
			return nil
		}
		app.log("warn", "Waiting for Redis...", map[string]interface{}{"attempt": i + 1})
		time.Sleep(2 * time.Second)
	}

	app.log("warn", "Redis not available, continuing without cache", nil)
	return nil
}

func (app *App) bugInjectionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Latency injection
		if app.config.InjectLatencyMs > 0 {
			time.Sleep(time.Duration(app.config.InjectLatencyMs) * time.Millisecond)
		}

		// Error rate injection
		if app.config.InjectErrorRate > 0 && rand.Float64() < app.config.InjectErrorRate {
			app.log("error", "Injected error occurred", map[string]interface{}{
				"error_rate": app.config.InjectErrorRate,
			})
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Simulated error"})
			c.Abort()
			return
		}

		// Panic injection
		if app.config.InjectPanic && rand.Float64() < 0.1 {
			app.log("error", "Panic injection triggered", nil)
			panic("Injected panic!")
		}

		c.Next()
	}
}

func (app *App) metricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestsInFlight.Inc()
		start := time.Now()

		c.Next()

		duration := time.Since(start).Seconds()
		transactionDuration.WithLabelValues(c.Request.URL.Path).Observe(duration)
		requestsInFlight.Dec()
	}
}

func (app *App) startOOMSimulation() {
	if !app.config.InjectOOM {
		return
	}
	app.log("warn", "OOM simulation enabled - bounded memory growth", nil)
	go func() {
		maxChunks := 10
		for {
			app.mu.Lock()
			if len(app.memoryLeak) >= maxChunks {
				app.mu.Unlock()
				app.log("warn", "OOM simulation at max chunks", map[string]interface{}{
					"chunks":  len(app.memoryLeak),
					"size_mb": len(app.memoryLeak) * 10,
				})
				time.Sleep(5 * time.Second)
				continue
			}
			chunk := make([]byte, 10*1024*1024)
			for i := range chunk {
				chunk[i] = byte(i % 256)
			}
			app.memoryLeak = append(app.memoryLeak, chunk)
			app.mu.Unlock()
			app.log("warn", "Memory allocated", map[string]interface{}{
				"chunks": len(app.memoryLeak),
				"size_mb": len(app.memoryLeak) * 10,
			})
			time.Sleep(5 * time.Second)
		}
	}()
}

func (app *App) startBuggyCacheWarmup() {
	if !app.config.FeatureNewCache {
		return
	}

	app.log("warn", "New cache enabled - warming cache (bounded)", map[string]interface{}{
		"cache_max_size": app.config.CacheMaxSize,
	})

	go func() {
		maxChunks := 10
		for {
			app.mu.Lock()
			if len(app.memoryLeak) >= maxChunks {
				app.mu.Unlock()
				app.log("warn", "Cache warmup at max chunks", map[string]interface{}{
					"chunks":  len(app.memoryLeak),
					"size_mb": len(app.memoryLeak) * 10,
				})
				time.Sleep(5 * time.Second)
				continue
			}
			chunk := make([]byte, 10*1024*1024)
			for i := range chunk {
				chunk[i] = byte(i % 256)
			}
			app.memoryLeak = append(app.memoryLeak, chunk)
			app.mu.Unlock()

			app.log("warn", "Cache warmup allocated", map[string]interface{}{
				"chunks":  len(app.memoryLeak),
				"size_mb": len(app.memoryLeak) * 10,
			})
			time.Sleep(5 * time.Second)
		}
	}()
}

func (app *App) startCPUBurn() {
	if !app.config.InjectCPUBurn {
		return
	}
	app.log("warn", "CPU burn simulation enabled", nil)
	go func() {
		for {
			// Busy loop
			for i := 0; i < 1000000000; i++ {
				_ = i * i
			}
		}
	}()
}

func (app *App) updateMetrics() {
	go func() {
		for {
			var m runtime.MemStats
			runtime.ReadMemStats(&m)
			memoryUsedBytes.Set(float64(m.Alloc))

			if app.db != nil {
				stats := app.db.Stats()
				dbConnectionsActive.Set(float64(stats.InUse))
			}

			total := app.cacheHits + app.cacheMisses
			if total > 0 {
				cacheHitRatio.Set(float64(app.cacheHits) / float64(total))
			}

			time.Sleep(5 * time.Second)
		}
	}()
}

// Handlers

func (app *App) healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "version": "1.0.0"})
}

func (app *App) readinessHandler(c *gin.Context) {
	if app.db != nil {
		if err := app.db.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready", "error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (app *App) getStatsHandler(c *gin.Context) {
	var totalRevenue float64
	var totalTransactions int
	var successfulTransactions int

	if app.db != nil {
		app.db.QueryRow("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'success'").Scan(&totalRevenue)
		app.db.QueryRow("SELECT COUNT(*) FROM transactions").Scan(&totalTransactions)
		app.db.QueryRow("SELECT COUNT(*) FROM transactions WHERE status = 'success'").Scan(&successfulTransactions)
	}

	successRate := float64(0)
	if totalTransactions > 0 {
		successRate = float64(successfulTransactions) / float64(totalTransactions) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"revenue":      totalRevenue,
		"transactions": totalTransactions,
		"success_rate": successRate,
		"avg_latency":  45, // Mock for now
	})
}

func (app *App) getTransactionsHandler(c *gin.Context) {
	if app.db == nil {
		c.JSON(http.StatusOK, []Transaction{})
		return
	}

	// DB timeout injection
	if app.config.InjectDBTimeout {
		time.Sleep(30 * time.Second)
	}

	rows, err := app.db.Query(`
		SELECT id, from_account, to_account, amount, description, status, created_at 
		FROM transactions 
		ORDER BY created_at DESC 
		LIMIT 50
	`)
	if err != nil {
		app.log("error", "Failed to fetch transactions", map[string]interface{}{"error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(&t.ID, &t.FromAccount, &t.ToAccount, &t.Amount, &t.Description, &t.Status, &t.CreatedAt); err != nil {
			continue
		}
		transactions = append(transactions, t)
	}

	if transactions == nil {
		transactions = []Transaction{}
	}

	c.JSON(http.StatusOK, transactions)
}

func (app *App) createTransactionHandler(c *gin.Context) {
	var req struct {
		FromAccount string  `json:"from_account" binding:"required"`
		ToAccount   string  `json:"to_account" binding:"required"`
		Amount      float64 `json:"amount" binding:"required,gt=0"`
		Description string  `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Simulate processing
	status := "success"
	if rand.Float64() < 0.05 { // 5% natural failure rate
		status = "failed"
		transactionsTotal.WithLabelValues("failed").Inc()
		app.log("error", "Transaction failed: insufficient funds", map[string]interface{}{
			"from_account": req.FromAccount,
			"amount":       req.Amount,
			"error_code":   "INSUFFICIENT_FUNDS",
		})
	} else {
		transactionsTotal.WithLabelValues("success").Inc()
	}

	txn := Transaction{
		ID:          uuid.New().String(),
		FromAccount: req.FromAccount,
		ToAccount:   req.ToAccount,
		Amount:      req.Amount,
		Description: req.Description,
		Status:      status,
		CreatedAt:   time.Now(),
	}

	if app.db != nil {
		_, err := app.db.Exec(`
			INSERT INTO transactions (id, from_account, to_account, amount, description, status, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, txn.ID, txn.FromAccount, txn.ToAccount, txn.Amount, txn.Description, txn.Status, txn.CreatedAt)
		if err != nil {
			app.log("error", "Failed to save transaction", map[string]interface{}{"error": err.Error()})
		}
	}

	app.log("info", "Transaction processed", map[string]interface{}{
		"transaction_id": txn.ID,
		"amount":         txn.Amount,
		"status":         txn.Status,
	})

	c.JSON(http.StatusCreated, txn)
}

func (app *App) getConfigHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"cache_max_size":    app.config.CacheMaxSize,
		"cache_ttl":         app.config.CacheTTL,
		"db_pool_size":      app.config.DBPoolSize,
		"rate_limit_rps":    app.config.RateLimitRPS,
		"log_level":         app.config.LogLevel,
		"feature_new_cache": app.config.FeatureNewCache,
		"bug_injection": gin.H{
			"oom":        app.config.InjectOOM,
			"latency_ms": app.config.InjectLatencyMs,
			"error_rate": app.config.InjectErrorRate,
			"cpu_burn":   app.config.InjectCPUBurn,
			"panic":      app.config.InjectPanic,
			"db_timeout": app.config.InjectDBTimeout,
		},
	})
}

func main() {
	rand.Seed(time.Now().UnixNano())

	// Register metrics
	prometheus.MustRegister(transactionsTotal)
	prometheus.MustRegister(transactionDuration)
	prometheus.MustRegister(cacheHitRatio)
	prometheus.MustRegister(dbConnectionsActive)
	prometheus.MustRegister(memoryUsedBytes)
	prometheus.MustRegister(requestsInFlight)

	config := loadConfig()
	app := &App{config: config}

	app.log("info", "Starting PayFlow API", map[string]interface{}{
		"version":     "1.0.0",
		"port":        config.Port,
		"log_level":   config.LogLevel,
		"oom_enabled": config.InjectOOM,
	})

	// Initialize connections
	if err := app.initDB(); err != nil {
		app.log("error", "Database initialization failed", map[string]interface{}{"error": err.Error()})
	}
	if err := app.initRedis(); err != nil {
		app.log("warn", "Redis initialization failed", map[string]interface{}{"error": err.Error()})
	}

	// Start bug injections
	app.startOOMSimulation()
	app.startBuggyCacheWarmup()
	app.startCPUBurn()
	app.updateMetrics()

	// Setup Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))
	r.Use(app.metricsMiddleware())
	r.Use(app.bugInjectionMiddleware())

	// Routes
	r.GET("/health", app.healthHandler)
	r.GET("/ready", app.readinessHandler)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api")
	{
		api.GET("/stats", app.getStatsHandler)
		api.GET("/transactions", app.getTransactionsHandler)
		api.POST("/transactions", app.createTransactionHandler)
		api.GET("/config", app.getConfigHandler)
	}

	// Graceful shutdown
	srv := &http.Server{
		Addr:    ":" + config.Port,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	app.log("info", "Shutting down server...", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}
	app.log("info", "Server exited", nil)
}

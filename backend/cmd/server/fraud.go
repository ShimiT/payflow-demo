package main

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// FraudAlert represents a fraud detection alert
type FraudAlert struct {
	ID            string    `json:"id"`
	TransactionID string    `json:"transaction_id"`
	RuleTriggered string    `json:"rule_triggered"`
	RiskScore     int       `json:"risk_score"`
	Severity      string    `json:"severity"`
	Details       string    `json:"details"`
	CreatedAt     time.Time `json:"created_at"`
}

// FraudDetector handles fraud detection logic
type FraudDetector struct {
	db                    *sql.DB
	enabled               bool
	highAmountThreshold   float64
	velocityLimit         int
	velocityWindowSeconds int
}

// NewFraudDetector creates a new fraud detector
func NewFraudDetector(db *sql.DB, config *Config) *FraudDetector {
	return &FraudDetector{
		db:                    db,
		enabled:               getEnvBool("FRAUD_DETECTION_ENABLED", true),
		highAmountThreshold:   getEnvFloat("FRAUD_HIGH_AMOUNT_THRESHOLD", 5000.0),
		velocityLimit:         getEnvInt("FRAUD_VELOCITY_LIMIT", 3),
		velocityWindowSeconds: getEnvInt("FRAUD_VELOCITY_WINDOW", 60),
	}
}

// AnalyzeTransaction analyzes a transaction for fraud
func (fd *FraudDetector) AnalyzeTransaction(txn *Transaction) error {
	if !fd.enabled || fd.db == nil {
		return nil
	}

	var alerts []FraudAlert
	totalRiskScore := 0

	// Rule 1: High Amount Detection
	if alert := fd.checkHighAmount(txn); alert != nil {
		alerts = append(alerts, *alert)
		totalRiskScore += alert.RiskScore
	}

	// Rule 2: Velocity Check
	if alert := fd.checkVelocity(txn); alert != nil {
		alerts = append(alerts, *alert)
		totalRiskScore += alert.RiskScore
	}

	// Rule 3: Duplicate Transaction Check
	if alert := fd.checkDuplicate(txn); alert != nil {
		alerts = append(alerts, *alert)
		totalRiskScore += alert.RiskScore
	}

	// Rule 4: Suspicious Pattern (Round amounts)
	if alert := fd.checkSuspiciousPattern(txn); alert != nil {
		alerts = append(alerts, *alert)
		totalRiskScore += alert.RiskScore
	}

	// Save all alerts to database
	for _, alert := range alerts {
		if err := fd.saveAlert(&alert); err != nil {
			return fmt.Errorf("failed to save fraud alert: %w", err)
		}
	}

	// Update transaction with fraud flag if any alerts
	if len(alerts) > 0 {
		_, err := fd.db.Exec(`
			UPDATE transactions 
			SET status = CASE 
				WHEN $2 >= 80 THEN 'blocked'
				ELSE status 
			END
			WHERE id = $1
		`, txn.ID, totalRiskScore)
		if err != nil {
			return fmt.Errorf("failed to update transaction fraud status: %w", err)
		}
	}

	return nil
}

// checkHighAmount detects high-value transactions
func (fd *FraudDetector) checkHighAmount(txn *Transaction) *FraudAlert {
	if txn.Amount > fd.highAmountThreshold {
		severity := "medium"
		riskScore := 30
		
		if txn.Amount > fd.highAmountThreshold*2 {
			severity = "high"
			riskScore = 50
		}
		
		if txn.Amount > fd.highAmountThreshold*5 {
			severity = "critical"
			riskScore = 80
		}

		return &FraudAlert{
			ID:            uuid.New().String(),
			TransactionID: txn.ID,
			RuleTriggered: "HIGH_AMOUNT",
			RiskScore:     riskScore,
			Severity:      severity,
			Details:       fmt.Sprintf("Transaction amount $%.2f exceeds threshold $%.2f", txn.Amount, fd.highAmountThreshold),
			CreatedAt:     time.Now(),
		}
	}
	return nil
}

// checkVelocity detects rapid transactions from same account
func (fd *FraudDetector) checkVelocity(txn *Transaction) *FraudAlert {
	var count int
	cutoffTime := time.Now().Add(-time.Duration(fd.velocityWindowSeconds) * time.Second)
	
	err := fd.db.QueryRow(`
		SELECT COUNT(*) 
		FROM transactions 
		WHERE from_account = $1 
		AND created_at > $2
		AND id != $3
	`, txn.FromAccount, cutoffTime, txn.ID).Scan(&count)
	
	if err != nil {
		return nil
	}

	if count >= fd.velocityLimit {
		severity := "medium"
		riskScore := 40
		
		if count >= fd.velocityLimit*2 {
			severity = "high"
			riskScore = 70
		}

		return &FraudAlert{
			ID:            uuid.New().String(),
			TransactionID: txn.ID,
			RuleTriggered: "VELOCITY_CHECK",
			RiskScore:     riskScore,
			Severity:      severity,
			Details:       fmt.Sprintf("Account %s made %d transactions in %d seconds", txn.FromAccount, count+1, fd.velocityWindowSeconds),
			CreatedAt:     time.Now(),
		}
	}
	return nil
}

// checkDuplicate detects duplicate transactions
func (fd *FraudDetector) checkDuplicate(txn *Transaction) *FraudAlert {
	var existingID string
	cutoffTime := time.Now().Add(-5 * time.Minute)
	
	err := fd.db.QueryRow(`
		SELECT id 
		FROM transactions 
		WHERE from_account = $1 
		AND to_account = $2 
		AND amount = $3 
		AND created_at > $4
		AND id != $5
		LIMIT 1
	`, txn.FromAccount, txn.ToAccount, txn.Amount, cutoffTime, txn.ID).Scan(&existingID)
	
	if err == nil {
		return &FraudAlert{
			ID:            uuid.New().String(),
			TransactionID: txn.ID,
			RuleTriggered: "DUPLICATE_TRANSACTION",
			RiskScore:     60,
			Severity:      "high",
			Details:       fmt.Sprintf("Duplicate transaction detected: same amount $%.2f to %s within 5 minutes", txn.Amount, txn.ToAccount),
			CreatedAt:     time.Now(),
		}
	}
	return nil
}

// checkSuspiciousPattern detects suspicious round amounts
func (fd *FraudDetector) checkSuspiciousPattern(txn *Transaction) *FraudAlert {
	// Check if amount is a round number over $1000
	if txn.Amount >= 1000 && int(txn.Amount)%1000 == 0 {
		return &FraudAlert{
			ID:            uuid.New().String(),
			TransactionID: txn.ID,
			RuleTriggered: "SUSPICIOUS_PATTERN",
			RiskScore:     25,
			Severity:      "low",
			Details:       fmt.Sprintf("Suspicious round amount: $%.2f", txn.Amount),
			CreatedAt:     time.Now(),
		}
	}
	return nil
}

// saveAlert saves a fraud alert to the database
func (fd *FraudDetector) saveAlert(alert *FraudAlert) error {
	_, err := fd.db.Exec(`
		INSERT INTO fraud_alerts (id, transaction_id, rule_triggered, risk_score, severity, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, alert.ID, alert.TransactionID, alert.RuleTriggered, alert.RiskScore, alert.Severity, alert.Details, alert.CreatedAt)
	
	return err
}

// InitFraudTables creates the fraud_alerts table
func InitFraudTables(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS fraud_alerts (
			id VARCHAR(36) PRIMARY KEY,
			transaction_id VARCHAR(36) NOT NULL,
			rule_triggered VARCHAR(100) NOT NULL,
			risk_score INTEGER NOT NULL,
			severity VARCHAR(20) NOT NULL,
			details TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		
		CREATE INDEX IF NOT EXISTS idx_fraud_alerts_transaction_id ON fraud_alerts(transaction_id);
		CREATE INDEX IF NOT EXISTS idx_fraud_alerts_severity ON fraud_alerts(severity);
		CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created_at ON fraud_alerts(created_at DESC);
	`)
	return err
}

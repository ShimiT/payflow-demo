import postgres from 'postgres';

// Database connection configuration
const DB_CONFIG = {
  host: import.meta.env.VITE_DB_HOST || 'localhost',
  port: parseInt(import.meta.env.VITE_DB_PORT || '5432'),
  database: import.meta.env.VITE_DB_NAME || 'payflow',
  username: import.meta.env.VITE_DB_USER || 'payflow',
  password: import.meta.env.VITE_DB_PASSWORD || 'payflow',
};

// Create PostgreSQL connection
let sql: ReturnType<typeof postgres> | null = null;

export function getDbConnection() {
  if (!sql) {
    try {
      sql = postgres({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        database: DB_CONFIG.database,
        username: DB_CONFIG.username,
        password: DB_CONFIG.password,
        max: 5, // Maximum 5 connections from frontend
        idle_timeout: 20,
        connect_timeout: 10,
      });
      console.log('✅ Direct PostgreSQL connection established');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }
  return sql;
}

// Fraud Alert interface
export interface FraudAlert {
  id: string;
  transaction_id: string;
  rule_triggered: string;
  risk_score: number;
  severity: string;
  details: string;
  created_at: Date;
}

// Fraud statistics interface
export interface FraudStats {
  total_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
  avg_risk_score: number;
}

// Fetch fraud alerts directly from database
export async function fetchFraudAlerts(limit: number = 50): Promise<FraudAlert[]> {
  try {
    const db = getDbConnection();
    const alerts = await db<FraudAlert[]>`
      SELECT 
        id,
        transaction_id,
        rule_triggered,
        risk_score,
        severity,
        details,
        created_at
      FROM fraud_alerts
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return alerts;
  } catch (error) {
    console.error('Failed to fetch fraud alerts:', error);
    throw error;
  }
}

// Fetch fraud alerts by severity
export async function fetchFraudAlertsBySeverity(severity: string): Promise<FraudAlert[]> {
  try {
    const db = getDbConnection();
    const alerts = await db<FraudAlert[]>`
      SELECT 
        id,
        transaction_id,
        rule_triggered,
        risk_score,
        severity,
        details,
        created_at
      FROM fraud_alerts
      WHERE severity = ${severity}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return alerts;
  } catch (error) {
    console.error('Failed to fetch fraud alerts by severity:', error);
    throw error;
  }
}

// Fetch fraud statistics
export async function fetchFraudStats(): Promise<FraudStats> {
  try {
    const db = getDbConnection();
    const result = await db`
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_alerts,
        COUNT(*) FILTER (WHERE severity = 'high') as high_alerts,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium_alerts,
        COUNT(*) FILTER (WHERE severity = 'low') as low_alerts,
        COALESCE(AVG(risk_score), 0) as avg_risk_score
      FROM fraud_alerts
    `;
    
    return {
      total_alerts: Number(result[0].total_alerts),
      critical_alerts: Number(result[0].critical_alerts),
      high_alerts: Number(result[0].high_alerts),
      medium_alerts: Number(result[0].medium_alerts),
      low_alerts: Number(result[0].low_alerts),
      avg_risk_score: Number(result[0].avg_risk_score),
    };
  } catch (error) {
    console.error('Failed to fetch fraud stats:', error);
    throw error;
  }
}

// Fetch fraud alerts for a specific transaction
export async function fetchFraudAlertsByTransaction(transactionId: string): Promise<FraudAlert[]> {
  try {
    const db = getDbConnection();
    const alerts = await db<FraudAlert[]>`
      SELECT 
        id,
        transaction_id,
        rule_triggered,
        risk_score,
        severity,
        details,
        created_at
      FROM fraud_alerts
      WHERE transaction_id = ${transactionId}
      ORDER BY created_at DESC
    `;
    return alerts;
  } catch (error) {
    console.error('Failed to fetch fraud alerts by transaction:', error);
    throw error;
  }
}

// Close database connection
export function closeDbConnection() {
  if (sql) {
    sql.end();
    sql = null;
    console.log('PostgreSQL connection closed');
  }
}

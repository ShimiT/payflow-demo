import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  TrendingUp,
  Activity,
  Database,
  XCircle,
} from 'lucide-react';
import {
  fetchFraudAlerts,
  fetchFraudStats,
  fetchFraudAlertsBySeverity,
  type FraudAlert,
  type FraudStats,
} from '../lib/db';

export default function FraudDetection() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);
      const [alertsData, statsData] = await Promise.all([
        filter === 'all' ? fetchFraudAlerts(50) : fetchFraudAlertsBySeverity(filter),
        fetchFraudStats(),
      ]);
      setAlerts(alertsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load fraud data:', err);
      setError('Failed to connect to database. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, filter]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'from-red-500 to-red-600';
      case 'high':
        return 'from-orange-500 to-orange-600';
      case 'medium':
        return 'from-yellow-500 to-yellow-600';
      case 'low':
        return 'from-blue-500 to-blue-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-5 h-5" />;
      case 'high':
        return <AlertTriangle className="w-5 h-5" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5" />;
      case 'low':
        return <Info className="w-5 h-5" />;
      default:
        return <Shield className="w-5 h-5" />;
    }
  };

  const getRuleName = (rule: string) => {
    const ruleNames: Record<string, string> = {
      HIGH_AMOUNT: 'High Amount',
      VELOCITY_CHECK: 'Velocity Check',
      DUPLICATE_TRANSACTION: 'Duplicate Transaction',
      SUSPICIOUS_PATTERN: 'Suspicious Pattern',
    };
    return ruleNames[rule] || rule;
  };

  const formatTime = (dateString: Date) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        <span className="ml-3 text-gray-400">Loading fraud detection data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-lg font-semibold text-red-400">Connection Error</h3>
            <p className="text-red-300 mt-1">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Fraud Detection</h2>
            <p className="text-sm text-gray-400">Real-time fraud monitoring via direct DB access</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg transition ${
              autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
            }`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button
            onClick={loadData}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <Database className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Direct Database Connection Active</p>
            <p className="text-yellow-300/80 text-sm mt-1">
              ⚠️ This feature bypasses the backend API and connects directly to PostgreSQL from the browser.
              This is an anti-pattern for demo purposes only.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Total Alerts"
            value={stats.total_alerts.toString()}
            icon={<Shield className="w-5 h-5" />}
            color="from-purple-500 to-purple-600"
          />
          <StatCard
            title="Critical"
            value={stats.critical_alerts.toString()}
            icon={<XCircle className="w-5 h-5" />}
            color="from-red-500 to-red-600"
          />
          <StatCard
            title="High"
            value={stats.high_alerts.toString()}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="from-orange-500 to-orange-600"
          />
          <StatCard
            title="Medium"
            value={stats.medium_alerts.toString()}
            icon={<AlertCircle className="w-5 h-5" />}
            color="from-yellow-500 to-yellow-600"
          />
          <StatCard
            title="Low"
            value={stats.low_alerts.toString()}
            icon={<Info className="w-5 h-5" />}
            color="from-blue-500 to-blue-600"
          />
          <StatCard
            title="Avg Risk"
            value={stats.avg_risk_score.toFixed(0)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="from-cyan-500 to-cyan-600"
          />
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex space-x-2">
        {['all', 'critical', 'high', 'medium', 'low'].map((severity) => (
          <button
            key={severity}
            onClick={() => setFilter(severity as typeof filter)}
            className={`px-4 py-2 rounded-lg transition capitalize ${
              filter === severity
                ? 'bg-purple-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {severity}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">
          Fraud Alerts {filter !== 'all' && `(${filter})`}
        </h3>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">No fraud alerts found</p>
              <p className="text-gray-600 text-sm mt-1">
                Create high-value transactions to trigger fraud detection
              </p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="flex items-start space-x-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getSeverityColor(
                      alert.severity
                    )} flex items-center justify-center flex-shrink-0`}
                  >
                    {getSeverityIcon(alert.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium">{getRuleName(alert.rule_triggered)}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                          alert.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : alert.severity === 'high'
                            ? 'bg-orange-500/20 text-orange-400'
                            : alert.severity === 'medium'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mb-1">{alert.details}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>TX: {alert.transaction_id.slice(0, 8)}</span>
                      <span>Alert: {alert.id.slice(0, 8)}</span>
                      <span>{formatTime(alert.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold">{alert.risk_score}</div>
                  <div className="text-xs text-gray-500">Risk Score</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-xs">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

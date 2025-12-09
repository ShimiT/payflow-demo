import { useState, useEffect, useCallback } from 'react';
import { 
  DollarSign, 
  CreditCard, 
  TrendingUp, 
  Clock, 
  Settings as SettingsIcon,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Activity
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Transaction {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
}

interface Stats {
  revenue: number;
  transactions: number;
  success_rate: number;
  avg_latency: number;
}

interface Config {
  cache_max_size: string;
  cache_ttl: number;
  db_pool_size: number;
  rate_limit_rps: number;
  log_level: string;
  feature_new_cache: boolean;
  bug_injection: {
    oom: boolean;
    latency_ms: number;
    error_rate: number;
    cpu_burn: boolean;
    panic: boolean;
    db_timeout: boolean;
  };
}

const API_BASE = '/api';

function App() {
  const [page, setPage] = useState<'dashboard' | 'payment' | 'settings'>('dashboard');
  const [stats, setStats] = useState<Stats>({ revenue: 0, transactions: 0, success_rate: 0, avg_latency: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<{ time: string; value: number }[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/transactions`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchTransactions();
    fetchConfig();

    // Generate mock chart data
    const data = [];
    for (let i = 23; i >= 0; i--) {
      data.push({
        time: `${i}h ago`,
        value: Math.floor(Math.random() * 100) + 50,
      });
    }
    setChartData(data.reverse());

    // Auto refresh
    const interval = setInterval(() => {
      fetchStats();
      fetchTransactions();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchTransactions, fetchConfig]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                PayFlow
              </span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded-full text-gray-400">v1.0.0</span>
            </div>
            <nav className="flex space-x-1">
              <button
                onClick={() => setPage('dashboard')}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition ${
                  page === 'dashboard' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => setPage('payment')}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition ${
                  page === 'payment' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Payment</span>
              </button>
              <button
                onClick={() => setPage('settings')}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition ${
                  page === 'settings' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {page === 'dashboard' && (
          <Dashboard 
            stats={stats} 
            transactions={transactions} 
            chartData={chartData}
            formatCurrency={formatCurrency}
            formatTime={formatTime}
            onRefresh={() => { fetchStats(); fetchTransactions(); }}
          />
        )}
        {page === 'payment' && (
          <PaymentForm 
            onSuccess={() => { fetchStats(); fetchTransactions(); }}
            loading={loading}
            setLoading={setLoading}
          />
        )}
        {page === 'settings' && (
          <SettingsPage config={config} onRefresh={fetchConfig} />
        )}
      </main>
    </div>
  );
}

interface DashboardProps {
  stats: Stats;
  transactions: Transaction[];
  chartData: { time: string; value: number }[];
  formatCurrency: (amount: number) => string;
  formatTime: (dateString: string) => string;
  onRefresh: () => void;
}

function Dashboard({ stats, transactions, chartData, formatCurrency, formatTime, onRefresh }: DashboardProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Revenue"
          value={formatCurrency(stats.revenue)}
          icon={<DollarSign className="w-5 h-5" />}
          color="from-green-500 to-emerald-600"
        />
        <StatCard
          title="Transactions"
          value={stats.transactions.toLocaleString()}
          icon={<CreditCard className="w-5 h-5" />}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.success_rate.toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="from-purple-500 to-pink-600"
        />
        <StatCard
          title="Avg Latency"
          value={`${stats.avg_latency}ms`}
          icon={<Clock className="w-5 h-5" />}
          color="from-orange-500 to-red-600"
        />
      </div>

      {/* Chart */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Transaction Volume</h2>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No transactions yet</p>
          ) : (
            transactions.slice(0, 10).map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  {txn.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium">Payment #{txn.id.slice(0, 8)}</p>
                    <p className="text-sm text-gray-400">
                      {txn.from_account} → {txn.to_account}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(txn.amount)}</p>
                  <p className="text-sm text-gray-400">{formatTime(txn.created_at)}</p>
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
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface PaymentFormProps {
  onSuccess: () => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

function PaymentForm({ onSuccess, loading, setLoading }: PaymentFormProps) {
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account: fromAccount,
          to_account: toAccount,
          amount: parseFloat(amount),
          description,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: data.status === 'success' ? 'success' : 'error',
          text: data.status === 'success' 
            ? `Payment processed successfully! ID: ${data.id.slice(0, 8)}`
            : `Payment failed: ${data.id.slice(0, 8)}`,
        });
        if (data.status === 'success') {
          setFromAccount('');
          setToAccount('');
          setAmount('');
          setDescription('');
        }
        onSuccess();
      } else {
        setMessage({ type: 'error', text: data.error || 'Payment failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const accounts = [
    'ACC-1001 (Checking)',
    'ACC-1002 (Savings)',
    'ACC-1003 (Business)',
    'ACC-1004 (Investment)',
  ];

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
        <h2 className="text-2xl font-bold mb-6">New Payment</h2>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              From Account
            </label>
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select account</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              To Account
            </label>
            <input
              type="text"
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              placeholder="Enter recipient account"
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Payment description (optional)"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => {
                setFromAccount('');
                setToAccount('');
                setAmount('');
                setDescription('');
                setMessage(null);
              }}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-lg transition font-medium disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Process Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SettingsPageProps {
  config: Config | null;
  onRefresh: () => void;
}

function SettingsPage({ config, onRefresh }: SettingsPageProps) {
  if (!config) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-500" />
        <p className="mt-4 text-gray-400">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Demo Settings</h2>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-gray-700 rounded-lg transition"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Bug Injection */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4 text-red-400">Bug Injection</h3>
        <p className="text-sm text-gray-400 mb-4">
          These settings are controlled via environment variables/ConfigMap.
        </p>
        <div className="space-y-3">
          <SettingRow
            label="OOM Simulation"
            value={config.bug_injection.oom ? 'Enabled' : 'Disabled'}
            status={config.bug_injection.oom ? 'danger' : 'ok'}
          />
          <SettingRow
            label="Latency Injection"
            value={config.bug_injection.latency_ms > 0 ? `${config.bug_injection.latency_ms}ms` : 'Disabled'}
            status={config.bug_injection.latency_ms > 0 ? 'warning' : 'ok'}
          />
          <SettingRow
            label="Error Rate"
            value={config.bug_injection.error_rate > 0 ? `${(config.bug_injection.error_rate * 100).toFixed(0)}%` : 'Disabled'}
            status={config.bug_injection.error_rate > 0 ? 'warning' : 'ok'}
          />
          <SettingRow
            label="CPU Burn"
            value={config.bug_injection.cpu_burn ? 'Enabled' : 'Disabled'}
            status={config.bug_injection.cpu_burn ? 'danger' : 'ok'}
          />
          <SettingRow
            label="Panic Injection"
            value={config.bug_injection.panic ? 'Enabled' : 'Disabled'}
            status={config.bug_injection.panic ? 'danger' : 'ok'}
          />
          <SettingRow
            label="DB Timeout"
            value={config.bug_injection.db_timeout ? 'Enabled' : 'Disabled'}
            status={config.bug_injection.db_timeout ? 'danger' : 'ok'}
          />
        </div>
      </div>

      {/* Cache Settings */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Cache Settings</h3>
        <div className="space-y-3">
          <SettingRow label="Max Size" value={config.cache_max_size} />
          <SettingRow label="TTL" value={`${config.cache_ttl}s`} />
          <SettingRow
            label="New Cache Feature"
            value={config.feature_new_cache ? 'Enabled' : 'Disabled'}
            status={config.feature_new_cache ? 'warning' : 'ok'}
          />
        </div>
      </div>

      {/* Database Settings */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Database Settings</h3>
        <div className="space-y-3">
          <SettingRow label="Pool Size" value={config.db_pool_size.toString()} />
          <SettingRow label="Rate Limit" value={`${config.rate_limit_rps} RPS`} />
          <SettingRow label="Log Level" value={config.log_level} />
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <p className="text-yellow-400 text-sm">
          <strong>Note:</strong> To modify these settings, update the ConfigMap and restart the deployment:
        </p>
        <pre className="mt-2 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">
          kubectl edit configmap payflow-config -n demo
        </pre>
      </div>
    </div>
  );
}

interface SettingRowProps {
  label: string;
  value: string;
  status?: 'ok' | 'warning' | 'danger';
}

function SettingRow({ label, value, status = 'ok' }: SettingRowProps) {
  const statusColors = {
    ok: 'text-gray-300',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
  };

  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono ${statusColors[status]}`}>{value}</span>
    </div>
  );
}

export default App;

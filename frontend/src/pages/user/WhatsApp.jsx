import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { waApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSSE } from '../../hooks/useSSE';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';

export default function WhatsApp() {
  const { user, updateUser } = useAuth();
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState(user?.wa_status || 'disconnected');
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [pollInterval, setPollInterval] = useState(null);

  const syncStatus = useCallback(async () => {
    try {
      const res = await waApi.status();
      setStatus(res.data.status);
      setQr(res.data.qr);
      updateUser({ wa_status: res.data.status });
    } catch {}
  }, [updateUser]);

  useSSE('/api/sse/user', {
    events: {
      wa_status: (data) => {
        setStatus(data.status);
        if (data.qr) setQr(data.qr);
        if (data.status === 'connected') setQr(null);
        updateUser({ wa_status: data.status });
      },
      snapshot: (data) => {
        setStatus(data.wa_status);
        if (data.qr) setQr(data.qr);
        updateUser({ wa_status: data.wa_status, credits: data.credits });
      },
    },
    onPoll: syncStatus,
  });

  useEffect(() => {
    syncStatus();
  }, [syncStatus]);

  // Poll every 3s while connecting or waiting for QR
  useEffect(() => {
    if (status === 'qr_ready' || status === 'connecting') {
      const interval = setInterval(syncStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [status, syncStatus]);

  const handleConnect = async () => {
    setError('');
    setLoading(true);
    try {
      await waApi.connect();
      setStatus('connecting');
      updateUser({ wa_status: 'connecting' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate connection');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await waApi.disconnect();
      setStatus('disconnected');
      setQr(null);
      updateUser({ wa_status: 'disconnected' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const statusConfigs = {
    connected: {
      icon: <CheckCircle className="w-8 h-8 text-green-500" />,
      title: 'WhatsApp Connected',
      description: 'Your WhatsApp is connected and ready to send messages.',
      bg: 'bg-green-50 border-green-200',
    },
    disconnected: {
      icon: <WifiOff className="w-8 h-8 text-surface-400" />,
      title: 'Not Connected',
      description: 'Connect your WhatsApp account to start sending campaigns.',
      bg: 'bg-surface-50 border-surface-200',
    },
    connecting: {
      icon: <Loader className="w-8 h-8 text-yellow-500 animate-spin" />,
      title: 'Connecting...',
      description: 'Establishing WhatsApp connection. Please wait.',
      bg: 'bg-yellow-50 border-yellow-200',
    },
    qr_ready: {
      icon: <Wifi className="w-8 h-8 text-blue-500" />,
      title: 'Scan QR Code',
      description: 'Open WhatsApp on your phone → Linked Devices → Link a Device',
      bg: 'bg-blue-50 border-blue-200',
    },
  };

  const cfg = statusConfigs[status] || statusConfigs.disconnected;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Status Card */}
      <Card className={`border-2 ${cfg.bg}`}>
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-0.5">{cfg.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-surface-800">{cfg.title}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-surface-500 mt-1">{cfg.description}</p>
          </div>
        </div>
      </Card>

      {error && (
        <Alert type="error" onDismiss={() => setError('')}>{error}</Alert>
      )}

      {/* QR Code */}
      {status === 'qr_ready' && qr && (
        <Card className="text-center">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Scan with WhatsApp</h3>
          <div className="inline-block p-3 bg-white rounded-2xl shadow-medium border border-surface-100">
            <img src={qr} alt="WhatsApp QR Code" className="w-52 h-52 sm:w-64 sm:h-64" />
          </div>
          <p className="text-xs text-surface-500 mt-4">
            QR code refreshes automatically. Open WhatsApp → Menu → Linked Devices → Link a Device
          </p>
          <Button
            variant="secondary" size="sm" className="mt-3"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={syncStatus}
          >
            Refresh QR
          </Button>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {(status === 'disconnected') && (
          <Button
            fullWidth size="lg" loading={loading}
            icon={<Wifi className="w-4 h-4" />}
            onClick={handleConnect}
          >
            Connect WhatsApp
          </Button>
        )}

        {status === 'connecting' && (
          <Button fullWidth size="lg" loading variant="secondary">
            Connecting...
          </Button>
        )}

        {status === 'qr_ready' && !qr && (
          <Button
            fullWidth size="lg" loading={loading}
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={syncStatus}
          >
            Get QR Code
          </Button>
        )}

        {(status === 'connected' || status === 'connecting' || status === 'qr_ready') && (
          <Button
            fullWidth size="lg" variant="secondary"
            loading={disconnecting}
            icon={<LogOut className="w-4 h-4" />}
            onClick={handleDisconnect}
          >
            Disconnect
          </Button>
        )}
      </div>

      {/* Info */}
      <Card className="bg-surface-50 border-surface-100">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">How it works</h3>
        <ol className="space-y-2">
          {[
            'Click "Connect WhatsApp" to generate a QR code',
            'Open WhatsApp on your phone',
            'Go to Menu → Linked Devices → Link a Device',
            'Scan the QR code shown here',
            'Your WhatsApp is now connected and stays connected across restarts',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-surface-600">
              <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

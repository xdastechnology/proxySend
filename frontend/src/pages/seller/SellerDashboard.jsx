import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Clock3, MessagesSquare, IndianRupee, Percent, ArrowRight } from 'lucide-react';
import { sellerApi } from '../../lib/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs text-surface-500 font-semibold uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-surface-900 mt-0.5">{value}</p>
        </div>
      </div>
    </Card>
  );
}

export default function SellerDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = `${today.slice(0, 8)}01`;

  const [stats, setStats] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ fromDate: firstDay, toDate: today });

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, salesRes] = await Promise.all([
        sellerApi.dashboard(range),
        sellerApi.salesHistory(range),
      ]);
      setStats(statsRes.data.stats);
      setSales(salesRes.data.sales || []);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" className="text-brand-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Overview</h1>
          <p className="text-sm text-surface-500 mt-1">Sales and settlement status (date-adjustable)</p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchData}>Refresh</Button>
      </div>

      <Card>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <Input
            label="From"
            type="date"
            value={range.fromDate}
            onChange={(e) => setRange((prev) => ({ ...prev, fromDate: e.target.value }))}
          />
          <Input
            label="To"
            type="date"
            value={range.toDate}
            onChange={(e) => setRange((prev) => ({ ...prev, toDate: e.target.value }))}
          />
          <Button onClick={fetchData}>Apply Date Range</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Customers"
          value={(stats?.activeCustomers || 0).toLocaleString()}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={Clock3}
          label="Pending Requests"
          value={(stats?.pendingRequests || 0).toLocaleString()}
          color="bg-yellow-100 text-yellow-700"
        />
        <StatCard
          icon={MessagesSquare}
          label="Messages Sold"
          value={(stats?.messagesSold || 0).toLocaleString()}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          icon={IndianRupee}
          label="Gross Sales"
          value={`₹${(stats?.grossSales || 0).toFixed(2)}`}
          color="bg-brand-100 text-brand-700"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Commission Split</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-surface-500">Admin commission</span>
              <span className="font-semibold text-red-600">₹{(stats?.adminCommission || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-surface-500">Your net</span>
              <span className="font-semibold text-green-600">₹{(stats?.sellerNet || 0).toFixed(2)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/seller/customers">
              <Button variant="secondary" size="sm" fullWidth iconRight={<ArrowRight className="w-3.5 h-3.5" />}>
                Customers
              </Button>
            </Link>
            <Link to="/seller/reference-codes">
              <Button variant="secondary" size="sm" fullWidth iconRight={<ArrowRight className="w-3.5 h-3.5" />}>
                Ref Codes
              </Button>
            </Link>
            <Link to="/seller/credit-requests" className="col-span-2">
              <Button size="sm" fullWidth icon={<Percent className="w-3.5 h-3.5" />}>
                Approve Credit Requests
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-surface-800 mb-3">Sales Settlement History</h3>
          {!sales.length ? (
            <p className="text-sm text-surface-500">No sale records for selected range.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
              {sales.slice(0, 40).map((s) => (
                <div key={s.id} className="p-3 bg-surface-50 rounded-xl border border-surface-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-surface-800">
                      {s.user_name} · {new Date(s.created_at).toLocaleString()}
                    </p>
                    <Badge
                      variant={s.settlement_status === 'done' ? 'green' : 'yellow'}
                      size="sm"
                      dot
                    >
                      {s.settlement_status === 'done' ? 'Settled by Admin' : 'Pending Settlement'}
                    </Badge>
                  </div>
                  <p className="text-xs text-surface-500 mt-1">
                    Messages: {Number(s.messages_sold || 0).toLocaleString()}
                    {' · '}
                    Gross: ₹{Number(s.gross_amount || 0).toFixed(2)}
                    {' · '}
                    Admin: ₹{Number(s.admin_commission_amount || 0).toFixed(2)}
                  </p>
                  {s.settlement_note && (
                    <p className="text-xs text-surface-500 mt-0.5">Admin note: {s.settlement_note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '', referenceCode: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const setField = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        const fe = {};
        data.errors.forEach((e) => { fe[e.field] = e.message; });
        setFieldErrors(fe);
      } else {
        setError(data?.error || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-medium">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900">Create account</h1>
          <p className="text-sm text-surface-500 mt-1">Join Proxy Send today</p>
        </div>

        <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
          {error && (
            <Alert type="error" className="mb-4" onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Full name" name="name" type="text"
              value={form.name} onChange={setField('name')}
              placeholder="John Doe" required
              error={fieldErrors.name}
            />
            <Input
              label="Email" name="email" type="email"
              value={form.email} onChange={setField('email')}
              placeholder="you@example.com" required
              error={fieldErrors.email}
              autoComplete="email"
            />
            <Input
              label="Phone" name="phone" type="tel"
              value={form.phone} onChange={setField('phone')}
              placeholder="9876543210" required
              error={fieldErrors.phone}
              hint="Indian numbers auto-formatted"
            />
            <Input
              label="Password" name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password} onChange={setField('password')}
              placeholder="Min 8 chars, uppercase & number" required
              error={fieldErrors.password}
              autoComplete="new-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-surface-400 hover:text-surface-600 pointer-events-auto"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Input
              label="Confirm password" name="confirmPassword"
              type="password" value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              placeholder="••••••••" required
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
            />
            <Input
              label="Reference code" name="referenceCode" type="text"
              value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
              placeholder="PROXYSEND" required
              error={fieldErrors.referenceCode}
              hint="Use an active seller reference code"
            />

            <Button type="submit" fullWidth loading={loading} size="lg" className="mt-2">
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-surface-500 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-surface-400 mt-2">
          <Link to="/seller/login" className="hover:text-surface-600">Seller login</Link>
        </p>
      </div>
    </div>
  );
}

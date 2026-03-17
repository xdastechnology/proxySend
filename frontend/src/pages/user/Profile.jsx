import React, { useState } from 'react';
import { User, Lock, CheckCircle } from 'lucide-react';
import { profileApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import Card, { CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import Badge, { StatusBadge } from '../../components/ui/Badge';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFieldErrors, setProfileFieldErrors] = useState({});

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwFieldErrors, setPwFieldErrors] = useState({});

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileFieldErrors({});
    setProfileLoading(true);
    try {
      const res = await profileApi.update(profileForm);
      updateUser(res.data.user);
      setProfileSuccess('Profile updated successfully');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        const fe = {};
        data.errors.forEach((e) => { fe[e.field] = e.message; });
        setProfileFieldErrors(fe);
      } else {
        setProfileError(data?.error || 'Failed to update profile');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    setPwFieldErrors({});
    setPwLoading(true);
    try {
      await profileApi.changePassword(pwForm);
      setPwSuccess('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        const fe = {};
        data.errors.forEach((e) => { fe[e.field] = e.message; });
        setPwFieldErrors(fe);
      } else {
        setPwError(data?.error || 'Failed to change password');
      }
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* User Header */}
      <Card className="text-center py-8">
        <div className="w-20 h-20 bg-brand-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <span className="text-brand-700 font-bold text-3xl">
            {user?.name?.[0]?.toUpperCase()}
          </span>
        </div>
        <h2 className="text-xl font-bold text-surface-800">{user?.name}</h2>
        <p className="text-sm text-surface-500 mt-1">{user?.email}</p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <StatusBadge status={user?.wa_status || 'disconnected'} />
          <Badge variant="green">{(user?.credits || 0).toLocaleString()} credits</Badge>
        </div>
        <p className="text-xs text-surface-400 mt-2">
          Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
        </p>
      </Card>

      {/* Edit Profile */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center">
            <User className="w-4 h-4 text-brand-600" />
          </div>
          <CardTitle>Edit Profile</CardTitle>
        </div>

        {profileSuccess && (
          <Alert type="success" className="mb-4" onDismiss={() => setProfileSuccess('')}>
            {profileSuccess}
          </Alert>
        )}
        {profileError && (
          <Alert type="error" className="mb-4" onDismiss={() => setProfileError('')}>
            {profileError}
          </Alert>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <Input
            label="Full name" required
            value={profileForm.name}
            onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
            error={profileFieldErrors.name}
          />
          <Input
            label="Email" type="email" required
            value={profileForm.email}
            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
            error={profileFieldErrors.email}
          />
          <Input
            label="Phone"
            value={profileForm.phone}
            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            error={profileFieldErrors.phone}
            hint="Indian numbers auto-normalized"
          />
          <Button type="submit" fullWidth loading={profileLoading}>
            Save Changes
          </Button>
        </form>
      </Card>

      {/* Change Password */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
            <Lock className="w-4 h-4 text-orange-600" />
          </div>
          <CardTitle>Change Password</CardTitle>
        </div>

        {pwSuccess && (
          <Alert type="success" className="mb-4" onDismiss={() => setPwSuccess('')}>
            {pwSuccess}
          </Alert>
        )}
        {pwError && (
          <Alert type="error" className="mb-4" onDismiss={() => setPwError('')}>
            {pwError}
          </Alert>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            label="Current password" type="password" required
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            error={pwFieldErrors.currentPassword}
            autoComplete="current-password"
          />
          <Input
            label="New password" type="password" required
            value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
            error={pwFieldErrors.newPassword}
            hint="Min 8 chars, uppercase, lowercase, number"
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password" type="password" required
            value={pwForm.confirmPassword}
            onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
            error={pwFieldErrors.confirmPassword}
            autoComplete="new-password"
          />
          <Button type="submit" fullWidth loading={pwLoading} variant="outline">
            Change Password
          </Button>
        </form>
      </Card>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  RefreshCw,
  Shield,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  Lock,
  User,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import { StaffMember } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/useToast';

interface StaffApiResponse {
  staff: StaffMember[];
}

export const StaffManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Status toggle in-flight ID
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    try {
      const data = await apiClient.get<StaffApiResponse>('/staff');
      if (data && Array.isArray(data.staff)) {
        setStaffList(data.staff);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load staff list.';
      showToast({ type: 'error', title: 'Error Loading Staff', message: msg });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStaff();
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Please provide a valid email address.');
      return;
    }
    if (!password || password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post<{ staff: StaffMember }>('/staff', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
      });

      showToast({
        type: 'success',
        title: 'Staff Member Created',
        message: `Account for ${fullName} has been successfully provisioned.`,
      });

      // Reset form
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setIsAddModalOpen(false);

      // Refresh list
      fetchStaff();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create staff account.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (staffMember: StaffMember) => {
    if (staffMember.role === 'ADMIN') {
      showToast({
        type: 'warning',
        title: 'Action Prohibited',
        message: 'The singleton Admin account cannot be deactivated.',
      });
      return;
    }

    const nextStatus = !staffMember.isActive;
    setStatusUpdatingId(staffMember.id);

    try {
      await apiClient.patch<{ staff: StaffMember }>(`/staff/${staffMember.id}/status`, {
        isActive: nextStatus,
      });

      showToast({
        type: 'success',
        title: nextStatus ? 'Staff Activated' : 'Staff Deactivated',
        message: `${staffMember.fullName} is now ${nextStatus ? 'active' : 'inactive'}.`,
      });

      // Update state locally
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffMember.id ? { ...s, isActive: nextStatus } : s))
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update account status.';
      showToast({ type: 'error', title: 'Update Failed', message: msg });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Guard for Staff users attempting to view Admin staff management
  if (user?.role !== 'ADMIN') {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <ShieldAlert size={48} style={{ color: 'var(--color-danger)', margin: '0 auto var(--space-4)' }} />
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
          Access Restricted
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: 'var(--space-2) auto' }}>
          Staff Management and credential provisioning is strictly reserved for the Administrator.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Users size={22} style={{ color: 'var(--color-brand)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              Staff Management
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            Provision operational staff accounts and manage activation status. (Singleton Admin enforced)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setFormError(null);
              setIsAddModalOpen(true);
            }}
            leftIcon={<UserPlus size={16} />}
          >
            Add Staff Member
          </Button>
        </div>
      </div>

      {/* Staff Table Card */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
            Registered Accounts ({staffList.length})
          </div>
          <Badge variant="brand">Admin Singleton Enforced</Badge>
        </div>

        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto var(--space-2)' }} />
            <p>Loading staff directory...</p>
          </div>
        ) : staffList.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ margin: '0 auto var(--space-2)', opacity: 0.5 }} />
            <p>No staff accounts found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-5)', fontSize: '11px', fontWeight: 600 }}>
                    NAME & EMAIL
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 600 }}>
                    ROLE
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 600 }}>
                    STATUS
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 600 }}>
                    PHONE
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-5)', fontSize: '11px', fontWeight: 600, textAlign: 'right' }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((member) => {
                  const isAdmin = member.role === 'ADMIN';
                  const isUpdating = statusUpdatingId === member.id;

                  return (
                    <tr
                      key={member.id}
                      style={{
                        borderTop: '1px solid var(--border-subtle)',
                        backgroundColor: member.isActive ? 'transparent' : 'var(--bg-surface-subtle)',
                      }}
                    >
                      <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {member.fullName}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {member.email}
                        </div>
                      </td>

                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <Badge variant={isAdmin ? 'brand' : 'neutral'}>
                          <Shield size={12} />
                          <span>{member.role || 'STAFF'}</span>
                        </Badge>
                      </td>

                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {member.isActive ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--color-success)',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            <CheckCircle size={14} /> Active
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            <XCircle size={14} /> Inactive
                          </span>
                        )}
                      </td>

                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {member.phone || '—'}
                      </td>

                      <td style={{ padding: 'var(--space-3) var(--space-5)', textAlign: 'right' }}>
                        {isAdmin ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                            }}
                          >
                            Singleton Admin
                          </span>
                        ) : (
                          <Button
                            variant={member.isActive ? 'outline' : 'secondary'}
                            size="sm"
                            isLoading={isUpdating}
                            onClick={() => handleToggleStatus(member)}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              height: '28px',
                            }}
                          >
                            {member.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          if (!isSubmitting) setIsAddModalOpen(false);
        }}
        title="Provision New Staff Account"
        description="Creates an operational staff account with Supabase Auth credentials. Staff role is assigned by default."
      >
        <form onSubmit={handleCreateStaff} noValidate>
          {formError && (
            <div
              role="alert"
              style={{
                padding: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger, #ef4444)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              id="staff-name"
              label="Full Name"
              required
              disabled={isSubmitting}
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              leftIcon={<User size={16} />}
            />

            <Input
              id="staff-email"
              label="Work Email"
              type="email"
              required
              disabled={isSubmitting}
              placeholder="e.g. rahul@pys.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail size={16} />}
            />

            <Input
              id="staff-password"
              label="Initial Password"
              type="password"
              required
              disabled={isSubmitting}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock size={16} />}
              helperText="Staff member will use this password to authenticate into the portal."
            />

            <Input
              id="staff-phone"
              label="Phone Number"
              type="tel"
              disabled={isSubmitting}
              placeholder="+91 9876543210 (Optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              leftIcon={<Phone size={16} />}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-2)',
              }}
            >
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Provision Staff
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

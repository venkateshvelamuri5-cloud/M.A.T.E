'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../src/supabase-client';
import { useAnalyst } from '../_lib/context';
import { logChange } from '../_lib/audit';
import { Button, Card, Chip, EmptyState, PageHeader } from '../_lib/ui';
import UserManagementTab from '../UserManagementTab';

const PROTECTED_EMAIL = 'hello@logmark-ai.com';

export default function PeoplePage() {
  const { toast, confirm } = useAnalyst();
  const [users, setUsers] = useState<any[] | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, rank, company_name, role, subscription_plan, vessel_name, vessel_type, operator_name, grt, created_at')
      .order('created_at', { ascending: false });
    if (error) toast(`Couldn't load officers: ${error.message}`, 'error');
    setUsers(data || []);
  };

  useEffect(() => { load(); }, []);

  const toggleAccess = async (user: any) => {
    const disabling = user.role !== 'disabled';
    if (disabling) {
      const ok = await confirm({
        title: `Disable ${user.full_name || user.email}?`,
        body: 'They can no longer sign in or send requests by email. You can enable them again at any time.',
        confirmLabel: 'Disable access',
        danger: true
      });
      if (!ok) return;
    }
    const { error } = await supabase.from('profiles').update({ role: disabling ? 'disabled' : 'user' }).eq('id', user.id);
    if (error) { toast(`Couldn't update ${user.email}: ${error.message}`, 'error'); return; }
    await logChange({ action: disabling ? 'user.disable' : 'user.enable', entityType: 'user', entityId: user.id, summary: `${disabling ? 'Disabled' : 'Enabled'} ${user.email}` });
    toast(`${disabling ? 'Disabled' : 'Enabled'} ${user.email}.`);
    load();
  };

  return (
    <>
      <PageHeader title="People & limits" subtitle="Officers registered on M.A.T.E, their access and their run limits." />

      <Card className="overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold">Officers</h2>
        </div>
        {users === null ? <EmptyState>Loading officers…</EmptyState> : users.length === 0 ? <EmptyState>No officers have registered yet.</EmptyState> : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Officer</th>
                <th className="px-5 py-2.5 font-semibold">Rank / company</th>
                <th className="px-5 py-2.5 font-semibold">Vessel</th>
                <th className="px-5 py-2.5 font-semibold">Plan</th>
                <th className="px-5 py-2.5 font-semibold">Access</th>
                <th className="px-5 py-2.5 font-semibold">Joined</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{u.full_name || 'No name'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div>{u.rank || '—'}</div>
                    <div className="text-xs text-muted-foreground">{u.company_name || ''}</div>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {u.vessel_name ? (
                      <>
                        <div className="font-medium text-sm">MV {u.vessel_name} <span className="text-muted-foreground font-normal">({u.vessel_type || 'General'})</span></div>
                        <div className="text-muted-foreground">Operator: {u.operator_name || '—'} · GRT: {u.grt || '—'}</div>
                      </>
                    ) : <span className="text-muted-foreground">No vessel set</span>}
                  </td>
                  <td className="px-5 py-3"><Chip tone={u.subscription_plan === 'premium' ? 'indigo' : 'grey'}>{u.subscription_plan || 'free'}</Chip></td>
                  <td className="px-5 py-3">
                    {u.role === 'analyst' ? <Chip tone="indigo">Analyst</Chip> : u.role === 'disabled' ? <Chip tone="red">Disabled</Chip> : <Chip tone="green">Active</Chip>}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {u.email !== PROTECTED_EMAIL && u.role !== 'analyst' && (
                      <Button size="sm" variant={u.role === 'disabled' ? 'secondary' : 'danger'} onClick={() => toggleAccess(u)}>
                        {u.role === 'disabled' ? 'Enable access' : 'Disable access'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <UserManagementTab />
    </>
  );
}

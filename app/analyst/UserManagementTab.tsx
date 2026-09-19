'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../src/supabase-client';

export default function UserManagementTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: limits } = await supabase.from('usage_limits').select('*');
    
    if (profiles && limits) {
      const merged = profiles.map(p => {
        const userLimit = limits.find(l => l.user_id === p.id);
        return {
          ...p,
          interactions_count: userLimit?.interactions_count || 0,
          max_interactions: userLimit?.max_interactions || 10,
          limit_id: userLimit?.id || null
        };
      });
      setUsers(merged);
    }
    setLoading(false);
  };

  const updateLimit = async (userId: string, limitId: string, newLimit: number) => {
    if (limitId) {
      await supabase.from('usage_limits').update({ max_interactions: newLimit }).eq('id', limitId);
    } else {
      await supabase.from('usage_limits').insert({ user_id: userId, max_interactions: newLimit });
    }
    fetchUsers();
  };

  if (loading) return <div className="p-8 text-center">Loading users...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-6 overflow-hidden">
      <h2 className="text-lg font-bold mb-4">User Management & Quotas</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role / Plan</th>
              <th className="px-4 py-3">Current Usage</th>
              <th className="px-4 py-3">Max Limit</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{u.full_name || 'No Name'}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{u.role}</span>
                </td>
                <td className="px-4 py-3 font-mono">{u.interactions_count} requests</td>
                <td className="px-4 py-3">
                  <input 
                    type="number" 
                    defaultValue={u.max_interactions}
                    onBlur={(e) => updateLimit(u.id, u.limit_id, parseInt(e.target.value))}
                    className="w-20 px-2 py-1 border rounded text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => fetchUsers()} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

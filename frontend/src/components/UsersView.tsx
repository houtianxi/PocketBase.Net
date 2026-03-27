import { useEffect, useState } from 'react';
import { Search, Plus, RotateCcw, Trash2, UserCheck, UserX, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';

type UserRole = 'User' | 'Admin';

type UserItem = {
    id: string;
    email: string;
    displayName: string;
    isActive: boolean;
    role?: UserRole;
};

type EditUserForm = {
    displayName: string;
    isActive: boolean;
    role: UserRole;
    password: string;
};

const EMPTY_EDIT_FORM: EditUserForm = {
    displayName: '',
    isActive: true,
    role: 'User',
    password: '',
};

export function UsersView() {
    const [users, setUsers] = useState<UserItem[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [newUser, setNewUser] = useState({ email: '', displayName: '', password: 'User1234!', role: 'User' });
    const [editingUser, setEditingUser] = useState<UserItem | null>(null);
    const [editUser, setEditUser] = useState<EditUserForm>(EMPTY_EDIT_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api.get<{ items: UserItem[] }>('/users');
            setUsers(r.data.items ?? []);
        } catch { } finally { setLoading(false); }
    };

    const createUser = async () => {
        setSaving(true); setError('');
        try {
            await api.post('/users', newUser);
            await load();
            setShowNew(false);
            setNewUser({ email: '', displayName: '', password: 'User1234!', role: 'User' });
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to create user');
        } finally { setSaving(false); }
    };

    const openEdit = (user: UserItem) => {
        setEditingUser(user);
        setEditUser({
            displayName: user.displayName ?? '',
            isActive: user.isActive,
            role: user.role ?? 'User',
            password: '',
        });
        setError('');
    };

    const updateUser = async () => {
        if (!editingUser) return;
        setSaving(true);
        setError('');
        try {
            await api.put(`/users/${editingUser.id}`, {
                displayName: editUser.displayName,
                isActive: editUser.isActive,
                role: editUser.role,
                password: editUser.password.trim() || null,
            });
            await load();
            setEditingUser(null);
            setEditUser(EMPTY_EDIT_FORM);
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to update user');
        } finally {
            setSaving(false);
        }
    };

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b px-4 py-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <input className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load}>
                    <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowNew(true)}>
                    <Plus className="h-3.5 w-3.5" />New user
                </Button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                        <tr>
                            {['ID', 'Email', 'Display Name', 'Role', 'Status', 'Actions'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filtered.map(u => (
                            <tr key={u.id} className="hover:bg-accent/40">
                                <td className="px-4 py-2"><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{u.id.slice(0, 8)}</span></td>
                                <td className="px-4 py-2">{u.email}</td>
                                <td className="px-4 py-2">{u.displayName}</td>
                                <td className="px-4 py-2">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'Admin' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                                        {u.role ?? 'User'}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {u.isActive ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                                        {u.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={async () => { await api.delete(`/users/${u.id}`); load(); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={showNew} onOpenChange={v => !v && setShowNew(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label>Display name</Label><Input value={newUser.displayName} onChange={e => setNewUser(p => ({ ...p, displayName: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} /></div>
                        <div className="space-y-1.5">
                            <Label>Role</Label>
                            <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="User">User</SelectItem><SelectItem value="Admin">Admin</SelectItem></SelectContent>
                            </Select>
                        </div>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                        <Button onClick={createUser} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingUser} onOpenChange={v => !v && setEditingUser(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input value={editingUser?.email ?? ''} disabled />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Display name</Label>
                            <Input value={editUser.displayName} onChange={e => setEditUser(p => ({ ...p, displayName: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Role</Label>
                                <Select value={editUser.role} onValueChange={v => setEditUser(p => ({ ...p, role: v as UserRole }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="User">User</SelectItem>
                                        <SelectItem value="Admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={editUser.isActive ? 'active' : 'inactive'} onValueChange={v => setEditUser(p => ({ ...p, isActive: v === 'active' }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Reset password (optional)</Label>
                            <Input type="password" value={editUser.password} onChange={e => setEditUser(p => ({ ...p, password: e.target.value }))} placeholder="Leave empty to keep current password" />
                        </div>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                        <Button onClick={updateUser} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

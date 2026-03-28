import { useEffect, useState } from 'react';
import { Plus, Trash2, Power, Copy, Check, Key, Shield, Calendar, User2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api, type CollectionItem } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiKey = {
    id: string;
    name: string;
    ownerName: string;
    ownerEmail?: string;
    description?: string;
    keyPrefix: string;
    scopes: string[];
    allowedCollections: string[];
    isActive: boolean;
    expiresAt?: string;
    lastUsedAt?: string;
    createdByUserId?: string;
    createdAt: string;
    updatedAt: string;
};

type ApiKeyCreated = {
    id: string;
    name: string;
    keyPrefix: string;
    rawKey: string;
    scopes: string[];
    allowedCollections: string[];
    isActive: boolean;
    expiresAt?: string;
    createdAt: string;
};

const ALL_SCOPES = ['list', 'view', 'create', 'update', 'delete'];
const SCOPE_LABELS: Record<string, string> = {
    list: 'List (查询列表)',
    view: 'View (查询单条)',
    create: 'Create (新增)',
    update: 'Update (编辑)',
    delete: 'Delete (删除)',
};
const SCOPE_COLORS: Record<string, string> = {
    list: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    view: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    create: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateKeyDialog({ open, onClose, collections, onCreated }: {
    open: boolean;
    onClose: () => void;
    collections: CollectionItem[];
    onCreated: (key: ApiKeyCreated) => void;
}) {
    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [description, setDescription] = useState('');
    const [scopes, setScopes] = useState<string[]>(ALL_SCOPES);
    const [allCollections, setAllCollections] = useState(true);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [expiresAt, setExpiresAt] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName(''); setOwnerName(''); setOwnerEmail(''); setDescription('');
            setScopes(ALL_SCOPES); setAllCollections(true); setSelectedCols([]);
            setExpiresAt(''); setError('');
        }
    }, [open]);

    const toggleScope = (s: string) => {
        setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };

    const toggleCol = (slug: string) => {
        setSelectedCols(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug]);
    };

    const submit = async () => {
        if (!name.trim()) { setError('请输入应用名称'); return; }
        if (!ownerName.trim()) { setError('请输入负责人姓名'); return; }
        if (scopes.length === 0) { setError('请至少选择一个权限范围'); return; }

        setSaving(true); setError('');
        try {
            const res = await api.post<ApiKeyCreated>('/keys', {
                name: name.trim(),
                ownerName: ownerName.trim(),
                ownerEmail: ownerEmail.trim() || null,
                description: description.trim() || null,
                scopes: scopes.join(','),
                allowedCollections: allCollections ? [] : selectedCols,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
            });
            onCreated(res.data);
            onClose();
        } catch {
            setError('创建失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5 text-primary" />
                        创建 API Key
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* 基本信息 */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">应用信息</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">应用名称 *</Label>
                                <Input placeholder="e.g. 销售系统" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">负责人姓名 *</Label>
                                <Input placeholder="e.g. 张三" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">负责人邮箱</Label>
                                <Input type="email" placeholder="e.g. zhangsan@company.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">过期时间（留空 = 永不过期）</Label>
                                <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">备注说明</Label>
                            <Input placeholder="此 key 用途说明（可选）" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                    </section>

                    {/* 权限范围 */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">权限范围（Scopes）</h3>
                        <p className="text-xs text-muted-foreground">选择此 Key 可以执行的操作类型</p>
                        <div className="flex flex-wrap gap-2">
                            {ALL_SCOPES.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => toggleScope(s)}
                                    className={cn(
                                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                        scopes.includes(s)
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                                    )}
                                >
                                    {SCOPE_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* 集合授权 */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">集合访问范围</h3>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setAllCollections(true)}
                                className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                    allCollections ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
                            >
                                <Shield className="h-3.5 w-3.5" /> 全部集合
                            </button>
                            <button
                                type="button"
                                onClick={() => setAllCollections(false)}
                                className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                    !allCollections ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
                            >
                                指定集合
                            </button>
                        </div>

                        {!allCollections && (
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
                                {collections.length === 0 && (
                                    <span className="text-xs text-muted-foreground p-2">暂无集合</span>
                                )}
                                {collections.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => toggleCol(c.slug)}
                                        className={cn(
                                            'rounded border px-2.5 py-1 text-xs font-medium transition-all',
                                            selectedCols.includes(c.slug)
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border text-muted-foreground hover:border-primary/40'
                                        )}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? '创建中...' : '创建 Key'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Reveal Dialog: show raw key once ─────────────────────────────────────────

function RevealKeyDialog({ keyData, onClose }: { keyData: ApiKeyCreated | null; onClose: () => void }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (!keyData) return;
        await navigator.clipboard.writeText(keyData.rawKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={!!keyData} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-5 w-5" /> API Key 创建成功
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                            ⚠️ 请立即保存此 Key，关闭后将无法再次查看！
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs">API Key</Label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all">
                                {keyData?.rawKey}
                            </code>
                            <Button variant="outline" size="icon" className="shrink-0" onClick={copy}>
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    {keyData && (
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                            <p><span className="font-medium text-foreground">应用名称：</span>{keyData.name}</p>
                            <p><span className="font-medium text-foreground">权限范围：</span>{keyData.scopes.join(', ')}</p>
                            <p><span className="font-medium text-foreground">允许集合：</span>{keyData.allowedCollections.length === 0 ? '全部' : keyData.allowedCollections.join(', ')}</p>
                            {keyData.expiresAt && <p><span className="font-medium text-foreground">过期时间：</span>{new Date(keyData.expiresAt).toLocaleString()}</p>}
                        </div>
                    )}

                    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                        <p className="text-xs font-medium">使用方式</p>
                        <code className="block text-xs text-muted-foreground">
                            GET /api/records/your-collection?page=1
                        </code>
                        <code className="block text-xs text-muted-foreground break-all">
                            X-API-Key: {keyData?.rawKey?.substring(0, 20)}...
                        </code>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={onClose}>我已保存，关闭</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditKeyDialog({
    open,
    onClose,
    keyData,
    collections,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    keyData: ApiKey | null;
    collections: CollectionItem[];
    onSaved: () => void;
}) {
    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [description, setDescription] = useState('');
    const [scopes, setScopes] = useState<string[]>(ALL_SCOPES);
    const [allCollections, setAllCollections] = useState(true);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [expiresAt, setExpiresAt] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !keyData) return;
        setName(keyData.name);
        setOwnerName(keyData.ownerName);
        setOwnerEmail(keyData.ownerEmail ?? '');
        setDescription(keyData.description ?? '');
        setScopes(keyData.scopes?.length ? keyData.scopes : ALL_SCOPES);
        setAllCollections((keyData.allowedCollections?.length ?? 0) === 0);
        setSelectedCols(keyData.allowedCollections ?? []);
        setExpiresAt(keyData.expiresAt ? new Date(keyData.expiresAt).toISOString().slice(0, 16) : '');
        setIsActive(keyData.isActive);
        setError('');
    }, [open, keyData]);

    const toggleScope = (s: string) => {
        setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };

    const toggleCol = (slug: string) => {
        setSelectedCols(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug]);
    };

    const submit = async () => {
        if (!keyData) return;
        if (!name.trim()) { setError('请输入应用名称'); return; }
        if (!ownerName.trim()) { setError('请输入负责人姓名'); return; }
        if (scopes.length === 0) { setError('请至少选择一个权限范围'); return; }

        setSaving(true); setError('');
        try {
            await api.put(`/keys/${keyData.id}`, {
                name: name.trim(),
                ownerName: ownerName.trim(),
                ownerEmail: ownerEmail.trim() || null,
                description: description.trim() || null,
                scopes: scopes.join(','),
                allowedCollections: allCollections ? [] : selectedCols,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                isActive,
            });
            onSaved();
            onClose();
        } catch {
            setError('更新失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-primary" /> 编辑 API Key
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">应用信息</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">应用名称 *</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">负责人姓名 *</Label>
                                <Input value={ownerName} onChange={e => setOwnerName(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">负责人邮箱</Label>
                                <Input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">过期时间（留空 = 永不过期）</Label>
                                <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">备注说明</Label>
                            <Input value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">状态</Label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsActive(true)}
                                    className={cn(
                                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                        isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                                    )}
                                >启用</button>
                                <button
                                    type="button"
                                    onClick={() => setIsActive(false)}
                                    className={cn(
                                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                        !isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                                    )}
                                >禁用</button>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">权限范围（Scopes）</h3>
                        <div className="flex flex-wrap gap-2">
                            {ALL_SCOPES.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => toggleScope(s)}
                                    className={cn(
                                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                        scopes.includes(s)
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                                    )}
                                >
                                    {SCOPE_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-1">集合访问范围</h3>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setAllCollections(true)}
                                className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                    allCollections ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
                            >
                                <Shield className="h-3.5 w-3.5" /> 全部集合
                            </button>
                            <button
                                type="button"
                                onClick={() => setAllCollections(false)}
                                className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                                    !allCollections ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
                            >
                                指定集合
                            </button>
                        </div>

                        {!allCollections && (
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
                                {collections.length === 0 && (
                                    <span className="text-xs text-muted-foreground p-2">暂无集合</span>
                                )}
                                {collections.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => toggleCol(c.slug)}
                                        className={cn(
                                            'rounded border px-2.5 py-1 text-xs font-medium transition-all',
                                            selectedCols.includes(c.slug)
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border text-muted-foreground hover:border-primary/40'
                                        )}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? '保存中...' : '保存修改'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function ApiKeysView() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [collections, setCollections] = useState<CollectionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
    const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        loadKeys();
        api.get<CollectionItem[]>('/collections').then(r => setCollections(r.data)).catch(() => { });
    }, []);

    const loadKeys = async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiKey[]>('/keys');
            setKeys(res.data);
        } catch { }
        finally { setLoading(false); }
    };

    const handleCreated = (key: ApiKeyCreated) => {
        setCreatedKey(key);
        loadKeys();
    };

    const toggle = async (id: string) => {
        await api.post(`/keys/${id}/toggle`);
        loadKeys();
    };

    const deleteKey = async (id: string) => {
        await api.delete(`/keys/${id}`);
        setDeletingId(null);
        loadKeys();
    };

    const formatDate = (iso?: string) =>
        iso ? new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">API Keys 管理</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{keys.length} 个</span>
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    创建 API Key
                </Button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">加载中...</div>
                ) : keys.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                        <Key className="h-10 w-10 text-muted-foreground/40" />
                        <div>
                            <p className="text-sm font-medium">还没有 API Key</p>
                            <p className="text-xs text-muted-foreground mt-1">创建 Key 来允许第三方应用访问你的数据</p>
                        </div>
                        <Button size="sm" onClick={() => setCreateOpen(true)}>创建第一个 Key</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {keys.map(k => (
                            <div
                                key={k.id}
                                className={cn(
                                    'rounded-xl border bg-card p-4 transition-all',
                                    k.isActive ? 'border-border' : 'border-border/50 opacity-60'
                                )}
                            >
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-sm">{k.name}</span>
                                            <Badge className={cn('text-xs h-5', k.isActive ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
                                                {k.isActive ? '启用' : '禁用'}
                                            </Badge>
                                            {k.expiresAt && new Date(k.expiresAt) < new Date() && (
                                                <Badge className="text-xs h-5 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">已过期</Badge>
                                            )}
                                        </div>
                                        {k.description && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">{k.description}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title="编辑"
                                            onClick={() => setEditingKey(k)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title={k.isActive ? '停用' : '启用'}
                                            onClick={() => toggle(k.id)}
                                        >
                                            <Power className={cn('h-3.5 w-3.5', k.isActive ? 'text-green-500' : 'text-muted-foreground')} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            title="撤销删除"
                                            onClick={() => setDeletingId(k.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Meta row */}
                                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-4">
                                    <div className="flex items-center gap-1.5">
                                        <User2 className="h-3 w-3 shrink-0" />
                                        <span>{k.ownerName}{k.ownerEmail ? ` (${k.ownerEmail})` : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Key className="h-3 w-3 shrink-0" />
                                        <code className="font-mono">{k.keyPrefix}</code>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3 shrink-0" />
                                        <span>创建: {formatDate(k.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3 shrink-0" />
                                        <span>最后使用: {formatDate(k.lastUsedAt)}</span>
                                    </div>
                                </div>

                                {/* Scopes + Collections */}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {k.scopes.map(s => (
                                        <span key={s} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', SCOPE_COLORS[s] ?? 'bg-secondary text-foreground')}>
                                            {s}
                                        </span>
                                    ))}
                                    <span className="text-xs text-muted-foreground ml-1">|</span>
                                    <span className="text-xs text-muted-foreground">
                                        集合: {k.allowedCollections.length === 0 ? '全部' : k.allowedCollections.join(', ')}
                                    </span>
                                    {k.expiresAt && (
                                        <>
                                            <span className="text-xs text-muted-foreground ml-1">|</span>
                                            <span className="text-xs text-muted-foreground">
                                                过期: {formatDate(k.expiresAt)}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <CreateKeyDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                collections={collections}
                onCreated={handleCreated}
            />

            <RevealKeyDialog
                keyData={createdKey}
                onClose={() => setCreatedKey(null)}
            />

            <EditKeyDialog
                open={!!editingKey}
                onClose={() => setEditingKey(null)}
                keyData={editingKey}
                collections={collections}
                onSaved={loadKeys}
            />

            {/* Delete confirm */}
            <Dialog open={!!deletingId} onOpenChange={v => !v && setDeletingId(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>确认撤销 API Key？</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        撤销后此 Key 将立即失效，使用此 Key 的第三方应用将无法继续访问。此操作不可恢复。
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingId(null)}>取消</Button>
                        <Button variant="destructive" onClick={() => deletingId && deleteKey(deletingId)}>撤销删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

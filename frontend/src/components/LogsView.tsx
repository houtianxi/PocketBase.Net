import { useEffect, useState } from 'react';
import { Search, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

type AuditLog = {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    actorId: string;
    createdAt: string;
    detailJson: string;
};

const ActionColors: Record<string, string> = {
    'collections.create': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'collections.update': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'collections.delete': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'collections.truncate': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'collections.duplicate': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'records.create': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'records.update': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'records.delete': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'users.create': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'users.update': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'users.delete': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'application-settings.update': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'fields.create': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'fields.update': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'fields.delete': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function LogsView() {
    const { t } = useI18n();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
    const [deletingOldDays, setDeletingOldDays] = useState(30);
    const [deletingOldOpen, setDeletingOldOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        void load(1);
    }, []);

    useEffect(() => {
        void load(page);
    }, [page, search]);

    const load = async (p: number) => {
        setLoading(true);
        try {
            const res = await api.get<{
                page: number;
                perPage: number;
                totalItems: number;
                totalPages: number;
                items: AuditLog[];
            }>('/logs', { params: { page: p, perPage: 50, search: search || undefined } });
            setLogs(res.data.items ?? []);
            setTotal(res.data.totalItems);
            setTotalPages(res.data.totalPages || 1);
            setPage(p);
            setSelected(new Set());
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAll = async () => {
        setDeleting(true);
        try {
            await api.delete('/logs');
            await load(1);
            setDeleteAllOpen(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteSelected = async () => {
        setDeleting(true);
        try {
            for (const id of Array.from(selected)) {
                await api.delete(`/logs/${id}`).catch(() => { });
            }
            await load(page);
            setDeleteSelectedOpen(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteOlderThan = async () => {
        setDeleting(true);
        try {
            await api.post('/logs/delete-older-than', { daysOld: deletingOldDays });
            await load(1);
            setDeletingOldOpen(false);
        } finally {
            setDeleting(false);
        }
    };

    const allChecked = logs.length > 0 && logs.every(r => selected.has(r.id));
    const someChecked = logs.some(r => selected.has(r.id));

    const formatTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleString('en-US', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
        } catch { return iso; }
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b px-6 py-4">
                <h1 className="text-lg font-semibold">{t('logsTitle')}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {t('logsSubtitle')}
                </p>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1.5 border-b bg-background px-3 py-1.5">
                <div className="relative flex-1 max-w-140">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={t('logsSearchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load(page)}>
                    <RotateCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>

                {selected.size > 0 && (
                    <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => setDeleteSelectedOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('logsDeleteSelected')} ({selected.size})
                    </Button>
                )}

                <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setDeletingOldOpen(true)}>
                    {t('logsDeleteOlderThan30Days')}
                </Button>

                <Button variant="outline" size="sm" className="h-8 text-[12px] text-destructive" onClick={() => setDeleteAllOpen(true)}>
                    {t('logsDeleteAll')}
                </Button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                        <tr>
                            <th className="w-10 px-3 py-2.5 text-left">
                                <Checkbox
                                    checked={allChecked}
                                    onCheckedChange={v => {
                                        if (v) setSelected(new Set(logs.map(r => r.id)));
                                        else setSelected(new Set());
                                    }}
                                    className={someChecked && !allChecked ? 'opacity-50' : ''}
                                />
                            </th>
                            {[t('logsTimestamp'), t('logsAction'), t('logsResource'), t('logsResourceId'), t('logsActor')].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">{t('logsLoading')}</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                                {search ? t('logsNoSearchResult') : t('logsEmpty')}
                            </td></tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id} className={cn('hover:bg-accent/50 group', selected.has(log.id) && 'bg-primary/5')}>
                                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selected.has(log.id)}
                                            onCheckedChange={v => setSelected(s => { const n = new Set(s); v ? n.add(log.id) : n.delete(log.id); return n; })}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{formatTime(log.createdAt)}</td>
                                    <td className="px-3 py-2">
                                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', ActionColors[log.action] ?? 'bg-muted text-muted-foreground')}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{log.resourceType}</td>
                                    <td className="px-3 py-2">
                                        <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{log.resourceId.substring(0, 8)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{log.actorId?.substring(0, 8) || t('logsUnknownActor')}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground bg-background">
                <span>{t('logsTotal')}: {total}</span>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span>{page} / {totalPages || 1}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Delete All Confirmation */}
            <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('logsDeleteAllConfirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('logsDeleteAllConfirmDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={deleting}>{t('usersCancel')}</Button>
                        <Button variant="destructive" onClick={() => void handleDeleteAll()} disabled={deleting}>
                            {deleting ? t('deleting') : t('logsDeleteAll')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Selected Confirmation */}
            <Dialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {selected.size} log{selected.size !== 1 ? 's' : ''}?</DialogTitle>
                        <DialogDescription>
                            {t('logsDeleteSelectedConfirmDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteSelectedOpen(false)} disabled={deleting}>{t('usersCancel')}</Button>
                        <Button variant="destructive" onClick={() => void handleDeleteSelected()} disabled={deleting}>
                            {deleting ? t('deleting') : t('logsDeleteSelected')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Older Than Confirmation */}
            <Dialog open={deletingOldOpen} onOpenChange={setDeletingOldOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('logsDeleteOlderThanTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('logsDeleteOlderThanDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('logsDaysOld')}</label>
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={deletingOldDays}
                                onChange={e => setDeletingOldDays(Math.max(1, parseInt(e.target.value) || 30))}
                                className="w-full h-9 rounded-md border bg-transparent px-3 text-sm"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingOldOpen(false)} disabled={deleting}>{t('usersCancel')}</Button>
                        <Button variant="destructive" onClick={() => void handleDeleteOlderThan()} disabled={deleting}>
                            {deleting ? t('deleting') : t('delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

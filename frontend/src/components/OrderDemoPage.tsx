import { useEffect, useState } from 'react';
import { Database, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type CollectionItem } from '@/lib/api';
import { RecordsTable } from '@/components/RecordsTable';

export function OrderDemoPage() {
    const [orderCollection, setOrderCollection] = useState<CollectionItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadOrderCollection = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<CollectionItem[]>('/collections');
            const target = (res.data ?? []).find(c => c.slug.toLowerCase() === 'order');
            if (!target) {
                setOrderCollection(null);
                setError('Cannot find collection with slug "order". Please create or rename one first.');
                return;
            }
            setOrderCollection(target);
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
            setOrderCollection(null);
            setError(message || 'Failed to load collections.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOrderCollection();
    }, []);

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold">Order Demo</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Uses the same table and form workflow as the Order collection page to verify query, edit and delete via API.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadOrderCollection()}>
                        <RotateCcw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                        Reload
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading order collection...</div>
            ) : orderCollection ? (
                <div className="flex-1 overflow-hidden">
                    <RecordsTable collection={orderCollection} onSettingsClick={() => { }} />
                </div>
            ) : (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    No Order collection available.
                </div>
            )}
        </div>
    );
}

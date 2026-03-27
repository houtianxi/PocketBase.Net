import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy } from 'lucide-react';
import type { CollectionItem } from '@/lib/api';

interface ApiPreviewDialogProps {
    open: boolean;
    onClose: () => void;
    collection: CollectionItem;
}

export function ApiPreviewDialog({ open, onClose, collection }: ApiPreviewDialogProps) {
    const base = `${window.location.origin}/api`;
    const slug = collection.slug;

    const endpoints = [
        {
            label: 'List',
            method: 'GET',
            url: `${base}/records/${slug}?page=1&pageSize=20`,
            code: `const res = await fetch('${base}/records/${slug}?page=1&pageSize=20', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
const data = await res.json();
// data.items - array of records
// data.totalItems - total count`,
        },
        {
            label: 'Create',
            method: 'POST',
            url: `${base}/records/${slug}`,
            code: `const res = await fetch('${base}/records/${slug}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({ data: { /* your fields */ } })
});`,
        },
        {
            label: 'Update',
            method: 'PUT',
            url: `${base}/records/${slug}/:id`,
            code: `const res = await fetch('${base}/records/${slug}/RECORD_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({ data: { /* updated fields */ } })
});`,
        },
        {
            label: 'Delete',
            method: 'DELETE',
            url: `${base}/records/${slug}/:id`,
            code: `await fetch('${base}/records/${slug}/RECORD_ID', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        },
    ];

    const copy = (text: string) => navigator.clipboard?.writeText(text);

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>API Preview — {collection.name}</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="List" className="flex-1 overflow-hidden flex flex-col">
                    <TabsList className="shrink-0">
                        {endpoints.map(e => (
                            <TabsTrigger key={e.label} value={e.label}>{e.label}</TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="flex-1 overflow-y-auto mt-2">
                        {endpoints.map(ep => (
                            <TabsContent key={ep.label} value={ep.label} className="space-y-3">
                                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${ep.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                            ep.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                                ep.method === 'PUT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                                    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                        }`}>{ep.method}</span>
                                    <code className="flex-1 truncate text-xs">{ep.url}</code>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copy(ep.url)}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className="relative">
                                    <pre className="rounded-md border bg-zinc-950 dark:bg-zinc-900 text-green-400 p-4 text-xs overflow-x-auto leading-relaxed">
                                        {ep.code}
                                    </pre>
                                    <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-6 w-6 text-zinc-400 hover:text-white" onClick={() => copy(ep.code)}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </TabsContent>
                        ))}
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

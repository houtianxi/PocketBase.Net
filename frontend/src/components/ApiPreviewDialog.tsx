import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy } from 'lucide-react';
import { api, type ApiPreviewEndpoint, type CollectionApiPreviewResponse, type CollectionItem } from '@/lib/api';

interface ApiPreviewDialogProps {
    open: boolean;
    onClose: () => void;
    collection: CollectionItem;
}

export function ApiPreviewDialog({ open, onClose, collection }: ApiPreviewDialogProps) {
    const [preview, setPreview] = useState<CollectionApiPreviewResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await api.get<CollectionApiPreviewResponse>(`/collections/${collection.id}/api-preview`);
                if (!cancelled) {
                    setPreview(res.data);
                }
            } catch (err) {
                if (!cancelled) {
                    setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed to load API preview');
                    setPreview(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [open, collection.id]);

    const endpoints = preview?.endpoints ?? [];
    const defaultTab = useMemo(() => endpoints[0]?.label ?? 'List', [endpoints]);

    const copy = (text: string) => navigator.clipboard?.writeText(text);

    const buildCodeExample = (endpoint: ApiPreviewEndpoint) => {
        const absoluteUrl = `${window.location.origin}${endpoint.url}`;
        const headers = endpoint.method === 'GET' || endpoint.method === 'DELETE'
            ? "  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }"
            : "  headers: {\n    'Content-Type': 'application/json',\n    'Authorization': 'Bearer YOUR_TOKEN'\n  }";

        if (endpoint.method === 'GET') {
            return `const res = await fetch('${absoluteUrl}', {\n${headers}\n});\nconst data = await res.json();`;
        }

        if (endpoint.method === 'DELETE') {
            return `await fetch('${absoluteUrl.replace('{id}', 'RECORD_ID')}', {\n  method: 'DELETE',\n${headers}\n});`;
        }

        const body = endpoint.requestBodyExample ?? '{\n  "data": {}\n}';
        return `const res = await fetch('${absoluteUrl.replace('{id}', 'RECORD_ID')}', {\n  method: '${endpoint.method}',\n${headers},\n  body: JSON.stringify(${body})\n});\nconst data = await res.json();`;
    };

    const badgeClass = (method: string) => method === 'GET'
        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
        : method === 'POST'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            : method === 'PUT'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>API Preview — {collection.name}</DialogTitle>
                </DialogHeader>
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading API preview...</div>
                ) : error ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-destructive">{error}</div>
                ) : endpoints.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No API preview available.</div>
                ) : (
                    <Tabs defaultValue={defaultTab} className="flex-1 overflow-hidden flex flex-col">
                        <TabsList className="shrink-0">
                            {endpoints.map(e => (
                                <TabsTrigger key={e.key} value={e.label}>{e.label}</TabsTrigger>
                            ))}
                        </TabsList>
                        <div className="flex-1 overflow-y-auto mt-2 pr-1">
                            {endpoints.map(ep => {
                                const codeExample = buildCodeExample(ep);
                                return (
                                    <TabsContent key={ep.key} value={ep.label} className="space-y-4 pb-2">
                                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badgeClass(ep.method)}`}>{ep.method}</span>
                                            <code className="flex-1 truncate text-xs">{ep.url}</code>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copy(ep.url)}>
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>

                                        <div className="rounded-lg border bg-background p-3 text-sm">
                                            <p className="font-medium">{ep.summary}</p>
                                            {ep.notes.length > 0 && (
                                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                                                    {ep.notes.map(note => <li key={note}>{note}</li>)}
                                                </ul>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium">Parameters</p>
                                            </div>
                                            <div className="rounded-lg border overflow-hidden">
                                                {ep.parameters.length === 0 ? (
                                                    <div className="px-3 py-3 text-xs text-muted-foreground">No extra parameters.</div>
                                                ) : (
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-muted/50 text-muted-foreground">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                                                <th className="px-3 py-2 text-left font-medium">In</th>
                                                                <th className="px-3 py-2 text-left font-medium">Type</th>
                                                                <th className="px-3 py-2 text-left font-medium">Required</th>
                                                                <th className="px-3 py-2 text-left font-medium">Description</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ep.parameters.map(param => (
                                                                <tr key={`${ep.key}-${param.name}`} className="border-t align-top">
                                                                    <td className="px-3 py-2 font-mono">{param.name}</td>
                                                                    <td className="px-3 py-2">{param.location}</td>
                                                                    <td className="px-3 py-2">{param.type}</td>
                                                                    <td className="px-3 py-2">{param.required ? 'Yes' : 'No'}</td>
                                                                    <td className="px-3 py-2 text-foreground/90">
                                                                        <div>{param.description}</div>
                                                                        {param.example && <div className="mt-1 text-muted-foreground">Example: {param.example}</div>}
                                                                        {param.allowedValues && param.allowedValues.length > 0 && <div className="mt-1 text-muted-foreground">Allowed: {param.allowedValues.join(', ')}</div>}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>

                                        {ep.requestBodyExample && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-sm font-medium">Request JSON</p>
                                                        {ep.requestBodyDescription && <p className="text-xs text-muted-foreground">{ep.requestBodyDescription}</p>}
                                                    </div>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(ep.requestBodyExample!)}>
                                                        <Copy className="mr-1 h-3.5 w-3.5" />
                                                        Copy JSON
                                                    </Button>
                                                </div>
                                                <pre className="rounded-md border bg-zinc-950 dark:bg-zinc-900 text-green-400 p-4 text-xs overflow-x-auto leading-relaxed">{ep.requestBodyExample}</pre>
                                            </div>
                                        )}

                                        {ep.requestExample && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium">Request Example</p>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(ep.requestExample!)}>
                                                        <Copy className="mr-1 h-3.5 w-3.5" />
                                                        Copy Request
                                                    </Button>
                                                </div>
                                                <pre className="rounded-md border bg-zinc-950 dark:bg-zinc-900 text-green-400 p-4 text-xs overflow-x-auto leading-relaxed">{ep.requestExample}</pre>
                                            </div>
                                        )}

                                        {ep.responseExample && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium">Response Example</p>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(ep.responseExample!)}>
                                                        <Copy className="mr-1 h-3.5 w-3.5" />
                                                        Copy Response
                                                    </Button>
                                                </div>
                                                <pre className="rounded-md border bg-zinc-950 dark:bg-zinc-900 text-green-400 p-4 text-xs overflow-x-auto leading-relaxed">{ep.responseExample}</pre>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium">Fetch Example</p>
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(codeExample)}>
                                                    <Copy className="mr-1 h-3.5 w-3.5" />
                                                    Copy Code
                                                </Button>
                                            </div>
                                            <pre className="rounded-md border bg-zinc-950 dark:bg-zinc-900 text-green-400 p-4 text-xs overflow-x-auto leading-relaxed">{codeExample}</pre>
                                        </div>
                                    </TabsContent>
                                );
                            })}
                        </div>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { Database, RotateCcw, Play, FlaskConical, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, FieldType, type CollectionApiPreviewResponse, type CollectionItem, type Field, type PagedRecordResponse, type RecordResponse } from '@/lib/api';
import { ApiPreviewDialog } from '@/components/ApiPreviewDialog';
import { RecordsTable } from '@/components/RecordsTable';

type DemoResult = {
    title: string;
    requestLine: string;
    status: number | null;
    payload: string;
    error?: string;
};

type ListDemo = {
    key: string;
    title: string;
    description: string;
    params: Record<string, string | number | undefined>;
};

export function OrderDemoPage() {
    const [orderCollection, setOrderCollection] = useState<CollectionItem | null>(null);
    const [fields, setFields] = useState<Field[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);
    const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
    const [listVisualData, setListVisualData] = useState<PagedRecordResponse<RecordResponse> | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [tableVersion, setTableVersion] = useState(0);

    const [createBody, setCreateBody] = useState('{\n  "data": {}\n}');
    const [updateBody, setUpdateBody] = useState('{\n  "data": {}\n}');
    const [targetRecordId, setTargetRecordId] = useState('');

    const listDemos = useMemo<ListDemo[]>(() => {
        if (!orderCollection) return [];

        const searchable = fields.find(f => f.type === FieldType.Text || f.type === FieldType.Email)?.name ?? 'name';
        const sortable = fields.find(f => f.type === FieldType.DateTime || f.type === FieldType.Number)?.name ?? 'updated';
        const relationField = fields.find(f => f.type === FieldType.Relation)?.name;
        const firstFields = fields.slice(0, 3).map(f => f.name).join(',');

        return [
            {
                key: 'basic',
                title: '基础分页',
                description: '最常见的分页查询，适合列表页初始化。',
                params: { page: 1, perPage: 10 },
            },
            {
                key: 'sort-filter',
                title: '排序 + 过滤',
                description: '演示 sort/filter 组合查询。',
                params: {
                    page: 1,
                    perPage: 20,
                    sort: `-${sortable}`,
                    filter: `${searchable} contains 'demo'`,
                },
            },
            {
                key: 'search-fields',
                title: '搜索 + 字段裁剪',
                description: '演示 search + fields，只返回你关心的字段。',
                params: {
                    page: 1,
                    perPage: 20,
                    search: 'demo',
                    fields: `id,${firstFields}`,
                },
            },
            {
                key: 'expand',
                title: '关系展开',
                description: relationField
                    ? `演示 expand=${relationField}，返回展开后的 Relation 对象。`
                    : '当前集合没有 Relation 字段，expand 示例将退化为普通列表。',
                params: {
                    page: 1,
                    perPage: 20,
                    ...(relationField ? { expand: relationField } : {}),
                },
            },
        ];
    }, [orderCollection, fields]);

    const hasTableField = useMemo(() => fields.some(f => f.type === FieldType.Table), [fields]);

    const initializeBodiesFromPreview = (preview: CollectionApiPreviewResponse | null) => {
        const createExample = preview?.endpoints?.find(e => e.key === 'create')?.requestBodyExample;
        const updateExample = preview?.endpoints?.find(e => e.key === 'update')?.requestBodyExample;
        setCreateBody(createExample || '{\n  "data": {}\n}');
        setUpdateBody(updateExample || '{\n  "data": {}\n}');
    };

    const normalizePayloadText = (payload: unknown) => JSON.stringify(payload, null, 2);

    const buildRequestLine = (method: string, url: string, params?: Record<string, string | number | undefined>) => {
        if (!params) return `${method} ${url}`;
        const query = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
        return query ? `${method} ${url}?${query}` : `${method} ${url}`;
    };

    const runListDemo = async (demo: ListDemo) => {
        if (!orderCollection) return;
        setRunning(true);
        setDemoResult(null);
        setListVisualData(null);
        try {
            const path = `/records/${orderCollection.slug}`;
            const res = await api.get<PagedRecordResponse<RecordResponse>>(path, { params: demo.params });
            setDemoResult({
                title: `List Demo - ${demo.title}`,
                requestLine: buildRequestLine('GET', `/api${path}`, demo.params),
                status: res.status,
                payload: normalizePayloadText(res.data),
            });
            setListVisualData(res.data);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: unknown }; message?: string };
            setDemoResult({
                title: `List Demo - ${demo.title}`,
                requestLine: buildRequestLine('GET', `/api/records/${orderCollection.slug}`, demo.params),
                status: err.response?.status ?? null,
                payload: normalizePayloadText(err.response?.data ?? { message: err.message ?? 'Request failed' }),
                error: err.message,
            });
            setListVisualData(null);
        } finally {
            setRunning(false);
        }
    };

    const runCreate = async () => {
        if (!orderCollection) return;
        setRunning(true);
        setDemoResult(null);
        setListVisualData(null);
        try {
            const body = JSON.parse(createBody);
            const path = hasTableField ? `/records/${orderCollection.slug}/graph` : `/records/${orderCollection.slug}`;
            const res = await api.post(path, body);
            setDemoResult({
                title: hasTableField ? 'Create (Graph)' : 'Create',
                requestLine: buildRequestLine('POST', `/api${path}`),
                status: res.status,
                payload: normalizePayloadText(res.data),
            });
            setTableVersion(v => v + 1);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: unknown }; message?: string };
            setDemoResult({
                title: hasTableField ? 'Create (Graph)' : 'Create',
                requestLine: buildRequestLine('POST', `/api/records/${orderCollection.slug}`),
                status: err.response?.status ?? null,
                payload: normalizePayloadText(err.response?.data ?? { message: err.message ?? 'Request failed' }),
                error: err.message,
            });
        } finally {
            setRunning(false);
        }
    };

    const runUpdate = async () => {
        if (!orderCollection || !targetRecordId.trim()) {
            setError('Please input target record id before update/delete.');
            return;
        }
        setRunning(true);
        setDemoResult(null);
        setListVisualData(null);
        try {
            const body = JSON.parse(updateBody);
            const path = hasTableField
                ? `/records/${orderCollection.slug}/${targetRecordId.trim()}/graph`
                : `/records/${orderCollection.slug}/${targetRecordId.trim()}`;
            const res = await api.put(path, body);
            setDemoResult({
                title: hasTableField ? 'Update (Graph)' : 'Update',
                requestLine: buildRequestLine('PUT', `/api${path}`),
                status: res.status,
                payload: normalizePayloadText(res.data),
            });
            setTableVersion(v => v + 1);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: unknown }; message?: string };
            setDemoResult({
                title: hasTableField ? 'Update (Graph)' : 'Update',
                requestLine: buildRequestLine('PUT', `/api/records/${orderCollection.slug}/${targetRecordId.trim()}`),
                status: err.response?.status ?? null,
                payload: normalizePayloadText(err.response?.data ?? { message: err.message ?? 'Request failed' }),
                error: err.message,
            });
        } finally {
            setRunning(false);
        }
    };

    const runDelete = async () => {
        if (!orderCollection || !targetRecordId.trim()) {
            setError('Please input target record id before update/delete.');
            return;
        }
        setRunning(true);
        setDemoResult(null);
        setListVisualData(null);
        try {
            const path = `/records/${orderCollection.slug}/${targetRecordId.trim()}`;
            const res = await api.delete(path);
            setDemoResult({
                title: 'Delete',
                requestLine: buildRequestLine('DELETE', `/api${path}`),
                status: res.status,
                payload: normalizePayloadText(res.data ?? { success: true }),
            });
            setTableVersion(v => v + 1);
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: unknown }; message?: string };
            setDemoResult({
                title: 'Delete',
                requestLine: buildRequestLine('DELETE', `/api/records/${orderCollection.slug}/${targetRecordId.trim()}`),
                status: err.response?.status ?? null,
                payload: normalizePayloadText(err.response?.data ?? { message: err.message ?? 'Request failed' }),
                error: err.message,
            });
        } finally {
            setRunning(false);
        }
    };

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

            const [fieldsRes, previewRes] = await Promise.all([
                api.get<Field[]>(`/collections/${target.id}/fields`),
                api.get<CollectionApiPreviewResponse>(`/collections/${target.id}/api-preview`),
            ]);

            const nonSystemFields = (fieldsRes.data ?? []).filter(f => !f.isSystem);
            setFields(nonSystemFields);
            initializeBodiesFromPreview(previewRes.data);
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
            setOrderCollection(null);
            setFields([]);
            setError(message || 'Failed to load collections.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOrderCollection();
    }, []);

    const listPreviewColumns = useMemo(() => {
        if (!listVisualData || !Array.isArray(listVisualData.items) || listVisualData.items.length === 0) {
            return [] as string[];
        }

        const dataKeys = new Set<string>();
        for (const row of listVisualData.items.slice(0, 10)) {
            Object.keys(row.data ?? {}).forEach(key => dataKeys.add(key));
        }

        return ['id', ...Array.from(dataKeys).slice(0, 6), 'createdAt', 'updatedAt'];
    }, [listVisualData]);

    const renderPreviewCell = (row: RecordResponse, column: string) => {
        if (column === 'id') return row.id;
        if (column === 'createdAt') return row.createdAt;
        if (column === 'updatedAt') return row.updatedAt;
        const value = row.data?.[column];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold">Order Demo Playground</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            A learning and testing page for List parameters, Create/Edit/Delete, and Graph (Table child) API workflows.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <Badge className="border-blue-200 bg-blue-50 text-blue-700">List Query Demos</Badge>
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">CRUD Runner</Badge>
                            {hasTableField && <Badge className="border-amber-200 bg-amber-50 text-amber-700">Graph Mode Enabled (Table)</Badge>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {orderCollection && (
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPreview(true)}>
                                <BookOpen className="h-3.5 w-3.5" />
                                API Preview
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadOrderCollection()}>
                            <RotateCcw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                            Reload
                        </Button>
                    </div>
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
                <div className="flex-1 overflow-hidden px-6 py-4">
                    <Tabs defaultValue="list-demo" className="flex h-full flex-col">
                        <TabsList className="w-fit">
                            <TabsTrigger value="list-demo">List Params Demo</TabsTrigger>
                            <TabsTrigger value="crud-demo">Create / Edit / Delete</TabsTrigger>
                            <TabsTrigger value="records-view">Live Records</TabsTrigger>
                        </TabsList>

                        <TabsContent value="list-demo" className="mt-4 flex min-h-0 flex-1 gap-4">
                            <div className="w-95 shrink-0 space-y-2 overflow-auto rounded-lg border bg-muted/20 p-3">
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                    <FlaskConical className="h-4 w-4" />
                                    Query Scenarios
                                </div>
                                {listDemos.map(demo => (
                                    <div key={demo.key} className="rounded-md border bg-background p-2.5">
                                        <div className="text-sm font-medium">{demo.title}</div>
                                        <p className="mt-1 text-xs text-muted-foreground">{demo.description}</p>
                                        <Button
                                            size="sm"
                                            className="mt-2 h-7 gap-1.5 text-xs"
                                            onClick={() => void runListDemo(demo)}
                                            disabled={running}
                                        >
                                            <Play className="h-3.5 w-3.5" />
                                            Run
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="min-w-0 flex-1 space-y-3 overflow-auto rounded-lg border p-3">
                                <div className="text-sm font-medium">Execution Result</div>
                                {demoResult ? (
                                    <>
                                        <div className="rounded-md border bg-muted/30 p-2">
                                            <div className="text-xs text-muted-foreground">{demoResult.title}</div>
                                            <code className="mt-1 block text-xs">{demoResult.requestLine}</code>
                                            <div className="mt-1 text-xs">Status: {demoResult.status ?? '-'} {demoResult.error ? `(Error: ${demoResult.error})` : ''}</div>
                                        </div>

                                        {listVisualData && !demoResult.error ? (
                                            <div className="space-y-2 rounded-md border bg-background p-3">
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <Badge>Total: {listVisualData.totalItems}</Badge>
                                                    <Badge>Page: {listVisualData.page}/{listVisualData.totalPages || 1}</Badge>
                                                    <Badge>PerPage: {listVisualData.perPage}</Badge>
                                                    <Badge>Items: {listVisualData.items.length}</Badge>
                                                </div>
                                                <div className="max-h-72 overflow-auto rounded-md border">
                                                    <table className="w-full text-xs">
                                                        <thead className="sticky top-0 bg-muted/60">
                                                            <tr>
                                                                {listPreviewColumns.map(col => (
                                                                    <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {listVisualData.items.map(row => (
                                                                <tr key={row.id} className="hover:bg-accent/20">
                                                                    {listPreviewColumns.map(col => (
                                                                        <td key={`${row.id}-${col}`} className="max-w-65 truncate px-2 py-1.5" title={renderPreviewCell(row, col)}>
                                                                            {renderPreviewCell(row, col)}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : null}

                                        <pre className="min-h-70 overflow-auto rounded-md border bg-zinc-950 p-3 text-xs text-green-400">{demoResult.payload}</pre>
                                    </>
                                ) : (
                                    <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                                        Run any scenario to see request/response examples.
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="crud-demo" className="mt-4 flex min-h-0 flex-1 gap-4">
                            <div className="w-105 shrink-0 space-y-3 overflow-auto rounded-lg border bg-muted/20 p-3">
                                <div className="text-sm font-medium">Create {hasTableField ? '(Graph)' : ''}</div>
                                <Textarea value={createBody} onChange={e => setCreateBody(e.target.value)} className="min-h-45 font-mono text-xs" />
                                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void runCreate()} disabled={running}>
                                    <Play className="h-3.5 w-3.5" />
                                    Run Create
                                </Button>

                                <div className="border-t pt-3">
                                    <div className="text-sm font-medium">Update / Delete</div>
                                    <Input
                                        value={targetRecordId}
                                        onChange={e => setTargetRecordId(e.target.value)}
                                        placeholder="Target Record ID"
                                        className="mt-2"
                                    />
                                    <Textarea value={updateBody} onChange={e => setUpdateBody(e.target.value)} className="mt-2 min-h-40 font-mono text-xs" />
                                    <div className="mt-2 flex gap-2">
                                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void runUpdate()} disabled={running}>
                                            <Play className="h-3.5 w-3.5" />
                                            Run Update
                                        </Button>
                                        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void runDelete()} disabled={running}>
                                            Run Delete
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="min-w-0 flex-1 space-y-3 overflow-auto rounded-lg border p-3">
                                <div className="text-sm font-medium">Execution Result</div>
                                {demoResult ? (
                                    <>
                                        <div className="rounded-md border bg-muted/30 p-2">
                                            <div className="text-xs text-muted-foreground">{demoResult.title}</div>
                                            <code className="mt-1 block text-xs">{demoResult.requestLine}</code>
                                            <div className="mt-1 text-xs">Status: {demoResult.status ?? '-'} {demoResult.error ? `(Error: ${demoResult.error})` : ''}</div>
                                        </div>
                                        <pre className="min-h-70 overflow-auto rounded-md border bg-zinc-950 p-3 text-xs text-green-400">{demoResult.payload}</pre>
                                    </>
                                ) : (
                                    <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                                        Run Create / Update / Delete to inspect API behavior.
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="records-view" className="mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border">
                            <RecordsTable key={`${orderCollection.id}-${tableVersion}`} collection={orderCollection} onSettingsClick={() => { }} />
                        </TabsContent>
                    </Tabs>
                </div>
            ) : (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    No Order collection available.
                </div>
            )}

            {orderCollection && (
                <ApiPreviewDialog open={showPreview} onClose={() => setShowPreview(false)} collection={orderCollection} />
            )}
        </div>
    );
}

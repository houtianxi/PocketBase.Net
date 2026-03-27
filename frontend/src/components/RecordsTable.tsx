import { useEffect, useRef, useState, useMemo } from 'react';
import { Search, RotateCcw, Plus, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, MoreHorizontal, Settings, Pencil, Code2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { api, FieldType, type CollectionItem, type Field, type RecordResponse, type PagedRecordResponse } from '@/lib/api';
import { getFileMetadataBatch, getFilePreviewUrl, type FileMetadata } from '@/lib/fileUpload';
import { RecordDialog } from '@/components/RecordDialog';
import { ApiPreviewDialog } from '@/components/ApiPreviewDialog';

interface RecordsTableProps {
    collection: CollectionItem;
    schemaVersion?: number;
    onSettingsClick: () => void;
}

// Type for storing relation field lookup data
type RelationLookup = Record<string, Record<string, string>>; // { collectionId: { recordId: displayName } }
type UserLookup = Record<string, string>; // { userId: displayName/email }
type FileMetadataMap = Record<string, FileMetadata>;

function getFieldValue(data: Record<string, unknown>, fieldName: string): unknown {
    if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
        return data[fieldName];
    }

    // Legacy records may have keys with different casing.
    const fallbackKey = Object.keys(data).find(k => k.toLowerCase() === fieldName.toLowerCase());
    if (fallbackKey) {
        return data[fallbackKey];
    }

    // Common rename pattern fallback: name2 -> name, description2 -> description
    const withoutNumericSuffix = fieldName.replace(/\d+$/, '');
    if (withoutNumericSuffix && withoutNumericSuffix !== fieldName) {
        if (Object.prototype.hasOwnProperty.call(data, withoutNumericSuffix)) {
            return data[withoutNumericSuffix];
        }

        const suffixFallbackKey = Object.keys(data).find(k => k.toLowerCase() === withoutNumericSuffix.toLowerCase());
        if (suffixFallbackKey) {
            return data[suffixFallbackKey];
        }
    }

    return undefined;
}

function extractAvatarUrl(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
        const v = value.trim();
        if (!v) return null;
        if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/api/files/stream/')) {
            return v;
        }
        return getFilePreviewUrl(v, 'avatars');
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const dataUrl = typeof obj.dataUrl === 'string' ? obj.dataUrl : null;
        const url = typeof obj.url === 'string' ? obj.url : null;
        return dataUrl || url;
    }
    return null;
}

function extractFileNames(value: unknown): string[] {
    const toName = (input: unknown): string => {
        if (!input) return '';
        if (typeof input === 'string') {
            const s = input.trim();
            if (!s) return '';
            const parts = s.split('/');
            return parts[parts.length - 1] || s;
        }
        if (typeof input === 'object') {
            const obj = input as Record<string, unknown>;
            if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
            if (typeof obj.fileName === 'string' && obj.fileName.trim()) return obj.fileName.trim();
            if (typeof obj.originalFileName === 'string' && obj.originalFileName.trim()) return obj.originalFileName.trim();
            if (typeof obj.url === 'string' && obj.url.trim()) {
                const parts = obj.url.split('/');
                return parts[parts.length - 1] || obj.url;
            }
        }
        return '';
    };

    if (Array.isArray(value)) {
        return value.map(toName).filter(Boolean);
    }

    const single = toName(value);
    return single ? [single] : [];
}

function formatCellValue(
    value: unknown,
    fieldType?: FieldType,
    relationLookup?: Record<string, string>,
    userLookup?: UserLookup,
    fileMetadataMap?: FileMetadataMap,
): React.ReactNode {
    if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;
    if (fieldType === FieldType.Checkbox) {
        return (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', value ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400')}>
                {String(value)}
            </span>
        );
    }
    // Handle Relation field type - show display name instead of GUID
    if (fieldType === FieldType.Relation && relationLookup) {
        if (Array.isArray(value)) {
            // Multiple relations
            const names = value.map(id => relationLookup[String(id)] || String(id).substring(0, 8));
            if (names.length === 0) return <span className="text-muted-foreground italic">none</span>;
            return (
                <div className="flex flex-wrap gap-1">
                    {names.slice(0, 3).map((name, i) => (
                        <span key={i} className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs">{name}</span>
                    ))}
                    {names.length > 3 && <span className="text-xs text-muted-foreground">+{names.length - 3}</span>}
                </div>
            );
        } else {
            // Single relation
            const id = String(value);
            const displayName = relationLookup[id];
            if (displayName) {
                return <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs">{displayName}</span>;
            }
            // Fallback: show truncated GUID
            return <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{id.substring(0, 8)}</span>;
        }
    }
    if (fieldType === FieldType.File) {
        const fileNames = extractFileNames(value);
        if (fileNames.length === 0) return <span className="text-muted-foreground italic">no file</span>;
        if (fileNames.length === 1) {
            const item = fileMetadataMap?.[fileNames[0]];
            return <span className="text-xs">{item?.originalFileName || fileNames[0]}</span>;
        }
        return (
            <div className="flex flex-wrap gap-1">
                {fileNames.slice(0, 2).map((name, i) => (
                    <span key={i} className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs max-w-[140px] truncate">{fileMetadataMap?.[name]?.originalFileName || name}</span>
                ))}
                {fileNames.length > 2 && <span className="text-xs text-muted-foreground">+{fileNames.length - 2}</span>}
            </div>
        );
    }
    if (fieldType === FieldType.User) {
        const id = String(value || '');
        if (!id) return <span className="text-muted-foreground italic">none</span>;
        const display = userLookup?.[id] || id;
        return <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs">{display}</span>;
    }
    if (fieldType === FieldType.Email) {
        const email = String(value || '').trim();
        if (!email) return <span className="text-muted-foreground italic">empty</span>;
        return <a className="text-blue-600 hover:underline" href={`mailto:${email}`} onClick={e => e.stopPropagation()}>{email}</a>;
    }
    if (fieldType === FieldType.Url) {
        const url = String(value || '').trim();
        if (!url) return <span className="text-muted-foreground italic">empty</span>;
        return <a className="text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{url}</a>;
    }
    if (fieldType === FieldType.Textarea) {
        const html = String(value || '').trim();
        if (!html) return <span className="text-muted-foreground italic">empty</span>;
        const sanitized = DOMPurify.sanitize(html);
        return <div className="max-h-10 max-w-[260px] overflow-hidden text-sm [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0" dangerouslySetInnerHTML={{ __html: sanitized }} />;
    }
    if (fieldType === FieldType.Avatar) {
        const avatarUrl = extractAvatarUrl(value);
        if (!avatarUrl) return <span className="text-muted-foreground italic">no avatar</span>;
        return (
            <img
                src={avatarUrl}
                alt="avatar"
                className="h-8 w-8 rounded-full object-cover border"
            />
        );
    }
    if (typeof value === 'object') return <span className="font-mono text-xs text-muted-foreground">{JSON.stringify(value).slice(0, 40)}</span>;
    const str = String(value);
    if (str.length > 50) return <span title={str}>{str.slice(0, 48)}…</span>;
    return str;
}

function formatDateTime(iso: string) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
    } catch { return iso; }
}

export function RecordsTable({ collection, schemaVersion = 0, onSettingsClick }: RecordsTableProps) {
    const [fields, setFields] = useState<Field[]>([]);
    const [paged, setPaged] = useState<PagedRecordResponse>({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0, items: [] });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('-updated');
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editRecord, setEditRecord] = useState<RecordResponse | null>(null);
    const [showNewRecord, setShowNewRecord] = useState(false);
    const [showApiPreview, setShowApiPreview] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [relationLookup, setRelationLookup] = useState<RelationLookup>({});
    const [userLookup, setUserLookup] = useState<UserLookup>({});
    const [avatarMetadataMap, setAvatarMetadataMap] = useState<FileMetadataMap>({});
    const [attachmentMetadataMap, setAttachmentMetadataMap] = useState<FileMetadataMap>({});
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        loadFields();
    }, [collection.id, schemaVersion]);

    useEffect(() => {
        setPage(1);
        setSelected(new Set());
    }, [collection.id]);

    useEffect(() => {
        loadRecords();
    }, [collection.slug, page, sort]);

    useEffect(() => {
        clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => { setPage(1); loadRecords(); }, 350);
    }, [search]);

    // Load relation lookups when fields change
    useEffect(() => {
        loadRelationLookups();
    }, [fields]);

    useEffect(() => {
        loadUserLookups();
    }, [fields]);

    useEffect(() => {
        void loadFileMetadataForPage();
    }, [paged.items, fields]);

    const loadFields = async () => {
        try {
            const r = await api.get<Field[]>(`/collections/${collection.id}/fields`);
            setFields(r.data.filter(f => !f.isSystem));
        } catch { }
    };

    const loadFileMetadataForPage = async () => {
        const avatarNames = new Set<string>();
        const attachmentNames = new Set<string>();

        for (const row of paged.items) {
            for (const field of fields) {
                const value = getFieldValue(row.data, field.name);

                if (field.type === FieldType.Avatar && typeof value === 'string' && value.trim()) {
                    avatarNames.add(value.trim());
                }

                if (field.type === FieldType.File) {
                    const names = extractFileNames(value);
                    for (const name of names) attachmentNames.add(name);
                }
            }
        }

        try {
            const [avatars, attachments] = await Promise.all([
                getFileMetadataBatch(Array.from(avatarNames), 'avatars'),
                getFileMetadataBatch(Array.from(attachmentNames), 'attachments'),
            ]);

            const avatarMap: FileMetadataMap = {};
            for (const item of avatars) avatarMap[item.storedFileName] = item;
            setAvatarMetadataMap(avatarMap);

            const attachmentMap: FileMetadataMap = {};
            for (const item of attachments) attachmentMap[item.storedFileName] = item;
            setAttachmentMetadataMap(attachmentMap);
        } catch {
            setAvatarMetadataMap({});
            setAttachmentMetadataMap({});
        }
    };

    const loadRelationLookups = async () => {
        const relationFields = fields.filter(f => f.type === FieldType.Relation);
        if (relationFields.length === 0) {
            setRelationLookup({});
            return;
        }

        const lookups: RelationLookup = {};
        const collectionsRes = await api.get<CollectionItem[]>('/collections');
        const collections = collectionsRes.data;

        for (const field of relationFields) {
            try {
                let relConfig = { collectionId: '' };
                if (field.config) {
                    const cfg = typeof field.config === 'object' ? field.config as Record<string, unknown> : JSON.parse(String(field.config) || '{}');
                    relConfig = { collectionId: String(cfg.collectionId || '') };
                }

                if (relConfig.collectionId) {
                    const targetCollection = collections.find(c => c.id === relConfig.collectionId || c.slug === relConfig.collectionId);
                    if (!targetCollection) continue;

                    // Load target collection's fields to find display field
                    const fieldsRes = await api.get<Field[]>(`/collections/${targetCollection.id}/fields`);
                    const collectionFields = fieldsRes.data.filter(f => !f.isSystem);

                    // Find primary display field
                    const primaryCandidates = ['name', 'title', 'label', '名称', '标题'];
                    const textFieldTypes: number[] = [FieldType.Text, FieldType.Email, FieldType.Url, FieldType.Textarea];
                    let primaryField = collectionFields.find(f => primaryCandidates.includes(f.name.toLowerCase()))?.name;
                    if (!primaryField) {
                        const textFields = collectionFields.filter(f => textFieldTypes.includes(f.type));
                        if (textFields.length > 0) primaryField = textFields[0].name;
                    }

                    // Load records from the target collection
                    const res = await api.get<{ items: Array<{ id: string; data: Record<string, unknown> }> }>(`/records/${targetCollection.slug}`, {
                        params: { page: 1, pageSize: 200, sort: '-updated' }
                    });

                    // Build lookup map
                    const fieldLookup: Record<string, string> = {};
                    for (const item of res.data.items) {
                        const displayName = primaryField && item.data[primaryField]
                            ? String(item.data[primaryField])
                            : (item.data.name || item.data.title || item.data.label || item.id.substring(0, 8)) as string;
                        fieldLookup[item.id] = displayName;
                    }

                    lookups[relConfig.collectionId] = fieldLookup;
                }
            } catch (e) {
                console.error('Failed to load relation lookup:', e);
            }
        }

        setRelationLookup(lookups);
    };

    const loadUserLookups = async () => {
        const hasUserField = fields.some(f => f.type === FieldType.User);
        if (!hasUserField) {
            setUserLookup({});
            return;
        }

        try {
            const res = await api.get<{ items: Array<{ id: string; displayName: string; email: string }> }>('/users', {
                params: { page: 1, pageSize: 200 },
            });
            const map: UserLookup = {};
            for (const item of res.data.items ?? []) {
                map[item.id] = item.displayName || item.email || item.id;
            }
            setUserLookup(map);
        } catch {
            setUserLookup({});
        }
    };

    // Create a map from field name to its relation lookup
    const fieldRelationLookups = useMemo(() => {
        const map: Record<string, Record<string, string>> = {};
        for (const field of fields) {
            if (field.type === FieldType.Relation) {
                let relConfig = { collectionId: '' };
                try {
                    const cfg = typeof field.config === 'object' ? field.config as Record<string, unknown> : JSON.parse(String(field.config) || '{}');
                    relConfig = { collectionId: String(cfg.collectionId || '') };
                } catch { /* ignore */ }
                if (relConfig.collectionId && relationLookup[relConfig.collectionId]) {
                    map[field.name] = relationLookup[relConfig.collectionId];
                }
            }
        }
        return map;
    }, [fields, relationLookup]);

    const loadRecords = async () => {
        setLoading(true);
        try {
            const r = await api.get<PagedRecordResponse>(`/records/${collection.slug}`, {
                params: { page, pageSize: 20, sort, search: search || undefined },
            });
            setPaged(r.data);
        } catch { }
        finally { setLoading(false); }
    };

    const deleteRecord = async (id: string) => {
        await api.delete(`/records/${collection.slug}/${id}`);
        setSelected(s => { const n = new Set(s); n.delete(id); return n; });
        loadRecords();
    };

    const deleteSelected = async () => {
        for (const id of selected) await api.delete(`/records/${collection.slug}/${id}`);
        setSelected(new Set());
        loadRecords();
    };

    const toggleSort = (field: string) => {
        setSort(s => s === field ? `-${field}` : s === `-${field}` ? field : `-${field}`);
    };

    const allChecked = paged.items.length > 0 && paged.items.every(r => selected.has(r.id));
    const someChecked = paged.items.some(r => selected.has(r.id));

    // Columns: id + custom fields + created + updated
    const columns: { key: string; label: string; fieldType?: FieldType; icon?: string }[] = [
        { key: 'id', label: 'id', icon: '🔑' },
        ...fields.map(f => ({ key: f.name, label: f.name, fieldType: f.type, icon: undefined })),
        { key: 'created', label: 'created', icon: '📅' },
        { key: 'updated', label: 'updated', icon: '📅' },
    ];

    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex h-full flex-col">
                {/* Toolbar */}
                <div className="flex items-center gap-1.5 border-b bg-background px-3 py-1.5">
                    {/* Search */}
                    <div className="relative max-w-[560px] flex-1">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder='Search term or filter like created > "2022-01-01"...'
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadRecords}>
                                <RotateCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>

                    {selected.size > 0 && (
                        <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={deleteSelected}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete {selected.size}
                        </Button>
                    )}

                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => setShowApiPreview(true)}>
                        <Code2 className="h-3.5 w-3.5" />
                        API Preview
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettingsClick}>
                        <Settings className="h-4 w-4" />
                    </Button>

                    <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => setShowNewRecord(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        New record
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
                                            if (v) setSelected(new Set(paged.items.map(r => r.id)));
                                            else setSelected(new Set());
                                        }}
                                        className={someChecked && !allChecked ? 'opacity-50' : ''}
                                    />
                                </th>
                                {columns.map(col => (
                                    <th key={col.key} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">
                                        <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort(col.key)}>
                                            {col.icon && <span className="text-xs mr-0.5">{col.icon}</span>}
                                            {col.label}
                                            <ArrowUpDown className={cn('h-3 w-3', sort === col.key || sort === `-${col.key}` ? 'text-primary' : 'opacity-30')} />
                                        </button>
                                    </th>
                                ))}
                                <th className="w-10 px-2 py-2.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={columns.length + 2} className="px-4 py-10 text-center text-muted-foreground text-sm">Loading...</td></tr>
                            ) : paged.items.length === 0 ? (
                                <tr><td colSpan={columns.length + 2} className="px-4 py-16 text-center text-muted-foreground text-sm">
                                    {search ? 'No records match your search' : 'No records in this collection'}
                                </td></tr>
                            ) : (
                                paged.items.map(record => (
                                    <tr key={record.id} className={cn('group hover:bg-accent/50 cursor-pointer transition-colors', selected.has(record.id) && 'bg-primary/5')}>
                                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selected.has(record.id)}
                                                onCheckedChange={v => setSelected(s => { const n = new Set(s); v ? n.add(record.id) : n.delete(record.id); return n; })}
                                            />
                                        </td>
                                        {columns.map(col => {
                                            const isAvatarField = col.fieldType === FieldType.Avatar;
                                            const cellValue = getFieldValue(record.data, col.key);
                                            const avatarUrl = isAvatarField ? extractAvatarUrl(cellValue) : null;
                                            const avatarStoredName = isAvatarField && typeof cellValue === 'string' ? cellValue : '';
                                            const avatarDisplayName = avatarStoredName ? (avatarMetadataMap[avatarStoredName]?.originalFileName || avatarStoredName) : '';

                                            return (
                                                <td key={col.key} className="px-3 py-2 max-w-[200px] truncate" onClick={() => setEditRecord(record)}>
                                                    {col.key === 'id' ? (
                                                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                                            {String(cellValue ?? record.id).slice(0, 8)}
                                                        </span>
                                                    ) : col.key === 'created' ? formatDateTime(record.createdAt) :
                                                        col.key === 'updated' ? formatDateTime(record.updatedAt) :
                                                            isAvatarField && avatarUrl ? (
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setPreviewImageUrl(avatarUrl);
                                                                    }}
                                                                >
                                                                    <img src={avatarUrl} alt="avatar" title={avatarDisplayName} className="h-8 w-8 rounded-full object-cover border" />
                                                                </button>
                                                            ) : (
                                                                formatCellValue(cellValue, col.fieldType, fieldRelationLookups[col.key], userLookup, attachmentMetadataMap)
                                                            )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setEditRecord(record)}>
                                                        <Pencil className="mr-2 h-3.5 w-3.5" />Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive" onClick={() => deleteRecord(record.id)}>
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Pagination */}
                <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground bg-background">
                    <span>Total found: {paged.totalItems}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span>{page} / {paged.totalPages || 1}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(paged.totalPages, p + 1))} disabled={page >= paged.totalPages}>
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            {(showNewRecord || editRecord) && (
                <RecordDialog
                    open
                    collection={collection}
                    fields={fields}
                    record={editRecord}
                    onClose={() => { setShowNewRecord(false); setEditRecord(null); }}
                    onSaved={() => { setShowNewRecord(false); setEditRecord(null); loadRecords(); }}
                />
            )}

            <ApiPreviewDialog open={showApiPreview} onClose={() => setShowApiPreview(false)} collection={collection} />

            <Dialog open={!!previewImageUrl} onOpenChange={v => !v && setPreviewImageUrl(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Avatar Preview</DialogTitle>
                    </DialogHeader>
                    {previewImageUrl && (
                        <div className="flex items-center justify-center">
                            <img src={previewImageUrl} alt="avatar preview" className="max-h-[70vh] max-w-full rounded-md border object-contain" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, X, Download } from 'lucide-react';
import dayjs from 'dayjs';
import { DatePicker, Upload, ConfigProvider, message } from 'antd';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { api, FieldType, FieldTypeNames, type CollectionItem, type Field, type RecordResponse } from '@/lib/api';
import { uploadFile, deleteFile, getFilePreviewUrl, getFileDownloadUrl, getFileMetadataBatch, type FileMetadata } from '@/lib/fileUpload';
import { defaultQuillModules, createImageHandler, createVideoHandler } from '@/lib/quillConfig';

type UserListResponse = {
    items: Array<{
        id: string;
        email: string;
        displayName: string;
        isActive: boolean;
    }>;
};

type UserOption = {
    id: string;
    displayName: string;
    email: string;
    isActive: boolean;
};

const RichTextEditor = lazy(() => import('react-quill-new'));

interface RecordDialogProps {
    open: boolean;
    collection: CollectionItem;
    fields: Field[];
    record?: RecordResponse | null;
    onClose: () => void;
    onSaved: () => void;
}

type RelationRecord = {
    id: string;
    displayName: string;      // Primary display: name/title/label or first text field
    displayDesc?: string;     // Secondary display: description or second text field
    data: Record<string, unknown>;  // Full record data
};

type RelationDisplayFieldMeta = {
    name: string;
    label: string;
};

type RelationCollectionMap = Record<string, {
    id: string;
    name: string;
    displayFields: RelationDisplayFieldMeta[];
    records: RelationRecord[];
}>;

type FileMetadataMap = Record<string, FileMetadata>;

function parseFieldConfig(config: unknown): Record<string, unknown> {
    try {
        const parsed = typeof config === 'string' ? JSON.parse(config) : config;
        if (parsed && typeof parsed === 'object') {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // ignore
    }
    return {};
}

function getFieldDisplayText(field: Pick<Field, 'name' | 'label' | 'description'>): string {
    return field.description?.trim() || field.label?.trim() || field.name;
}

function RelationPickerDialog({ open, onClose, collectionName, displayFields, records, selectedIds, isMultiple, onConfirm }: {
    open: boolean;
    onClose: () => void;
    collectionName: string;
    displayFields: RelationDisplayFieldMeta[];
    records: RelationRecord[];
    selectedIds: string[];
    isMultiple: boolean;
    onConfirm: (ids: string[]) => void;
}) {
    const [search, setSearch] = useState('');
    const [local, setLocal] = useState<string[]>([]);
    const prevOpen = useRef(false);

    useEffect(() => {
        if (open && !prevOpen.current) {
            setLocal(selectedIds);
            setSearch('');
        }
        prevOpen.current = open;
    }, [open, selectedIds]);

    const columns = displayFields.length > 0
        ? displayFields
        : [{ name: 'displayName', label: collectionName }];

    const getCellValue = (record: RelationRecord, columnName: string): string => {
        if (columnName === 'displayName') return record.displayName;
        const raw = record.data[columnName];
        if (raw === null || raw === undefined) return '-';
        if (typeof raw === 'string') return raw.trim() || '-';
        if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
        if (Array.isArray(raw)) return raw.map(v => String(v)).filter(Boolean).join(' / ') || '-';
        return '-';
    };

    const filtered = records.filter(r => {
        const q = search.toLowerCase().trim();
        if (!q) return true;

        if (r.displayName.toLowerCase().includes(q)) return true;
        if ((r.displayDesc || '').toLowerCase().includes(q)) return true;
        if (r.id.toLowerCase().includes(q)) return true;

        return columns.some(col => getCellValue(r, col.name).toLowerCase().includes(q));
    });

    const toggle = (id: string) => {
        if (isMultiple) {
            setLocal(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        } else {
            setLocal(prev => prev.includes(id) ? [] : [id]);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content className={cn(
                    'fixed left-[50%] top-[50%] z-[250] max-w-[94vw] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-xl flex flex-col max-h-[82vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 overflow-hidden',
                    columns.length <= 2 ? 'w-[620px]' : columns.length <= 4 ? 'w-[820px]' : 'w-[980px]'
                )}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                        <DialogPrimitive.Title className="text-base font-semibold">选择:{collectionName}</DialogPrimitive.Title>
                        <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none">
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    </div>
                    {/* Search */}
                    <div className="px-6 py-3 border-b shrink-0">
                        <Input
                            placeholder="搜索..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {/* Title + table */}
                    <div className="px-6 pt-3 pb-2 shrink-0 text-sm">
                        {/* <span className="font-semibold text-foreground">title:</span> */}
                        {/* <span className="ml-2 text-muted-foreground">{collectionName}</span> */}
                    </div>

                    <div className="flex-1 overflow-auto min-h-0 px-6 pb-3">
                        <div className="overflow-hidden rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40">
                                    <tr>
                                        <th className="w-12 px-3 py-2 text-center font-medium text-muted-foreground">选择</th>
                                        {columns.map(col => (
                                            <th key={col.name} className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={columns.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                                                没有匹配的数据
                                            </td>
                                        </tr>
                                    ) : filtered.map(r => {
                                        const isSelected = local.includes(r.id);
                                        return (
                                            <tr
                                                key={r.id}
                                                className={cn('border-t transition-colors hover:bg-accent/40 cursor-pointer', isSelected && 'bg-accent/20')}
                                                onClick={() => toggle(r.id)}
                                            >
                                                <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            'h-5 w-5 rounded-full border-2 inline-flex items-center justify-center transition-colors',
                                                            isSelected ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'
                                                        )}
                                                        onClick={() => toggle(r.id)}
                                                    >
                                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                                    </button>
                                                </td>
                                                {columns.map(col => (
                                                    <td key={col.name} className="px-3 py-2.5 text-left text-foreground/90 whitespace-nowrap">
                                                        {getCellValue(r, col.name)}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
                        <div className="mr-auto text-xs text-muted-foreground self-center">已选 {local.length} 条</div>
                        <Button variant="outline" onClick={onClose}>取消</Button>
                        <Button onClick={() => { onConfirm(local); onClose(); }}>确认选择</Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

function UserPickerDialog({ open, onClose, users, selectedUserId, onConfirm }: {
    open: boolean;
    onClose: () => void;
    users: UserOption[];
    selectedUserId?: string;
    onConfirm: (userId: string) => void;
}) {
    const [search, setSearch] = useState('');
    const [local, setLocal] = useState<string>(selectedUserId ?? '');

    useEffect(() => {
        if (open) {
            setSearch('');
            setLocal(selectedUserId ?? '');
        }
    }, [open, selectedUserId]);

    const filtered = users.filter(user => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return user.displayName.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
    });

    return (
        <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm" />
                <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[250] w-[560px] max-w-[92vw] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-xl flex max-h-[82vh] flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b px-6 py-4">
                        <DialogPrimitive.Title className="text-base font-semibold">Select user</DialogPrimitive.Title>
                        <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none">
                            <X className="h-4 w-4" />
                        </DialogPrimitive.Close>
                    </div>

                    <div className="border-b px-6 py-3">
                        <Input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">No users found</p>
                        ) : filtered.map(user => {
                            const checked = user.id === local;
                            return (
                                <button
                                    key={user.id}
                                    type="button"
                                    className={cn(
                                        'flex w-full items-center gap-3 border-b px-6 py-3 text-left transition-colors hover:bg-accent/50',
                                        checked && 'bg-accent/25'
                                    )}
                                    onClick={() => setLocal(user.id)}
                                >
                                    <div className={cn('h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center', checked ? 'border-green-500 bg-green-500' : 'border-muted-foreground/40')}>
                                        {checked && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{user.displayName || user.email}</p>
                                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    {!user.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">inactive</span>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex justify-end gap-2 border-t px-6 py-4">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button disabled={!local} onClick={() => { onConfirm(local); onClose(); }}>Set user</Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

function RelationField({ field, value, onChange, relationCollections }: {
    field: Field;
    value: unknown;
    onChange: (v: unknown) => void;
    relationCollections?: RelationCollectionMap;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    let relConfig = { collectionId: '', relationType: 'oneToMany' };
    try {
        const cfg = typeof field.config === 'object' ? field.config as Record<string, unknown> : JSON.parse(String(field.config) || '{}');
        relConfig = { collectionId: String(cfg.collectionId || ''), relationType: String(cfg.relationType || 'oneToMany') };
    } catch { /* ignore */ }

    const isMultiple = relConfig.relationType === 'manyToMany';
    const collectionInfo = relationCollections?.[relConfig.collectionId];
    const records = collectionInfo?.records || [];
    const collectionName = collectionInfo?.name || 'records';
    const displayFields = collectionInfo?.displayFields || [];

    const selectedIds: string[] = isMultiple
        ? (Array.isArray(value) ? value as string[] : (value && typeof value === 'string' ? [value] : []))
        : (value && typeof value === 'string' ? [value] : []);

    const selectedItems = selectedIds.map(id => {
        const r = records.find(x => x.id === id);
        const lines = (r && displayFields.length > 0
            ? displayFields
                .map(meta => {
                    const raw = r.data?.[meta.name];
                    if (raw === null || raw === undefined) return null;
                    if (typeof raw === 'string') {
                        const trimmed = raw.trim();
                        return trimmed ? { label: meta.label, value: trimmed } : null;
                    }
                    if (typeof raw === 'number' || typeof raw === 'boolean') {
                        return { label: meta.label, value: String(raw) };
                    }
                    if (Array.isArray(raw)) {
                        const joined = raw.map(v => String(v)).filter(Boolean).join(' / ');
                        return joined ? { label: meta.label, value: joined } : null;
                    }
                    return null;
                })
                .filter((line): line is { label: string; value: string } => Boolean(line))
            : []);

        const title = lines[0]?.value || r?.displayName || id.substring(0, 8);
        const detailLines = lines.length > 1 ? lines.slice(1) : (
            r?.displayDesc ? [{ label: '描述', value: r.displayDesc }] : []
        );

        return {
            id,
            title,
            lines: detailLines,
        };
    });

    const visibleItems = expanded ? selectedItems : selectedItems.slice(0, 1);
    const hiddenCount = selectedItems.length - visibleItems.length;

    return (
        <>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-start gap-2">
                    <button
                        type="button"
                        className="min-h-[40px] flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-accent/20"
                        onClick={() => setPickerOpen(true)}
                    >
                        {selectedIds.length === 0 ? (
                            <span className="text-muted-foreground">选择 {collectionName}...</span>
                        ) : (
                            <span className="text-muted-foreground">已选 {selectedIds.length} 条，点击修改</span>
                        )}
                    </button>

                    {selectedIds.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => { onChange(isMultiple ? [] : ''); setExpanded(false); }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {selectedItems.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        {visibleItems.map((item, index) => (
                            <div key={`${item.id}-${index}`} className={cn(
                                'rounded-xl bg-gradient-to-br from-white via-white to-slate-50/70 shadow-sm transition-all duration-150',
                                'dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/40',
                                'hover:shadow-md'
                            )}>
                                <div className="rounded-t-xl bg-white/95 px-3.5 py-1.5 dark:bg-slate-100/95">
                                    <div className="truncate text-[12px] font-semibold tracking-wide text-slate-800 dark:text-slate-900">{item.title}</div>
                                </div>
                                {item.lines.length > 0 ? (
                                    <div className="pb-2 pt-1">
                                        {item.lines.map((line, lineIndex) => (
                                            <div
                                                key={`${line.label}-${lineIndex}`}
                                                className="grid grid-cols-[88px_1fr] items-start gap-2 px-3.5 py-0.5 text-[11px] leading-4"
                                            >
                                                <span className="truncate text-left font-medium text-muted-foreground/80">{line.label}:</span>
                                                <span className="break-words text-left text-foreground/90">{line.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}

                        {hiddenCount > 0 ? (
                            <button
                                type="button"
                                className="w-fit rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-all hover:border-primary/50 hover:bg-primary/15 hover:shadow-sm"
                                onClick={e => {
                                    e.stopPropagation();
                                    setExpanded(true);
                                }}
                            >
                                + {hiddenCount} 条
                            </button>
                        ) : null}

                        {expanded && selectedItems.length > 1 ? (
                            <button
                                type="button"
                                className="w-fit rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:underline"
                                onClick={e => {
                                    e.stopPropagation();
                                    setExpanded(false);
                                }}
                            >
                                收起
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <RelationPickerDialog
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                collectionName={collectionName}
                displayFields={displayFields}
                records={records}
                selectedIds={selectedIds}
                isMultiple={isMultiple}
                onConfirm={ids => onChange(isMultiple ? ids : (ids[0] || ''))}
            />
        </>
    );
}

function UserField({ value, onChange, users, disabled }: {
    value: unknown;
    onChange: (v: unknown) => void;
    users: UserOption[];
    disabled?: boolean;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const selectedId = typeof value === 'string' ? value : '';
    const selectedUser = users.find(u => u.id === selectedId);

    return (
        <>
            <div className="flex gap-2">
                <button
                    type="button"
                    className="flex min-h-[36px] flex-1 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-accent/30 disabled:opacity-50"
                    onClick={() => setPickerOpen(true)}
                    disabled={disabled}
                >
                    {selectedUser ? (
                        <>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs max-w-[220px] truncate">{selectedUser.displayName || selectedUser.email}</span>
                            <span className="text-xs text-muted-foreground truncate">{selectedUser.email}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">Select user...</span>
                    )}
                </button>
                {selectedId && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange('')}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <UserPickerDialog
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                users={users}
                selectedUserId={selectedId}
                onConfirm={id => onChange(id)}
            />
        </>
    );
}

/**
 * 富文本编辑器包装组件 - 正确处理Quill的image/video handlers
 */
function RichTextEditorWithHandlers({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quillRef = useRef<any>(null);

    useEffect(() => {
        // 在Quill初始化后，为其注册正确的handlers
        const registerHandlers = () => {
            // 尝试多种方式获取 Quill 实例
            let quillInstance = quillRef.current;

            // 如果是通过 getEditor() 方法访问
            if (quillRef.current?.getEditor) {
                quillInstance = quillRef.current.getEditor();
            }

            // 验证已获得 Quill 实例
            if (quillInstance?.getModule) {
                const toolbar = quillInstance.getModule('toolbar');
                if (toolbar) {
                    toolbar.addHandler('image', createImageHandler(quillInstance));
                    toolbar.addHandler('video', createVideoHandler(quillInstance));
                }
            }
        };

        // 多次尝试，因为初始化时序可能不确定
        const timers = [
            setTimeout(registerHandlers, 50),
            setTimeout(registerHandlers, 150),
            setTimeout(registerHandlers, 300),
        ];

        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    return (
        <RichTextEditor
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={onChange}
            modules={defaultQuillModules}
            placeholder={placeholder}
        />
    );
}

function DynamicField({
    field,
    value,
    onChange,
    relationCollections,
    users,
    userLoadFailed,
    avatarMetadataMap,
    attachmentMetadataMap,
    onFileUploaded,
}: {
    field: Field;
    value: unknown;
    onChange: (v: unknown) => void;
    relationCollections?: RelationCollectionMap;
    users?: UserOption[];
    userLoadFailed?: boolean;
    avatarMetadataMap: FileMetadataMap;
    attachmentMetadataMap: FileMetadataMap;
    onFileUploaded: (type: 'avatars' | 'attachments', fileName: string, metadata?: FileMetadata) => void;
}) {
    const strVal = value === null || value === undefined ? '' : String(value);

    const parseSelectValues = (config: unknown): string[] => {
        try {
            const cfg = typeof config === 'object' ? config as Record<string, unknown> : JSON.parse(String(config) || '{}') as Record<string, unknown>;

            if (Array.isArray(cfg.values)) {
                return cfg.values.map(v => String(v).trim()).filter(Boolean);
            }

            if (Array.isArray(cfg.options)) {
                return cfg.options
                    .map(option => {
                        if (typeof option === 'string') return option.trim();
                        if (option && typeof option === 'object') {
                            const obj = option as Record<string, unknown>;
                            return String(obj.value ?? obj.label ?? '').trim();
                        }
                        return '';
                    })
                    .filter(Boolean);
            }
        } catch {
            return [];
        }

        return [];
    };

    switch (field.type) {
        case FieldType.Checkbox:
            return (
                <div className="flex items-center gap-2">
                    <Switch checked={Boolean(value)} onCheckedChange={onChange} />
                    <span className="text-sm text-muted-foreground">{value ? 'true' : 'false'}</span>
                </div>
            );
        case FieldType.Number:
            return <Input type="number" value={strVal} onChange={e => onChange(e.target.value ? +e.target.value : null)} placeholder="0" />;
        case FieldType.Date:
            return (
                <ConfigProvider
                    theme={{
                        token: {
                            borderRadius: 8,
                            colorPrimary: '#2563eb',
                            controlHeight: 36,
                        },
                    }}
                >
                    <DatePicker
                        className="w-full"
                        format="YYYY-MM-DD"
                        value={strVal ? dayjs(strVal, 'YYYY-MM-DD') : null}
                        onChange={d => onChange(d ? d.format('YYYY-MM-DD') : '')}
                    />
                </ConfigProvider>
            );
        case FieldType.DateTime:
            return (
                <ConfigProvider
                    theme={{
                        token: {
                            borderRadius: 8,
                            colorPrimary: '#2563eb',
                            controlHeight: 36,
                        },
                    }}
                >
                    <DatePicker
                        className="w-full"
                        showTime
                        format="YYYY-MM-DD HH:mm:ss"
                        value={strVal ? dayjs(strVal) : null}
                        onChange={d => onChange(d ? d.toISOString() : '')}
                    />
                </ConfigProvider>
            );
        case FieldType.Email:
            return (
                <div className="space-y-2">
                    <Input type="email" value={strVal} onChange={e => onChange(e.target.value)} placeholder="user@example.com" />
                    {!!strVal && (
                        <a href={`mailto:${strVal}`} className="text-xs text-blue-600 hover:underline" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                            Send email to {strVal}
                        </a>
                    )}
                </div>
            );
        case FieldType.Url:
            return (
                <div className="space-y-2">
                    <Input type="url" value={strVal} onChange={e => onChange(e.target.value)} placeholder="https://..." />
                    {!!strVal && (
                        <a href={strVal} className="text-xs text-blue-600 hover:underline" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                            Open link
                        </a>
                    )}
                </div>
            );
        case FieldType.Textarea:
            return (
                <div className="space-y-2">
                    <div className="record-rich-editor rounded-md border">
                        <Suspense fallback={<div className="px-3 py-2 text-xs text-muted-foreground">Loading editor...</div>}>
                            <RichTextEditorWithHandlers
                                value={strVal}
                                onChange={html => onChange(html)}
                                placeholder="Write rich text..."
                            />
                        </Suspense>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Supports rich text, bold/italic, links, images and videos. Files are stored locally on server.
                    </p>
                </div>
            );
        case FieldType.Json:
            return (
                <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                    value={typeof value === 'object' ? JSON.stringify(value, null, 2) : strVal}
                    onChange={e => {
                        try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
                    }}
                    placeholder="{}"
                    spellCheck={false}
                />
            );
        case FieldType.Select: {
            const options = parseSelectValues(field.config);
            return options.length > 0 ? (
                <Select value={strVal} onValueChange={onChange}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                </Select>
            ) : (
                <Input value={strVal} onChange={e => onChange(e.target.value)} placeholder="value" />
            );
        }
        case FieldType.Relation:
            return <RelationField field={field} value={value} onChange={onChange} relationCollections={relationCollections} />;
        case FieldType.User:
            if (userLoadFailed) {
                return <Input value={strVal} onChange={e => onChange(e.target.value)} placeholder="User id" />;
            }
            return <UserField value={value} onChange={onChange} users={users ?? []} disabled={!users || users.length === 0} />;
        case FieldType.Avatar: {
            const fileName = typeof value === 'string' ? value : null;
            const previewUrl = fileName ? getFilePreviewUrl(fileName, 'avatars') : null;
            const avatarMeta = fileName ? avatarMetadataMap[fileName] : undefined;
            const displayName = avatarMeta?.originalFileName || fileName || '';

            return (
                <div className="space-y-2">
                    <Upload
                        listType="picture-card"
                        accept="image/*"
                        maxCount={1}
                        fileList={[]}
                        customRequest={async ({ file }) => {
                            try {
                                const uploaded = await uploadFile(file as File, 'avatars');
                                onChange(uploaded.fileName);
                                onFileUploaded('avatars', uploaded.fileName, {
                                    storedFileName: uploaded.fileName,
                                    originalFileName: uploaded.originalFileName || (file as File).name,
                                    mimeType: uploaded.contentType,
                                    fileSize: uploaded.fileSize,
                                    url: getFilePreviewUrl(uploaded.fileName, 'avatars'),
                                    createdAt: new Date().toISOString(),
                                });
                                message.success('Avatar uploaded');
                            } catch (err) {
                                message.error('Upload failed');
                            }
                        }}
                        onRemove={async () => {
                            if (fileName) {
                                try {
                                    await deleteFile(fileName, 'avatars');
                                    onChange(null);
                                } catch (err) {
                                    message.error('Delete failed');
                                }
                            }
                            return true;
                        }}
                    >
                        {!fileName && <div className="text-xs">Upload</div>}
                    </Upload>
                    {fileName && previewUrl && (
                        <div className="flex items-center gap-3 rounded-md border p-2">
                            <img src={previewUrl} alt="avatar" className="h-12 w-12 rounded object-cover border" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{displayName}</p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive"
                                onClick={async () => {
                                    try {
                                        await deleteFile(fileName, 'avatars');
                                        onChange(null);
                                    } catch (err) {
                                        message.error('Delete failed');
                                    }
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">JPG, PNG, GIF (Max 100MB)</p>
                </div>
            );
        }
        case FieldType.File: {
            const fileNames = Array.isArray(value) ? (value as string[]) : [];

            return (
                <div className="space-y-2">
                    <Upload
                        multiple
                        fileList={[]}
                        customRequest={async ({ file }) => {
                            try {
                                const uploaded = await uploadFile(file as File, 'attachments');
                                onChange([...fileNames, uploaded.fileName]);
                                onFileUploaded('attachments', uploaded.fileName, {
                                    storedFileName: uploaded.fileName,
                                    originalFileName: uploaded.originalFileName || (file as File).name,
                                    mimeType: uploaded.contentType,
                                    fileSize: uploaded.fileSize,
                                    url: getFileDownloadUrl(uploaded.fileName, 'attachments'),
                                    createdAt: new Date().toISOString(),
                                });
                                message.success('File uploaded');
                            } catch (err) {
                                message.error('Upload failed');
                            }
                        }}
                    >
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs">Select files</Button>
                    </Upload>
                    {fileNames.length > 0 && (
                        <div className="space-y-1.5 rounded-md border p-2">
                            {fileNames.map((fileName, index) => (
                                <div key={`${fileName}-${index}`} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/40">
                                    <span className="truncate text-xs font-medium">{attachmentMetadataMap[fileName]?.originalFileName || fileName}</span>
                                    <div className="ml-auto flex gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-xs"
                                            onClick={() => window.open(getFileDownloadUrl(fileName, 'attachments'), '_blank')}
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-[11px] text-destructive"
                                            onClick={async () => {
                                                try {
                                                    await deleteFile(fileName, 'attachments');
                                                    onChange(fileNames.filter((_, i) => i !== index));
                                                } catch (err) {
                                                    message.error('Delete failed');
                                                }
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">Max file size 100MB</p>
                </div>
            );
        }
        default:
            return <Input value={strVal} onChange={e => onChange(e.target.value)} placeholder={`Enter ${field.label || field.name}...`} />;
    }
}

export function RecordDialog({ open, collection, fields, record, onClose, onSaved }: RecordDialogProps) {
    const isEdit = !!record;
    const sortedFields = useMemo(() => [...fields].sort((a, b) => a.displayOrder - b.displayOrder), [fields]);
    const [data, setData] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [relationCollections, setRelationCollections] = useState<RelationCollectionMap>({});;
    const [users, setUsers] = useState<UserOption[]>([]);
    const [userLoadFailed, setUserLoadFailed] = useState(false);
    const [avatarMetadataMap, setAvatarMetadataMap] = useState<FileMetadataMap>({});
    const [attachmentMetadataMap, setAttachmentMetadataMap] = useState<FileMetadataMap>({});

    useEffect(() => {
        if (open) {
            if (record) {
                const { id: _id, created: _c, updated: _u, ...rest } = record.data as Record<string, unknown> & { id?: unknown; created?: unknown; updated?: unknown };
                void (_id); void (_c); void (_u);
                setData(rest);
                void loadFileMetadata(rest);
            } else {
                const defaults: Record<string, unknown> = {};
                for (const f of sortedFields) {
                    if (f.defaultValue !== undefined && f.defaultValue !== null) defaults[f.name] = f.defaultValue;
                    else if (f.type === FieldType.Checkbox) defaults[f.name] = false;
                    else if (f.type === FieldType.Number) defaults[f.name] = null;
                    else defaults[f.name] = '';
                }
                setData(defaults);
                setAvatarMetadataMap({});
                setAttachmentMetadataMap({});
            }
            setError('');

            // Load related collections for Relation fields
            const relationFields = sortedFields.filter(f => f.type === FieldType.Relation);
            if (relationFields.length > 0) {
                void loadRelationCollections(relationFields);
            }

            const hasUserField = sortedFields.some(f => f.type === FieldType.User);
            if (hasUserField) {
                void loadUsers();
            } else {
                setUsers([]);
                setUserLoadFailed(false);
            }
        }
    }, [open, record, sortedFields]);

    const loadFileMetadata = async (sourceData: Record<string, unknown>) => {
        const avatarFileNames: string[] = [];
        const attachmentFileNames: string[] = [];

        for (const field of sortedFields) {
            const value = sourceData[field.name];
            if (field.type === FieldType.Avatar && typeof value === 'string' && value.trim()) {
                avatarFileNames.push(value.trim());
            }

            if (field.type === FieldType.File && Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === 'string' && item.trim()) {
                        attachmentFileNames.push(item.trim());
                    }
                }
            }
        }

        try {
            const [avatars, attachments] = await Promise.all([
                getFileMetadataBatch(Array.from(new Set(avatarFileNames)), 'avatars'),
                getFileMetadataBatch(Array.from(new Set(attachmentFileNames)), 'attachments'),
            ]);

            const avatarMap: FileMetadataMap = {};
            for (const item of avatars) avatarMap[item.storedFileName] = item;

            const attachmentMap: FileMetadataMap = {};
            for (const item of attachments) attachmentMap[item.storedFileName] = item;

            setAvatarMetadataMap(avatarMap);
            setAttachmentMetadataMap(attachmentMap);
        } catch {
            setAvatarMetadataMap({});
            setAttachmentMetadataMap({});
        }
    };

    const handleFileUploaded = (type: 'avatars' | 'attachments', fileName: string, metadata?: FileMetadata) => {
        if (!metadata) return;
        if (type === 'avatars') {
            setAvatarMetadataMap(prev => ({ ...prev, [fileName]: metadata }));
            return;
        }
        setAttachmentMetadataMap(prev => ({ ...prev, [fileName]: metadata }));
    };

    const loadUsers = async () => {
        try {
            const res = await api.get<UserListResponse>('/users', { params: { page: 1, pageSize: 200 } });
            setUsers((res.data.items ?? []).map(item => ({
                id: item.id,
                displayName: item.displayName,
                email: item.email,
                isActive: item.isActive,
            })));
            setUserLoadFailed(false);
        } catch {
            setUsers([]);
            setUserLoadFailed(true);
        }
    };

    const loadRelationCollections = async (relationFields: Field[]) => {
        const relCollections: RelationCollectionMap = {};
        const collectionsRes = await api.get<CollectionItem[]>('/collections');
        const collections = collectionsRes.data;

        for (const field of relationFields) {
            try {
                let relConfig = { collectionId: '', relationType: 'oneToMany' };
                if (field.config) {
                    const cfg = typeof field.config === 'object' ? field.config : JSON.parse(String(field.config) || '{}');
                    relConfig = { collectionId: cfg.collectionId || '', relationType: cfg.relationType || 'oneToMany' };
                }

                if (relConfig.collectionId) {
                    const targetCollection = collections.find(c => c.id === relConfig.collectionId || c.slug === relConfig.collectionId);
                    if (!targetCollection) {
                        continue;
                    }

                    // Load fields for the target collection to determine display fields
                    const fieldsRes = await api.get<Field[]>(`/collections/${targetCollection.id}/fields`);
                    const collectionFields = fieldsRes.data.filter(f => !f.isSystem);

                    const relationDisplayFields = collectionFields
                        .filter(f => parseFieldConfig(f.config).displayInRelation === true)
                        .map(f => ({ name: f.name, label: getFieldDisplayText(f) }));

                    const fallbackFieldTypes: number[] = [FieldType.Text, FieldType.Number, FieldType.Email, FieldType.Url];
                    const fallbackDisplayFields = collectionFields
                        .filter(f => fallbackFieldTypes.includes(f.type))
                        .slice(0, 3)
                        .map(f => ({ name: f.name, label: getFieldDisplayText(f) }));

                    const displayFields = relationDisplayFields.length > 0 ? relationDisplayFields : fallbackDisplayFields;

                    // Load records
                    const res = await api.get<{ items: Array<{ id: string; data: Record<string, unknown> }> }>(`/records/${targetCollection.slug}`, {
                        params: { page: 1, pageSize: 100, sort: '-updated' }
                    });

                    relCollections[relConfig.collectionId] = {
                        id: targetCollection.id,
                        name: targetCollection.description?.trim() || targetCollection.name,
                        displayFields,
                        records: res.data.items.map(item => {
                            const data = item.data;
                            const displayNameField = displayFields[0]?.name;
                            const displayDescField = displayFields[1]?.name;
                            const displayName = displayNameField && data[displayNameField]
                                ? String(data[displayNameField])
                                : (data.name || data.title || data.label || item.id.substring(0, 8)) as string;
                            const displayDesc = displayDescField && data[displayDescField]
                                ? String(data[displayDescField])
                                : undefined;
                            return {
                                id: item.id,
                                displayName,
                                displayDesc,
                                data
                            };
                        })
                    };
                }
            } catch (e) {
                // Silently fail for relation loading
                console.error('Failed to load relation collection:', e);
            }
        }

        setRelationCollections(relCollections);
    };

    const setField = (name: string, value: unknown) => setData(d => ({ ...d, [name]: value }));

    const isRequiredFieldEmpty = (field: Field, value: unknown): boolean => {
        if (value === null || value === undefined) return true;

        if (field.type === FieldType.Checkbox) {
            // false is still a valid explicit value for required checkbox fields.
            return false;
        }

        if (field.type === FieldType.Number) {
            return value === '' || Number.isNaN(Number(value));
        }

        if (field.type === FieldType.Relation) {
            let relationType: string | undefined;
            try {
                const cfg = typeof field.config === 'object' ? field.config as Record<string, unknown> : JSON.parse(String(field.config) || '{}') as Record<string, unknown>;
                relationType = String(cfg.relationType || 'oneToMany');
            } catch { /* ignore */ }

            if (relationType === 'manyToMany') {
                return !Array.isArray(value) || value.length === 0;
            }
            return typeof value !== 'string' || value.trim().length === 0;
        }

        if (field.type === FieldType.File) {
            return !Array.isArray(value) || value.length === 0;
        }

        if (field.type === FieldType.Textarea) {
            if (typeof value !== 'string') return true;
            const plain = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
            return plain.length === 0;
        }

        if (field.type === FieldType.Avatar) {
            if (typeof value === 'string') return value.trim().length === 0;
            if (typeof value === 'object') return !value;
            return true;
        }

        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return false;
    };

    const handleSave = async () => {
        const missingRequired = sortedFields
            .filter(f => f.isRequired && isRequiredFieldEmpty(f, data[f.name]))
            .map(f => f.label || f.name);

        if (missingRequired.length > 0) {
            setError(`Please fill required fields: ${missingRequired.join(', ')}`);
            return;
        }

        setSaving(true); setError('');
        try {
            if (isEdit) {
                await api.put(`/records/${collection.slug}/${record.id}`, { data });
            } else {
                await api.post(`/records/${collection.slug}`, { data });
            }
            onSaved();
        } catch (e: unknown) {
            setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'Save failed');
        } finally { setSaving(false); }
    };

    return (
        <Sheet open={open} onOpenChange={v => !v && onClose()}>
            <SheetContent side="right" className={cn('max-w-[96vw] p-0 flex flex-col overflow-hidden', isEdit ? 'w-[760px]' : 'w-[700px]')}>
                <SheetHeader>
                    <SheetTitle>{isEdit ? `Edit record` : `New ${collection.name} record`}</SheetTitle>
                    {isEdit && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{record.id}</p>
                    )}
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                    <div className="space-y-5 pb-28">
                        {sortedFields.length === 0 && (
                            <p className="text-sm text-muted-foreground py-8 text-center">
                                No custom fields defined. Add fields in collection settings.
                            </p>
                        )}
                        {sortedFields.map(f => (
                            <div key={f.id} className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                                <div className="flex items-center gap-1.5">
                                    <Label>{f.label || f.name}</Label>
                                    {f.isRequired && <span className="text-xs text-orange-500">*</span>}
                                    <span className="ml-auto text-[10px] text-muted-foreground">{String(FieldTypeNames[f.type] ?? 'text').toLowerCase()}</span>
                                </div>
                                <DynamicField
                                    field={f}
                                    value={data[f.name]}
                                    onChange={v => setField(f.name, v)}
                                    relationCollections={relationCollections}
                                    users={users}
                                    userLoadFailed={userLoadFailed}
                                    avatarMetadataMap={avatarMetadataMap}
                                    attachmentMetadataMap={attachmentMetadataMap}
                                    onFileUploaded={handleFileUploaded}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {error && <p className="mx-6 mb-1 text-xs text-destructive">{error}</p>}
                <SheetFooter className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-20">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}</Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

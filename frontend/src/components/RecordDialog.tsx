import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ExternalLink, X, Download } from 'lucide-react';
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

type RelationCollectionMap = Record<string, {
    id: string;
    name: string;
    displayFields: string[];  // Fields used for display [primary, secondary?]
    records: RelationRecord[];
}>;

type FileMetadataMap = Record<string, FileMetadata>;

function RelationPickerDialog({ open, onClose, collectionName, records, selectedIds, isMultiple, onConfirm }: {
    open: boolean;
    onClose: () => void;
    collectionName: string;
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

    const filtered = records.filter(r => {
        const searchLower = search.toLowerCase();
        return (
            r.displayName.toLowerCase().includes(searchLower) ||
            (r.displayDesc || '').toLowerCase().includes(searchLower) ||
            r.id.toLowerCase().includes(searchLower)
        );
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
                <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[250] w-[580px] max-w-[92vw] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-xl flex flex-col max-h-[82vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                        <DialogPrimitive.Title className="text-base font-semibold">Select {collectionName} records</DialogPrimitive.Title>
                        <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none">
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    </div>
                    {/* Search */}
                    <div className="px-6 py-3 border-b shrink-0">
                        <Input
                            placeholder="Search term or filter like created > '2022-01-01'..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {/* Record list */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {filtered.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-10">No records found</p>
                        ) : filtered.map(r => {
                            const isSelected = local.includes(r.id);
                            return (
                                <div
                                    key={r.id}
                                    className={cn(
                                        'flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors hover:bg-accent/50 border-b last:border-0',
                                        isSelected && 'bg-accent/20'
                                    )}
                                    onClick={() => toggle(r.id)}
                                >
                                    <div className={cn(
                                        'h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                                        isSelected ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{r.displayName}</p>
                                        {r.displayDesc && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{r.displayDesc}</p>
                                        )}
                                    </div>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                    {/* Selected pills */}
                    {local.length > 0 && (
                        <div className="px-6 py-3 border-t bg-muted/20 shrink-0">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Selected</p>
                            <div className="flex flex-wrap gap-1.5">
                                {local.map(id => {
                                    const r = records.find(x => x.id === id);
                                    return (
                                        <div key={id} className="flex items-center gap-1 rounded-full bg-secondary border px-2.5 py-0.5 text-xs">
                                            <span className="max-w-[200px] truncate">{r?.displayName || id.substring(0, 8)}</span>
                                            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                                            <button
                                                className="ml-0.5 hover:text-destructive leading-none"
                                                onClick={e => { e.stopPropagation(); toggle(id); }}
                                            >×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {/* Footer */}
                    <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => { onConfirm(local); onClose(); }}>Set selection</Button>
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

    let relConfig = { collectionId: '', relationType: 'oneToMany' };
    try {
        const cfg = typeof field.config === 'object' ? field.config as Record<string, unknown> : JSON.parse(String(field.config) || '{}');
        relConfig = { collectionId: String(cfg.collectionId || ''), relationType: String(cfg.relationType || 'oneToMany') };
    } catch { /* ignore */ }

    const isMultiple = relConfig.relationType === 'manyToMany';
    const collectionInfo = relationCollections?.[relConfig.collectionId];
    const records = collectionInfo?.records || [];
    const collectionName = collectionInfo?.name || 'records';

    const selectedIds: string[] = isMultiple
        ? (Array.isArray(value) ? value as string[] : (value && typeof value === 'string' ? [value] : []))
        : (value && typeof value === 'string' ? [value] : []);

    return (
        <>
            <div className="flex gap-2">
                <button
                    type="button"
                    className="flex-1 min-h-[36px] flex items-center gap-1.5 flex-wrap rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm hover:bg-accent/30 cursor-pointer text-left transition-colors"
                    onClick={() => setPickerOpen(true)}
                >
                    {selectedIds.length === 0 ? (
                        <span className="text-muted-foreground">Select {collectionName}...</span>
                    ) : selectedIds.map(id => {
                        const r = records.find(x => x.id === id);
                        return (
                            <span key={id} className="rounded-full bg-secondary px-2 py-0.5 text-xs max-w-[200px] truncate">
                                {r?.displayName || id.substring(0, 8)}
                            </span>
                        );
                    })}
                </button>
                {selectedIds.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => onChange(isMultiple ? [] : '')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
            <RelationPickerDialog
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                collectionName={collectionName}
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

                    // Determine display fields: primary (name/title/label or first text field) and secondary (description or second text field)
                    const primaryCandidates = ['name', 'title', 'label', '名称', '标题'];
                    const secondaryCandidates = ['description', 'desc', 'summary', '描述', '备注'];
                    const textFieldTypes: number[] = [FieldType.Text, FieldType.Email, FieldType.Url, FieldType.Textarea];

                    let primaryField = collectionFields.find(f => primaryCandidates.includes(f.name.toLowerCase()))?.name;
                    let secondaryField = collectionFields.find(f => secondaryCandidates.includes(f.name.toLowerCase()))?.name;

                    // Fallback: use first/second text fields
                    if (!primaryField) {
                        const textFields = collectionFields.filter(f => textFieldTypes.includes(f.type));
                        if (textFields.length > 0) primaryField = textFields[0].name;
                    }
                    if (!secondaryField) {
                        const textFields = collectionFields.filter(f => textFieldTypes.includes(f.type) && f.name !== primaryField);
                        if (textFields.length > 0) secondaryField = textFields[0].name;
                    }

                    const displayFields = [primaryField, secondaryField].filter(Boolean) as string[];

                    // Load records
                    const res = await api.get<{ items: Array<{ id: string; data: Record<string, unknown> }> }>(`/records/${targetCollection.slug}`, {
                        params: { page: 1, pageSize: 100, sort: '-updated' }
                    });

                    relCollections[relConfig.collectionId] = {
                        id: targetCollection.id,
                        name: targetCollection.name,
                        displayFields,
                        records: res.data.items.map(item => {
                            const data = item.data;
                            // Build display name: use primary field, or fallback to id
                            const displayName = primaryField && data[primaryField]
                                ? String(data[primaryField])
                                : (data.name || data.title || data.label || item.id.substring(0, 8)) as string;
                            // Build display description: use secondary field if available
                            const displayDesc = secondaryField && data[secondaryField]
                                ? String(data[secondaryField])
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

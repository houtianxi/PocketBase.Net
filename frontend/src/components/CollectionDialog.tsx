import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, Check, X, Pencil, AlertTriangle, MoreVertical, Copy, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
    api,
    FieldType,
    type CollectionItem,
    type Field,
    type FieldType as FieldTypeValue,
} from '@/lib/api';

//  field-type metadata 
interface TypeMeta {
    label: string;
    icon: string;
    colorClass: string;
    bgClass: string;
    description: string;
}

const TYPE_META: Record<number, TypeMeta> = {
    [FieldType.Text]: { label: 'Text', icon: 'Aa', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-950', description: 'Plain text' },
    [FieldType.Number]: { label: 'Number', icon: '123', colorClass: 'text-purple-600 dark:text-purple-400', bgClass: 'bg-purple-100 dark:bg-purple-950', description: 'Integer or decimal' },
    [FieldType.Checkbox]: { label: 'Bool', icon: 'CB', colorClass: 'text-green-600 dark:text-green-400', bgClass: 'bg-green-100 dark:bg-green-950', description: 'True / False' },
    [FieldType.Select]: { label: 'Select', icon: 'SL', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-100 dark:bg-amber-950', description: 'Predefined options' },
    [FieldType.Email]: { label: 'Email', icon: '@', colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-100 dark:bg-orange-950', description: 'Email address' },
    [FieldType.Url]: { label: 'URL', icon: 'URL', colorClass: 'text-teal-600 dark:text-teal-400', bgClass: 'bg-teal-100 dark:bg-teal-950', description: 'Web address' },
    [FieldType.Date]: { label: 'Date', icon: 'D', colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-100 dark:bg-indigo-950', description: 'Date without time' },
    [FieldType.DateTime]: { label: 'DateTime', icon: 'DT', colorClass: 'text-indigo-700 dark:text-indigo-300', bgClass: 'bg-indigo-100 dark:bg-indigo-950', description: 'Date and time' },
    [FieldType.Textarea]: { label: 'Editor', icon: 'TX', colorClass: 'text-sky-600 dark:text-sky-400', bgClass: 'bg-sky-100 dark:bg-sky-950', description: 'Rich / long text' },
    [FieldType.Json]: { label: 'JSON', icon: '{}', colorClass: 'text-yellow-600 dark:text-yellow-400', bgClass: 'bg-yellow-100 dark:bg-yellow-950', description: 'Arbitrary JSON value' },
    [FieldType.File]: { label: 'File', icon: 'FL', colorClass: 'text-slate-500 dark:text-slate-400', bgClass: 'bg-slate-100 dark:bg-slate-800', description: 'File upload' },
    [FieldType.Avatar]: { label: 'Avatar', icon: 'AV', colorClass: 'text-violet-600 dark:text-violet-400', bgClass: 'bg-violet-100 dark:bg-violet-950', description: 'Avatar image' },
    [FieldType.Relation]: { label: 'Relation', icon: 'RL', colorClass: 'text-rose-600 dark:text-rose-400', bgClass: 'bg-rose-100 dark:bg-rose-950', description: 'Link to another collection' },
    [FieldType.User]: { label: 'User', icon: 'US', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-950', description: 'User reference' },
    [FieldType.AutoIncrement]: { label: 'AutoIncrement', icon: '++', colorClass: 'text-gray-600 dark:text-gray-400', bgClass: 'bg-gray-100 dark:bg-gray-800', description: 'Auto-increment integer' },
};

const TYPE_ORDER: FieldTypeValue[] = [
    FieldType.Text, FieldType.Number, FieldType.Checkbox, FieldType.Select,
    FieldType.Email, FieldType.Url, FieldType.Date, FieldType.DateTime,
    FieldType.Textarea, FieldType.Json, FieldType.File, FieldType.Avatar,
    FieldType.Relation, FieldType.User, FieldType.AutoIncrement,
];

const RULE_OPTIONS = [
    { value: '0', label: 'Public (anyone)' },
    { value: '1', label: 'Authenticated users' },
    { value: '2', label: 'Record owner only' },
    { value: '3', label: 'Admin only' },
];

//  helpers 
function parseSelectOpts(config: unknown): string[] {
    try {
        const c = typeof config === 'string' ? JSON.parse(config) : config;
        if (c && Array.isArray((c as { values?: unknown[] }).values))
            return ((c as { values: unknown[] }).values).map(v => String(v).trim()).filter(Boolean);
    } catch { /* */ }
    return [];
}

function parseRelation(config: unknown): { collectionId: string; relationType: 'oneToMany' | 'manyToMany' } {
    try {
        const c = typeof config === 'string' ? JSON.parse(config) : config;
        if (c && typeof c === 'object') {
            const r = c as Record<string, unknown>;
            return {
                collectionId: String(r.collectionId ?? ''),
                relationType: r.relationType === 'manyToMany' ? 'manyToMany' : 'oneToMany',
            };
        }
    } catch { /* */ }
    return { collectionId: '', relationType: 'oneToMany' };
}

function buildCfg(
    type: FieldTypeValue,
    selectOpts: string[],
    relCollId: string,
    relType: 'oneToMany' | 'manyToMany',
): string {
    if (type === FieldType.Select)
        return JSON.stringify({ values: selectOpts.map(v => v.trim()).filter(Boolean) });
    if (type === FieldType.Relation)
        return JSON.stringify({ collectionId: relCollId, relationType: relType });
    return '{}';
}

//  Field draft 
interface FieldDraft {
    name: string;
    label: string;
    type: FieldTypeValue;
    isRequired: boolean;
    isUnique: boolean;
    selectOpts: string[];
    relCollId: string;
    relType: 'oneToMany' | 'manyToMany';
}

const EMPTY_DRAFT: FieldDraft = {
    name: '', label: '', type: FieldType.Text,
    isRequired: false, isUnique: false,
    selectOpts: [''], relCollId: '', relType: 'oneToMany',
};

function toDraft(f: Field): FieldDraft {
    const opts = parseSelectOpts(f.config);
    const rel = parseRelation(f.config);
    return {
        name: f.name, label: f.label, type: f.type,
        isRequired: f.isRequired, isUnique: f.isUnique,
        selectOpts: opts.length ? opts : [''],
        relCollId: rel.collectionId, relType: rel.relationType,
    };
}

//  TypePicker 
function TypePicker({ value, onChange }: { value: FieldTypeValue; onChange: (t: FieldTypeValue) => void }) {
    const selectedMeta = TYPE_META[value] ?? TYPE_META[FieldType.Text];

    return (
        <Select value={String(value)} onValueChange={v => onChange(Number(v) as FieldTypeValue)}>
            <SelectTrigger className="h-9">
                <div className="flex items-center gap-2">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold', selectedMeta.bgClass, selectedMeta.colorClass)}>
                        {selectedMeta.icon}
                    </span>
                    <span className="text-sm font-medium">{selectedMeta.label}</span>
                </div>
            </SelectTrigger>
            <SelectContent className="z-[9999]">
                {TYPE_ORDER.map(t => {
                    const m = TYPE_META[t];
                    return (
                        <SelectItem key={t} value={String(t)}>
                            <div className="flex items-center gap-2">
                                <span className={cn('flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold', m.bgClass, m.colorClass)}>{m.icon}</span>
                                <span>{m.label}</span>
                            </div>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}

//  TypeBadge (field row) 
function TypeBadge({ type }: { type: FieldTypeValue }) {
    const m = TYPE_META[type] ?? { icon: '?', bgClass: 'bg-muted', colorClass: 'text-muted-foreground' };
    return (
        <span className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold',
            m.bgClass, m.colorClass,
        )}>
            {m.icon}
        </span>
    );
}

//  FieldEditor 
interface FieldEditorProps {
    initial: FieldDraft;
    isNew: boolean;
    allCollections: CollectionItem[];
    collectionId?: string;
    onSave: (d: FieldDraft) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

function FieldEditor({ initial, isNew, allCollections, collectionId, onSave, onCancel, onDirtyChange }: FieldEditorProps) {
    const [d, setD] = useState<FieldDraft>(initial);
    const [err, setErr] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => { nameRef.current?.focus(); }, []);

    const p = (patch: Partial<FieldDraft>) => { setD(prev => ({ ...prev, ...patch })); setErr(''); };
    const meta = TYPE_META[d.type] ?? TYPE_META[FieldType.Text];
    const isDirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(initial), [d, initial]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const validate = (): string | null => {
        if (!d.name.trim()) return 'Field name is required';
        if (!/^[a-z][a-z0-9_]*$/.test(d.name))
            return 'Name must be lowercase, start with a letter, only letters/digits/underscores';
        if (d.type === FieldType.Select && !d.selectOpts.some(o => o.trim()))
            return 'At least one option is required';
        if (d.type === FieldType.Relation && !d.relCollId)
            return 'Target collection is required';
        return null;
    };

    const handleSave = () => {
        const e = validate();
        if (e) { setErr(e); return; }
        onSave(d);
    };

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Type picker */}
            <div className="border-b bg-muted/30 px-4 py-3">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {isNew ? 'Choose field type' : 'Field type'}
                </p>
                <TypePicker value={d.type} onChange={t => p({ type: t })} />
            </div>

            {/* Config form */}
            <div className="p-4 space-y-4">
                {/* Active type indicator */}
                <div className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2', meta.bgClass)}>
                    <TypeBadge type={d.type} />
                    <span className={cn('text-sm font-semibold', meta.colorClass)}>{meta.label}</span>
                    <span className="text-xs text-muted-foreground"> {meta.description}</span>
                </div>

                {/* Name + Label */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Name *</Label>
                        <Input
                            ref={nameRef}
                            className="h-8 font-mono text-xs"
                            placeholder="field_name"
                            value={d.name}
                            onChange={e => p({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^([0-9])/, '_$1') })}
                            onKeyDown={e => e.key === 'Enter' && d.type !== FieldType.Select && d.type !== FieldType.Relation && handleSave()}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Label <span className="text-muted-foreground font-normal">(display)</span></Label>
                        <Input
                            className="h-8 text-xs"
                            placeholder="Human readable label"
                            value={d.label}
                            onChange={e => p({ label: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && d.type !== FieldType.Select && d.type !== FieldType.Relation && handleSave()}
                        />
                    </div>
                </div>

                {/* Required + Unique */}
                <div className="flex items-center gap-6 rounded-lg border border-dashed px-4 py-2.5 bg-muted/20">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <Switch checked={d.isRequired} onCheckedChange={v => p({ isRequired: v })} />
                        <div>
                            <p className="text-xs font-medium">Required</p>
                            <p className="text-[10px] text-muted-foreground">Must have a value</p>
                        </div>
                    </label>
                    <Separator orientation="vertical" className="h-8" />
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <Switch checked={d.isUnique} onCheckedChange={v => p({ isUnique: v })} />
                        <div>
                            <p className="text-xs font-medium">Unique</p>
                            <p className="text-[10px] text-muted-foreground">No duplicate values</p>
                        </div>
                    </label>
                </div>

                {/* Select: options */}
                {d.type === FieldType.Select && (
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Options *</Label>
                        <div className="rounded-lg border divide-y">
                            {d.selectOpts.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                                    <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                                    <Input
                                        className="h-7 border-0 bg-transparent px-1 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                                        placeholder={`Option ${i + 1}`}
                                        value={opt}
                                        onChange={e => {
                                            const next = [...d.selectOpts];
                                            next[i] = e.target.value;
                                            p({ selectOpts: next });
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                p({ selectOpts: [...d.selectOpts, ''] });
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button" variant="ghost" size="icon"
                                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                        disabled={d.selectOpts.length <= 1}
                                        onClick={() => p({ selectOpts: d.selectOpts.filter((_, j) => j !== i) })}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button
                            type="button" variant="outline" size="sm" className="h-7 text-xs border-dashed"
                            onClick={() => p({ selectOpts: [...d.selectOpts, ''] })}
                        >
                            <Plus className="mr-1 h-3.5 w-3.5" />Add option
                        </Button>
                    </div>
                )}

                {/* Relation: collection + cardinality */}
                {d.type === FieldType.Relation && (
                    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Target collection *</Label>
                            <Select
                                value={d.relCollId || '__none__'}
                                onValueChange={v => p({ relCollId: v === '__none__' ? '' : v })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select a collection" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__" className="text-xs italic text-muted-foreground">Select a collection</SelectItem>
                                    {allCollections
                                        .filter(c => c.id !== collectionId)
                                        .map(c => (
                                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Cardinality</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['oneToMany', 'manyToMany'] as const).map(rt => (
                                    <button
                                        key={rt}
                                        type="button"
                                        onClick={() => p({ relType: rt })}
                                        className={cn(
                                            'rounded-lg border-2 py-2.5 text-xs font-medium transition-all',
                                            d.relType === rt
                                                ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                : 'border-border text-muted-foreground hover:bg-muted/40',
                                        )}
                                    >
                                        {rt === 'oneToMany'
                                            ? <><div className="text-base leading-none">1 : N</div><div className="text-[10px] mt-0.5 font-normal">Single record</div></>
                                            : <><div className="text-base leading-none">N : N</div><div className="text-[10px] mt-0.5 font-normal">Multiple records</div></>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Error + Actions */}
                {err && <p className="text-xs text-destructive">{err}</p>}
                <div className="flex justify-end gap-2 pt-1 border-t">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
                    <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {isNew ? 'Add field' : 'Update field'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

//  EditableField 
interface EditableField extends Field { _draft?: boolean }

//  CollectionDialog 
interface CollectionDialogProps {
    open: boolean;
    onClose: () => void;
    collection?: CollectionItem | null;
    onSaved: () => void | Promise<void>;
}

export function CollectionDialog({ open, onClose, collection, onSaved }: CollectionDialogProps) {
    const isEdit = !!collection;

    const [collName, setCollName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [listRule, setListRule] = useState('1');
    const [viewRule, setViewRule] = useState('1');
    const [createRule, setCreateRule] = useState('1');
    const [updateRule, setUpdateRule] = useState('2');
    const [deleteRule, setDeleteRule] = useState('2');
    const [fields, setFields] = useState<EditableField[]>([]);
    const [allCollections, setAllCollections] = useState<CollectionItem[]>([]);

    // editor state: null = none, 'new' = adding, or field.id = editing
    const [editorOpen, setEditorOpen] = useState<'new' | string | null>(null);

    // drag state
    const dragItem = useRef<number | null>(null);
    const dragOver = useRef<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [fieldEditorDirty, setFieldEditorDirty] = useState(false);
    const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
    const [confirmActionOpen, setConfirmActionOpen] = useState<'delete' | 'truncate' | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(''); setStatus(''); setEditorOpen(null); setFieldEditorDirty(false); setConfirmSaveOpen(false); setConfirmActionOpen(null);

        api.get<CollectionItem[]>('/collections').then(r => setAllCollections(r.data)).catch(() => { });

        if (collection) {
            setCollName(collection.name);
            setSlug(collection.slug);
            setDescription(collection.description ?? '');
            setListRule(String(collection.listRule));
            setViewRule(String(collection.viewRule));
            setCreateRule(String(collection.createRule));
            setUpdateRule(String(collection.updateRule));
            setDeleteRule(String(collection.deleteRule));
            api.get<Field[]>(`/collections/${collection.id}/fields`)
                .then(r => setFields(r.data.filter(f => !f.isSystem)))
                .catch(() => setFields([]));
        } else {
            setCollName(''); setSlug(''); setDescription('');
            setListRule('1'); setViewRule('1'); setCreateRule('1');
            setUpdateRule('2'); setDeleteRule('2');
            setFields([]);
        }
    }, [open, collection]);

    const handleNameChange = (v: string) => {
        setCollName(v);
        if (!isEdit)
            setSlug(v.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, ''));
    };

    //  field CRUD 
    const handleCreateField = async (draft: FieldDraft) => {
        setError('');
        if (isEdit && collection) {
            try {
                const res = await api.post<Field>(`/collections/${collection.id}/fields`, {
                    name: draft.name,
                    label: draft.label || draft.name,
                    type: draft.type,
                    isRequired: draft.isRequired,
                    isUnique: draft.isUnique,
                    config: buildCfg(draft.type, draft.selectOpts, draft.relCollId, draft.relType),
                });
                setFields(prev => [...prev, res.data]);
            } catch (e: unknown) {
                setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed to add field');
                return;
            }
        } else {
            const temp: EditableField = {
                id: crypto.randomUUID(),
                collectionDefinitionId: '',
                name: draft.name,
                label: draft.label || draft.name,
                type: draft.type,
                isRequired: draft.isRequired,
                isUnique: draft.isUnique,
                config: JSON.parse(buildCfg(draft.type, draft.selectOpts, draft.relCollId, draft.relType)) as Record<string, unknown>,
                displayOrder: fields.length,
                isSystem: false,
                createdAt: '',
                updatedAt: '',
                _draft: true,
            };
            setFields(prev => [...prev, temp]);
        }
        setEditorOpen(null);
    };

    const handleUpdateField = async (f: EditableField, draft: FieldDraft) => {
        setError('');
        if (isEdit && collection && !f._draft) {
            try {
                await api.put(`/collections/${collection.id}/fields/${f.id}`, {
                    name: draft.name,
                    label: draft.label || draft.name,
                    type: draft.type,
                    isRequired: draft.isRequired,
                    isUnique: draft.isUnique,
                    config: buildCfg(draft.type, draft.selectOpts, draft.relCollId, draft.relType),
                });
            } catch (e: unknown) {
                setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed to update field');
                return;
            }
        }
        setFields(prev => prev.map(x => x.id !== f.id ? x : {
            ...x,
            name: draft.name,
            label: draft.label || draft.name,
            type: draft.type,
            isRequired: draft.isRequired,
            isUnique: draft.isUnique,
            config: JSON.parse(buildCfg(draft.type, draft.selectOpts, draft.relCollId, draft.relType)) as Record<string, unknown>,
        }));
        setEditorOpen(null);
        setFieldEditorDirty(false);
    };

    const handleDeleteField = async (f: EditableField) => {
        if (isEdit && collection && !f._draft) {
            try { await api.delete(`/collections/${collection.id}/fields/${f.id}`); } catch { /* ignore */ }
        }
        setFields(prev => prev.filter(x => x.id !== f.id));
        if (editorOpen === f.id) setEditorOpen(null);
    };

    //  drag reorder 
    const handleDragEnd = async () => {
        const from = dragItem.current;
        const to = dragOver.current;
        dragItem.current = null; dragOver.current = null;
        setDragging(null); setDragTarget(null);
        if (from === null || to === null || from === to) return;
        const reordered = [...fields];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        setFields(reordered);
        if (isEdit && collection) {
            const fieldOrders = Object.fromEntries(
                reordered.filter(f => !f._draft).map((f, i) => [f.id, i])
            );
            try { await api.post(`/collections/${collection.id}/fields/reorder`, fieldOrders); } catch { /* ignore */ }
        }
    };

    const confirmDiscardAndSave = async () => {
        setConfirmSaveOpen(false);
        setEditorOpen(null);
        setFieldEditorDirty(false);
        await handleSave();
    };

    //  save collection 
    const handleSave = async () => {
        if (!collName.trim()) { setError('Collection name is required'); return; }
        if (editorOpen && fieldEditorDirty) {
            setConfirmSaveOpen(true);
            return;
        }
        // Close inline field editor so "Save changes" feels final and immediate.
        setEditorOpen(null);
        setFieldEditorDirty(false);
        setSaving(true); setError(''); setStatus('');
        try {
            const payload = {
                name: collName.trim(), slug: slug.trim(), description,
                listRule: +listRule, viewRule: +viewRule, createRule: +createRule,
                updateRule: +updateRule, deleteRule: +deleteRule, schemaJson: '{}',
            };
            if (isEdit) {
                await api.put(`/collections/${collection!.id}`, payload);
                setStatus('Collection saved');
                await onSaved();
                onClose();
            } else {
                const res = await api.post<CollectionItem>('/collections', payload);
                for (const f of fields) {
                    await api.post(`/collections/${res.data.id}/fields`, {
                        name: f.name, label: f.label || f.name, type: f.type,
                        isRequired: f.isRequired, isUnique: f.isUnique,
                        config: JSON.stringify(f.config ?? {}),
                    });
                }
                await onSaved(); onClose(); return;
            }
        } catch (e: unknown) {
            setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Save failed');
        } finally { setSaving(false); }
    };

    const handleDuplicate = async () => {
        if (!isEdit || !collection) return;
        setSaving(true);
        try {
            const res = await api.post<CollectionItem>(`/collections/${collection.id}/duplicate`, {});
            await onSaved();
            setStatus(`Collection duplicated as "${res.data.name}"`);
            onClose();
        } catch (e: unknown) {
            setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Duplicate failed');
        } finally { setSaving(false); }
    };

    const handleTruncate = async () => {
        if (!isEdit || !collection) return;
        setSaving(true);
        try {
            await api.post(`/collections/${collection.id}/truncate`, {});
            await onSaved();
            setStatus('All collection data cleared');
            setConfirmActionOpen(null);
        } catch (e: unknown) {
            setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Truncate failed');
        } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!isEdit || !collection) return;
        setSaving(true);
        try {
            await api.delete(`/collections/${collection.id}`);
            await onSaved();
            setStatus('Collection deleted');
            onClose();
        } catch (e: unknown) {
            setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Delete failed');
        } finally { setSaving(false); }
    };

    const fieldSubtitle = (f: EditableField): string => {
        if (f.type === FieldType.Select) {
            const n = parseSelectOpts(f.config).length;
            return n ? `${n} option${n > 1 ? 's' : ''}` : '';
        }
        if (f.type === FieldType.Relation) {
            const { collectionId, relationType } = parseRelation(f.config);
            const name = allCollections.find(c => c.id === collectionId)?.name;
            return name ? ` ${name} (${relationType === 'manyToMany' ? 'N:N' : '1:N'})` : '';
        }
        return '';
    };

    return (
        <Sheet open={open} onOpenChange={v => !v && onClose()}>
            <SheetContent side="right" className="w-[640px] max-w-[95vw] p-0 flex flex-col">
                <SheetHeader className="px-6 pt-5 pb-4 border-b flex items-center justify-between">
                    <SheetTitle className="text-base font-semibold">
                        {isEdit
                            ? <><span className="text-muted-foreground font-normal">Edit collection /</span>{' '}<span className="font-mono text-primary">{collection?.name}</span></>
                            : 'New collection'
                        }
                    </SheetTitle>
                    {isEdit && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={handleDuplicate} disabled={saving}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setConfirmActionOpen('truncate')} disabled={saving} className="text-amber-600 dark:text-amber-400">
                                    <Zap className="mr-2 h-4 w-4" />
                                    Truncate Data
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setConfirmActionOpen('delete')} disabled={saving} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Collection
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </SheetHeader>

                <Tabs defaultValue="fields" className="flex flex-1 flex-col overflow-hidden">
                    <div className="px-6 pt-3 shrink-0">
                        <TabsList className="w-full">
                            <TabsTrigger value="fields" className="flex-1">Fields</TabsTrigger>
                            <TabsTrigger value="rules" className="flex-1">API Rules</TabsTrigger>
                        </TabsList>
                    </div>

                    {/*  FIELDS TAB  */}
                    <TabsContent value="fields" className="flex-1 overflow-hidden flex flex-col mt-0">
                        <ScrollArea className="flex-1 px-6 py-4">
                            <div className="space-y-6 pb-8">

                                {/* Collection info */}
                                <section className="space-y-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Collection info</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Name *</Label>
                                            <Input
                                                placeholder='e.g. "posts"'
                                                value={collName}
                                                onChange={e => handleNameChange(e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Slug</Label>
                                            <Input
                                                placeholder="auto-generated"
                                                value={slug}
                                                onChange={e => setSlug(e.target.value)}
                                                className="h-9 font-mono text-sm"
                                                readOnly={isEdit}
                                            />
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                            <Label className="text-xs">Description</Label>
                                            <Input
                                                placeholder="Optional"
                                                value={description}
                                                onChange={e => setDescription(e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                    </div>
                                </section>

                                <Separator />

                                {/* System fields */}
                                <section className="space-y-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">System fields</p>
                                    <div className="rounded-lg border bg-muted/20 divide-y">
                                        {[
                                            { name: 'id', icon: '#', colorClass: 'text-blue-500', bgClass: 'bg-blue-50 dark:bg-blue-950', note: 'Primary key' },
                                            { name: 'created', icon: 'D', colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50 dark:bg-indigo-950', note: 'Created at' },
                                            { name: 'updated', icon: 'D', colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50 dark:bg-indigo-950', note: 'Updated at' },
                                        ].map(sf => (
                                            <div key={sf.name} className="flex items-center gap-3 px-3 py-2.5">
                                                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold', sf.bgClass, sf.colorClass)}>
                                                    {sf.icon}
                                                </span>
                                                <span className="font-mono text-sm font-medium">{sf.name}</span>
                                                <span className="text-xs text-muted-foreground">{sf.note}</span>
                                                <span className="ml-auto text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">auto</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Custom fields */}
                                <section className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                            Custom fields
                                            {fields.length > 0 && (
                                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground/70 normal-case tracking-normal">
                                                    {fields.length}
                                                </span>
                                            )}
                                        </p>
                                        {fields.length > 1 && (
                                            <span className="text-[10px] text-muted-foreground/50">drag to reorder</span>
                                        )}
                                    </div>

                                    {fields.length > 0 && (
                                        <div className="rounded-lg border overflow-hidden divide-y">
                                            {fields.map((f, idx) => {
                                                const meta = TYPE_META[f.type] ?? TYPE_META[FieldType.Text];
                                                const sub = fieldSubtitle(f);
                                                const isEditing = editorOpen === f.id;
                                                return (
                                                    <div key={f.id}>
                                                        <div
                                                            draggable={!isEditing}
                                                            onDragStart={() => { dragItem.current = idx; setDragging(idx); }}
                                                            onDragEnter={() => { dragOver.current = idx; setDragTarget(idx); }}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={e => e.preventDefault()}
                                                            className={cn(
                                                                'group flex items-center gap-3 px-3 py-2.5 transition-colors cursor-default',
                                                                isEditing && 'bg-muted/40',
                                                                !isEditing && dragging === idx && 'opacity-40',
                                                                !isEditing && dragTarget === idx && dragging !== idx && 'bg-primary/5 ring-inset ring-1 ring-primary/30',
                                                            )}
                                                        >
                                                            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
                                                            <TypeBadge type={f.type} />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-sm font-medium">{f.name}</span>
                                                                    {f.label && f.label !== f.name && (
                                                                        <span className="text-xs text-muted-foreground truncate">{f.label}</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[11px] text-muted-foreground/70">{meta.label}</span>
                                                                    {sub && <span className="text-[11px] text-muted-foreground/50">{sub}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {f.isRequired && (
                                                                    <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">Required</span>
                                                                )}
                                                                {f.isUnique && (
                                                                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Unique</span>
                                                                )}
                                                                <div className="ml-1 flex items-center gap-1 opacity-100">
                                                                    <Button
                                                                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                                        title={isEditing ? 'Close editor' : 'Edit field'}
                                                                        onClick={() => {
                                                                            setEditorOpen(isEditing ? null : f.id);
                                                                            if (isEditing) setFieldEditorDirty(false);
                                                                        }}
                                                                    >
                                                                        {isEditing ? (
                                                                            <X className="h-3.5 w-3.5" />
                                                                        ) : (
                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                                        onClick={() => handleDeleteField(f)}
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {isEditing && (
                                                            <div className="px-3 pb-3 bg-muted/10 border-t">
                                                                <div className="pt-3">
                                                                    <FieldEditor
                                                                        initial={toDraft(f)}
                                                                        isNew={false}
                                                                        allCollections={allCollections}
                                                                        collectionId={collection?.id}
                                                                        onSave={d => handleUpdateField(f, d)}
                                                                        onCancel={() => { setEditorOpen(null); setFieldEditorDirty(false); }}
                                                                        onDirtyChange={setFieldEditorDirty}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {editorOpen === 'new' ? (
                                        <FieldEditor
                                            initial={EMPTY_DRAFT}
                                            isNew={true}
                                            allCollections={allCollections}
                                            collectionId={collection?.id}
                                            onSave={handleCreateField}
                                            onCancel={() => { setEditorOpen(null); setFieldEditorDirty(false); }}
                                            onDirtyChange={setFieldEditorDirty}
                                        />
                                    ) : (
                                        <Button
                                            variant="outline"
                                            className="w-full h-10 gap-2 border-dashed text-muted-foreground hover:text-foreground"
                                            onClick={() => setEditorOpen('new')}
                                        >
                                            <Plus className="h-4 w-4" />Add field
                                        </Button>
                                    )}
                                </section>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {/*  API RULES TAB  */}
                    <TabsContent value="rules" className="flex-1 overflow-hidden flex flex-col mt-0">
                        <ScrollArea className="flex-1 px-6 py-4">
                            <div className="space-y-5">
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Control who can perform each operation on this collection's records.
                                </p>
                                {[
                                    { label: 'List rule', desc: 'Query / list records', value: listRule, onChange: setListRule },
                                    { label: 'View rule', desc: 'Read a single record', value: viewRule, onChange: setViewRule },
                                    { label: 'Create rule', desc: 'Create new records', value: createRule, onChange: setCreateRule },
                                    { label: 'Update rule', desc: 'Edit existing records', value: updateRule, onChange: setUpdateRule },
                                    { label: 'Delete rule', desc: 'Delete records', value: deleteRule, onChange: setDeleteRule },
                                ].map(row => (
                                    <div key={row.label} className="flex items-center gap-4">
                                        <div className="min-w-[140px]">
                                            <p className="text-sm font-medium">{row.label}</p>
                                            <p className="text-[11px] text-muted-foreground">{row.desc}</p>
                                        </div>
                                        <Select value={row.value} onValueChange={row.onChange}>
                                            <SelectTrigger className="flex-1 h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {RULE_OPTIONS.map(o => (
                                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>

                {status && <p className="px-6 pb-1 text-xs text-emerald-600">{status}</p>}
                {error && <p className="px-6 pb-1 text-xs text-destructive">{error}</p>}

                <SheetFooter className="px-6 py-4 border-t gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
                        {saving ? 'Saving' : isEdit ? 'Save changes' : 'Create collection'}
                    </Button>
                </SheetFooter>

                <Dialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                Unsaved Field Changes
                            </DialogTitle>
                            <DialogDescription>
                                You have field edits not yet applied with "Update field". Continue saving collection settings and discard current field editor changes?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmSaveOpen(false)}>Go Back</Button>
                            <Button
                                onClick={() => void confirmDiscardAndSave()}
                            >
                                Continue Save
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={confirmActionOpen === 'truncate'} onOpenChange={v => !v && setConfirmActionOpen(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-amber-500" />
                                Truncate Data
                            </DialogTitle>
                            <DialogDescription>
                                This will delete <strong>all records</strong> in "{collection?.name}" permanently. This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmActionOpen(null)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                onClick={() => void handleTruncate()}
                                disabled={saving}
                            >
                                {saving ? 'Clearing...' : 'Clear All Data'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={confirmActionOpen === 'delete'} onOpenChange={v => !v && setConfirmActionOpen(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Trash2 className="h-4 w-4 text-red-500" />
                                Delete Collection
                            </DialogTitle>
                            <DialogDescription>
                                This will permanently delete the collection "<strong>{collection?.name}</strong>", all its fields, and all records. This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmActionOpen(null)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                onClick={() => void handleDelete()}
                                disabled={saving}
                            >
                                {saving ? 'Deleting...' : 'Delete Collection'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SheetContent>
        </Sheet>
    );
}
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, FieldType, type CollectionItem, type Field, type TableFieldConfig } from '@/lib/api';

interface TableRow {
    __clientId?: string;
    [key: string]: any;
}

interface RelatedField extends Field {
    config: Record<string, unknown>;
}

interface RelationOption {
    id: string;
    label: string;
    description?: string;
}

interface RelationDisplayFieldMeta {
    name: string;
    label: string;
}

interface RelationPickerRecord {
    id: string;
    data: Record<string, unknown>;
    title: string;
    description?: string;
}

interface RelationPickerData {
    collectionName: string;
    displayFields: RelationDisplayFieldMeta[];
    records: RelationPickerRecord[];
}

interface TableFieldEditorProps {
    field: Field;
    value: TableRow[];
    onChange: (rows: TableRow[]) => void;
    disabled?: boolean;
}

const NONE_VALUE = '__none__';

const getInputType = (fieldType: number) => {
    switch (fieldType) {
        case FieldType.Number:
            return 'number';
        case FieldType.Email:
            return 'email';
        case FieldType.Date:
            return 'date';
        case FieldType.DateTime:
            return 'datetime-local';
        case FieldType.Checkbox:
            return 'checkbox';
        default:
            return 'text';
    }
};

const parseFieldConfig = (config: unknown): Record<string, unknown> => {
    if (!config) return {};
    if (typeof config === 'object') return config as Record<string, unknown>;
    try {
        return JSON.parse(String(config));
    } catch {
        return {};
    }
};

const parseSelectOptions = (config: unknown): string[] => {
    const cfg = parseFieldConfig(config);
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
    return [];
};

const normalizeDateTimeLocal = (value: unknown): string => {
    if (!value) return '';
    const raw = String(value);
    if (raw.includes('T')) return raw.slice(0, 16);
    return raw;
};

const getDefaultValue = (field: RelatedField): unknown => {
    if (field.defaultValue !== null && field.defaultValue !== undefined && String(field.defaultValue).trim() !== '') {
        if (field.type === FieldType.Number) return Number(field.defaultValue);
        if (field.type === FieldType.Checkbox) return String(field.defaultValue).toLowerCase() === 'true';
        return field.defaultValue;
    }

    if (field.type === FieldType.Checkbox) return false;
    if (field.type === FieldType.Number) return null;
    if (field.type === FieldType.Select) {
        const options = parseSelectOptions(field.config);
        return options[0] ?? '';
    }
    return '';
};

const renderFieldValue = (
    row: TableRow,
    field: RelatedField,
    relationOptionMap: Record<string, Record<string, string>>,
) => {
    const val = row[field.name];
    if (val === undefined || val === null || val === '') return '';

    if (field.type === FieldType.Checkbox) return val ? 'Yes' : 'No';
    if (field.type === FieldType.Relation || field.type === FieldType.User) {
        const optionMap = relationOptionMap[field.name] ?? {};
        return optionMap[String(val)] ?? String(val);
    }
    return String(val);
};

const renderEditField = (
    field: RelatedField,
    value: any,
    onChange: (v: any) => void,
    relationOptionsByField: Record<string, RelationOption[]>,
    relationPickerByField: Record<string, RelationPickerData>,
    disabled?: boolean,
) => {

    if (field.type === FieldType.Checkbox) {
        return (
            <div className="flex items-center gap-2">
                <Switch
                    checked={Boolean(value)}
                    onCheckedChange={checked => onChange(checked)}
                    disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">{value ? 'true' : 'false'}</span>
            </div>
        );
    }

    if (field.type === FieldType.Select) {
        const options = parseSelectOptions(field.config);
        if (options.length === 0) {
            return (
                <Input
                    value={value ?? ''}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder="Input value"
                />
            );
        }
        return (
            <Select
                value={value ? String(value) : NONE_VALUE}
                onValueChange={v => onChange(v === NONE_VALUE ? '' : v)}
                disabled={disabled}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {options.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    if (field.type === FieldType.Relation) {
        return (
            <TableRelationPickerField
                field={field}
                value={value}
                onChange={onChange}
                pickerData={relationPickerByField[field.name]}
                disabled={disabled}
            />
        );
    }

    if (field.type === FieldType.User) {
        const options = relationOptionsByField[field.name] ?? [];
        if (options.length === 0) {
            return (
                <Input
                    value={value ?? ''}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder="No options loaded, input id"
                />
            );
        }
        return (
            <Select
                value={value ? String(value) : NONE_VALUE}
                onValueChange={v => onChange(v === NONE_VALUE ? '' : v)}
                disabled={disabled}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Select record..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {options.map(option => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    const baseInputProps = {
        className: 'w-full',
        disabled,
    };

    if (field.type === FieldType.Number) {
        return (
            <Input
                type="number"
                value={value ?? ''}
                onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
                {...baseInputProps}
            />
        );
    }

    if (field.type === FieldType.Date) {
        return (
            <Input
                type="date"
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                {...baseInputProps}
            />
        );
    }

    if (field.type === FieldType.DateTime) {
        return (
            <Input
                type="datetime-local"
                value={normalizeDateTimeLocal(value)}
                onChange={e => onChange(e.target.value)}
                {...baseInputProps}
            />
        );
    }

    if (field.type === FieldType.Textarea) {
        return (
            <textarea
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                className="w-full min-h-17.5 rounded-md border bg-background px-3 py-2 text-sm"
                rows={2}
            />
        );
    }

    return (
        <Input
            type={getInputType(field.type)}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            {...baseInputProps}
        />
    );
};

function TableRelationPickerField({
    field,
    value,
    onChange,
    pickerData,
    disabled,
}: {
    field: RelatedField;
    value: unknown;
    onChange: (v: unknown) => void;
    pickerData?: RelationPickerData;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedId = typeof value === 'string' ? value : '';
    const selected = pickerData?.records.find(r => r.id === selectedId);
    const displayFields = pickerData?.displayFields ?? [];

    const filtered = useMemo(() => {
        const records = pickerData?.records ?? [];
        const keyword = query.trim().toLowerCase();
        if (!keyword) return records;
        return records.filter(record => {
            if (record.title.toLowerCase().includes(keyword)) return true;
            if (record.description?.toLowerCase().includes(keyword)) return true;
            return displayFields.some(meta => String(record.data[meta.name] ?? '').toLowerCase().includes(keyword));
        });
    }, [pickerData, query, displayFields]);

    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="min-h-10 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/30 disabled:opacity-50"
                    onClick={() => setOpen(true)}
                    disabled={disabled}
                >
                    {selected ? (
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">{selected.title}</div>
                            {selected.description ? <div className="text-xs text-muted-foreground truncate">{selected.description}</div> : null}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">Select relation...</span>
                    )}
                </button>

                {selectedId ? (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange('')}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Select: {pickerData?.collectionName || field.label || field.name}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search..."
                        />

                        <div className="max-h-96 overflow-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted/60">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Select</th>
                                        {displayFields.map(meta => (
                                            <th key={meta.name} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{meta.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={Math.max(2, displayFields.length + 1)} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                                No records found
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map(record => (
                                            <tr key={record.id} className="hover:bg-accent/30">
                                                <td className="px-3 py-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={selectedId === record.id ? 'default' : 'outline'}
                                                        onClick={() => {
                                                            onChange(record.id);
                                                            setOpen(false);
                                                        }}
                                                    >
                                                        {selectedId === record.id ? 'Selected' : 'Choose'}
                                                    </Button>
                                                </td>
                                                {displayFields.map(meta => (
                                                    <td key={`${record.id}-${meta.name}`} className="px-3 py-2 text-sm text-foreground/90">
                                                        {String(record.data[meta.name] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function TableFieldEditor({ field, value = [], onChange, disabled }: TableFieldEditorProps) {
    const [config] = useState<TableFieldConfig | null>(() => {
        try {
            const cfg = typeof field.config === 'string'
                ? JSON.parse(field.config)
                : field.config;
            return cfg?.relatedCollectionSlug ? (cfg as TableFieldConfig) : null;
        } catch {
            return null;
        }
    });

    const [relatedFields, setRelatedFields] = useState<RelatedField[]>([]);
    const [relationOptionsByField, setRelationOptionsByField] = useState<Record<string, RelationOption[]>>({});
    const [relationPickerByField, setRelationPickerByField] = useState<Record<string, RelationPickerData>>({});
    const [editingRowId, setEditingRowId] = useState<string | null>(null);
    const [editingData, setEditingData] = useState<TableRow | null>(null);
    const [rows, setRows] = useState<TableRow[]>(value || []);

    useEffect(() => {
        const loadFields = async () => {
            if (!config?.relatedCollectionSlug) return;
            try {
                const result = await api.get('/collections');
                const cols = (Array.isArray(result.data) ? result.data : []) as CollectionItem[];
                const related = cols.find(c => c.slug === config.relatedCollectionSlug);
                if (related?.id) {
                    const fieldsRes = await api.get<Field[]>(`/collections/${related.id}/fields`);
                    setRelatedFields((fieldsRes.data ?? []).filter(f => !f.isSystem) as RelatedField[]);
                }
            } catch (err) {
                console.error('Failed to load related collection fields:', err);
            }
        };
        loadFields();
    }, [config?.relatedCollectionSlug]);

    useEffect(() => {
        setRows(value || []);
    }, [value]);

    useEffect(() => {
        const loadRelationOptions = async () => {
            if (!config?.relatedCollectionSlug || relatedFields.length === 0) {
                setRelationOptionsByField({});
                setRelationPickerByField({});
                return;
            }

            const nextOptions: Record<string, RelationOption[]> = {};
            const nextPickerData: Record<string, RelationPickerData> = {};
            const collectionsRes = await api.get<CollectionItem[]>('/collections');
            const collections = collectionsRes.data;

            const relationFields = relatedFields.filter(f => f.type === FieldType.Relation);
            for (const relationField of relationFields) {
                try {
                    const relCfg = parseFieldConfig(relationField.config);
                    const relCollectionKey = String(relCfg.collectionId ?? '');
                    if (!relCollectionKey) continue;

                    const target = collections.find(c => c.id === relCollectionKey || c.slug === relCollectionKey);
                    if (!target) continue;

                    const targetFieldsRes = await api.get<Field[]>(`/collections/${target.id}/fields`);
                    const targetFields = (targetFieldsRes.data ?? []).filter(f => !f.isSystem);
                    const displayInRelationFields = targetFields.filter(f => {
                        const cfg = parseFieldConfig(f.config);
                        return cfg.displayInRelation === true;
                    });
                    const effectiveDisplayFields = (displayInRelationFields.length > 0 ? displayInRelationFields : targetFields.slice(0, 3))
                        .map(f => ({ name: f.name, label: f.description?.trim() || f.label?.trim() || f.name }));

                    const recordsRes = await api.get<{ items: Array<{ id: string; data: Record<string, unknown> }> }>(`/records/${target.slug}`, {
                        params: { page: 1, perPage: 200, sort: '-updated' },
                    });
                    const relationRecords = (recordsRes.data.items ?? []).map(item => {
                        const lines = effectiveDisplayFields
                            .map(meta => ({
                                label: meta.label,
                                value: String(item.data[meta.name] ?? '').trim(),
                            }))
                            .filter(line => line.value.length > 0);

                        return {
                            id: item.id,
                            data: item.data,
                            title: lines[0]?.value || item.id.substring(0, 8),
                            description: lines.slice(1).map(line => `${line.label}: ${line.value}`).join(' | '),
                        };
                    });

                    nextPickerData[relationField.name] = {
                        collectionName: target.description?.trim() || target.name,
                        displayFields: effectiveDisplayFields,
                        records: relationRecords,
                    };

                    nextOptions[relationField.name] = relationRecords.map(item => ({
                        id: item.id,
                        label: item.title,
                        description: item.description,
                    }));
                } catch (e) {
                    console.error(`Failed to load relation options for ${relationField.name}:`, e);
                }
            }

            if (relatedFields.some(f => f.type === FieldType.User)) {
                try {
                    const usersRes = await api.get<{ items: Array<{ id: string; displayName?: string; email?: string }> }>('/users', {
                        params: { page: 1, perPage: 200 },
                    });
                    const userOptions: RelationOption[] = (usersRes.data.items ?? []).map(u => ({
                        id: u.id,
                        label: u.displayName?.trim() || u.email?.trim() || u.id,
                    }));

                    for (const userField of relatedFields.filter(f => f.type === FieldType.User)) {
                        nextOptions[userField.name] = userOptions;
                    }
                } catch (e) {
                    console.error('Failed to load users for table user field:', e);
                }
            }

            setRelationOptionsByField(nextOptions);
            setRelationPickerByField(nextPickerData);
        };

        void loadRelationOptions();
    }, [config?.relatedCollectionSlug, relatedFields]);

    const displayFields = config?.selectedFields?.length
        ? relatedFields.filter(f => config.selectedFields.includes(f.name))
        : relatedFields.slice(0, 8);

    const relationOptionMap = useMemo(() => {
        const map: Record<string, Record<string, string>> = {};
        for (const [fieldName, options] of Object.entries(relationOptionsByField)) {
            map[fieldName] = options.reduce((acc, option) => {
                acc[option.id] = option.label;
                return acc;
            }, {} as Record<string, string>);
        }
        return map;
    }, [relationOptionsByField]);

    const addRow = () => {
        const newRow: TableRow = {
            __clientId: `${Date.now()}-${Math.random()}`,
        };
        displayFields.forEach(f => {
            newRow[f.name] = getDefaultValue(f);
        });
        const updated = [...rows, newRow];
        setRows(updated);
        onChange(updated);
        // Auto-enter edit mode for new row
        setEditingRowId(newRow.__clientId!);
        setEditingData({ ...newRow });
    };

    const deleteRow = (clientId: string) => {
        const updated = rows.filter(r => r.__clientId !== clientId);
        setRows(updated);
        onChange(updated);
        if (editingRowId === clientId) {
            setEditingRowId(null);
            setEditingData(null);
        }
    };

    const startEdit = (row: TableRow) => {
        setEditingRowId(row.__clientId!);
        setEditingData({ ...row });
    };

    const saveEdit = () => {
        if (!editingRowId || !editingData) return;
        const updated = rows.map(r =>
            r.__clientId === editingRowId ? editingData : r
        );
        setRows(updated);
        onChange(updated);
        setEditingRowId(null);
        setEditingData(null);
    };

    const cancelEdit = () => {
        setEditingRowId(null);
        setEditingData(null);
    };

    const updateEditField = (fieldName: string, value: any) => {
        if (!editingData) return;
        setEditingData({ ...editingData, [fieldName]: value });
    };

    if (!config?.relatedCollectionSlug) {
        return <div className="text-muted-foreground text-sm">Table field not configured</div>;
    }

    return (
        <div className="space-y-3 rounded-lg border border-border bg-muted/35 p-4">
            <div className="flex justify-between items-center">
                <Label className="font-semibold">{field.label || field.name}</Label>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={addRow}
                    disabled={disabled || editingRowId !== null}
                    className="gap-1"
                >
                    <Plus className="w-4 h-4" />
                    Add Row
                </Button>
            </div>

            {rows.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                    No rows yet. Click "Add Row" to start.
                </div>
            ) : editingRowId ? (
                // Edit mode - show form
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <h4 className="font-semibold text-sm">Edit Row</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {displayFields.map(f => (
                            <div key={f.name} className="space-y-1">
                                <label className="text-xs font-medium text-foreground">
                                    {f.label || f.name}
                                    {f.isRequired && <span className="ml-1 text-destructive">*</span>}
                                </label>
                                {renderEditField(
                                    f,
                                    editingData![f.name],
                                    val => updateEditField(f.name, val),
                                    relationOptionsByField,
                                    relationPickerByField,
                                    disabled,
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                        >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            onClick={saveEdit}
                        >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Save
                        </Button>
                    </div>
                </div>
            ) : (
                // View mode - table
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-muted/70">
                                {displayFields.map(f => (
                                    <th key={f.name} className="border px-2 py-1 text-left font-medium">
                                        {f.label || f.name}
                                    </th>
                                ))}
                                <th className="border px-2 py-1 text-center w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr
                                    key={row.__clientId}
                                    className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/25'}
                                >
                                    {displayFields.map(f => (
                                        <td
                                            key={`${row.__clientId}-${f.name}`}
                                            className="border px-2 py-1"
                                        >
                                            {renderFieldValue(row, f, relationOptionMap)}
                                        </td>
                                    ))}
                                    <td className="border px-2 py-1 text-center flex gap-1 justify-center">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => startEdit(row)}
                                            disabled={disabled}
                                            className="h-7 px-2"
                                            title="Edit row"
                                        >
                                            <Edit2 className="w-3 h-3 text-primary" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteRow(row.__clientId!)}
                                            disabled={disabled}
                                            className="h-7 px-2"
                                            title="Delete row"
                                        >
                                            <Trash2 className="w-3 h-3 text-destructive" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { api, FieldType, type Field, type TableFieldConfig, type FieldMetadata } from '@/lib/api';

interface TableRow {
    __clientId?: string;
    [key: string]: any;
}

interface TableFieldEditorProps {
    field: Field;
    value: TableRow[];
    onChange: (rows: TableRow[]) => void;
    disabled?: boolean;
}

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

const renderFieldValue = (row: TableRow, colName: string, colType: number) => {
    const val = row[colName];
    if (val === undefined || val === null) return '';
    if (colType === FieldType.Checkbox) return val ? '✓' : '-';
    if (colType === FieldType.Number) return String(val);
    return String(val);
};

const renderEditField = (
    _row: TableRow,
    field: FieldMetadata,
    value: any,
    onChange: (v: any) => void,
    disabled?: boolean
) => {
    const baseInputProps = {
        className: 'w-full px-2 py-1.5 border rounded text-sm',
        disabled,
    };

    if (field.type === FieldType.Checkbox) {
        return (
            <input
                type="checkbox"
                checked={value ?? false}
                onChange={e => onChange(e.target.checked)}
                {...baseInputProps}
                className="w-4 h-4"
            />
        );
    }

    if (field.type === FieldType.Number) {
        return (
            <input
                type="number"
                value={value ?? ''}
                onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
                {...baseInputProps}
            />
        );
    }

    if (field.type === FieldType.Date) {
        return (
            <input
                type="date"
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                {...baseInputProps}
            />
        );
    }

    if (field.type === FieldType.DateTime) {
        return (
            <input
                type="datetime-local"
                value={value ?? ''}
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
                {...baseInputProps}
                className="w-full px-2 py-1.5 border rounded text-sm resize-none"
                rows={2}
            />
        );
    }

    // Text, Email, Select, etc. - use text input
    return (
        <input
            type={getInputType(field.type)}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            {...baseInputProps}
        />
    );
};

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

    const [relatedFields, setRelatedFields] = useState<FieldMetadata[]>([]);
    const [editingRowId, setEditingRowId] = useState<string | null>(null);
    const [editingData, setEditingData] = useState<TableRow | null>(null);
    const [rows, setRows] = useState<TableRow[]>(value || []);

    useEffect(() => {
        const loadFields = async () => {
            if (!config?.relatedCollectionSlug) return;
            try {
                const result = await api.get('/collections');
                const cols = Array.isArray(result.data) ? result.data : [];
                const related = cols.find((c: { slug?: string; id?: string }) => c.slug === config.relatedCollectionSlug);
                if (related?.id) {
                    const fieldsRes = await api.get(`/collections/${related.id}/fields-metadata`);
                    setRelatedFields(fieldsRes.data.fields || []);
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

    const displayFields = config?.selectedFields?.length
        ? relatedFields.filter(f => config.selectedFields.includes(f.name))
        : relatedFields.slice(0, 5);

    const addRow = () => {
        const newRow: TableRow = {
            __clientId: `${Date.now()}-${Math.random()}`,
        };
        displayFields.forEach(f => {
            newRow[f.name] = f.type === FieldType.Checkbox ? false : '';
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
        return <div className="text-gray-500 text-sm">Table field not configured</div>;
    }

    return (
        <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
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
                <div className="text-center py-8 text-gray-400 text-sm">
                    No rows yet. Click "Add Row" to start.
                </div>
            ) : editingRowId ? (
                // Edit mode - show form
                <div className="bg-white border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-sm">Edit Row</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {displayFields.map(f => (
                            <div key={f.name} className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">
                                    {f.label || f.name}
                                    {f.isRequired && <span className="text-red-500 ml-1">*</span>}
                                </label>
                                {renderEditField(
                                    editingData!,
                                    f,
                                    editingData![f.name],
                                    (val) => updateEditField(f.name, val),
                                    disabled
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t">
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
                            <tr className="bg-gray-200">
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
                                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                                >
                                    {displayFields.map(f => (
                                        <td
                                            key={`${row.__clientId}-${f.name}`}
                                            className="border px-2 py-1"
                                        >
                                            {renderFieldValue(row, f.name, f.type)}
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
                                            <Edit2 className="w-3 h-3 text-blue-500" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteRow(row.__clientId!)}
                                            disabled={disabled}
                                            className="h-7 px-2"
                                            title="Delete row"
                                        >
                                            <Trash2 className="w-3 h-3 text-red-500" />
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

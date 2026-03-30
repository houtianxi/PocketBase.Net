import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { api, FieldType, type Field, type TableFieldConfig } from '@/lib/api';

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

    const [relatedFields, setRelatedFields] = useState<Field[]>([]);
    const [editingRowId, setEditingRowId] = useState<string | null>(null);
    const [rows, setRows] = useState<TableRow[]>(value || []);

    useEffect(() => {
        const loadFields = async () => {
            if (!config?.relatedCollectionSlug) return;
            try {
                const result = await api.get('/collections');
                const cols = Array.isArray(result.data) ? result.data : [];
                const related = cols.find((c: { slug?: string; id?: string }) => c.slug === config.relatedCollectionSlug);
                if (related?.id) {
                    const fieldsRes = await api.get(`/collections/${related.id}/fields`);
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
    };

    const deleteRow = (clientId: string) => {
        const updated = rows.filter(r => r.__clientId !== clientId);
        setRows(updated);
        onChange(updated);
    };

    const updateCell = (clientId: string, fieldName: string, value: any) => {
        const updated = rows.map(r =>
            r.__clientId === clientId ? { ...r, [fieldName]: value } : r
        );
        setRows(updated);
        onChange(updated);
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
                    disabled={disabled}
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
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-gray-200">
                                {displayFields.map(f => (
                                    <th key={f.name} className="border px-2 py-1 text-left font-medium">
                                        {f.label || f.name}
                                    </th>
                                ))}
                                <th className="border px-2 py-1 text-center w-16">Actions</th>
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
                                            {editingRowId === row.__clientId ? (
                                                <input
                                                    type={getInputType(f.type)}
                                                    value={row[f.name] ?? ''}
                                                    onChange={e => updateCell(row.__clientId!, f.name, e.target.value)}
                                                    className="w-full px-1 py-1 border rounded text-xs"
                                                    disabled={disabled}
                                                />
                                            ) : (
                                                <span
                                                    className="cursor-pointer hover:text-blue-600"
                                                    onClick={() => setEditingRowId(row.__clientId!)}
                                                >
                                                    {renderFieldValue(row, f.name, f.type)}
                                                </span>
                                            )}
                                        </td>
                                    ))}
                                    <td className="border px-2 py-1 text-center">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteRow(row.__clientId!)}
                                            disabled={disabled}
                                            className="h-7 px-2"
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

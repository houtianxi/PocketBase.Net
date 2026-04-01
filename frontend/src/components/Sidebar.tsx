import { useMemo, useState } from 'react';
import { Database, Users, BarChart2, X, Search, Plus, FolderOpen, ShoppingCart, Key, FlaskConical, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { CollectionItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface SidebarProps {
    collections: CollectionItem[];
    selectedId: string | null;
    onSelect: (col: CollectionItem) => void;
    onNewCollection: () => void;
    appName?: string;
    appIconUrl?: string;
    labels?: {
        collections: string;
        users: string;
        logs: string;
        orderDemo: string;
        apiKeys: string;
        apiDemo: string;
        appSettings: string;
        systemSettings: string;
    };
    activeSection: 'collections' | 'users' | 'logs' | 'order-demo' | 'gate-mode3' | 'api-keys' | 'api-demo' | 'application-settings';
    onSectionChange: (s: 'collections' | 'users' | 'logs' | 'order-demo' | 'gate-mode3' | 'api-keys' | 'api-demo' | 'application-settings') => void;
}

export function Sidebar({ collections, selectedId, onSelect, onNewCollection, appName, appIconUrl, labels, activeSection, onSectionChange }: SidebarProps) {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [systemOpen, setSystemOpen] = useState(true);

    const ui = labels ?? {
        collections: 'Collections',
        users: 'Users',
        logs: 'Logs',
        orderDemo: 'Order Demo',
        apiKeys: 'API Keys',
        apiDemo: t('apiDemo'),
        appSettings: 'Application Settings',
        systemSettings: 'System Settings',
    };

    const mainNavItems = [
        { key: 'collections' as const, icon: Database, label: ui.collections },
        { key: 'order-demo' as const, icon: ShoppingCart, label: ui.orderDemo },
    ];

    const systemNavItems = [
        { key: 'application-settings' as const, icon: Settings, label: ui.appSettings },
        { key: 'users' as const, icon: Users, label: ui.users },
        { key: 'logs' as const, icon: BarChart2, label: ui.logs },
        { key: 'api-keys' as const, icon: Key, label: ui.apiKeys },
        { key: 'api-demo' as const, icon: FlaskConical, label: ui.apiDemo },
    ];

    const isSystemSection = useMemo(() => systemNavItems.some(item => item.key === activeSection), [activeSection]);

    const filtered = collections.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex h-full w-56 min-w-56 flex-col border-r bg-background/95 backdrop-blur">
            {/* Logo */}
            <div className="flex h-12 items-center gap-2 border-b px-3">
                {appIconUrl ? (
                    <img src={appIconUrl} alt="Application icon" className="h-7 w-7 rounded-md bg-muted/40 p-0.5 object-contain" />
                ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
                        PB
                    </div>
                )}
                <span className="text-[13px] font-semibold tracking-tight truncate">{appName || 'PocketBase.Net'}</span>
            </div>

            {/* Icon nav */}
            <div className="flex flex-col gap-1 border-b px-2 py-2">
                {mainNavItems.map(({ key, icon: Icon, label }) => (
                    <button
                        key={key}
                        onClick={() => onSectionChange(key)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                            activeSection === key
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}

                <button
                    onClick={() => setSystemOpen(v => !v)}
                    className={cn(
                        'flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                        isSystemSection
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                >
                    <span className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        {ui.systemSettings}
                    </span>
                    {systemOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {systemOpen && (
                    <div className="ml-3 flex flex-col gap-1 border-l pl-2">
                        {systemNavItems.map(({ key, icon: Icon, label }) => (
                            <button
                                key={key}
                                onClick={() => onSectionChange(key)}
                                className={cn(
                                    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                                    activeSection === key
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Collections list */}
            {activeSection === 'collections' && (
                <>
                    {/* Search */}
                    <div className="border-b px-2.5 py-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder={t('sidebarSearchCollections')}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Collection list */}
                    <ScrollArea className="flex-1">
                        <div className="py-1">
                            {filtered.length === 0 ? (
                                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                                    {search ? t('sidebarNoCollectionsFound') : t('sidebarNoCollectionsYet')}
                                </div>
                            ) : (
                                filtered.map(col => (
                                    <button
                                        key={col.id}
                                        onClick={() => onSelect(col)}
                                        className={cn(
                                            'group flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors',
                                            selectedId === col.id
                                                ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                        )}
                                    >
                                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{col.name}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </ScrollArea>

                    {/* New collection button */}
                    <div className="border-t p-2.5">
                        <Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-[12px]" onClick={onNewCollection}>
                            <Plus className="h-3.5 w-3.5" />
                            {t('newCollection')}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

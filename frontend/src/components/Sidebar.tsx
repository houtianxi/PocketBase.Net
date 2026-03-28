import { useState } from 'react';
import { Database, Users, BarChart2, X, Search, Plus, FolderOpen, ShoppingCart, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { CollectionItem } from '@/lib/api';

interface SidebarProps {
    collections: CollectionItem[];
    selectedId: string | null;
    onSelect: (col: CollectionItem) => void;
    onNewCollection: () => void;
    activeSection: 'collections' | 'users' | 'logs' | 'order-demo' | 'gate-mode3';
    onSectionChange: (s: 'collections' | 'users' | 'logs' | 'order-demo' | 'gate-mode3') => void;
}

const navItems = [
    { key: 'collections' as const, icon: Database, label: 'Collections' },
    { key: 'order-demo' as const, icon: ShoppingCart, label: 'Order Demo' },
    // { key: 'gate-mode3' as const, icon: Presentation, label: 'Gate Mode3' },
    { key: 'users' as const, icon: Users, label: 'Users' },
    { key: 'logs' as const, icon: BarChart2, label: 'Logs' },
];

export function Sidebar({ collections, selectedId, onSelect, onNewCollection, activeSection, onSectionChange }: SidebarProps) {
    const [search, setSearch] = useState('');

    const filtered = collections.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex h-full w-56 min-w-56 flex-col border-r bg-background/95 backdrop-blur">
            {/* Logo */}
            <div className="flex h-12 items-center gap-2 border-b px-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
                    PB
                </div>
                <span className="text-[13px] font-semibold tracking-tight">PocketBase.Net</span>
            </div>

            {/* Icon nav */}
            <div className="flex flex-col gap-1 border-b px-2 py-2">
                {navItems.map(({ key, icon: Icon, label }) => (
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
                                placeholder="Search collections..."
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
                                    {search ? 'No collections found' : 'No collections yet'}
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
                            New collection
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

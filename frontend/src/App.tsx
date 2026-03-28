import { useEffect, useState } from 'react';
import { LogOut, Settings, ChevronRight, Database, Lock } from 'lucide-react';
import { api, setAccessToken, type CollectionItem, type LoginResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Sidebar } from '@/components/Sidebar';
import { CollectionDialog } from '@/components/CollectionDialog';
import { RecordsTable } from '@/components/RecordsTable';
import { UsersView } from '@/components/UsersView';
import { LogsView } from '@/components/LogsView';
import { OrderDemoPage } from '@/components/OrderDemoPage';
import { ApiKeysView } from '@/components/ApiKeysView';
import { ApiKeyDemoPage } from '@/components/ApiKeyDemoPage';
import { ApplicationSettingPage } from '@/components/ApplicationSettingPage';
// import { GateMode3Page } from '@/components/GateMode3Page';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const TOKEN_KEY = 'pocketbase.net.token';
type Section = 'collections' | 'users' | 'logs' | 'order-demo' | 'gate-mode3' | 'api-keys' | 'api-demo' | 'application-settings';

// ---------- Login page ----------
function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('admin@pocketbase.net');
  const [password, setPassword] = useState('Admin1234');
  const [displayName, setDisplayName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister
        ? { email, password, displayName: displayName || email.split('@')[0] }
        : { email, password };
      const res = await api.post<LoginResponse>(endpoint, payload);
      localStorage.setItem(TOKEN_KEY, res.data.accessToken);
      setAccessToken(res.data.accessToken);
      onLogin(res.data.accessToken);
    } catch {
      setError('Login failed. Check credentials or backend.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            PB
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">PocketBase.Net</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Admin dashboard</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-medium">{isRegister ? 'Create account' : 'Sign in'}</h2>
            <p className="text-xs text-muted-foreground">Default: admin@pocketbase.net / Admin1234</p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
            {isRegister && (
              <Input
                placeholder="Display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            )}
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
          </Button>

          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsRegister(v => !v)}
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main App ----------
function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [profile, setProfile] = useState<{ id: string; email: string; displayName: string; roles: string[] } | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<CollectionItem | null>(null);
  const [schemaVersion, setSchemaVersion] = useState(0);
  const [section, setSection] = useState<Section>('collections');

  // Collection dialog state
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionItem | null>(null);

  // Change password dialog state
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);

  // Boot: validate token and load data
  useEffect(() => {
    if (!token) return;
    setAccessToken(token);
    api.get<{ id: string; email: string; displayName: string; roles: string[] }>('/auth/me')
      .then(r => { setProfile(r.data); return loadCollections(); })
      .catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadCollections = async () => {
    const res = await api.get<CollectionItem[]>('/collections');
    const cols = res.data ?? [];
    setCollections(cols);
    setSelectedCollection(prev => {
      if (prev) {
        return cols.find(c => c.id === prev.id) ?? cols[0] ?? null;
      }
      return cols[0] ?? null;
    });
    return cols;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setToken(null);
    setProfile(null);
    setCollections([]);
    setSelectedCollection(null);
  };

  const openNewCollection = () => {
    setEditingCollection(null);
    setCollectionDialogOpen(true);
  };

  const openEditCollection = () => {
    if (selectedCollection) {
      setEditingCollection(selectedCollection);
      setCollectionDialogOpen(true);
    }
  };

  const handleCollectionSaved = async () => {
    await loadCollections();
    setSchemaVersion(v => v + 1);
    setCollectionDialogOpen(false);
    setEditingCollection(null);
  };

  if (!token || !profile) {
    return <LoginPage onLogin={t => { setAccessToken(t); setToken(t); }} />;
  }

  const isAdmin = profile.roles?.includes('Admin');

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Sidebar */}
        <Sidebar
          collections={collections}
          selectedId={selectedCollection?.id ?? null}
          onSelect={col => { setSelectedCollection(col); setSection('collections'); }}
          onNewCollection={openNewCollection}
          activeSection={section}
          onSectionChange={setSection}
        />

        {/* Right panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
            {/* Breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-muted-foreground">
              <Database className="h-4 w-4 shrink-0" />
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <span className={cn('truncate font-medium', section === 'collections' && selectedCollection ? 'text-foreground' : '')}>
                {section === 'collections'
                  ? (selectedCollection?.name ?? 'Collections')
                  : section === 'users'
                    ? 'Users'
                    : section === 'logs'
                      ? 'Logs'
                      : section === 'order-demo'
                        ? 'Order Demo'
                        : section === 'api-keys'
                          ? 'API Keys'
                          : section === 'api-demo'
                            ? 'API 测试台'
                            : section === 'application-settings'
                              ? 'Application Setting'
                              : 'Gate Mode3'}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              {section === 'collections' && selectedCollection && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEditCollection}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Collection settings</TooltipContent>
                </Tooltip>
              )}
              <ThemeToggle />
              <div className="flex items-center gap-2 border-l pl-2 ml-1">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-medium leading-none">{profile.displayName || profile.email}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{isAdmin ? 'Admin' : 'User'}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setChangePasswordDialogOpen(true)}>
                      <Lock className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Change password</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sign out</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-hidden">
            {section === 'collections' && (
              selectedCollection
                ? <RecordsTable collection={selectedCollection} schemaVersion={schemaVersion} onSettingsClick={openEditCollection} />
                : (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                      <Database className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">No collections yet</h3>
                      <p className="text-sm text-muted-foreground mt-1">Create a collection to get started.</p>
                    </div>
                    <Button onClick={openNewCollection}>New collection</Button>
                  </div>
                )
            )}
            {section === 'order-demo' && <OrderDemoPage />}
            {/* {section === 'gate-mode3' && <GateMode3Page />} */}
            {section === 'users' && <UsersView />}
            {section === 'logs' && <LogsView />}
            {section === 'api-keys' && <ApiKeysView />}
            {section === 'api-demo' && <ApiKeyDemoPage />}
            {section === 'application-settings' && <ApplicationSettingPage />}
          </main>
        </div>
      </div>

      {/* Collection dialog */}
      <CollectionDialog
        open={collectionDialogOpen}
        onClose={() => setCollectionDialogOpen(false)}
        collection={editingCollection}
        onSaved={handleCollectionSaved}
      />

      {/* Change password dialog */}
      <ChangePasswordDialog
        open={changePasswordDialogOpen}
        onOpenChange={setChangePasswordDialogOpen}
      />
    </TooltipProvider>
  );
}

export default App;

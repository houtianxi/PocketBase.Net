import { useEffect, useState } from "react";
import { LogOut, Settings, ChevronRight, Database, Lock } from "lucide-react";
import { api, setAccessToken, type ApplicationSettings, type CollectionItem, type LoginResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Sidebar } from "@/components/Sidebar";
import { CollectionDialog } from "@/components/CollectionDialog";
import { RecordsTable } from "@/components/RecordsTable";
import { UsersView } from "@/components/UsersView";
import { LogsView } from "@/components/LogsView";
import { OrderDemoPage } from "@/components/OrderDemoPage";
import { ApiKeysView } from "@/components/ApiKeysView";
import { ApiKeyDemoPage } from "@/components/ApiKeyDemoPage";
import { ApplicationSettingPage } from "@/components/ApplicationSettingPage";
// import { GateMode3Page } from '@/components/GateMode3Page';
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toSupportedLocale, useI18n } from "@/lib/i18n";

const TOKEN_KEY = "pocketbase.net.token";
type Section =
    | "collections"
    | "users"
    | "logs"
    | "order-demo"
    | "gate-mode3"
    | "api-keys"
    | "api-demo"
    | "application-settings";

// ---------- Login page ----------
function LoginPage({
    onLogin,
    appName,
    appSubtitle,
    appIconUrl,
    signInLabel,
    createAccountLabel,
    loginFailedLabel,
    loginDefaultHintLabel,
    loginEmailPlaceholderLabel,
    loginDisplayNamePlaceholderLabel,
    loginPasswordPlaceholderLabel,
    loginPleaseWaitLabel,
    loginAlreadyHaveAccountLabel,
    loginNoAccountLabel,
    allowSelfRegistration,
}: {
    onLogin: (token: string) => void;
    appName: string;
    appSubtitle: string;
    appIconUrl?: string;
    signInLabel: string;
    createAccountLabel: string;
    loginFailedLabel: string;
    loginDefaultHintLabel: string;
    loginEmailPlaceholderLabel: string;
    loginDisplayNamePlaceholderLabel: string;
    loginPasswordPlaceholderLabel: string;
    loginPleaseWaitLabel: string;
    loginAlreadyHaveAccountLabel: string;
    loginNoAccountLabel: string;
    allowSelfRegistration?: boolean;
}) {
    const [email, setEmail] = useState("admin@pocketbase.net");
    const [password, setPassword] = useState("Admin1234");
    const [displayName, setDisplayName] = useState("");
    const [isRegister, setIsRegister] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setBusy(true);
        setError("");
        try {
            if (isRegister && !allowSelfRegistration) {
                setError('Self registration is disabled');
                setBusy(false);
                return;
            }
            const endpoint = isRegister ? "/auth/register" : "/auth/login";
            const payload = isRegister
                ? { email, password, displayName: displayName || email.split("@")[0] }
                : { email, password };
            const res = await api.post<LoginResponse>(endpoint, payload);
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            setAccessToken(res.data.accessToken);
            onLogin(res.data.accessToken);
        } catch (e) {
            const msg = (e as any)?.response?.data?.message;
            setError(msg || loginFailedLabel);
        } finally {
            setBusy(false);
        }
    };

    // If registration is disabled, ensure we are in login mode
    useEffect(() => {
        if (!allowSelfRegistration && isRegister) setIsRegister(false);
    }, [allowSelfRegistration, isRegister]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm space-y-6">
                {/* Logo */}
                <div className="flex flex-col items-center gap-3">
                    {appIconUrl ? (
                        <img src={appIconUrl} alt="Application icon" className="h-12 w-12 rounded-xl bg-muted/40 p-1 object-contain" />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
                            PB
                        </div>
                    )}
                    <div className="text-center">
                        <h1 className="text-xl font-semibold">{appName}</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">{appSubtitle}</p>
                    </div>
                </div>

                {/* Card */}
                <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <h2 className="text-sm font-medium">{isRegister ? createAccountLabel : signInLabel}</h2>
                        <p className="text-xs text-muted-foreground">{loginDefaultHintLabel}</p>
                    </div>

                    <div className="space-y-3">
                        <Input
                            type="email"
                            placeholder={loginEmailPlaceholderLabel}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit()}
                        />
                        {isRegister && (
                            <Input
                                placeholder={loginDisplayNamePlaceholderLabel}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                        )}
                        <Input
                            type="password"
                            placeholder={loginPasswordPlaceholderLabel}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit()}
                        />
                    </div>

                    {error && <p className="text-xs text-destructive">{error}</p>}

                    <Button className="w-full" onClick={submit} disabled={busy}>
                        {busy ? loginPleaseWaitLabel : isRegister ? createAccountLabel : signInLabel}
                    </Button>

                    {allowSelfRegistration ? (
                        <button
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setIsRegister((v) => !v)}
                        >
                            {isRegister ? loginAlreadyHaveAccountLabel : loginNoAccountLabel}
                        </button>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center">Registration disabled by administrator</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function hexToHslParts(hexColor: string): string | null {
    const hex = hexColor.trim().replace('#', '');
    const full = hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    let h = 0;
    if (d !== 0) {
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0));
                break;
            case g:
                h = ((b - r) / d + 2);
                break;
            default:
                h = ((r - g) / d + 4);
                break;
        }
        h /= 6;
    }

    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const hh = Math.round(h * 360);
    const ss = Math.round(s * 100);
    const ll = Math.round(l * 100);
    return `${hh} ${ss}% ${ll}%`;
}

// ---------- Main App ----------
function App() {
    const { t, setLocale } = useI18n();
    const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
    const [profile, setProfile] = useState<{ id: string; email: string; displayName: string; roles: string[] } | null>(
        null
    );
    const [collections, setCollections] = useState<CollectionItem[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<CollectionItem | null>(null);
    const [schemaVersion, setSchemaVersion] = useState(0);
    const [section, setSection] = useState<Section>("collections");
    const [appSettings, setAppSettings] = useState<ApplicationSettings | null>(null);

    // Collection dialog state
    const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<CollectionItem | null>(null);

    // Change password dialog state
    const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);

    useEffect(() => {
        const loadPublicSettings = async () => {
            try {
                const res = await api.get<ApplicationSettings>('/application-settings/public');
                const settings = res.data;
                setAppSettings(settings);
                setLocale(toSupportedLocale(settings.defaultLanguage));
            } catch {
                // ignore
            }
        };

        void loadPublicSettings();
    }, [setLocale]);

    useEffect(() => {
        const title = appSettings?.siteTitle || appSettings?.appName || t('applicationTitleFallback');
        document.title = title;

        if (appSettings?.primaryColor) {
            const hslParts = hexToHslParts(appSettings.primaryColor);
            if (hslParts) {
                document.documentElement.style.setProperty('--primary', hslParts);
                document.documentElement.style.setProperty('--ring', hslParts);
            }
        }
    }, [appSettings, t]);

    // Boot: validate token and load data
    useEffect(() => {
        if (!token) return;
        setAccessToken(token);
        api.get<{ id: string; email: string; displayName: string; roles: string[] }>("/auth/me")
            .then((r) => {
                setProfile(r.data);
                return loadCollections();
            })
            .catch(() => logout());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const loadCollections = async () => {
        const res = await api.get<CollectionItem[]>("/collections");
        const cols = res.data ?? [];
        setCollections(cols);
        setSelectedCollection((prev) => {
            if (prev) {
                return cols.find((c) => c.id === prev.id) ?? cols[0] ?? null;
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
        setSchemaVersion((v) => v + 1);
        setCollectionDialogOpen(false);
        setEditingCollection(null);
    };

    if (!token || !profile) {
        return (
            <LoginPage
                onLogin={(t) => {
                    setAccessToken(t);
                    setToken(t);
                }}
                appName={appSettings?.appName || t('applicationTitleFallback')}
                appSubtitle={appSettings?.appSubtitle || t('loginSubtitleFallback')}
                appIconUrl={appSettings?.appIconUrl}
                signInLabel={t('signIn')}
                createAccountLabel={t('createAccount')}
                loginFailedLabel={t('loginFailed')}
                loginDefaultHintLabel={t('loginDefaultHint')}
                loginEmailPlaceholderLabel={t('loginEmailPlaceholder')}
                loginDisplayNamePlaceholderLabel={t('loginDisplayNamePlaceholder')}
                loginPasswordPlaceholderLabel={t('loginPasswordPlaceholder')}
                loginPleaseWaitLabel={t('loginPleaseWait')}
                loginAlreadyHaveAccountLabel={t('loginAlreadyHaveAccount')}
                loginNoAccountLabel={t('loginNoAccount')}
                allowSelfRegistration={Boolean(appSettings?.systemConfig?.allowSelfRegistration ?? true)}
            />
        );
    }

    const isAdmin = profile.roles?.includes("Admin");

    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex h-screen overflow-hidden bg-background text-foreground">
                {/* Sidebar */}
                <Sidebar
                    collections={collections}
                    selectedId={selectedCollection?.id ?? null}
                    appName={appSettings?.appName || t('applicationTitleFallback')}
                    appIconUrl={appSettings?.appIconUrl}
                    labels={{
                        collections: t('collections'),
                        users: t('users'),
                        logs: t('logs'),
                        orderDemo: t('orderDemo'),
                        apiKeys: t('apiKeys'),
                        apiDemo: t('apiDemo'),
                        appSettings: t('appSettings'),
                        systemSettings: t('systemSettings'),
                    }}
                    onSelect={(col) => {
                        setSelectedCollection(col);
                        setSection("collections");
                    }}
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
                            <span
                                className={cn(
                                    "truncate font-medium",
                                    section === "collections" && selectedCollection ? "text-foreground" : ""
                                )}
                            >
                                {section === "collections"
                                    ? selectedCollection?.name ?? t('collections')
                                    : section === "users"
                                        ? t('users')
                                        : section === "logs"
                                            ? t('logs')
                                            : section === "order-demo"
                                                ? t('orderDemo')
                                                : section === "api-keys"
                                                    ? t('apiKeys')
                                                    : section === "api-demo"
                                                        ? t('apiDemo')
                                                        : section === "application-settings"
                                                            ? t('appSettings')
                                                            : "Gate Mode3"}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                            {section === "collections" && selectedCollection && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={openEditCollection}
                                        >
                                            <Settings className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('tooltipCollectionSettings')}</TooltipContent>
                                </Tooltip>
                            )}
                            <ThemeToggle />
                            <div className="flex items-center gap-2 border-l pl-2 ml-1">
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-medium leading-none">
                                        {profile.displayName || profile.email}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{isAdmin ? t('userRoleAdmin') : t('userRoleUser')}</p>
                                </div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setChangePasswordDialogOpen(true)}
                                        >
                                            <Lock className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('tooltipChangePassword')}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                                            <LogOut className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('tooltipSignOut')}</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    </header>

                    {/* Content */}
                    <main className="flex-1 overflow-hidden">
                        {section === "collections" &&
                            (selectedCollection ? (
                                <RecordsTable
                                    collection={selectedCollection}
                                    schemaVersion={schemaVersion}
                                    onSettingsClick={openEditCollection}
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                                        <Database className="h-7 w-7 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium">{t('noCollectionsYet')}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {t('noCollectionsHint')}
                                        </p>
                                    </div>
                                    <Button onClick={openNewCollection}>{t('newCollection')}</Button>
                                </div>
                            ))}
                        {section === "order-demo" && <OrderDemoPage />}
                        {/* {section === 'gate-mode3' && <GateMode3Page />} */}
                        {section === "users" && <UsersView />}
                        {section === "logs" && <LogsView />}
                        {section === "api-keys" && <ApiKeysView />}
                        {section === "api-demo" && <ApiKeyDemoPage />}
                        {section === "application-settings" && <ApplicationSettingPage onChanged={setAppSettings} />}
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
            <ChangePasswordDialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen} />
        </TooltipProvider>
    );
}

export default App;

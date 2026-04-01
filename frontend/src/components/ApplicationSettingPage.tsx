import { useEffect, useMemo, useState } from 'react';
import { Globe, ImageIcon, FolderOpen, Save, Settings2, Type, Upload, Languages, Palette, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, type ApplicationSettings, type ApplicationSettingsAuditItem } from '@/lib/api';
import { useI18n, type SupportedLocale } from '@/lib/i18n';
import { getFilePreviewUrl, uploadFile } from '@/lib/fileUpload';

type ApplicationSettingPageProps = {
    onChanged?: (settings: ApplicationSettings) => void;
};

type LocalSystemConfig = {
    allowSelfRegistration: boolean;
    enableApiPreview: boolean;
    enableAuditLog: boolean;
    maxUploadSizeMb: number;
};

const defaultSystemConfig: LocalSystemConfig = {
    allowSelfRegistration: false,
    enableApiPreview: true,
    enableAuditLog: true,
    maxUploadSizeMb: 100,
};

function toLocale(value: string): SupportedLocale {
    return value.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export function ApplicationSettingPage({ onChanged }: ApplicationSettingPageProps) {
    const { locale, setLocale, t } = useI18n();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const [appName, setAppName] = useState('PocketBase.Net');
    const [appSubtitle, setAppSubtitle] = useState('Admin dashboard');
    const [appIconUrl, setAppIconUrl] = useState('');
    const [siteTitle, setSiteTitle] = useState('PocketBase.Net');
    const [defaultLanguage, setDefaultLanguage] = useState<SupportedLocale>('zh-CN');
    const [primaryColor, setPrimaryColor] = useState('#2563eb');

    const [attachmentsFolder, setAttachmentsFolder] = useState('attachments');
    const [avatarsFolder, setAvatarsFolder] = useState('avatars');
    const [editorImagesFolder, setEditorImagesFolder] = useState('editor-images');

    const [supportedLanguages, setSupportedLanguages] = useState<SupportedLocale[]>(['zh-CN', 'en-US']);
    const [systemConfig, setSystemConfig] = useState<LocalSystemConfig>(defaultSystemConfig);
    const [systemConfigRaw, setSystemConfigRaw] = useState('{}');
    const [auditLogs, setAuditLogs] = useState<ApplicationSettingsAuditItem[]>([]);
    const [auditActorFilter, setAuditActorFilter] = useState('');
    const [auditFieldFilter, setAuditFieldFilter] = useState('');
    const [uploadingLogo, setUploadingLogo] = useState(false);

    const localeOptions = useMemo(() => [
        { value: 'zh-CN' as const, label: '中文 (简体)' },
        { value: 'en-US' as const, label: 'English' },
    ], []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await api.get<ApplicationSettings>('/application-settings');
                const settings = res.data;

                setAppName(settings.appName);
                setAppSubtitle(settings.appSubtitle);
                setAppIconUrl(settings.appIconUrl || '');
                setSiteTitle(settings.siteTitle || settings.appName);
                setDefaultLanguage(toLocale(settings.defaultLanguage));
                setPrimaryColor(settings.primaryColor || '#2563eb');
                setAttachmentsFolder(settings.storageFolders.attachments || 'attachments');
                setAvatarsFolder(settings.storageFolders.avatars || 'avatars');
                setEditorImagesFolder(settings.storageFolders.editorImages || 'editor-images');

                const support = (settings.supportedLanguages ?? []).map(toLocale);
                setSupportedLanguages(support.length ? support : ['zh-CN', 'en-US']);

                const configFromServer = settings.systemConfig ?? {};
                const typedConfig: LocalSystemConfig = {
                    allowSelfRegistration: Boolean(configFromServer.allowSelfRegistration ?? defaultSystemConfig.allowSelfRegistration),
                    enableApiPreview: Boolean(configFromServer.enableApiPreview ?? defaultSystemConfig.enableApiPreview),
                    enableAuditLog: Boolean(configFromServer.enableAuditLog ?? defaultSystemConfig.enableAuditLog),
                    maxUploadSizeMb: Number(configFromServer.maxUploadSizeMb ?? defaultSystemConfig.maxUploadSizeMb),
                };
                setSystemConfig(typedConfig);
                setSystemConfigRaw(JSON.stringify(configFromServer, null, 2));
            } catch (e) {
                const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
                setError(message || '加载应用设置失败');
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    useEffect(() => {
        const loadAuditLogs = async () => {
            try {
                const res = await api.get<ApplicationSettingsAuditItem[]>('/application-settings/audit-logs', { params: { take: 20 } });
                setAuditLogs(res.data ?? []);
            } catch {
                setAuditLogs([]);
            }
        };

        void loadAuditLogs();
    }, []);

    const applyPresetLocale = (value: SupportedLocale) => {
        setDefaultLanguage(value);
        if (!supportedLanguages.includes(value)) {
            setSupportedLanguages(prev => [...prev, value]);
        }
    };

    const toggleLocaleSupport = (value: SupportedLocale, checked: boolean) => {
        setSupportedLanguages(prev => {
            const next = checked ? Array.from(new Set([...prev, value])) : prev.filter(x => x !== value);
            if (!next.includes(defaultLanguage)) {
                return Array.from(new Set([...next, defaultLanguage]));
            }
            return next;
        });
    };

    const filteredAuditLogs = useMemo(() => {
        const actorKeyword = auditActorFilter.trim().toLowerCase();
        const fieldKeyword = auditFieldFilter.trim().toLowerCase();

        return auditLogs.filter(log => {
            const actorMatched = !actorKeyword
                || log.actorDisplayName?.toLowerCase().includes(actorKeyword)
                || log.actorEmail?.toLowerCase().includes(actorKeyword)
                || log.actorId?.toLowerCase().includes(actorKeyword);

            const fieldMatched = !fieldKeyword
                || log.changes.some(change => change.key.toLowerCase().includes(fieldKeyword));

            return actorMatched && fieldMatched;
        });
    }, [auditActorFilter, auditFieldFilter, auditLogs]);

    const handleExportAuditJson = () => {
        const exportPayload = {
            exportedAt: new Date().toISOString(),
            filters: {
                actor: auditActorFilter,
                field: auditFieldFilter,
            },
            total: filteredAuditLogs.length,
            items: filteredAuditLogs,
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `application-settings-audit-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        setError('');

        let parsedConfig: Record<string, unknown>;
        try {
            parsedConfig = JSON.parse(systemConfigRaw);
        } catch {
            setSaving(false);
            setError('系统配置 JSON 格式不正确');
            return;
        }

        const mergedConfig = {
            ...parsedConfig,
            allowSelfRegistration: systemConfig.allowSelfRegistration,
            enableApiPreview: systemConfig.enableApiPreview,
            enableAuditLog: systemConfig.enableAuditLog,
            maxUploadSizeMb: systemConfig.maxUploadSizeMb,
        };

        try {
            const payload = {
                appName,
                appSubtitle,
                appIconUrl,
                siteTitle,
                defaultLanguage,
                supportedLanguages,
                primaryColor,
                storageFolders: {
                    attachments: attachmentsFolder,
                    avatars: avatarsFolder,
                    editorImages: editorImagesFolder,
                },
                systemConfig: mergedConfig,
            };

            const res = await api.put<ApplicationSettings>('/application-settings', payload);
            const settings = res.data;
            onChanged?.(settings);
            setLocale(toLocale(settings.defaultLanguage));

            try {
                const logsRes = await api.get<ApplicationSettingsAuditItem[]>('/application-settings/audit-logs', { params: { take: 20 } });
                setAuditLogs(logsRes.data ?? []);
            } catch {
                // ignore audit refresh errors
            }

            setSystemConfigRaw(JSON.stringify(settings.systemConfig ?? {}, null, 2));
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
            setError(message || '保存失败，请检查输入后重试');
        } finally {
            setSaving(false);
        }
    };

    const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadingLogo(true);
        setError('');
        try {
            const result = await uploadFile(file, 'avatars');
            setAppIconUrl(getFilePreviewUrl(result.fileName, 'avatars'));
        } catch (e) {
            const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
            setError(message || '上传图标失败');
        } finally {
            setUploadingLogo(false);
            event.currentTarget.value = '';
        }
    };

    return (
        <div className="flex h-full flex-col overflow-auto">
            <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Application Settings Center</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">统一管理品牌、语言、文件目录与系统参数。建议所有全局配置都沉淀到这里，便于产品化维护。</p>
            </div>

            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 lg:p-6">
                {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">品牌与展示</h3>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                        <div className="space-y-3">
                            <Label className="text-xs">应用图标预览</Label>
                            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted/30">
                                {appIconUrl ? (
                                    <img src={appIconUrl} alt="Application logo preview" className="h-full w-full object-contain p-3" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <ImageIcon className="h-8 w-8" />
                                        <span className="text-xs">暂无图标</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">应用名称</Label>
                                <div className="relative">
                                    <Type className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={appName} onChange={e => setAppName(e.target.value)} className="pl-9" disabled={loading} />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">应用副标题</Label>
                                <Input value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="用于登录页、页头说明" disabled={loading} />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">站点标题 (document.title)</Label>
                                <Input value={siteTitle} onChange={e => setSiteTitle(e.target.value)} disabled={loading} />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">图标地址</Label>
                                <div className="relative">
                                    <Upload className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={appIconUrl} onChange={e => setAppIconUrl(e.target.value)} placeholder="https://example.com/logo.png" className="pl-9" disabled={loading} />
                                </div>
                                <div>
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent/50">
                                        <Upload className="h-3.5 w-3.5" />
                                        {uploadingLogo ? t('applicationSettingsUploadingLogo') : t('applicationSettingsUploadLogo')}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            disabled={uploadingLogo || loading}
                                            onChange={handleUploadLogo}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Languages className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">语言与本地化</h3>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">默认语言</Label>
                            <Select value={defaultLanguage} onValueChange={v => applyPresetLocale(v as SupportedLocale)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {localeOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">保存后会自动切换后台默认语言。</p>
                        </div>

                        <div className="space-y-2 lg:col-span-2">
                            <Label className="text-xs">支持语言</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {localeOptions.map(opt => (
                                    <div key={opt.value} className="flex items-center justify-between rounded-md border px-3 py-2">
                                        <span className="text-sm">{opt.label}</span>
                                        <Switch
                                            checked={supportedLanguages.includes(opt.value)}
                                            onCheckedChange={checked => toggleLocaleSupport(opt.value, checked)}
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">当前语言：{locale}</p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Palette className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">主题与品牌色</h3>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">主色（Flat）</Label>
                            <div className="flex gap-2">
                                <Input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-14 p-1" />
                                <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                            </div>
                        </div>
                        <div className="lg:col-span-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                            建议把品牌色用于按钮、强调状态和图标，避免直接覆盖页面背景色，保证亮暗主题对比度。
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">附件与文件夹设置</h3>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">附件文件夹</Label>
                            <Input value={attachmentsFolder} onChange={e => setAttachmentsFolder(e.target.value)} disabled={loading} />
                            <p className="text-xs text-muted-foreground">用于普通附件上传。</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">头像文件夹</Label>
                            <Input value={avatarsFolder} onChange={e => setAvatarsFolder(e.target.value)} disabled={loading} />
                            <p className="text-xs text-muted-foreground">用于头像、封面等图片。</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">编辑器图片文件夹</Label>
                            <Input value={editorImagesFolder} onChange={e => setEditorImagesFolder(e.target.value)} disabled={loading} />
                            <p className="text-xs text-muted-foreground">用于富文本上传图片。</p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">系统参数（产品化建议）</h3>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3 rounded-lg border p-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">允许自助注册</Label>
                                <Switch checked={systemConfig.allowSelfRegistration} onCheckedChange={v => setSystemConfig(s => ({ ...s, allowSelfRegistration: v }))} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">启用 API Preview</Label>
                                <Switch checked={systemConfig.enableApiPreview} onCheckedChange={v => setSystemConfig(s => ({ ...s, enableApiPreview: v }))} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">启用审计日志</Label>
                                <Switch checked={systemConfig.enableAuditLog} onCheckedChange={v => setSystemConfig(s => ({ ...s, enableAuditLog: v }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">最大上传大小 (MB)</Label>
                                <Input
                                    type="number"
                                    value={systemConfig.maxUploadSizeMb}
                                    onChange={e => setSystemConfig(s => ({ ...s, maxUploadSizeMb: Number(e.target.value || 100) }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">扩展配置 JSON</Label>
                            <Textarea
                                className="min-h-48 font-mono text-xs"
                                value={systemConfigRaw}
                                onChange={e => setSystemConfigRaw(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">用于未来扩展（例如：第三方登录、邮件配置、企业策略等）。</p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-primary" />
                        <div>
                            <h3 className="text-sm font-semibold">{t('applicationSettingsAuditTitle')}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{t('applicationSettingsAuditSubtitle')}</p>
                        </div>
                    </div>

                    <div className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <Input
                            value={auditActorFilter}
                            onChange={e => setAuditActorFilter(e.target.value)}
                            placeholder="按人筛选：姓名 / 邮箱 / ID"
                        />
                        <Input
                            value={auditFieldFilter}
                            onChange={e => setAuditFieldFilter(e.target.value)}
                            placeholder="按字段筛选：如 systemConfig.allowSelfRegistration"
                        />
                        <Button variant="outline" onClick={handleExportAuditJson} disabled={filteredAuditLogs.length === 0}>
                            导出 JSON
                        </Button>
                    </div>

                    {filteredAuditLogs.length === 0 ? (
                        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                            {auditLogs.length === 0 ? t('applicationSettingsAuditNoRecords') : '当前筛选条件下无记录'}
                        </div>
                    ) : (
                        <div className="overflow-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-muted/40">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('applicationSettingsAuditChangedAt')}</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('applicationSettingsAuditActor')}</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('applicationSettingsAuditChanges')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAuditLogs.map((log) => (
                                        <tr key={log.id}>
                                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                <div className="font-medium">{log.actorDisplayName || t('logsUnknownActor')}</div>
                                                <div className="text-muted-foreground">{log.actorEmail || log.actorId || '-'}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="space-y-1">
                                                    {log.changes.map((change, idx) => (
                                                        <div key={`${log.id}-${idx}`} className="text-xs">
                                                            <span className="font-mono rounded bg-muted px-1.5 py-0.5 mr-1">{change.key}</span>
                                                            <span className="text-muted-foreground">{change.oldValue}</span>
                                                            <span className="mx-1">→</span>
                                                            <span>{change.newValue}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2">
                            <Globe className="mt-0.5 h-4 w-4 text-primary" />
                            <div>
                                <h3 className="text-sm font-semibold">保存与发布</h3>
                                <p className="mt-1 text-xs text-muted-foreground">保存后立即作用于系统品牌、默认语言与文件目录映射。</p>
                            </div>
                        </div>
                        <Button className="gap-2" onClick={handleSave} disabled={saving || loading}>
                            <Save className="h-4 w-4" />
                            {saving ? '保存中...' : saved ? '已保存' : '保存设置'}
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    );
}
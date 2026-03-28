import { useState } from 'react';
import { ImageIcon, FolderOpen, Save, Settings2, Type, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ApplicationSettingPage() {
    const [appName, setAppName] = useState('PocketBase.Net');
    const [appSubtitle, setAppSubtitle] = useState('Admin dashboard');
    const [logoUrl, setLogoUrl] = useState('');
    const [attachmentsFolder, setAttachmentsFolder] = useState('storage/attachments');
    const [avatarsFolder, setAvatarsFolder] = useState('storage/avatars');
    const [editorImagesFolder, setEditorImagesFolder] = useState('storage/editor-images');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="flex h-full flex-col overflow-auto">
            <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Application Setting</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">应用基础信息与文件存储路径配置页面。当前为前端静态实现，后端保存接口后续接入。</p>
            </div>

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:p-6">
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">品牌与展示</h3>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                        <div className="space-y-3">
                            <Label className="text-xs">应用图标预览</Label>
                            <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed bg-muted/30">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Application logo preview" className="h-24 w-24 rounded-2xl object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <ImageIcon className="h-8 w-8" />
                                        <span className="text-xs">暂无图标</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">后续可扩展为上传图片或从媒体库选择。</p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">应用名称</Label>
                                <div className="relative">
                                    <Type className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={appName} onChange={e => setAppName(e.target.value)} className="pl-9" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">应用副标题</Label>
                                <Input value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="用于登录页、浏览器标题或页头说明" />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">图标地址</Label>
                                <div className="relative">
                                    <Upload className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="pl-9" />
                                </div>
                            </div>
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
                            <Input value={attachmentsFolder} onChange={e => setAttachmentsFolder(e.target.value)} />
                            <p className="text-xs text-muted-foreground">普通附件、导入导出文件等默认目录。</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">头像文件夹</Label>
                            <Input value={avatarsFolder} onChange={e => setAvatarsFolder(e.target.value)} />
                            <p className="text-xs text-muted-foreground">用户头像、封面或轻量图片资源目录。</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">编辑器图片文件夹</Label>
                            <Input value={editorImagesFolder} onChange={e => setEditorImagesFolder(e.target.value)} />
                            <p className="text-xs text-muted-foreground">富文本编辑器上传图片默认目录。</p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold">预留扩展项</h3>
                            <p className="mt-1 text-xs text-muted-foreground">后续可以在这里接入站点标题、默认语言、上传大小限制、主题品牌色等系统级配置。</p>
                        </div>
                        <Button className="gap-2" onClick={handleSave}>
                            <Save className="h-4 w-4" />
                            {saved ? '已保存（本地演示）' : '保存设置'}
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    );
}
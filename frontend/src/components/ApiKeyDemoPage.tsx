import { useState } from 'react';
import { Play, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestResult = { status: number; statusText: string; body: unknown; durationMs: number };

const METHOD_COLORS: Record<Method, string> = {
    GET: 'text-green-600 dark:text-green-400',
    POST: 'text-blue-600 dark:text-blue-400',
    PUT: 'text-amber-600 dark:text-amber-400',
    DELETE: 'text-red-600 dark:text-red-400',
};

const EXAMPLE_SNIPPETS = [
    { label: '查询订单列表', method: 'GET' as Method, url: '/api/records/order?page=1&perPage=10&sort=-updated' },
    { label: '查询指定记录', method: 'GET' as Method, url: '/api/records/order/YOUR_RECORD_ID' },
    { label: '新增记录', method: 'POST' as Method, url: '/api/records/order', body: '{\n  "field1": "value1",\n  "field2": "value2"\n}' },
    { label: '更新记录', method: 'PUT' as Method, url: '/api/records/order/YOUR_RECORD_ID', body: '{\n  "field1": "new value"\n}' },
    { label: '删除记录', method: 'DELETE' as Method, url: '/api/records/order/YOUR_RECORD_ID' },
    { label: '诊断 Token', method: 'GET' as Method, url: '/api/auth/diagnose' },
];

export function ApiKeyDemoPage() {
    // ── Connection config ─────────────────────────────────────────────────
    const [baseUrl, setBaseUrl] = useState('https://localhost:7161');
    const [apiKey, setApiKey] = useState('');

    // ── Request config ────────────────────────────────────────────────────
    const [method, setMethod] = useState<Method>('GET');
    const [url, setUrl] = useState('/api/records/order?page=1&perPage=10&sort=-updated');
    const [body, setBody] = useState('');

    // ── State ─────────────────────────────────────────────────────────────
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RequestResult | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');

    const run = async () => {
        if (!apiKey.trim()) { setError('请先输入 API Key'); return; }
        setRunning(true); setError(''); setResult(null);

        const fullUrl = url.startsWith('http') ? url : `${baseUrl.replace(/\/$/, '')}${url}`;
        const start = Date.now();

        try {
            const init: RequestInit = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey.trim(),
                },
            };
            if ((method === 'POST' || method === 'PUT') && body.trim()) {
                init.body = body.trim();
            }

            const res = await fetch(fullUrl, init);
            const durationMs = Date.now() - start;
            let parsed: unknown;
            try { parsed = await res.json(); } catch { parsed = await res.text(); }
            setResult({ status: res.status, statusText: res.statusText, body: parsed, durationMs });
        } catch (e) {
            setError(`请求失败: ${String(e)}`);
        } finally {
            setRunning(false);
        }
    };

    const copyText = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(''), 2000);
    };

    const applySnippet = (s: typeof EXAMPLE_SNIPPETS[number]) => {
        setMethod(s.method);
        setUrl(s.url);
        setBody(s.body ?? '');
    };

    const statusColor = result
        ? result.status >= 500 ? 'text-red-600'
            : result.status >= 400 ? 'text-amber-600'
                : 'text-green-600'
        : '';

    const sampleUrl = `${baseUrl.replace(/\/$/, '')}/api/records/order?page=1&perPage=10`;
    const sampleApiKey = apiKey.trim() || 'pbn_your_api_key_here';
    const usageSnippets = {
        react: `const response = await fetch('${sampleUrl}', {
    method: 'GET',
    headers: {
        'X-API-Key': '${sampleApiKey}',
        'Content-Type': 'application/json'
    }
});

const data = await response.json();`,
        dotnet: `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("X-API-Key", "${sampleApiKey}");

var res = await client.GetAsync("${sampleUrl}");
var json = await res.Content.ReadAsStringAsync();`,
        curl: `curl -k "${sampleUrl}" \\
    -H "X-API-Key: ${sampleApiKey}" \\
    -H "Content-Type: application/json"`,
    };

    return (
        <div className="flex h-full flex-col overflow-auto">
            <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">API Key 测试台</h2>
                <p className="text-xs text-muted-foreground mt-0.5">在此使用 API Key 直接测试接口请求</p>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
                {/* ── Left: Config ──────────────────────────────────────────── */}
                <div className="w-full lg:w-[420px] lg:border-r flex flex-col overflow-y-auto">
                    {/* Connection */}
                    <section className="border-b px-4 py-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">连接配置</h3>
                        <div className="space-y-1.5">
                            <Label className="text-xs">服务器地址</Label>
                            <Input
                                value={baseUrl}
                                onChange={e => setBaseUrl(e.target.value)}
                                placeholder="https://localhost:7161"
                                className="text-xs font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">API Key (X-API-Key header)</Label>
                            <Input
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder="pbn_xxxxxxxxxxxxxxxx..."
                                className="text-xs font-mono"
                                type="password"
                            />
                        </div>
                    </section>

                    {/* Request */}
                    <section className="border-b px-4 py-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">请求</h3>
                        <div className="flex gap-2">
                            <select
                                value={method}
                                onChange={e => setMethod(e.target.value as Method)}
                                className={cn('rounded-md border bg-background px-2 py-1.5 text-xs font-bold shrink-0 focus:outline-none', METHOD_COLORS[method])}
                            >
                                {(['GET', 'POST', 'PUT', 'DELETE'] as Method[]).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                            <Input
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="/api/records/slug"
                                className="text-xs font-mono"
                            />
                        </div>

                        {(method === 'POST' || method === 'PUT') && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Request Body (JSON)</Label>
                                <textarea
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    rows={6}
                                    placeholder='{"field": "value"}'
                                    className="w-full rounded-md border bg-transparent p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                                />
                            </div>
                        )}

                        {error && <p className="text-xs text-destructive">{error}</p>}

                        <Button className="w-full gap-2" onClick={run} disabled={running}>
                            <Play className="h-3.5 w-3.5" />
                            {running ? '请求中...' : '发起请求'}
                        </Button>
                    </section>

                    {/* Quick snippets */}
                    <section className="px-4 py-4 space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">快速示例</h3>
                        <div className="space-y-1">
                            {EXAMPLE_SNIPPETS.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => applySnippet(s)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                                >
                                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className={cn('font-mono font-bold shrink-0', METHOD_COLORS[s.method])}>{s.method}</span>
                                    <span className="truncate text-muted-foreground">{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Usage guide */}
                    <section className="border-t px-4 py-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">使用方法</h3>
                        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                            <p className="text-xs font-medium">请求头必须包含</p>
                            <code className="block text-xs text-muted-foreground break-all">
                                X-API-Key: {sampleApiKey}
                            </code>
                        </div>

                        <div className="space-y-2">
                            <div className="rounded-md border p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">React / fetch</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(usageSnippets.react, 'react-snippet')}>
                                        {copied === 'react-snippet' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                                <pre className="rounded bg-muted/50 p-2 text-[11px] leading-relaxed overflow-auto whitespace-pre-wrap break-words">
                                    {usageSnippets.react}
                                </pre>
                            </div>

                            <div className="rounded-md border p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">.NET / HttpClient</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(usageSnippets.dotnet, 'dotnet-snippet')}>
                                        {copied === 'dotnet-snippet' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                                <pre className="rounded bg-muted/50 p-2 text-[11px] leading-relaxed overflow-auto whitespace-pre-wrap break-words">
                                    {usageSnippets.dotnet}
                                </pre>
                            </div>

                            <div className="rounded-md border p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">cURL</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(usageSnippets.curl, 'curl-snippet')}>
                                        {copied === 'curl-snippet' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                                <pre className="rounded bg-muted/50 p-2 text-[11px] leading-relaxed overflow-auto whitespace-pre-wrap break-words">
                                    {usageSnippets.curl}
                                </pre>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ── Right: Response ───────────────────────────────────────── */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">响应</span>
                        {result && (
                            <div className="flex items-center gap-3">
                                <span className={cn('text-xs font-bold', statusColor)}>
                                    {result.status} {result.statusText}
                                </span>
                                <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyText(JSON.stringify(result.body, null, 2), 'response')}
                                >
                                    {copied === 'response' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        {!result && !running && (
                            <div className="flex h-full items-center justify-center flex-col gap-2 text-center text-muted-foreground">
                                <ChevronDown className="h-8 w-8 opacity-20" />
                                <p className="text-sm">配置好 API Key 和请求后点击"发起请求"</p>
                            </div>
                        )}
                        {running && (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                请求中...
                            </div>
                        )}
                        {result && (
                            <pre className="rounded-lg bg-muted/50 p-4 text-xs font-mono leading-relaxed overflow-auto whitespace-pre-wrap break-words">
                                {JSON.stringify(result.body, null, 2)}
                            </pre>
                        )}
                    </div>

                    {/* Curl snippet */}
                    {apiKey && url && (
                        <div className="border-t px-4 py-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-muted-foreground">cURL 命令</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => {
                                        const full = url.startsWith('http') ? url : `${baseUrl.replace(/\/$/, '')}${url}`;
                                        const bodyFlag = body.trim() ? ` -d '${body.trim()}'` : '';
                                        const methodFlag = method !== 'GET' ? ` -X ${method}` : '';
                                        copyText(`curl -k${methodFlag} "${full}" -H "X-API-Key: ${apiKey}"${methodFlag === ' -X POST' || methodFlag === ' -X PUT' ? ' -H "Content-Type: application/json"' : ''}${bodyFlag}`, 'curl');
                                    }}
                                >
                                    {copied === 'curl' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                            <code className="block text-xs font-mono text-muted-foreground break-all bg-muted/40 rounded p-2">
                                {`curl -k${method !== 'GET' ? ` -X ${method}` : ''} "${url.startsWith('http') ? url : baseUrl.replace(/\/$/, '') + url}" -H "X-API-Key: ${apiKey.substring(0, 16)}..."`}
                            </code>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

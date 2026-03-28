import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Expand,
    Layers2,
    Minimize,
    Monitor,
    SkipBack,
    SkipForward,
    SplitSquareVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import pptData from '@/data/gateMode3Slides.json';

type ThemeVariant = 'abb' | 'clean' | 'slate';
type ViewMode = 'split' | 'web' | 'reference';

type SlideElement = {
    type: 'shape' | 'image';
    name?: string | null;
    geometry?: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string | null;
    fill?: string | null;
    line?: string | null;
    fontSizePt?: number | null;
    textColor?: string | null;
    src?: string | null;
};

type ParsedSlide = {
    index: number;
    elements: SlideElement[];
};

type ParsedDeck = {
    slideWidth: number;
    slideHeight: number;
    slides: ParsedSlide[];
};

const deck = pptData as ParsedDeck;
const EMU_TO_PX = 1 / 9525;
const BASE_WIDTH = deck.slideWidth * EMU_TO_PX;
const BASE_HEIGHT = deck.slideHeight * EMU_TO_PX;
const TOTAL_SLIDES = deck.slides.length;
const PLACEHOLDER_PATTERN = /click to edit|second level|third level|fourth level|fifth level/i;

const THEME_OPTIONS: { key: ThemeVariant; label: string; description: string }[] = [
    { key: 'abb', label: 'ABB Pro', description: '红白高对比，偏发布会质感' },
    { key: 'clean', label: 'Clean', description: '通透留白，适合评审阅读' },
    { key: 'slate', label: 'Slate', description: '深浅灰阶，适合夜间演示' },
];

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'split', label: '对照分屏', icon: SplitSquareVertical },
    { key: 'web', label: '网页版', icon: Layers2 },
    { key: 'reference', label: '原稿图', icon: Monitor },
];

function emuToPx(value: number) {
    return value * EMU_TO_PX;
}

function mapShapeRadius(geometry?: string | null) {
    if (geometry === 'roundRect') return 12;
    if (geometry === 'ellipse') return 999;
    return 0;
}

function referenceImagePath(index: number) {
    return `/gate3-slides/Slide${index}.PNG`;
}

function isMeaningfulText(text?: string | null) {
    if (!text) return false;
    const compact = text.trim();
    return compact.length > 0 && !PLACEHOLDER_PATTERN.test(compact);
}

function isRenderableElement(el: SlideElement) {
    if (el.type === 'image') {
        if (!el.src) return false;
        if (el.src.endsWith('.xml')) return false;
        return true;
    }

    if (isMeaningfulText(el.text)) return true;
    if (el.fill || el.line) return true;

    const area = (el.w ?? 0) * (el.h ?? 0);
    return area > 2_000_000;
}

function normalizeHexColor(color?: string | null, fallback = '#1f2937') {
    if (!color) return fallback;
    return color.startsWith('#') ? color : `#${color}`;
}

function BrandChrome({ theme }: { theme: ThemeVariant }) {
    const fg = theme === 'slate' ? '#f8fafc' : '#111827';

    return (
        <>
            <div className="absolute left-5 top-5 z-30 h-10 w-10 border-[4px] border-[#ff3a3a] bg-transparent">
                <div className="mt-3.5 ml-1.5 h-[4px] w-5 bg-[#ff3a3a]" />
            </div>

            <div className="absolute right-4 top-4 z-30 flex h-[56px] w-[84px] items-center justify-center border-[3px] border-[#ff3a3a] bg-transparent">
                <span className="text-[42px] font-black leading-none tracking-[-2px] text-[#ff3a3a]">ABB</span>
            </div>

            <div
                className="absolute right-4 bottom-3 z-30 text-sm font-medium"
                style={{ color: fg, opacity: theme === 'slate' ? 0.82 : 0.72 }}
            >
                CN IS Application build team
            </div>
        </>
    );
}

function CuratedSlideOverlay({ slideIndex, theme }: { slideIndex: number; theme: ThemeVariant }) {
    const panelBg = theme === 'slate' ? 'rgba(15,23,42,0.56)' : 'rgba(248,250,252,0.86)';
    const mainText = theme === 'slate' ? '#f8fafc' : '#0b0f19';
    const subText = theme === 'slate' ? '#e2e8f0' : '#111827';

    if (slideIndex === 1) {
        return (
            <div
                className="absolute left-5 bottom-5 z-30 w-[510px] border-[4px] border-[#ff4d4f] px-4 py-3"
                style={{ background: panelBg }}
            >
                <p className="mb-1 text-[28px] tracking-[0.4px]" style={{ color: subText }}>
                    STECO MEETING,
                </p>
                <h2 className="mb-0.5 text-[72px] leading-[1.02] font-extrabold tracking-[-1.2px]" style={{ color: mainText }}>
                    Gate 3 Meeting
                </h2>
                <p className="text-[46px] leading-[1.05] font-semibold tracking-[-0.4px]" style={{ color: mainText }}>
                    CNMOT SRM
                </p>
            </div>
        );
    }

    if (slideIndex === 2) {
        return (
            <div
                className="absolute left-[48px] top-[120px] z-30 w-[760px] border-[3px] border-[#ff4d4f] px-5 py-4"
                style={{ background: panelBg }}
            >
                <p className="text-[54px] font-bold leading-[1.08]" style={{ color: mainText }}>
                    Project Update
                </p>
                <p className="mt-3 text-[40px] font-semibold leading-[1.15]" style={{ color: subText }}>
                    Gate 3 Check list
                </p>
                <p className="mt-1 text-[40px] font-semibold leading-[1.15]" style={{ color: subText }}>
                    Gate 3 Decision
                </p>
            </div>
        );
    }

    if (slideIndex === 3) {
        return (
            <>
                <div
                    className="absolute left-[38px] top-[90px] z-30 w-[360px] border-[3px] border-[#ff4d4f] px-4 py-3"
                    style={{ background: panelBg }}
                >
                    <p className="text-[54px] font-extrabold leading-[1.06]" style={{ color: mainText }}>
                        Scope list
                    </p>
                </div>

                <div
                    className="absolute right-[34px] top-[220px] z-30 w-[460px] border-[2px] border-[#ff4d4f] px-4 py-3"
                    style={{ background: panelBg }}
                >
                    <p className="text-[30px] leading-[1.22] font-semibold" style={{ color: subText }}>
                        供应商主数据
                        <br />
                        供应商---物料对应关系
                        <br />
                        图纸查询
                        <br />
                        BOM查询
                        <br />
                        NCR
                        <br />
                        PO协同
                        <br />
                        PO收货
                        <br />
                        PO Confirmation
                    </p>
                </div>
            </>
        );
    }

    return null;
}

function SlideCanvas({
    slide,
    scale,
    theme,
    useReferenceBase,
    showReferenceOverlay,
    overlayOpacity,
    overlayBlendMode,
}: {
    slide: ParsedSlide;
    scale: number;
    theme: ThemeVariant;
    useReferenceBase: boolean;
    showReferenceOverlay: boolean;
    overlayOpacity: number;
    overlayBlendMode: 'multiply' | 'difference';
}) {
    const renderableElements = useMemo(() => slide.elements.filter(isRenderableElement), [slide.elements]);

    const backgroundImage = useMemo(() => {
        const fullScreenImage = renderableElements.find(
            el =>
                el.type === 'image' &&
                !!el.src &&
                el.x <= 10 &&
                el.y <= 10 &&
                el.w >= deck.slideWidth * 0.95 &&
                el.h >= deck.slideHeight * 0.95
        );
        return fullScreenImage?.src ?? null;
    }, [renderableElements]);

    return (
        <div className="relative h-full w-full overflow-hidden bg-white" style={{ borderRadius: 18 }}>
            <div
                className={cn(
                    'absolute inset-0 opacity-100',
                    theme === 'abb' && 'bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]',
                    theme === 'clean' && 'bg-white',
                    theme === 'slate' && 'bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]'
                )}
            />

            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt={`Slide ${slide.index} background`}
                    className="absolute object-cover"
                    style={{ left: 0, top: 0, width: '100%', height: '100%' }}
                    draggable={false}
                />
            )}

            {useReferenceBase && (
                <img
                    src={referenceImagePath(slide.index)}
                    alt={`Slide ${slide.index} reference base`}
                    className="absolute object-cover"
                    style={{ left: 0, top: 0, width: '100%', height: '100%' }}
                    draggable={false}
                />
            )}

            {showReferenceOverlay && (
                <img
                    src={referenceImagePath(slide.index)}
                    alt={`Slide ${slide.index} reference overlay`}
                    className="absolute object-cover"
                    style={{
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        opacity: overlayOpacity,
                        mixBlendMode: overlayBlendMode,
                        pointerEvents: 'none',
                    }}
                    draggable={false}
                />
            )}

            {renderableElements.map((el, idx) => {
                const left = emuToPx(el.x);
                const top = emuToPx(el.y);
                const width = emuToPx(el.w);
                const height = emuToPx(el.h);
                const fontSize = (el.fontSizePt ?? 14) * 1.333;

                if (el.type === 'image' && el.src) {
                    return (
                        <img
                            key={`${slide.index}-img-${idx}`}
                            src={el.src}
                            alt={el.name ?? `slide-${slide.index}-image-${idx}`}
                            className="absolute object-contain"
                            style={{ left, top, width, height }}
                            draggable={false}
                        />
                    );
                }

                const hasText = isMeaningfulText(el.text);
                const isLikelyLine =
                    el.geometry === 'line' ||
                    width <= 2 ||
                    height <= 2 ||
                    (width > 120 && height <= 4) ||
                    (height > 120 && width <= 4);
                const lineColor = normalizeHexColor(el.line ?? el.textColor, theme === 'slate' ? '#cbd5e1' : '#334155');
                return (
                    <div
                        key={`${slide.index}-shape-${idx}`}
                        className={cn('absolute overflow-hidden', hasText ? 'px-1 py-0.5' : '')}
                        style={{
                            left,
                            top,
                            width,
                            height,
                            backgroundColor: isLikelyLine ? 'transparent' : (el.fill ?? 'transparent'),
                            border: el.line
                                ? `1px solid ${normalizeHexColor(el.line, '#334155')}`
                                : isLikelyLine
                                    ? `1px solid ${lineColor}`
                                    : 'none',
                            borderRadius: mapShapeRadius(el.geometry),
                            opacity: isLikelyLine ? 0.95 : 1,
                        }}
                    >
                        {hasText && (
                            <div
                                className="whitespace-pre-wrap wrap-break-word leading-[1.24]"
                                style={{
                                    color: normalizeHexColor(el.textColor, '#111827'),
                                    fontSize,
                                    fontWeight: 500,
                                    transform: scale < 0.6 ? 'scale(0.98)' : 'none',
                                    transformOrigin: 'top left',
                                }}
                            >
                                {el.text}
                            </div>
                        )}
                    </div>
                );
            })}

            <BrandChrome theme={theme} />
            <CuratedSlideOverlay slideIndex={slide.index} theme={theme} />
        </div>
    );
}

function SlideThumb({ slide, selected, onClick }: { slide: ParsedSlide; selected: boolean; onClick: () => void }) {
    const firstText = slide.elements.find(el => el.type === 'shape' && isMeaningfulText(el.text))?.text ?? `Slide ${slide.index}`;

    return (
        <button
            onClick={onClick}
            className={cn(
                'group relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border text-left transition-all',
                selected ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.18)]' : 'border-slate-300/70 hover:border-slate-500'
            )}
            title={`第 ${slide.index} 页`}
        >
            <div className="absolute inset-0 bg-[linear-gradient(145deg,#ffffff_0%,#f1f5f9_100%)]" />
            <div className="absolute left-1.5 right-1.5 top-1.5 line-clamp-2 text-[9px] font-semibold leading-tight text-slate-700">
                {firstText}
            </div>
            <span className="absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{slide.index}</span>
        </button>
    );
}

export function GateMode3Page() {
    const [activeTheme, setActiveTheme] = useState<ThemeVariant>('abb');
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [useReferenceBase, setUseReferenceBase] = useState(true);
    const [showOverlay, setShowOverlay] = useState(true);
    const [overlayOpacity, setOverlayOpacity] = useState(0.36);
    const [overlayBlendMode, setOverlayBlendMode] = useState<'multiply' | 'difference'>('multiply');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [viewportWidth, setViewportWidth] = useState(1080);

    const currentSlide = deck.slides[currentIndex];
    const progress = useMemo(() => Math.round(((currentIndex + 1) / TOTAL_SLIDES) * 100), [currentIndex]);
    const scale = Math.max(0.2, Math.min(1.25, viewportWidth / BASE_WIDTH));

    const goPrev = () => setCurrentIndex(prev => Math.max(0, prev - 1));
    const goNext = () => setCurrentIndex(prev => Math.min(TOTAL_SLIDES - 1, prev + 1));
    const goFirst = () => setCurrentIndex(0);
    const goLast = () => setCurrentIndex(TOTAL_SLIDES - 1);
    const jumpTo = (index: number) => setCurrentIndex(Math.min(Math.max(index, 0), TOTAL_SLIDES - 1));

    const toggleFullscreen = async () => {
        const host = stageRef.current;
        if (!host) return;

        if (!document.fullscreenElement) {
            await host.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    };

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goPrev();
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                goNext();
            }
            if (event.key.toLowerCase() === 'f') {
                event.preventDefault();
                void toggleFullscreen();
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    useEffect(() => {
        const node = viewportRef.current;
        if (!node) return;

        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width;
            if (width && width > 0) {
                const adjusted = viewMode === 'split' ? width / 2 - 28 : width - 22;
                setViewportWidth(Math.max(420, adjusted));
            }
        });

        observer.observe(node);
        return () => observer.disconnect();
    }, [viewMode]);

    const referenceSrc = referenceImagePath(currentSlide.index);
    const detectedCount = currentSlide.elements.filter(isRenderableElement).length;

    return (
        <div
            ref={stageRef}
            className={cn(
                'relative flex h-full min-h-0 flex-col overflow-hidden',
                activeTheme === 'abb' && 'bg-[radial-gradient(circle_at_12%_8%,rgba(225,6,0,0.14),transparent_28%),linear-gradient(120deg,#f8fafc_0%,#eef2f7_52%,#f8fafc_100%)]',
                activeTheme === 'clean' && 'bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]',
                activeTheme === 'slate' && 'bg-[radial-gradient(circle_at_20%_10%,#64748b_0%,#334155_35%,#0f172a_100%)]'
            )}
        >
            <div className="pointer-events-none absolute inset-0">
                <div
                    className={cn(
                        'absolute -top-24 left-1/3 h-60 w-60 rounded-full blur-3xl',
                        activeTheme === 'abb' && 'bg-red-400/25',
                        activeTheme === 'clean' && 'bg-slate-200/55',
                        activeTheme === 'slate' && 'bg-cyan-400/15'
                    )}
                />
            </div>

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-4 py-3 backdrop-blur-sm md:px-6">
                <div className="min-w-0">
                    <h1 className={cn('text-base font-semibold md:text-lg', activeTheme === 'slate' ? 'text-slate-100' : 'text-slate-900')}>
                        CNMOT SRM Project · Gate 3 Meeting
                    </h1>
                    <p className={cn('mt-0.5 text-xs md:text-sm', activeTheme === 'slate' ? 'text-slate-300' : 'text-slate-600')}>
                        图片基准 + 网页复刻 | 第 {currentSlide.index} / {TOTAL_SLIDES} 页 | 当前页识别元素 {detectedCount} 个
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className={cn('rounded-md border px-2.5 py-1 text-xs', activeTheme === 'slate' ? 'border-slate-600 text-slate-200' : 'border-slate-300 text-slate-700')}>
                        ABB-Style Review
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(activeTheme === 'slate' && 'border-slate-600 bg-slate-900/40 text-slate-100 hover:bg-slate-800')}
                        onClick={() => void toggleFullscreen()}
                    >
                        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                        <span className="ml-1.5">{isFullscreen ? '退出全屏' : '全屏阅读'}</span>
                    </Button>
                </div>
            </div>

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-6">
                <div className={cn('flex flex-wrap items-center gap-1 rounded-xl border bg-white/80 p-1.5 shadow-sm', activeTheme === 'slate' && 'border-slate-700 bg-slate-900/60')}>
                    {THEME_OPTIONS.map(option => (
                        <button
                            key={option.key}
                            onClick={() => setActiveTheme(option.key)}
                            title={option.description}
                            className={cn(
                                'rounded-lg px-3 py-1.5 text-xs md:text-sm transition-colors',
                                activeTheme === option.key
                                    ? activeTheme === 'slate'
                                        ? 'bg-white text-slate-900'
                                        : 'bg-red-600 text-white'
                                    : activeTheme === 'slate'
                                        ? 'text-slate-200 hover:bg-slate-800'
                                        : 'text-slate-700 hover:bg-slate-100'
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className={cn('flex flex-wrap items-center gap-1 rounded-xl border bg-white/80 p-1.5 shadow-sm', activeTheme === 'slate' && 'border-slate-700 bg-slate-900/60')}>
                    {VIEW_OPTIONS.map(option => {
                        const Icon = option.icon;
                        return (
                            <button
                                key={option.key}
                                onClick={() => setViewMode(option.key)}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs md:text-sm transition-colors',
                                    viewMode === option.key
                                        ? activeTheme === 'slate'
                                            ? 'bg-white text-slate-900'
                                            : 'bg-slate-900 text-white'
                                        : activeTheme === 'slate'
                                            ? 'text-slate-200 hover:bg-slate-800'
                                            : 'text-slate-700 hover:bg-slate-100'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 md:px-6 md:py-4">
                <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/55 bg-white/75 px-3 py-2 backdrop-blur-sm md:px-4', activeTheme === 'slate' && 'border-slate-700 bg-slate-900/55')}>
                    <div className={cn('text-xs md:text-sm', activeTheme === 'slate' ? 'text-slate-200' : 'text-slate-700')}>
                        叠图校准: 让网页层与原稿图逐像素对齐
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <label className={cn('text-xs', activeTheme === 'slate' ? 'text-slate-300' : 'text-slate-600')}>基底图</label>
                        <input
                            type="checkbox"
                            checked={useReferenceBase}
                            onChange={e => setUseReferenceBase(e.target.checked)}
                        />
                        <label className={cn('text-xs', activeTheme === 'slate' ? 'text-slate-300' : 'text-slate-600')}>Overlay</label>
                        <input
                            type="checkbox"
                            checked={showOverlay}
                            onChange={e => setShowOverlay(e.target.checked)}
                        />
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(overlayOpacity * 100)}
                            onChange={e => setOverlayOpacity(Number(e.target.value) / 100)}
                            className="w-32"
                            disabled={!showOverlay}
                        />
                        <span className={cn('w-10 text-right text-xs', activeTheme === 'slate' ? 'text-slate-300' : 'text-slate-600')}>
                            {Math.round(overlayOpacity * 100)}%
                        </span>
                        <select
                            value={overlayBlendMode}
                            onChange={e => setOverlayBlendMode(e.target.value as 'multiply' | 'difference')}
                            className={cn(
                                'rounded border px-1.5 py-1 text-xs',
                                activeTheme === 'slate'
                                    ? 'border-slate-600 bg-slate-900 text-slate-200'
                                    : 'border-slate-300 bg-white text-slate-700'
                            )}
                            disabled={!showOverlay}
                        >
                            <option value="multiply">Multiply</option>
                            <option value="difference">Difference</option>
                        </select>
                    </div>
                </div>

                <div
                    ref={viewportRef}
                    className={cn(
                        'grid min-h-0 flex-1 gap-3 overflow-auto rounded-2xl border border-white/50 p-2 md:p-4',
                        viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
                    )}
                >
                    {(viewMode === 'split' || viewMode === 'reference') && (
                        <div className="flex min-h-70 items-center justify-center rounded-xl border border-slate-200/80 bg-white/85 p-2">
                            <div className="relative w-full overflow-hidden rounded-lg border border-slate-200" style={{ aspectRatio: `${BASE_WIDTH} / ${BASE_HEIGHT}` }}>
                                <img
                                    src={referenceSrc}
                                    alt={`Slide ${currentSlide.index} reference`}
                                    className="absolute inset-0 h-full w-full object-contain"
                                    draggable={false}
                                />
                            </div>
                        </div>
                    )}

                    {(viewMode === 'split' || viewMode === 'web') && (
                        <div className="flex min-h-70 items-center justify-center rounded-xl border border-slate-200/80 bg-white/85 p-2">
                            <div style={{ width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale }}>
                                <div
                                    className={cn(
                                        'relative origin-top-left overflow-hidden rounded-2xl border transition-all duration-300',
                                        'animate-in fade-in zoom-in-95',
                                        activeTheme === 'abb' && 'border-slate-300/80 bg-white shadow-[0_20px_80px_-30px_rgba(15,23,42,0.35)]',
                                        activeTheme === 'clean' && 'border-slate-200 bg-white shadow-[0_12px_36px_-16px_rgba(2,6,23,0.2)]',
                                        activeTheme === 'slate' && 'border-slate-700 bg-slate-950/30 shadow-[0_30px_120px_-35px_rgba(56,189,248,0.45)]'
                                    )}
                                    style={{
                                        width: BASE_WIDTH,
                                        height: BASE_HEIGHT,
                                        transform: `scale(${scale})`,
                                    }}
                                >
                                    <SlideCanvas
                                        slide={currentSlide}
                                        scale={scale}
                                        theme={activeTheme}
                                        useReferenceBase={useReferenceBase}
                                        showReferenceOverlay={showOverlay}
                                        overlayOpacity={overlayOpacity}
                                        overlayBlendMode={overlayBlendMode}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/55 bg-white/75 px-3 py-2 backdrop-blur-sm md:px-4', activeTheme === 'slate' && 'border-slate-700 bg-slate-900/55')}>
                    <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goFirst} disabled={currentIndex === 0}>
                            <SkipBack className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} disabled={currentIndex === 0}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} disabled={currentIndex === TOTAL_SLIDES - 1}>
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goLast} disabled={currentIndex === TOTAL_SLIDES - 1}>
                            <SkipForward className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="min-w-55 flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    activeTheme === 'abb' && 'bg-linear-to-r from-red-600 to-red-400',
                                    activeTheme === 'clean' && 'bg-slate-500',
                                    activeTheme === 'slate' && 'bg-cyan-400'
                                )}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    <div className={cn('text-xs', activeTheme === 'slate' ? 'text-slate-300' : 'text-slate-600')}>
                        快捷键: ← / → 翻页, F 全屏
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                    {deck.slides.map((slide, index) => (
                        <SlideThumb
                            key={slide.index}
                            slide={slide}
                            selected={index === currentIndex}
                            onClick={() => jumpTo(index)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

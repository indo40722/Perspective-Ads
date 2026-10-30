import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
    ArrowUpRight,
    ChevronRight,
    CircleHelp,
    Download,
    ImagePlus,
    Link2,
    LoaderCircle,
    Menu,
    Megaphone,
    MonitorPlay,
    Plus,
    Save,
    Settings2,
    ShieldCheck,
    Sparkles,
    Store,
    Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultCampaign, createNewCampaign } from "./defaultCampaign.js";
import { readOfflineCampaignSnapshot, registerOfflineSupport, savePublishedCampaignOffline } from "../offlineCampaign.js";
import "../index.css";
import "./admin.css";

const api = async (path, options = {}) => {
    const response = await fetch(path, {
        method: options.method || "GET",
        headers: options.body instanceof ArrayBuffer ? { "Content-Type": "application/octet-stream" } : options.body ? { "Content-Type": "application/json" } : undefined,
        body: options.body instanceof ArrayBuffer ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "管理データを読み込めませんでした");
    return body;
};

const formatDate = (value) => {
    if (!value) return "未公開";
    return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
};

const SAMPLE_CAMPAIGNS = [
    { id: "leather-tote", name: "KASANE｜革の表情を見つける", advertiser: "KASANE LEATHER", fileName: "leather-tote.json", label: "バッグ版", accent: "#b98a62" },
    { id: "soft-serve", name: "まちかどソフト｜ミルクソフト", advertiser: "まちかどソフト", fileName: "soft-serve.json", label: "ソフトクリーム版", accent: "#74a878" },
    { id: "counter-burger", name: "まちかどバーガー｜できたてバーガー", advertiser: "まちかどバーガー", fileName: "counter-burger.json", label: "バーガー版", accent: "#d78342" },
];

function ImageField({ label, src, onUpload, note, wide = false }) {
    return (
        <div className={`asset-field${wide ? " asset-field-wide" : ""}`}>
            <div className="asset-field-heading">
                <div>
                    <Label>{label}</Label>
                    {note && <p className="field-note">{note}</p>}
                </div>
                <label className="asset-upload-button" aria-label={`${label}を選ぶ`}>
                    <Upload size={15} />
                    <span>画像を選ぶ</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onUpload(event.target.files?.[0])} />
                </label>
            </div>
            <div className={`asset-preview${src ? " has-image" : ""}`}>
                {src ? <img src={src} alt="登録済み画像" /> : <div className="asset-empty"><ImagePlus size={22} /><span>PNG・JPEG・WebP / 16MBまで</span></div>}
            </div>
        </div>
    );
}

export default function AdminApp() {
    const [campaign, setCampaign] = useState(createDefaultCampaign);
    const [campaigns, setCampaigns] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [selectedStage, setSelectedStage] = useState(0);
    const [section, setSection] = useState("素材とコピー");
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [notice, setNotice] = useState({ type: "info", text: "読み込み中" });
    const [qrPreview, setQrPreview] = useState("");
    const [previewImage, setPreviewImage] = useState("");
    const [offlineReady, setOfflineReady] = useState(false);
    const [offlineSnapshot, setOfflineSnapshot] = useState(null);

    useEffect(() => {
        let cancelled = false;
        registerOfflineSupport()
            .then(() => readOfflineCampaignSnapshot())
            .then((snapshot) => {
                if (cancelled) return;
                setOfflineReady(true);
                setOfflineSnapshot(snapshot);
            })
            .catch(() => setOfflineReady(false));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        Promise.all([api("/api/campaigns"), api("/api/campaigns/active").catch(() => null)])
            .then(([result, active]) => {
                if (cancelled) return;
                const saved = result.campaigns || [];
                setCampaigns(saved);
                setActiveId(active?.id || result.activeCampaignId || null);
                if (active) {
                    setCampaign(active);
                    setNotice({ type: "success", text: "公開中の広告を読み込みました" });
                } else if (saved[0]) {
                    setCampaign(saved[0]);
                    setNotice({ type: "success", text: "保存済み広告を読み込みました" });
                } else {
                    setNotice({ type: "info", text: "サンプル広告を編集できます。公開するとサイネージへ反映されます" });
                }
            })
            .catch(() => setNotice({ type: "error", text: "バックエンドに接続できません。先にサーバーを起動してください" }));
        return () => { cancelled = true; };
    }, []);

    const stage = campaign.stages[selectedStage];
    const currentPhoto = campaign.photos[stage?.photo ?? 0]?.src || "";
    const photosReady = campaign.photos.every((photo) => Boolean(photo.src));
    const isSavedCampaign = campaigns.some((saved) => saved.id === campaign.id);
    const availableSamples = SAMPLE_CAMPAIGNS.filter((sample) => !campaigns.some((saved) => saved.id === sample.id));

    useEffect(() => {
        setPreviewImage(currentPhoto);
    }, [currentPhoto]);

    useEffect(() => {
        let cancelled = false;
        const target = campaign.reward.qrMode === "image" && campaign.reward.qrImage
            ? campaign.reward.qrImage
            : campaign.reward.qrUrl || `${window.location.origin}/view/coupon.html?campaign=${encodeURIComponent(campaign.id)}&detail=grill`;
        if (campaign.reward.qrMode === "image" && campaign.reward.qrImage) {
            setQrPreview(target);
            return undefined;
        }
        QRCode.toDataURL(target, { width: 180, margin: 2, errorCorrectionLevel: "Q", color: { dark: "#18211d", light: "#ffffff" } })
            .then((value) => { if (!cancelled) setQrPreview(value); })
            .catch(() => { if (!cancelled) setQrPreview(""); });
        return () => { cancelled = true; };
    }, [campaign.id, campaign.reward.qrMode, campaign.reward.qrUrl, campaign.reward.qrImage]);

    const updateCampaign = (key, value) => {
        setCampaign((current) => ({ ...current, [key]: value }));
        setDirty(true);
    };

    const updateStage = (key, value) => {
        setCampaign((current) => ({
            ...current,
            stages: current.stages.map((item, index) => index === selectedStage ? { ...item, [key]: value } : item),
        }));
        setDirty(true);
    };

    const updateReward = (key, value) => {
        setCampaign((current) => ({ ...current, reward: { ...current.reward, [key]: value } }));
        setDirty(true);
    };

    const handleUpload = async (file, kind, index = 0) => {
        if (!file) return;
        if (file.size > 16 * 1024 * 1024) {
            setNotice({ type: "error", text: "画像は16MB以下にしてください" });
            return;
        }
        setBusy(true);
        setNotice({ type: "info", text: "画像を登録しています" });
        try {
            const result = await api(`/api/campaigns/${campaign.id}/assets?kind=${kind}&index=${index}`, {
                method: "POST",
                body: await file.arrayBuffer(),
            });
            const url = result.url;
            if (kind === "photo") {
                setCampaign((current) => ({
                    ...current,
                    photos: current.photos.map((photo, photoIndex) => photoIndex === index ? { ...photo, src: url, alt: file.name.replace(/\.[^.]+$/, "") } : photo),
                }));
            } else if (kind === "headline" || kind === "support") {
                const key = kind === "headline" ? "headlineImage" : "supportImage";
                const modeKey = kind === "headline" ? "headlineMode" : "supportMode";
                setCampaign((current) => ({ ...current, stages: current.stages.map((item, stageIndex) => stageIndex === index ? { ...item, [key]: url, [modeKey]: "image" } : item) }));
            } else if (kind === "brand") {
                setCampaign((current) => ({ ...current, itemNameImage: url }));
            } else if (kind === "qr") {
                setCampaign((current) => ({ ...current, reward: { ...current.reward, qrImage: url, qrMode: "image" } }));
            }
            setDirty(true);
            setNotice({ type: "success", text: `${file.name}を登録しました。保存して公開すると反映されます` });
        } catch (error) {
            setNotice({ type: "error", text: error.message });
        } finally {
            setBusy(false);
        }
    };

    const saveCampaign = async () => {
        setBusy(true);
        setNotice({ type: "info", text: "広告を保存しています" });
        try {
            const saved = await api(isSavedCampaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns", {
                method: isSavedCampaign ? "PUT" : "POST",
                body: { ...campaign, active: true },
            });
            setCampaign(saved);
            setCampaigns((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setActiveId(saved.id);
            setDirty(false);
            setNotice({ type: "success", text: "保存して公開しました。サイネージに反映されます" });
        } catch (error) {
            setNotice({ type: "error", text: error.message });
        } finally {
            setBusy(false);
        }
    };

    const saveOfflineCampaign = async () => {
        if (dirty || activeId !== campaign.id) {
            setNotice({ type: "error", text: "オフライン保存できるのは、保存して公開した広告です" });
            return;
        }

        setBusy(true);
        setNotice({ type: "info", text: "公開中の広告と画像をこの端末へ保存しています" });
        try {
            const published = await api("/api/campaigns/active");
            if (published.id !== campaign.id) throw new Error("公開中の広告が切り替わりました。画面を更新してください");
            const result = await savePublishedCampaignOffline(published);
            const snapshot = await readOfflineCampaignSnapshot();
            setOfflineSnapshot(snapshot);
            setNotice({ type: "success", text: `広告と画像${result.assetCount}点をこの端末に保存しました。ネットが切れてもサイネージに表示できます` });
        } catch (error) {
            setNotice({ type: "error", text: error.message });
        } finally {
            setBusy(false);
        }
    };

    const createCampaign = () => {
        setCampaign(createNewCampaign());
        setSelectedStage(0);
        setDirty(true);
        setNotice({ type: "info", text: "新しい広告の下書きを作りました。写真とコピーを入稿してください" });
    };

    const openSampleCampaign = async (fileName, label) => {
        if (dirty && !window.confirm(`保存していない変更があります。${label}へ切り替えますか？`)) return;
        setBusy(true);
        try {
            const response = await fetch(`./campaigns/${fileName}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`${label}のサンプルを読み込めませんでした`);
            const sample = await response.json();
            setCampaign(sample);
            setSelectedStage(0);
            setSection("素材とコピー");
            setDirty(true);
            setNotice({ type: "info", text: `${label}のサンプルを開きました。保存して公開するとサイネージに反映されます` });
        } catch (error) {
            setNotice({ type: "error", text: error.message });
        } finally {
            setBusy(false);
        }
    };

    const selectCampaign = async (item) => {
        if (dirty && !window.confirm("保存していない変更があります。別の広告へ切り替えますか？")) return;
        setCampaign(item);
        setSelectedStage(0);
        setDirty(false);
        if (activeId !== item.id) {
            try {
                await api("/api/campaigns/active", { method: "POST", body: { campaignId: item.id } });
                setActiveId(item.id);
                setNotice({ type: "success", text: "広告を切り替えました" });
            } catch (error) {
                setNotice({ type: "error", text: error.message });
            }
        }
    };

    const previewCopy = useMemo(() => {
        if (!stage) return "";
        return stage.headlineMode === "image" ? stage.headlineImage : stage.title;
    }, [stage]);

    if (!stage) return <div className="admin-loading"><LoaderCircle className="animate-spin" /> 広告を読み込んでいます</div>;

    return (
        <div className={`admin-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
            <aside className="admin-sidebar" id="campaign-sidebar">
                <a className="admin-brand" href="./index.html" aria-label="Perspective Adsへ戻る">
                    <span className="admin-brand-mark">P.</span>
                    <span><strong>Perspective</strong><small>ADS STUDIO</small></span>
                </a>
                <Button className="sidebar-primary-action" onClick={createCampaign}><Plus size={16} /><span>広告を追加</span></Button>
                <div className="sidebar-list-heading"><span>キャンペーン</span><span className="sidebar-count">{campaigns.length}</span></div>
                <div className="campaign-list">
                    {campaigns.map((item) => (
                        <button key={item.id} type="button" className={`campaign-nav-item${campaign.id === item.id ? " is-current" : ""}`} onClick={() => selectCampaign(item)}>
                            <span className="campaign-nav-mark" aria-hidden="true"><Megaphone size={14} /></span>
                            <span className="campaign-nav-copy"><strong>{item.name}</strong><small>{item.advertiser}</small></span>
                            {activeId === item.id && <span className="live-dot" title="公開中" />}
                        </button>
                    ))}
                    {!campaigns.length && <p className="sidebar-empty">公開中の広告はまだありません。</p>}
                    {availableSamples.length > 0 && <div className="campaign-list-section-label">テンプレート</div>}
                    {availableSamples.map((sample) => (
                        <button
                            key={sample.id}
                            type="button"
                            className={`campaign-nav-item campaign-nav-sample${campaign.id === sample.id ? " is-current" : ""}`}
                            onClick={() => openSampleCampaign(sample.fileName, sample.label)}
                        >
                            <span className="campaign-nav-mark is-template" aria-hidden="true"><Store size={14} /></span>
                            <span className="campaign-nav-copy"><strong>{sample.name}</strong><small>{sample.advertiser} · サンプル</small></span>
                        </button>
                    ))}
                </div>
                <div className="sidebar-bottom">
                    <div className="local-note"><ShieldCheck size={16} /><span>この画面はローカル環境で動作します</span></div>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-topbar">
                    <div className="topbar-context">
                        <Button variant="ghost" size="icon" className="sidebar-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"} aria-expanded={!sidebarCollapsed} aria-controls="campaign-sidebar"><Menu size={18} /></Button>
                        <div className="breadcrumbs"><span>広告管理</span><ChevronRight size={14} className="breadcrumb-chevron" /><strong>{campaign.name}</strong></div>
                    </div>
                    <div className="topbar-actions">
                        <Badge variant="outline" className={`save-state ${dirty ? "is-dirty" : ""}`}><span className="save-state-dot" />{dirty ? "未保存の変更" : activeId === campaign.id ? "公開中" : "下書き"}</Badge>
                        <a className="signage-open-button" href="./index.html" target="_blank" rel="noreferrer" aria-label={dirty || activeId !== campaign.id ? "公開中のサイネージを表示" : "サイネージを表示"} title={dirty || activeId !== campaign.id ? "未公開の変更は表示されず、現在公開中の広告が開きます" : "公開中の広告を別タブで開きます"}>
                            <MonitorPlay size={15} />
                            <span>{dirty || activeId !== campaign.id ? "公開中を表示" : "サイネージを表示"}</span>
                        </a>
                        <Button
                            variant="outline"
                            onClick={saveOfflineCampaign}
                            disabled={busy || !offlineReady || dirty || activeId !== campaign.id}
                            className="offline-save-button"
                            title={!offlineReady ? "このブラウザーではオフライン保存を利用できません" : "公開中の広告と写真をこの端末に保存します"}
                        >
                            <Download size={15} />
                            <span>{busy ? "保存中…" : offlineSnapshot?.campaignId === campaign.id && offlineSnapshot?.updatedAt === campaign.updatedAt ? "保存済み" : "端末に保存"}</span>
                        </Button>
                        <Button onClick={saveCampaign} disabled={busy || !photosReady} className="publish-button"><Save size={16} />{busy ? "処理中…" : "保存して公開"}</Button>
                    </div>
                </header>

                <div className="admin-content">
                    <div className="page-heading">
                        <div>
                            <div className="eyebrow-label">広告制作</div>
                            <h1>広告を編集</h1>
                            <p>写真・コピー・特典を設定し、公開前に仕上がりを確認します。</p>
                        </div>
                    </div>

                    {notice.text && <div className={`notice notice-${notice.type}`} role="status"><span className="notice-dot" />{notice.text}</div>}

                    <div className="editor-layout">
                        <div className="editor-column">
                            <Card className="campaign-details-card">
                                <CardHeader className="compact-card-header">
                                    <div><CardTitle>広告の基本情報</CardTitle><CardDescription>キャンペーンの識別情報</CardDescription></div>
                                </CardHeader>
                                <CardContent className="basic-fields">
                                    <div className="field-row campaign-field-row">
                                        <div className="field-group"><Label htmlFor="advertiser">広告主</Label><Input id="advertiser" value={campaign.advertiser} onChange={(event) => updateCampaign("advertiser", event.target.value)} /></div>
                                        <div className="field-group"><Label htmlFor="campaign-name">キャンペーン名</Label><Input id="campaign-name" value={campaign.name} onChange={(event) => updateCampaign("name", event.target.value)} /></div>
                                        <div className="field-group"><Label htmlFor="item-name">商品名</Label><Input id="item-name" value={campaign.itemName} onChange={(event) => updateCampaign("itemName", event.target.value)} /></div>
                                    </div>
                                    {!photosReady && <p className="field-note required-media-note">公開するには、全体・見どころ・詳細の写真を登録してください。</p>}
                                </CardContent>
                            </Card>

                            <Tabs value={section} onValueChange={setSection} className="editor-tabs">
                                <TabsList className="editor-tab-list">
                                    <TabsTrigger value="素材とコピー"><span className="editor-tab-number">01</span>素材・コピー</TabsTrigger>
                                    <TabsTrigger value="特典と抽選"><span className="editor-tab-number">02</span>特典・QR</TabsTrigger>
                                    <TabsTrigger value="デザイン"><span className="editor-tab-number">03</span>配色</TabsTrigger>
                                </TabsList>
                                <TabsContent value="素材とコピー" className="tab-content">
                                    <Card className="scene-studio-card">
                                        <CardHeader className="section-card-heading">
                                            <div><CardTitle>3つの広告場面</CardTitle><CardDescription>正面・横・接近。それぞれの写真とコピーを整えます。</CardDescription></div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="scene-workbench">
                                                <div className="stage-selector" role="tablist" aria-label="編集する場面">
                                                    {campaign.stages.map((item, index) => (
                                                        <button key={index} type="button" role="tab" aria-selected={selectedStage === index} className={selectedStage === index ? "is-active" : ""} onClick={() => setSelectedStage(index)}>
                                                            <span className="stage-thumbnail">
                                                                {campaign.photos[item.photo]?.src ? <img src={campaign.photos[item.photo].src} alt="" /> : <ImagePlus size={19} />}
                                                                <span className="stage-number">0{index + 1}</span>
                                                            </span>
                                                            <span className="stage-option-copy"><strong>{item.label}</strong><small>{index === 0 ? "正面" : index === 1 ? "少し横へ" : "近づいて見る"}</small></span>
                                                            {selectedStage === index && <span className="stage-editing">編集中</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                                <section className="scene-editor" aria-label={`${stage.label}の編集`}>
                                                    <div className="scene-editor-heading"><div><span className="scene-index">場面 0{selectedStage + 1}</span><h3>{stage.label}</h3></div><span className="scene-trigger-label">{selectedStage === 0 ? "正面" : selectedStage === 1 ? "左右の移動" : "前への移動"}</span></div>
                                                    <div className="scene-editor-body">
                                                        <div className="scene-media-column">
                                                            <ImageField label="商品写真" src={campaign.photos[stage.photo]?.src} note="PNG・JPEG・WebP / 最大16MB" onUpload={(file) => handleUpload(file, "photo", stage.photo)} />
                                                            <div className="photo-alt-field field-group"><Label htmlFor="photo-alt">写真の説明</Label><Input id="photo-alt" value={campaign.photos[stage.photo]?.alt || ""} onChange={(event) => updateCampaign("photos", campaign.photos.map((photo, index) => index === stage.photo ? { ...photo, alt: event.target.value } : photo))} /></div>
                                                        </div>
                                                        <div className="scene-copy-panel">
                                                            <div className="copy-editor-heading"><div><span className="scene-index">コピー</span><p className="field-note">文章入力か、文字組み済み画像を選べます。</p></div></div>
                                                            <div className="copy-fields">
                                                                <div className="copy-mode-row"><div><Label>見出し</Label><p className="field-note">{stage.headlineMode === "image" ? "画像で表示" : "テキストで表示"}</p></div><Switch checked={stage.headlineMode === "image"} onCheckedChange={(checked) => updateStage("headlineMode", checked ? "image" : "text")} aria-label="見出しを画像で表示" /></div>
                                                                {stage.headlineMode === "image" ? <ImageField label="見出し画像" src={stage.headlineImage} onUpload={(file) => handleUpload(file, "headline", selectedStage)} /> : <div className="field-group"><Label htmlFor="stage-title">見出し</Label><Textarea id="stage-title" rows={3} value={stage.title} onChange={(event) => updateStage("title", event.target.value)} placeholder="例：焼き目の先に、やわらかな赤身。" /></div>}
                                                                <div className="copy-mode-row"><div><Label>補足文と行動案内</Label><p className="field-note">{stage.supportMode === "image" ? "画像で表示" : "テキストで表示"}</p></div><Switch checked={stage.supportMode === "image"} onCheckedChange={(checked) => updateStage("supportMode", checked ? "image" : "text")} aria-label="補足文を画像で表示" /></div>
                                                                {stage.supportMode === "image" ? <ImageField label="補足・行動案内の画像" src={stage.supportImage} onUpload={(file) => handleUpload(file, "support", selectedStage)} /> : <><div className="field-group"><Label htmlFor="stage-description">補足文</Label><Textarea id="stage-description" rows={2} value={stage.description} onChange={(event) => updateStage("description", event.target.value)} placeholder="商品について伝えたいこと" /></div><div className="field-group"><Label htmlFor="stage-instruction">動きの案内</Label><Input id="stage-instruction" value={stage.instruction} onChange={(event) => updateStage("instruction", event.target.value)} placeholder="少し左へ動いて、焼き目を探す。" /></div></>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="field-row stage-meta-fields">
                                                        <div className="field-group"><Label htmlFor="stage-label">場面名</Label><Input id="stage-label" value={stage.label} onChange={(event) => updateStage("label", event.target.value)} /></div>
                                                        <div className="field-group"><Label>この場面の写真</Label><Select value={String(stage.photo)} onValueChange={(value) => updateStage("photo", Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{campaign.photos.map((photo, index) => <SelectItem key={index} value={String(index)}>{"写真 " + (index + 1) + (photo.alt ? " · " + photo.alt : "")}</SelectItem>)}</SelectContent></Select></div>
                                                    </div>
                                                </section>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className="brand-mark-card">
                                        <CardHeader className="section-card-heading"><div><CardTitle>商品名のロゴ画像</CardTitle><CardDescription>文字のロゴがある場合に登録します。未登録なら商品名を文字で表示します。</CardDescription></div></CardHeader>
                                        <CardContent><ImageField label="ロゴ画像" src={campaign.itemNameImage} onUpload={(file) => handleUpload(file, "brand")} /></CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="特典と抽選" className="tab-content">
                                    <Card>
                                        <CardHeader className="section-card-heading"><div><CardTitle>特典の見せ方</CardTitle><CardDescription>見どころを発見したあと、設定確率で特典QRを表示します。</CardDescription></div><div className="card-icon warm"><Sparkles size={17} /></div></CardHeader>
                                        <CardContent className="reward-fields">
                                            <div className="field-row"><div className="field-group"><Label htmlFor="reward-title">特典名</Label><Input id="reward-title" value={campaign.reward.title} onChange={(event) => updateReward("title", event.target.value)} /></div><div className="field-group"><Label htmlFor="reward-value">特典内容</Label><Input id="reward-value" value={campaign.reward.value} onChange={(event) => updateReward("value", event.target.value)} /></div></div>
                                            <div className="field-group"><Label htmlFor="reward-note">QRの案内文</Label><Input id="reward-note" value={campaign.reward.note} onChange={(event) => updateReward("note", event.target.value)} /></div>
                                            <div className="probability-panel">
                                                <div className="probability-heading"><div><Label>1回ごとの特典表示確率</Label><p>見どころを見つけたあとに抽選します。確率は試行ごとの値です。</p></div><strong>{campaign.reward.chancePercent}%</strong></div>
                                                <Slider min={0} max={100} step={1} value={[Number(campaign.reward.chancePercent)]} onValueChange={([value]) => updateReward("chancePercent", value)} aria-label="特典表示確率" />
                                                <div className="slider-scale"><span>表示しない</span><span>毎回表示</span></div>
                                            </div>
                                            <div className="qr-mode-toggle">
                                                <button type="button" className={campaign.reward.qrMode === "url" ? "is-active" : ""} onClick={() => updateReward("qrMode", "url")}><Link2 size={16} /><span><strong>URLから生成</strong><small>入力したURLをQRにします</small></span></button>
                                                <button type="button" className={campaign.reward.qrMode === "image" ? "is-active" : ""} onClick={() => updateReward("qrMode", "image")}><ImagePlus size={16} /><span><strong>QR画像を登録</strong><small>入稿済みのQR画像を使います</small></span></button>
                                            </div>
                                            {campaign.reward.qrMode === "url" ? <div className="field-group"><Label htmlFor="qr-url">QRのリンク先URL</Label><Input id="qr-url" type="url" value={campaign.reward.qrUrl} onChange={(event) => updateReward("qrUrl", event.target.value)} placeholder="未入力なら、この広告の特典ページを開きます" /><p className="field-note">空欄ではこの広告の受取ページへつながるQRを自動生成します。</p></div> : <ImageField label="QRコード画像" src={campaign.reward.qrImage} note="リンク先を確認したQR画像を登録してください。" onUpload={(file) => handleUpload(file, "qr")} />}
                                            <div className="qr-preview-row"><div className="qr-preview-box">{qrPreview ? <img src={qrPreview} alt="QRコードのプレビュー" /> : <div className="asset-empty"><CircleHelp size={20} /><span>QRプレビュー</span></div>}</div><div><strong>読み取りプレビュー</strong><p>公開前に、スマートフォンでリンク先とQRの読み取りを確認してください。</p></div></div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="デザイン" className="tab-content">
                                    <Card>
                                        <CardHeader className="section-card-heading"><div><CardTitle>広告のテーマカラー</CardTitle><CardDescription>広告主に合わせて、背景・アクセント・文字色を調整します。</CardDescription></div><div className="card-icon"><Settings2 size={17} /></div></CardHeader>
                                        <CardContent className="theme-fields">
                                            {[{ key: "background", label: "背景色", help: "写真とコピーの背景" }, { key: "accent", label: "アクセント色", help: "商品名・見どころの強調" }, { key: "text", label: "文字色", help: "見出しと補足文" }].map((item) => (
                                                <div className="theme-color-row" key={item.key}><div className="color-swatch" style={{ background: campaign.theme[item.key] }}><input type="color" value={campaign.theme[item.key]} onChange={(event) => updateCampaign("theme", { ...campaign.theme, [item.key]: event.target.value })} aria-label={item.label} /></div><div className="theme-color-copy"><Label>{item.label}</Label><span>{item.help}</span></div><Input value={campaign.theme[item.key]} onChange={(event) => updateCampaign("theme", { ...campaign.theme, [item.key]: event.target.value })} className="color-code-input" /></div>
                                            ))}
                                            <div className="theme-note"><CircleHelp size={15} /><span>画像内の色は変わりません。入稿画像の色調もテーマに合わせてください。</span></div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </div>

                        <aside className="preview-column">
                            <div className="preview-heading"><div><span>出力プレビュー</span><strong>縦型サイネージ</strong></div><span className="preview-ratio">9:16</span></div>
                            <div className="signage-frame" style={{ background: campaign.theme.background }}>
                                <div className="signage-photo" style={{ backgroundImage: previewImage ? `url("${previewImage}")` : "none" }}>
                                    {!previewImage && <div className="signage-placeholder"><ImagePlus size={27} /><span>写真を登録</span></div>}
                                    <span className="signage-brand">{campaign.advertiser}</span>
                                </div>
                                <div className="signage-copy" style={{ color: campaign.theme.text, "--signage-background": campaign.theme.background }}>
                                    {campaign.itemNameImage ? <img className="signage-item-logo" src={campaign.itemNameImage} alt={campaign.itemName} /> : <span className="signage-item-name" style={{ color: campaign.theme.accent }}>{campaign.itemName}</span>}
                                    {stage.headlineMode === "image" && stage.headlineImage ? <img className="signage-headline-image" src={stage.headlineImage} alt={stage.title} /> : <strong className="signage-headline">{previewCopy || "見出しを入力"}</strong>}
                                    {stage.supportMode === "image" && stage.supportImage ? <img className="signage-support-image" src={stage.supportImage} alt={`${stage.description} ${stage.instruction}`} /> : <p className="signage-support">{stage.description || "商品について伝えるコピー"}<br /><span style={{ color: campaign.theme.accent }}>{stage.instruction || "動きの案内を入力"}</span></p>}
                                </div>
                            </div>
                            <div className="preview-caption"><span className="preview-caption-mark" />選択中の場面をプレビューしています</div>
                            <Card className="publish-summary"><CardContent><div className="summary-top"><div className="summary-icon"><Megaphone size={16} /></div><div><span>公開先</span><strong>Perspective Ads / サイネージ</strong></div></div><Separator /><div className="summary-status"><span>最終保存</span><strong>{formatDate(campaign.updatedAt)}</strong></div><a href="./index.html" target="_blank" rel="noreferrer">広告画面を開く <ArrowUpRight size={14} /></a></CardContent></Card>
                            <div className="help-footer"><CircleHelp size={15} /><span>登録した素材は広告ごとに保存されます。PNG・JPEG・WebPに対応。</span></div>
                        </aside>
                    </div>

                    <footer className="admin-footer"><span>Perspective Ads Studio</span><span>すべての変更は保存して公開すると反映されます。</span></footer>
                </div>
            </main>
        </div>
    );
}

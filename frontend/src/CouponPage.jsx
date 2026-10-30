import { useEffect, useState } from "react";
import heroPhoto from "../assets/steak-photo-hero.png";
import { requestCouponApi } from "./couponApi.js";
import { getCouponDetail } from "./couponUrl.js";
import { STEAK_AD } from "./steakAd.js";

const createSessionId = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getOrCreateSessionId = (key) => {
    try {
        const storedId = window.sessionStorage.getItem(key);
        if (storedId) return storedId;
        const newId = createSessionId();
        window.sessionStorage.setItem(key, newId);
        return newId;
    } catch {
        return createSessionId();
    }
};

const getSessionId = (key) => {
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const removeSessionId = (key) => {
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // 保存領域が使えない場合も画面を受取可能な状態へ戻す。
    }
};

export default function CouponPage() {
    const query = window.location.search;
    const campaignId = new URLSearchParams(query).get("campaign");
    const detailId = getCouponDetail(query);
    const [campaign, setCampaign] = useState(campaignId === STEAK_AD.id ? STEAK_AD : null);
    const [campaignLoaded, setCampaignLoaded] = useState(false);
    const [status, setStatus] = useState("checking");
    const [coupon, setCoupon] = useState(null);
    const [message, setMessage] = useState("");
    const isKnownCampaign = Boolean(campaign && campaign.id === campaignId);
    const detailStage = detailId === "grill"
        ? campaign?.stages?.[1]
        : detailId === "cut"
            ? campaign?.stages?.[2]
            : null;
    const detailPhoto = detailStage ? campaign?.photos?.[detailStage.photo] : null;
    const claimStorageKey = `perspective-ads-${campaignId}-claim`;
    const visitStorageKey = `perspective-ads-${campaignId}-visit`;

    useEffect(() => {
        if (!campaignId) {
            setCampaign(null);
            setCampaignLoaded(true);
            setStatus("invalid");
            return undefined;
        }
        let cancelled = false;
        requestCouponApi(`/api/campaigns/${encodeURIComponent(campaignId)}`)
            .then((savedCampaign) => {
                if (cancelled) return;
                setCampaign(savedCampaign);
                setCampaignLoaded(true);
                setStatus("checking");
            })
            .catch(() => {
                if (cancelled) return;
                if (campaignId === STEAK_AD.id) setCampaign(STEAK_AD);
                else setCampaign(null);
                setCampaignLoaded(true);
                setStatus(campaignId === STEAK_AD.id ? "checking" : "invalid");
            });
        return () => { cancelled = true; };
    }, [campaignId]);

    useEffect(() => {
        if (!campaignLoaded || !isKnownCampaign) return undefined;
        let cancelled = false;

        const loadCoupon = async () => {
            const visitId = getOrCreateSessionId(visitStorageKey);
            requestCouponApi("/api/coupons/visits", {
                method: "POST",
                body: { campaignId, visitId },
            }).catch(() => {});

            const claimId = getSessionId(claimStorageKey);
            if (!claimId) {
                if (!cancelled) setStatus("ready");
                return;
            }

            try {
                const existingCoupon = await requestCouponApi(`/api/coupons/claim/${claimId}`);
                if (!cancelled) {
                    setCoupon(existingCoupon);
                    setStatus(existingCoupon.status);
                }
            } catch {
                if (!cancelled) {
                    removeSessionId(claimStorageKey);
                    setStatus("ready");
                }
            }
        };

        loadCoupon();
        return () => {
            cancelled = true;
        };
    }, [campaignId, campaignLoaded, claimStorageKey, isKnownCampaign, visitStorageKey]);

    const claimCoupon = async () => {
        const claimId = getOrCreateSessionId(claimStorageKey);
        setStatus("claiming");
        setMessage("");
        try {
            const issuedCoupon = await requestCouponApi("/api/coupons/claim", {
                method: "POST",
                body: { campaignId, claimId },
            });
            setCoupon(issuedCoupon);
            setStatus(issuedCoupon.status);
        } catch (error) {
            setMessage(error.message || "特典を受け取れませんでした");
            setStatus("error");
        }
    };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(coupon.code);
            setMessage("コードをコピーしました");
        } catch {
            setMessage("コードを長押ししてコピーしてください");
        }
    };

    if (!campaignLoaded) {
        return <main className="coupon-page"><p className="coupon-state">広告情報を読み込んでいます</p></main>;
    }

    if (campaignLoaded && !isKnownCampaign) {
        return (
            <main className="coupon-page">
                <header className="coupon-header">
                    <span className="coupon-brand-mark">CH</span>
                    <span className="coupon-brand-name">CHAR STEAKHOUSE</span>
                </header>
                <section className="coupon-error">
                    <h1>特典を開けません</h1>
                    <p>サイネージに表示されたQRコードから、もう一度開いてください。</p>
                </section>
            </main>
        );
    }

    return (
        <main className="coupon-page">
            <header className="coupon-header">
                <span className="coupon-brand-mark">{campaign.advertiser.slice(0, 2)}</span>
                <span className="coupon-brand-name">{campaign.advertiser}</span>
                <span className="coupon-label">デモ特典</span>
            </header>

            <article className="coupon-content">
                <img className="coupon-photo" src={detailPhoto?.src ?? heroPhoto} alt={detailPhoto?.alt ?? "炭火焼きステーキのコンセプト写真"} />
                {detailStage && (
                    <section className="coupon-discovery" aria-label="広告で見つけた見どころ">
                        <p className="coupon-eyebrow">広告で見つけた見どころ / {detailStage.eyebrow}</p>
                        <h2>{detailStage.title.replace("\n", " ")}</h2>
                        <p>{detailStage.description}</p>
                    </section>
                )}
                <section className="coupon-offer" aria-live="polite">
                    <p className="coupon-eyebrow">広告の奥にあった特典</p>
                    <h1>{campaign.reward.title || campaign.itemName}</h1>
                    <p className="coupon-discount">{campaign.reward.value}</p>

                    {status === "checking" && <p className="coupon-state">受け取り状況を確認しています</p>}
                    {status === "ready" && (
                        <div className="coupon-action">
                            <p>ボタンを押すと、このブラウザー用の一回限りのデモコードを発行します。</p>
                            <button className="coupon-copy-button" type="button" onClick={claimCoupon}>デモ特典を受け取る</button>
                        </div>
                    )}
                    {status === "claiming" && <p className="coupon-state">特典を発行しています</p>}
                    {status === "issued" && coupon && (
                        <section className="coupon-issued" aria-label="受け取り済み特典">
                            <p className="coupon-state is-success">特典を受け取りました</p>
                            <p className="coupon-code-label">一回限りのデモコード</p>
                            <strong className="coupon-code">{coupon.code}</strong>
                            <button className="coupon-copy-button" type="button" onClick={copyCode}>コードをコピー</button>
                            <p className="coupon-how-to-use">店側の確認画面でこのコードを入力すると、利用済みにできます。</p>
                        </section>
                    )}
                    {status === "redeemed" && coupon && (
                        <section className="coupon-issued" aria-label="利用済み特典">
                            <p className="coupon-state is-used">この特典は利用済みです</p>
                            <p className="coupon-code-label">利用確認済みのデモコード</p>
                            <strong className="coupon-code">{coupon.code}</strong>
                        </section>
                    )}
                    {status === "error" && (
                        <div className="coupon-action">
                            <p className="coupon-error-message" role="alert">{message}</p>
                            <button className="coupon-copy-button" type="button" onClick={claimCoupon}>もう一度試す</button>
                        </div>
                    )}
                    {message && status !== "error" && <p className="coupon-copy-status" aria-live="polite">{message}</p>}
                    <p className="coupon-disclaimer">受取と利用確認を試すためのデモです。実店舗の割引、注文、決済には使えません。</p>
                </section>
            </article>

            <footer className="coupon-footer">
                <span>PERSPECTIVE ADS / CONCEPT DEMO</span>
                <a href="./redeem.html">店側の利用確認画面</a>
            </footer>
        </main>
    );
}

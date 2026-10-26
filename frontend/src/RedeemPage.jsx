import { useCallback, useEffect, useState } from "react";
import { requestCouponApi } from "./couponApi.js";

export default function RedeemPage() {
    const [code, setCode] = useState("");
    const [status, setStatus] = useState("ready");
    const [message, setMessage] = useState("");
    const [stats, setStats] = useState(null);

    const refreshStats = useCallback(async () => {
        try {
            setStats(await requestCouponApi("/api/coupons/stats"));
        } catch {
            setStats(null);
        }
    }, []);

    useEffect(() => {
        refreshStats();
    }, [refreshStats]);

    const submitCode = async (event) => {
        event.preventDefault();
        if (!code.trim()) {
            setMessage("スマートフォンに表示されたコードを入力してください");
            setStatus("error");
            return;
        }

        setStatus("checking");
        setMessage("");
        try {
            const result = await requestCouponApi("/api/coupons/redeem", {
                method: "POST",
                body: { code },
            });
            setMessage(`${result.code} の利用確認を記録しました`);
            setCode("");
            setStatus("success");
        } catch (error) {
            setMessage(error.message || "利用を確認できませんでした");
            setStatus("error");
        }
        refreshStats();
    };

    return (
        <main className="coupon-page redeem-page">
            <header className="coupon-header">
                <span className="coupon-brand-mark">CH</span>
                <span className="coupon-brand-name">CHAR STEAKHOUSE</span>
                <span className="coupon-label">店側デモ</span>
            </header>

            <section className="redeem-content">
                <p className="coupon-eyebrow">PERSPECTIVE ADS / 利用確認</p>
                <h1>特典コードを確認</h1>
                <p className="redeem-description">お客さまのスマートフォンに表示された一回限りのコードを入力してください。</p>

                <form className="redeem-form" onSubmit={submitCode}>
                    <label htmlFor="redeem-code">デモコード</label>
                    <input
                        id="redeem-code"
                        autoComplete="off"
                        autoCapitalize="characters"
                        maxLength="13"
                        placeholder="CHAR-XXXXXXXX"
                        value={code}
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                        disabled={status === "checking"}
                    />
                    <button className="coupon-copy-button" type="submit" disabled={status === "checking"}>
                        {status === "checking" ? "確認しています" : "利用済みにする"}
                    </button>
                </form>

                {message && (
                    <p className={status === "success" ? "redeem-message is-success" : "redeem-message is-error"} role="status">
                        {message}
                    </p>
                )}

                <section className="redeem-stats" aria-label="デモの進行状況">
                    <h2>今回のデモ状況</h2>
                    {stats ? (
                        <dl>
                            <div><dt>QRページ表示</dt><dd>{stats.visits}</dd></div>
                            <div><dt>特典の受取</dt><dd>{stats.issued}</dd></div>
                            <div><dt>利用確認</dt><dd>{stats.redeemed}</dd></div>
                        </dl>
                    ) : <p>集計を読み込めません</p>}
                </section>

                <p className="coupon-disclaimer">この画面は体験確認用です。実際の店舗の割引、注文、決済は行いません。</p>
            </section>

            <footer className="coupon-footer">
                <span>デモではコード入力で利用確認を記録します</span>
                <a href="./coupon.html?campaign=steak">お客さま向け画面へ</a>
            </footer>
        </main>
    );
}

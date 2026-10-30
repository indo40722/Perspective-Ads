import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, LogOut, Megaphone } from "lucide-react";
import AdminApp from "./AdminApp.jsx";
import {
    createOrganization,
    forgetOrganization,
    getActiveOrganization,
    listUserOrganizations,
    rememberOrganization,
    supabase,
    supabaseConfigured,
} from "../lib/supabase.js";
import "./cloud-auth.css";

const pendingOrganizationKey = "perspective-ads-pending-organization";

function AuthForm({ onComplete }) {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [organizationName, setOrganizationName] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
            if (mode === "signup") {
                if (!organizationName.trim()) throw new Error("会社名を入力してください");
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: window.location.origin + window.location.pathname },
                });
                if (signUpError) throw signUpError;
                try {
                    window.sessionStorage.setItem(pendingOrganizationKey, organizationName.trim());
                } catch {
                    // メール確認後に会社名を引き継げない場合は、ログイン後に入力してもらう。
                }
                if (data.session) {
                    const { error: organizationError } = await createOrganization(organizationName.trim());
                    if (organizationError) throw organizationError;
                    onComplete(data.session);
                } else {
                    setMessage("確認メールを送りました。メール内のリンクを開いて登録を続けてください。");
                }
            } else {
                const { data, error: signInError } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                });
                if (signInError) throw signInError;
                onComplete(data.session);
            }
        } catch (cause) {
            setError(cause.message || "認証に失敗しました。入力内容を確認してください");
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="cloud-auth-page">
            <section className="cloud-auth-panel" aria-labelledby="cloud-auth-title">
                <div className="cloud-auth-brand"><span className="cloud-auth-mark">P.</span><span>Perspective Ads</span></div>
                <p className="cloud-auth-eyebrow">広告管理</p>
                <h1 id="cloud-auth-title">{mode === "signin" ? "会社アカウントでログイン" : "会社アカウントを作成"}</h1>
                <p className="cloud-auth-description">会社ごとの広告を保存し、サイネージ端末へ共有します。</p>
                <form className="cloud-auth-form" onSubmit={submit}>
                    {mode === "signup" && (
                        <label>
                            会社名
                            <input autoComplete="organization" maxLength={120} required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                        </label>
                    )}
                    <label>
                        メールアドレス
                        <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    <label>
                        パスワード
                        <input autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
                    </label>
                    {error && <p className="cloud-auth-error" role="alert">{error}</p>}
                    {message && <p className="cloud-auth-message" role="status">{message}</p>}
                    <button className="cloud-auth-submit" type="submit" disabled={busy}>
                        {busy ? <LoaderCircle size={17} className="cloud-auth-spinner" /> : null}
                        {busy ? "処理しています" : mode === "signin" ? "ログイン" : "会社アカウントを作成"}
                    </button>
                </form>
                <button className="cloud-auth-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
                    {mode === "signin" ? "会社アカウントを新規作成" : "すでに登録済みの方はログイン"}
                </button>
                <p className="cloud-auth-footnote">広告素材の閲覧・編集は、ログイン中の会社メンバーに限定されます。</p>
            </section>
        </main>
    );
}

function OrganizationSetup({ onCreated }) {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const { data, error: createError } = await createOrganization(name.trim());
            if (createError) throw createError;
            if (data?.id) rememberOrganization(data.id);
            await onCreated();
        } catch (cause) {
            setError(cause.message || "会社を登録できませんでした");
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="cloud-auth-page">
            <section className="cloud-auth-panel" aria-labelledby="organization-setup-title">
                <div className="cloud-auth-brand"><span className="cloud-auth-mark">P.</span><span>Perspective Ads</span></div>
                <p className="cloud-auth-eyebrow">はじめに</p>
                <h1 id="organization-setup-title">会社を登録</h1>
                <p className="cloud-auth-description">会社の広告とメンバーをまとめる管理領域を作成します。</p>
                <form className="cloud-auth-form" onSubmit={submit}>
                    <label>会社名<input autoComplete="organization" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>
                    {error && <p className="cloud-auth-error" role="alert">{error}</p>}
                    <button className="cloud-auth-submit" type="submit" disabled={busy}>{busy ? "登録しています" : "会社を登録"}</button>
                </form>
            </section>
        </main>
    );
}

export default function AdminCloudRoot() {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [organizations, setOrganizations] = useState([]);
    const [organizationId, setOrganizationId] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!supabaseConfigured) {
            setLoading(false);
            return undefined;
        }
        let alive = true;
        supabase.auth.getSession()
            .then(({ data, error: sessionError }) => {
                if (!alive) return;
                if (sessionError) setError(sessionError.message);
                setSession(data?.session || null);
                setLoading(false);
            })
            .catch((cause) => {
                if (!alive) return;
                setError(cause.message || "ログイン状態を確認できませんでした");
                setLoading(false);
            });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
        });
        return () => {
            alive = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!session) {
            setOrganizations([]);
            setOrganizationId("");
            return undefined;
        }
        listUserOrganizations()
            .then(async (items) => {
                if (cancelled) return;
                if (!items.length) {
                    let pendingName = "";
                    try {
                        pendingName = window.sessionStorage.getItem(pendingOrganizationKey) || "";
                    } catch {
                        pendingName = "";
                    }
                    if (pendingName) {
                        const { error: createError } = await createOrganization(pendingName);
                        if (createError) throw createError;
                        try { window.sessionStorage.removeItem(pendingOrganizationKey); } catch { /* 登録状態はDBに保存済み。 */ }
                        items = await listUserOrganizations();
                    }
                }
                if (cancelled) return;
                setOrganizations(items);
                const active = await getActiveOrganization();
                setOrganizationId(active?.id || "");
                setError("");
            })
            .catch((cause) => {
                if (!cancelled) setError(cause.message || "会社情報を読み込めませんでした");
            });
        return () => { cancelled = true; };
    }, [session?.user?.id]);

    const selectedOrganization = useMemo(
        () => organizations.find((organization) => organization.id === organizationId) || null,
        [organizations, organizationId],
    );

    if (!supabaseConfigured && import.meta.env.PROD) {
        return <main className="cloud-auth-page"><section className="cloud-auth-panel"><p className="cloud-auth-eyebrow">環境設定</p><h1>管理画面を準備中です</h1><p className="cloud-auth-description">SupabaseのURLと公開キーが登録されていません。管理者がVercelの環境変数を設定してください。</p></section></main>;
    }
    if (!supabaseConfigured) return <AdminApp />;
    if (loading) return <main className="cloud-auth-page"><p className="cloud-auth-loading"><LoaderCircle className="cloud-auth-spinner" /> 接続を確認しています</p></main>;
    if (!session) return <AuthForm onComplete={setSession} />;
    if (error) return <main className="cloud-auth-page"><section className="cloud-auth-panel"><h1>会社情報を読み込めません</h1><p className="cloud-auth-error" role="alert">{error}</p><button className="cloud-auth-switch" type="button" onClick={() => void supabase.auth.signOut()}>ログアウトして戻る</button></section></main>;
    if (!organizations.length) return <OrganizationSetup onCreated={async () => {
        const nextOrganizations = await listUserOrganizations();
        setOrganizations(nextOrganizations);
        const active = await getActiveOrganization();
        setOrganizationId(active?.id || "");
    }} />;

    const changeOrganization = (event) => {
        const nextId = event.target.value;
        setOrganizationId(nextId);
        rememberOrganization(nextId);
        window.location.reload();
    };

    return (
        <div className="cloud-admin-root">
            <header className="cloud-session-bar">
                <div className="cloud-session-brand"><Megaphone size={16} /><span>広告管理</span></div>
                <div className="cloud-session-controls">
                    {organizations.length > 1 ? (
                        <label className="cloud-organization-select"><span>会社</span><select value={organizationId} onChange={changeOrganization}>{organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select></label>
                    ) : <span className="cloud-organization-name">{selectedOrganization?.name || "会社"}</span>}
                    <span className="cloud-session-email">{session.user.email}</span>
                    <button type="button" className="cloud-session-signout" onClick={() => { forgetOrganization(); void supabase.auth.signOut(); }}>ログアウト <LogOut size={14} /></button>
                </div>
            </header>
            <AdminApp />
        </div>
    );
}

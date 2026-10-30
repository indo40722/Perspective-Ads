import { requestCloudApi } from "./cloudApi.js";
import { supabaseConfigured } from "./lib/supabase.js";

const apiBase = import.meta.env.VITE_API_URL || window.location.origin;

export async function requestCouponApi(path, options = {}) {
    if (supabaseConfigured) return requestCloudApi(path, options);

    const response = await fetch(new URL(path, `${apiBase}/`), {
        method: options.method || "GET",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "特典サービスに接続できませんでした");
    return body;
}

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || ""
).trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabase = supabaseConfigured
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
    })
    : null;

const organizationStorageKey = "perspective-ads-active-organization";

export function rememberOrganization(organizationId) {
    if (!supabaseConfigured) return;
    try {
        window.sessionStorage.setItem(organizationStorageKey, organizationId);
    } catch {
        // 保存領域が使えない場合は、画面を開いている間だけ組織を選ぶ。
    }
}

export function getRememberedOrganizationId() {
    if (!supabaseConfigured) return null;
    try {
        return window.sessionStorage.getItem(organizationStorageKey);
    } catch {
        return null;
    }
}

export function forgetOrganization() {
    if (!supabaseConfigured) return;
    try {
        window.sessionStorage.removeItem(organizationStorageKey);
    } catch {
        // 保存領域が使えない場合もログアウトを続ける。
    }
}

export async function listUserOrganizations() {
    if (!supabase) throw new Error("SupabaseのURLと公開キーを設定してください");
    const { data: memberships, error: membershipError } = await supabase
        .from("organization_memberships")
        .select("organization_id, role, created_at")
        .order("created_at", { ascending: true });
    if (membershipError) throw membershipError;
    if (!memberships?.length) return [];

    const organizationIds = memberships.map((membership) => membership.organization_id);
    const { data: organizations, error: organizationError } = await supabase
        .from("organizations")
        .select("id, name, active_campaign_id")
        .in("id", organizationIds)
        .order("name", { ascending: true });
    if (organizationError) throw organizationError;

    const roleByOrganization = new Map(memberships.map((membership) => [membership.organization_id, membership.role]));
    return (organizations || []).map((organization) => ({
        ...organization,
        role: roleByOrganization.get(organization.id) || "viewer",
    }));
}

export async function getActiveOrganization() {
    const organizations = await listUserOrganizations();
    if (!organizations.length) return null;
    const rememberedId = getRememberedOrganizationId();
    const selected = organizations.find((organization) => organization.id === rememberedId) || organizations[0];
    rememberOrganization(selected.id);
    return selected;
}

export function createOrganization(name) {
    if (!supabase) throw new Error("SupabaseのURLと公開キーを設定してください");
    return supabase.rpc("create_organization", { organization_name: name });
}

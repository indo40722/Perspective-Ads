import { getActiveOrganization, supabase, supabaseConfigured } from "./lib/supabase.js";

const failIfError = ({ data, error }) => {
    if (error) throw new Error(error.message || "クラウドデータを読み込めませんでした");
    return data;
};

const campaignFromRow = (row) => {
    if (!row) return null;
    return { ...row.campaign_data, updatedAt: row.updated_at };
};

const getCampaign = async (campaignId, organizationId = null) => {
    let query = supabase
        .from("campaigns")
        .select("campaign_id, campaign_data, is_published, updated_at")
        .eq("campaign_id", campaignId)
        .limit(1);
    if (organizationId) query = query.eq("organization_id", organizationId);
    const rows = failIfError(await query);
    return campaignFromRow(rows?.[0]);
};

const listCampaigns = async () => {
    let organization = null;
    try {
        organization = await getActiveOrganization();
    } catch {
        organization = null;
    }
    if (!organization) throw new Error("会社情報が見つかりません。管理画面で会社を登録してください");
    const rows = failIfError(await supabase
        .from("campaigns")
        .select("campaign_id, campaign_data, is_published, updated_at")
        .eq("organization_id", organization.id)
        .order("updated_at", { ascending: false }));
    const campaigns = (rows || []).map(campaignFromRow);
    return { campaigns, activeCampaignId: organization.active_campaign_id };
};

const getActiveCampaign = async () => {
    const selectedId = new URLSearchParams(window.location.search).get("campaign");
    if (selectedId) return getCampaign(selectedId);

    let organization = null;
    try {
        organization = await getActiveOrganization();
    } catch {
        organization = null;
    }
    if (organization?.active_campaign_id) {
        const campaign = await getCampaign(organization.active_campaign_id, organization.id);
        if (campaign) return campaign;
    }

    const rows = failIfError(await supabase
        .from("campaigns")
        .select("campaign_id, campaign_data, updated_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(1));
    return campaignFromRow(rows?.[0]);
};

const saveCampaign = async (campaign, isNew) => {
    const organization = await getActiveOrganization();
    if (!organization) throw new Error("会社情報が見つかりません。管理画面で会社を登録してください");

    const now = new Date().toISOString();
    const nextCampaign = { ...campaign };
    if (isNew) {
        const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
        nextCampaign.id = `${String(campaign.id).slice(0, 38)}-${suffix}`;
    }

    const row = {
        campaign_id: nextCampaign.id,
        organization_id: organization.id,
        campaign_data: nextCampaign,
        is_published: true,
        updated_at: now,
        published_at: now,
    };
    const savedRow = failIfError(await supabase
        .from("campaigns")
        .upsert(row, { onConflict: "campaign_id" })
        .select("campaign_id, campaign_data, updated_at")
        .single());

    failIfError(await supabase.rpc("set_active_campaign", {
        target_organization_id: organization.id,
        target_campaign_id: savedRow.campaign_id,
    }));
    return campaignFromRow(savedRow);
};

const uploadCampaignAsset = async (campaignId, kind, index, bytes) => {
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0 || bytes.byteLength > 16 * 1024 * 1024) {
        throw new Error("画像は16MB以下で登録してください");
    }
    const image = new Uint8Array(bytes);
    let contentType;
    let extension;
    if (image.length >= 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) {
        contentType = "image/png";
        extension = "png";
    } else if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
        contentType = "image/jpeg";
        extension = "jpg";
    } else if (image.length >= 12 && String.fromCharCode(...image.slice(0, 4)) === "RIFF" && String.fromCharCode(...image.slice(8, 12)) === "WEBP") {
        contentType = "image/webp";
        extension = "webp";
    } else {
        throw new Error("PNG・JPEG・WebP形式の画像を選んでください");
    }

    const organization = await getActiveOrganization();
    if (!organization) throw new Error("会社情報が見つかりません。管理画面で会社を登録してください");
    const storagePath = `${organization.id}/${campaignId}/${kind}-${index}.${extension}`;
    const { error } = await supabase.storage
        .from("campaign-assets")
        .upload(storagePath, bytes, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(error.message || "画像をアップロードできませんでした");
    return { url: supabase.storage.from("campaign-assets").getPublicUrl(storagePath).data.publicUrl };
};

const parsePath = (path) => {
    const url = new URL(path, window.location.origin);
    return { pathname: url.pathname.replace(/\/$/, ""), search: url.searchParams };
};

export async function requestCloudApi(path, options = {}) {
    if (!supabaseConfigured || !supabase) throw new Error("Supabaseの環境設定がありません");
    const { pathname, search } = parsePath(path);
    const method = options.method || "GET";
    const body = options.body || {};

    if (pathname === "/api/campaigns" && method === "GET") return listCampaigns();
    if (pathname === "/api/campaigns" && method === "POST") return saveCampaign(body, true);
    if (pathname === "/api/campaigns/active" && method === "GET") return getActiveCampaign();
    if (pathname === "/api/campaigns/active" && method === "POST") {
        const organization = await getActiveOrganization();
        if (!organization) throw new Error("会社情報が見つかりません。管理画面で会社を登録してください");
        failIfError(await supabase.rpc("set_active_campaign", {
            target_organization_id: organization.id,
            target_campaign_id: body.campaignId,
        }));
        return getCampaign(body.campaignId, organization.id);
    }

    const assetMatch = pathname.match(/^\/api\/campaigns\/([a-z0-9_-]+)\/assets$/);
    if (assetMatch && method === "POST") {
        return uploadCampaignAsset(assetMatch[1], search.get("kind"), Number(search.get("index") || 0), body);
    }
    const campaignMatch = pathname.match(/^\/api\/campaigns\/([a-z0-9_-]+)$/);
    if (campaignMatch && method === "GET") {
        const campaign = await getCampaign(campaignMatch[1]);
        if (!campaign) throw new Error("指定した広告が見つかりません");
        return campaign;
    }
    if (campaignMatch && method === "PUT") return saveCampaign(body, false);

    if (pathname === "/api/campaigns/reward-draw" && method === "POST") {
        return failIfError(await supabase.rpc("draw_campaign_reward", {
            target_campaign_id: body.campaignId,
            target_session_id: body.sessionId,
        }));
    }
    if (pathname === "/api/coupons/events" && method === "POST") {
        return failIfError(await supabase.rpc("record_campaign_event", {
            target_event_id: body.eventId,
            target_session_id: body.sessionId,
            target_campaign_id: body.campaignId,
            target_event_type: body.eventType,
            target_detail_id: body.detailId,
        }));
    }
    if (pathname === "/api/coupons/visits" && method === "POST") {
        return failIfError(await supabase.rpc("record_coupon_visit", {
            target_visit_id: body.visitId,
            target_campaign_id: body.campaignId,
        }));
    }
    if (pathname === "/api/coupons/claim" && method === "POST") {
        return failIfError(await supabase.rpc("claim_campaign_coupon", {
            target_claim_id: body.claimId,
            target_campaign_id: body.campaignId,
        }));
    }
    const claimMatch = pathname.match(/^\/api\/coupons\/claim\/([a-z0-9_-]+)$/);
    if (claimMatch && method === "GET") {
        return failIfError(await supabase.rpc("get_campaign_coupon", { target_claim_id: claimMatch[1] }));
    }
    if (pathname === "/api/coupons/redeem" && method === "POST") {
        return failIfError(await supabase.rpc("redeem_campaign_coupon", { target_code: body.code }));
    }
    if (pathname === "/api/coupons/stats" && method === "GET") {
        const organization = await getActiveOrganization();
        if (!organization) throw new Error("会社情報が見つかりません。管理画面で会社を登録してください");
        return failIfError(await supabase.rpc("get_organization_campaign_stats", {
            target_organization_id: organization.id,
        }));
    }

    throw new Error("クラウド側に対応していない操作です");
}

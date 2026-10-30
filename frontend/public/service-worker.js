const CACHE_VERSION = "perspective-app-v5";
const CAMPAIGN_CACHE = "perspective-published-v1";

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        const scope = self.registration.scope;
        const shellUrls = [
            "index.html",
            "admin.html",
            "manifest.webmanifest",
            "assets/mediapipe/blaze_face_full_range.tflite",
        ].map((path) => new URL(path, scope).href);

        try {
            const manifestResponse = await fetch(new URL("manifest.json", scope));
            if (manifestResponse.ok) {
                const buildManifest = await manifestResponse.json();
                const files = new Set();
                const visited = new Set();
                const collectEntry = (entry) => {
                    if (!entry || visited.has(entry)) return;
                    visited.add(entry);
                    const item = buildManifest[entry];
                    if (!item) return;
                    const paths = [item.file, ...(item.css || [])];
                    for (const path of paths) {
                        if (/\.(js|css|woff2?|ttf|otf|svg)$/i.test(path || "")) files.add(path);
                    }
                    for (const imported of item.imports || []) collectEntry(imported);
                };

                for (const [key, item] of Object.entries(buildManifest)) {
                    if (item.isEntry && (key.includes("index.html") || key.includes("admin.html"))) collectEntry(key);
                }

                for (const path of files) shellUrls.push(new URL(path, scope).href);
            }
        } catch {
            // ビルド情報を読めない環境では、ページ本体だけを保存する。
        }

        await Promise.allSettled(shellUrls.map(async (url) => {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response);
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith("perspective-app-") && name !== CACHE_VERSION)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

const isImageField = (key) => [
    "src",
    "itemNameImage",
    "headlineImage",
    "supportImage",
    "qrImage",
    "actionImage",
    "instructionImage",
].includes(key);

const responseFromDataUrl = (url) => {
    const commaIndex = url.indexOf(",");
    if (commaIndex < 0) throw new Error("画像データを読み取れませんでした");
    const metadata = url.slice(0, commaIndex);
    const content = url.slice(commaIndex + 1);
    const contentType = metadata.slice(5).split(";")[0] || "application/octet-stream";
    const bytes = metadata.includes(";base64")
        ? Uint8Array.from(atob(content), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(content));
    return new Response(bytes, { headers: { "Content-Type": contentType } });
};

const cacheCampaignImage = async (source, generation, index, cache) => {
    const response = source.startsWith("data:")
        ? responseFromDataUrl(source)
        : await fetch(new URL(source, self.registration.scope));
    if (!response.ok || response.type === "opaque") {
        throw new Error("画像を保存できませんでした。管理画面から登録した画像か確認してください");
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.startsWith("image/")) {
        throw new Error("広告素材に画像以外のURLが含まれています");
    }

    const assetUrl = new URL(`__offline_assets__/${encodeURIComponent(generation)}/${index}`, self.registration.scope);
    const blob = await response.blob();
    await cache.put(assetUrl.href, new Response(blob, {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    }));
    return assetUrl.href;
};

const savePublishedCampaign = async (campaign) => {
    if (!campaign || !campaign.id) throw new Error("公開中の広告を読み込めませんでした");

    const cache = await caches.open(CAMPAIGN_CACHE);
    const manifestUrl = new URL("__offline__/published-campaign.json", self.registration.scope).href;
    const previousResponse = await cache.match(manifestUrl);
    const previous = previousResponse ? await previousResponse.json() : null;
    const generation = `${Date.now()}-${crypto.randomUUID()}`;
    const assetKeys = [];
    const assetMap = new Map();
    let assetIndex = 0;

    const copyWithOfflineImages = async (value, key = "", imageContext = false) => {
        if (typeof value === "string" && (isImageField(key) || imageContext) && value) {
            if (assetMap.has(value)) return assetMap.get(value);
            const assetUrl = await cacheCampaignImage(value, generation, assetIndex++, cache);
            assetMap.set(value, assetUrl);
            assetKeys.push(assetUrl);
            return assetUrl;
        }
        if (Array.isArray(value)) return Promise.all(value.map((item) => copyWithOfflineImages(item, key, imageContext)));
        if (value && typeof value === "object") {
            const entries = await Promise.all(Object.entries(value).map(async ([childKey, child]) => [
                childKey,
                await copyWithOfflineImages(child, childKey, imageContext || key === "detailImages"),
            ]));
            return Object.fromEntries(entries);
        }
        return value;
    };

    try {
        const offlineCampaign = await copyWithOfflineImages(campaign);
        const snapshot = {
            campaignId: campaign.id,
            campaignName: campaign.name || campaign.itemName || "公開中の広告",
            updatedAt: campaign.updatedAt || null,
            savedAt: new Date().toISOString(),
            assetCount: assetKeys.length,
            assetKeys,
            previousAssetKeys: previous?.assetKeys || [],
            campaign: offlineCampaign,
        };

        await cache.put(manifestUrl, new Response(JSON.stringify(snapshot), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
        }));

        await Promise.allSettled((previous?.previousAssetKeys || []).map((oldAssetUrl) => cache.delete(oldAssetUrl)));
        return { ok: true, campaignId: campaign.id, savedAt: snapshot.savedAt, assetCount: snapshot.assetCount };
    } catch (error) {
        for (const assetUrl of assetKeys) await cache.delete(assetUrl);
        throw error;
    }
};

self.addEventListener("message", (event) => {
    if (event.data?.type !== "SAVE_PUBLISHED_CAMPAIGN") return;
    const replyPort = event.ports[0];
    event.waitUntil(savePublishedCampaign(event.data.campaign)
        .then((result) => replyPort?.postMessage(result))
        .catch((error) => replyPort?.postMessage({ ok: false, error: error.message || "オフライン保存に失敗しました" })));
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const requestUrl = new URL(request.url);
    const scope = self.registration.scope;
    if (requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(scope)) return;

    if (requestUrl.pathname.includes("/__offline_assets__/")) {
        event.respondWith(caches.open(CAMPAIGN_CACHE).then(async (cache) => {
            const saved = await cache.match(request);
            return saved || new Response("保存済み画像が見つかりません", { status: 404 });
        }));
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            const appCache = await caches.open(CACHE_VERSION);
            try {
                const response = await fetch(request);
                if (response.ok && ["index.html", "admin.html"].includes(requestUrl.pathname.split("/").pop())) {
                    await appCache.put(requestUrl.href, response.clone());
                }
                return response;
            } catch {
                const page = requestUrl.pathname.split("/").pop();
                if (!["index.html", "admin.html"].includes(page)) return Response.error();
                const fallbackUrl = new URL(page === "admin.html" ? "admin.html" : "index.html", scope).href;
                return await appCache.match(request) || await appCache.match(fallbackUrl) || Response.error();
            }
        })());
        return;
    }

    if (/\.(js|css|woff2?|ttf|otf|svg|wasm|tflite)$/i.test(requestUrl.pathname)) {
        event.respondWith((async () => {
            const appCache = await caches.open(CACHE_VERSION);
            const saved = await appCache.match(request);
            if (saved) return saved;
            const response = await fetch(request);
            if (response.ok) await appCache.put(request, response.clone());
            return response;
        })());
    }
});

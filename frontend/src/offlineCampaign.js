const CAMPAIGN_CACHE = "perspective-published-v1";

const getServiceWorkerUrls = () => {
    const pageDirectory = new URL("./", document.baseURI);
    return {
        script: new URL("service-worker.js", pageDirectory),
        scope: pageDirectory.pathname,
        manifest: new URL("__offline__/published-campaign.json", pageDirectory),
    };
};

export async function registerOfflineSupport() {
    if (!("serviceWorker" in navigator) || !("caches" in window)) {
        throw new Error("このブラウザーではオフライン保存を利用できません");
    }
    const urls = getServiceWorkerUrls();
    const registration = await navigator.serviceWorker.register(urls.script.href, { scope: urls.scope });
    if (registration.active) return registration;

    const worker = registration.installing || registration.waiting;
    if (!worker) throw new Error("オフライン保存の準備ができませんでした。ページを再読み込みしてください");

    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            worker.removeEventListener("statechange", handleStateChange);
            reject(new Error("オフライン保存の準備に時間がかかっています。ページを再読み込みしてください"));
        }, 15000);
        const handleStateChange = () => {
            if (worker.state === "activated") {
                window.clearTimeout(timeoutId);
                worker.removeEventListener("statechange", handleStateChange);
                resolve(registration);
            } else if (worker.state === "redundant") {
                window.clearTimeout(timeoutId);
                worker.removeEventListener("statechange", handleStateChange);
                reject(new Error("オフライン保存の準備に失敗しました。HTTPSまたはlocalhostで開いてください"));
            }
        };
        worker.addEventListener("statechange", handleStateChange);
        handleStateChange();
    });
}

export async function readOfflineCampaignSnapshot() {
    if (!("caches" in window)) return null;
    const urls = getServiceWorkerUrls();
    const cache = await caches.open(CAMPAIGN_CACHE);
    const response = await cache.match(urls.manifest.href);
    return response ? response.json() : null;
}

export async function savePublishedCampaignOffline(campaign) {
    const registration = await registerOfflineSupport();
    const worker = registration.active || registration.waiting;
    if (!worker) throw new Error("オフライン保存の準備ができていません。ページを再読み込みしてください");

    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeoutId = window.setTimeout(() => {
            channel.port1.close();
            reject(new Error("画像の保存に時間がかかっています。通信状態を確認してもう一度お試しください"));
        }, 120000);

        channel.port1.onmessage = (event) => {
            window.clearTimeout(timeoutId);
            channel.port1.close();
            if (event.data?.ok) resolve(event.data);
            else reject(new Error(event.data?.error || "オフライン保存に失敗しました"));
        };

        try {
            worker.postMessage({ type: "SAVE_PUBLISHED_CAMPAIGN", campaign }, [channel.port2]);
        } catch (error) {
            window.clearTimeout(timeoutId);
            channel.port1.close();
            reject(error);
        }
    });
}

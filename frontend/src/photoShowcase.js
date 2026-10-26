export function createShowcase(container, initialProduct) {
    const stage = document.createElement("div");
    stage.className = "photo-stage";

    const couponPlane = document.createElement("a");
    couponPlane.className = "coupon-plane";
    couponPlane.target = "_blank";
    couponPlane.rel = "noreferrer";
    couponPlane.setAttribute("aria-label", "商品写真の奥にあるQRコードからスマートフォン向けデモ特典を開く");
    couponPlane.setAttribute("aria-hidden", "true");

    const couponBrand = document.createElement("span");
    couponBrand.className = "coupon-plane-brand";
    const couponTitle = document.createElement("span");
    couponTitle.className = "coupon-plane-title";
    const couponQr = document.createElement("img");
    couponQr.className = "coupon-plane-qr";
    couponQr.alt = "スマートフォンで読み取るデモ特典のQRコード";
    couponQr.hidden = true;
    const couponQrStatus = document.createElement("span");
    couponQrStatus.className = "coupon-plane-qr-status";
    couponQrStatus.textContent = "QRを準備中";
    const couponCopy = document.createElement("span");
    couponCopy.className = "coupon-plane-copy";
    couponCopy.append(couponBrand, couponTitle);
    couponPlane.append(couponQr, couponQrStatus, couponCopy);
    couponPlane.addEventListener("pointerdown", (event) => event.stopPropagation());

    const parallax = document.createElement("div");
    parallax.className = "photo-parallax";

    const photos = [];

    const shade = document.createElement("div");
    shade.className = "photo-shade";

    const progress = document.createElement("div");
    progress.className = "gaze-progress";
    progress.setAttribute("aria-hidden", "true");

    stage.append(couponPlane, parallax, shade, progress);
    container.appendChild(stage);

    let product = initialProduct;
    let stageIndex = 0;
    let selectedVariantIndex = initialProduct.defaultOptionIndex ?? 0;
    let variantPreview = false;
    let onSwipe = () => {};
    let pointerStartX = null;

    const resizePhotoLayers = (count) => {
        while (photos.length < count) {
            const photo = document.createElement("img");
            photo.className = "product-photo";
            photo.draggable = false;
            photo.setAttribute("aria-hidden", "true");
            photo.dataset.photoIndex = String(photos.length);
            photos.push(photo);
            parallax.appendChild(photo);
        }
        while (photos.length > count) {
            photos.pop().remove();
        }
    };

    const setStage = (nextIndex) => {
        stageIndex = Math.max(0, Math.min(product.stages.length - 1, nextIndex));
        const current = product.stages[stageIndex];
        const focus = current.focus;
        const selectedPhoto = product.variants?.[selectedVariantIndex]?.photo;
        const photoIndex = current.variantPhotos?.[selectedVariantIndex]
            ?? (variantPreview ? selectedPhoto : undefined)
            ?? current.photo;
        stage.dataset.variantPreview = String(variantPreview);
        photos.forEach((photo, index) => {
            photo.classList.toggle("is-active", index === photoIndex);
            photo.setAttribute("aria-hidden", String(index !== photoIndex));
            photo.style.transformOrigin = `${focus.originX}% ${focus.originY}%`;
            photo.style.transform = `translate3d(${focus.panX}%, ${focus.panY}%, 0) scale(${focus.scale})`;
        });
        stage.dataset.product = product.id;
        stage.dataset.stage = current.label;
    };

    const setProduct = (nextProduct) => {
        product = nextProduct;
        stageIndex = 0;
        selectedVariantIndex = product.defaultOptionIndex ?? 0;
        variantPreview = false;
        couponBrand.textContent = product.brand ?? "";
        couponTitle.textContent = product.reward?.title ?? "";
        resizePhotoLayers(product.photos.length);
        photos.forEach((photo, index) => {
            const asset = product.photos[index];
            photo.src = asset?.src ?? "";
            photo.alt = asset?.alt ?? "";
            photo.classList.toggle("is-active", Boolean(asset) && index === 0);
            photo.setAttribute("aria-hidden", String(!asset || index !== 0));
        });
        setStage(0);
        stage.style.setProperty("--cut-progress", "0");
    };

    const setVariant = (nextIndex) => {
        selectedVariantIndex = Math.max(0, nextIndex);
        variantPreview = true;
        setStage(stageIndex);
    };

    const handlePointerDown = (event) => {
        pointerStartX = event.clientX;
        stage.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event) => {
        if (pointerStartX === null) {
            return;
        }

        const distance = event.clientX - pointerStartX;
        if (Math.abs(distance) < stage.clientWidth * 0.18) {
            return;
        }

        pointerStartX = event.clientX;
        onSwipe(distance < 0 ? "left" : "right");
    };

    const handlePointerUp = () => {
        pointerStartX = null;
    };

    stage.addEventListener("pointerdown", handlePointerDown);
    stage.addEventListener("pointermove", handlePointerMove);
    stage.addEventListener("pointerup", handlePointerUp);
    stage.addEventListener("pointercancel", handlePointerUp);

    setProduct(initialProduct);

    return {
        setViewer(revealProgress = 0) {
            couponPlane.style.opacity = revealProgress.toFixed(2);
            couponPlane.style.pointerEvents = revealProgress >= 0.72 ? "auto" : "none";
            couponPlane.setAttribute("aria-hidden", String(revealProgress < 0.72));
            stage.closest(".ad-shell")?.classList.toggle("has-coupon-reveal", revealProgress > 0.02);
        },
        setCutProgress(value) {
            stage.style.setProperty("--cut-progress", Math.max(0, Math.min(1, value)).toFixed(3));
        },
        setCouponQr({ url = "", dataUrl = "", failed = false } = {}) {
            if (url) couponPlane.href = url;
            else couponPlane.removeAttribute("href");
            couponQr.hidden = !dataUrl;
            couponQr.src = dataUrl;
            couponQrStatus.textContent = failed ? "QRを表示できません" : dataUrl ? "スマホで読み取る" : "QRを準備中";
            couponQrStatus.hidden = Boolean(dataUrl);
        },
        setProduct,
        setStage,
        setVariant,
        setOnSwipe(handler) {
            onSwipe = handler;
        },
        setGazeProgress(value) {
            progress.style.setProperty("--gaze-progress", `${Math.max(0, Math.min(1, value))}`);
        },
        reset() {
            parallax.style.transform = "translate3d(0, 0, 0)";
            couponPlane.style.transform = "translate3d(0, -50%, 0)";
            couponPlane.style.opacity = "0";
            couponPlane.style.pointerEvents = "none";
            couponPlane.setAttribute("aria-hidden", "true");
            stage.closest(".ad-shell")?.classList.remove("has-coupon-reveal");
            selectedVariantIndex = product.defaultOptionIndex ?? 0;
            variantPreview = false;
            stage.style.setProperty("--cut-progress", "0");
            setStage(0);
            progress.style.setProperty("--gaze-progress", "0");
        },
        dispose() {
            stage.removeEventListener("pointerdown", handlePointerDown);
            stage.removeEventListener("pointermove", handlePointerMove);
            stage.removeEventListener("pointerup", handlePointerUp);
            stage.removeEventListener("pointercancel", handlePointerUp);
            stage.remove();
        },
    };
}

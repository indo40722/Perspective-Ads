const withoutDemoLabel = (value) => String(value ?? "").replace(/デモ/g, "").trim();

function renderCouponValue(element, value) {
    if (element.dataset.value === value) return;
    element.dataset.value = value;
    const displayValue = withoutDemoLabel(value);
    const percent = displayValue.match(/^(\d+(?:[.,]\d+)?%)\s*OFF(?:\s*[（(]([^）)]*)[）)])?$/i);
    const yen = displayValue.match(/^(\d+)\s*円引き(?:\s*[（(]([^）)]*)[）)])?$/);
    const match = percent || yen;
    if (!match) {
        element.classList.remove("coupon-value-layout");
        element.removeAttribute("aria-label");
        element.textContent = displayValue;
        return;
    }

    const amount = document.createElement("span");
    amount.className = "coupon-value-amount";
    amount.textContent = percent ? match[1].slice(0, -1) : match[1];
    const parts = [amount];
    if (percent) {
        const symbol = document.createElement("span");
        symbol.className = "coupon-value-symbol";
        symbol.textContent = "％";
        parts.push(symbol);
    }
    const unit = document.createElement("span");
    unit.className = "coupon-value-unit";
    unit.textContent = percent ? "OFF" : "円引き";
    parts.push(unit);
    if (match[2]) {
        const note = document.createElement("small");
        note.className = "coupon-value-note";
        note.textContent = match[2];
        parts.push(note);
    }
    element.classList.add("coupon-value-layout");
    element.setAttribute("aria-label", displayValue);
    element.replaceChildren(...parts);
}

export function createShowcase(container, initialProduct) {
    const stage = document.createElement("div");
    stage.className = "photo-stage";

    const campaignOverlay = container.closest(".ad-shell")?.querySelector(".campaign-overlay");
    const couponPlane = document.createElement("a");
    couponPlane.className = "coupon-plane";
    couponPlane.target = "_blank";
    couponPlane.rel = "noreferrer";
    couponPlane.setAttribute("aria-label", "見どころを見つけた方への特典受取用QRコード");
    couponPlane.setAttribute("aria-hidden", "true");

    const couponTicket = document.createElement("span");
    couponTicket.className = "coupon-ticket";
    const couponQrFrame = document.createElement("span");
    couponQrFrame.className = "coupon-ticket-qr-frame";
    const couponTicketCopy = document.createElement("span");
    couponTicketCopy.className = "coupon-ticket-copy";
    const couponCopyParts = [
        { name: "detail", className: "coupon-copy-detail" },
        { name: "action", className: "coupon-copy-action" },
        { name: "instruction", className: "coupon-copy-instruction" },
    ].map(({ name, className }) => {
        const wrapper = document.createElement("span");
        wrapper.className = `coupon-copy-part ${className}`;
        const image = document.createElement("img");
        image.alt = "";
        image.draggable = false;
        const text = document.createElement("span");
        text.className = "coupon-copy-text";
        wrapper.append(image, text);
        return { name, wrapper, image, text };
    });
    const couponQr = document.createElement("img");
    couponQr.className = "coupon-plane-qr";
    couponQr.alt = "クーポンを受け取るQRコード";
    couponQr.hidden = true;
    const couponQrStatus = document.createElement("span");
    couponQrStatus.className = "coupon-plane-qr-status";
    couponQrStatus.textContent = "読み取り準備中";
    couponCopyParts.forEach(({ wrapper }) => couponTicketCopy.appendChild(wrapper));
    couponQrFrame.append(couponQr, couponQrStatus);
    couponTicket.append(couponTicketCopy, couponQrFrame);
    couponPlane.append(couponTicket);
    couponPlane.addEventListener("pointerdown", (event) => event.stopPropagation());

    const parallax = document.createElement("div");
    parallax.className = "photo-parallax";

    const photos = [];

    const shade = document.createElement("div");
    shade.className = "photo-shade";

    const progress = document.createElement("div");
    progress.className = "gaze-progress";
    progress.setAttribute("aria-hidden", "true");

    stage.append(parallax, shade, progress);
    container.appendChild(stage);
    (campaignOverlay ?? container).appendChild(couponPlane);

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
        setRewardReveal({
            progress = 0,
            viewerX = 0,
            forwardProgress = 0,
            url = "",
            dataUrl = "",
            detail = "",
            interactive = false,
            failed = false,
        } = {}) {
            const revealProgress = Math.max(0, Math.min(1, progress));
            const isRevealed = interactive && revealProgress >= 1;
            couponPlane.style.opacity = isRevealed ? "1" : "0";
            couponPlane.style.transform = `translate3d(0, ${isRevealed ? 0 : 8}px, 0)`;
            couponPlane.style.pointerEvents = isRevealed ? "auto" : "none";
            couponPlane.setAttribute("aria-hidden", String(!isRevealed));
            stage.closest(".ad-shell")?.classList.toggle("has-coupon-reveal", isRevealed);
            if (interactive && url) couponPlane.href = url;
            else couponPlane.removeAttribute("href");

            const copySources = {
                detail: product.reward?.detailImages?.[detail] ?? "",
                action: product.reward?.actionImage ?? "",
                instruction: product.reward?.instructionImage ?? "",
            };
            const copyAlts = {
                detail: withoutDemoLabel(product.reward?.detailAlts?.[detail] ?? ""),
                action: withoutDemoLabel(product.reward?.actionAlt ?? ""),
                instruction: withoutDemoLabel(product.reward?.instructionAlt ?? ""),
            };
            const copyTexts = {
                detail: withoutDemoLabel(product.reward?.detailTexts?.[detail] ?? product.reward?.title ?? "特典"),
                action: product.reward?.value ?? "",
                instruction: withoutDemoLabel(product.reward?.note ?? "QRをスマートフォンで読み取る"),
            };
            couponCopyParts.forEach(({ name, image, text }) => {
                const source = copySources[name];
                if (image.dataset.source !== source) {
                    image.dataset.source = source;
                    if (source) image.src = source;
                    else image.removeAttribute("src");
                }
                image.alt = copyAlts[name];
                image.hidden = !source;
                if (name === "action") renderCouponValue(text, copyTexts[name]);
                else text.textContent = copyTexts[name];
                text.hidden = Boolean(source);
            });
            couponPlane.setAttribute("aria-label", `${Object.values(copyTexts).filter(Boolean).join("。")}。QRコードを読み取る`);
            if (couponQr.dataset.detail !== detail || couponQr.dataset.source !== dataUrl) {
                couponQr.dataset.detail = detail;
                couponQr.dataset.source = dataUrl;
                couponQr.src = dataUrl;
            }
            couponQr.hidden = !dataUrl;
            couponQrStatus.textContent = failed ? "QRを表示できません" : dataUrl ? "" : "読み取り準備中";
            couponQrStatus.hidden = Boolean(dataUrl);

            const normalizedX = Math.max(-1, Math.min(1, viewerX / 28));
            const horizontalShift = -normalizedX * Math.min(stage.clientWidth * 0.035, 24);
            const verticalShift = -Math.max(0, Math.min(1, forwardProgress)) * Math.min(stage.clientHeight * 0.012, 12);
            const productScale = 1 + Math.max(0, Math.min(1, forwardProgress)) * 0.02;
            parallax.style.transform = `translate3d(${horizontalShift.toFixed(1)}px, ${verticalShift.toFixed(1)}px, 0) scale(${productScale.toFixed(3)})`;
        },
        setCutProgress(value) {
            stage.style.setProperty("--cut-progress", Math.max(0, Math.min(1, value)).toFixed(3));
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
            couponPlane.style.transform = "translate3d(0, 8px, 0)";
            couponPlane.style.opacity = "0";
            couponPlane.style.pointerEvents = "none";
            couponPlane.removeAttribute("href");
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
            couponPlane.remove();
            stage.remove();
        },
    };
}

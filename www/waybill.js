// =========================================================================
// 🖨️ المحرك الأصلي لطابعة البوالص الحرارية (Deli E750W - Native APK Bridge)

// الملف: waybill.js | خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// مربوط 100% مع الجسر الأصلي داخل الـ APK (window.SmanNativePrinter)
// يدعم: Bluetooth SPP المباشر + USB OTG المباشر + Android System Print
// المواصفات: 203 DPI (8 dots/mm) | TSPL BITMAP | Max Width: 108mm
// =========================================================================

(function () {
    const DOTS_PER_MM = 8; // 203 DPI = 8 نقاط لكل مليمتر

    // 1. الإعدادات الافتراضية المتوافقة مع Deli E750W (مقاس فاتورة سمان ههيا 70×130 مم)
    const defaultDeliConfig = {
        sizePreset: '70x130',    // '70x130' | '100x100' | '100x150' | '80x60' | '70x50' | '50x30' | 'custom'
        widthMm: 70,
        heightMm: 130,
        sensorType: 'gap',       // 'gap' | 'continuous' | 'bmark'
        gapMm: 2,
        density: 13,             // غمقان مثالي لوضوح الخط العربي على Deli E750W
        speed: 3,                // سرعة متزنة لمنع تقطيع الخطوط الحرارية
        direction: 0,
        fontScale: 'normal',     // 'small' | 'normal' | 'large'
        templateMode: 'shipping',// 'shipping' | 'product_tag'
        selectedMac: 'AUTO',     // عنوان البلوتوث للطابعة (AUTO يختار Deli 750W تلقائياً)
        invertBitmap: false,     // خيار عكس بتات الـ Bitmap (0=أسود هو القياسي في TSPL)
        instantPrint: false,     // لو مفعلة يطبع بالبلوتوث فوراً بمجرد الضغط على زر بوليصة في الكارت
        copies: 1,
        showLogo: true,
        showBarcode: false,      // إيقاف الباركود والأكواد افتراضياً لتكون فاتورة شيك وبسيطة
        showItemsPrice: true,
        showWeightInfo: true,
        includeRouteSummary: false,
        cleanInvoiceVersion: 2,
        footerText: 'بالهنا والشفا من سمان ههيا 🤍 تشرفنا بخدمتكم'
    };

    window.deliPrinterConnection = {
        pairedDevices: [],
        btDevice: null,
        btCharacteristic: null,
        isPrinting: false,
        lastOrdersQueue: []
    };

    function isNativeApkBridgeAvailable() {
        return Boolean(window.SmanNativePrinter && typeof window.SmanNativePrinter.isNativeBridgeReady === 'function');
    }

    window.getWaybillConfig = function () {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('sman_waybill_cfg') || '{}');
        } catch (e) {}
        const remoteCfg = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : {};
        const merged = { ...defaultDeliConfig, ...remoteCfg, ...saved };

        // ترقية تلقائية لمرة واحدة لضبط المقاس على 70×130 مم وإخفاء الباركود القديم
        if (!merged.cleanInvoiceVersion || merged.cleanInvoiceVersion < 2) {
            merged.sizePreset = '70x130';
            merged.widthMm = 70;
            merged.heightMm = 130;
            merged.showBarcode = false;
            merged.cleanInvoiceVersion = 2;
            if (!merged.footerText || merged.footerText.includes('جودة تليق')) {
                merged.footerText = 'بالهنا والشفا من سمان ههيا 🤍 تشرفنا بخدمتكم';
            }
            try { localStorage.setItem('sman_waybill_cfg', JSON.stringify(merged)); } catch (e) {}
        }
        return merged;
    };

    function persistWaybillConfig(newCfg) {
        newCfg.cleanInvoiceVersion = 2;
        try {
            localStorage.setItem('sman_waybill_cfg', JSON.stringify(newCfg));
        } catch (e) {}
        if (typeof storeSettings !== 'undefined') {
            storeSettings.waybillConfig = newCfg;
        }
        if (typeof db !== 'undefined') {
            db.collection('inventory').doc('settings').set({ waybillConfig: newCfg }, { merge: true }).catch(() => {});
        }
    }

    function resolveDimensionsMm(cfg) {
        const presets = {
            '70x130':  { w: 70,  h: 130 },
            '100x100': { w: 100, h: 100 },
            '100x150': { w: 100, h: 150 },
            '80x60':   { w: 80,  h: 60 },
            '70x50':   { w: 70,  h: 50 },
            '50x30':   { w: 50,  h: 30 }
        };
        if (presets[cfg.sizePreset]) return presets[cfg.sizePreset];
        return {
            w: Math.min(108, Math.max(30, Number(cfg.widthMm) || 70)),
            h: Math.min(250, Math.max(20, Number(cfg.heightMm) || 130))
        };
    }



    function notifyPrinterToast(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg);
        } else if (typeof window.showQuickAppToast === 'function') {
            window.showQuickAppToast(msg);
        } else {
            alert(msg);
        }
    }

    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, sub);
        }
        return btoa(binary);
    }

    // =========================================================================
    // 📊 2. مولد باركود CODE128 داخلي مستقل (يرسم مباشرة على الـ Canvas)
    // =========================================================================
    const CODE128_PATTERNS = [
        "11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000",
        "11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100",
        "11001001110","11011100100","11001110100","11101101110","11101001100","11100101100","11100100110","11101100100","11100110100","11100110010",
        "11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000",
        "11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110",
        "11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010",
        "11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000",
        "10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010",
        "10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011011110",
        "11011110110","11110110110","10101111000","10100011110","10001011110","10111101000","10111100010","11110101000","11110100010","10111011110",
        "10111101110","11101011110","11110101110","11010000100","11010010000","11010011100","1100011101011"
    ];

    function encodeCode128Bits(text) {
        const clean = String(text || '100200').replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().slice(0, 14) || '100200';
        let codes = [104];
        let checksum = 104;
        for (let i = 0; i < clean.length; i++) {
            const c = clean.charCodeAt(i) - 32;
            const valid = (c >= 0 && c < 95) ? c : 16;
            codes.push(valid);
            checksum += valid * (i + 1);
        }
        codes.push(checksum % 103);
        codes.push(106);
        return codes.map(c => CODE128_PATTERNS[c]).join('');
    }

    function drawBarcodeOnCanvas(ctx, text, centerX, topY, maxWidth, barHeight) {
        const bits = encodeCode128Bits(text);
        const barW = Math.max(2, Math.floor(maxWidth / bits.length));
        const totalW = bits.length * barW;
        const startX = Math.round(centerX - (totalW / 2));

        ctx.fillStyle = '#000000';
        for (let i = 0; i < bits.length; i++) {
            if (bits[i] === '1') {
                ctx.fillRect(startX + i * barW, Math.round(topY), barW, barHeight);
            }
        }
    }

    // =========================================================================
    // 🖼️ 3. محرك الرسم الحراري المرن على Canvas بدقة 203 DPI (شنط + براويز + دعاية + استيكر حر)
    // =========================================================================

    // دالة تقسيم النصوص العربية الطويلة تلقائياً لعدة سطور لمنع قص الكلام في أي مقاس
    function wrapThermalText(ctx, text, maxWidth) {
        const rawLines = String(text || '').split('\n');
        const finalLines = [];

        rawLines.forEach(rawLine => {
            const words = rawLine.trim().split(/\s+/);
            let currentLine = '';
            words.forEach(word => {
                const testLine = currentLine ? (currentLine + ' ' + word) : word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    finalLines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            });
            if (currentLine) finalLines.push(currentLine);
        });

        return finalLines.length > 0 ? finalLines : [''];
    }

    // دالة رسم البرواز الخارجي حسب الشكل المختار (6 أشكال حرارية حادة)
    function drawCustomFrameBorder(ctx, x, y, w, h, styleName) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';

        if (styleName === 'none') {
            ctx.restore();
            return;
        }

        if (styleName === 'double') {
            ctx.lineWidth = 5;
            ctx.strokeRect(x, y, w, h);
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
        } else if (styleName === 'rounded') {
            const r = Math.min(22, Math.floor(Math.min(w, h) * 0.06));
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.stroke();
        } else if (styleName === 'dashed') {
            ctx.lineWidth = 4;
            ctx.setLineDash([14, 8]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        } else if (styleName === 'corners') {
            const len = Math.min(w, h) * 0.14;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
            ctx.moveTo(x + len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + len);
            ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
            ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
            ctx.stroke();
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        } else {
            ctx.lineWidth = 5;
            ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
    }

    window.renderWaybillToCanvas203DPI = function (order, cfg, indexNum = 1, totalCount = 1, bagIndex = 1, bagsTotal = 1) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // خلفية بيضاء نقية 100%
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        // تطبيق الإزاحة الأفقية والرأسية بالمليمتر
        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        const padPct = (Number(cfg.paddingPct) || 100) / 100;
        const pad = Math.max(6, Math.round(Math.min(W, H) * 0.024 * padPct));
        const borderStyle = cfg.borderStyle || 'double';

        drawCustomFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, borderStyle);

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';

        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();
        const orderShortId = (order.id || '000000').slice(-6).toUpperCase();
        const barcodeCode = (cfg.customBarcodeText || orderShortId).replace(/[^A-Z0-9\-]/gi, '1') || '100200';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');
        const batchTitle = (typeof window.resolveOrderBatchName === 'function')
            ? window.resolveOrderBatchName(order)
            : ((order.batchName && order.batchName !== 'undefined') ? order.batchName : '');

        let scaleMul = 1.0;
        if (cfg.fontScalePct) {
            scaleMul = Math.min(1.45, Math.max(0.65, Number(cfg.fontScalePct) / 100));
        } else if (cfg.fontScale === 'large') {
            scaleMul = 1.14;
        } else if (cfg.fontScale === 'small') {
            scaleMul = 0.86;
        }

        const innerMargin = borderStyle === 'double' ? 14 : 10;
        const innerRight = W - pad - innerMargin;
        const innerLeft = pad + innerMargin;
        const innerWidth = innerRight - innerLeft;

        // =====================================================================
        // ✍️ الوضع الأول: الاستيكر الحر (يدعم الأسطر المتعددة وأي مقاس استيكر)
        // =====================================================================
        if (cfg.templateMode === 'free_custom') {
            const line1 = cfg.freeLine1 !== undefined ? cfg.freeLine1 : storeName;
            const line2 = cfg.freeLine2 !== undefined ? cfg.freeLine2 : 'سمان جامبو وملكي طازج يومياً';
            const line3 = cfg.freeLine3 !== undefined ? cfg.freeLine3 : `للحجز والتوصيل: ${storePhone}`;
            const badgeTxt = cfg.freeBadgeText !== undefined ? cfg.freeBadgeText : '';

            let curY = pad + innerMargin + 4;
            const refSize = Math.min(W, H);

            if (line1 && line1.trim()) {
                const f1 = Math.max(16, Math.round(refSize * 0.11 * scaleMul));
                ctx.font = `900 ${f1}px Cairo, Tahoma, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const wrapped1 = wrapThermalText(ctx, line1, innerWidth - 12);
                wrapped1.slice(0, 2).forEach(ln => {
                    ctx.fillText(ln, W / 2, curY);
                    curY += f1 + 4;
                });

                curY += 4;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(innerLeft + 8, curY);
                ctx.lineTo(innerRight - 8, curY);
                ctx.stroke();
                curY += 10;
            }

            if (line2 && line2.trim()) {
                const f2 = Math.max(14, Math.round(refSize * 0.095 * scaleMul));
                ctx.font = `900 ${f2}px Cairo, Tahoma, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const wrapped2 = wrapThermalText(ctx, line2, innerWidth - 12);
                wrapped2.slice(0, 3).forEach(ln => {
                    ctx.fillText(ln, W / 2, curY);
                    curY += f2 + 6;
                });
                curY += 6;
            }

            if (line3 && line3.trim()) {
                const f3 = Math.max(12, Math.round(refSize * 0.075 * scaleMul));
                ctx.font = `800 ${f3}px Cairo, Tahoma, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const wrapped3 = wrapThermalText(ctx, line3, innerWidth - 12);
                wrapped3.slice(0, 2).forEach(ln => {
                    ctx.fillText(ln, W / 2, curY);
                    curY += f3 + 4;
                });
                curY += 6;
            }

            if (badgeTxt && badgeTxt.trim()) {
                const boxH = Math.max(28, Math.round(H * 0.14));
                ctx.fillStyle = '#000000';
                ctx.fillRect(innerLeft + 6, curY, innerWidth - 12, boxH);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${Math.max(12, Math.round(boxH * 0.56 * scaleMul))}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(badgeTxt.trim(), W / 2, curY + boxH / 2);
                ctx.fillStyle = '#000000';
                curY += boxH + 8;
            }

            if (cfg.showBarcode && curY < H - pad - innerMargin - 35) {
                const bcH = Math.min(Math.round(H * 0.16), H - pad - innerMargin - curY - 8);
                if (bcH >= 22) {
                    drawBarcodeOnCanvas(ctx, barcodeCode, W / 2, H - pad - innerMargin - bcH - 4, Math.round(innerWidth * 0.78), bcH);
                }
            }

            ctx.restore();
            return canvas;
        }

        // =====================================================================
        // 🏷️ الوضع الثاني: استيكر أطباق السمان والفريزر (مرن لأي مقاس من 50x30 إلى 100x100)
        // =====================================================================
        const itemsList = Array.isArray(order.items) ? order.items : [];
        if (cfg.templateMode === 'product_tag') {
            const firstItem = itemsList[0] || { name: 'طبق سمان جامبو ملكي', quantity: 1, price: 145 };
            const tagTitle = (cfg.tagProductName && cfg.tagProductName.trim()) ? cfg.tagProductName.trim() : `${firstItem.quantity}x ${firstItem.name}`;
            const tagWeight = (cfg.tagWeightText && cfg.tagWeightText.trim()) ? cfg.tagWeightText.trim() : 'ذبح اليوم - طازج ونظيف 100%';
            const tagDate = (cfg.tagDateText && cfg.tagDateText.trim()) ? cfg.tagDateText.trim() : `إنتاج: ${orderDateStr}`;
            const tagPrice = (cfg.tagPriceText !== undefined && cfg.tagPriceText !== '')
                ? cfg.tagPriceText
                : (cfg.showItemsPrice !== false ? `${(Number(firstItem.quantity) || 1) * (Number(firstItem.price) || 0)} ج.م` : '');

            let y = pad + innerMargin;
            const hdrH = Math.max(26, Math.round(H * 0.21));
            ctx.fillStyle = '#000000';
            ctx.fillRect(innerLeft, y, innerWidth, hdrH);
            ctx.fillStyle = '#FFFFFF';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            ctx.font = `900 ${Math.max(12, Math.round(hdrH * 0.54 * scaleMul))}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storeName, innerRight - 8, y + hdrH / 2);

            ctx.textAlign = 'left';
            ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.45 * scaleMul))}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storePhone, innerLeft + 8, y + hdrH / 2);

            y += hdrH + Math.round(H * 0.06);
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            const fMain = Math.max(15, Math.round(H * 0.135 * scaleMul));
            ctx.font = `900 ${fMain}px Cairo, Tahoma, sans-serif`;
            const titleLines = wrapThermalText(ctx, tagTitle, innerWidth - 10);
            titleLines.slice(0, 2).forEach(ln => {
                ctx.fillText(ln, W / 2, y);
                y += fMain + 4;
            });

            y += Math.round(H * 0.03);
            const fW = Math.max(12, Math.round(H * 0.09 * scaleMul));
            ctx.font = `900 ${fW}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`الوزن/المحتوى: ${tagWeight}`, W / 2, y);

            y += fW + Math.round(H * 0.04);
            const fD = Math.max(11, Math.round(H * 0.08 * scaleMul));
            ctx.font = `800 ${fD}px Cairo, Tahoma, sans-serif`;
            const bagSuffix = bagsTotal > 1 ? `  |  [شنطة ${bagIndex} من ${bagsTotal}]` : '';
            ctx.fillText(`${tagDate}${bagSuffix}`, W / 2, y);

            if (tagPrice && String(tagPrice).trim() !== '') {
                const pBoxH = Math.max(24, Math.round(H * 0.16));
                const boxY = H - pad - innerMargin - pBoxH;
                ctx.lineWidth = 3;
                ctx.strokeRect(innerLeft + 14, boxY, innerWidth - 28, pBoxH);
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${Math.max(13, Math.round(pBoxH * 0.6 * scaleMul))}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(`السعر: ${tagPrice}`, W / 2, boxY + pBoxH / 2);
            }

            ctx.restore();
            return canvas;
        }

        // =====================================================================
        // 📦 الوضع الثالث: بوليصة الشحن والتحصيل الكاملة (مقاسات متكيفة + شنط + دعاية)
        // =====================================================================
        let totalUnitsCount = 0;
        itemsList.forEach(i => { totalUnitsCount += (Number(i.quantity) || 0); });

        // ضبط أحجام الخطوط نسبياً مع الأصغر من (العرض أو الطول) لضمان عدم التداخل في المقاسات المستطيلة
        const baseRef = Math.min(W, Math.round(H * 1.15));
        const fTitle = Math.max(16, Math.round(baseRef * 0.040 * scaleMul));
        const fSub = Math.max(12, Math.round(baseRef * 0.025 * scaleMul));
        const fBody = Math.max(13, Math.round(baseRef * 0.028 * scaleMul));
        const fSmall = Math.max(11, Math.round(baseRef * 0.022 * scaleMul));

        let curY = pad + innerMargin;

        // 1. الهيدر العلوي (اليمين: بيانات المتجر | اليسار: الباركود وشارة الشنطة)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        let rightHeaderY = curY;

        if (cfg.showLogo !== false) {
            ctx.font = `900 ${fTitle}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storeName, innerRight, rightHeaderY);
            rightHeaderY += fTitle + 4;
        }

        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`تليفون: ${storePhone}`, innerRight, rightHeaderY);
        rightHeaderY += fSub + 5;

        ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`التاريخ: ${orderDateStr}${batchTitle ? ' • ' + batchTitle : ''}`, innerRight, rightHeaderY);
        rightHeaderY += fSmall + 6;

        // الجانب الأيسر من الهيدر: الباركود + رقم الطلب + شارة الشنطة (1 من 2)
        const showBagPill = (bagsTotal > 1) || cfg.alwaysShowBagBadge;
        const bagCustomNote = (cfg.bagCustomLabel || '').trim();
        let leftHeaderY = curY;
        const leftBlockWidth = Math.round(innerWidth * 0.42);
        const leftCenterX = innerLeft + (leftBlockWidth / 2);

        if (cfg.showBarcode !== false) {
            const bcHeight = showBagPill ? Math.max(26, Math.round(H * 0.052)) : Math.max(32, Math.round(H * 0.068));
            drawBarcodeOnCanvas(ctx, barcodeCode, leftCenterX, leftHeaderY, leftBlockWidth - 8, bcHeight);
            leftHeaderY += bcHeight + 3;

            ctx.textAlign = 'center';
            ctx.font = `900 ${Math.round(fSmall * 0.9)}px monospace`;
            ctx.fillText(`#${orderShortId} (${indexNum}/${totalCount})`, leftCenterX, leftHeaderY);
            leftHeaderY += fSmall + 3;
        } else {
            ctx.textAlign = 'left';
            ctx.font = `900 ${fTitle}px monospace`;
            ctx.fillText(`#${orderShortId} (${indexNum}/${totalCount})`, innerLeft, leftHeaderY + 4);
            leftHeaderY += fTitle + 8;
        }

        if (showBagPill) {
            const bagBoxH = Math.max(24, Math.round(H * 0.044));
            ctx.fillStyle = '#000000';
            ctx.fillRect(innerLeft, leftHeaderY, leftBlockWidth, bagBoxH);
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            const bagText = `شنطة ( ${bagIndex} من ${bagsTotal} )${bagCustomNote ? ' - ' + bagCustomNote : ''}`;
            ctx.fillText(bagText, leftCenterX, leftHeaderY + bagBoxH / 2);
            ctx.fillStyle = '#000000';
            ctx.textBaseline = 'top';
            leftHeaderY += bagBoxH + 4;
        }

        curY = Math.max(rightHeaderY, leftHeaderY) + 4;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pad + 6, curY);
        ctx.lineTo(W - pad - 6, curY);
        ctx.stroke();

        // 2. صندوق بيانات العميل والمنطقة والعنوان
        curY += 8;
        const custBoxH = Math.max(85, Math.round(H * 0.185));
        ctx.lineWidth = 3;
        ctx.strokeRect(innerLeft, curY, innerWidth, custBoxH);

        const zoneText = `${order.zone || 'توصيل'}`;
        ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
        const zoneW = Math.min(Math.round(innerWidth * 0.36), Math.max(115, ctx.measureText(zoneText).width + 28));
        const zoneH = Math.round(custBoxH * 0.42);
        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft + 8, curY + 8, zoneW, zoneH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zoneText, innerLeft + 8 + (zoneW / 2), curY + 8 + (zoneH / 2));

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.round(fBody * 1.08)}px Cairo, Tahoma, sans-serif`;
        const custNameClean = (order.customerName || 'عميل سمان ههيا').slice(0, 28);
        ctx.fillText(`العميل: ${custNameClean}`, innerRight - 10, curY + 8);

        const phonesLine = `موبايل: ${order.customerPhone || ''}${order.customerPhone2 ? ' | ' + order.customerPhone2 : ''}`;
        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(phonesLine, innerRight - 10, curY + 12 + Math.round(fBody * 1.15));

        const addrLineY = curY + Math.round(custBoxH * 0.62);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(innerLeft + 8, addrLineY);
        ctx.lineTo(innerRight - 8, addrLineY);
        ctx.stroke();
        ctx.setLineDash([]);

        const addrClean = `العنوان: ${order.customerAddress || 'استلام حسب المنطقة المسجلة'}${order.driverName ? ' (المندوب: ' + order.driverName + ')' : ''}`;
        ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
        const wrappedAddr = wrapThermalText(ctx, addrClean, innerWidth - 20);
        ctx.fillText(wrappedAddr[0] || '', innerRight - 10, addrLineY + 6);

        // 3. جدول الأصناف المطلوبة
        curY += custBoxH + 8;
        const hasPromo = Boolean(cfg.showPromoBanner && cfg.promoText && cfg.promoText.trim());
        const promoBarH = hasPromo ? Math.max(24, Math.round(H * 0.048)) : 0;
        const footerTextH = (cfg.footerText && cfg.footerText.trim()) ? (fSmall + 8) : 0;
        const codBoxH = Math.max(68, Math.round(H * 0.145));
        const bottomReservedH = codBoxH + promoBarH + footerTextH + 12;

        const tableMaxH = Math.max(60, H - curY - bottomReservedH - pad - innerMargin);
        const thH = Math.max(24, Math.round(H * 0.045));

        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft, curY, innerWidth, thH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = 'right';
        const bagHeaderSuffix = bagsTotal > 1 ? ` — [شنطة ${bagIndex} من ${bagsTotal}]` : '';
        ctx.fillText(`الصنف المطلوب (الإجمالي: ${Number(totalUnitsCount.toFixed(1))})${bagHeaderSuffix}`, innerRight - 10, curY + thH / 2);

        const qtyColW = Math.round(innerWidth * 0.18);
        const priceColW = cfg.showItemsPrice !== false ? Math.round(innerWidth * 0.22) : 0;
        const qtyColCenter = innerLeft + priceColW + (qtyColW / 2);

        ctx.textAlign = 'center';
        ctx.fillText('الكمية', qtyColCenter, curY + thH / 2);
        if (cfg.showItemsPrice !== false) {
            ctx.fillText('السعر', innerLeft + (priceColW / 2), curY + thH / 2);
        }

        let rowY = curY + thH;
        const maxRows = Math.max(1, Math.min(itemsList.length || 1, 6));
        const notesText = [
            order.driverNote ? order.driverNote.split('\n---\n').pop() : '',
            (!order.driverNote && order.adminNote) ? order.adminNote.split('\n---\n').pop() : ''
        ].filter(Boolean).join(' | ');

        const noteBoxReserve = notesText ? Math.max(24, Math.round(H * 0.046)) : 0;
        const availableRowsH = Math.max(thH, tableMaxH - thH - noteBoxReserve);
        const rowH = Math.min(Math.round(H * 0.054), Math.max(22, Math.floor(availableRowsH / maxRows)));

        ctx.fillStyle = '#000000';
        ctx.lineWidth = 2;
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        for (let idx = 0; idx < maxRows; idx++) {
            const item = itemsList[idx];
            if (!item) break;
            ctx.strokeRect(innerLeft, rowY, innerWidth, rowH);

            ctx.beginPath();
            ctx.moveTo(innerLeft + priceColW + qtyColW, rowY);
            ctx.lineTo(innerLeft + priceColW + qtyColW, rowY + rowH);
            if (cfg.showItemsPrice !== false) {
                ctx.moveTo(innerLeft + priceColW, rowY);
                ctx.lineTo(innerLeft + priceColW, rowY + rowH);
            }
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            const pInfo = prodsObj[item.id] || {};
            const weightBadge = (cfg.showWeightInfo !== false && pInfo.weight) ? ` (${pInfo.weight})` : '';
            let itemLabel = (item.name || 'صنف') + weightBadge;
            if (idx === maxRows - 1 && itemsList.length > maxRows) {
                itemLabel += ` (+${itemsList.length - maxRows} أخرى)`;
            }
            ctx.fillText(itemLabel.slice(0, 38), innerRight - 8, rowY + rowH / 2);

            ctx.textAlign = 'center';
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(String(item.quantity), qtyColCenter, rowY + rowH / 2);

            if (cfg.showItemsPrice !== false) {
                const linePrice = Math.round((Number(item.quantity) || 0) * (Number(item.price) || 0));
                ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(`${linePrice} ج`, innerLeft + (priceColW / 2), rowY + rowH / 2);
            }
            rowY += rowH;
        }

        if (notesText) {
            rowY += 4;
            const nH = Math.max(22, noteBoxReserve - 4);
            ctx.strokeRect(innerLeft, rowY, innerWidth, nH);
            ctx.textAlign = 'right';
            ctx.font = `900 ${Math.round(fSmall * 0.92)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`ملاحظة: ${notesText.slice(0, 56)}`, innerRight - 8, rowY + nH / 2);
        }

        // 4. الصندوق المالي السفلي + برواز الدعاية والعروض + الفوتر
        let bottomCursorY = H - pad - innerMargin - bottomReservedH + 6;

        const isOnline = order.paymentMethod === 'online';
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const delivery = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const total = Number(order.total) || 0;
        const debt = Number(order.debt) || 0;

        ctx.lineWidth = 3.5;
        ctx.strokeRect(innerLeft, bottomCursorY, innerWidth, codBoxH);

        const codHeaderH = Math.round(codBoxH * 0.58);
        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft, bottomCursorY, innerWidth, codHeaderH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'حالة الفاتورة:' : 'المطلوب تحصيله من العميل:', innerRight - 12, bottomCursorY + codHeaderH / 2);

        ctx.textAlign = 'left';
        ctx.font = `900 ${Math.round(fTitle * 1.05)}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'خالص أونلاين (0 ج)' : `${total} ج.م`, innerLeft + 12, bottomCursorY + codHeaderH / 2);

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        let breakdownStr = `المنتجات: ${subtotal} ج  •  التوصيل: ${delivery} ج`;
        if (discount > 0) breakdownStr += `  •  خصم: ${discount} ج`;
        if (debt > 0) breakdownStr += `  •  آجل: ${debt} ج`;
        ctx.fillText(breakdownStr, W / 2, bottomCursorY + codHeaderH + (codBoxH - codHeaderH) / 2);

        bottomCursorY += codBoxH + 5;

        // شريط الدعاية والعروض الترويجي
        if (hasPromo) {
            const pH = promoBarH - 4;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(innerLeft, bottomCursorY, innerWidth, pH);
            ctx.setLineDash([]);
            ctx.font = `900 ${Math.round(fSmall * 0.92)}px Cairo, Tahoma, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cfg.promoText.trim().slice(0, 70), W / 2, bottomCursorY + pH / 2);
        }

        // سطر الفوتر السفلي
        if (cfg.footerText && cfg.footerText.trim()) {
            ctx.font = `900 ${Math.round(fSmall * 0.88)}px Cairo, Tahoma, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(cfg.footerText.trim(), W / 2, H - pad - Math.max(4, Math.floor(innerMargin * 0.35)));
        }

        ctx.restore();
        return canvas;
    };

    function renderDriverSummaryToCanvas203DPI(ordersList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        const pad = 22;
        drawCustomFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, cfg.borderStyle || 'double');

        let totalCash = 0;
        let onlineCount = 0;
        const itemsSum = {};
        ordersList.forEach(o => {
            if (o.paymentMethod === 'online') onlineCount++;
            else totalCash += (Number(o.total) || 0);
            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    itemsSum[i.name] = (itemsSum[i.name] || 0) + (Number(i.quantity) || 0);
                });
            }
        });

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.font = '900 30px Cairo, Tahoma, sans-serif';
        ctx.fillText('ملخص استلام خط سير المندوب', W / 2, pad + 42);

        ctx.textAlign = 'right';
        ctx.font = '900 22px Cairo, Tahoma, sans-serif';
        ctx.fillText(`إجمالي الطلبات: ${ordersList.length} طلب (${ordersList.length - onlineCount} كاش / ${onlineCount} أونلاين)`, W - pad - 20, pad + 95);

        let y = pad + 140;
        Object.keys(itemsSum).slice(0, 10).forEach(k => {
            ctx.fillText(`• ${itemsSum[k]}x ${k}`, W - pad - 25, y);
            y += 34;
        });

        ctx.fillRect(pad + 16, H - pad - 85, W - (pad + 16) * 2, 68);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = '900 28px Cairo, Tahoma, sans-serif';
        ctx.fillText(`إجمالي الكاش المطلوب توريده: ${totalCash.toLocaleString()} ج.م`, W / 2, H - pad - 44);
        return canvas;
    }

    function buildAllCanvasesForQueue(ordersToPrint, cfg) {
        const copies = Math.max(1, parseInt(cfg.copies) || 1);
        const globalBags = Math.max(1, parseInt(cfg.bagsCount) || 1);
        const canvases = [];

        ordersToPrint.forEach((o, idx) => {
            const orderBags = Math.max(1, parseInt(o._bagsCount) || globalBags);
            for (let c = 0; c < copies; c++) {
                for (let b = 1; b <= orderBags; b++) {
                    canvases.push(window.renderWaybillToCanvas203DPI(o, cfg, idx + 1, ordersToPrint.length, b, orderBags));
                }
            }
        });

        if (cfg.includeRouteSummary && ordersToPrint.length > 1) {
            canvases.push(renderDriverSummaryToCanvas203DPI(ordersToPrint, cfg));
        }
        return canvases;
    }

    // =========================================================================
    // 📡 4. تحويل الـ Canvas إلى لغة الهاردوير TSPL BITMAP لطابعة Deli E750W
    // =========================================================================
    window.generateDeliTSPLHeader = function (cfg) {
        const dims = resolveDimensionsMm(cfg);
        const density = Math.min(15, Math.max(1, parseInt(cfg.density) || 12));
        const speed = Math.min(6, Math.max(2, parseInt(cfg.speed) || 4));
        const dir = cfg.direction ? 1 : 0;
        const gap = Math.max(0, parseFloat(cfg.gapMm) || 2);

        let sensorCmd = `GAP ${gap} mm,0 mm`;
        if (cfg.sensorType === 'continuous') sensorCmd = `GAP 0 mm,0 mm`;
        else if (cfg.sensorType === 'bmark') sensorCmd = `BLINE ${gap} mm,0 mm`;

        return [
            `SIZE ${dims.w} mm,${dims.h} mm`,
            sensorCmd,
            `SPEED ${speed}`,
            `DENSITY ${density}`,
            `DIRECTION ${dir},0`,
            `REFERENCE 0,0`,
            `SET TEAR ON`,
            `CLS`
        ].join('\r\n') + '\r\n';
    };

    function convertCanvasToTSPLPacket(canvas, cfg) {
        const widthDots = canvas.width;
        const heightDots = canvas.height;
        const widthBytes = Math.ceil(widthDots / 8);
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, widthDots, heightDots).data;

        const invert = cfg.invertBitmap === true;
        const bitmapBytes = new Uint8Array(widthBytes * heightDots);
        bitmapBytes.fill(invert ? 0x00 : 0xFF);

        const threshold = cfg.density >= 12 ? 190 : 160;
        for (let y = 0; y < heightDots; y++) {
            for (let x = 0; x < widthDots; x++) {
                const idx = (y * widthDots + x) * 4;
                const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                if (lum < threshold) {
                    const byteIdx = y * widthBytes + Math.floor(x / 8);
                    const bitPos = 7 - (x % 8);
                    if (invert) {
                        bitmapBytes[byteIdx] |= (1 << bitPos);
                    } else {
                        bitmapBytes[byteIdx] &= ~(1 << bitPos);
                    }
                }
            }
        }

        const encoder = new TextEncoder();
        const headerBytes = encoder.encode(
            window.generateDeliTSPLHeader(cfg) +
            `BITMAP 0,0,${widthBytes},${heightDots},0,`
        );
        const footerBytes = encoder.encode(`\r\nPRINT 1,1\r\n`);

        const packet = new Uint8Array(headerBytes.length + bitmapBytes.length + footerBytes.length);
        packet.set(headerBytes, 0);
        packet.set(bitmapBytes, headerBytes.length);
        packet.set(footerBytes, headerBytes.length + bitmapBytes.length);
        return packet;
    }

    function buildCombinedBase64TSPL(ordersToPrint, cfg) {
        const canvases = buildAllCanvasesForQueue(ordersToPrint, cfg);
        let totalLen = 0;
        const packets = canvases.map(cnv => {
            const p = convertCanvasToTSPLPacket(cnv, cfg);
            totalLen += p.length;
            return p;
        });

        const combined = new Uint8Array(totalLen);
        let offset = 0;
        packets.forEach(p => {
            combined.set(p, offset);
            offset += p.length;
        });
        return uint8ArrayToBase64(combined);
    }

    // =========================================================================
    // 🔵 5. الربط المباشر مع جسر الـ APK الداخلي (window.SmanNativePrinter)
    // =========================================================================

    // فحص وجلب طابعات البلوتوث المقترنة في الهاتف عبر جسر الـ APK الأصلي
    window.scanAndLoadNativePairedPrinters = function (showFeedback = true) {
        if (!isNativeApkBridgeAvailable()) {
            if (showFeedback) {
                alert('⚠️ الجسر الأصلي (SmanNativePrinter) يعمل داخل تطبيق الأندرويد (APK) الخاص بك. إذا كنت تفتح من الكمبيوتر يمكنك استخدام زر طباعة النظام (Spooler).');
            }
            return [];
        }

        try {
            const rawRes = window.SmanNativePrinter.getPairedDevicesJson();

            if (rawRes === 'PERMISSION_REQUIRED') {
                if (showFeedback) {
                    notifyPrinterToast('🔓 يرجى الضغط على "سماح / Allow" لإذن البلوتوث الذي ظهر على الشاشة الآن ثم اضغط تحديث.');
                }
                return [];
            }

            if (rawRes === 'BLUETOOTH_OFF') {
                if (showFeedback) {
                    notifyPrinterToast('🔵 يرجى الموافقة على تشغيل البلوتوث في هاتفك ثم اضغط تحديث.');
                }
                return [];
            }

            if (rawRes === 'NO_BLUETOOTH' || String(rawRes).startsWith('ERROR:')) {
                if (showFeedback) alert('تنبيه البلوتوث: ' + rawRes);
                return [];
            }

            const list = JSON.parse(rawRes || '[]');
            window.deliPrinterConnection.pairedDevices = Array.isArray(list) ? list : [];
            populateNativePrinterSelectDropdown();

            if (showFeedback) {
                if (window.deliPrinterConnection.pairedDevices.length === 0) {
                    alert('📲 البلوتوث جاهز ومفعل!\n\nلم يتم العثور على طابعة مقترنة في قائمة بلوتوث الهاتف حتى الآن. افتح إعدادات البلوتوث في موبايلك واقترن بطابعة (Deli E750W) لمرة واحدة فقط، ثم اضغط "تحديث الطابعات" هنا.');
                } else {
                    notifyPrinterToast(`✅ تم العثور على (${window.deliPrinterConnection.pairedDevices.length}) جهاز بلوتوث مقترن جاهز للطباعة!`);
                }
            }
            return window.deliPrinterConnection.pairedDevices;
        } catch (e) {
            console.error('Native Bluetooth scan error:', e);
            return [];
        }
    };

    function populateNativePrinterSelectDropdown() {
        const sel = document.getElementById('dw-native-printer-select');
        if (!sel) return;
        const cfg = window.getWaybillConfig();
        const devices = window.deliPrinterConnection.pairedDevices || [];

        let html = `<option value="AUTO">🤖 اختيار تلقائي ذكي (Deli E750W)</option>`;
        let autoMatchedMac = null;

        devices.forEach(d => {
            const nm = (d.name || 'طابعة بلوتوث').trim();
            const addr = (d.address || '').trim();
            const lower = nm.toLowerCase();
            if (!autoMatchedMac && (lower.includes('deli') || lower.includes('750') || lower.includes('printer') || lower.includes('label'))) {
                autoMatchedMac = addr;
            }
            const isSelected = (cfg.selectedMac === addr) || (cfg.selectedMac === 'AUTO' && autoMatchedMac === addr);
            html += `<option value="${addr}" ${isSelected ? 'selected' : ''}>🖨️ ${nm} (${addr})</option>`;
        });

        sel.innerHTML = html;
        if (autoMatchedMac && (!cfg.selectedMac || cfg.selectedMac === 'AUTO')) {
            sel.value = autoMatchedMac;
        }
        updateConnectionBadgesUI();
    }

    // الطباعة الفورية المباشرة عبر بلوتوث الـ APK الأصلي (window.SmanNativePrinter.printRawBase64Bluetooth)
    window.printDirectViaNativeBluetooth = async function (ordersQueue = null, customCfg = null) {
        if (window.deliPrinterConnection.isPrinting) return;
        const cfg = customCfg || window.getWaybillConfig();
        const queue = (ordersQueue && ordersQueue.length > 0)
            ? ordersQueue
            : ((window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
                ? window.deliPrinterConnection.lastOrdersQueue
                : [getSampleOrderForPreview()]);

        if (!isNativeApkBridgeAvailable()) {
            // إذا كان فاتح من الكمبيوتر يطبع بالسبولر المباشر
            return window.printViaInPageThermalFrame(queue, cfg);
        }

        const btn = document.getElementById('dw-btn-direct-ble');
        const origHtml = btn ? btn.innerHTML : '';
        window.deliPrinterConnection.isPrinting = true;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال البوليصة بالبلوتوث للطابعة...';
        }

        await new Promise(r => setTimeout(r, 60));

        try {
            const base64Payload = buildCombinedBase64TSPL(queue, cfg);
            const targetMac = document.getElementById('dw-native-printer-select')?.value || cfg.selectedMac || 'AUTO';
            const res = window.SmanNativePrinter.printRawBase64Bluetooth(targetMac, base64Payload);

            if (String(res).startsWith('OK:')) {
                const printerName = String(res).slice(3);
                notifyPrinterToast(`✅ تمت الطباعة المباشرة بنجاح على (${printerName})!`);
            } else if (res === 'PERMISSION_REQUIRED') {
                alert('🔓 يرجى الموافقة على صلاحية البلوتوث التي ظهرت على الشاشة الآن ثم اضغط طباعة مرة أخرى.');
            } else if (res === 'BLUETOOTH_OFF') {
                window.SmanNativePrinter.getPairedDevicesJson();
                alert('🔵 البلوتوث مغلق في هاتفك! وافق على تشغيله ثم اضغط طباعة.');
            } else if (res === 'NO_PAIRED_PRINTER') {
                alert('⚠️ لم يتم العثور على طابعة مقترنة!\nافتح إعدادات البلوتوث في هاتفك واقترن بطابعة Deli E750W أولاً.');
            } else {
                alert('⚠️ تعذر الاتصال بالطابعة (' + res + ').\nتأكد أن طابعة Deli E750W مفتوحة وفي نطاق البلوتوث.');
            }
        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء الإرسال للطابعة: ' + err.message);
        } finally {
            window.deliPrinterConnection.isPrinting = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    // الطباعة الفورية المباشرة عبر كابل الـ USB من داخل الـ APK (window.SmanNativePrinter.printRawBase64Usb)
    window.printDirectViaNativeUSB = async function () {
        const cfg = readStudioInputsToConfig();
        persistWaybillConfig(cfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];

        if (!isNativeApkBridgeAvailable() || typeof window.SmanNativePrinter.printRawBase64Usb !== 'function') {
            return window.printViaInPageThermalFrame(queue, cfg);
        }

        try {
            const base64Payload = buildCombinedBase64TSPL(queue, cfg);
            const res = window.SmanNativePrinter.printRawBase64Usb(base64Payload);
            if (String(res).startsWith('OK:')) {
                notifyPrinterToast('🔌 تمت الطباعة المباشرة عبر كابل الـ USB بنجاح!');
            } else if (res === 'USB_PERMISSION_REQUESTED') {
                notifyPrinterToast('🔓 اضغط "موافق" على نافذة إذن الـ USB التي ظهرت على الشاشة ثم اضغط زر USB مرة أخرى.');
            } else if (res === 'NO_USB_DEVICE') {
                alert('🔌 لم يتم اكتشاف طابعة متصلة بكابل الـ USB (تأكد من توصيل الكابل ووصلة الـ OTG).');
            } else {
                alert('تنبيه USB: ' + res);
            }
        } catch (e) {
            alert('خطأ USB: ' + e.message);
        }
    };

    // أوامر معايرة الحساس وسحب الورق المباشرة عبر SmanNativePrinter
    window.sendDeliHardwareCommand = function (cmdType) {
        const cfg = readStudioInputsToConfig();
        const dims = resolveDimensionsMm(cfg);
        let tsplCmd = '';
        if (cmdType === 'calibrate') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nGAP ${cfg.gapMm || 2} mm,0 mm\r\nHOME\r\nSOUND 2,100\r\n`;
        } else if (cmdType === 'feed') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nFORMFEED\r\n`;
        }
        const bytes = new TextEncoder().encode(tsplCmd);
        const base64Cmd = uint8ArrayToBase64(bytes);

        if (isNativeApkBridgeAvailable()) {
            const targetMac = document.getElementById('dw-native-printer-select')?.value || cfg.selectedMac || 'AUTO';
            const res = window.SmanNativePrinter.printRawBase64Bluetooth(targetMac, base64Cmd);
            if (String(res).startsWith('OK:')) {
                notifyPrinterToast('⚡ تم تنفيذ الأمر مباشرة على طابعة Deli E750W');
            } else {
                window.scanAndLoadNativePairedPrinters(true);
            }
        } else {
            alert('أوامر الهاردوير المباشرة تعمل تلقائياً من داخل تطبيق الأندرويد (APK).');
        }
    };

    // =========================================================================
    // 🖨️ 6. محرك طباعة النظام (Android PrintManager & Windows Spooler)
    // =========================================================================
    window.printViaInPageThermalFrame = function (ordersToPrint, customCfg = null) {
        if (!ordersToPrint || ordersToPrint.length === 0) return alert('لا توجد طلبات للطباعة!');
        const cfg = customCfg || window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const canvases = buildAllCanvasesForQueue(ordersToPrint, cfg);

        let printMount = document.getElementById('deli-direct-print-mount');
        if (printMount) printMount.remove();

        printMount = document.createElement('div');
        printMount.id = 'deli-direct-print-mount';

        let printStyle = document.getElementById('deli-direct-print-style');
        if (printStyle) printStyle.remove();

        printStyle = document.createElement('style');
        printStyle.id = 'deli-direct-print-style';
        printStyle.innerHTML = `
            #deli-direct-print-mount { display: none; }
            @media print {
                @page {
                    size: ${dims.w}mm ${dims.h}mm;
                    margin: 0mm !important;
                }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    overflow: visible !important;
                    height: auto !important;
                }
                body > *:not(#deli-direct-print-mount) {
                    display: none !important;
                }
                #deli-direct-print-mount {
                    display: block !important;
                    width: ${dims.w}mm !important;
                }
                .deli-print-page-img {
                    width: ${dims.w}mm !important;
                    height: ${dims.h}mm !important;
                    display: block !important;
                    page-break-after: always !important;
                    break-after: page !important;
                }
                .deli-print-page-img:last-child {
                    page-break-after: auto !important;
                    break-after: auto !important;
                }
            }
        `;
        document.head.appendChild(printStyle);

        canvases.forEach(cnv => {
            const img = document.createElement('img');
            img.src = cnv.toDataURL('image/png');
            img.className = 'deli-print-page-img';
            printMount.appendChild(img);
        });

        document.body.appendChild(printMount);

        setTimeout(() => {
            // إذا كنا داخل الـ APK نستدعي PrintManager الأصلي للأندرويد
            if (isNativeApkBridgeAvailable() && typeof window.SmanNativePrinter.triggerAndroidSystemPrint === 'function') {
                window.SmanNativePrinter.triggerAndroidSystemPrint('Sman_Hehya_Waybill');
            } else {
                window.print();
            }
        }, 250);
    };

    function updateConnectionBadgesUI() {
        const btStatus = document.getElementById('deli-bt-status-badge');
        if (!btStatus) return;

        if (isNativeApkBridgeAvailable()) {
            const count = (window.deliPrinterConnection.pairedDevices || []).length;
            btStatus.className = 'bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = count > 0
                ? `🟢 جسر الـ APK الأصلي متصل (${count} طابعة مقترنة)`
                : `🟢 جسر الـ APK الأصلي جاهز للطباعة المباشرة`;
        } else {
            btStatus.className = 'bg-sky-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = '💻 وضع المتصفح / الكمبيوتر المباشر';
        }
    }

    // =========================================================================
    // 🎛️ 7. نافذة استوديو البوليصة الشاملة (تعديل الأصناف + الشنط + المقاسات + الاستيكر الحر + الدعاية)
    // =========================================================================
    window.deliStudioActiveSubTab = 'order_bags'; // 'order_bags' | 'size_design' | 'hardware'
    window.deliPreviewOrderIndex = 0;
    window.deliPreviewBagNumber = 1;

    function ensureDeliStudioModalExists() {
        let modal = document.getElementById('deli-waybill-studio-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'deli-waybill-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[210] hidden flex items-center justify-center p-1.5 sm:p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200">
                <!-- الهيدر -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-3.5 sm:p-4 flex flex-wrap justify-between items-center gap-2 shrink-0">
                    <div class="flex items-center gap-2.5">
                        <div class="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-lg shrink-0">
                            <i class="fa-solid fa-print"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="font-black text-xs sm:text-base text-white">استوديو الطباعة الحرارية الذكي (Deli E750W)</h3>
                                <span id="deli-bt-status-badge" class="bg-emerald-400 text-slate-950 px-2.5 py-0.5 rounded-lg text-[10px] font-black">🟢 جسر الـ APK متصل</span>
                            </div>
                            <p class="text-[10px] text-slate-300 font-bold mt-0.5">تعديل الكميات والشنط • تحكم حر في المقاسات والبراويز والدعاية • طباعة بلوتوث مباشر</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="const ids=(window.deliPrinterConnection.lastOrdersQueue||[]).map(o=>o.id).filter(Boolean).join(','); window.location.href='printer.html'+(ids?'?orderIds='+ids:'');" class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 shadow-sm" title="فتح صفحة الطابعة المستقلة الكاملة">
                            <i class="fa-solid fa-up-right-from-square"></i> استوديو الطوارئ الشامل
                        </button>
                        <button type="button" onclick="scanAndLoadNativePairedPrinters(true)" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 shadow-sm">
                            <i class="fa-brands fa-bluetooth-b"></i> تحديث الطابعات
                        </button>
                        <button type="button" onclick="closeDeliStudioModal()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all">
                            <i class="fa-solid fa-xmark text-base"></i>
                        </button>
                    </div>

                </div>

                <!-- شريط اختيار نوع الاستيكر والتبويبات السريعة -->
                <div class="bg-slate-100 px-3 sm:px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[11px] font-black text-slate-500 ml-1">نوع الملصق:</span>
                        <button type="button" onclick="switchDeliTemplateMode('shipping')" id="dw-mode-btn-shipping" class="px-3 py-1.5 rounded-xl text-xs font-black bg-brand-primary text-white shadow-sm transition-all">📦 بوليصة شحن أوردر</button>
                        <button type="button" onclick="switchDeliTemplateMode('product_tag')" id="dw-mode-btn-product_tag" class="px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all">🏷️ استيكر طبق / فريزر</button>
                        <button type="button" onclick="switchDeliTemplateMode('free_custom')" id="dw-mode-btn-free_custom" class="px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all">✍️ استيكر كتابة حرة</button>
                        <input type="hidden" id="dw-template-mode" value="shipping">
                    </div>

                    <div class="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                        <button type="button" onclick="switchDeliStudioSubTab('order_bags')" id="dw-tab-btn-order_bags" class="px-2.5 py-1 rounded-lg text-[11px] font-black bg-slate-900 text-white transition-all">✏️ الكميات والشنط والكتابة</button>
                        <button type="button" onclick="switchDeliStudioSubTab('size_design')" id="dw-tab-btn-size_design" class="px-2.5 py-1 rounded-lg text-[11px] font-black text-slate-600 hover:bg-slate-100 transition-all">📐 المقاسات والبراويز والدعاية</button>
                        <button type="button" onclick="switchDeliStudioSubTab('hardware')" id="dw-tab-btn-hardware" class="px-2.5 py-1 rounded-lg text-[11px] font-black text-slate-600 hover:bg-slate-100 transition-all">⚙️ إعدادات الحبر والحساس</button>
                    </div>
                </div>

                <!-- جسم الاستوديو -->
                <div class="flex-1 overflow-y-auto custom-scroll p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50">
                    
                    <!-- العمود الأيسر: المعاينة الحية وأزرار الطباعة المباشرة (5 أعمدة) -->
                    <div class="lg:col-span-5 lg:order-2 flex flex-col justify-between bg-slate-200/80 rounded-2xl p-3.5 border border-slate-300">
                        <div>
                            <div class="flex flex-wrap justify-between items-center gap-1 mb-2">
                                <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-eye text-brand-primary ml-1"></i> المعاينة الحية (إجمالي: <span id="dw-queue-count-badge">1</span> ملصق)</span>
                                <span id="dw-dims-badge" class="bg-slate-900 text-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">100×100 مم (800×800px)</span>
                            </div>

                            <!-- شريط تقليب الطلبات عند تحديد أكثر من طلب للطباعة -->
                            <div id="dw-order-queue-switcher" class="hidden mb-2 flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-black text-slate-800"></div>

                            <!-- أزرار التبديل بين معاينة الشنطة الأولى والثانية إن وجد أكثر من شنطة -->
                            <div id="dw-bag-preview-switcher" class="hidden mb-2 flex flex-wrap items-center justify-center gap-1 bg-slate-800 text-white p-1.5 rounded-xl text-[10px] font-black"></div>

                            <div id="dw-live-preview-stage" class="bg-white rounded-2xl shadow-inner border border-slate-300 p-2 flex items-center justify-center overflow-auto min-h-[270px] max-h-[350px]"></div>
                        </div>

                        <!-- اختيار الطابعة المقترنة + أزرار الطباعة المباشرة -->
                        <div class="space-y-2 mt-3 pt-3 border-t border-slate-300">
                            <div class="flex items-center gap-1.5">
                                <select id="dw-native-printer-select" onchange="onDeliStudioInputChange()" class="flex-1 border border-slate-300 rounded-xl p-2 text-xs font-black text-slate-800 bg-white outline-none">
                                    <option value="AUTO">🤖 اختيار تلقائي ذكي (Deli E750W)</option>
                                </select>
                                <button type="button" onclick="scanAndLoadNativePairedPrinters(true)" class="bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-black" title="إعادة فحص بلوتوث الهاتف">
                                    <i class="fa-solid fa-rotate"></i>
                                </button>
                            </div>

                            <button type="button" id="dw-btn-direct-ble" onclick="triggerDirectHardwarePrintBtn()" class="w-full bg-brand-primary hover:bg-emerald-800 text-white font-black py-3 rounded-2xl text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2 active:scale-95">
                                <i class="fa-solid fa-bolt text-amber-300 text-base"></i>
                                <span>⚡ اطبع الآن بالبلوتوث المباشر (Deli E750W)</span>
                            </button>

                            <div class="grid grid-cols-3 gap-1.5">
                                <button type="button" onclick="printDirectViaNativeUSB()" class="bg-cyan-700 hover:bg-cyan-800 text-white font-black py-2 px-2 rounded-xl text-[11px] shadow-sm transition-all flex items-center justify-center gap-1">
                                    <i class="fa-brands fa-usb"></i> طباعة USB
                                </button>
                                <button type="button" onclick="triggerStudioMainPrint()" class="bg-slate-900 hover:bg-slate-800 text-white font-black py-2 px-2 rounded-xl text-[11px] shadow-sm transition-all flex items-center justify-center gap-1">
                                    <i class="fa-solid fa-print text-amber-400"></i> Spooler
                                </button>
                                <button type="button" onclick="saveWaybillSettings()" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black py-2 px-2 rounded-xl text-[11px] shadow-sm transition-all flex items-center justify-center gap-1">
                                    <i class="fa-solid fa-floppy-disk text-brand-primary"></i> حفظ الإعداد
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- العمود الأيمن: التبويبات الثلاثة المرنة (7 أعمدة) -->
                    <div class="lg:col-span-7 lg:order-1 space-y-4">

                        <!-- ========================================================= -->
                        <!-- التبويب 1: تعديل الشنط والأصناف والكميات والكتابة المخصصة -->
                        <!-- ========================================================= -->
                        <div id="dw-subtab-order_bags" class="space-y-4">
                            
                            <!-- أ) صندوق ترقيم الشنط والأكياس المتعددة (شنطة 1 من 2) -->
                            <div id="dw-bags-control-card" class="bg-gradient-to-l from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-md space-y-3">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h4 class="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                            <i class="fa-solid fa-bag-shopping"></i> نظام تقسيم وترقيم الشنط للأوردر
                                        </h4>
                                        <p class="text-[10px] text-slate-300 font-bold mt-0.5">لو العميل واخد شنطتين، خلّي العدد (2) وهيطبعلك استيكر (شنطة 1 من 2) واستيكر (شنطة 2 من 2) تلقائياً!</p>
                                    </div>
                                    <div class="flex items-center gap-2 bg-white/10 p-1.5 rounded-xl border border-white/15">
                                        <button type="button" onclick="stepStudioBagsCount(-1)" class="w-8 h-8 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-black text-base">-</button>
                                        <div class="text-center px-2">
                                            <input type="number" id="dw-bags-count" min="1" max="20" value="1" oninput="onStudioBagsManualInput(this.value)" class="w-12 bg-transparent text-center font-black text-lg text-amber-300 outline-none">
                                            <span class="block text-[9px] text-slate-300 font-bold">شنطة</span>
                                        </div>
                                        <button type="button" onclick="stepStudioBagsCount(1)" class="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-base">+</button>
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/10">
                                    <input type="text" id="dw-bag-custom-label" placeholder="وصف اختياري بجانب الشنطة (مثال: مجمد / فريش)" oninput="onDeliStudioInputChange()" class="bg-slate-800 border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none">
                                    <label class="flex items-center gap-2 text-[11px] font-black text-emerald-300 cursor-pointer px-2">
                                        <input type="checkbox" id="dw-always-show-bag" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-emerald-400 rounded">
                                        إظهار شارة (شنطة 1 من 1) حتى لو شنطة واحدة
                                    </label>
                                </div>
                            </div>

                            <!-- ب) محرر الأصناف والكميات والأسعار والعميل المباشر (لوضع بوليصة الشحن) -->
                            <div id="dw-shipping-order-editor" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <div class="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-2">
                                    <h4 class="text-xs font-black text-slate-800"><i class="fa-solid fa-cart-flatbed text-brand-primary ml-1"></i> تعديل الأصناف والكميات والبيانات على البوليصة</h4>
                                    <div class="flex gap-1.5">
                                        <button type="button" onclick="addStudioOrderItemRow()" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">+ إضافة صنف للبوليصة</button>
                                        <button type="button" onclick="saveStudioOrderChangesToFirebase()" class="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all" title="حفظ هذه التعديلات في الطلب الأصلي أيضاً">💾 حفظ في الأوردر الأصلي</button>
                                    </div>
                                </div>

                                <!-- قائمة الأصناف التفاعلية (+ / -) -->
                                <div id="dw-live-items-editor-list" class="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1"></div>

                                <!-- تعديل سريع للعميل والعنوان والمطلوب تحصيله -->
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                                    <div class="sm:col-span-2">
                                        <label class="text-[9px] font-black text-slate-400 block mb-0.5">اسم العميل على البوليصة</label>
                                        <input type="text" id="dw-ord-cust-name" oninput="applyLiveOrderMetadataEdit()" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[9px] font-black text-slate-400 block mb-0.5">رقم الموبايل</label>
                                        <input type="text" id="dw-ord-cust-phone" dir="ltr" oninput="applyLiveOrderMetadataEdit()" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-black bg-slate-50 text-center">
                                    </div>
                                    <div>
                                        <label class="text-[9px] font-black text-slate-400 block mb-0.5">المنطقة</label>
                                        <input type="text" id="dw-ord-zone" oninput="applyLiveOrderMetadataEdit()" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-black bg-slate-50 text-center">
                                    </div>
                                    <div class="sm:col-span-2">
                                        <label class="text-[9px] font-black text-slate-400 block mb-0.5">العنوان التفصيلي</label>
                                        <input type="text" id="dw-ord-address" oninput="applyLiveOrderMetadataEdit()" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-bold bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[9px] font-black text-emerald-700 block mb-0.5">💰 الصافي المطلوب (ج)</label>
                                        <input type="number" id="dw-ord-total" oninput="applyLiveOrderMetadataEdit(true)" class="w-full border border-emerald-300 rounded-lg p-1.5 text-xs font-black bg-emerald-50 text-emerald-900 text-center">
                                    </div>
                                    <div>
                                        <label class="text-[9px] font-black text-slate-400 block mb-0.5">حالة الدفع</label>
                                        <select id="dw-ord-payment" onchange="applyLiveOrderMetadataEdit()" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-black bg-slate-50">
                                            <option value="cash">💵 تحصيل كاش</option>
                                            <option value="online">💳 خالص أونلاين (0 ج)</option>
                                        </select>
                                    </div>
                                    <div class="col-span-2 sm:col-span-4">
                                        <label class="text-[9px] font-black text-amber-700 block mb-0.5">⚠️ ملاحظة للمندوب / على البوليصة</label>
                                        <input type="text" id="dw-ord-note" oninput="applyLiveOrderMetadataEdit()" placeholder="اكتب أي ملاحظة تريد ظهورها على البوليصة..." class="w-full border border-amber-200 rounded-lg p-1.5 text-xs font-bold bg-amber-50/40">
                                    </div>
                                </div>
                            </div>

                            <!-- ج) محرر استيكر طبق السمان والفريزر -->
                            <div id="dw-product-tag-editor" class="hidden bg-white p-4 rounded-2xl border border-teal-200 shadow-sm space-y-3">
                                <h4 class="text-xs font-black text-teal-800 border-b border-teal-100 pb-2"><i class="fa-solid fa-tag ml-1"></i> تخصيص استيكر طبق السمان / الفريزر</h4>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">اسم الصنف / الطبق</label>
                                        <input type="text" id="dw-tag-prod-name" placeholder="مثال: 1x طبق سمان جامبو ملكي" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">الوزن أو العدد داخل الطبق</label>
                                        <input type="text" id="dw-tag-weight" placeholder="مثال: وزن صافي 900 جرام - 4 جوز" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">تاريخ الذبح / الصلاحية</label>
                                        <input type="text" id="dw-tag-date" placeholder="مثال: إنتاج اليوم - صالح لمدة 3 شهور" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">السعر على الطبق (اختياري - اتركه فارغاً لإخفائه)</label>
                                        <input type="text" id="dw-tag-price" placeholder="مثال: 145 ج.م" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                </div>
                            </div>

                            <!-- د) محرر الاستيكر الحر (اكتب أي كلام على أي مقاس) -->
                            <div id="dw-free-custom-editor" class="hidden bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm space-y-3">
                                <h4 class="text-xs font-black text-indigo-800 border-b border-indigo-100 pb-2"><i class="fa-solid fa-pen-nib ml-1"></i> كتابة استيكر حر على أي مقاس تختاره</h4>
                                <div class="space-y-2.5">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">السطر الأول (عنوان عريض بالأعلى)</label>
                                        <input type="text" id="dw-free-line1" value="سمان ههيا الفريش" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">السطر الثاني (النص الرئيسي بالمنتصف - يقبل جمل طويلة)</label>
                                        <input type="text" id="dw-free-line2" value="سمان جامبو وملكي طازج يومياً" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">السطر الثالث (تفاصيل / أرقام تليفون)</label>
                                        <input type="text" id="dw-free-line3" value="للحجز والتوصيل: 01208027294" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">شريط أسود بارز بالأسفل (اختياري)</label>
                                        <input type="text" id="dw-free-badge" placeholder="مثال: عرض خاص لفترة محدودة!" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- ========================================================= -->
                        <!-- التبويب 2: المقاسات الحرة، البراويز، الدعاية، والفوتر -->
                        <!-- ========================================================= -->
                        <div id="dw-subtab-size_design" class="hidden space-y-4">
                            
                            <!-- التحكم المرن في المقاسات بالمللي والخط والإزاحة -->
                            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-ruler-combined text-brand-primary ml-1"></i> اختر مقاساً جاهزاً أو اكتب العرض والطول بالمليمتر بحرية</h4>
                                
                                <div class="flex flex-wrap gap-1.5" id="dw-preset-btns-wrap">
                                    <button type="button" data-preset="70x130" onclick="applyQuickSizePreset('70x130', 70, 130)" class="dw-preset-btn bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[11px] font-black transition-all">⭐ 7×13 سم (فاتورة 70×130)</button>
                                    <button type="button" data-preset="100x100" onclick="applyQuickSizePreset('100x100', 100, 100)" class="dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">10×10 سم (100×100)</button>
                                    <button type="button" data-preset="100x150" onclick="applyQuickSizePreset('100x150', 100, 150)" class="dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">10×15 سم (100×150)</button>
                                    <button type="button" data-preset="80x60" onclick="applyQuickSizePreset('80x60', 80, 60)" class="dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">8×6 سم (80×60)</button>
                                    <button type="button" data-preset="70x50" onclick="applyQuickSizePreset('70x50', 70, 50)" class="dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">7×5 سم (70×50)</button>
                                    <button type="button" data-preset="50x30" onclick="applyQuickSizePreset('50x30', 50, 30)" class="dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">5×3 سم (50×30)</button>
                                    <input type="hidden" id="dw-size-preset" value="70x130">
                                </div>


                                <!-- خانات العرض والطول بالمليمتر ظاهرة دائماً للتعديل الحر -->
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-600 block mb-1">العرض (مم) [أقصى 108]</label>
                                        <input type="number" id="dw-width-mm" min="30" max="108" value="100" oninput="onManualDimensionTyped()" class="w-full border-2 border-teal-500/40 rounded-xl p-2 text-center text-xs font-black bg-teal-50/30">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-600 block mb-1">الطول (مم)</label>
                                        <input type="number" id="dw-height-mm" min="20" max="250" value="100" oninput="onManualDimensionTyped()" class="w-full border-2 border-teal-500/40 rounded-xl p-2 text-center text-xs font-black bg-teal-50/30">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-600 block mb-1">تكبير/تصغير الخط (%)</label>
                                        <input type="number" id="dw-font-scale-pct" min="65" max="140" step="5" value="100" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-600 block mb-1">عدد النسخ</label>
                                        <input type="number" id="dw-copies" min="1" max="20" value="1" oninput="onDeliStudioInputChange()" class="w-full border border-emerald-200 rounded-xl p-2 text-center text-xs font-black bg-emerald-50 text-brand-primary">
                                    </div>
                                </div>

                                <div class="grid grid-cols-3 gap-3 pt-1">
                                    <div>
                                        <label class="text-[10px] font-bold text-slate-500 block mb-1">إزاحة يمين/يسار X (مم)</label>
                                        <input type="number" id="dw-offset-x" min="-10" max="10" step="0.5" value="0" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-bold text-slate-500 block mb-1">إزاحة فوق/تحت Y (مم)</label>
                                        <input type="number" id="dw-offset-y" min="-10" max="10" step="0.5" value="0" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-bold text-slate-500 block mb-1">الهامش الداخلي (%)</label>
                                        <input type="number" id="dw-padding-pct" min="40" max="180" step="10" value="100" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                </div>
                            </div>

                            <!-- البراويز والدعاية والفوتر واسم المتجر -->
                            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-500 ml-1"></i> شكل البرواز الخارجي، شريط الدعاية، والفوتر</h4>
                                
                                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">شكل برواز البوليصة</label>
                                        <select id="dw-border-style" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                            <option value="double">▣ برواز ملكي مزدوج (فخم)</option>
                                            <option value="solid">⬛ برواز سميك بارز</option>
                                            <option value="rounded">▢ برواز دائري الحواف</option>
                                            <option value="corners">⌜⌟ برواز أركان مودرن</option>
                                            <option value="dashed">✂️ برواز منقط (كوبون)</option>
                                            <option value="none">⬜ بدون برواز خارجي</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">اسم المتجر بالهيدر</label>
                                        <input type="text" id="dw-custom-store-title" placeholder="سمان ههيا" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">رقم التواصل بالهيدر</label>
                                        <input type="text" id="dw-custom-store-phone" dir="ltr" placeholder="01208027294" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50 text-center">
                                    </div>
                                </div>

                                <!-- شريط الدعاية والعروض -->
                                <div class="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-2">
                                    <div class="flex flex-wrap justify-between items-center gap-2">
                                        <label class="flex items-center gap-2 text-xs font-black text-amber-900 cursor-pointer">
                                            <input type="checkbox" id="dw-show-promo" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded">
                                            تفعيل برواز الدعاية والعروض أسفل الفاتورة
                                        </label>
                                        <select onchange="if(this.value){document.getElementById('dw-promo-text').value=this.value; document.getElementById('dw-show-promo').checked=true; onDeliStudioInputChange(); this.value='';}" class="border border-amber-300 bg-white rounded-lg px-2 py-1 text-[10px] font-black text-amber-900 outline-none">
                                            <option value="">✨ اختر جملة دعائية جاهزة...</option>
                                            <option value="اسأل عن عروض السمان الجامبو وبيض السمان الطازج!">عرض السمان الجامبو والبيض</option>
                                            <option value="احتفظ بالبوليصة! كل 100ج = نقاط كاش باك في محفظتك">دعاية نقاط الولاء والكاش باك</option>
                                            <option value="تربية بيتي وأعلاف طبيعية 100% - ذبح وتجهيز يومي طازج">دعاية الجودة والتربية الطبيعية</option>
                                            <option value="للحجز في الدفعة القادمة كلمنا واتساب: 01208027294">دعاية الحجز بالواتساب</option>
                                        </select>
                                    </div>
                                    <input type="text" id="dw-promo-text" placeholder="اكتب جملة الدعاية أو العرض ليظهر في برواز مميز للعميل..." oninput="onDeliStudioInputChange()" class="w-full border border-amber-300 rounded-xl p-2 text-xs font-black bg-white">
                                </div>

                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">رسالة الفوتر الترحيبية بأسفل البوليصة</label>
                                    <input type="text" id="dw-footer-text" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- التبويب 3: إعدادات هاردوير طابعة Deli E750W والحساس -->
                        <!-- ========================================================= -->
                        <div id="dw-subtab-hardware" class="hidden space-y-4">
                            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <h4 class="text-xs font-black text-slate-800"><i class="fa-solid fa-microchip text-indigo-600 ml-1"></i> إعدادات حرارة الحبر وحساس الاستيكر (Deli E750W TSPL)</h4>
                                    <div class="flex gap-1.5">
                                        <button type="button" onclick="sendDeliHardwareCommand('calibrate')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">🎯 معايرة الحساس</button>
                                        <button type="button" onclick="sendDeliHardwareCommand('feed')" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">⏬ سحب ورقة</button>
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">غمقان الحبر الحراري (1-15)</label>
                                        <input type="number" id="dw-density" min="1" max="15" value="12" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">مسافة الفاصل (Gap مم)</label>
                                        <input type="number" id="dw-gap-mm" min="0" max="10" step="0.5" value="2" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-500 block mb-1">اتجاه خروج الورقة</label>
                                        <select id="dw-direction" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                            <option value="0">0 (الوضع الطبيعي)</option>
                                            <option value="1">1 (مقلوب 180 درجة)</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-black text-slate-700 pt-2">
                                    <label class="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 cursor-pointer">
                                        <input type="checkbox" id="dw-show-logo" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> إظهار اسم المتجر
                                    </label>
                                    <label class="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 cursor-pointer">
                                        <input type="checkbox" id="dw-show-barcode" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> إظهار الباركود
                                    </label>
                                    <label class="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 cursor-pointer">
                                        <input type="checkbox" id="dw-show-prices" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أسعار الأصناف
                                    </label>
                                    <label class="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 cursor-pointer">
                                        <input type="checkbox" id="dw-show-weight" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أوزان الأصناف
                                    </label>
                                    <label class="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 cursor-pointer">
                                        <input type="checkbox" id="dw-invert-bitmap" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-indigo-600 rounded"> عكس ألوان الحبر
                                    </label>
                                    <label class="flex items-center gap-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200 cursor-pointer text-amber-900">
                                        <input type="checkbox" id="dw-route-summary" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded"> ملصق إجمالي للمندوب
                                    </label>
                                </div>

                                <label class="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-200 cursor-pointer mt-2">
                                    <input type="checkbox" id="dw-instant-print" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-emerald-600 rounded">
                                    ⚡ طباعة فورية بضغطة واحدة من كارت الطلب (بدون فتح نافذة المعاينة في كل مرة)
                                </label>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // تحديث لون زر المقاس النشط
    function highlightActivePresetButton(presetKey) {
        document.querySelectorAll('.dw-preset-btn').forEach(btn => {
            const p = btn.getAttribute('data-preset');
            btn.className = (p === presetKey)
                ? 'dw-preset-btn bg-slate-900 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-sm transition-all'
                : 'dw-preset-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all';
        });
    }

    window.onManualDimensionTyped = function () {
        const pInput = document.getElementById('dw-size-preset');
        if (pInput) pInput.value = 'custom';
        highlightActivePresetButton('custom');
        window.onDeliStudioInputChange();
    };

    window.switchDeliStudioSubTab = function (tabName) {
        window.deliStudioActiveSubTab = tabName;
        ['order_bags', 'size_design', 'hardware'].forEach(t => {
            const panel = document.getElementById('dw-subtab-' + t);
            const btn = document.getElementById('dw-tab-btn-' + t);
            if (panel) {
                if (t === tabName) panel.classList.remove('hidden');
                else panel.classList.add('hidden');
            }
            if (btn) {
                btn.className = (t === tabName)
                    ? 'px-2.5 py-1 rounded-lg text-[11px] font-black bg-slate-900 text-white transition-all shadow-sm'
                    : 'px-2.5 py-1 rounded-lg text-[11px] font-black text-slate-600 hover:bg-slate-100 transition-all';
            }
        });
    };

    window.switchDeliTemplateMode = function (mode, skipRender = false) {
        const modeInput = document.getElementById('dw-template-mode');
        if (modeInput) modeInput.value = mode;

        ['shipping', 'product_tag', 'free_custom'].forEach(m => {
            const btn = document.getElementById('dw-mode-btn-' + m);
            if (btn) {
                btn.className = (m === mode)
                    ? 'px-3 py-1.5 rounded-xl text-xs font-black bg-brand-primary text-white shadow-sm transition-all'
                    : 'px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all';
            }
        });

        const shipEd = document.getElementById('dw-shipping-order-editor');
        const tagEd = document.getElementById('dw-product-tag-editor');
        const freeEd = document.getElementById('dw-free-custom-editor');
        const bagsCard = document.getElementById('dw-bags-control-card');

        if (shipEd) shipEd.classList.toggle('hidden', mode !== 'shipping');
        if (tagEd) tagEd.classList.toggle('hidden', mode !== 'product_tag');
        if (freeEd) freeEd.classList.toggle('hidden', mode !== 'free_custom');
        if (bagsCard) bagsCard.classList.toggle('hidden', mode === 'free_custom');

        if (!skipRender) {
            window.switchDeliStudioSubTab('order_bags');
            window.onDeliStudioInputChange();
        }
    };

    window.applyQuickSizePreset = function (presetKey, w, h) {
        const pInput = document.getElementById('dw-size-preset');
        const wInput = document.getElementById('dw-width-mm');
        const hInput = document.getElementById('dw-height-mm');
        if (pInput) pInput.value = presetKey;
        if (wInput) wInput.value = w;
        if (hInput) hInput.value = h;
        highlightActivePresetButton(presetKey);
        window.onDeliStudioInputChange();
    };

    // زيادة أو إنقاص عدد الشنط للطلب المعروض حالياً
    window.stepStudioBagsCount = function (delta) {
        const inp = document.getElementById('dw-bags-count');
        if (!inp) return;
        const nextVal = Math.max(1, Math.min(20, (parseInt(inp.value) || 1) + delta));
        inp.value = nextVal;
        const ord = getSampleOrderForPreview();
        if (ord) ord._bagsCount = nextVal;
        window.deliPreviewBagNumber = 1;
        window.onDeliStudioInputChange();
    };

    window.onStudioBagsManualInput = function (val) {
        const nextVal = Math.max(1, Math.min(20, parseInt(val) || 1));
        const ord = getSampleOrderForPreview();
        if (ord) ord._bagsCount = nextVal;
        window.deliPreviewBagNumber = 1;
        window.onDeliStudioInputChange();
    };

    window.setPreviewBagNumber = function (bNum) {
        window.deliPreviewBagNumber = bNum;
        window.onDeliStudioInputChange();
    };

    window.switchStudioPreviewOrderIndex = function (delta) {
        const q = window.deliPrinterConnection.lastOrdersQueue || [];
        if (q.length <= 1) return;
        let nextIdx = (window.deliPreviewOrderIndex || 0) + delta;
        if (nextIdx < 0) nextIdx = q.length - 1;
        if (nextIdx >= q.length) nextIdx = 0;
        window.deliPreviewOrderIndex = nextIdx;
        window.deliPreviewBagNumber = 1;

        const currentOrd = getSampleOrderForPreview();
        const bagsInp = document.getElementById('dw-bags-count');
        if (bagsInp && currentOrd) {
            bagsInp.value = Math.max(1, parseInt(currentOrd._bagsCount) || 1);
        }
        renderStudioOrderItemsEditor();
        window.onDeliStudioInputChange();
    };

    function renderStudioOrderItemsEditor() {
        const ord = getSampleOrderForPreview();
        if (!ord) return;
        if (!Array.isArray(ord.items)) ord.items = [];

        const listCont = document.getElementById('dw-live-items-editor-list');
        if (listCont) {
            if (ord.items.length === 0) {
                listCont.innerHTML = `<div class="text-center py-3 text-xs font-bold text-slate-400">لا توجد أصناف، اضغط (+ إضافة صنف) بالأعلى</div>`;
            } else {
                listCont.innerHTML = ord.items.map((item, idx) => `
                    <div class="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <input type="text" value="${item.name || ''}" oninput="updateStudioOrderItemField(${idx}, 'name', this.value)" placeholder="اسم الصنف" class="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 outline-none">
                        <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-0.5 shrink-0">
                            <button type="button" onclick="stepStudioOrderItemQty(${idx}, -0.5)" class="w-6 h-6 rounded bg-rose-50 text-rose-600 font-black text-xs hover:bg-rose-500 hover:text-white">-</button>
                            <input type="number" value="${item.quantity || 1}" step="0.5" min="0.5" oninput="updateStudioOrderItemField(${idx}, 'quantity', this.value)" class="w-11 text-center font-black text-xs text-brand-primary outline-none">
                            <button type="button" onclick="stepStudioOrderItemQty(${idx}, 0.5)" class="w-6 h-6 rounded bg-emerald-50 text-emerald-600 font-black text-xs hover:bg-emerald-500 hover:text-white">+</button>
                        </div>
                        <div class="flex items-center gap-0.5 shrink-0">
                            <input type="number" value="${item.price || 0}" oninput="updateStudioOrderItemField(${idx}, 'price', this.value)" class="w-14 bg-white border border-slate-200 rounded-lg p-1 text-center font-black text-xs text-slate-700 outline-none" title="سعر الوحدة">
                            <span class="text-[9px] font-bold text-slate-400">ج</span>
                        </div>
                        <button type="button" onclick="removeStudioOrderItemRow(${idx})" class="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-500 text-red-500 hover:text-white text-xs flex items-center justify-center shrink-0" title="حذف الصنف"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `).join('');
            }
        }

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('dw-ord-cust-name', ord.customerName || '');
        setVal('dw-ord-cust-phone', ord.customerPhone || '');
        setVal('dw-ord-zone', ord.zone || '');
        setVal('dw-ord-address', ord.customerAddress || '');
        setVal('dw-ord-total', ord.total || 0);
        setVal('dw-ord-payment', ord.paymentMethod === 'online' ? 'online' : 'cash');
        setVal('dw-ord-note', ord.driverNote || ord.adminNote || '');

        const firstItm = ord.items[0] || { name: 'طبق سمان جامبو', quantity: 1, price: 145 };
        const tagProdInp = document.getElementById('dw-tag-prod-name');
        if (tagProdInp && !tagProdInp.value) {
            tagProdInp.value = `${firstItm.quantity}x ${firstItm.name}`;
        }
    }

    function recalculateOrderTotalsFromStudioItems(ord) {
        if (!ord || !Array.isArray(ord.items)) return;
        const newSub = ord.items.reduce((sum, i) => sum + ((Number(i.quantity) || 0) * (Number(i.price) || 0)), 0);
        ord.subtotal = Math.round(newSub);
        const del = Number(ord.deliveryFee) || 0;
        const disc = Number(ord.discount) || 0;
        ord.total = Math.max(0, ord.subtotal + del - disc);
        const totInp = document.getElementById('dw-ord-total');
        if (totInp) totInp.value = ord.total;
    }

    window.stepStudioOrderItemQty = function (idx, delta) {
        const ord = getSampleOrderForPreview();
        if (!ord || !ord.items || !ord.items[idx]) return;
        const cur = Number(ord.items[idx].quantity) || 1;
        ord.items[idx].quantity = Math.max(0.5, Number((cur + delta).toFixed(2)));
        recalculateOrderTotalsFromStudioItems(ord);
        renderStudioOrderItemsEditor();
        window.onDeliStudioInputChange();
    };

    window.updateStudioOrderItemField = function (idx, field, val) {
        const ord = getSampleOrderForPreview();
        if (!ord || !ord.items || !ord.items[idx]) return;
        if (field === 'quantity' || field === 'price') {
            ord.items[idx][field] = Math.max(0, parseFloat(val) || 0);
            recalculateOrderTotalsFromStudioItems(ord);
        } else {
            ord.items[idx][field] = val;
        }
        window.onDeliStudioInputChange();
    };

    window.removeStudioOrderItemRow = function (idx) {
        const ord = getSampleOrderForPreview();
        if (!ord || !Array.isArray(ord.items)) return;
        ord.items.splice(idx, 1);
        recalculateOrderTotalsFromStudioItems(ord);
        renderStudioOrderItemsEditor();
        window.onDeliStudioInputChange();
    };

    window.addStudioOrderItemRow = function () {
        const ord = getSampleOrderForPreview();
        if (!ord) return;
        if (!Array.isArray(ord.items)) ord.items = [];
        ord.items.push({ id: 'custom_' + Date.now(), name: 'طبق سمان', quantity: 1, price: 140 });
        recalculateOrderTotalsFromStudioItems(ord);
        renderStudioOrderItemsEditor();
        window.onDeliStudioInputChange();
    };

    window.applyLiveOrderMetadataEdit = function (manualTotalOverride = false) {
        const ord = getSampleOrderForPreview();
        if (!ord) return;
        const getVal = (id) => document.getElementById(id)?.value || '';
        ord.customerName = getVal('dw-ord-cust-name');
        ord.customerPhone = getVal('dw-ord-cust-phone');
        ord.zone = getVal('dw-ord-zone');
        ord.customerAddress = getVal('dw-ord-address');
        ord.paymentMethod = getVal('dw-ord-payment');
        ord.driverNote = getVal('dw-ord-note');
        if (manualTotalOverride) {
            ord.total = Math.max(0, Number(getVal('dw-ord-total')) || 0);
        }
        window.onDeliStudioInputChange();
    };

    window.saveStudioOrderChangesToFirebase = async function () {
        const ord = getSampleOrderForPreview();
        if (!ord || !ord.id || ord.id === 'SMAN2026') {
            return notifyPrinterToast('⚠️ هذا نموذج معاينة، التعديلات مطبقة جاهزة للطباعة الآن!');
        }
        if (typeof db === 'undefined') return;
        try {
            await db.collection('orders').doc(ord.id).update({
                customerName: ord.customerName || '',
                customerPhone: ord.customerPhone || '',
                zone: ord.zone || '',
                customerAddress: ord.customerAddress || '',
                paymentMethod: ord.paymentMethod || 'cash',
                driverNote: ord.driverNote || '',
                items: ord.items || [],
                subtotal: Number(ord.subtotal) || 0,
                total: Number(ord.total) || 0
            });
            // تحديث النسخة الأصلية في الذاكرة الحية أيضاً
            const origOrd = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x.id === ord.id);
            if (origOrd) {
                Object.assign(origOrd, {
                    customerName: ord.customerName || '',
                    customerPhone: ord.customerPhone || '',
                    zone: ord.zone || '',
                    customerAddress: ord.customerAddress || '',
                    paymentMethod: ord.paymentMethod || 'cash',
                    driverNote: ord.driverNote || '',
                    items: ord.items.map(i => ({ ...i })),
                    subtotal: Number(ord.subtotal) || 0,
                    total: Number(ord.total) || 0
                });
            }
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            notifyPrinterToast('✅ تم حفظ تعديلات الأصناف والبيانات في الطلب الأصلي بنجاح!');
        } catch (e) {
            alert('خطأ أثناء حفظ التعديلات في قاعدة البيانات: ' + e.message);
        }
    };

    function populateStudioInputsFromConfig(cfg) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };

        const dims = resolveDimensionsMm(cfg);
        const preset = cfg.sizePreset || '100x100';
        setVal('dw-size-preset', preset);
        highlightActivePresetButton(preset);

        setVal('dw-template-mode', cfg.templateMode || 'shipping');
        setVal('dw-width-mm', dims.w || 100);
        setVal('dw-height-mm', dims.h || 100);
        setVal('dw-density', cfg.density || 12);
        setVal('dw-gap-mm', cfg.gapMm !== undefined ? cfg.gapMm : 2);
        setVal('dw-direction', cfg.direction ? '1' : '0');
        setVal('dw-font-scale-pct', cfg.fontScalePct || 100);
        setVal('dw-offset-x', cfg.offsetXMm || 0);
        setVal('dw-offset-y', cfg.offsetYMm || 0);
        setVal('dw-padding-pct', cfg.paddingPct || 100);
        setVal('dw-border-style', cfg.borderStyle || 'double');
        setVal('dw-custom-store-title', cfg.customStoreTitle || '');
        setVal('dw-custom-store-phone', cfg.customStorePhone || '');
        setVal('dw-promo-text', cfg.promoText || '');
        setVal('dw-copies', cfg.copies || 1);
        setVal('dw-bags-count', cfg.bagsCount || 1);
        setVal('dw-bag-custom-label', cfg.bagCustomLabel || '');
        setVal('dw-footer-text', cfg.footerText || '');

        // استرجاع نصوص استيكر الطبق والاستيكر الحر
        setVal('dw-tag-prod-name', cfg.tagProductName || '');
        setVal('dw-tag-weight', cfg.tagWeightText || '');
        setVal('dw-tag-date', cfg.tagDateText || '');
        setVal('dw-tag-price', cfg.tagPriceText || '');
        if (cfg.freeLine1 !== undefined) setVal('dw-free-line1', cfg.freeLine1);
        if (cfg.freeLine2 !== undefined) setVal('dw-free-line2', cfg.freeLine2);
        if (cfg.freeLine3 !== undefined) setVal('dw-free-line3', cfg.freeLine3);
        if (cfg.freeBadgeText !== undefined) setVal('dw-free-badge', cfg.freeBadgeText);

        setChk('dw-show-logo', cfg.showLogo !== false);
        setChk('dw-show-barcode', cfg.showBarcode !== false);
        setChk('dw-show-prices', cfg.showItemsPrice !== false);
        setChk('dw-show-weight', cfg.showWeightInfo !== false);
        setChk('dw-show-promo', cfg.showPromoBanner === true);
        setChk('dw-always-show-bag', cfg.alwaysShowBagBadge === true);
        setChk('dw-invert-bitmap', cfg.invertBitmap === true);
        setChk('dw-route-summary', cfg.includeRouteSummary === true);
        setChk('dw-instant-print', cfg.instantPrint === true);

        window.switchDeliTemplateMode(cfg.templateMode || 'shipping', true);
    }

    function readStudioInputsToConfig() {
        const current = window.getWaybillConfig();
        const getVal = (id, fb) => { const el = document.getElementById(id); return el ? el.value : fb; };
        const getChk = (id, fb) => { const el = document.getElementById(id); return el ? el.checked : fb; };

        const wMm = Math.min(108, Math.max(30, Number(getVal('dw-width-mm', 100)) || 100));
        const hMm = Math.min(250, Math.max(20, Number(getVal('dw-height-mm', 100)) || 100));
        const preset = getVal('dw-size-preset', current.sizePreset || '100x100');

        return {
            ...current,
            sizePreset: preset,
            templateMode: getVal('dw-template-mode', 'shipping'),
            widthMm: wMm,
            heightMm: hMm,
            density: Number(getVal('dw-density', 12)) || 12,
            gapMm: Number(getVal('dw-gap-mm', 2)) || 0,
            direction: parseInt(getVal('dw-direction', '0')) || 0,
            fontScalePct: Number(getVal('dw-font-scale-pct', 100)) || 100,
            offsetXMm: Number(getVal('dw-offset-x', 0)) || 0,
            offsetYMm: Number(getVal('dw-offset-y', 0)) || 0,
            paddingPct: Number(getVal('dw-padding-pct', 100)) || 100,
            borderStyle: getVal('dw-border-style', 'double'),
            customStoreTitle: getVal('dw-custom-store-title', ''),
            customStorePhone: getVal('dw-custom-store-phone', ''),
            showPromoBanner: getChk('dw-show-promo', false),
            promoText: getVal('dw-promo-text', ''),
            copies: Math.max(1, parseInt(getVal('dw-copies', 1)) || 1),
            bagsCount: Math.max(1, parseInt(getVal('dw-bags-count', 1)) || 1),
            bagCustomLabel: getVal('dw-bag-custom-label', ''),
            alwaysShowBagBadge: getChk('dw-always-show-bag', false),
            tagProductName: getVal('dw-tag-prod-name', ''),
            tagWeightText: getVal('dw-tag-weight', ''),
            tagDateText: getVal('dw-tag-date', ''),
            tagPriceText: getVal('dw-tag-price', ''),
            freeLine1: getVal('dw-free-line1', 'سمان ههيا الفريش'),
            freeLine2: getVal('dw-free-line2', 'سمان جامبو وملكي طازج يومياً'),
            freeLine3: getVal('dw-free-line3', 'للحجز والتوصيل: 01208027294'),
            freeBadgeText: getVal('dw-free-badge', ''),
            footerText: getVal('dw-footer-text', ''),
            selectedMac: getVal('dw-native-printer-select', current.selectedMac || 'AUTO'),
            showLogo: getChk('dw-show-logo', true),
            showBarcode: getChk('dw-show-barcode', true),
            showItemsPrice: getChk('dw-show-prices', true),
            showWeightInfo: getChk('dw-show-weight', true),
            invertBitmap: getChk('dw-invert-bitmap', false),
            includeRouteSummary: getChk('dw-route-summary', false),
            instantPrint: getChk('dw-instant-print', false)
        };
    }

    window.onDeliStudioInputChange = function () {
        const tempCfg = readStudioInputsToConfig();
        renderLivePreviewInsideStudio(tempCfg);
    };

    function getSampleOrderForPreview() {
        const q = window.deliPrinterConnection.lastOrdersQueue;
        if (Array.isArray(q) && q.length > 0) {
            const idx = Math.min(q.length - 1, Math.max(0, window.deliPreviewOrderIndex || 0));
            return q[idx];
        }
        const liveOrders = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw.filter(o => o && o.status !== 'trash') : [];
        if (liveOrders.length > 0) return liveOrders[0];
        if (!window._fallbackSampleOrder) {
            window._fallbackSampleOrder = {
                id: 'SMAN2026',
                customerName: 'د. أحمد ماضي (نموذج معاينة)',
                customerPhone: '01208027294',
                zone: 'ههيا',
                customerAddress: 'شارع الجمهورية - بجوار مجمع الأصدقاء الطبي',
                orderDate: new Date().toLocaleDateString('ar-EG'),
                batchName: 'دفعة السمان الملكي',
                paymentMethod: 'cash',
                subtotal: 410,
                deliveryFee: 20,
                discount: 10,
                total: 420,
                driverName: 'كابتن أحمد',
                driverNote: 'الاتصال قبل الوصول بـ 10 دقائق',
                items: [
                    { id: 'jumbo', name: 'طبق سمان جامبو', quantity: 2, price: 145 },
                    { id: 'super', name: 'طبق سمان سوبر', quantity: 1, price: 120 }
                ]
            };
        }
        return window._fallbackSampleOrder;
    }

    function renderLivePreviewInsideStudio(cfg) {
        const stage = document.getElementById('dw-live-preview-stage');
        if (!stage) return;
        const dims = resolveDimensionsMm(cfg);
        const sampleOrd = getSampleOrderForPreview();
        const queue = window.deliPrinterConnection.lastOrdersQueue || [];
        const ordersCount = queue.length || 1;
        const currentOrdIdx = Math.min(ordersCount - 1, Math.max(0, window.deliPreviewOrderIndex || 0));

        const bagsForCurrentOrd = Math.max(1, parseInt(sampleOrd?._bagsCount) || parseInt(cfg.bagsCount) || 1);
        const copies = Math.max(1, parseInt(cfg.copies) || 1);

        // حساب إجمالي الملصقات التي ستخرج من الطابعة فعلياً
        let totalLabelsToPrint = 0;
        if (queue.length > 0) {
            queue.forEach(o => {
                const b = Math.max(1, parseInt(o._bagsCount) || parseInt(cfg.bagsCount) || 1);
                totalLabelsToPrint += (b * copies);
            });
        } else {
            totalLabelsToPrint = bagsForCurrentOrd * copies;
        }

        const qBadge = document.getElementById('dw-queue-count-badge');
        if (qBadge) qBadge.innerText = totalLabelsToPrint;

        const dimsBadge = document.getElementById('dw-dims-badge');
        if (dimsBadge) {
            dimsBadge.innerText = `${dims.w}×${dims.h} مم (${dims.w * DOTS_PER_MM}×${dims.h * DOTS_PER_MM}px)`;
        }

        // شريط تقليب الطلبات عند وجود أكثر من طلب في طابور الطباعة
        const ordSwitcher = document.getElementById('dw-order-queue-switcher');
        if (ordSwitcher) {
            if (ordersCount > 1 && cfg.templateMode === 'shipping') {
                ordSwitcher.classList.remove('hidden');
                ordSwitcher.innerHTML = `
                    <button type="button" onclick="switchStudioPreviewOrderIndex(-1)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white">◀ السابق</button>
                    <span>الطلب (${currentOrdIdx + 1} من ${ordersCount}): <strong class="text-brand-primary">${sampleOrd.customerName || 'عميل'}</strong></span>
                    <button type="button" onclick="switchStudioPreviewOrderIndex(1)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white">التالي ▶</button>
                `;
            } else {
                ordSwitcher.classList.add('hidden');
            }
        }

        // شريط التبديل بين معاينة الشنط (شنطة 1 من 2 / شنطة 2 من 2)
        const bagSwitcher = document.getElementById('dw-bag-preview-switcher');
        if (bagSwitcher) {
            if (bagsForCurrentOrd > 1 && cfg.templateMode !== 'free_custom') {
                bagSwitcher.classList.remove('hidden');
                if (window.deliPreviewBagNumber > bagsForCurrentOrd) window.deliPreviewBagNumber = 1;
                let btnsHtml = `<span class="text-amber-300 ml-1">معاينة الشنطة:</span>`;
                for (let b = 1; b <= Math.min(bagsForCurrentOrd, 8); b++) {
                    const activeCls = (b === window.deliPreviewBagNumber) ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20';
                    btnsHtml += `<button type="button" onclick="setPreviewBagNumber(${b})" class="px-2 py-0.5 rounded-lg ${activeCls}">شنطة ${b}/${bagsForCurrentOrd}</button>`;
                }
                bagSwitcher.innerHTML = btnsHtml;
            } else {
                bagSwitcher.classList.add('hidden');
                window.deliPreviewBagNumber = 1;
            }
        }

        const cnv = window.renderWaybillToCanvas203DPI(sampleOrd, cfg, currentOrdIdx + 1, ordersCount, window.deliPreviewBagNumber || 1, bagsForCurrentOrd);
        cnv.style.maxWidth = '100%';
        cnv.style.maxHeight = '330px';
        cnv.style.height = 'auto';
        cnv.style.borderRadius = '10px';
        cnv.style.boxShadow = '0 6px 20px rgba(0,0,0,0.14)';
        stage.innerHTML = '';
        stage.appendChild(cnv);
    }

    window.closeDeliStudioModal = function () {
        document.getElementById('deli-waybill-studio-modal')?.classList.add('hidden');
    };

    // =========================================================================
    // 🔗 8. ربط كافة أزرار الطباعة في النظام
    // =========================================================================
    window.openWaybillSettingsModal = function (ordersQueue = null) {
        const modal = ensureDeliStudioModalExists();
        window.deliPreviewOrderIndex = 0;
        window.deliPreviewBagNumber = 1;

        if (Array.isArray(ordersQueue) && ordersQueue.length > 0) {
            window.deliPrinterConnection.lastOrdersQueue = ordersQueue.map(o => ({
                ...o,
                _bagsCount: 1,
                items: Array.isArray(o.items) ? o.items.map(i => ({ ...i })) : []
            }));
        } else {
            const firstLive = (typeof allOrdersRaw !== 'undefined' && allOrdersRaw.length > 0)
                ? [{ ...allOrdersRaw[0], _bagsCount: 1, items: Array.isArray(allOrdersRaw[0].items) ? allOrdersRaw[0].items.map(i => ({ ...i })) : [] }]
                : [getSampleOrderForPreview()];
            window.deliPrinterConnection.lastOrdersQueue = firstLive;
        }

        const cfg = window.getWaybillConfig();
        cfg.bagsCount = 1;

        // الترتيب الصحيح: تعبئة الإعدادات -> ثم تعبئة جدول أصناف الطلب -> ثم رسم المعاينة الحية
        populateStudioInputsFromConfig(cfg);
        renderStudioOrderItemsEditor();
        window.scanAndLoadNativePairedPrinters(false);
        updateConnectionBadgesUI();
        window.switchDeliStudioSubTab('order_bags');
        renderLivePreviewInsideStudio(readStudioInputsToConfig());
        modal.classList.remove('hidden');
    };

    window.saveWaybillSettings = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        notifyPrinterToast('✅ تم حفظ إعدادات وتصميم طابعة Deli E750W بنجاح!');
    };

    window.triggerDirectHardwarePrintBtn = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printDirectViaNativeBluetooth(queue, newCfg);
    };

    window.triggerStudioMainPrint = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printViaInPageThermalFrame(queue, newCfg);
    };

    window.printSingleOrderWaybill = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return alert('لم يتم العثور على بيانات هذا الطلب!');

        const cfg = window.getWaybillConfig();
        const clonedOrder = { ...order, _bagsCount: 1, items: Array.isArray(order.items) ? order.items.map(i => ({ ...i })) : [] };
        window.deliPrinterConnection.lastOrdersQueue = [clonedOrder];

        if (cfg.instantPrint) {
            window.printDirectViaNativeBluetooth([clonedOrder], cfg);
        } else {
            window.openWaybillSettingsModal([clonedOrder]);
        }
    };

    window.bulkPrintWaybills = function () {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');

        const ordersToPrint = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : [])
            .filter(o => checkedIds.includes(o.id))
            .map(o => ({ ...o, _bagsCount: 1, items: Array.isArray(o.items) ? o.items.map(i => ({ ...i })) : [] }));
        if (ordersToPrint.length === 0) return;

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;

        if (cfg.instantPrint) {
            window.printDirectViaNativeBluetooth(ordersToPrint, cfg);
        } else {
            window.openWaybillSettingsModal(ordersToPrint);
        }
    };
    window.printSelectedOrdersWaybills = window.bulkPrintWaybills;

    window.previewWaybillSample = function () {
        window.openWaybillSettingsModal();
    };
    window.previewSampleWaybill = window.previewWaybillSample;

    function injectHeaderPrinterQuickBtn() {
        const pulseBar = document.getElementById('lc-header-pulse-bar');
        if (pulseBar && !document.getElementById('lc-hdr-printer-btn')) {
            const prnBtn = document.createElement('button');
            prnBtn.id = 'lc-hdr-printer-btn';
            prnBtn.onclick = () => window.openWaybillSettingsModal();
            prnBtn.title = 'استوديو وإعدادات طابعة البوالص (Deli E750W)';
            prnBtn.className = 'lc-capsule bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2 sm:px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-black flex items-center gap-1 shadow-sm shrink-0';
            prnBtn.innerHTML = '<i class="fa-solid fa-print text-amber-600"></i> <span class="hidden md:inline">Deli 750W</span>';
            pulseBar.appendChild(prnBtn);
        }
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => setTimeout(injectHeaderPrinterQuickBtn, 700));
    } else {
        setTimeout(injectHeaderPrinterQuickBtn, 700);
    }
    // =========================================================================
    // =========================================================================
    // 🐔🎛️ 9. محرك تكت ميزان الفراخ والترتيب الصارم + التحكم الحر في المربعات
    // يعمل على: البوليصة + تكت الفراخ + استيكر الأطباق + الاستيكر الحر (203 DPI)
    // =========================================================================

    const defaultBoxCustomizations = {
        reversePrintOrder: false,
        // ترتيب وإعدادات مربعات بوليصة الشحن
        shippingOrder: ['header', 'customer', 'items', 'cod', 'footer'],
        // ترتيب وإعدادات مربعات تكت ميزان الفراخ
        poultryOrder: ['pb_header', 'pb_title', 'pb_metrics', 'pb_barcode'],
        boxes: {
            // مربعات بوليصة الشحن
            header:   { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', label: '' },
            customer: { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', zoneRatio: 35, label: 'العميل:' },
            items:    { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', label: 'الصنف المطلوب' },
            cod:      { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'inverted', label: 'المطلوب تحصيله من العميل:' },
            footer:   { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'dashed', label: '' },
            // مربعات تكت ميزان الفراخ
            pb_header:  { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'inverted', label: '' },
            pb_title:   { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'none', label: '' },
            pb_metrics: { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', label: '' },
            pb_weight:  { visible: true, hScale: 100, wScale: 33,  fScale: 100, style: 'solid', label: 'الوزن الصافي' },
            pb_rate:    { visible: true, hScale: 100, wScale: 25,  fScale: 100, style: 'solid', label: 'سعر الكيلو' },
            pb_price:   { visible: true, hScale: 100, wScale: 42,  fScale: 100, style: 'inverted', label: 'السعر المطلوب' },
            pb_barcode: { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'none', label: '' }
        }
    };

    window.poultryBatchState = {
        previewIdx: 0,
        parsedItems: [],
        activeBoxKey: 'cod',
        hitRegions: [],
        selectionSequenceIds: []
    };

    // تتبع ترتيب الضغط على الطلبات في الموقع لضمان سحبها بنفس تسلسل اختيار المستخدم
    document.addEventListener('change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('bulk-order-cb')) {
            const id = e.target.value;
            const seq = window.poultryBatchState.selectionSequenceIds;
            const idx = seq.indexOf(id);
            if (e.target.checked && idx === -1) seq.push(id);
            else if (!e.target.checked && idx !== -1) seq.splice(idx, 1);
        }
    });

    function getBoxCustomConfig() {
        const cfg = window.getWaybillConfig();
        if (!cfg.boxCustom || !cfg.boxCustom.boxes) {
            return JSON.parse(JSON.stringify(defaultBoxCustomizations));
        }
        return {
            reversePrintOrder: Boolean(cfg.boxCustom.reversePrintOrder),
            shippingOrder: Array.isArray(cfg.boxCustom.shippingOrder) ? cfg.boxCustom.shippingOrder : [...defaultBoxCustomizations.shippingOrder],
            poultryOrder: Array.isArray(cfg.boxCustom.poultryOrder) ? cfg.boxCustom.poultryOrder : [...defaultBoxCustomizations.poultryOrder],
            boxes: Object.assign({}, JSON.parse(JSON.stringify(defaultBoxCustomizations.boxes)), cfg.boxCustom.boxes)
        };
    }

    function saveBoxCustomConfig(boxCustomObj) {
        const cfg = window.getWaybillConfig();
        cfg.boxCustom = boxCustomObj;
        persistWaybillConfig(cfg);
    }

    function normalizeScaleDigits(str) {
        return String(str ?? '')
            .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0));
    }

    // =========================================================================
    // 📋 قارئ الأوزان والكوبي-بيست الصارم (يحافظ على ترتيب الـ 10+ عناصر بالمللي)
    // =========================================================================
    window.parsePoultryWeightsList = function () {
        const rawText = normalizeScaleDigits(document.getElementById('dw-pb-weights-raw')?.value || '');
        const kiloPrice = Math.max(0, parseFloat(normalizeScaleDigits(document.getElementById('dw-pb-kilo-price')?.value || '110')) || 0);
        const tareGrams = Math.max(0, parseFloat(normalizeScaleDigits(document.getElementById('dw-pb-tare')?.value || '0')) || 0);
        const roundMode = document.getElementById('dw-pb-rounding')?.value || 'nearest_1';

        const extractedNumbers = [];
        const rawLines = rawText.split(/\r?\n/);

        rawLines.forEach(line => {
            let cleanLine = line.trim();
            if (!cleanLine) return;
            // إزالة الترقيم الجانبي في بداية السطر إن وجد مثل: "1- 1389" أو "2) 1400" أو "#3: 1500"
            cleanLine = cleanLine.replace(/^(?:#?\d+\s*[\-\)\.\:]\s*)/, '');
            const matches = cleanLine.match(/\d+(?:\.\d+)?/g);
            if (matches) {
                matches.forEach(m => extractedNumbers.push(m));
            }
        });

        const items = [];
        extractedNumbers.forEach((tok, idx) => {
            const num = parseFloat(tok);
            if (!Number.isFinite(num) || num <= 0) return;

            const grossGrams = num < 25 ? Math.round(num * 1000) : Math.round(num);
            const netGrams = Math.max(1, grossGrams - tareGrams);
            const rawPrice = (netGrams / 1000) * kiloPrice;

            let finalPrice = rawPrice;
            if (roundMode === 'nearest_1') finalPrice = Math.round(rawPrice);
            else if (roundMode === 'floor_1') finalPrice = Math.floor(rawPrice);
            else if (roundMode === 'ceil_1') finalPrice = Math.ceil(rawPrice);
            else if (roundMode === 'nearest_5') finalPrice = Math.round(rawPrice / 5) * 5;
            else finalPrice = Number(rawPrice.toFixed(1));

            items.push({
                index: items.length + 1,
                rawTokenIndex: idx,
                grossGrams,
                netGrams,
                kiloPrice,
                price: finalPrice,
                isAnomaly: (netGrams < 350 || netGrams > 4500)
            });
        });

        window.poultryBatchState.parsedItems = items;
        if (window.poultryBatchState.previewIdx >= items.length) {
            window.poultryBatchState.previewIdx = Math.max(0, items.length - 1);
        }
        renderPoultryBatchChipsAndStats();
        return items;
    };

    function renderPoultryBatchChipsAndStats() {
        const items = window.poultryBatchState.parsedItems || [];
        const chipsCont = document.getElementById('dw-pb-chips-list');
        const summaryBar = document.getElementById('dw-pb-summary-bar');
        const switcherBar = document.getElementById('dw-pb-preview-switcher');

        const totalCount = items.length;
        const totalGrams = items.reduce((s, i) => s + i.netGrams, 0);
        const totalKg = (totalGrams / 1000).toFixed(3);
        const avgGrams = totalCount > 0 ? Math.round(totalGrams / totalCount) : 0;
        const totalCash = items.reduce((s, i) => s + i.price, 0);

        if (summaryBar) {
            summaryBar.innerHTML = `
                <div class="grid grid-cols-4 gap-1.5 text-center">
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl">
                        <span class="block text-[9px] text-slate-400">العدد بالترتيب</span>
                        <span class="text-xs font-black text-amber-300">${totalCount} تكت</span>
                    </div>
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl">
                        <span class="block text-[9px] text-slate-400">إجمالي الوزن</span>
                        <span class="text-xs font-black text-emerald-300">${totalKg} كجم</span>
                    </div>
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl">
                        <span class="block text-[9px] text-slate-400">متوسط الفرخة</span>
                        <span class="text-xs font-black text-cyan-300">${avgGrams} جم</span>
                    </div>
                    <div class="bg-emerald-700 text-white p-1.5 rounded-xl">
                        <span class="block text-[9px] text-emerald-200">إجمالي المبلغ</span>
                        <span class="text-xs font-black">${totalCash.toLocaleString()} ج.م</span>
                    </div>
                </div>
            `;
        }

        if (chipsCont) {
            if (items.length === 0) {
                chipsCont.innerHTML = `<div class="col-span-2 text-center py-3 text-[11px] font-bold text-slate-400">ارص الأوزان أو الصقها هنا وستترتب تلقائياً (#1، #2، #3...)</div>`;
            } else {
                chipsCont.innerHTML = items.map((it, idx) => {
                    const active = idx === window.poultryBatchState.previewIdx;
                    const baseCls = it.isAnomaly
                        ? 'bg-amber-50 border-amber-400 text-amber-950'
                        : (active ? 'bg-emerald-50 border-brand-primary text-emerald-950' : 'bg-white border-slate-200 text-slate-700');
                    return `
                        <div onclick="selectPoultryPreviewIdx(${idx})" class="flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl border-2 text-[11px] font-black cursor-pointer transition-all ${baseCls}">
                            <div class="flex items-center gap-1">
                                <span class="bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded text-[9px]">#${it.index}</span>
                                <span>${it.netGrams} جم</span>
                                ${it.isAnomaly ? `<button type="button" onclick="event.stopPropagation(); fixAnomalyWeightX10(${idx})" class="bg-amber-500 text-slate-950 px-1 py-0.5 rounded text-[8px]">⚠️ ${it.grossGrams * 10}؟</button>` : ''}
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="text-brand-primary font-black">${it.price} ج</span>
                                <button type="button" onclick="event.stopPropagation(); movePoultryWeightItem(${idx}, -1)" class="text-slate-400 hover:text-slate-900 px-0.5" title="تحريك لأعلى">▲</button>
                                <button type="button" onclick="event.stopPropagation(); movePoultryWeightItem(${idx}, 1)" class="text-slate-400 hover:text-slate-900 px-0.5" title="تحريك لأسفل">▼</button>
                                <button type="button" onclick="event.stopPropagation(); removeSinglePoultryWeight(${idx})" class="text-rose-500 hover:text-rose-700 px-0.5">×</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (switcherBar) {
            if (items.length > 1) {
                const cur = window.poultryBatchState.previewIdx + 1;
                switcherBar.classList.remove('hidden');
                switcherBar.innerHTML = `
                    <button type="button" onclick="stepPoultryPreviewIdx(-1)" class="px-2.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white">◀ السابق</button>
                    <span class="text-amber-300">تكت بالترتيب (#${cur} من ${items.length}) — ${items[cur - 1]?.netGrams || 0} جم</span>
                    <button type="button" onclick="stepPoultryPreviewIdx(1)" class="px-2.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white">التالي ▶</button>
                `;
            } else {
                switcherBar.classList.add('hidden');
            }
        }
    }

    window.movePoultryWeightItem = function (idx, delta) {
        const items = window.poultryBatchState.parsedItems || [];
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= items.length) return;
        const rawList = items.map(i => i.grossGrams);
        const temp = rawList[idx];
        rawList[idx] = rawList[targetIdx];
        rawList[targetIdx] = temp;
        const el = document.getElementById('dw-pb-weights-raw');
        if (el) el.value = rawList.join('\n');
        window.poultryBatchState.previewIdx = targetIdx;
        window.parsePoultryWeightsList();
        window.onDeliStudioInputChange();
    };

    window.selectPoultryPreviewIdx = function (idx) {
        window.poultryBatchState.previewIdx = idx;
        renderPoultryBatchChipsAndStats();
        window.onDeliStudioInputChange();
    };

    window.stepPoultryPreviewIdx = function (delta) {
        const len = (window.poultryBatchState.parsedItems || []).length;
        if (len <= 1) return;
        let next = (window.poultryBatchState.previewIdx || 0) + delta;
        if (next < 0) next = len - 1;
        if (next >= len) next = 0;
        window.selectPoultryPreviewIdx(next);
    };

    window.fixAnomalyWeightX10 = function (idx) {
        const items = window.poultryBatchState.parsedItems || [];
        if (!items[idx]) return;
        const rawList = items.map((it, i) => i === idx ? it.grossGrams * 10 : it.grossGrams);
        const el = document.getElementById('dw-pb-weights-raw');
        if (el) el.value = rawList.join('\n');
        window.parsePoultryWeightsList();
        window.onDeliStudioInputChange();
    };

    window.removeSinglePoultryWeight = function (idx) {
        const items = window.poultryBatchState.parsedItems || [];
        const rawList = items.filter((_, i) => i !== idx).map(it => it.grossGrams);
        const el = document.getElementById('dw-pb-weights-raw');
        if (el) el.value = rawList.join('\n');
        window.parsePoultryWeightsList();
        window.onDeliStudioInputChange();
    };

    window.quickAddSingleScaleWeight = function () {
        const quickInp = document.getElementById('dw-pb-quick-weight');
        const rawArea = document.getElementById('dw-pb-weights-raw');
        if (!quickInp || !rawArea) return;
        const val = normalizeScaleDigits(quickInp.value).trim();
        if (!val || isNaN(parseFloat(val))) return;
        rawArea.value = (rawArea.value.trim() ? rawArea.value.trim() + '\n' : '') + val;
        quickInp.value = '';
        quickInp.focus();
        window.parsePoultryWeightsList();
        window.poultryBatchState.previewIdx = Math.max(0, window.poultryBatchState.parsedItems.length - 1);
        window.onDeliStudioInputChange();
    };

    // سحب الأوزان أو البيانات من الموقع بنفس الترتيب بالمللي أو لصقها من الحافظة
    window.pullWeightsFromLiveSystemOrClipboard = async function (sourceMode = 'auto') {
        const rawArea = document.getElementById('dw-pb-weights-raw');
        if (!rawArea) return;

        // 1. إذا طلب سحب من الموقع مباشرة: يفحص أي خانات أوزان في الصفحة بنفس ترتيب ظهورها من فوق لتحت
        if (sourceMode === 'site_dom' || sourceMode === 'auto') {
            const domInputs = Array.from(document.querySelectorAll('[data-scale-weight], .scale-weight-item, input[name*="weight" i]'))
                .map(el => normalizeScaleDigits(el.value || el.getAttribute('data-scale-weight') || el.innerText || '').trim())
                .filter(v => /^\d+(?:\.\d+)?$/.test(v) && Number(v) > 0);

            if (domInputs.length > 0) {
                rawArea.value = domInputs.join('\n');
                window.parsePoultryWeightsList();
                window.onDeliStudioInputChange();
                return notifyPrinterToast(`✅ تم سحب (${domInputs.length}) وزن من شاشة الموقع بنفس الترتيب!`);
            }

            if (Array.isArray(window.liveScaleWeights) && window.liveScaleWeights.length > 0) {
                rawArea.value = window.liveScaleWeights.join('\n');
                window.parsePoultryWeightsList();
                window.onDeliStudioInputChange();
                return notifyPrinterToast(`✅ تم سحب (${window.liveScaleWeights.length}) وزن من السيستم الحي بنفس الترتيب!`);
            }

            if (typeof db !== 'undefined' && sourceMode === 'site_dom') {
                try {
                    const snap = await db.collection('inventory').doc('live_scale').get();
                    if (snap.exists && Array.isArray(snap.data()?.weights) && snap.data().weights.length > 0) {
                        rawArea.value = snap.data().weights.join('\n');
                        if (snap.data().kiloPrice) document.getElementById('dw-pb-kilo-price').value = snap.data().kiloPrice;
                        if (snap.data().productName) document.getElementById('dw-pb-name').value = snap.data().productName;
                        window.parsePoultryWeightsList();
                        window.onDeliStudioInputChange();
                        return notifyPrinterToast(`✅ تم سحب (${snap.data().weights.length}) وزن من قاعدة البيانات بنفس الترتيب!`);
                    }
                } catch (e) {}
            }
        }

        // 2. اللصق الذكي من الحافظة (Clipboard) بنفس ترتيب السطور
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                const clipTxt = await navigator.clipboard.readText();
                if (clipTxt && clipTxt.trim()) {
                    rawArea.value = clipTxt.trim();
                    const parsed = window.parsePoultryWeightsList();
                    window.onDeliStudioInputChange();
                    if (parsed.length > 0) {
                        return notifyPrinterToast(`📋 تم لصق وترتيب (${parsed.length}) وزن بنفس التسلسل (#1 إلى #${parsed.length})!`);
                    }
                }
            } catch (e) {}
        }

        notifyPrinterToast('💡 الصق الأوزان مباشرة في المربع أو انسخها من أي شيت/رسالة ثم اضغط هنا.');
    };

    window.copyPoultryBatchToWhatsApp = function () {
        const items = window.parsePoultryWeightsList();
        if (items.length === 0) return alert('أدخل الأوزان أولاً لنسخ الكشف!');
        const prodName = document.getElementById('dw-pb-name')?.value || 'فراخ طازجة';
        const kiloPrice = document.getElementById('dw-pb-kilo-price')?.value || '110';
        const totalGrams = items.reduce((s, i) => s + i.netGrams, 0);
        const totalCash = items.reduce((s, i) => s + i.price, 0);

        let lines = [
            `🐔 *بيان أوزان وتسعير: ${prodName}*`,
            `📅 التاريخ: ${new Date().toLocaleDateString('ar-EG')} | سعر الكيلو: ${kiloPrice} ج`,
            `--------------------------------`
        ];
        items.forEach(it => {
            lines.push(`#${it.index} ⬅️ الوزن: *${it.netGrams} جم* = *${it.price} ج.م*`);
        });
        lines.push(`--------------------------------`);
        lines.push(`📦 *إجمالي العدد:* ${items.length} قطعة`);
        lines.push(`⚖️ *إجمالي الوزن الصافي:* ${(totalGrams / 1000).toFixed(3)} كجم`);
        lines.push(`💰 *الإجمالي المطلوب:* ${totalCash.toLocaleString()} ج.م`);

        const text = lines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => notifyPrinterToast('📲 تم نسخ كشف الأوزان بالترتيب للواتساب!'));
        } else {
            prompt('انسخ الكشف التالي:', text);
        }
    };

    // =========================================================================
    // 🎨 دوال رسم المربعات المرنة (تطبق إعدادات الارتفاع والعرض والاستايل لكل مربع)
    // =========================================================================
    function drawStyledBoxOnCanvas(ctx, x, y, w, h, styleMode) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';

        if (styleMode === 'inverted') {
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            return { textColor: '#FFFFFF', bgFilled: true };
        }
        if (styleMode === 'double') {
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
        } else if (styleMode === 'rounded') {
            const r = Math.min(16, Math.floor(Math.min(w, h) * 0.18));
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.stroke();
        } else if (styleMode === 'dashed') {
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        } else if (styleMode === 'solid') {
            ctx.lineWidth = 3.5;
            ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
        return { textColor: '#000000', bgFilled: false };
    }

    // رسم تكت الفراخ المرن (يدعم التحكم في كل مربع: إخفاء/إظهار، تكبير، ترتيب، استايل)
    window.renderSinglePoultryScaleTag203DPI = function (itemObj, totalItemsCount, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);
        const bcCfg = getBoxCustomConfig();
        const boxes = bcCfg.boxes;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        const padPct = (Number(cfg.paddingPct) || 100) / 100;
        const pad = Math.max(6, Math.round(Math.min(W, H) * 0.025 * padPct));
        const borderStyle = cfg.borderStyle || 'double';
        drawCustomFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, borderStyle);

        const globalScale = Math.min(1.45, Math.max(0.65, (Number(cfg.fontScalePct) || 100) / 100));
        const innerMargin = borderStyle === 'double' ? 12 : 8;
        const innerLeft = pad + innerMargin;
        const innerRight = W - pad - innerMargin;
        const innerWidth = innerRight - innerLeft;

        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();
        const prodName = (document.getElementById('dw-pb-name')?.value || 'فراخ تسمين طازجة - ذبح اليوم').trim();
        const dateNote = (document.getElementById('dw-pb-date-note')?.value || `ذبح: ${new Date().toLocaleDateString('ar-EG')} • طازج 100%`).trim();

        let curY = pad + innerMargin;
        const hitRegions = [];

        const sectionOrder = bcCfg.poultryOrder || ['pb_header', 'pb_title', 'pb_metrics', 'pb_barcode'];

        sectionOrder.forEach(secKey => {
            // 1. مربع الهيدر
            if (secKey === 'pb_header' && boxes.pb_header?.visible !== false) {
                const b = boxes.pb_header;
                const hMul = (Number(b.hScale) || 100) / 100;
                const fMul = ((Number(b.fScale) || 100) / 100) * globalScale;
                const boxW = Math.round(innerWidth * ((Number(b.wScale) || 100) / 100));
                const boxX = innerLeft + Math.round((innerWidth - boxW) / 2);
                const hdrH = Math.max(22, Math.round(H * 0.155 * hMul));

                const st = drawStyledBoxOnCanvas(ctx, boxX, curY, boxW, hdrH, b.style || 'inverted');
                ctx.fillStyle = st.textColor;
                ctx.textBaseline = 'middle';

                ctx.textAlign = 'right';
                ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.50 * fMul))}px Cairo, Tahoma, sans-serif`;
                const hdrText = (b.label && b.label.trim()) ? b.label.trim() : `${storeName} (${storePhone})`;
                ctx.fillText(hdrText, boxX + boxW - 8, curY + hdrH / 2);

                ctx.textAlign = 'left';
                ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.48 * fMul))}px monospace`;
                ctx.fillText(`#${itemObj.index}/${totalItemsCount}`, boxX + 8, curY + hdrH / 2);

                hitRegions.push({ key: 'pb_header', x: boxX, y: curY, w: boxW, h: hdrH });
                curY += hdrH + Math.max(4, Math.round(H * 0.025));
            }

            // 2. مربع اسم الصنف والتاريخ
            if (secKey === 'pb_title' && boxes.pb_title?.visible !== false) {
                const b = boxes.pb_title;
                const hMul = (Number(b.hScale) || 100) / 100;
                const fMul = ((Number(b.fScale) || 100) / 100) * globalScale;
                const boxW = Math.round(innerWidth * ((Number(b.wScale) || 100) / 100));
                const boxX = innerLeft + Math.round((innerWidth - boxW) / 2);
                const titleBoxH = Math.max(30, Math.round(H * 0.19 * hMul));

                const st = drawStyledBoxOnCanvas(ctx, boxX, curY, boxW, titleBoxH, b.style || 'none');
                ctx.fillStyle = st.textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const fProd = Math.max(13, Math.round(H * 0.10 * fMul));
                ctx.font = `900 ${fProd}px Cairo, Tahoma, sans-serif`;
                ctx.fillText((b.label && b.label.trim()) ? b.label.trim() : prodName.slice(0, 38), W / 2, curY + Math.round(titleBoxH * 0.36));

                const fDate = Math.max(9, Math.round(H * 0.06 * fMul));
                ctx.font = `800 ${fDate}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(dateNote.slice(0, 48), W / 2, curY + Math.round(titleBoxH * 0.76));

                hitRegions.push({ key: 'pb_title', x: boxX, y: curY, w: boxW, h: titleBoxH });
                curY += titleBoxH + Math.max(4, Math.round(H * 0.025));
            }

            // 3. مربعات الميزان والتسعير (الوزن | سعر الكيلو | السعر المطلوب)
            if (secKey === 'pb_metrics') {
                const activeCols = [];
                if (boxes.pb_price?.visible !== false) activeCols.push({ key: 'pb_price', cfg: boxes.pb_price, title: boxes.pb_price?.label || 'السعر المطلوب', val: `${itemObj.price} ج.م`, defaultW: 42, isMain: true });
                if (boxes.pb_rate?.visible !== false) activeCols.push({ key: 'pb_rate', cfg: boxes.pb_rate, title: boxes.pb_rate?.label || 'سعر الكيلو', val: `${itemObj.kiloPrice} ج`, defaultW: 25, isMain: false });
                if (boxes.pb_weight?.visible !== false) activeCols.push({ key: 'pb_weight', cfg: boxes.pb_weight, title: boxes.pb_weight?.label || 'الوزن الصافي', val: `${itemObj.netGrams} جم`, defaultW: 33, isMain: false });

                if (activeCols.length > 0) {
                    const maxHMul = Math.max(...activeCols.map(c => (Number(c.cfg?.hScale) || 100) / 100));
                    const boxesH = Math.max(42, Math.round(H * 0.30 * maxHMul));
                    const gapX = activeCols.length > 1 ? Math.max(6, Math.round(innerWidth * 0.02)) : 0;
                    const totalGap = gapX * (activeCols.length - 1);
                    const availW = innerWidth - totalGap;
                    const totalWeightRatio = activeCols.reduce((s, c) => s + (Number(c.cfg?.wScale) || c.defaultW), 0) || 100;

                    let curX = innerLeft;
                    activeCols.forEach((col, cIdx) => {
                        const colW = (cIdx === activeCols.length - 1)
                            ? (innerRight - curX)
                            : Math.round(availW * ((Number(col.cfg?.wScale) || col.defaultW) / totalWeightRatio));
                        const fMul = ((Number(col.cfg?.fScale) || 100) / 100) * globalScale;
                        const st = drawStyledBoxOnCanvas(ctx, curX, curY, colW, boxesH, col.cfg?.style || (col.isMain ? 'inverted' : 'solid'));

                        ctx.fillStyle = st.textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.font = `900 ${Math.max(9, Math.round(boxesH * 0.22 * fMul))}px Cairo, Tahoma, sans-serif`;
                        ctx.fillText(col.title, curX + colW / 2, curY + 5);

                        ctx.textBaseline = 'middle';
                        ctx.font = `900 ${Math.max(13, Math.round(boxesH * (col.isMain ? 0.44 : 0.38) * fMul))}px Cairo, Tahoma, sans-serif`;
                        ctx.fillText(col.val, curX + colW / 2, curY + Math.round(boxesH * 0.67));

                        hitRegions.push({ key: col.key, x: curX, y: curY, w: colW, h: boxesH });
                        curX += colW + gapX;
                    });

                    curY += boxesH + Math.max(4, Math.round(H * 0.025));
                }
            }

            // 4. مربع الباركود والفوتر
            if (secKey === 'pb_barcode' && boxes.pb_barcode?.visible !== false) {
                const b = boxes.pb_barcode;
                const hMul = (Number(b.hScale) || 100) / 100;
                const fMul = ((Number(b.fScale) || 100) / 100) * globalScale;
                const remainingH = Math.max(24, H - pad - innerMargin - curY);
                const bcBoxH = Math.min(remainingH, Math.round(H * 0.22 * hMul));

                drawStyledBoxOnCanvas(ctx, innerLeft, curY, innerWidth, bcBoxH, b.style || 'none');
                ctx.fillStyle = '#000000';

                if (cfg.showBarcode !== false && bcBoxH >= 20) {
                    const bcText = `P${itemObj.index}-${itemObj.netGrams}-${Math.round(itemObj.price)}`;
                    const barH = Math.max(14, Math.min(Math.round(H * 0.13 * hMul), bcBoxH - 14));
                    drawBarcodeOnCanvas(ctx, bcText, W / 2, curY + 2, Math.round(innerWidth * 0.82), barH);
                }
                if (cfg.footerText) {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.font = `900 ${Math.max(9, Math.round(H * 0.052 * fMul))}px Cairo, Tahoma, sans-serif`;
                    ctx.fillText(cfg.footerText.trim().slice(0, 52), W / 2, H - pad - Math.max(3, Math.floor(innerMargin * 0.3)));
                }
                hitRegions.push({ key: 'pb_barcode', x: innerLeft, y: curY, w: innerWidth, h: bcBoxH });
                curY += bcBoxH;
            }
        });

        window.poultryBatchState.hitRegions = hitRegions;
        ctx.restore();
        return canvas;
    };

    // دوال مساعدة لرسم خطوط ومربعات حادة 100% بدون أي تشويش رمادي في الطابعة الحرارية
    function drawSharpHLine(ctx, x, y, w, thickness = 2) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.max(1, Math.round(thickness)));
    }

    function drawSharpVLine(ctx, x, y, h, thickness = 2) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(thickness)), Math.round(h));
    }

    function drawSharpRectBorder(ctx, x, y, w, h, thickness = 3) {
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rw = Math.round(w);
        const rh = Math.round(h);
        const t = Math.max(1, Math.round(thickness));
        ctx.fillStyle = '#000000';
        ctx.fillRect(rx, ry, rw, t);               // أعلى
        ctx.fillRect(rx, ry + rh - t, rw, t);      // أسفل
        ctx.fillRect(rx, ry, t, rh);               // يسار
        ctx.fillRect(rx + rw - t, ry, t, rh);      // يمين
    }

    // تنظيف اسم الصنف وتفاصيل الأوزان ليظهر في الفاتورة بشكل شيك بدون أقواس معقدة أو رموز
    function formatCleanInvoiceItem(item, prodsObj, showWeightInfo) {
        let rawName = String(item.name || 'صنف').trim();
        let subDetail = '';

        // إذا كان الصنف مباعاً بالميزان ويحتوي على تفاصيل مثل: فراخ [2 فرخة = 2.8 كجم] (1400 + 1400 جم)
        const bracketMatch = rawName.match(/^(.*?)\s*\[(.*?)\]\s*(?:\((.*?)\))?$/);
        if (bracketMatch) {
            rawName = bracketMatch[1].trim();
            const summaryPart = bracketMatch[2].replace('=', '•').trim();
            subDetail = summaryPart;
        } else {
            const pInfo = prodsObj[item.id] || {};
            if (showWeightInfo !== false && pInfo.weight) {
                subDetail = pInfo.weight;
            }
        }

        // تنسيق الكمية بدون حرف x
        const rawQty = Number(item.quantity) || 1;
        let qtyText = Number.isInteger(rawQty) ? String(rawQty) : String(Number(rawQty.toFixed(2)));
        if (bracketMatch && item.birdsCount) {
            qtyText = `${item.birdsCount} (${qtyText} ك)`;
        }

        return {
            title: rawName,
            subDetail: subDetail,
            qtyText: qtyText,
            lineTotal: Math.round(rawQty * (Number(item.price) || 0))
        };
    }

    // رسم فاتورة سمان ههيا الشيك والواضحة جداً (مصممة لمقاس 70×130 مم وتتكيف مع أي مقاس)
    function renderFlexibleShippingWaybill203DPI(order, cfg, indexNum = 1, totalCount = 1, bagIndex = 1, bagsTotal = 1) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);
        const bcCfg = getBoxCustomConfig();
        const boxes = bcCfg.boxes;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // تفعيل الاتجاه العربي الصحيح لمنع تداخل الأرقام والأقواس
        ctx.direction = 'rtl';

        // خلفية بيضاء نقية 100%
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        const padPct = (Number(cfg.paddingPct) || 100) / 100;
        const pad = Math.max(8, Math.round(Math.min(W, H) * 0.022 * padPct));
        const borderStyle = cfg.borderStyle || 'double';

        // رسم الإطار الخارجي بخطوط هندسية حادة لا تقطع في الطابعة الحرارية
        if (borderStyle === 'double') {
            drawSharpRectBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, 4);
            drawSharpRectBorder(ctx, pad + 7, pad + 7, W - (pad + 7) * 2, H - (pad + 7) * 2, 2);
        } else if (borderStyle !== 'none') {
            drawSharpRectBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, 4);
        }

        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();
        const storeSlogan = (typeof storeSettings !== 'undefined' && storeSettings.waybillSlogan)
            ? storeSettings.waybillSlogan
            : 'أصل الطعم يبدأ من التربية 🤍 طازج لمائدتك';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');

        const globalScale = Math.min(1.35, Math.max(0.75, (Number(cfg.fontScalePct) || 100) / 100));
        const innerMargin = borderStyle === 'double' ? 16 : 12;
        const innerLeft = pad + innerMargin;
        const innerRight = W - pad - innerMargin;
        const innerWidth = innerRight - innerLeft;

        // أحجام خطوط موزونة بدقة لمقاس 70×130 مم (عرض 560 نقطة × طول 1040 نقطة)
        const fBrand = Math.max(24, Math.round(W * 0.068 * globalScale));
        const fSlogan = Math.max(14, Math.round(W * 0.033 * globalScale));
        const fSecTitle = Math.max(17, Math.round(W * 0.041 * globalScale));
        const fBody = Math.max(16, Math.round(W * 0.038 * globalScale));
        const fSmall = Math.max(13, Math.round(W * 0.031 * globalScale));
        const fTotalVal = Math.max(24, Math.round(W * 0.062 * globalScale));

        let curY = pad + innerMargin + 4;
        const hitRegions = [];

        // =====================================================================
        // 1. الهيدر الأنيق (اسم البراند + الجملة الترحيبية + التليفون والتاريخ بدون أكواد شحن)
        // =====================================================================
        if (boxes.header?.visible !== false) {
            const startHeaderY = curY;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            if (cfg.showLogo !== false) {
                ctx.font = `900 ${fBrand}px Cairo, Tahoma, sans-serif`;
                const titleTxt = (boxes.header?.label && boxes.header.label.trim()) ? boxes.header.label.trim() : storeName;
                ctx.fillText(titleTxt, Math.round(W / 2), curY);
                curY += fBrand + 6;

                ctx.font = `800 ${fSlogan}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(storeSlogan, Math.round(W / 2), curY);
                curY += fSlogan + 10;
            }

            // شريط رفيع أنيق للتليفون والتاريخ
            drawSharpHLine(ctx, innerLeft, curY, innerWidth, 2);
            curY += 7;

            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(`للتواصل: ${storePhone}`, innerRight - 4, curY);

            ctx.textAlign = 'left';
            const showBagPill = (bagsTotal > 1) || cfg.alwaysShowBagBadge;
            const dateAndBagTxt = showBagPill
                ? `شنطة ${bagIndex}/${bagsTotal} • ${orderDateStr}`
                : `التاريخ: ${orderDateStr}`;
            ctx.fillText(dateAndBagTxt, innerLeft + 4, curY);

            curY += fSmall + 8;
            drawSharpHLine(ctx, innerLeft, curY, innerWidth, 3);

            // إذا طلب المستخدم صراحة إظهار الباركود من الإعدادات فقط
            if (cfg.showBarcode === true) {
                curY += 6;
                const orderShortId = (order.id || '100200').slice(-6).toUpperCase();
                drawBarcodeOnCanvas(ctx, orderShortId, Math.round(W / 2), curY, Math.round(innerWidth * 0.7), 32);
                curY += 36;
                drawSharpHLine(ctx, innerLeft, curY, innerWidth, 2);
            }

            hitRegions.push({ key: 'header', x: innerLeft, y: startHeaderY, w: innerWidth, h: curY - startHeaderY });
            curY += 12;
        }

        // =====================================================================
        // 2. بطاقة العميل الشيك (بدون ملاحظات الدليفري ولا ملاحظات الإدارة)
        // =====================================================================
        if (boxes.customer?.visible !== false) {
            const startCustY = curY;
            const custPrefix = (boxes.customer?.label && boxes.customer.label.trim()) ? boxes.customer.label.trim() : 'عميلنا العزيز:';
            const custNameClean = (order.customerName || 'عميل سمان ههيا').trim();
            const phonesLine = `${order.customerPhone || ''}${order.customerPhone2 ? ' - ' + order.customerPhone2 : ''}`;
            const zoneClean = (order.zone || '').trim();
            const addrClean = (order.customerAddress || '').trim();
            const fullLocation = [zoneClean, addrClean].filter(Boolean).join(' - ') || 'استلام حسب المنطقة';

            ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
            const addrLines = wrapThermalText(ctx, `العنوان: ${fullLocation}`, innerWidth - 24).slice(0, 2);

            const custBoxH = Math.round(18 + (fSecTitle + 8) + (fBody + 8) + (addrLines.length * (fSmall + 6)) + 10);
            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, custBoxH, 3);

            let cy = curY + 10;

            // شارة المنطقة في اليسار داخل برواز أبيض نظيف لا يسحب حبر أسود ثقيل
            if (zoneClean) {
                ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
                const zW = Math.min(Math.round(innerWidth * 0.36), Math.max(90, Math.round(ctx.measureText(zoneClean).width + 24)));
                const zH = fSecTitle + 10;
                drawSharpRectBorder(ctx, innerLeft + 10, cy - 2, zW, zH, 2);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(zoneClean, innerLeft + 10 + Math.round(zW / 2), cy - 2 + Math.round(zH / 2));
            }

            // اسم العميل
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.font = `900 ${fSecTitle}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`${custPrefix} ${custNameClean.slice(0, 24)}`, innerRight - 12, cy);
            cy += fSecTitle + 8;

            // رقم الموبايل
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`موبايل: ${phonesLine}`, innerRight - 12, cy);
            cy += fBody + 6;

            // خط فاصل رفيع داخل كارت العميل ثم العنوان
            drawSharpHLine(ctx, innerLeft + 10, cy, innerWidth - 20, 1);
            cy += 6;

            ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
            addrLines.forEach(line => {
                ctx.fillText(line, innerRight - 12, cy);
                cy += fSmall + 5;
            });

            hitRegions.push({ key: 'customer', x: innerLeft, y: startCustY, w: innerWidth, h: custBoxH });
            curY += custBoxH + 12;
        }

        // =====================================================================
        // 3. جدول تفاصيل الطلب (فاتورة أنيقة بدون حرف x وبدون تكديس)
        // =====================================================================
        const itemsList = Array.isArray(order.items) ? order.items : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        if (boxes.items?.visible !== false) {
            const startItemsY = curY;
            const thH = Math.max(32, fBody + 14);

            // رأس الجدول بخلفية بيضاء نظيفة وإطار علوي وسفلي سميك لطباعة حرارية فائقة الوضوح
            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, thH, 3);

            const showPrices = cfg.showItemsPrice !== false;
            const priceColW = showPrices ? Math.round(innerWidth * 0.24) : 0;
            const qtyColW = Math.round(innerWidth * 0.22);
            const itemColRight = innerRight - 10;
            const qtyColCenter = innerLeft + priceColW + Math.round(qtyColW / 2);
            const priceColCenter = innerLeft + Math.round(priceColW / 2);

            ctx.fillStyle = '#000000';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;

            ctx.textAlign = 'right';
            const tblTitle = (boxes.items?.label && boxes.items.label.trim()) ? boxes.items.label.trim() : 'الصنف';
            ctx.fillText(tblTitle, itemColRight, curY + Math.round(thH / 2));

            ctx.textAlign = 'center';
            ctx.fillText('الكمية', qtyColCenter, curY + Math.round(thH / 2));
            if (showPrices) {
                ctx.fillText('الإجمالي', priceColCenter, curY + Math.round(thH / 2));
            }

            // خطوط رأسية فاصلة في الهيدر
            drawSharpVLine(ctx, innerLeft + priceColW + qtyColW, curY, thH, 2);
            if (showPrices) {
                drawSharpVLine(ctx, innerLeft + priceColW, curY, thH, 2);
            }

            curY += thH;

            const maxRows = Math.max(1, Math.min(itemsList.length || 1, 7));
            for (let idx = 0; idx < maxRows; idx++) {
                const rawItem = itemsList[idx];
                if (!rawItem) break;

                const formatted = formatCleanInvoiceItem(rawItem, prodsObj, cfg.showWeightInfo);
                const nameColMaxW = innerWidth - priceColW - qtyColW - 20;

                ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
                const titleLines = wrapThermalText(ctx, formatted.title, nameColMaxW).slice(0, 2);
                const hasSub = Boolean(formatted.subDetail);

                const rowH = Math.max(
                    38,
                    Math.round((titleLines.length * (fBody + 4)) + (hasSub ? (fSmall + 4) : 0) + 14)
                );

                // إطار الصف والخطوط الرأسية
                drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, rowH, 2);
                drawSharpVLine(ctx, innerLeft + priceColW + qtyColW, curY, rowH, 2);
                if (showPrices) {
                    drawSharpVLine(ctx, innerLeft + priceColW, curY, rowH, 2);
                }

                // كتابة اسم الصنف (وتفاصيل الوزن تحته بهدوء إن وجد)
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                let textY = curY + 7;
                ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
                titleLines.forEach(ln => {
                    ctx.fillText(ln, itemColRight, textY);
                    textY += fBody + 3;
                });

                if (hasSub) {
                    ctx.font = `800 ${Math.max(11, fSmall - 1)}px Cairo, Tahoma, sans-serif`;
                    ctx.fillText(formatted.subDetail, itemColRight, textY);
                }

                // الكمية في المنتصف بدون علامة x
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(formatted.qtyText, qtyColCenter, curY + Math.round(rowH / 2));

                // الإجمالي للسطر
                if (showPrices) {
                    ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
                    ctx.fillText(`${formatted.lineTotal} ج`, priceColCenter, curY + Math.round(rowH / 2));
                }

                curY += rowH;
            }

            if (itemsList.length > maxRows) {
                const moreH = fSmall + 12;
                drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, moreH, 2);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(`+ ${itemsList.length - maxRows} أصناف إضافية ضمن الطلب`, Math.round(W / 2), curY + Math.round(moreH / 2));
                curY += moreH;
            }

            hitRegions.push({ key: 'items', x: innerLeft, y: startItemsY, w: innerWidth, h: curY - startItemsY });
            curY += 12;
        }

        // =====================================================================
        // 4. ملخص الحساب المالي والصافي المطلوب (بدون كتل سوداء تلطخ الورقة)
        // =====================================================================
        if (boxes.cod?.visible !== false) {
            const startCodY = curY;
            const isOnline = order.paymentMethod === 'online';
            const subtotal = Number(order.subtotal) || Number(order.total) || 0;
            const delivery = Number(order.deliveryFee) || 0;
            const discount = Number(order.discount) || 0;
            const total = Number(order.total) || 0;
            const debt = Number(order.debt) || 0;

            // سطر تفصيل الحساب (المنتجات + التوصيل + الخصم)
            const breakdownH = fSmall + 16;
            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, breakdownH, 2);
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;

            let breakdownParts = [`المنتجات: ${subtotal} ج`];
            breakdownParts.push(delivery > 0 ? `التوصيل: ${delivery} ج` : `التوصيل: مجاني`);
            if (discount > 0) breakdownParts.push(`خصم: -${discount} ج`);
            if (debt > 0) breakdownParts.push(`باقي حساب: ${debt} ج`);

            ctx.fillText(breakdownParts.join('  •  '), Math.round(W / 2), curY + Math.round(breakdownH / 2));
            curY += breakdownH + 6;

            // الصندوق الرئيسي للإجمالي النهائي (برواز مزدوج فخم وحاد جداً)
            const totalBoxH = Math.max(54, fTotalVal + 24);
            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, totalBoxH, 4);
            drawSharpRectBorder(ctx, innerLeft + 5, curY + 5, innerWidth - 10, totalBoxH - 10, 1);

            const codTitle = (boxes.cod?.label && boxes.cod.label.trim())
                ? boxes.cod.label.trim()
                : (isOnline ? 'حالة الفاتورة:' : 'الإجمالي المطلوب:');

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            ctx.font = `900 ${fSecTitle}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(codTitle, innerRight - 14, curY + Math.round(totalBoxH / 2));

            ctx.textAlign = 'left';
            ctx.font = `900 ${fTotalVal}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(isOnline ? 'خالص أونلاين' : `${total} ج.م`, innerLeft + 14, curY + Math.round(totalBoxH / 2));

            curY += totalBoxH;
            hitRegions.push({ key: 'cod', x: innerLeft, y: startCodY, w: innerWidth, h: curY - startCodY });
            curY += 10;
        }

        // =====================================================================
        // 5. رسالة الختام الدافئة للعميل (توصل بحب وشياكة)
        // =====================================================================
        if (boxes.footer?.visible !== false) {
            const startFooterY = curY;

            if (cfg.showPromoBanner && cfg.promoText && cfg.promoText.trim()) {
                const pH = fSmall + 14;
                drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, pH, 2);
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(cfg.promoText.trim().slice(0, 58), Math.round(W / 2), curY + Math.round(pH / 2));
                curY += pH + 8;
            }

            const footerMsg = (cfg.footerText && cfg.footerText.trim())
                ? cfg.footerText.trim()
                : 'بالهنا والشفا من سمان ههيا 🤍 تشرفنا بخدمتكم';

            const footerY = Math.max(curY + fSmall, H - pad - innerMargin - 4);
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(footerMsg, Math.round(W / 2), footerY);

            hitRegions.push({ key: 'footer', x: innerLeft, y: startFooterY, w: innerWidth, h: Math.max(24, H - startFooterY - pad) });
        }

        window.poultryBatchState.hitRegions = hitRegions;
        ctx.restore();
        return canvas;
    }

    function renderPoultryBatchMasterSummaryCanvas(itemsList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        const pad = Math.max(8, Math.round(Math.min(W, H) * 0.03));
        drawCustomFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, cfg.borderStyle || 'double');

        const prodName = (document.getElementById('dw-pb-name')?.value || 'دفعة فراخ طازجة').trim();
        const totalGrams = itemsList.reduce((s, i) => s + i.netGrams, 0);
        const totalCash = itemsList.reduce((s, i) => s + i.price, 0);
        const avgGrams = itemsList.length > 0 ? Math.round(totalGrams / itemsList.length) : 0;

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const fH = Math.max(14, Math.round(H * 0.11));
        ctx.font = `900 ${fH}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('📦 ملصق إجمالي الدفعة والبرنيكة', W / 2, pad + 10);

        const fSub = Math.max(12, Math.round(H * 0.085));
        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${prodName} (${new Date().toLocaleDateString('ar-EG')})`, W / 2, pad + 16 + fH);

        let curY = pad + 26 + fH + fSub;
        ctx.textAlign = 'right';
        ctx.font = `900 ${Math.max(11, Math.round(H * 0.08))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`• إجمالي العدد بالدفعة: ${itemsList.length} فرخة / عبوة`, W - pad - 16, curY);
        curY += Math.round(H * 0.11);
        ctx.fillText(`• إجمالي الوزن الصافي: ${(totalGrams / 1000).toFixed(3)} كجم (${totalGrams} جم)`, W - pad - 16, curY);
        curY += Math.round(H * 0.11);
        ctx.fillText(`• متوسط وزن القطعة: ${avgGrams} جم | الكيلو: ${itemsList[0]?.kiloPrice || 0} ج`, W - pad - 16, curY);

        const boxH = Math.max(30, Math.round(H * 0.20));
        ctx.fillStyle = '#000000';
        ctx.fillRect(pad + 12, H - pad - boxH - 10, W - (pad + 12) * 2, boxH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(14, Math.round(boxH * 0.52))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`إجمالي قيمة الدفعة: ${totalCash.toLocaleString()} ج.م`, W / 2, H - pad - 10 - boxH / 2);

        return canvas;
    }

    // =========================================================================
    // 🎛️ واجهة التحكم الحر في المربعات باللمس والمساطر داخل استوديو waybill.js
    // =========================================================================
    const BOX_META_CATALOG = {
        shipping: [
            { key: 'header',   name: '1. مربع الهيدر والباركود' },
            { key: 'customer', name: '2. مربع العميل والمنطقة' },
            { key: 'items',    name: '3. جدول الأصناف' },
            { key: 'cod',      name: '4. مربع المطلوب تحصيله' },
            { key: 'footer',   name: '5. الملاحظات والدعاية' }
        ],
        poultry_batch: [
            { key: 'pb_header',  name: '1. هيدر المتجر ورقم التكت' },
            { key: 'pb_title',   name: '2. مربع اسم الصنف والتاريخ' },
            { key: 'pb_weight',  name: '3. مربع الوزن الصافي' },
            { key: 'pb_rate',    name: '4. مربع سعر الكيلو' },
            { key: 'pb_price',   name: '5. مربع السعر المطلوب' },
            { key: 'pb_barcode', name: '6. مربع الباركود السفلي' }
        ]
    };

    window.selectInteractiveStudioBox = function (boxKey) {
        window.poultryBatchState.activeBoxKey = boxKey;
        const bcCfg = getBoxCustomConfig();
        const b = bcCfg.boxes[boxKey] || { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', label: '' };

        document.querySelectorAll('.dw-interactive-box-pill').forEach(btn => {
            const k = btn.getAttribute('data-box-key');
            btn.className = (k === boxKey)
                ? 'dw-interactive-box-pill px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-400 text-slate-950 shadow-sm transition-all'
                : 'dw-interactive-box-pill px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all';
        });

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

        setChk('dw-bx-visible', b.visible !== false);
        setVal('dw-bx-hscale', b.hScale || 100);
        setTxt('dw-bx-hscale-lbl', (b.hScale || 100) + '%');
        setVal('dw-bx-wscale', b.wScale || 100);
        setTxt('dw-bx-wscale-lbl', (b.wScale || 100) + '%');
        setVal('dw-bx-fscale', b.fScale || 100);
        setTxt('dw-bx-fscale-lbl', (b.fScale || 100) + '%');
        setVal('dw-bx-style', b.style || 'solid');
        setVal('dw-bx-label', b.label || '');
    };

    window.onInteractiveBoxControlChange = function (field, value) {
        const boxKey = window.poultryBatchState.activeBoxKey;
        if (!boxKey) return;
        const bcCfg = getBoxCustomConfig();
        if (!bcCfg.boxes[boxKey]) bcCfg.boxes[boxKey] = { visible: true, hScale: 100, wScale: 100, fScale: 100, style: 'solid', label: '' };

        if (field === 'visible') bcCfg.boxes[boxKey].visible = Boolean(value);
        else if (field === 'hScale') {
            bcCfg.boxes[boxKey].hScale = Number(value) || 100;
            const lbl = document.getElementById('dw-bx-hscale-lbl');
            if (lbl) lbl.innerText = bcCfg.boxes[boxKey].hScale + '%';
        } else if (field === 'wScale') {
            bcCfg.boxes[boxKey].wScale = Number(value) || 100;
            const lbl = document.getElementById('dw-bx-wscale-lbl');
            if (lbl) lbl.innerText = bcCfg.boxes[boxKey].wScale + '%';
        } else if (field === 'fScale') {
            bcCfg.boxes[boxKey].fScale = Number(value) || 100;
            const lbl = document.getElementById('dw-bx-fscale-lbl');
            if (lbl) lbl.innerText = bcCfg.boxes[boxKey].fScale + '%';
        } else if (field === 'style') {
            bcCfg.boxes[boxKey].style = value;
        } else if (field === 'label') {
            bcCfg.boxes[boxKey].label = value;
        }

        saveBoxCustomConfig(bcCfg);
        window.onDeliStudioInputChange();
    };

    window.moveInteractiveStudioBoxOrder = function (delta) {
        const mode = document.getElementById('dw-template-mode')?.value || 'shipping';
        const bcCfg = getBoxCustomConfig();
        let activeKey = window.poultryBatchState.activeBoxKey;

        if (mode === 'poultry_batch' && ['pb_weight', 'pb_rate', 'pb_price'].includes(activeKey)) {
            activeKey = 'pb_metrics';
        }

        const arrKey = mode === 'poultry_batch' ? 'poultryOrder' : 'shippingOrder';
        const orderArr = bcCfg[arrKey] || [];
        const idx = orderArr.indexOf(activeKey);
        if (idx === -1) return;
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= orderArr.length) return;

        const tmp = orderArr[idx];
        orderArr[idx] = orderArr[nextIdx];
        orderArr[nextIdx] = tmp;

        saveBoxCustomConfig(bcCfg);
        window.onDeliStudioInputChange();
        notifyPrinterToast('✨ تم تحريك المربع وحفظ ترتيبه الجديد!');
    };

    window.resetInteractiveStudioBoxes = function () {
        if (!confirm('هل تريد استعادة أبعاد وترتيب المربعات الافتراضي؟')) return;
        saveBoxCustomConfig(JSON.parse(JSON.stringify(defaultBoxCustomizations)));
        refreshBoxControllerPillsForMode(document.getElementById('dw-template-mode')?.value || 'shipping');
        window.onDeliStudioInputChange();
        notifyPrinterToast('↺ تمت استعادة ضبط المربعات الأصلي');
    };

    window.togglePrintSequenceOrder = function (checked) {
        const bcCfg = getBoxCustomConfig();
        bcCfg.reversePrintOrder = Boolean(checked);
        saveBoxCustomConfig(bcCfg);
        notifyPrinterToast(checked ? '🔄 سيتم إخراج التكت الأخير أولاً ليكون التكت #1 على وجه الرول!' : '🔢 سيتم الطباعة بالترتيب الطبيعي (#1 ثم #2 ثم #3...)');
    };

    function refreshBoxControllerPillsForMode(mode) {
        const pillsWrap = document.getElementById('dw-bx-pills-container');
        if (!pillsWrap) return;
        const list = BOX_META_CATALOG[mode] || BOX_META_CATALOG.shipping;
        pillsWrap.innerHTML = list.map(item => `
            <button type="button" data-box-key="${item.key}" onclick="selectInteractiveStudioBox('${item.key}')" class="dw-interactive-box-pill px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all">
                ${item.name}
            </button>
        `).join('');
        const firstKey = list[0]?.key || 'cod';
        window.selectInteractiveStudioBox(firstKey);
    }

    function injectPoultryBatchUIInsideWaybillModal() {
        const modeBtnFree = document.getElementById('dw-mode-btn-free_custom');
        if (modeBtnFree && !document.getElementById('dw-mode-btn-poultry_batch')) {
            const pbBtn = document.createElement('button');
            pbBtn.type = 'button';
            pbBtn.id = 'dw-mode-btn-poultry_batch';
            pbBtn.onclick = () => window.switchDeliTemplateMode('poultry_batch');
            pbBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200 transition-all';
            pbBtn.innerHTML = '🐔 تكت ميزان فراخ (دفعة أوزان)';
            modeBtnFree.after(pbBtn);
        }

        // حقن لوحة التحكم الحر في المربعات أسفل المعاينة مباشرة لسهولة التحكم بالموبايل
        const previewStage = document.getElementById('dw-live-preview-stage');
        if (previewStage && !document.getElementById('dw-interactive-box-controller')) {
            const sw = document.createElement('div');
            sw.id = 'dw-pb-preview-switcher';
            sw.className = 'hidden mb-2 flex items-center justify-between bg-slate-900 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-black';
            previewStage.before(sw);

            const toggleAdvBtn = document.createElement('button');
            toggleAdvBtn.type = 'button';
            toggleAdvBtn.onclick = () => document.getElementById('dw-interactive-box-controller')?.classList.toggle('hidden');
            toggleAdvBtn.className = 'mt-2 w-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1';
            toggleAdvBtn.innerHTML = '<i class="fa-solid fa-sliders"></i> تخصيص متقدم للمربعات (اختياري)';
            previewStage.after(toggleAdvBtn);

            const boxCtrl = document.createElement('div');
            boxCtrl.id = 'dw-interactive-box-controller';
            boxCtrl.className = 'hidden mt-2 bg-slate-900 text-white p-3 rounded-2xl border border-slate-700 space-y-2.5 text-[11px] font-black';
            const bcCfg = getBoxCustomConfig();

            boxCtrl.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-1 border-b border-slate-700 pb-1.5">
                    <span class="text-amber-300 text-[11px]"><i class="fa-solid fa-wand-magic-sparkles ml-1"></i> المس أي مربع في المعاينة أو اختره لتعديله:</span>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="moveInteractiveStudioBoxOrder(-1)" class="bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded text-[10px]" title="تحريك المربع لأعلى">⬆️ فوق</button>
                        <button type="button" onclick="moveInteractiveStudioBoxOrder(1)" class="bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded text-[10px]" title="تحريك المربع لأسفل">⬇️ تحت</button>
                        <button type="button" onclick="resetInteractiveStudioBoxes()" class="bg-rose-900/70 hover:bg-rose-600 text-rose-200 hover:text-white px-2 py-0.5 rounded text-[10px]" title="استعادة ضبط المربعات">↺ أصلي</button>
                    </div>
                </div>

                <!-- أزرار اختيار المربع -->
                <div id="dw-bx-pills-container" class="flex flex-wrap gap-1"></div>

                <!-- مساطر التحكم الحر في المربع المحدد -->
                <div class="grid grid-cols-3 gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                    <div>
                        <div class="flex justify-between text-[9px] text-cyan-300 mb-0.5">
                            <span>↕️ ارتفاع المربع</span>
                            <span id="dw-bx-hscale-lbl">100%</span>
                        </div>
                        <input type="range" id="dw-bx-hscale" min="55" max="165" step="5" value="100" oninput="onInteractiveBoxControlChange('hScale', this.value)" class="w-full accent-cyan-400 h-1.5 cursor-pointer">
                    </div>
                    <div>
                        <div class="flex justify-between text-[9px] text-emerald-300 mb-0.5">
                            <span>↔️ عرض المربع</span>
                            <span id="dw-bx-wscale-lbl">100%</span>
                        </div>
                        <input type="range" id="dw-bx-wscale" min="20" max="100" step="5" value="100" oninput="onInteractiveBoxControlChange('wScale', this.value)" class="w-full accent-emerald-400 h-1.5 cursor-pointer">
                    </div>
                    <div>
                        <div class="flex justify-between text-[9px] text-amber-300 mb-0.5">
                            <span>🔤 حجم الخط</span>
                            <span id="dw-bx-fscale-lbl">100%</span>
                        </div>
                        <input type="range" id="dw-bx-fscale" min="65" max="170" step="5" value="100" oninput="onInteractiveBoxControlChange('fScale', this.value)" class="w-full accent-amber-400 h-1.5 cursor-pointer">
                    </div>
                </div>

                <!-- إظهار/إخفاء + شكل البرواز + عنوان مخصص للمربع -->
                <div class="grid grid-cols-12 gap-1.5 items-center">
                    <label class="col-span-4 flex items-center gap-1.5 bg-slate-800 px-2 py-1.5 rounded-lg cursor-pointer text-[10px] text-emerald-300">
                        <input type="checkbox" id="dw-bx-visible" checked onchange="onInteractiveBoxControlChange('visible', this.checked)" class="w-3.5 h-3.5 accent-emerald-400 rounded">
                        <span>👁️ إظهار المربع</span>
                    </label>
                    <select id="dw-bx-style" onchange="onInteractiveBoxControlChange('style', this.value)" class="col-span-4 bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-[10px] font-black outline-none">
                        <option value="solid">⬛ برواز سميك</option>
                        <option value="inverted">🌓 أسود بارز (عكس)</option>
                        <option value="double">▣ برواز مزدوج</option>
                        <option value="rounded">▢ حواف دائرية</option>
                        <option value="dashed">✂️ برواز منقط</option>
                        <option value="none">🚫 بدون برواز</option>
                    </select>
                    <input type="text" id="dw-bx-label" placeholder="تغيير عنوان المربع..." oninput="onInteractiveBoxControlChange('label', this.value)" class="col-span-4 bg-slate-800 border border-slate-700 text-white rounded-lg p-1.5 text-[10px] font-bold outline-none">
                </div>

                <!-- خيار اتجاه ترتيب الرول عند طباعة 10+ عناصر -->
                <label class="flex items-center justify-between bg-slate-800/70 px-2.5 py-1.5 rounded-lg cursor-pointer text-[10px] text-slate-300 border border-slate-700">
                    <span>🔢 طباعة بالترتيب الصارم (فعّل لعكس الرول 10⬅️1 ليكون #1 بالأعلى)</span>
                    <input type="checkbox" id="dw-reverse-roll-order" ${bcCfg.reversePrintOrder ? 'checked' : ''} onchange="togglePrintSequenceOrder(this.checked)" class="w-3.5 h-3.5 accent-amber-400 rounded">
                </label>
            `;
            previewStage.after(boxCtrl);

            // تفعيل اللمس المباشر على صورة المعاينة (Canvas) لاختيار المربع فوراً بالموبايل
            previewStage.addEventListener('click', function (ev) {
                const cnv = previewStage.querySelector('canvas');
                if (!cnv) return;
                const rect = cnv.getBoundingClientRect();
                const scaleX = cnv.width / rect.width;
                const scaleY = cnv.height / rect.height;
                const clickX = (ev.clientX - rect.left) * scaleX;
                const clickY = (ev.clientY - rect.top) * scaleY;

                const hit = (window.poultryBatchState.hitRegions || []).find(r =>
                    clickX >= r.x && clickX <= (r.x + r.w) && clickY >= r.y && clickY <= (r.y + r.h)
                );
                if (hit && hit.key) {
                    window.selectInteractiveStudioBox(hit.key);
                    notifyPrinterToast(`🎯 تم تحديد (${hit.key}) — عدّل أبعاده من المساطر بالأسفل`);
                }
            });
        }

        const subtabOrderBags = document.getElementById('dw-subtab-order_bags');
        if (subtabOrderBags && !document.getElementById('dw-poultry-batch-editor')) {
            const editorDiv = document.createElement('div');
            editorDiv.id = 'dw-poultry-batch-editor';
            editorDiv.className = 'hidden bg-white p-4 rounded-2xl border-2 border-amber-300 shadow-sm space-y-3';
            editorDiv.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2">
                    <div>
                        <h4 class="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-amber-600"></i> منظومة تكت أوزان وتسعير الفراخ والطيور بالترتيب الصارم
                        </h4>
                        <p class="text-[10px] font-bold text-slate-500">اكتب أو الصق 10 أوزان أو 50 وزناً وستخرج من الطابعة بنفس الترتيب والتسلسل بالمللي</p>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <button type="button" onclick="pullWeightsFromLiveSystemOrClipboard('site_dom')" class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">📥 سحب من الموقع بالترتيب</button>
                        <button type="button" onclick="pullWeightsFromLiveSystemOrClipboard('clipboard')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">📋 لصق ذكي بالترتيب</button>
                        <button type="button" onclick="copyPoultryBatchToWhatsApp()" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">📲 كشف واتساب</button>
                    </div>
                </div>

                <!-- إعدادات الصنف وسعر الكيلو والتقريب -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div class="col-span-2">
                        <label class="text-[10px] font-black text-slate-600 block mb-1">اسم الصنف على التكت</label>
                        <input type="text" id="dw-pb-name" value="فراخ تسمين طازجة - ذبح اليوم" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-emerald-700 block mb-1">💰 سعر الكيلو (ج.م)</label>
                        <input type="number" id="dw-pb-kilo-price" value="110" min="1" step="0.5" oninput="parsePoultryWeightsList(); onDeliStudioInputChange()" class="w-full border-2 border-emerald-400 rounded-xl p-2 text-center text-xs font-black bg-emerald-50 text-emerald-950">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-600 block mb-1">تقريب السعر التجاري</label>
                        <select id="dw-pb-rounding" onchange="parsePoultryWeightsList(); onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                            <option value="nearest_1" selected>أقرب جنيه صحيح</option>
                            <option value="floor_1">جبر الكسر لصالح العميل</option>
                            <option value="nearest_5">أقرب 5 جنيه</option>
                            <option value="exact">بالقروش (بدون تقريب)</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div class="sm:col-span-2">
                        <label class="text-[10px] font-black text-slate-600 block mb-1">بيان التاريخ والصلاحية أعلى التكت</label>
                        <input type="text" id="dw-pb-date-note" value="ذبح اليوم - طازج ونظيف 100%" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-600 block mb-1">خصم وزن الطبق/الكيس (جم)</label>
                        <input type="number" id="dw-pb-tare" value="0" min="0" max="200" oninput="parsePoultryWeightsList(); onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                    </div>
                </div>

                <!-- إدخال الأوزان بالترتيب -->
                <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                    <div class="sm:col-span-5 space-y-2">
                        <label class="text-[10px] font-black text-slate-700 block">1. رص الأوزان أو الصقها (تُطبع بنفس الترتيب #1، #2...):</label>
                        <div class="flex gap-1">
                            <input type="number" id="dw-pb-quick-weight" placeholder="اكتب الوزن بالجرام ثم Enter" onkeydown="if(event.key==='Enter'){event.preventDefault(); quickAddSingleScaleWeight();}" class="flex-1 border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs font-black bg-amber-50/40 outline-none">
                            <button type="button" onclick="quickAddSingleScaleWeight()" class="bg-slate-900 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-black">+ أضف</button>
                        </div>
                        <textarea id="dw-pb-weights-raw" rows="5" oninput="parsePoultryWeightsList(); onDeliStudioInputChange()" placeholder="1389&#10;1389&#10;1700&#10;638" class="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-black bg-slate-50 font-mono leading-relaxed outline-none focus:border-brand-primary">1389
1389
1700
638</textarea>
                    </div>

                    <div class="sm:col-span-7 flex flex-col justify-between space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] font-black text-slate-700">2. طابور الطباعة المرتب (يمكنك تقديم/تأخير أي فرخة بأسهم ▲▼):</label>
                            <button type="button" onclick="document.getElementById('dw-pb-weights-raw').value=''; parsePoultryWeightsList(); onDeliStudioInputChange();" class="text-[10px] font-black text-rose-600 hover:underline">🗑️ مسح الكل</button>
                        </div>
                        <div id="dw-pb-chips-list" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto custom-scroll p-1 bg-slate-100 rounded-xl border border-slate-200"></div>
                        <div id="dw-pb-summary-bar"></div>
                    </div>
                </div>

                <label class="flex items-center gap-2 text-xs font-black text-amber-950 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 cursor-pointer">
                    <input type="checkbox" id="dw-pb-master-summary" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded">
                    📦 طباعة «تكت ملخص الدفعة والبرنيكة» تلقائياً بعد انتهاء تكتات الفراخ
                </label>
            `;
            subtabOrderBags.appendChild(editorDiv);
        }
    }

    // ترقية دالة تبديل القوالب لتحديث شريط المربعات التفاعلي حسب القالب النشط
    const _origSwitchDeliTemplateMode = window.switchDeliTemplateMode;
    window.switchDeliTemplateMode = function (mode, skipRender = false) {
        injectPoultryBatchUIInsideWaybillModal();
        _origSwitchDeliTemplateMode(mode, true);

        const pbBtn = document.getElementById('dw-mode-btn-poultry_batch');
        if (pbBtn) {
            pbBtn.className = (mode === 'poultry_batch')
                ? 'px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 shadow-sm transition-all'
                : 'px-3 py-1.5 rounded-xl text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200 transition-all';
        }

        const pbEditor = document.getElementById('dw-poultry-batch-editor');
        const bagsCard = document.getElementById('dw-bags-control-card');
        const pbSwitcher = document.getElementById('dw-pb-preview-switcher');

        if (pbEditor) pbEditor.classList.toggle('hidden', mode !== 'poultry_batch');
        if (mode === 'poultry_batch') {
            if (bagsCard) bagsCard.classList.add('hidden');
            window.parsePoultryWeightsList();
        } else if (pbSwitcher) {
            pbSwitcher.classList.add('hidden');
        }

        refreshBoxControllerPillsForMode(mode);

        if (!skipRender) {
            window.switchDeliStudioSubTab('order_bags');
            window.onDeliStudioInputChange();
        }
    };

    // ربط الرسم الحراري بمحرك المربعات المرن للبوليصة وتكت الفراخ
    const _origRenderWaybillToCanvas = window.renderWaybillToCanvas203DPI;
    window.renderWaybillToCanvas203DPI = function (order, cfg, indexNum = 1, totalCount = 1, bagIndex = 1, bagsTotal = 1) {
        if (cfg && cfg.templateMode === 'poultry_batch') {
            const items = window.poultryBatchState.parsedItems.length > 0
                ? window.poultryBatchState.parsedItems
                : window.parsePoultryWeightsList();
            const safeList = items.length > 0 ? items : [{ index: 1, netGrams: 1389, kiloPrice: 110, price: 153 }];
            const targetItem = order && order._poultryItem
                ? order._poultryItem
                : (safeList[window.poultryBatchState.previewIdx] || safeList[0]);

            const cnv = window.renderSinglePoultryScaleTag203DPI(targetItem, safeList.length, cfg);
            const qBadge = document.getElementById('dw-queue-count-badge');
            if (qBadge) {
                const includeMaster = document.getElementById('dw-pb-master-summary')?.checked;
                qBadge.innerText = safeList.length + (includeMaster && safeList.length > 1 ? 1 : 0);
            }
            return cnv;
        }
        if (!cfg || cfg.templateMode === 'shipping') {
            return renderFlexibleShippingWaybill203DPI(order, cfg || window.getWaybillConfig(), indexNum, totalCount, bagIndex, bagsTotal);
        }
        return _origRenderWaybillToCanvas(order, cfg, indexNum, totalCount, bagIndex, bagsTotal);
    };

    // إصلاح سحب الطلبات المحددة من الموقع لتخرج بنفس الترتيب المحدد على الشاشة بالضبط
    window.bulkPrintWaybills = function () {
        const checkedBoxes = Array.from(document.querySelectorAll('.bulk-order-cb:checked'));
        if (checkedBoxes.length === 0) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');

        // ترتيب الصناديق المحددة حسب ظهورها على الشاشة من الأول للعاشر بالمللي
        const domOrderedIds = checkedBoxes.map(cb => cb.value);
        const rawList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];

        let ordersToPrint = domOrderedIds
            .map(id => rawList.find(o => o && o.id === id))
            .filter(Boolean)
            .map(o => ({ ...o, _bagsCount: 1, items: Array.isArray(o.items) ? o.items.map(i => ({ ...i })) : [] }));

        if (ordersToPrint.length === 0) return;

        const bcCfg = getBoxCustomConfig();
        if (bcCfg.reversePrintOrder && ordersToPrint.length > 1) {
            ordersToPrint = ordersToPrint.slice().reverse();
        }

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;

        if (cfg.instantPrint) {
            window.printDirectViaNativeBluetooth(ordersToPrint, cfg);
        } else {
            window.openWaybillSettingsModal(ordersToPrint);
        }
    };
    window.printSelectedOrdersWaybills = window.bulkPrintWaybills;

    // مضخة الطباعة المتتابعة بالترتيب الدقيق (1 -> 10 أو 10 -> 1 حسب إعداد الرول)
    window.printPoultryBatchSequentiallyBluetooth = async function (cfg) {
        if (window.deliPrinterConnection.isPrinting) return;
        const items = window.parsePoultryWeightsList();
        if (items.length === 0) return alert('يرجى كتابة أو لصق وزن واحد على الأقل!');

        const bcCfg = getBoxCustomConfig();
        const orderedItems = bcCfg.reversePrintOrder ? items.slice().reverse() : items;

        const copies = Math.max(1, parseInt(cfg.copies) || 1);
        const includeMaster = document.getElementById('dw-pb-master-summary')?.checked;
        const allCanvases = [];

        orderedItems.forEach(it => {
            for (let c = 0; c < copies; c++) {
                allCanvases.push(window.renderSinglePoultryScaleTag203DPI(it, items.length, cfg));
            }
        });
        if (includeMaster && items.length > 1) {
            allCanvases.push(renderPoultryBatchMasterSummaryCanvas(items, cfg));
        }

        if (!isNativeApkBridgeAvailable()) {
            const fakeOrders = orderedItems.map(it => ({ _poultryItem: it, _bagsCount: 1 }));
            return window.printViaInPageThermalFrame(fakeOrders, cfg);
        }

        const btn = document.getElementById('dw-btn-direct-ble');
        const origHtml = btn ? btn.innerHTML : '';
        window.deliPrinterConnection.isPrinting = true;
        const targetMac = document.getElementById('dw-native-printer-select')?.value || cfg.selectedMac || 'AUTO';

        try {
            const BATCH_STEP = 2;
            for (let i = 0; i < allCanvases.length; i += BATCH_STEP) {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري طباعة التكت بالترتيب (${Math.min(allCanvases.length, i + BATCH_STEP)} من ${allCanvases.length})...`;
                }
                await new Promise(r => setTimeout(r, 90));

                const slice = allCanvases.slice(i, i + BATCH_STEP);
                let sliceLen = 0;
                const pkts = slice.map(cnv => {
                    const p = convertCanvasToTSPLPacket(cnv, cfg);
                    sliceLen += p.length;
                    return p;
                });
                const combined = new Uint8Array(sliceLen);
                let off = 0;
                pkts.forEach(p => { combined.set(p, off); off += p.length; });

                const b64 = uint8ArrayToBase64(combined);
                const res = window.SmanNativePrinter.printRawBase64Bluetooth(targetMac, b64);
                if (!String(res).startsWith('OK:')) {
                    alert(`⚠️ توقفت الطباعة عند التكت رقم ${i + 1}: (${res})`);
                    break;
                }
                if (i + BATCH_STEP < allCanvases.length) {
                    await new Promise(r => setTimeout(r, 220));
                }
            }
            notifyPrinterToast(`✅ تمت طباعة (${allCanvases.length}) تكت بنفس الترتيب بنجاح!`);
        } catch (err) {
            alert('حدث خطأ أثناء طباعة الدفعة: ' + err.message);
        } finally {
            window.deliPrinterConnection.isPrinting = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    const _origTriggerDirectHardwarePrintBtn = window.triggerDirectHardwarePrintBtn;
    window.triggerDirectHardwarePrintBtn = function () {
        const cfg = readStudioInputsToConfig();
        if (cfg.templateMode === 'poultry_batch') {
            persistWaybillConfig(cfg);
            return window.printPoultryBatchSequentiallyBluetooth(cfg);
        }
        return _origTriggerDirectHardwarePrintBtn();
    };

    const _origOpenWaybillSettingsModal = window.openWaybillSettingsModal;
    window.openWaybillSettingsModal = function (ordersQueue = null) {
        _origOpenWaybillSettingsModal(ordersQueue);
        injectPoultryBatchUIInsideWaybillModal();
        refreshBoxControllerPillsForMode(document.getElementById('dw-template-mode')?.value || 'shipping');
    };

})();

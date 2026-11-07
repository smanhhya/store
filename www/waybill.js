// =========================================================================
// 🖨️ محرك الهاردوير المباشر لطابعة (Deli E750W - Direct BLE / WebUSB / APK Bridge)
// الملف: waybill.js | خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يعمل مباشرة من الموقع/التطبيق إلى الطابعة بدون أي تطبيقات خارجية
// المواصفات: 203 DPI (8 dots/mm) | TSPL BITMAP | Max Width: 108mm
// =========================================================================

(function () {
    const DOTS_PER_MM = 8; // 203 DPI = 8 نقاط لكل مليمتر

    // 1. الإعدادات الافتراضية المتوافقة مع Deli E750W
    const defaultDeliConfig = {
        sizePreset: '100x100',   // '100x100' | '100x150' | '80x60' | '70x50' | '50x30' | 'custom'
        widthMm: 100,
        heightMm: 100,
        sensorType: 'gap',       // 'gap' | 'continuous' | 'bmark'
        gapMm: 2,
        density: 12,             // غمقان الحرارة في TSPL من 1 إلى 15
        speed: 4,                // السرعة في TSPL من 2 إلى 6
        direction: 0,
        offsetXMm: 0,
        offsetYMm: 0,
        fontScale: 'normal',     // 'small' | 'normal' | 'large'
        templateMode: 'shipping',// 'shipping' | 'product_tag'
        instantPrint: false,     // لو مفعلة يطبع فوراً من كارت الطلب بضغطة واحدة
        copies: 1,
        chunkSize: 128,          // حجم حزمة البلوتوث بالبايت لضمان عدم تقطيع البوليصة
        chunkDelayMs: 14,        // زمن انتظار بالمللي ثانية بين الحزم لحماية ذاكرة الطابعة
        showLogo: true,
        showBarcode: true,
        showItemsPrice: true,
        showWeightInfo: true,
        includeRouteSummary: false,
        footerText: 'سمان ههيا الفريش - جودة تليق ببيتك 🤍 بالهنا والشفا'
    };

    // جميع معرفات خدمات البلوتوث القياسية والخاصة بشرائح طابعات Deli الحرارية
    const DELI_BLE_SERVICE_UUIDS = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '0000ae30-0000-1000-8000-00805f9b34fb'
    ];

    window.deliPrinterConnection = {
        btDevice: null,
        btCharacteristic: null,
        usbDevice: null,
        usbEndpointOut: null,
        serialPort: null,
        isPrinting: false,
        lastOrdersQueue: []
    };

    window.getWaybillConfig = function () {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('sman_waybill_cfg') || '{}');
        } catch (e) {}
        const remoteCfg = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : {};
        return { ...defaultDeliConfig, ...remoteCfg, ...saved };
    };

    function persistWaybillConfig(newCfg) {
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
            '100x100': { w: 100, h: 100 },
            '100x150': { w: 100, h: 150 },
            '80x60':   { w: 80,  h: 60 },
            '70x50':   { w: 70,  h: 50 },
            '50x30':   { w: 50,  h: 30 }
        };
        if (presets[cfg.sizePreset]) return presets[cfg.sizePreset];
        return {
            w: Math.min(108, Math.max(30, Number(cfg.widthMm) || 100)),
            h: Math.min(250, Math.max(20, Number(cfg.heightMm) || 100))
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
    // 📊 2. مولد باركود CODE128 داخلي مستقل (يرسم مباشرة على الـ Canvas بدون مكتبات)
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
    // 🖼️ 3. محرك الرسم الحراري على Canvas بدقة 203 DPI (8 نقاط لكل مليمتر)
    // =========================================================================
    window.renderWaybillToCanvas203DPI = function (order, cfg, indexNum = 1, totalCount = 1) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM); // 100mm = 800 dots
        const H = Math.floor(dims.h * DOTS_PER_MM); // 100mm = 800 dots

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // خلفية بيضاء صريحة وإطار أسود حراري سميك
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        const pad = Math.round(W * 0.026);
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

        const storeName = (typeof storeSettings !== 'undefined' && storeSettings.storeName) ? storeSettings.storeName : 'سمان ههيا';
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const orderShortId = (order.id || '000000').slice(-6).toUpperCase();
        const barcodeCode = orderShortId.replace(/[^A-Z0-9]/g, '1') || '100200';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');
        const batchTitle = (typeof window.resolveOrderBatchName === 'function')
            ? window.resolveOrderBatchName(order)
            : ((order.batchName && order.batchName !== 'undefined') ? order.batchName : '');

        const itemsList = Array.isArray(order.items) ? order.items : [];
        let totalUnitsCount = 0;
        itemsList.forEach(i => { totalUnitsCount += (Number(i.quantity) || 0); });

        // قالب استيكر الطبق الصغير (50x30 أو 70x50)
        if (cfg.templateMode === 'product_tag' || (dims.w <= 60 && dims.h <= 45)) {
            const firstItem = itemsList[0] || { name: 'سمان ههيا فريش', quantity: 1 };
            ctx.textAlign = 'center';
            ctx.font = `900 ${Math.round(H * 0.14)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storeName + ' - ' + storePhone, W / 2, Math.round(H * 0.25));
            ctx.font = `900 ${Math.round(H * 0.18)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`${firstItem.quantity}x ${firstItem.name}`, W / 2, Math.round(H * 0.56));
            ctx.font = `800 ${Math.round(H * 0.11)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`${orderDateStr} | #${orderShortId}`, W / 2, Math.round(H * 0.85));
            return canvas;
        }

        const scaleMul = cfg.fontScale === 'large' ? 1.1 : (cfg.fontScale === 'small' ? 0.9 : 1.0);
        const fTitle = Math.round(W * 0.042 * scaleMul);
        const fSub = Math.round(W * 0.026 * scaleMul);
        const fBody = Math.round(W * 0.029 * scaleMul);
        const fSmall = Math.round(W * 0.023 * scaleMul);

        const innerRight = W - pad - 16;
        const innerLeft = pad + 16;
        const innerWidth = innerRight - innerLeft;
        let curY = pad + 14;

        // 1. الترويسة العلوية + الباركود
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `900 ${fTitle}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(storeName, innerRight, curY);

        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`هاتف: ${storePhone}`, innerRight, curY + fTitle + 6);

        ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`التاريخ: ${orderDateStr}${batchTitle ? ' • ' + batchTitle : ''}`, innerRight, curY + fTitle + fSub + 14);

        if (cfg.showBarcode) {
            const bcWidth = Math.round(W * 0.38);
            const bcCenterX = innerLeft + (bcWidth / 2) + 4;
            drawBarcodeOnCanvas(ctx, barcodeCode, bcCenterX, curY + 4, bcWidth, Math.round(H * 0.075));
            ctx.textAlign = 'center';
            ctx.font = `900 ${fSmall}px monospace`;
            ctx.fillText(`#${orderShortId} (${indexNum}/${totalCount})`, bcCenterX, curY + Math.round(H * 0.08) + 6);
        } else {
            ctx.textAlign = 'left';
            ctx.font = `900 ${fTitle}px monospace`;
            ctx.fillText(`#${orderShortId}`, innerLeft, curY + 12);
        }

        curY += Math.round(H * 0.135);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pad, curY);
        ctx.lineTo(W - pad, curY);
        ctx.stroke();

        // 2. صندوق بيانات العميل والمنطقة والعنوان
        curY += 12;
        const custBoxH = Math.round(H * 0.195);
        ctx.lineWidth = 3;
        ctx.strokeRect(innerLeft, curY, innerWidth, custBoxH);

        const zoneText = `${order.zone || 'توصيل'}`;
        ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
        const zoneW = Math.min(Math.round(W * 0.34), Math.max(125, ctx.measureText(zoneText).width + 32));
        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft + 10, curY + 10, zoneW, Math.round(custBoxH * 0.42));
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zoneText, innerLeft + 10 + (zoneW / 2), curY + 10 + Math.round(custBoxH * 0.21));

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.round(fBody * 1.12)}px Cairo, Tahoma, sans-serif`;
        const custNameClean = (order.customerName || 'عميل سمان ههيا').slice(0, 28);
        ctx.fillText(`العميل: ${custNameClean}`, innerRight - 12, curY + 10);

        const phonesLine = `موبايل: ${order.customerPhone || ''}${order.customerPhone2 ? ' | بديل: ' + order.customerPhone2 : ''}`;
        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(phonesLine, innerRight - 12, curY + 14 + Math.round(fBody * 1.2));

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
        ctx.fillText(addrClean.slice(0, 58), innerRight - 12, addrLineY + 8);

        // 3. جدول الأصناف المطلوبة
        curY += custBoxH + 12;
        const footerSectionH = Math.round(H * 0.22);
        const tableMaxH = H - curY - footerSectionH - pad - 10;

        const thH = Math.round(H * 0.048);
        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft, curY, innerWidth, thH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`الصنف المطلوب (إجمالي القطع: ${Number(totalUnitsCount.toFixed(1))})`, innerRight - 12, curY + thH / 2);

        const qtyColW = Math.round(innerWidth * 0.18);
        const priceColW = cfg.showItemsPrice ? Math.round(innerWidth * 0.22) : 0;
        const qtyColCenter = innerLeft + priceColW + (qtyColW / 2);

        ctx.textAlign = 'center';
        ctx.fillText('الكمية', qtyColCenter, curY + thH / 2);
        if (cfg.showItemsPrice) {
            ctx.fillText('السعر', innerLeft + (priceColW / 2), curY + thH / 2);
        }

        let rowY = curY + thH;
        const maxRows = Math.max(1, Math.min(itemsList.length, 6));
        const notesText = [
            order.driverNote ? order.driverNote.split('\n---\n').pop() : '',
            (!order.driverNote && order.adminNote) ? order.adminNote.split('\n---\n').pop() : ''
        ].filter(Boolean).join(' | ');

        const noteBoxReserve = notesText ? Math.round(H * 0.055) : 0;
        const availableRowsH = Math.max(thH, tableMaxH - thH - noteBoxReserve);
        const rowH = Math.min(Math.round(H * 0.055), Math.floor(availableRowsH / maxRows));

        ctx.fillStyle = '#000000';
        ctx.lineWidth = 2;

        for (let idx = 0; idx < maxRows; idx++) {
            const item = itemsList[idx];
            if (!item) break;
            ctx.strokeRect(innerLeft, rowY, innerWidth, rowH);

            ctx.beginPath();
            ctx.moveTo(innerLeft + priceColW + qtyColW, rowY);
            ctx.lineTo(innerLeft + priceColW + qtyColW, rowY + rowH);
            if (cfg.showItemsPrice) {
                ctx.moveTo(innerLeft + priceColW, rowY);
                ctx.lineTo(innerLeft + priceColW, rowY + rowH);
            }
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            let itemLabel = item.name || 'صنف';
            if (idx === maxRows - 1 && itemsList.length > maxRows) {
                itemLabel += ` (+${itemsList.length - maxRows} أصناف أخرى)`;
            }
            ctx.fillText(itemLabel.slice(0, 36), innerRight - 10, rowY + rowH / 2);

            ctx.textAlign = 'center';
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(String(item.quantity), qtyColCenter, rowY + rowH / 2);

            if (cfg.showItemsPrice) {
                const linePrice = (Number(item.quantity) || 0) * (Number(item.price) || 0);
                ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(`${linePrice} ج`, innerLeft + (priceColW / 2), rowY + rowH / 2);
            }
            rowY += rowH;
        }

        if (notesText) {
            rowY += 6;
            const nH = Math.round(H * 0.048);
            ctx.strokeRect(innerLeft, rowY, innerWidth, nH);
            ctx.textAlign = 'right';
            ctx.font = `900 ${Math.round(fSmall * 0.95)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`ملاحظة: ${notesText.slice(0, 52)}`, innerRight - 10, rowY + nH / 2);
        }

        // 4. الصندوق المالي السفلي (COD Box)
        const codTopY = H - pad - footerSectionH;
        const codBoxH = Math.round(footerSectionH * 0.76);
        const isOnline = order.paymentMethod === 'online';
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const delivery = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const total = Number(order.total) || 0;
        const debt = Number(order.debt) || 0;

        ctx.lineWidth = 4;
        ctx.strokeRect(innerLeft, codTopY, innerWidth, codBoxH);

        const codHeaderH = Math.round(codBoxH * 0.58);
        ctx.fillStyle = '#000000';
        ctx.fillRect(innerLeft, codTopY, innerWidth, codHeaderH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'حالة الفاتورة:' : 'المطلوب تحصيله من العميل:', innerRight - 14, codTopY + codHeaderH / 2);

        ctx.textAlign = 'left';
        ctx.font = `900 ${Math.round(fTitle * 1.08)}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'خالص أونلاين (0 ج)' : `${total} ج.م`, innerLeft + 14, codTopY + codHeaderH / 2);

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        let breakdownStr = `المنتجات: ${subtotal} ج   •   التوصيل: ${delivery} ج`;
        if (discount > 0) breakdownStr += `   •   خصم: ${discount} ج`;
        if (debt > 0) breakdownStr += `   •   آجل: ${debt} ج`;
        ctx.fillText(breakdownStr, W / 2, codTopY + codHeaderH + (codBoxH - codHeaderH) / 2);

        if (cfg.footerText) {
            ctx.font = `800 ${Math.round(fSmall * 0.9)}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(cfg.footerText, W / 2, H - pad - Math.round(footerSectionH * 0.1));
        }

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
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

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
        const canvases = [];
        ordersToPrint.forEach((o, idx) => {
            for (let c = 0; c < copies; c++) {
                canvases.push(window.renderWaybillToCanvas203DPI(o, cfg, idx + 1, ordersToPrint.length));
            }
        });
        if (cfg.includeRouteSummary && ordersToPrint.length > 1) {
            canvases.push(renderDriverSummaryToCanvas203DPI(ordersToPrint, cfg));
        }
        return canvases;
    }

    // =========================================================================
    // 📡 4. تحويل الـ Canvas إلى لغة الهاردوير TSPL BITMAP وإرسالها مباشرة للطابعة
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

        // في TSPL BITMAP Mode 0: البت 0 = نقطة سوداء، البت 1 = نقطة بيضاء
        const bitmapBytes = new Uint8Array(widthBytes * heightDots);
        bitmapBytes.fill(0xFF);

        const threshold = cfg.density >= 12 ? 190 : 160;
        for (let y = 0; y < heightDots; y++) {
            for (let x = 0; x < widthDots; x++) {
                const idx = (y * widthDots + x) * 4;
                const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                if (lum < threshold) {
                    const byteIdx = y * widthBytes + Math.floor(x / 8);
                    const bitPos = 7 - (x % 8);
                    bitmapBytes[byteIdx] &= ~(1 << bitPos);
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

    // =========================================================================
    // 🔌 5. قنوات الاتصال المباشر بالطابعة بدون أي تطبيقات خارجية
    // =========================================================================

    // القناة 1: الاتصال المباشر عبر بلوتوث المتصفح/التطبيق (WebBluetooth BLE)
    window.connectDeliBluetoothPrinter = async function () {
        // إذا كان المستخدم فاتح من داخل WebView يغلق البلوتوث، نفتح له السيستم في محرك Chrome الداعم للبلوتوث بضغطة واحدة
        if (!navigator.bluetooth) {
            const isAndroid = /Android/i.test(navigator.userAgent);
            if (isAndroid && window.location.protocol.startsWith('http')) {
                const cleanUrl = window.location.href.replace(/^https?:\/\//, '');
                const scheme = window.location.protocol.replace(':', '');
                if (confirm('⚡ لتشغيل البلوتوث المباشر لطابعة Deli E750W بدون أي تطبيق خارجي:\n\nأنت تفتح السيستم الآن داخل عارض داخلي مقيد. اضغط "موافق" لفتح السيستم بمحرك أندرويد الكامل الداعم للبلوتوث المباشر (ويمكنك تثبيته كتطبيق على الشاشة الرئيسية).')) {
                    window.location.href = `intent://${cleanUrl}#Intent;scheme=${scheme};package=com.android.chrome;end`;
                }
                return false;
            }
            alert('⚠️ لتشغيل البلوتوث المباشر بدون برامج خارجية، افتح رابط الموقع (https) من متصفح Google Chrome ثم اختر "تثبيت التطبيق / الإضافة للشاشة الرئيسية".');
            return false;
        }

        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: DELI_BLE_SERVICE_UUIDS
            });

            device.addEventListener('gattserverdisconnected', () => {
                window.deliPrinterConnection.btCharacteristic = null;
                updateConnectionBadgesUI();
            });

            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            let bestChar = null;

            for (const srv of services) {
                const chars = await srv.getCharacteristics();
                for (const ch of chars) {
                    if (ch.properties.writeWithoutResponse) {
                        bestChar = ch;
                        break;
                    }
                    if (ch.properties.write && !bestChar) {
                        bestChar = ch;
                    }
                }
                if (bestChar && bestChar.properties.writeWithoutResponse) break;
            }

            if (!bestChar) {
                alert('تم الاقتران بالطابعة ولكن لم يتم العثور على قناة بيانات مفتوحة.');
                return false;
            }

            window.deliPrinterConnection.btDevice = device;
            window.deliPrinterConnection.btCharacteristic = bestChar;
            updateConnectionBadgesUI();
            notifyPrinterToast(`🔵 تم الاتصال المباشر بطابعة (${device.name || 'Deli E750W'}) بدون برامج خارجية!`);
            return true;
        } catch (e) {
            console.log('BLE connect info:', e);
            return false;
        }
    };

    // القناة 2: الاتصال المباشر عبر كابل الـ USB (WebUSB للموبايل OTG وللكمبيوتر)
    window.connectDeliDirectUSB = async function () {
        if (!navigator.usb) {
            return alert('⚠️ متصفحك الحالي لا يدعم WebUSB المباشر.');
        }
        try {
            const device = await navigator.usb.requestDevice({ filters: [] });
            await device.open();
            if (device.configuration === null) {
                await device.selectConfiguration(1);
            }

            let ifaceNum = 0;
            let endpointOut = null;

            for (const iface of device.configurations[0].interfaces) {
                for (const alt of iface.alternates) {
                    for (const ep of alt.endpoints) {
                        if (ep.direction === 'out' && ep.type === 'bulk') {
                            ifaceNum = iface.interfaceNumber;
                            endpointOut = ep.endpointNumber;
                            break;
                        }
                    }
                }
            }

            await device.claimInterface(ifaceNum);
            window.deliPrinterConnection.usbDevice = device;
            window.deliPrinterConnection.usbEndpointOut = endpointOut || 1;
            updateConnectionBadgesUI();
            notifyPrinterToast(`🔌 تم الاتصال المباشر بكابل USB مع طابعة (${device.productName || 'Deli E750W'})!`);
            return true;
        } catch (e) {
            console.log('WebUSB info:', e);
            return false;
        }
    };

    // إرسال البايتات الخام عبر أي قناة متصلة (APK Bridge / WebUSB / WebBluetooth) مع شريط تقدم حي
    async function sendRawTSPLBytesDirect(bytesArray) {
        const cfg = window.getWaybillConfig();
        const progEl = document.getElementById('dw-print-progress-text');

        // 1. إذا كان السيستم يعمل داخل APK مزود بـ Java Bridge داخلي
        if (window.AndroidPrinterBridge && typeof window.AndroidPrinterBridge.printBase64TSPL === 'function') {
            window.AndroidPrinterBridge.printBase64TSPL(uint8ArrayToBase64(bytesArray));
            return true;
        }

        // 2. إذا كان يعمل داخل Cordova BluetoothSerial
        if (window.bluetoothSerial && typeof window.bluetoothSerial.write === 'function') {
            return await new Promise(resolve => {
                window.bluetoothSerial.write(bytesArray.buffer, () => resolve(true), () => resolve(false));
            });
        }

        // 3. إذا كان متصلاً عبر كابل USB مباشر (WebUSB)
        if (window.deliPrinterConnection.usbDevice && window.deliPrinterConnection.usbEndpointOut !== null) {
            const usbDev = window.deliPrinterConnection.usbDevice;
            const ep = window.deliPrinterConnection.usbEndpointOut;
            const usbChunk = 4096;
            for (let i = 0; i < bytesArray.length; i += usbChunk) {
                const slice = bytesArray.slice(i, i + usbChunk);
                await usbDev.transferOut(ep, slice);
            }
            return true;
        }

        // 4. إذا كان متصلاً عبر البلوتوث المباشر (WebBluetooth BLE)
        let ch = window.deliPrinterConnection.btCharacteristic;
        if (!ch && window.deliPrinterConnection.btDevice && window.deliPrinterConnection.btDevice.gatt) {
            try {
                const srv = await window.deliPrinterConnection.btDevice.gatt.connect();
                const services = await srv.getPrimaryServices();
                for (const s of services) {
                    const chars = await s.getCharacteristics();
                    for (const c of chars) {
                        if (c.properties.writeWithoutResponse || c.properties.write) {
                            ch = c;
                            window.deliPrinterConnection.btCharacteristic = c;
                            break;
                        }
                    }
                    if (ch) break;
                }
            } catch (e) {}
        }

        if (ch) {
            const chunkSize = Math.min(240, Math.max(64, parseInt(cfg.chunkSize) || 128));
            const delayMs = Math.max(6, parseInt(cfg.chunkDelayMs) || 14);
            const totalLen = bytesArray.length;

            for (let i = 0; i < totalLen; i += chunkSize) {
                const chunk = bytesArray.slice(i, i + chunkSize);
                if (ch.properties.writeWithoutResponse) {
                    await ch.writeValueWithoutResponse(chunk);
                } else {
                    await ch.writeValue(chunk);
                }
                if (progEl && i % (chunkSize * 15) === 0) {
                    const pct = Math.min(99, Math.round((i / totalLen) * 100));
                    progEl.innerText = `جاري الإرسال المباشر للطابعة... ${pct}%`;
                }
                await new Promise(r => setTimeout(r, delayMs));
            }
            if (progEl) progEl.innerText = 'تمت الطباعة المباشرة بنجاح ✅';
            return true;
        }

        return false;
    }

    // الطباعة المباشرة الشاملة: تتصل بالطابعة وتطبع فوراً بدون أي تطبيق خارجي
    window.printDirectHardwareNoExternalApp = async function (ordersQueue = null, customCfg = null) {
        if (window.deliPrinterConnection.isPrinting) return;
        const cfg = customCfg || window.getWaybillConfig();
        const queue = (ordersQueue && ordersQueue.length > 0)
            ? ordersQueue
            : ((window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
                ? window.deliPrinterConnection.lastOrdersQueue
                : [getSampleOrderForPreview()]);

        // إذا لم تكن الطابعة متصلة بعد، نفتح نافذة الاقتران المباشر أولاً
        const hasActiveChannel = Boolean(
            window.deliPrinterConnection.btCharacteristic ||
            window.deliPrinterConnection.usbDevice ||
            window.AndroidPrinterBridge ||
            window.bluetoothSerial
        );

        if (!hasActiveChannel) {
            const connected = await window.connectDeliBluetoothPrinter();
            if (!connected) return;
        }

        const canvases = buildAllCanvasesForQueue(queue, cfg);
        if (canvases.length === 0) return;

        window.deliPrinterConnection.isPrinting = true;
        const btn = document.getElementById('dw-btn-direct-ble');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span id="dw-print-progress-text">جاري تحضير البوليصة الحرارية...</span>`;
        }

        try {
            for (let i = 0; i < canvases.length; i++) {
                const packet = convertCanvasToTSPLPacket(canvases[i], cfg);
                const ok = await sendRawTSPLBytesDirect(packet);
                if (!ok) {
                    throw new Error('فقدان الاتصال المباشر بالطابعة');
                }
                if (i < canvases.length - 1) {
                    await new Promise(r => setTimeout(r, 350));
                }
            }
            notifyPrinterToast(`✅ تمت طباعة (${canvases.length}) بوليصة مباشرة على Deli E750W!`);
        } catch (err) {
            console.error(err);
            alert('تعذر إكمال الإرسال عبر البلوتوث، تأكد أن طابعة Deli E750W مفتوحة وقريبة من الجهاز.');
        } finally {
            window.deliPrinterConnection.isPrinting = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    // أوامر معايرة الحساس وسحب الورق المباشرة
    window.sendDeliHardwareCommand = async function (cmdType) {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        let tsplCmd = '';
        if (cmdType === 'calibrate') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nGAP ${cfg.gapMm || 2} mm,0 mm\r\nHOME\r\nSOUND 2,100\r\n`;
        } else if (cmdType === 'feed') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nFORMFEED\r\n`;
        }
        const bytes = new TextEncoder().encode(tsplCmd);
        const sent = await sendRawTSPLBytesDirect(bytes);
        if (sent) {
            notifyPrinterToast('⚡ تم تنفيذ الأمر مباشرة على طابعة Deli E750W');
        } else {
            await window.connectDeliBluetoothPrinter();
        }
    };

    // =========================================================================
    // 🖨️ 6. محرك طباعة النظام المباشر (Direct Native Spooler عبر الصور الحرارية)
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
        setTimeout(() => { window.print(); }, 250);
    };

    function updateConnectionBadgesUI() {
        const btStatus = document.getElementById('deli-bt-status-badge');
        if (!btStatus) return;
        if (window.deliPrinterConnection.btCharacteristic) {
            const devName = window.deliPrinterConnection.btDevice?.name || 'Deli E750W';
            btStatus.className = 'bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = `🔵 متصل بلوتوث مباشر (${devName})`;
        } else if (window.deliPrinterConnection.usbDevice) {
            btStatus.className = 'bg-cyan-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = '🔌 متصل بكابل USB مباشر';
        } else if (!navigator.bluetooth) {
            btStatus.className = 'bg-rose-500 text-white px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = '⚠️ عارض مقيد (اضغط ربط بلوتوث لفتحه بالكامل)';
        } else {
            btStatus.className = 'bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
            btStatus.innerText = '⚪ جاهز للاقتران المباشر بالطابعة';
        }
    }

    // =========================================================================
    // 🎛️ 7. نافذة استوديو البوليصة والتحكم المباشر في طابعة Deli E750W
    // =========================================================================
    function ensureDeliStudioModalExists() {
        let modal = document.getElementById('deli-waybill-studio-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'deli-waybill-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[210] hidden flex items-center justify-center p-2 sm:p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
                <!-- الهيدر -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-lg">
                            <i class="fa-solid fa-print"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="font-black text-sm sm:text-base text-white">استوديو الطباعة المباشرة (Deli E750W)</h3>
                                <span id="deli-bt-status-badge" class="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-lg text-[10px] font-black">⚪ جاهز للاقتران المباشر</span>
                            </div>
                            <p class="text-[11px] text-slate-300 font-bold mt-0.5">طباعة هاردوير مباشرة (TSPL 203 DPI) عبر البلوتوث أو USB بدون أي تطبيقات خارجية</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="connectDeliBluetoothPrinter()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm">
                            <i class="fa-brands fa-bluetooth-b"></i> ربط بلوتوث الطابعة
                        </button>
                        <button type="button" onclick="connectDeliDirectUSB()" class="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm" title="ربط بكابل USB أو وصلة OTG">
                            <i class="fa-brands fa-usb"></i> ربط USB
                        </button>
                        <button type="button" onclick="closeDeliStudioModal()" class="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all">
                            <i class="fa-solid fa-xmark text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- جسم الاستوديو -->
                <div class="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50">
                    <!-- العمود الأيسر: المعاينة وأزرار الطباعة المباشرة -->
                    <div class="lg:col-span-5 lg:order-2 flex flex-col justify-between bg-slate-200/80 rounded-2xl p-4 border border-slate-300">
                        <div>
                            <div class="flex justify-between items-center mb-2.5">
                                <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-eye text-brand-primary ml-1"></i> المعاينة الحرارية (<span id="dw-queue-count-badge">1</span> بوليصة)</span>
                                <span id="dw-dims-badge" class="bg-slate-900 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">100×100 مم (800×800px)</span>
                            </div>

                            <div id="dw-live-preview-stage" class="bg-white rounded-2xl shadow-inner border border-slate-300 p-2.5 flex items-center justify-center overflow-auto min-h-[290px] max-h-[380px]"></div>
                        </div>

                        <!-- أزرار الطباعة المباشرة بدون تطبيقات خارجية -->
                        <div class="space-y-2 mt-4 pt-3 border-t border-slate-300">
                            <button type="button" id="dw-btn-direct-ble" onclick="triggerDirectHardwarePrintBtn()" class="w-full bg-brand-primary hover:bg-emerald-800 text-white font-black py-3.5 rounded-2xl text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2 active:scale-95">
                                <i class="fa-solid fa-bolt text-amber-300 text-base"></i>
                                <span>⚡ طباعة مباشرة على Deli E750W (بلوتوث / USB)</span>
                            </button>

                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" onclick="triggerStudioMainPrint()" class="bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-print text-amber-400"></i> طباعة النظام (Spooler)
                                </button>
                                <button type="button" onclick="saveWaybillSettings()" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-floppy-disk text-brand-primary"></i> حفظ الإعدادات
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- العمود الأيمن: إعدادات المقاس والهاردوير -->
                    <div class="lg:col-span-7 lg:order-1 space-y-4">
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-ruler-combined text-brand-primary ml-1"></i> 1. مقاس رول الاستيكر وتصميم البوليصة</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">مقاس الاستيكر في الطابعة</label>
                                    <select id="dw-size-preset" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 outline-none">
                                        <option value="100x100">📏 10×10 سم (100×100 مم - القياسي)</option>
                                        <option value="100x150">📏 10×15 سم (100×150 مم - بوليصة كبيرة)</option>
                                        <option value="80x60">📏 8×6 سم (80×60 مم - متوسط)</option>
                                        <option value="70x50">📏 7×5 سم (70×50 مم - مدمج)</option>
                                        <option value="50x30">🏷️ 5×3 سم (50×30 مم - استيكر طبق)</option>
                                        <option value="custom">⚙️ مقاس مخصص بالمليمتر...</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">نوع القالب</label>
                                    <select id="dw-template-mode" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 outline-none">
                                        <option value="shipping">📦 بوليصة شحن وتحصيل كاملة</option>
                                        <option value="product_tag">🏷️ استيكر طبق سمان للفريزر</option>
                                    </select>
                                </div>
                            </div>

                            <div id="dw-custom-dims-row" class="hidden grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">العرض بالمليمتر (أقصى 108 مم)</label>
                                    <input type="number" id="dw-width-mm" min="30" max="108" value="100" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black">
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">الطول بالمليمتر</label>
                                    <input type="number" id="dw-height-mm" min="20" max="250" value="100" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black">
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                                <h4 class="text-xs font-black text-slate-800"><i class="fa-solid fa-microchip text-indigo-600 ml-1"></i> 2. تحكم الهاردوير وحساس الورق (Deli E750W TSPL)</h4>
                                <div class="flex gap-1.5">
                                    <button type="button" onclick="sendDeliHardwareCommand('calibrate')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">🎯 معايرة الحساس</button>
                                    <button type="button" onclick="sendDeliHardwareCommand('feed')" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">⏬ سحب ورقة</button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">حجم الخط</label>
                                    <select id="dw-font-scale" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                        <option value="small">صغير</option>
                                        <option value="normal" selected>متوسط قياسي</option>
                                        <option value="large">كبير وواضح</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">عدد النسخ</label>
                                    <input type="number" id="dw-copies" min="1" max="10" value="1" oninput="onDeliStudioInputChange()" class="w-full border border-emerald-200 rounded-xl p-2 text-center text-xs font-black text-brand-primary bg-emerald-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">غمقان الحبر (1-15)</label>
                                    <input type="number" id="dw-density" min="1" max="15" value="12" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">الفاصل (Gap مم)</label>
                                    <input type="number" id="dw-gap-mm" min="0" max="10" step="0.5" value="2" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-black text-slate-700 pt-1">
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-barcode" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> الباركود
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-prices" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أسعار الجدول
                                </label>
                                <label class="flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-200 cursor-pointer text-amber-900 col-span-2">
                                    <input type="checkbox" id="dw-route-summary" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded"> طباعة ملصق إجمالي للمندوب
                                </label>
                            </div>

                            <div>
                                <label class="text-[10px] font-bold text-slate-500 block mb-1">رسالة التذييل أسفل البوليصة</label>
                                <input type="text" id="dw-footer-text" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                            </div>

                            <label class="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 cursor-pointer">
                                <input type="checkbox" id="dw-instant-print" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-emerald-600 rounded">
                                ⚡ طباعة فورية بضغطة واحدة من كارت الطلب (بدون فتح نافذة المعاينة)
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    function populateStudioInputsFromConfig(cfg) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };

        setVal('dw-size-preset', cfg.sizePreset || '100x100');
        setVal('dw-template-mode', cfg.templateMode || 'shipping');
        setVal('dw-width-mm', cfg.widthMm || 100);
        setVal('dw-height-mm', cfg.heightMm || 100);
        setVal('dw-density', cfg.density || 12);
        setVal('dw-gap-mm', cfg.gapMm !== undefined ? cfg.gapMm : 2);
        setVal('dw-font-scale', cfg.fontScale || 'normal');
        setVal('dw-copies', cfg.copies || 1);
        setVal('dw-footer-text', cfg.footerText || '');

        setChk('dw-show-barcode', cfg.showBarcode !== false);
        setChk('dw-show-prices', cfg.showItemsPrice !== false);
        setChk('dw-route-summary', cfg.includeRouteSummary === true);
        setChk('dw-instant-print', cfg.instantPrint === true);

        const customRow = document.getElementById('dw-custom-dims-row');
        if (customRow) {
            if (cfg.sizePreset === 'custom') customRow.classList.remove('hidden');
            else customRow.classList.add('hidden');
        }
    }

    function readStudioInputsToConfig() {
        const current = window.getWaybillConfig();
        const getVal = (id, fb) => { const el = document.getElementById(id); return el ? el.value : fb; };
        const getChk = (id, fb) => { const el = document.getElementById(id); return el ? el.checked : fb; };

        const preset = getVal('dw-size-preset', current.sizePreset);
        const customRow = document.getElementById('dw-custom-dims-row');
        if (customRow) {
            if (preset === 'custom') customRow.classList.remove('hidden');
            else customRow.classList.add('hidden');
        }

        return {
            ...current,
            sizePreset: preset,
            templateMode: getVal('dw-template-mode', 'shipping'),
            widthMm: Number(getVal('dw-width-mm', 100)) || 100,
            heightMm: Number(getVal('dw-height-mm', 100)) || 100,
            density: Number(getVal('dw-density', 12)) || 12,
            gapMm: Number(getVal('dw-gap-mm', 2)) || 0,
            fontScale: getVal('dw-font-scale', 'normal'),
            copies: Math.max(1, parseInt(getVal('dw-copies', 1)) || 1),
            footerText: getVal('dw-footer-text', ''),
            showBarcode: getChk('dw-show-barcode', true),
            showItemsPrice: getChk('dw-show-prices', true),
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
        if (Array.isArray(q) && q.length > 0) return q[0];
        const liveOrders = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw.filter(o => o && o.status !== 'trash') : [];
        if (liveOrders.length > 0) return liveOrders[0];
        return {
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

    function renderLivePreviewInsideStudio(cfg) {
        const stage = document.getElementById('dw-live-preview-stage');
        if (!stage) return;
        const dims = resolveDimensionsMm(cfg);
        const sampleOrd = getSampleOrderForPreview();
        const queueLen = (window.deliPrinterConnection.lastOrdersQueue || []).length || 1;

        const qBadge = document.getElementById('dw-queue-count-badge');
        if (qBadge) qBadge.innerText = queueLen;

        const dimsBadge = document.getElementById('dw-dims-badge');
        if (dimsBadge) {
            dimsBadge.innerText = `${dims.w}×${dims.h} مم (${dims.w * DOTS_PER_MM}×${dims.h * DOTS_PER_MM}px)`;
        }

        const cnv = window.renderWaybillToCanvas203DPI(sampleOrd, cfg, 1, queueLen);
        cnv.style.maxWidth = '100%';
        cnv.style.maxHeight = '340px';
        cnv.style.height = 'auto';
        cnv.style.borderRadius = '10px';
        cnv.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
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
        if (Array.isArray(ordersQueue) && ordersQueue.length > 0) {
            window.deliPrinterConnection.lastOrdersQueue = ordersQueue;
        } else {
            const firstLive = (typeof allOrdersRaw !== 'undefined' && allOrdersRaw.length > 0) ? [allOrdersRaw[0]] : [getSampleOrderForPreview()];
            window.deliPrinterConnection.lastOrdersQueue = firstLive;
        }

        const cfg = window.getWaybillConfig();
        populateStudioInputsFromConfig(cfg);
        updateConnectionBadgesUI();
        renderLivePreviewInsideStudio(cfg);
        modal.classList.remove('hidden');
    };

    window.saveWaybillSettings = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        notifyPrinterToast('✅ تم حفظ إعدادات طابعة Deli E750W بنجاح!');
    };

    // الزر الأول: طباعة الهاردوير المباشرة (بلوتوث / USB) بدون برامج خارجية
    window.triggerDirectHardwarePrintBtn = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printDirectHardwareNoExternalApp(queue, newCfg);
    };

    // الزر الثاني: طباعة النظام (Spooler)
    window.triggerStudioMainPrint = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printViaInPageThermalFrame(queue, newCfg);
    };

    // طباعة أوردر فردي من كارت الطلب
    window.printSingleOrderWaybill = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return alert('لم يتم العثور على بيانات هذا الطلب!');

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = [order];

        if (cfg.instantPrint) {
            window.printDirectHardwareNoExternalApp([order], cfg);
        } else {
            window.openWaybillSettingsModal([order]);
        }
    };

    // طباعة جماعية للطلبات المحددة
    window.bulkPrintWaybills = function () {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');

        const ordersToPrint = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => checkedIds.includes(o.id));
        if (ordersToPrint.length === 0) return;

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;

        if (cfg.instantPrint) {
            window.printDirectHardwareNoExternalApp(ordersToPrint, cfg);
        } else {
            window.openWaybillSettingsModal(ordersToPrint);
        }
    };
    window.printSelectedOrdersWaybills = window.bulkPrintWaybills;

    window.previewWaybillSample = function () {
        window.openWaybillSettingsModal();
    };
    window.previewSampleWaybill = window.previewWaybillSample;

    // إضافة زر سريع لاستوديو الطابعة في الشريط العلوي
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
})();

كملي الكود ده بس
// =========================================================================
// 🖨️ المحرك الشامل للطباعة المباشرة (Deli E750W - Native APK Bluetooth SPP + USB + TSPL)
// الملف: www/waybill.js | خاص بمشروع: سمان ههيا (CRM)
// يعمل مباشرة مع شريحة الأندرويد الأصلية (SmanNativePrinter) والكمبيوتر بدقة 203 DPI
// =========================================================================

(function () {
    const DOTS_PER_MM = 8; // 203 DPI = 8 نقاط لكل مليمتر

    const defaultDeliConfig = {
        sizePreset: '100x100',    // '100x100' | '100x150' | '80x60' | '70x50' | '50x30' | 'custom'
        widthMm: 100,             // أقصى عرض في Deli E750W هو 108 مم
        heightMm: 100,
        sensorType: 'gap',        // 'gap' | 'continuous' | 'bmark'
        gapMm: 2,
        density: 12,              // غمقان الحرارة في TSPL من 1 إلى 15
        speed: 4,                 // سرعة الطباعة في TSPL من 2 إلى 6
        direction: 0,
        offsetXMm: 0,
        offsetYMm: 0,
        fontScale: 'normal',      // 'small' | 'normal' | 'large'
        templateMode: 'shipping', // 'shipping' | 'product_tag'
        copies: 1,
        instantPrint: false,
        showLogo: true,
        showBarcode: true,
        showItemsPrice: true,
        showWeightInfo: true,
        includeRouteSummary: false,
        footerText: 'سمان ههيا الفريش - جودة تليق ببيتك 🤍 بالهنا والشفا'
    };

    window.deliPrinterConnection = {
        activeMode: localStorage.getItem('sman_deli_conn_mode') || 'bluetooth', // 'bluetooth' | 'usb'
        savedMac: localStorage.getItem('sman_deli_bt_mac') || '',
        savedName: localStorage.getItem('sman_deli_bt_name') || '',
        btDevice: null,
        btCharacteristic: null,
        usbPort: null,
        lastOrdersQueue: []
    };

    function hasNativeAndroidBridge() {
        return typeof window.SmanNativePrinter !== 'undefined' && typeof window.SmanNativePrinter.isNativeBridgeReady === 'function';
    }

    window.getWaybillConfig = function () {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('sman_waybill_cfg') || '{}');
        } catch (e) {}
        const remoteCfg = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : {};
        return { ...defaultDeliConfig, ...remoteCfg, ...saved };
    };

    function persistWaybillConfig(newCfg) {
        localStorage.setItem('sman_waybill_cfg', JSON.stringify(newCfg));
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
        } else {
            alert(msg);
        }
    }

    function injectDirectPrintStyles() {
        if (document.getElementById('deli-direct-print-css')) return;
        const style = document.createElement('style');
        style.id = 'deli-direct-print-css';
        style.innerHTML = `
            #deli-direct-print-mount { display: none; }
            @media print {
                body > *:not(#deli-direct-print-mount) { display: none !important; }
                html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
                #deli-direct-print-mount { display: block !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
                .deli-print-page { page-break-after: always !important; break-after: page !important; page-break-inside: avoid !important; display: block !important; margin: 0 auto !important; }
                .deli-print-page:last-child { page-break-after: auto !important; break-after: auto !important; }
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 🎨 2. محرك الرسم الحراري الأصلي على Canvas بدقة 203 DPI (800x800 نقطة)
    // =========================================================================
    function createBarcodeCanvas(codeText, widthPx, heightPx) {
        const bcCanvas = document.createElement('canvas');
        bcCanvas.width = widthPx;
        bcCanvas.height = heightPx;
        if (typeof JsBarcode === 'function') {
            try {
                JsBarcode(bcCanvas, codeText, {
                    format: 'CODE128',
                    displayValue: false,
                    width: 2.2,
                    height: heightPx - 4,
                    margin: 0,
                    background: '#ffffff',
                    lineColor: '#000000'
                });
                return bcCanvas;
            } catch (e) {}
        }
        const ctx = bcCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);
        ctx.fillStyle = '#000000';
        for (let x = 6; x < widthPx - 6; x += 6) {
            const barW = (x % 18 === 0) ? 4 : 2;
            ctx.fillRect(x, 2, barW, heightPx - 4);
        }
        return bcCanvas;
    }

    function wrapArabicText(ctx, text, maxWidth) {
        const words = String(text || '').split(' ');
        const lines = [];
        let currentLine = '';
        words.forEach(word => {
            const testLine = currentLine ? (currentLine + ' ' + word) : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines : [''];
    }

    function drawRoundRect(ctx, x, y, w, h, r, fill = false, stroke = true, lineWidth = 3) {
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
        if (fill) ctx.fill();
        if (stroke) {
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    window.renderWaybillToThermalCanvas = function (order, cfg, indexNum = 1, totalCount = 1) {
        const dims = resolveDimensionsMm(cfg);
        const widthDots = Math.floor(dims.w * DOTS_PER_MM);
        const heightDots = Math.floor(dims.h * DOTS_PER_MM);

        const canvas = document.createElement('canvas');
        canvas.width = widthDots;
        canvas.height = heightDots;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, widthDots, heightDots);

        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
        ctx.textBaseline = 'top';
        ctx.direction = 'rtl';

        const pad = 20;
        const innerW = widthDots - (pad * 2);

        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, widthDots - 16, heightDots - 16);

        const storeName = (typeof storeSettings !== 'undefined' && storeSettings.storeName) ? storeSettings.storeName : 'سمان ههيا';
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const orderShortId = (order.id || '000000').slice(-6).toUpperCase();
        const barcodeCode = orderShortId.replace(/[^A-Z0-9]/g, '1') || '100200';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');
        const batchTitle = (typeof window.resolveOrderBatchName === 'function')
            ? window.resolveOrderBatchName(order)
            : ((order.batchName && order.batchName !== 'undefined') ? order.batchName : '');

        const itemsList = Array.isArray(order.items) ? order.items : [];

        if (cfg.templateMode === 'product_tag' || (dims.w <= 60 && dims.h <= 45)) {
            const firstItem = itemsList[0] || { name: 'سمان ههيا الفريش', quantity: 1, id: '' };
            const pInfo = prodsObj[firstItem.id] || {};
            const weightTxt = pInfo.weight || 'طازج - ذبح اليوم';

            ctx.textAlign = 'right';
            ctx.font = '900 26px Cairo, sans-serif';
            ctx.fillText(storeName, widthDots - pad, 18);

            ctx.textAlign = 'left';
            ctx.font = '900 20px Cairo, sans-serif';
            ctx.fillText(storePhone, pad, 22);

            ctx.beginPath();
            ctx.moveTo(pad, 56);
            ctx.lineTo(widthDots - pad, 56);
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.font = '900 32px Cairo, sans-serif';
            ctx.fillText(`${firstItem.quantity}x ${firstItem.name}`, widthDots / 2, Math.floor(heightDots * 0.36));

            if (cfg.showWeightInfo) {
                ctx.font = '800 22px Cairo, sans-serif';
                ctx.fillText(`الوزن: ${weightTxt}`, widthDots / 2, Math.floor(heightDots * 0.58));
            }

            ctx.font = '800 18px Cairo, sans-serif';
            ctx.fillText(`تاريخ الإنتاج: ${orderDateStr}  |  #${orderShortId}`, widthDots / 2, heightDots - 38);

            ctx.restore();
            return canvas;
        }

        const scaleMul = cfg.fontScale === 'large' ? 1.12 : (cfg.fontScale === 'small' ? 0.88 : 1.0);
        const fSize = (px) => Math.round(px * scaleMul * (dims.w / 100));

        let curY = 20;
        const headerH = Math.round(105 * (dims.h / 100));

        ctx.textAlign = 'right';
        if (cfg.showLogo !== false) {
            ctx.font = `900 ${fSize(34)}px Cairo, sans-serif`;
            ctx.fillText(storeName, widthDots - pad, curY);
        }
        ctx.font = `900 ${fSize(22)}px Cairo, sans-serif`;
        ctx.fillText(storePhone, widthDots - pad, curY + fSize(40));

        ctx.font = `800 ${fSize(19)}px Cairo, sans-serif`;
        ctx.fillText(`${orderDateStr}${batchTitle ? ' • ' + batchTitle : ''}`, widthDots - pad, curY + fSize(68));

        if (cfg.showBarcode !== false) {
            const bcW = Math.round(270 * (dims.w / 100));
            const bcH = Math.round(62 * (dims.h / 100));
            const bcCanvas = createBarcodeCanvas(barcodeCode, bcW, bcH);
            ctx.drawImage(bcCanvas, pad + 6, curY + 4, bcW, bcH);

            ctx.textAlign = 'center';
            ctx.font = `900 ${fSize(18)}px Cairo, sans-serif`;
            ctx.fillText(`#${orderShortId} (${indexNum}/${totalCount})`, pad + 6 + (bcW / 2), curY + bcH + 8);
        } else {
            ctx.textAlign = 'left';
            ctx.font = `900 ${fSize(28)}px Cairo, sans-serif`;
            ctx.fillText(`#${orderShortId}`, pad + 8, curY + 20);
        }

        curY += headerH;
        ctx.beginPath();
        ctx.moveTo(pad, curY);
        ctx.lineTo(widthDots - pad, curY);
        ctx.lineWidth = 4;
        ctx.stroke();
        curY += 12;

        const custBoxH = Math.round(150 * (dims.h / 100));
        drawRoundRect(ctx, pad, curY, innerW, custBoxH, 12, false, true, 3);

        const zoneText = order.zone || 'غير محدد';
        ctx.font = `900 ${fSize(24)}px Cairo, sans-serif`;
        const zoneW = Math.min(260, Math.max(130, ctx.measureText(zoneText).width + 32));
        ctx.fillStyle = '#000000';
        drawRoundRect(ctx, pad + 12, curY + 12, zoneW, fSize(46), 10, true, false);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(zoneText, pad + 12 + (zoneW / 2), curY + 18);

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.font = `900 ${fSize(28)}px Cairo, sans-serif`;
        ctx.fillText((order.customerName || 'عميل سمان ههيا').slice(0, 26), widthDots - pad - 14, curY + 12);

        ctx.font = `900 ${fSize(25)}px Cairo, sans-serif`;
        ctx.fillText(`${order.customerPhone || ''}${order.customerPhone2 ? ' | ' + order.customerPhone2 : ''}`, widthDots - pad - 14, curY + fSize(48));

        const addrLineY = curY + fSize(84);
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad + 12, addrLineY);
        ctx.lineTo(widthDots - pad - 12, addrLineY);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.font = `800 ${fSize(21)}px Cairo, sans-serif`;
        const fullAddr = `العنوان: ${order.customerAddress || 'استلام حسب المنطقة المسجلة'}${order.driverName ? ' (المندوب: ' + order.driverName + ')' : ''}`;
        const addrLines = wrapArabicText(ctx, fullAddr, innerW - 28);
        ctx.fillText(addrLines[0] || '', widthDots - pad - 14, addrLineY + 8);
        if (addrLines[1]) {
            ctx.fillText(addrLines[1], widthDots - pad - 14, addrLineY + 8 + fSize(24));
        }

        curY += custBoxH + 12;

        const footerBlockH = Math.round(165 * (dims.h / 100));
        const availableTableH = heightDots - curY - footerBlockH - 12;
        const tableHeaderH = fSize(38);

        ctx.fillStyle = '#000000';
        ctx.fillRect(pad, curY, innerW, tableHeaderH);

        const colQtyW = Math.round(115 * (dims.w / 100));
        const colPriceW = cfg.showItemsPrice !== false ? Math.round(145 * (dims.w / 100)) : 0;

        let totalUnits = 0;
        itemsList.forEach(i => { totalUnits += (Number(i.quantity) || 0); });

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 ${fSize(21)}px Cairo, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`الصنف المطلوب (إجمالي: ${Number(totalUnits.toFixed(1))})`, widthDots - pad - 10, curY + 6);

        ctx.textAlign = 'center';
        ctx.fillText('العدد', pad + colPriceW + (colQtyW / 2), curY + 6);
        if (colPriceW > 0) {
            ctx.fillText('الإجمالي', pad + (colPriceW / 2), curY + 6);
        }

        let rowY = curY + tableHeaderH;
        const maxRows = Math.max(1, Math.min(itemsList.length || 1, 6));
        const notesText = [
            order.driverNote ? order.driverNote.split('\n---\n').pop() : '',
            (!order.driverNote && order.adminNote) ? order.adminNote.split('\n---\n').pop() : ''
        ].filter(Boolean).join(' | ');

        const notesReserveH = notesText ? fSize(42) : 0;
        const rowH = Math.min(fSize(44), Math.floor((availableTableH - tableHeaderH - notesReserveH) / maxRows));

        ctx.fillStyle = '#000000';
        itemsList.slice(0, 6).forEach((item) => {
            const pInfo = prodsObj[item.id] || {};
            const weightStr = (cfg.showWeightInfo !== false && pInfo.weight) ? ` (${pInfo.weight})` : '';
            const itemTitle = `${item.name || 'صنف'}${weightStr}`;

            ctx.lineWidth = 2.5;
            ctx.strokeRect(pad, rowY, innerW, rowH);

            const qtyRightX = pad + colPriceW + colQtyW;
            ctx.beginPath();
            ctx.moveTo(qtyRightX, rowY);
            ctx.lineTo(qtyRightX, rowY + rowH);
            if (colPriceW > 0) {
                ctx.moveTo(pad + colPriceW, rowY);
                ctx.lineTo(pad + colPriceW, rowY + rowH);
            }
            ctx.stroke();

            const textOffsetY = rowY + Math.max(4, Math.floor((rowH - fSize(22)) / 2));
            ctx.textAlign = 'right';
            ctx.font = `900 ${fSize(22)}px Cairo, sans-serif`;
            ctx.fillText(itemTitle.slice(0, 34), widthDots - pad - 10, textOffsetY);

            ctx.textAlign = 'center';
            ctx.font = `900 ${fSize(25)}px Cairo, sans-serif`;
            ctx.fillText(String(item.quantity || 1), pad + colPriceW + (colQtyW / 2), textOffsetY - 2);

            if (colPriceW > 0) {
                ctx.font = `900 ${fSize(22)}px Cairo, sans-serif`;
                const lineTot = Math.round((Number(item.quantity) || 0) * (Number(item.price) || 0));
                ctx.fillText(`${lineTot} ج`, pad + (colPriceW / 2), textOffsetY);
            }

            rowY += rowH;
        });

        if (notesText) {
            rowY += 6;
            ctx.font = `900 ${fSize(20)}px Cairo, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(`ملاحظة: ${notesText.slice(0, 52)}`, widthDots - pad - 6, rowY);
        }

        const finBoxY = heightDots - footerBlockH;
        const finBoxH = Math.round(112 * (dims.h / 100));
        drawRoundRect(ctx, pad, finBoxY, innerW, finBoxH, 12, false, true, 4);

        const isOnline = order.paymentMethod === 'online';
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const delivery = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const total = Number(order.total) || 0;
        const debt = Number(order.debt) || 0;

        const topBannerH = Math.round(finBoxH * 0.58);
        ctx.fillStyle = '#000000';
        ctx.fillRect(pad + 2, finBoxY + 2, innerW - 4, topBannerH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.font = `900 ${fSize(24)}px Cairo, sans-serif`;
        ctx.fillText(isOnline ? 'حالة الدفع:' : 'المطلوب تحصيله من العميل:', widthDots - pad - 16, finBoxY + 12);

        ctx.textAlign = 'left';
        ctx.font = `900 ${fSize(34)}px Cairo, sans-serif`;
        ctx.fillText(isOnline ? 'خالص أونلاين (0 ج)' : `${total} ج.م`, pad + 18, finBoxY + 6);

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.font = `900 ${fSize(20)}px Cairo, sans-serif`;
        let breakdownStr = `المنتجات: ${subtotal} ج   •   التوصيل: ${delivery} ج`;
        if (discount > 0) breakdownStr += `   •   خصم: ${discount} ج`;
        if (debt > 0) breakdownStr += `   •   آجل: ${debt} ج`;
        ctx.fillText(breakdownStr, widthDots / 2, finBoxY + topBannerH + 10);

        if (cfg.footerText) {
            ctx.font = `900 ${fSize(18)}px Cairo, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(cfg.footerText, widthDots / 2, heightDots - fSize(34));
        }

        ctx.restore();
        return canvas;
    };

    function renderDriverSummaryCanvas(ordersList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const widthDots = Math.floor(dims.w * DOTS_PER_MM);
        const heightDots = Math.floor(dims.h * DOTS_PER_MM);

        const canvas = document.createElement('canvas');
        canvas.width = widthDots;
        canvas.height = heightDots;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, widthDots, heightDots);
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
        ctx.direction = 'rtl';
        ctx.textBaseline = 'top';

        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, widthDots - 20, heightDots - 20);

        let totalCash = 0, onlineCount = 0;
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

        ctx.textAlign = 'center';
        ctx.font = '900 32px Cairo, sans-serif';
        ctx.fillText('ملخص استلام عهدة المندوب', widthDots / 2, 26);

        ctx.font = '800 22px Cairo, sans-serif';
        ctx.fillText(`إجمالي البوالص: ${ordersList.length} طلب (${ordersList.length - onlineCount} كاش / ${onlineCount} أونلاين)`, widthDots / 2, 74);

        ctx.beginPath();
        ctx.moveTo(24, 114);
        ctx.lineTo(widthDots - 24, 114);
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.font = '900 24px Cairo, sans-serif';
        let y = 130;
        Object.keys(itemsSum).slice(0, 9).forEach(k => {
            ctx.fillText(`▪ ${k}:   ${itemsSum[k]} طبق/وحدة`, widthDots - 36, y);
            y += 38;
        });

        ctx.fillStyle = '#000000';
        ctx.fillRect(24, heightDots - 105, widthDots - 48, 75);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = '900 30px Cairo, sans-serif';
        ctx.fillText(`إجمالي الكاش المطلوب: ${totalCash.toLocaleString()} ج.م`, widthDots / 2, heightDots - 86);

        return canvas;
    }

    function buildAllWaybillCanvases(ordersToPrint, cfg) {
        const copies = Math.max(1, parseInt(cfg.copies) || 1);
        const canvases = [];
        ordersToPrint.forEach((o, idx) => {
            for (let c = 0; c < copies; c++) {
                canvases.push(window.renderWaybillToThermalCanvas(o, cfg, idx + 1, ordersToPrint.length));
            }
        });
        if (cfg.includeRouteSummary && ordersToPrint.length > 1) {
            canvases.push(renderDriverSummaryCanvas(ordersToPrint, cfg));
        }
        return canvases;
    }

    // =========================================================================
    // 📡 3. تحويل Canvas إلى أوامر هاردوير TSPL 203-DPI لطابعة Deli E750W
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

        const bitmapBytes = new Uint8Array(widthBytes * heightDots);
        bitmapBytes.fill(0xFF);

        const threshold = (Number(cfg.density) || 12) >= 12 ? 185 : 155;

        for (let y = 0; y < heightDots; y++) {
            for (let x = 0; x < widthDots; x++) {
                const pIdx = (y * widthDots + x) * 4;
                const lum = 0.299 * imgData[pIdx] + 0.587 * imgData[pIdx + 1] + 0.114 * imgData[pIdx + 2];
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

    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    // =========================================================================
    // 🔌 4. الربط والطباعة المباشرة عبر شريحة الـ APK الأصلية (بلوتوث + USB + Spooler)
    // =========================================================================

    // أ) ربط واختيار طابعة البلوتوث مباشرة من داخل الـ APK
    window.connectDeliBluetoothPrinter = async function () {
        // 1. إذا كانت شريحة الـ APK الأصلية موجودة
        if (hasNativeAndroidBridge()) {
            const res = window.SmanNativePrinter.getPairedDevicesJson();
            if (res === 'PERMISSION_REQUIRED') {
                notifyPrinterToast('⚡ يرجى الموافقة على صلاحية البلوتوث من النافذة التي ظهرت الآن، ثم اضغط ربط بلوتوث مرة أخرى');
                return;
            }
            if (res === 'BLUETOOTH_OFF') {
                notifyPrinterToast('🔵 يرجى تشغيل البلوتوث في الهاتف ثم اضغط ربط بلوتوث');
                return;
            }
            if (res === 'NO_BLUETOOTH') {
                return alert('هذا الجهاز لا يحتوي على بلوتوث.');
            }
            if (res.startsWith('ERROR:')) {
                return alert('حدث خطأ أثناء فحص البلوتوث: ' + res);
            }

            let devices = [];
            try { devices = JSON.parse(res); } catch (e) {}

            const pickerBox = document.getElementById('deli-paired-devices-box');
            if (!devices || devices.length === 0) {
                alert('⚠️ لم يتم العثور على طابعة مقترنة بالبلوتوث!\n\nافتح إعدادات البلوتوث في موبايلك أولاً واعمل اقتران (Pair) مع طابعة Deli E750W مرة واحدة، ثم ارجع هنا واضغط ربط بلوتوث.');
                return;
            }

            if (pickerBox) {
                pickerBox.classList.remove('hidden');
                pickerBox.innerHTML = `
                    <div class="flex justify-between items-center pb-2 mb-2 border-b border-slate-700">
                        <span class="text-xs font-black text-emerald-400">🔵 اختر طابعة البلوتوث المقترنة بهاتفك:</span>
                        <button type="button" onclick="document.getElementById('deli-paired-devices-box').classList.add('hidden')" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="space-y-1.5 max-h-44 overflow-y-auto custom-scroll">
                        ${devices.map(d => {
                            const safeName = (d.name || 'طابعة بلوتوث').replace(/'/g, '');
                            const isSelected = window.deliPrinterConnection.savedMac === d.address;
                            return `
                            <button type="button" onclick="selectNativeBluetoothPrinter('${d.address}', '${safeName}')" class="w-full p-2.5 rounded-xl border text-right flex justify-between items-center transition-all ${isSelected ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'}">
                                <span class="font-black text-xs">🖨️ ${d.name || 'جهاز بلوتوث'}</span>
                                <span class="text-[10px] font-bold opacity-80" dir="ltr">${d.address}</span>
                            </button>`;
                        }).join('')}
                    </div>
                `;
            }
            return;
        }

        // 2. إذا كان المستخدم يفتح من كمبيوتر يدعم WebBluetooth
        if (navigator.bluetooth) {
            try {
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: [
                        '000018f0-0000-1000-8000-00805f9b34fb',
                        '0000ff00-0000-1000-8000-00805f9b34fb',
                        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                        'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
                    ]
                });
                const server = await device.gatt.connect();
                const services = await server.getPrimaryServices();
                let writeChar = null;
                for (const srv of services) {
                    const chars = await srv.getCharacteristics();
                    for (const c of chars) {
                        if (c.properties.write || c.properties.writeWithoutResponse) {
                            writeChar = c;
                            break;
                        }
                    }
                    if (writeChar) break;
                }
                if (writeChar) {
                    window.deliPrinterConnection.btDevice = device;
                    window.deliPrinterConnection.btCharacteristic = writeChar;
                    window.deliPrinterConnection.savedName = device.name || 'Deli E750W';
                    updateConnectionBadgesUI();
                    notifyPrinterToast(`🔵 تم ربط بلوتوث الطابعة (${window.deliPrinterConnection.savedName}) بنجاح!`);
                }
            } catch (e) {}
            return;
        }

        alert('⚠️ لتفعيل البلوتوث المباشر داخل التطبيق بدون أي وسيط، يرجى تحميل وتثبيت نسخة الـ APK المحدثة من GitHub Actions.');
    };

    window.selectNativeBluetoothPrinter = function (macAddress, devName) {
        window.deliPrinterConnection.activeMode = 'bluetooth';
        window.deliPrinterConnection.savedMac = macAddress;
        window.deliPrinterConnection.savedName = devName;
        localStorage.setItem('sman_deli_conn_mode', 'bluetooth');
        localStorage.setItem('sman_deli_bt_mac', macAddress);
        localStorage.setItem('sman_deli_bt_name', devName);
        document.getElementById('deli-paired-devices-box')?.classList.add('hidden');
        updateConnectionBadgesUI();
        notifyPrinterToast(`✅ تم اختيار الطابعة (${devName}) وحفظها للطباعة المباشرة!`);
    };

    // ب) ربط كابل USB المباشر
    window.connectDeliUsbSerialPrinter = async function () {
        if (hasNativeAndroidBridge()) {
            window.deliPrinterConnection.activeMode = 'usb';
            localStorage.setItem('sman_deli_conn_mode', 'usb');
            updateConnectionBadgesUI();
            // إرسال أمر فحص خفيف لطلب صلاحية الـ USB من الأندرويد إن لم تكن ممنوحة
            const testRes = window.SmanNativePrinter.printRawBase64Usb(btoa('\r\n'));
            if (testRes === 'NO_USB_DEVICE') {
                alert('🔌 لم يتم اكتشاف طابعة متصلة بكابل USB في الهاتف.\nتأكد من توصيل كابل الطابعة عبر وصلة OTG وتشغيل الطابعة.');
            } else if (testRes === 'USB_PERMISSION_REQUESTED') {
                notifyPrinterToast('🔌 وافق على صلاحية الـ USB التي ظهرت على الشاشة الآن لتفعيل الطباعة بالكابل');
            } else if (testRes.startsWith('OK')) {
                notifyPrinterToast('🔌 تم الاتصال بطابعة Deli E750W عبر كابل الـ USB بنجاح!');
            }
            return;
        }

        if (navigator.serial) {
            try {
                const port = await navigator.serial.requestPort();
                await port.open({ baudRate: 115200 });
                window.deliPrinterConnection.usbPort = port;
                window.deliPrinterConnection.activeMode = 'usb';
                updateConnectionBadgesUI();
                notifyPrinterToast('🔌 تم ربط منفذ USB المباشر بنجاح!');
            } catch (e) {}
            return;
        }

        notifyPrinterToast('🖨️ على الكمبيوتر يمكنك الضغط على (طباعة النظام Spooler) للطباعة عبر كابل الـ USB فوراً');
    };

    // ج) الزر الأخضر الرئيسي: طباعة مباشرة على Deli E750W (بلوتوث / USB) بدون أي وسيط!
    window.triggerStudioDirectTSPLPrint = async function (customOrdersQueue = null) {
        const cfg = document.getElementById('deli-waybill-studio-modal') && !document.getElementById('deli-waybill-studio-modal').classList.contains('hidden')
            ? readStudioInputsToConfig()
            : window.getWaybillConfig();
        persistWaybillConfig(cfg);

        const queue = customOrdersQueue || (
            (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
                ? window.deliPrinterConnection.lastOrdersQueue
                : [getSampleOrderForPreview()]
        );

        const canvases = buildAllWaybillCanvases(queue, cfg);
        if (canvases.length === 0) return;

        const btn = document.getElementById('btn-deli-direct-print');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال المباشر للطابعة...';
            btn.disabled = true;
        }

        setTimeout(async () => {
            try {
                let totalLen = 0;
                const packets = canvases.map(cnv => {
                    const p = convertCanvasToTSPLPacket(cnv, cfg);
                    totalLen += p.length;
                    return p;
                });

                const combinedBytes = new Uint8Array(totalLen);
                let offset = 0;
                packets.forEach(p => {
                    combinedBytes.set(p, offset);
                    offset += p.length;
                });

                const base64Payload = uint8ArrayToBase64(combinedBytes);

                // 1. الطباعة المباشرة عبر شريحة الأندرويد الأصلية داخل الـ APK
                if (hasNativeAndroidBridge()) {
                    let result = '';
                    if (window.deliPrinterConnection.activeMode === 'usb') {
                        result = window.SmanNativePrinter.printRawBase64Usb(base64Payload);
                        if (result === 'NO_USB_DEVICE') {
                            // التحويل التلقائي للبلوتوث إذا لم يكن كابل الـ USB موصلاً
                            const mac = window.deliPrinterConnection.savedMac || 'AUTO';
                            result = window.SmanNativePrinter.printRawBase64Bluetooth(mac, base64Payload);
                        }
                    } else {
                        const mac = window.deliPrinterConnection.savedMac || 'AUTO';
                        result = window.SmanNativePrinter.printRawBase64Bluetooth(mac, base64Payload);
                    }

                    if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }

                    if (result.startsWith('OK')) {
                        const pName = result.split(':')[1] || 'Deli E750W';
                        window.deliPrinterConnection.savedName = pName;
                        updateConnectionBadgesUI();
                        notifyPrinterToast(`✅ تمت الطباعة المباشرة لعدد (${canvases.length}) بوليصة على (${pName})!`);
                        return;
                    } else if (result === 'PERMISSION_REQUIRED') {
                        alert('⚡ يرجى الضغط على (سماح / Allow) في نافذة صلاحية البلوتوث، ثم اضغط طباعة مرة أخرى.');
                        return;
                    } else if (result === 'BLUETOOTH_OFF') {
                        alert('🔵 البلوتوث مغلق! يرجى تشغيل البلوتوث في هاتفك أولاً.');
                        return;
                    } else if (result === 'NO_PAIRED_PRINTER') {
                        alert('⚠️ لم يتم العثور على طابعة مقترنة! افتح إعدادات البلوتوث في هاتفك واعمل اقتران (Pair) مع طابعة Deli E750W أولاً.');
                        return;
                    } else {
                        alert('⚠️ تعذر الاتصال بالطابعة (' + result + ').\nتأكد أن طابعة Deli E750W مفتوحة وقريبة من الهاتف، أو اضغط (ربط بلوتوث الطابعة) لاختيارها.');
                        return;
                    }
                }

                // 2. إذا كان متصلاً عبر WebBluetooth أو WebSerial على الكمبيوتر
                const sentWeb = await sendRawBytesViaWebHardware(combinedBytes);
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                if (sentWeb) {
                    notifyPrinterToast(`✅ تمت الطباعة المباشرة لعدد (${canvases.length}) بوليصة!`);
                    return;
                }

                // 3. إذا لم يكن داخل الـ APK المحدث بعد، نستخدم طباعة النظام
                window.printViaInPageThermalFrame(queue, cfg);
            } catch (err) {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                console.error(err);
                alert('حدث خطأ أثناء الطباعة: ' + (err.message || err));
            }
        }, 60);
    };

    async function sendRawBytesViaWebHardware(bytesArray) {
        if (window.deliPrinterConnection.usbPort && window.deliPrinterConnection.usbPort.writable) {
            const writer = window.deliPrinterConnection.usbPort.writable.getWriter();
            await writer.write(bytesArray);
            writer.releaseLock();
            return true;
        }
        const ch = window.deliPrinterConnection.btCharacteristic;
        if (ch) {
            const chunkSize = 180;
            for (let i = 0; i < bytesArray.length; i += chunkSize) {
                const chunk = bytesArray.slice(i, i + chunkSize);
                if (ch.properties.writeWithoutResponse) {
                    await ch.writeValueWithoutResponse(chunk);
                } else {
                    await ch.writeValue(chunk);
                }
                await new Promise(r => setTimeout(r, 12));
            }
            return true;
        }
        return false;
    }

    // د) طباعة النظام (Spooler) المدعومة بشريحة PrintManager للأندرويد والكمبيوتر
    window.printViaInPageThermalFrame = function (ordersToPrint, customCfg = null) {
        if (!ordersToPrint || ordersToPrint.length === 0) return alert('لا توجد طلبات للطباعة!');
        injectDirectPrintStyles();

        const cfg = customCfg || window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const canvases = buildAllWaybillCanvases(ordersToPrint, cfg);

        let mount = document.getElementById('deli-direct-print-mount');
        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'deli-direct-print-mount';
            document.body.appendChild(mount);
        }

        let pageRuleStyle = document.getElementById('deli-dynamic-page-size');
        if (!pageRuleStyle) {
            pageRuleStyle = document.createElement('style');
            pageRuleStyle.id = 'deli-dynamic-page-size';
            document.head.appendChild(pageRuleStyle);
        }
        pageRuleStyle.innerHTML = `@media print { @page { size: ${dims.w}mm ${dims.h}mm; margin: 0mm !important; } }`;

        mount.innerHTML = canvases.map(cnv => `
            <div class="deli-print-page" style="width:${dims.w}mm; height:${dims.h}mm; overflow:hidden;">
                <img src="${cnv.toDataURL('image/png')}" style="width:100%; height:100%; display:block;" alt="Waybill">
            </div>
        `).join('');

        setTimeout(() => {
            if (hasNativeAndroidBridge() && typeof window.SmanNativePrinter.triggerAndroidSystemPrint === 'function') {
                window.SmanNativePrinter.triggerAndroidSystemPrint('Sman_Hehya_Waybill');
            } else {
                window.print();
            }
        }, 180);
    };

    // أوامر معايرة وسحب الورق المباشرة
    window.sendDeliHardwareCommand = async function (cmdType) {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        let tsplCmd = '';

        if (cmdType === 'calibrate') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nGAP ${cfg.gapMm || 2} mm,0 mm\r\nHOME\r\nSOUND 2,100\r\n`;
        } else if (cmdType === 'feed') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nFORMFEED\r\n`;
        }

        const base64Cmd = btoa(tsplCmd);
        if (hasNativeAndroidBridge()) {
            const mac = window.deliPrinterConnection.savedMac || 'AUTO';
            const res = window.SmanNativePrinter.printRawBase64Bluetooth(mac, base64Cmd);
            if (res.startsWith('OK')) {
                notifyPrinterToast('⚡ تم تنفيذ أمر الهاردوير على طابعة Deli E750W');
            } else {
                alert('تأكد من اتصال الطابعة بالبلوتوث أولاً (' + res + ')');
            }
            return;
        }

        const bytes = new TextEncoder().encode(tsplCmd);
        await sendRawBytesViaWebHardware(bytes);
        notifyPrinterToast('⚡ تم إرسال أمر الهاردوير للطابعة');
    };

    function updateConnectionBadgesUI() {
        const btStatus = document.getElementById('deli-bt-status-badge');
        if (!btStatus) return;

        if (hasNativeAndroidBridge()) {
            if (window.deliPrinterConnection.activeMode === 'usb') {
                btStatus.className = 'bg-cyan-500 text-slate-950 px-3 py-1 rounded-full text-[11px] font-black';
                btStatus.innerText = '🔌 وضع كابل USB المباشر جاهز';
            } else if (window.deliPrinterConnection.savedName) {
                btStatus.className = 'bg-emerald-500 text-slate-950 px-3 py-1 rounded-full text-[11px] font-black';
                btStatus.innerText = `🔵 بلوتوث جاهز: ${window.deliPrinterConnection.savedName}`;
            } else {
                btStatus.className = 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-[11px] font-black';
                btStatus.innerText = '🟢 شريحة بلوتوث APK الأصلية مفعلة';
            }
        } else if (window.deliPrinterConnection.btCharacteristic) {
            btStatus.className = 'bg-emerald-500 text-slate-950 px-3 py-1 rounded-full text-[11px] font-black';
            btStatus.innerText = `🔵 متصل: ${window.deliPrinterConnection.savedName || 'Deli E750W'}`;
        } else {
            btStatus.className = 'bg-slate-700 text-slate-200 px-3 py-1 rounded-full text-[11px] font-bold';
            btStatus.innerText = '🖨️ جاهز للطباعة المباشرة';
        }
    }

    // =========================================================================
    // 🎛️ 5. واجهة استوديو الطباعة المباشرة (Deli E750W)
    // =========================================================================
    function ensureDeliStudioModalExists() {
        let modal = document.getElementById('deli-waybill-studio-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'deli-waybill-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[210] hidden flex items-center justify-center p-2 sm:p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200 animate-scale-up">
                <!-- الهيدر -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-xl shrink-0">
                            <i class="fa-solid fa-print"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="font-black text-sm sm:text-base text-white">استوديو الطباعة المباشرة (Deli E750W)</h3>
                                <span id="deli-bt-status-badge" class="bg-emerald-500/20 text-emerald-300 px-3 py-0.5 rounded-full text-[11px] font-black">🟢 جاهز للطباعة</span>
                            </div>
                            <p class="text-[11px] text-slate-300 font-bold mt-0.5">طباعة هاردوير مباشرة (TSPL 203 DPI) عبر البلوتوث أو USB بدون أي تطبيقات خارجية</p>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" onclick="connectDeliBluetoothPrinter()" class="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm">
                            <i class="fa-brands fa-bluetooth-b"></i> ربط بلوتوث الطابعة
                        </button>
                        <button type="button" onclick="connectDeliUsbSerialPrinter()" class="bg-teal-600 hover:bg-teal-500 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-usb"></i> ربط USB
                        </button>
                        <button type="button" onclick="closeDeliStudioModal()" class="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all">
                            <i class="fa-solid fa-xmark text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- جسم الاستوديو -->
                <div class="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50">
                    
                    <!-- قسم المعاينة وأزرار الطباعة المباشرة -->
                    <div class="lg:col-span-5 lg:order-2 flex flex-col justify-between bg-slate-200/75 rounded-2xl p-4 border border-slate-300">
                        <div>
                            <!-- قائمة اختيار الطابعات المقترنة بالبلوتوث (تظهر عند الضغط على ربط بلوتوث) -->
                            <div id="deli-paired-devices-box" class="hidden mb-3 bg-slate-900 text-white p-3.5 rounded-2xl border border-emerald-500/40"></div>

                            <div class="flex justify-between items-center mb-2.5">
                                <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-eye text-brand-primary ml-1"></i> المعاينة الحرارية (<span id="dw-queue-count-badge">1</span> بوليصة)</span>
                                <span id="dw-dims-badge" class="bg-slate-900 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">100×100 مم (800px×800)</span>
                            </div>

                            <div id="dw-live-preview-stage" class="bg-white rounded-2xl shadow-inner border border-slate-300 p-2.5 flex items-center justify-center overflow-hidden min-h-[290px]"></div>
                        </div>

                        <!-- أزرار الطباعة المباشرة -->
                        <div class="space-y-2.5 mt-4 pt-3 border-t border-slate-300">
                            <button type="button" id="btn-deli-direct-print" onclick="triggerStudioDirectTSPLPrint()" class="w-full bg-brand-primary hover:bg-emerald-800 text-white font-black py-3.5 rounded-2xl text-xs sm:text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2 active:scale-95">
                                <i class="fa-solid fa-bolt text-amber-300 text-base"></i>
                                <span>⚡ طباعة مباشرة على Deli E750W (بلوتوث / USB)</span>
                            </button>

                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" onclick="triggerStudioMainPrint()" class="bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-print text-amber-400"></i> طباعة النظام (Spooler)
                                </button>
                                <button type="button" onclick="saveWaybillSettings()" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-floppy-disk text-emerald-600"></i> حفظ الإعدادات
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- قسم إعدادات المقاس والهاردوير -->
                    <div class="lg:col-span-7 lg:order-1 space-y-4">
                        
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-ruler-combined text-brand-primary ml-1"></i> 1. مقاس رول الاستيكر وتصميم البوليصة</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">مقاس رول الاستيكر (Deli E750W)</label>
                                    <select id="dw-size-preset" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 outline-none focus:border-brand-primary">
                                        <option value="100x100">📏 10×10 سم (100×100 مم - القياسي)</option>
                                        <option value="100x150">📏 10×15 سم (100×150 مم - بوليصة شحن كبيرة)</option>
                                        <option value="80x60">📏 8×6 سم (80×60 مم - متوسط)</option>
                                        <option value="70x50">📏 7×5 سم (70×50 مم - مدمج)</option>
                                        <option value="50x30">🏷️ 5×3 سم (50×30 مم - استيكر طبق سمان)</option>
                                        <option value="custom">⚙️ مقاس حر مخصص بالمليمتر...</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">تصميم القالب</label>
                                    <select id="dw-template-mode" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 outline-none focus:border-brand-primary">
                                        <option value="shipping">📦 بوليصة شحن وتحصيل كاملة (VIP)</option>
                                        <option value="product_tag">🏷️ استيكر منتج / طبق سمان للفريزر</option>
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
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">غمقان الحبر (1-15)</label>
                                    <input type="number" id="dw-density" min="1" max="15" value="12" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-slate-800 bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">سرعة الطباعة (2-6)</label>
                                    <select id="dw-speed" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                        <option value="3">3 (جودة فائقة)</option>
                                        <option value="4" selected>4 (متوازن 100mm/s)</option>
                                        <option value="6">6 (أقصى سرعة 150mm/s)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">نوع حساس الورق</label>
                                    <select id="dw-sensor-type" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                        <option value="gap">ملصقات بفواصل (Gap)</option>
                                        <option value="continuous">حراري مستمر (Continuous)</option>
                                        <option value="bmark">علامة سوداء (Black Mark)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">مسافة الفاصل (مم)</label>
                                    <input type="number" id="dw-gap-mm" min="0" max="10" step="0.5" value="2" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                            </div>

                            <div class="grid grid-cols-3 gap-3 pt-1">
                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">حجم الخط بالبوليصة</label>
                                    <select id="dw-font-scale" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                        <option value="small">صغير (أصناف كثيرة)</option>
                                        <option value="normal" selected>متوسط قياسي</option>
                                        <option value="large">كبير وواضح جداً</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">إزاحة أفقية X (مم)</label>
                                    <input type="number" id="dw-offset-x" min="-8" max="8" step="0.5" value="0" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-slate-500 block mb-1">عدد النسخ للبوليصة</label>
                                    <input type="number" id="dw-copies" min="1" max="10" value="1" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-brand-primary bg-emerald-50 border-emerald-200">
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-sliders text-amber-500 ml-1"></i> 3. محتويات البوليصة والتشغيل الفوري</h4>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-black text-slate-700">
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-logo" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> لوجو سمان ههيا
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-barcode" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> باركود CODE128
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-prices" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أسعار الأصناف بالجدول
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-weight" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أوزان الأصناف
                                </label>
                                <label class="flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-200 cursor-pointer text-amber-900 sm:col-span-2">
                                    <input type="checkbox" id="dw-route-summary" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded"> ملصق تجميعي للمندوب مع الطباعة الجماعية
                                </label>
                            </div>

                            <div class="pt-1">
                                <label class="text-[10px] font-bold text-slate-500 block mb-1">رسالة التذييل أسفل البوليصة</label>
                                <input type="text" id="dw-footer-text" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                            </div>

                            <div class="pt-2 border-t border-slate-100">
                                <label class="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 cursor-pointer">
                                    <input type="checkbox" id="dw-instant-print" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-emerald-600 rounded">
                                    ⚡ طباعة فورية بضغطة واحدة من كارت الطلب (بدون فتح المعاينة في كل مرة)
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

    function populateStudioInputsFromConfig(cfg) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };

        setVal('dw-size-preset', cfg.sizePreset || '100x100');
        setVal('dw-template-mode', cfg.templateMode || 'shipping');
        setVal('dw-width-mm', cfg.widthMm || 100);
        setVal('dw-height-mm', cfg.heightMm || 100);
        setVal('dw-density', cfg.density || 12);
        setVal('dw-speed', cfg.speed || 4);
        setVal('dw-sensor-type', cfg.sensorType || 'gap');
        setVal('dw-gap-mm', cfg.gapMm !== undefined ? cfg.gapMm : 2);
        setVal('dw-font-scale', cfg.fontScale || 'normal');
        setVal('dw-offset-x', cfg.offsetXMm || 0);
        setVal('dw-copies', cfg.copies || 1);
        setVal('dw-footer-text', cfg.footerText || '');

        setChk('dw-show-logo', cfg.showLogo !== false);
        setChk('dw-show-barcode', cfg.showBarcode !== false);
        setChk('dw-show-prices', cfg.showItemsPrice !== false);
        setChk('dw-show-weight', cfg.showWeightInfo !== false);
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
            speed: Number(getVal('dw-speed', 4)) || 4,
            sensorType: getVal('dw-sensor-type', 'gap'),
            gapMm: Number(getVal('dw-gap-mm', 2)) || 0,
            fontScale: getVal('dw-font-scale', 'normal'),
            offsetXMm: Number(getVal('dw-offset-x', 0)) || 0,
            copies: Math.max(1, parseInt(getVal('dw-copies', 1)) || 1),
            footerText: getVal('dw-footer-text', ''),
            showLogo: getChk('dw-show-logo', true),
            showBarcode: getChk('dw-show-barcode', true),
            showItemsPrice: getChk('dw-show-prices', true),
            showWeightInfo: getChk('dw-show-weight', true),
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
            customerName: 'د. محمد ماضي (معاينة)',
            customerPhone: '01208027294',
            zone: 'ههيا',
            customerAddress: 'شارع الجمهورية - بجوار الصيدلية',
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
            dimsBadge.innerText = `${dims.w}×${dims.h} مم (${dims.w * DOTS_PER_MM}px×${dims.h * DOTS_PER_MM})`;
        }

        const renderedCanvas = window.renderWaybillToThermalCanvas(sampleOrd, cfg, 1, queueLen);
        renderedCanvas.style.cssText = 'max-width: 100%; max-height: 320px; width: auto; height: auto; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.12);';
        stage.innerHTML = '';
        stage.appendChild(renderedCanvas);
    }

    window.closeDeliStudioModal = function () {
        document.getElementById('deli-waybill-studio-modal')?.classList.add('hidden');
    };

    // =========================================================================
    // 🔗 6. الدوال العامة المرتبطة بأزرار البوليصة في الموقع بالكامل
    // =========================================================================

    window.openWaybillSettingsModal = function (ordersQueue = null) {
        if (typeof closeModal === 'function') closeModal('waybill-settings-modal');
        const modal = ensureDeliStudioModalExists();
        if (Array.isArray(ordersQueue) && ordersQueue.length > 0) {
            window.deliPrinterConnection.lastOrdersQueue = ordersQueue;
        } else {
            const firstLive = (typeof allOrdersRaw !== 'undefined' && allOrdersRaw.length > 0) ? [allOrdersRaw[0]] : [];
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
        notifyPrinterToast('✅ تم حفظ إعدادات طابعة البوالص (Deli E750W) بنجاح!');
    };

    window.triggerStudioMainPrint = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printViaInPageThermalFrame(queue, newCfg);
    };

    window.previewWaybillSample = function () {
        window.openWaybillSettingsModal();
    };

    window.printSingleOrderWaybill = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return alert('لم يتم العثور على بيانات هذا الطلب!');

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = [order];

        if (cfg.instantPrint) {
            window.triggerStudioDirectTSPLPrint([order]);
        } else {
            window.openWaybillSettingsModal([order]);
        }
    };

    window.bulkPrintWaybills = function () {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');

        const ordersToPrint = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => checkedIds.includes(o.id));
        if (ordersToPrint.length === 0) return;

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;

        if (cfg.instantPrint) {
            window.triggerStudioDirectTSPLPrint(ordersToPrint);
        } else {
            window.openWaybillSettingsModal(ordersToPrint);
        }
    };

    window.executeThermalWaybillsPrint = function (ordersToPrint) {
        if (!ordersToPrint || ordersToPrint.length === 0) return;
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;
        window.triggerStudioDirectTSPLPrint(ordersToPrint);
    };

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
        window.addEventListener('DOMContentLoaded', () => {
            injectDirectPrintStyles();
            setTimeout(injectHeaderPrinterQuickBtn, 700);
        });
    } else {
        injectDirectPrintStyles();
        setTimeout(injectHeaderPrinterQuickBtn, 700);
    }
})();

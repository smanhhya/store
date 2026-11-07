// =========================================================================
// 🖨️ المحرك الشامل لطابعة البوالص الحرارية (Deli E750W - TSPL / ESC-POS / Spooler)
// الملف: www/waybill.js | خاص بمشروع: سمان ههيا (CRM)
// المواصفات المدعومة: 203 DPI (8 dots/mm) | Max Width: 108mm | Speed: 150mm/s
// =========================================================================

(function () {
    const DOTS_PER_MM = 8; // 203 DPI = 8 نقاط لكل مليمتر

    // 1. الإعدادات الافتراضية المتوافقة مع Deli E750W
    const defaultDeliConfig = {
        sizePreset: '100x100',   // '100x100' | '100x150' | '80x60' | '70x50' | '50x30' | 'custom'
        widthMm: 100,            // أقصى عرض في Deli E750W هو 108 مم
        heightMm: 100,
        sensorType: 'gap',       // 'gap' (فواصل) | 'continuous' (مستمر) | 'bmark' (علامة سوداء)
        gapMm: 2,                // مسافة الفاصل بين الاستيكرات (عادة 2 مم أو 3 مم)
        density: 12,             // غمقان الحرارة في TSPL من 1 إلى 15 (12 ممتاز للخط العربي والباركود)
        speed: 4,                // سرعة الطباعة في TSPL من 2 إلى 6 (150mm/s = 6)
        direction: 0,            // اتجاه خروج الورقة: 0 أو 1
        offsetXMm: 0,            // إزاحة أفقية بالمليمتر (-5 إلى +5)
        offsetYMm: 0,            // إزاحة رأسية بالمليمتر (-5 إلى +5)
        fontScale: 'normal',     // 'small' | 'normal' | 'large'
        templateMode: 'shipping',// 'shipping' (بوليصة شحن) | 'compact' (مدمجة) | 'product_tag' (استيكر طبق)
        printMethod: 'spooler',  // 'spooler' (مباشر متصفح/ويندوز/أندرويد) | 'bluetooth_tspl' | 'usb_tspl' | 'rawbt'
        instantPrint: false,     // false = فتح شاشة معاينة الاستوديو أولاً | true = طباعة فورية بضغطة واحدة
        copies: 1,               // عدد النسخ لكل بوليصة
        showLogo: true,
        showBarcode: true,
        showQrCode: true,
        showItemsPrice: true,
        showWeightInfo: true,
        includeRouteSummary: false, // طباعة ملصق إجمالي للمندوب في نهاية الطباعة الجماعية
        footerText: 'سمان ههيا الفريش - جودة تليق ببيتك 🤍 بالهنا والشفا'
    };

    // حالة الاتصال بالبلوتوث أو الـ USB
    window.deliPrinterConnection = {
        btDevice: null,
        btCharacteristic: null,
        usbPort: null,
        lastOrdersQueue: []
    };

    // قراءة وحفظ إعدادات الطابعة
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

    // تحديد الأبعاد بالمليمتر حسب المقاس المختار
    function resolveDimensionsMm(cfg) {
        const presets = {
            '100x100': { w: 100, h: 100 },
            '100x150': { w: 100, h: 150 },
            '80x60':   { w: 80,  h: 60 },
            '70x50':   { w: 70,  h: 50 },
            '50x30':   { w: 50,  h: 30 }
        };
        if (presets[cfg.sizePreset]) {
            return presets[cfg.sizePreset];
        }
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

    // =========================================================================
    // 🎨 2. بناء HTML البوليصة الحرارية عالية التباين (203 DPI Optimized)
    // =========================================================================
    window.buildSingleWaybillCardHTML = function (order, cfg, indexNum = 1, totalCount = 1) {
        const dims = resolveDimensionsMm(cfg);
        const storeName = (typeof storeSettings !== 'undefined' && storeSettings.storeName) ? storeSettings.storeName : 'سمان ههيا';
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const orderShortId = (order.id || '000000').slice(-6).toUpperCase();
        const barcodeCode = orderShortId.replace(/[^A-Z0-9]/g, '1') || '100200';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');
        const batchTitle = (typeof window.resolveOrderBatchName === 'function')
            ? window.resolveOrderBatchName(order)
            : ((order.batchName && order.batchName !== 'undefined') ? order.batchName : '');

        const isOnline = order.paymentMethod === 'online';
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const delivery = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const total = Number(order.total) || 0;
        const debt = Number(order.debt) || 0;

        // حساب إجمالي عدد الأطباق/الوحدات في الطلب
        let totalUnitsCount = 0;
        const itemsList = Array.isArray(order.items) ? order.items : [];
        itemsList.forEach(i => { totalUnitsCount += (Number(i.quantity) || 0); });

        // رابط QR ذكي للمندوب (يفتح واتساب العميل مباشرة عند مسحه بالكاميرا)
        const cleanPhone = String(order.customerPhone || '').trim();
        const waPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;
        const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent('https://wa.me/' + waPhone)}`;

        // 🏷️ إذا كان القالب المختار هو "استيكر طبق سمان / فريزر" (مقاس صغير 50x30 أو 70x50)
        if (cfg.templateMode === 'product_tag' || (dims.w <= 60 && dims.h <= 45)) {
            const firstItem = itemsList[0] || { name: 'سمان ههيا فريش', quantity: 1, id: '' };
            const prodInfo = prodsObj[firstItem.id] || {};
            const weightTxt = prodInfo.weight ? prodInfo.weight : 'ذبح اليوم - طازج';
            return `
            <div class="wb-sheet" style="width:${dims.w}mm; height:${dims.h}mm; padding:1.8mm; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; border:1.5px solid #000; font-family:'Cairo',sans-serif; background:#fff; color:#000; overflow:hidden; page-break-after:always;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #000; padding-bottom:1mm;">
                    <span style="font-weight:900; font-size:9pt;">🐦 ${storeName}</span>
                    <span style="font-weight:900; font-size:7.5pt;" dir="ltr">${storePhone}</span>
                </div>
                <div style="text-align:center; margin:auto 0;">
                    <div style="font-weight:900; font-size:11pt; line-height:1.2;">${firstItem.quantity}x ${firstItem.name}</div>
                    ${cfg.showWeightInfo ? `<div style="font-weight:800; font-size:8pt; margin-top:0.5mm;">⚖️ ${weightTxt}</div>` : ''}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #000; padding-top:1mm; font-size:7pt; font-weight:800;">
                    <span>إنتاج: ${orderDateStr}</span>
                    <span>#${orderShortId}</span>
                </div>
            </div>`;
        }

        // 📦 القالب القياسي والملكي لبوليصة الشحن (100x100 / 100x150 / 80x60)
        const baseFontPt = cfg.fontScale === 'large' ? 10.5 : (cfg.fontScale === 'small' ? 8.5 : 9.5);
        const isTall = dims.h >= 135;

        const itemsRowsHtml = itemsList.map(i => {
            const pInfo = prodsObj[i.id] || {};
            const wBadge = (cfg.showWeightInfo && pInfo.weight) ? ` <span style="font-size:${baseFontPt - 2}pt; font-weight:700;">(${pInfo.weight})</span>` : '';
            const priceCell = cfg.showItemsPrice
                ? `<td style="border:1.5px solid #000; padding:1mm 1.5mm; text-align:center; font-weight:900;">${(Number(i.quantity) || 0) * (Number(i.price) || 0)} ج</td>`
                : '';
            return `
                <tr>
                    <td style="border:1.5px solid #000; padding:1mm 1.5mm; font-weight:900;">${i.name}${wBadge}</td>
                    <td style="border:1.5px solid #000; padding:1mm 1.5mm; text-align:center; font-weight:900; font-size:${baseFontPt + 1}pt;">${i.quantity}</td>
                    ${priceCell}
                </tr>
            `;
        }).join('');

        const notesText = [
            order.driverNote ? order.driverNote.split('\n---\n').pop() : '',
            (!order.driverNote && order.adminNote) ? order.adminNote.split('\n---\n').pop() : ''
        ].filter(Boolean).join(' | ');

        return `
        <div class="wb-sheet" style="width:${dims.w}mm; height:${dims.h}mm; padding:2.5mm; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; background:#fff; color:#000; font-family:'Cairo',sans-serif; font-size:${baseFontPt}pt; border:2px solid #000; overflow:hidden; page-break-after:always; position:relative; transform:translate(${cfg.offsetXMm || 0}mm, ${cfg.offsetYMm || 0}mm);">
            
            <!-- 1. ترويسة البوليصة (اللوجو + الباركود + رقم البوليصة) -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:1.5mm; gap:2mm;">
                <div>
                    ${cfg.showLogo ? `<div style="font-size:${baseFontPt + 4}pt; font-weight:900; line-height:1;">🐦 ${storeName}</div>` : ''}
                    <div style="font-size:${baseFontPt - 1.5}pt; font-weight:900; margin-top:0.8mm;" dir="ltr">📞 ${storePhone}</div>
                    <div style="font-size:${baseFontPt - 2}pt; font-weight:800;">📅 ${orderDateStr} ${batchTitle ? `• ${batchTitle}` : ''}</div>
                </div>

                ${cfg.showBarcode ? `
                <div style="text-align:center; flex-shrink:0;">
                    <svg class="wb-barcode-svg" data-code="${barcodeCode}" style="height:${isTall ? '12mm' : '9.5mm'}; max-width:38mm;"></svg>
                    <div style="font-size:7.5pt; font-weight:900; letter-spacing:1px; line-height:1;">#${orderShortId} (${indexNum}/${totalCount})</div>
                </div>` : `<div style="font-size:11pt; font-weight:900; border:2px solid #000; padding:1mm 2mm; border-radius:1.5mm;">#${orderShortId}</div>`}
            </div>

            <!-- 2. بيانات العميل والمنطقة والعنوان -->
            <div style="border:2px solid #000; border-radius:2mm; padding:1.8mm 2.2mm; margin-top:1.5mm; background:#fff;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:2mm;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:${baseFontPt + 2}pt; font-weight:900; line-height:1.2;">👤 ${order.customerName || 'عميل سمان ههيا'}</div>
                        <div style="font-size:${baseFontPt + 1}pt; font-weight:900; margin-top:0.8mm;" dir="ltr">
                            📱 ${order.customerPhone || ''}
                            ${order.customerPhone2 ? ` | 📞 ${order.customerPhone2}` : ''}
                        </div>
                    </div>
                    <div style="background:#000; color:#fff; padding:1mm 2.5mm; border-radius:1.5mm; font-size:${baseFontPt + 1}pt; font-weight:900; text-align:center; flex-shrink:0;">
                        📍 ${order.zone || 'غير محدد'}
                    </div>
                </div>
                <div style="font-size:${baseFontPt - 0.5}pt; font-weight:800; margin-top:1mm; padding-top:1mm; border-top:1px dashed #000; line-height:1.25;">
                    🏠 العنوان: ${order.customerAddress || 'استلام حسب المنطقة المسجلة'}
                    ${order.driverName ? ` <span style="float:left; font-weight:900;">(🛵 المندوب: ${order.driverName})</span>` : ''}
                </div>
            </div>

            <!-- 3. جدول الأصناف المطلوبة -->
            <div style="margin-top:1.5mm; flex:1; display:flex; flex-direction:column; justify-content:flex-start; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; font-size:${baseFontPt - 0.5}pt;">
                    <thead>
                        <tr style="background:#000; color:#fff;">
                            <th style="border:1.5px solid #000; padding:0.8mm 1.5mm; text-align:right; font-weight:900;">الصنف المطلوب (إجمالي: ${Number(totalUnitsCount.toFixed(1))})</th>
                            <th style="border:1.5px solid #000; padding:0.8mm 1.5mm; text-align:center; width:14mm; font-weight:900;">العدد</th>
                            ${cfg.showItemsPrice ? `<th style="border:1.5px solid #000; padding:0.8mm 1.5mm; text-align:center; width:18mm; font-weight:900;">الإجمالي</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml || `<tr><td colspan="3" style="border:1.5px solid #000; padding:2mm; text-align:center; font-weight:900;">طلب سمان طازج</td></tr>`}
                    </tbody>
                </table>

                ${notesText ? `
                <div style="margin-top:1.2mm; border:1.5px dashed #000; border-radius:1.5mm; padding:1mm 1.8mm; font-size:${baseFontPt - 1}pt; font-weight:900; line-height:1.2;">
                    ⚠️ ملاحظة التسليم: ${notesText}
                </div>` : ''}
            </div>

            <!-- 4. الصندوق المالي الحاسم + QR Code المندوب -->
            <div style="margin-top:1.5mm;">
                <div style="display:flex; align-items:stretch; gap:2mm;">
                    <div style="flex:1; border:2.5px solid #000; border-radius:2mm; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between;">
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#000; color:#fff; padding:1.5mm 2.5mm;">
                            <span style="font-size:${baseFontPt}pt; font-weight:900;">${isOnline ? '💳 حالة الدفع:' : '💰 المطلوب تحصيله:'}</span>
                            <span style="font-size:${baseFontPt + 3.5}pt; font-weight:900;">${isOnline ? 'خالص أونلاين (0 ج)' : `${total} ج.م`}</span>
                        </div>
                        <div style="display:flex; justify-content:space-around; align-items:center; padding:1mm 1.5mm; font-size:${baseFontPt - 1.5}pt; font-weight:900; background:#fff;">
                            <span>المنتجات: ${subtotal} ج</span>
                            <span>•</span>
                            <span>التوصيل: ${delivery} ج</span>
                            ${discount > 0 ? `<span>• خصم: ${discount} ج</span>` : ''}
                            ${debt > 0 ? `<span>• آجل: ${debt} ج</span>` : ''}
                        </div>
                    </div>

                    ${(cfg.showQrCode && waPhone) ? `
                    <div style="width:${isTall ? '18mm' : '15mm'}; border:1.5px solid #000; border-radius:2mm; padding:0.8mm; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0;">
                        <img src="${qrDataUrl}" crossorigin="anonymous" style="width:${isTall ? '13.5mm' : '11mm'}; height:${isTall ? '13.5mm' : '11mm'}; display:block;" alt="QR">
                        <span style="font-size:6pt; font-weight:900; margin-top:0.4mm;">امسح للتواصل</span>
                    </div>` : ''}
                </div>

                ${cfg.footerText ? `
                <div style="text-align:center; font-size:${baseFontPt - 2}pt; font-weight:900; margin-top:1mm; pt:0.5mm;">
                    ${cfg.footerText}
                </div>` : ''}
            </div>
        </div>`;
    };

    // بناء ملصق تجميعي لخط سير المندوب (يخرج في نهاية الطباعة الجماعية عند تفعيله)
    function buildDriverRouteSummaryStickerHTML(ordersList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        let totalCash = 0;
        let onlineCount = 0;
        const itemsSum = {};
        const zonesSum = {};

        ordersList.forEach(o => {
            if (o.paymentMethod === 'online') onlineCount++;
            else totalCash += (Number(o.total) || 0);

            const z = o.zone || 'غير محدد';
            zonesSum[z] = (zonesSum[z] || 0) + 1;

            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    itemsSum[i.name] = (itemsSum[i.name] || 0) + (Number(i.quantity) || 0);
                });
            }
        });

        const itemsLines = Object.keys(itemsSum).map(k => `<span style="border:1px solid #000; padding:0.5mm 1.5mm; border-radius:1mm; display:inline-block; margin:0.5mm;">${itemsSum[k]}x ${k}</span>`).join(' ');
        const zonesLines = Object.keys(zonesSum).map(z => `${z} (${zonesSum[z]})`).join(' ، ');

        return `
        <div class="wb-sheet" style="width:${dims.w}mm; height:${dims.h}mm; padding:3mm; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; background:#fff; color:#000; font-family:'Cairo',sans-serif; font-size:9.5pt; border:2.5px solid #000; page-break-after:always;">
            <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:1.5mm;">
                <div style="font-size:13pt; font-weight:900;">🛵 ملخص استلام خط سير المندوب</div>
                <div style="font-size:8pt; font-weight:800;">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</div>
            </div>
            <div style="margin:2mm 0; font-weight:900;">
                <div style="margin-bottom:1.5mm;">📦 إجمالي البوالص: ${ordersList.length} طلب (${ordersList.length - onlineCount} كاش / ${onlineCount} أونلاين)</div>
                <div style="margin-bottom:1.5mm; font-size:8.5pt;">📍 المناطق: ${zonesLines}</div>
                <div style="border-top:1.5px dashed #000; padding-top:1.5mm; font-size:8.5pt;">
                    <div>🥩 إجمالي الأصناف المحملة مع المندوب:</div>
                    <div style="margin-top:1mm;">${itemsLines}</div>
                </div>
            </div>
            <div style="background:#000; color:#fff; padding:2mm; border-radius:2mm; text-align:center; font-size:12pt; font-weight:900;">
                💰 إجمالي الكاش المطلوب توريده: ${totalCash.toLocaleString()} ج.م
            </div>
        </div>`;
    }

    // تفعيل رسم الباركود (JsBarcode) داخل أية حاوية
    function renderBarcodesInsideContainer(containerEl) {
        if (typeof JsBarcode !== 'function' || !containerEl) return;
        containerEl.querySelectorAll('.wb-barcode-svg').forEach(svg => {
            const code = svg.getAttribute('data-code') || '100200';
            try {
                JsBarcode(svg, code, {
                    format: 'CODE128',
                    displayValue: false,
                    height: 36,
                    width: 1.7,
                    margin: 0,
                    lineColor: '#000000'
                });
            } catch (e) {}
        });
    }

    // =========================================================================
    // ⚡ 3. محرك الطباعة المدمج بدون نوافذ منبثقة (In-Page Thermal Spooler)
    // =========================================================================
    window.printViaInPageThermalFrame = function (ordersToPrint, customCfg = null) {
        if (!ordersToPrint || ordersToPrint.length === 0) return alert('لا توجد طلبات للطباعة!');
        const cfg = customCfg || window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const copies = Math.max(1, parseInt(cfg.copies) || 1);

        let allSheetsHtml = '';
        ordersToPrint.forEach((o, idx) => {
            for (let c = 0; c < copies; c++) {
                allSheetsHtml += window.buildSingleWaybillCardHTML(o, cfg, idx + 1, ordersToPrint.length);
            }
        });

        if (cfg.includeRouteSummary && ordersToPrint.length > 1) {
            allSheetsHtml += buildDriverRouteSummaryStickerHTML(ordersToPrint, cfg);
        }

        // إزالة أي إطار طباعة سابق وإنشاء إطار حراري مخفي داخل نفس الصفحة (لا يحظره الأندرويد ولا المتصفح)
        let printFrame = document.getElementById('deli-750w-thermal-iframe');
        if (printFrame) printFrame.remove();

        printFrame = document.createElement('iframe');
        printFrame.id = 'deli-750w-thermal-iframe';
        printFrame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
        document.body.appendChild(printFrame);

        // محاكاة غمقان الحبر الحراري في وضع الـ Spooler عبر فلتر التباين والسمك
        const contrastBoost = cfg.density >= 12 ? 'contrast(160%)' : 'contrast(120%)';

        const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
        const doc = frameDoc.document || frameDoc;

        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>Deli E750W Thermal Waybill</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&display=swap" rel="stylesheet">
                <style>
                    @page {
                        size: ${dims.w}mm ${dims.h}mm;
                        margin: 0mm !important;
                    }
                    * {
                        box-sizing: border-box;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: ${dims.w}mm;
                        background: #ffffff;
                        color: #000000;
                        font-family: 'Cairo', sans-serif;
                        filter: ${contrastBoost};
                    }
                    .wb-sheet {
                        page-break-inside: avoid;
                        page-break-after: always;
                    }
                    .wb-sheet:last-child {
                        page-break-after: auto;
                    }
                </style>
            </head>
            <body>
                <div id="thermal-root">${allSheetsHtml}</div>
            </body>
            </html>
        `);
        doc.close();

        // رسم الباركود داخل الإطار ثم إطلاق أمر الطباعة
        setTimeout(() => {
            try {
                const rootEl = doc.getElementById('thermal-root');
                renderBarcodesInsideContainer(rootEl);
            } catch (e) {}

            setTimeout(() => {
                try {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                    notifyPrinterToast(`🖨️ تم إرسال (${ordersToPrint.length}) بوليصة إلى طابعة Deli E750W`);
                } catch (err) {
                    console.error('Print frame error:', err);
                    alert('حدث خطأ أثناء استدعاء نافذة الطباعة.');
                }
            }, 450);
        }, 250);
    };

    // =========================================================================
    // 📡 4. مولد أوامر TSPL الأصلي لطابعة Deli E750W (USB / Bluetooth / RawBT)
    // =========================================================================

    // بناء ترويسة أوامر الهاردوير TSPL لطابعة Deli E750W
    window.generateDeliTSPLHeader = function (cfg) {
        const dims = resolveDimensionsMm(cfg);
        const density = Math.min(15, Math.max(1, parseInt(cfg.density) || 12));
        const speed = Math.min(6, Math.max(2, parseInt(cfg.speed) || 4));
        const dir = cfg.direction ? 1 : 0;
        const gap = Math.max(0, parseFloat(cfg.gapMm) || 2);

        let sensorCmd = `GAP ${gap} mm,0 mm`;
        if (cfg.sensorType === 'continuous') {
            sensorCmd = `GAP 0 mm,0 mm`;
        } else if (cfg.sensorType === 'bmark') {
            sensorCmd = `BLINE ${gap} mm,0 mm`;
        }

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

    // تحويل عنصر البوليصة المرئي إلى أوامر TSPL BITMAP (بدقة 203 DPI = 8 نقاط/مم)
    async function convertWaybillElementToTSPLBytes(sheetEl, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const widthDots = Math.floor(dims.w * DOTS_PER_MM);   // مثلاً 100mm * 8 = 800 نقطة
        const heightDots = Math.floor(dims.h * DOTS_PER_MM);  // مثلاً 100mm * 8 = 800 نقطة
        const widthBytes = Math.ceil(widthDots / 8);          // 100 بايت لكل سطر أفقي

        const canvas = document.createElement('canvas');
        canvas.width = widthDots;
        canvas.height = heightDots;
        const ctx = canvas.getContext('2d');

        // خلفية بيضاء صريحة
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, widthDots, heightDots);

        // تحويل الـ HTML إلى صورة SVG ForeignObject لرسم الخط العربي Cairo بدقة تامة على الـ Canvas
        const clone = sheetEl.cloneNode(true);
        clone.style.transform = 'none';
        clone.style.margin = '0';

        // استبدال صور الـ QR الخارجية لو تعذر تحميلها أثناء الرسم الخام
        clone.querySelectorAll('img').forEach(img => img.remove());

        const serializedHtml = new XMLSerializer().serializeToString(clone);
        const svgStr = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${widthDots}" height="${heightDots}">
                <foreignObject width="100%" height="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml" dir="rtl" style="width:${widthDots}px; height:${heightDots}px; font-family:'Cairo',sans-serif; background:#fff;">
                        ${serializedHtml}
                    </div>
                </foreignObject>
            </svg>
        `;

        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, widthDots, heightDots);
                resolve();
            };
            img.onerror = () => resolve();
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
        });

        // تحويل البكسلات إلى مصفوفة 1-Bit Monochrome بصيغة TSPL BITMAP
        // في لغة TSPL: البت 0 = نقطة سوداء مطبوعة، البت 1 = نقطة بيضاء فارغة
        const imgData = ctx.getImageData(0, 0, widthDots, heightDots).data;
        const bitmapBytes = new Uint8Array(widthBytes * heightDots);
        bitmapBytes.fill(0xFF); // 11111111 (أبيض افتراضياً)

        const threshold = cfg.density >= 12 ? 175 : 145;

        for (let y = 0; y < heightDots; y++) {
            for (let x = 0; x < widthDots; x++) {
                const pixelIdx = (y * widthDots + x) * 4;
                const r = imgData[pixelIdx];
                const g = imgData[pixelIdx + 1];
                const b = imgData[pixelIdx + 2];
                const a = imgData[pixelIdx + 3];
                const luminance = a < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);

                if (luminance < threshold) {
                    const byteIdx = y * widthBytes + Math.floor(x / 8);
                    const bitPos = 7 - (x % 8);
                    bitmapBytes[byteIdx] &= ~(1 << bitPos); // وضع 0 للطباعة بالأسود
                }
            }
        }

        const encoder = new TextEncoder();
        const headerBytes = encoder.encode(
            window.generateDeliTSPLHeader(cfg) +
            `BITMAP 0,0,${widthBytes},${heightDots},0,`
        );
        const footerBytes = encoder.encode(`\r\nPRINT ${Math.max(1, parseInt(cfg.copies) || 1)},1\r\n`);

        const totalPacket = new Uint8Array(headerBytes.length + bitmapBytes.length + footerBytes.length);
        totalPacket.set(headerBytes, 0);
        totalPacket.set(bitmapBytes, headerBytes.length);
        totalPacket.set(footerBytes, headerBytes.length + bitmapBytes.length);

        return totalPacket;
    }

    // الاتصال المباشر بطابعة Deli E750W عبر البلوتوث (WebBluetooth BLE)
    window.connectDeliBluetoothPrinter = async function () {
        if (!navigator.bluetooth) {
            return alert('⚠️ متصفحك الحالي لا يدعم WebBluetooth المباشر. استخدم متصفح Google Chrome على الأندرويد أو الكمبيوتر، أو اطبع بالوضع المباشر (Spooler).');
        }
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
                for (const ch of chars) {
                    if (ch.properties.write || ch.properties.writeWithoutResponse) {
                        writeChar = ch;
                        break;
                    }
                }
                if (writeChar) break;
            }

            if (!writeChar) {
                return alert('تم الاتصال بالطابعة ولكن لم يتم العثور على قناة كتابة البلوتوث (GATT Write). استخدم وضع الطباعة المباشر (Spooler).');
            }

            window.deliPrinterConnection.btDevice = device;
            window.deliPrinterConnection.btCharacteristic = writeChar;
            updateConnectionBadgesUI();
            notifyPrinterToast(`🔵 تم ربط بلوتوث الطابعة (${device.name || 'Deli E750W'}) بنجاح!`);
        } catch (e) {
            console.log('Bluetooth connect info:', e);
        }
    };

    // الاتصال المباشر بطابعة Deli E750W عبر كابل USB (WebSerial Virtual COM Port)
    window.connectDeliUsbSerialPrinter = async function () {
        if (!navigator.serial) {
            return alert('⚠️ للطباعة عبر USB على الكمبيوتر، يمكنك الطباعة فوراً بوضع (Spooler الافتراضي) دون الحاجة لإعداد منفذ تسلسلي.');
        }
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            window.deliPrinterConnection.usbPort = port;
            updateConnectionBadgesUI();
            notifyPrinterToast('🔌 تم فتح منفذ USB المباشر لطابعة Deli E750W بنجاح!');
        } catch (e) {
            console.log('USB Serial info:', e);
        }
    };

    // إرسال مصفوفة بايتات TSPL إلى الطابعة المتصلة (بلوتوث أو USB)
    async function sendRawTSPLBytesToDeli(bytesArray) {
        // 1. إذا كان متصلاً بـ USB Serial
        if (window.deliPrinterConnection.usbPort && window.deliPrinterConnection.usbPort.writable) {
            const writer = window.deliPrinterConnection.usbPort.writable.getWriter();
            await writer.write(bytesArray);
            writer.releaseLock();
            return true;
        }

        // 2. إذا كان متصلاً بـ Bluetooth BLE
        const ch = window.deliPrinterConnection.btCharacteristic;
        if (ch) {
            const chunkSize = 180; // تقسيم البيانات لحزم صغيرة لضمان عدم امتلاء ذاكرة البلوتوث
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

    // أوامر صيانة ومعايرة طابعة Deli E750W الفورية (Calibration & Feed)
    window.sendDeliHardwareCommand = async function (cmdType) {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        let tsplCmd = '';

        if (cmdType === 'calibrate') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nGAP ${cfg.gapMm || 2} mm,0 mm\r\nHOME\r\nSOUND 2,100\r\n`;
        } else if (cmdType === 'feed') {
            tsplCmd = `SIZE ${dims.w} mm,${dims.h} mm\r\nFORMFEED\r\n`;
        } else if (cmdType === 'selftest') {
            tsplCmd = `SELFTEST\r\n`;
        }

        const bytes = new TextEncoder().encode(tsplCmd);
        const sent = await sendRawTSPLBytesToDeli(bytes);
        if (sent) {
            notifyPrinterToast('⚡ تم إرسال أمر الهاردوير إلى طابعة Deli E750W');
        } else {
            // إذا لم يكن متصلاً بـ WebBluetooth/WebSerial، نعرض خيار إرساله عبر RawBT للأندرويد
            const base64Cmd = btoa(tsplCmd);
            window.location.href = `rawbt:base64,${base64Cmd}`;
            notifyPrinterToast('📡 تم إرسال أمر المعايرة إلى جسر الطابعة');
        }
    };

    function updateConnectionBadgesUI() {
        const btStatus = document.getElementById('deli-bt-status-badge');
        if (btStatus) {
            if (window.deliPrinterConnection.btCharacteristic) {
                const devName = window.deliPrinterConnection.btDevice?.name || 'Deli E750W';
                btStatus.className = 'bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
                btStatus.innerText = `🔵 بلوتوث متصل (${devName})`;
            } else if (window.deliPrinterConnection.usbPort) {
                btStatus.className = 'bg-cyan-500 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black';
                btStatus.innerText = '🔌 كابل USB مباشر متصل';
            } else {
                btStatus.className = 'bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-bold';
                btStatus.innerText = '⚪ وضع النظام المباشر (Spooler جاهز)';
            }
        }
    }

    // =========================================================================
    // 🎛️ 5. نافذة استوديو البوليصة والتحكم الكامل في طابعة Deli E750W
    // =========================================================================
    function ensureDeliStudioModalExists() {
        let modal = document.getElementById('deli-waybill-studio-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'deli-waybill-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[210] hidden flex items-center justify-center p-2 sm:p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-scale-up">
                <!-- الهيدر -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-xl">
                            <i class="fa-solid fa-print"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="font-black text-sm sm:text-base text-white">استوديو بوليصة الشحن والتحكم في طابعة (Deli E750W)</h3>
                                <span id="deli-bt-status-badge" class="bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">⚪ وضع النظام المباشر (Spooler)</span>
                            </div>
                            <p class="text-[11px] text-slate-300 font-bold mt-0.5">دقة 203 DPI (8 نقاط/مم) • دعم TSPL & ESC/POS • معاينة حية ومطابقة للمقاس بالمليمتر</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="connectDeliBluetoothPrinter()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm" title="ربط مباشر عبر البلوتوث">
                            <i class="fa-brands fa-bluetooth-b"></i> ربط بلوتوث
                        </button>
                        <button type="button" onclick="closeDeliStudioModal()" class="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all">
                            <i class="fa-solid fa-xmark text-base"></i>
                        </button>
                    </div>
                </div>

                <!-- جسم الاستوديو: إعدادات اليمين + معاينة البوليصة اليسار -->
                <div class="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50">
                    
                    <!-- العمود الأيمن: إعدادات الهاردوير والقالب (7 أعمدة) -->
                    <div class="lg:col-span-7 space-y-4">
                        
                        <!-- 1. مقاس الاستيكر ونوع القالب -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-ruler-combined text-brand-primary ml-1"></i> 1. مقاس الملصق الحراري ونوع القالب</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-slate-500 block mb-1">مقاس رول الاستيكر (Deli E750W)</label>
                                    <select id="dw-size-preset" onchange="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 outline-none focus:border-brand-primary">
                                        <option value="100x100">📏 10×10 سم (100×100 مم - القياسي)</option>
                                        <option value="100x150">📏 10×15 سم (100×150 مم - بوليصة كبيرة)</option>
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

                            <!-- خانات المقاس الحر -->
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

                        <!-- 2. إعدادات هاردوير طابعة Deli E750W (TSPL Hardware Control) -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                                <h4 class="text-xs font-black text-slate-800"><i class="fa-solid fa-microchip text-indigo-600 ml-1"></i> 2. تحكم الهاردوير وحساس الورق (Deli E750W TSPL)</h4>
                                <div class="flex gap-1.5">
                                    <button type="button" onclick="sendDeliHardwareCommand('calibrate')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all" title="ضبط حساس الفواصل أوتوماتيكياً">🎯 معايرة الحساس</button>
                                    <button type="button" onclick="sendDeliHardwareCommand('feed')" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all" title="إخراج استيكر واحد للتجربة">⏬ سحب ورقة</button>
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

                        <!-- 3. عناصر العرض وطريقة الإرسال -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                            <h4 class="text-xs font-black text-slate-800 border-b border-slate-100 pb-2"><i class="fa-solid fa-Sliders text-amber-500 ml-1"></i> 3. محتويات البوليصة وطريقة التشغيل</h4>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-black text-slate-700">
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-logo" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> لوجو سمان ههيا
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-barcode" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> باركود CODE128
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-qr" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> QR واتساب للمندوب
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-prices" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أسعار الأصناف بالجدول
                                </label>
                                <label class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/60 cursor-pointer">
                                    <input type="checkbox" id="dw-show-weight" checked onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-brand-primary rounded"> أوزان الأصناف
                                </label>
                                <label class="flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-200 cursor-pointer text-amber-900">
                                    <input type="checkbox" id="dw-route-summary" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-amber-600 rounded"> ملصق إجمالي للمندوب
                                </label>
                            </div>

                            <div class="pt-2">
                                <label class="text-[10px] font-bold text-slate-500 block mb-1">رسالة التذييل أسفل البوليصة</label>
                                <input type="text" id="dw-footer-text" oninput="onDeliStudioInputChange()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                            </div>

                            <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                <label class="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 cursor-pointer">
                                    <input type="checkbox" id="dw-instant-print" onchange="onDeliStudioInputChange()" class="w-4 h-4 accent-emerald-600 rounded">
                                    ⚡ طباعة فورية بضغطة واحدة من الكارت (بدون فتح نافذة المعاينة في كل مرة)
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- العمود الأيسر: شاشة المعاينة الحية وأزرار الطباعة المباشرة (5 أعمدة) -->
                    <div class="lg:col-span-5 flex flex-col justify-between bg-slate-200/70 rounded-2xl p-4 border border-slate-300/80">
                        <div>
                            <div class="flex justify-between items-center mb-3">
                                <span class="text-xs font-black text-slate-700"><i class="fa-solid fa-eye text-brand-primary ml-1"></i> معاينة حية للبوليصة (<span id="dw-queue-count-badge">1</span> بوليصة جاهزة)</span>
                                <span id="dw-dims-badge" class="bg-slate-800 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">100×100 مم (800×800 نقطة)</span>
                            </div>

                            <!-- صندوق عرض البوليصة المصغر المتجاوب -->
                            <div id="dw-live-preview-stage" class="bg-white rounded-2xl shadow-inner border border-slate-300 p-3 flex items-center justify-center overflow-auto min-h-[340px] max-h-[420px]"></div>
                        </div>

                        <!-- أزرار التنفيذ والطباعة -->
                        <div class="space-y-2 mt-4 pt-3 border-t border-slate-300">
                            <button type="button" onclick="triggerStudioMainPrint()" class="w-full bg-brand-primary hover:bg-emerald-800 text-white font-black py-3.5 rounded-2xl text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2 active:scale-95">
                                <i class="fa-solid fa-print text-amber-300 text-base"></i>
                                <span>اطبع البوليصة الآن (Spooler مباشر)</span>
                            </button>

                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" onclick="triggerStudioDirectTSPLPrint()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-brands fa-bluetooth-b"></i> إرسال TSPL (بلوتوث/RawBT)
                                </button>
                                <button type="button" onclick="saveWaybillSettings()" class="bg-slate-800 hover:bg-slate-900 text-white font-black py-2.5 px-3 rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-floppy-disk text-emerald-400"></i> حفظ الإعدادات
                                </button>
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
        setChk('dw-show-qr', cfg.showQrCode !== false);
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
            showQrCode: getChk('dw-show-qr', true),
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
            customerName: 'د. محمد ماضي (نموذج معاينة)',
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
            dimsBadge.innerText = `${dims.w}×${dims.h} مم (${dims.w * DOTS_PER_MM}×${dims.h * DOTS_PER_MM} نقطة)`;
        }

        // تصغير المعاينة بصرياً لتناسب الشاشة مع الحفاظ على النسبة الحقيقية
        const scaleRatio = dims.h > 120 ? 0.68 : 0.82;
        stage.innerHTML = `
            <div id="dw-preview-card-holder" style="transform:scale(${scaleRatio}); transform-origin:top center;">
                ${window.buildSingleWaybillCardHTML(sampleOrd, cfg, 1, queueLen)}
            </div>
        `;
        renderBarcodesInsideContainer(stage);
    }

    window.closeDeliStudioModal = function () {
        document.getElementById('deli-waybill-studio-modal')?.classList.add('hidden');
    };

    // =========================================================================
    // 🔗 6. ربط واستبدال دوال البوليصة في الموقع بالكامل
    // =========================================================================

    // فتح إعدادات واستوديو البوليصة
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

    // حفظ إعدادات البوليصة
    window.saveWaybillSettings = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        notifyPrinterToast('✅ تم حفظ إعدادات طابعة البوالص (Deli E750W) بنجاح!');
    };

    // الطباعة من زر الاستوديو الرئيسي (Spooler مباشر بدون نوافذ منبثقة)
    window.triggerStudioMainPrint = function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const queue = (window.deliPrinterConnection.lastOrdersQueue && window.deliPrinterConnection.lastOrdersQueue.length > 0)
            ? window.deliPrinterConnection.lastOrdersQueue
            : [getSampleOrderForPreview()];
        window.printViaInPageThermalFrame(queue, newCfg);
    };

    // الطباعة المباشرة بأوامر TSPL عبر البلوتوث أو USB أو RawBT
    window.triggerStudioDirectTSPLPrint = async function () {
        const newCfg = readStudioInputsToConfig();
        persistWaybillConfig(newCfg);
        const holder = document.querySelector('#dw-preview-card-holder .wb-sheet');
        if (!holder) return;

        try {
            notifyPrinterToast('⏳ جاري تجهيز مصفوفة TSPL بدقة 203 DPI...');
            const tsplPacket = await convertWaybillElementToTSPLBytes(holder, newCfg);
            const sent = await sendRawTSPLBytesToDeli(tsplPacket);
            if (sent) {
                notifyPrinterToast('✅ تمت الطباعة المباشرة بأوامر TSPL على Deli E750W!');
            } else {
                // إذا لم يكن البلوتوث مربوطاً من المتصفح، نرسل إلى جسر RawBT على الأندرويد أو نطبع بالـ Spooler
                window.triggerStudioMainPrint();
            }
        } catch (e) {
            console.error(e);
            window.triggerStudioMainPrint();
        }
    };

    // معاينة البوليصة القياسية
    window.previewWaybillSample = function () {
        window.openWaybillSettingsModal();
    };

    // طباعة أوردر فردي من كارت الطلب
    window.printSingleOrderWaybill = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return alert('لم يتم العثور على بيانات هذا الطلب!');

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = [order];

        if (cfg.instantPrint) {
            window.printViaInPageThermalFrame([order], cfg);
        } else {
            window.openWaybillSettingsModal([order]);
        }
    };

    // طباعة جماعية للطلبات المحددة في شريط التحديد الجماعي
    window.bulkPrintWaybills = function () {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');

        const ordersToPrint = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => checkedIds.includes(o.id));
        if (ordersToPrint.length === 0) return;

        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;

        if (cfg.instantPrint) {
            window.printViaInPageThermalFrame(ordersToPrint, cfg);
        } else {
            window.openWaybillSettingsModal(ordersToPrint);
        }
    };

    // استبدال الدالة القديمة executeThermalWaybillsPrint لضمان عمل أي استدعاء قديم
    window.executeThermalWaybillsPrint = function (ordersToPrint) {
        if (!ordersToPrint || ordersToPrint.length === 0) return;
        const cfg = window.getWaybillConfig();
        window.deliPrinterConnection.lastOrdersQueue = ordersToPrint;
        window.printViaInPageThermalFrame(ordersToPrint, cfg);
    };

    // إضافة أيقونة سريعة لاستوديو الطابعة في الشريط العلوي بجوار الفريزر والمناديب
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

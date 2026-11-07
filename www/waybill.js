// =========================================================================
// 🖨️ محرك بوالص الشحن الحرارية والباركود الذكي (waybill.js)
// مصمم خصيصاً لطابعات Deli 750W الحرارية (100x100mm / 100x150mm / 80mm)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    // 1. الإعدادات الافتراضية للبوليصة الحرارية
    const DEFAULT_WB_CONFIG = {
        slogan: 'طازج من مزارعنا لمائدتك',
        footerMsg: 'تشرفنا بخدمتكم.. بالهنا والشفا من سمان ههيا 🤍',
        logoUrl: '',
        paperSize: '100x100', // '100x100' | '100x150' | '80xAuto'
        showBarcode: true,
        showBreakdown: true,
        showDriverNote: true,
        directPrintMode: false // لو مفعلة يطبع فوراً بضغطة واحدة بدون نافذة المعاينة
    };

    window.waybillStudioState = {
        orders: [],
        bagsPerOrder: 1,
        hidePrices: false
    };

    // جلب إعدادات البوليصة الحالية من storeSettings أو حقول الإعدادات
    window.getWaybillConfig = function () {
        const saved = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : {};
        return {
            slogan: document.getElementById('wb-slogan')?.value?.trim() || saved.slogan || DEFAULT_WB_CONFIG.slogan,
            footerMsg: document.getElementById('wb-footer-msg')?.value?.trim() || saved.footerMsg || DEFAULT_WB_CONFIG.footerMsg,
            logoUrl: document.getElementById('wb-logo-url')?.value?.trim() ?? (saved.logoUrl || DEFAULT_WB_CONFIG.logoUrl),
            paperSize: document.getElementById('wb-paper-size')?.value || saved.paperSize || DEFAULT_WB_CONFIG.paperSize,
            showBarcode: document.getElementById('wb-show-barcode') ? document.getElementById('wb-show-barcode').checked : (saved.showBarcode !== false),
            showBreakdown: document.getElementById('wb-show-breakdown') ? document.getElementById('wb-show-breakdown').checked : (saved.showBreakdown !== false),
            showDriverNote: document.getElementById('wb-show-driver-note') ? document.getElementById('wb-show-driver-note').checked : (saved.showDriverNote !== false),
            directPrintMode: saved.directPrintMode === true
        };
    };

    // مزامنة حقول إعدادات البوليصة في شاشة الإعدادات مع Firebase
    window.syncWaybillSettingsUI = function () {
        const cfg = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : DEFAULT_WB_CONFIG;
        if (document.getElementById('wb-slogan')) document.getElementById('wb-slogan').value = cfg.slogan || DEFAULT_WB_CONFIG.slogan;
        if (document.getElementById('wb-footer-msg')) document.getElementById('wb-footer-msg').value = cfg.footerMsg || DEFAULT_WB_CONFIG.footerMsg;
        if (document.getElementById('wb-logo-url')) document.getElementById('wb-logo-url').value = cfg.logoUrl || '';
        if (document.getElementById('wb-paper-size')) document.getElementById('wb-paper-size').value = cfg.paperSize || '100x100';
        if (document.getElementById('wb-show-barcode')) document.getElementById('wb-show-barcode').checked = cfg.showBarcode !== false;
        if (document.getElementById('wb-show-breakdown')) document.getElementById('wb-show-breakdown').checked = cfg.showBreakdown !== false;
        if (document.getElementById('wb-show-driver-note')) document.getElementById('wb-show-driver-note').checked = cfg.showDriverNote !== false;
    };

    // =========================================================================
    // 📊 2. مولد باركود قياسي مدمج (Pure SVG Code-128B) حاد جداً للطابعات الحرارية
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

    function generateBarcodeSVG(text, height = 34) {
        const clean = String(text || 'SMAN001').replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().slice(0, 16) || 'SMAN001';
        let codes = [104]; // Start Code B
        let checksum = 104;

        for (let i = 0; i < clean.length; i++) {
            const code = clean.charCodeAt(i) - 32;
            const validCode = (code >= 0 && code < 95) ? code : 16;
            codes.push(validCode);
            checksum += validCode * (i + 1);
        }
        codes.push(checksum % 103);
        codes.push(106); // Stop

        const bits = codes.map(c => CODE128_PATTERNS[c]).join('');
        let rects = '';
        let x = 0;
        const barWidth = 1.6;

        for (let i = 0; i < bits.length; i++) {
            if (bits[i] === '1') {
                rects += `<rect x="${(x * barWidth).toFixed(1)}" y="0" width="${barWidth}" height="${height}" fill="#000000" />`;
            }
            x++;
        }

        const totalWidth = (bits.length * barWidth).toFixed(1);
        return `
            <div style="text-align:center; line-height:1;">
                <svg viewBox="0 0 ${totalWidth} ${height}" style="width:100%; max-width:210px; height:${height}px; display:block; margin:0 auto;" shape-rendering="crispEdges">
                    ${rects}
                </svg>
                <div style="font-family:monospace; font-size:10px; font-weight:900; letter-spacing:2px; margin-top:2px; color:#000;">*${clean}*</div>
            </div>
        `;
    }

    // استخراج كود مختصر واضح للطلب
    function getShortOrderCode(order) {
        if (!order || !order.id) return 'SH-1001';
        const phoneTail = String(order.customerPhone || '').replace(/\D/g, '').slice(-4) || '0000';
        const idTail = String(order.id).replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
        return `SH-${phoneTail}-${idTail}`;
    }

    // =========================================================================
    // 🧾 3. بناء هيكل البوليصة الواحدة باحترافية عالية لطابعة Deli 750W
    // =========================================================================
    function buildSingleWaybillHTML(order, cfg, bagIndex = 1, totalBags = 1, hidePrices = false) {
        const storeName = (typeof storeSettings !== 'undefined' && storeSettings.storeName) ? storeSettings.storeName : 'سمان ههيا';
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const orderCode = getShortOrderCode(order);
        const orderDate = order.orderDate || new Date().toLocaleDateString('ar-EG');

        const items = Array.isArray(order.items) ? order.items : [];
        const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
        const isCompactItems = items.length > 4;
        const is150mm = cfg.paperSize === '100x150';

        // حساب حالة التحصيل (كاش أو خالص أونلاين أو آجل)
        const isOnline = order.paymentMethod === 'online' || order.isPrepaidConfirmed === true;
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const deliveryFee = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const finalTotal = Number(order.total) || 0;
        const debtVal = Number(order.debt) || 0;

        // استخراج آخر ملاحظة للمندوب
        let driverNoteClean = '';
        if (cfg.showDriverNote && order.driverNote && order.driverNote.trim() !== '') {
            driverNoteClean = order.driverNote.split('\n---\n').pop().replace(/^\[.*?\]\s*/, '').trim();
        }

        // اسم الدفعة أو المندوب
        const batchTitle = (order.batchName && order.batchName !== 'undefined') ? order.batchName : '';
        const driverTitle = order.driverName ? `🛵 ${order.driverName}` : '';

        // اللوجو
        const logoHtml = cfg.logoUrl
            ? `<img src="${cfg.logoUrl}" alt="logo" style="width:36px; height:36px; object-fit:contain; border:1.5px solid #000; border-radius:6px; background:#fff;" onerror="this.style.display='none'">`
            : `<div style="width:34px; height:34px; border:2px solid #000; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px; background:#000; color:#fff; flex-shrink:0;">س</div>`;

        // صفوف الأصناف
        const itemsRowsHtml = items.map(item => {
            const lineTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);
            return `
                <tr>
                    <td style="padding:${isCompactItems ? '2px 4px' : '3.5px 6px'}; border-bottom:1px solid #000; font-weight:900; font-size:${isCompactItems ? '10.5px' : '12px'};">${item.name}</td>
                    <td style="padding:${isCompactItems ? '2px 4px' : '3.5px 6px'}; border-bottom:1px solid #000; text-align:center; font-weight:900; font-size:${isCompactItems ? '11px' : '13px'}; background:#f3f4f6;">${item.quantity}</td>
                    ${!hidePrices ? `<td style="padding:${isCompactItems ? '2px 4px' : '3.5px 6px'}; border-bottom:1px solid #000; text-align:left; font-weight:800; font-size:${isCompactItems ? '10px' : '11.5px'};">${lineTotal} ج</td>` : ''}
                </tr>
            `;
        }).join('');

        return `
        <div class="wb-page">
            <div class="wb-frame">
                <!-- 1. رأس البوليصة (Header) -->
                <div class="wb-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${logoHtml}
                        <div>
                            <div style="font-size:15px; font-weight:900; line-height:1.1; color:#000;">${storeName}</div>
                            <div style="font-size:9.5px; font-weight:800; color:#000; margin-top:1px;">${cfg.slogan}</div>
                            <div style="font-size:9.5px; font-weight:900; direction:ltr; text-align:right;">📞 ${storePhone}</div>
                        </div>
                    </div>

                    <div style="text-align:left; display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                        <div style="background:#000; color:#fff; font-weight:900; font-size:12px; padding:2px 7px; border-radius:5px; letter-spacing:0.5px;">
                            📍 ${order.zone || 'توصيل'}
                        </div>
                        <div style="font-size:9px; font-weight:800; color:#000;">📅 ${orderDate}</div>
                        ${totalBags > 1 ? `<div style="border:1.5px solid #000; font-size:9.5px; font-weight:900; padding:0px 5px; border-radius:4px;">📦 كيس ${bagIndex} من ${totalBags}</div>` : ''}
                    </div>
                </div>

                <!-- 2. بيانات العميل والعنوان (Customer Box) -->
                <div class="wb-customer-box">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:4px; border-bottom:1.5px dashed #000; padding-bottom:3px; margin-bottom:3px;">
                        <div style="font-size:13.5px; font-weight:900; color:#000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            👤 ${order.customerName || 'عميل سمان ههيا'}
                        </div>
                        <div style="font-size:12.5px; font-weight:900; direction:ltr; background:#fff; border:1.5px solid #000; padding:0px 5px; border-radius:4px; flex-shrink:0;">
                            📱 ${order.customerPhone || ''}
                        </div>
                    </div>

                    ${order.customerPhone2 ? `
                    <div style="font-size:10.5px; font-weight:900; margin-bottom:2px;">
                        📞 رقم بديل: <span style="direction:ltr; display:inline-block;">${order.customerPhone2}</span>
                    </div>` : ''}

                    <div style="font-size:11px; font-weight:800; line-height:1.3; color:#000;">
                        🏠 <strong>العنوان:</strong> ${order.zone ? order.zone + ' - ' : ''}${order.customerAddress || 'يتصل المندوب لتحديد الموقع'}
                    </div>
                </div>

                <!-- 3. جدول الأصناف المطلوبة (Items Table) -->
                <div class="wb-items-wrap">
                    <table style="width:100%; border-collapse:collapse; text-align:right;">
                        <thead>
                            <tr style="background:#000; color:#fff; font-size:10px; font-weight:900;">
                                <th style="padding:3px 6px;">الصنف المطلوب (${items.length})</th>
                                <th style="padding:3px 4px; text-align:center; width:46px;">الكمية (${Number(totalQty.toFixed(1))})</th>
                                ${!hidePrices ? `<th style="padding:3px 6px; text-align:left; width:62px;">الإجمالي</th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsRowsHtml || `<tr><td colspan="3" style="padding:6px; text-align:center; font-weight:900;">طلب سمان ههيا</td></tr>`}
                        </tbody>
                    </table>
                </div>

                <!-- 4. ملاحظات المندوب (إن وجدت) -->
                ${driverNoteClean ? `
                <div style="border:1.5px solid #000; border-radius:5px; padding:3px 6px; font-size:10px; font-weight:900; background:#fff;">
                    ⚠️ <strong>ملاحظة للمندوب:</strong> ${driverNoteClean}
                </div>` : ''}

                <!-- 5. مربع التحصيل المالي البارز (COD / Financial Box) -->
                ${!hidePrices ? `
                <div class="wb-cod-box ${isOnline ? 'wb-cod-online' : ''}">
                    ${cfg.showBreakdown ? `
                    <div style="display:flex; justify-content:space-between; font-size:9.5px; font-weight:900; border-bottom:1px solid ${isOnline ? '#fff' : '#000'}; padding-bottom:2px; margin-bottom:2px;">
                        <span>المنتجات: ${subtotal} ج</span>
                        <span>التوصيل: ${deliveryFee} ج</span>
                        ${discount > 0 ? `<span>خصم: -${discount} ج</span>` : ''}
                    </div>` : ''}

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:900;">
                            ${isOnline ? '✅ حالة الفاتورة:' : '💰 المطلوب تحصيله (كاش):'}
                        </span>
                        <span style="font-size:${is150mm ? '18px' : '15.5px'}; font-weight:900;">
                            ${isOnline ? 'خالص أونلاين (0 ج)' : `${finalTotal} ج.م`}
                        </span>
                    </div>
                    ${debtVal > 0 ? `<div style="font-size:9.5px; font-weight:900; margin-top:2px; border-top:1px dashed #000; padding-top:1px;">📕 مسجل آجل على الطلب: ${debtVal} ج</div>` : ''}
                </div>` : `
                <div class="wb-cod-box" style="text-align:center; font-size:12px; font-weight:900;">
                    🎁 طلب مُهدى من سمان ههيا (خالص الحساب)
                </div>`}

                <!-- 6. الباركود والرسالة الختامية (Footer & Barcode) -->
                <div class="wb-footer">
                    ${cfg.showBarcode ? generateBarcodeSVG(orderCode, is150mm ? 36 : 26) : `<div style="font-weight:900; font-size:10px; text-align:center;">كود الطلب: ${orderCode}</div>`}
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:9px; font-weight:900; margin-top:2px; border-top:1px solid #000; padding-top:2px;">
                        <span>${cfg.footerMsg}</span>
                        <span>${driverTitle || batchTitle || ''}</span>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // بناء وثيقة الطباعة الكاملة مع أبعاد `@page` الدقيقة لطابعة Deli 750W
    function buildFullPrintDocument(ordersList, cfg, bagsCount = 1, hidePrices = false) {
        let pageW = '100mm';
        let pageH = '100mm';
        let frameHeight = '96mm';

        if (cfg.paperSize === '100x150') {
            pageW = '100mm';
            pageH = '150mm';
            frameHeight = '146mm';
        } else if (cfg.paperSize === '80xAuto') {
            pageW = '80mm';
            pageH = 'auto';
            frameHeight = 'auto';
        }

        let allPagesHtml = '';
        ordersList.forEach(order => {
            const totalBags = Math.max(1, parseInt(bagsCount) || 1);
            for (let b = 1; b <= totalBags; b++) {
                allPagesHtml += buildSingleWaybillHTML(order, cfg, b, totalBags, hidePrices);
            }
        });

        return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>بوليصة شحن سمان ههيا</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
        @page {
            size: ${pageW} ${pageH};
            margin: 0mm !important;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${pageW};
            background: #ffffff;
            color: #000000;
            font-family: 'Cairo', 'Tahoma', sans-serif;
            -webkit-font-smoothing: none;
        }
        .wb-page {
            width: ${pageW};
            height: ${pageH};
            padding: 2mm;
            page-break-after: always;
            break-after: page;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }
        .wb-page:last-child {
            page-break-after: auto;
            break-after: auto;
        }
        .wb-frame {
            width: 100%;
            height: ${frameHeight};
            border: 2.2px solid #000000;
            border-radius: 6px;
            padding: 2.2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 1.5mm;
            background: #ffffff;
        }
        .wb-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #000000;
            padding-bottom: 1.5mm;
        }
        .wb-customer-box {
            border: 1.8px solid #000000;
            border-radius: 5px;
            padding: 1.8mm 2.2mm;
            background: #ffffff;
        }
        .wb-items-wrap {
            border: 1.8px solid #000000;
            border-radius: 5px;
            overflow: hidden;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }
        .wb-cod-box {
            border: 2.2px solid #000000;
            border-radius: 6px;
            padding: 1.8mm 2.5mm;
            background: #f8fafc;
            color: #000000;
        }
        .wb-cod-online {
            background: #000000 !important;
            color: #ffffff !important;
        }
        .wb-footer {
            padding-top: 1mm;
        }
    </style>
</head>
<body>
    ${allPagesHtml}
</body>
</html>`;
    }

    // =========================================================================
    // 🚀 4. محرك الطباعة المباشر عبر Iframe مخفي (بدون مشاكل النوافذ المنبثقة)
    // =========================================================================
    window.executeThermalPrint = function (ordersArray, bagsCount = 1, hidePrices = false) {
        if (!ordersArray || ordersArray.length === 0) return alert('لا توجد طلبات للطباعة!');
        const cfg = window.getWaybillConfig();
        const docHtml = buildFullPrintDocument(ordersArray, cfg, bagsCount, hidePrices);

        let printFrame = document.getElementById('deli-thermal-print-frame');
        if (printFrame) printFrame.remove();

        printFrame = document.createElement('iframe');
        printFrame.id = 'deli-thermal-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
        const doc = frameDoc.document || frameDoc;
        doc.open();
        doc.write(docHtml);
        doc.close();

        // انتظار تحميل الخط والصور ثم إطلاق أمر الطباعة تلقائياً
        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                // خطة بديلة إذا كان المتصفح على هاتف قديم
                const win = window.open('', '_blank');
                if (win) {
                    win.document.write(docHtml + '<script>window.onload=function(){window.print();}<\/script>');
                    win.document.close();
                }
            }
        }, 450);
    };

    // =========================================================================
    // 🖥️ 5. استوديو معاينة وتجهيز البوليصة قبل الطباعة (Waybill Studio Modal)
    // =========================================================================
    function ensureWaybillStudioModalExists() {
        if (document.getElementById('waybill-studio-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'waybill-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[200] hidden flex items-center justify-center p-3 md:p-4 transition-opacity';
        modal.innerHTML = `
            <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-200">
                <!-- Header -->
                <div class="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center font-black">
                            <i class="fa-solid fa-print text-lg"></i>
                        </div>
                        <div>
                            <h3 class="text-base md:text-lg font-black">استوديو طباعة البوليصة الحرارية (Deli 750W)</h3>
                            <p id="wbs-subtitle" class="text-[11px] text-slate-300 font-bold">جاهز للطباعة الفورية بأعلى دقة حرارية</p>
                        </div>
                    </div>
                    <button onclick="closeModal('waybill-studio-modal')" class="w-8 h-8 bg-slate-800 text-slate-300 rounded-full hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Quick Controls Bar -->
                <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl">
                            <span class="text-[11px] font-black text-slate-600">📏 المقاس:</span>
                            <select id="wbs-paper-size" onchange="updateStudioPreview()" class="text-xs font-black text-brand-primary bg-transparent outline-none cursor-pointer">
                                <option value="100x100">10×10 سم (100x100mm)</option>
                                <option value="100x150">10×15 سم (100x150mm)</option>
                                <option value="80xAuto">رول 8 سم (80mm)</option>
                            </select>
                        </div>

                        <div class="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl">
                            <span class="text-[11px] font-black text-slate-600">📦 عدد الأكياس للطلب:</span>
                            <select id="wbs-bags-count" onchange="updateStudioPreview()" class="text-xs font-black text-indigo-700 bg-transparent outline-none cursor-pointer">
                                <option value="1">1 كيس (استيكر واحد)</option>
                                <option value="2">2 كيس (استيكرين مرقمين)</option>
                                <option value="3">3 أكياس</option>
                                <option value="4">4 أكياس</option>
                                <option value="5">5 أكياس</option>
                            </select>
                        </div>

                        <label class="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-slate-700 cursor-pointer">
                            <input type="checkbox" id="wbs-hide-prices" onchange="updateStudioPreview()" class="w-3.5 h-3.5 accent-brand-primary rounded">
                            🎁 إخفاء الأسعار (هدية)
                        </label>
                    </div>

                    <label class="flex items-center gap-1.5 text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl cursor-pointer" title="تفعيل هذا الخيار يجعل الضغط على زر بوليصة يطبع فوراً بدون فتح هذه المعاينة">
                        <input type="checkbox" id="wbs-direct-mode" onchange="toggleDirectPrintModeSetting(this.checked)" class="w-3.5 h-3.5 accent-amber-600 rounded">
                        ⚡ طباعة فورية دائماً
                    </label>
                </div>

                <!-- Live Preview Container -->
                <div class="p-4 md:p-6 overflow-y-auto custom-scroll flex-1 bg-slate-200/70 flex flex-col items-center justify-start gap-4" id="wbs-preview-area">
                </div>

                <!-- Footer Action Buttons -->
                <div class="p-4 bg-white border-t border-slate-200 flex flex-wrap gap-2.5 shrink-0">
                    <button onclick="triggerStudioThermalPrint()" class="flex-[2] bg-brand-primary hover:bg-emerald-800 text-white font-black py-3.5 px-6 rounded-xl shadow-lg shadow-brand-primary/25 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base">
                        <i class="fa-solid fa-print text-amber-300 text-lg"></i>
                        <span>طباعة البوليصة الآن على Deli 750W</span>
                    </button>
                    <button onclick="openWaybillInNewTab()" class="bg-slate-800 hover:bg-slate-900 text-white font-black py-3.5 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs" title="فتح في صفحة مستقلة للطباعة أو الحفظ كـ PDF">
                        <i class="fa-solid fa-up-right-from-square text-amber-400"></i> فتح في تبويب / PDF
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    window.openWaybillStudioModal = function (ordersArray) {
        if (!ordersArray || ordersArray.length === 0) return;
        ensureWaybillStudioModalExists();

        const cfg = window.getWaybillConfig();
        window.waybillStudioState.orders = ordersArray;
        window.waybillStudioState.bagsPerOrder = 1;
        window.waybillStudioState.hidePrices = false;

        document.getElementById('wbs-paper-size').value = cfg.paperSize || '100x100';
        document.getElementById('wbs-bags-count').value = '1';
        document.getElementById('wbs-hide-prices').checked = false;
        document.getElementById('wbs-direct-mode').checked = cfg.directPrintMode === true;
        document.getElementById('wbs-subtitle').innerText = `عدد الطلبات المحددة للطباعة: ${ordersArray.length} طلب`;

        window.updateStudioPreview();
        if (typeof openModal === 'function') openModal('waybill-studio-modal');
        else document.getElementById('waybill-studio-modal').classList.remove('hidden');
    };

    window.updateStudioPreview = function () {
        const cfg = window.getWaybillConfig();
        const chosenSize = document.getElementById('wbs-paper-size')?.value || cfg.paperSize;
        const bagsCount = parseInt(document.getElementById('wbs-bags-count')?.value) || 1;
        const hidePrices = document.getElementById('wbs-hide-prices')?.checked || false;

        cfg.paperSize = chosenSize;
        if (document.getElementById('wb-paper-size')) {
            document.getElementById('wb-paper-size').value = chosenSize;
        }

        const previewArea = document.getElementById('wbs-preview-area');
        if (!previewArea) return;

        const docHtml = buildFullPrintDocument(window.waybillStudioState.orders, cfg, bagsCount, hidePrices);
        const previewWidth = chosenSize === '80xAuto' ? '310px' : '380px';
        const previewHeight = chosenSize === '100x150' ? '565px' : '385px';

        previewArea.innerHTML = `
            <div class="text-[11px] font-black text-slate-600 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
                معاينة حية مطابقة لمقاس الاستيكر الفعلي (${chosenSize})
            </div>
            <iframe id="wbs-live-iframe" style="width:${previewWidth}; max-width:100%; height:${previewHeight}; background:#fff; border-radius:14px; box-shadow:0 12px 30px rgba(0,0,0,0.18); border:1px solid #cbd5e1;"></iframe>
        `;

        const iframe = document.getElementById('wbs-live-iframe');
        if (iframe) {
            const d = iframe.contentWindow || iframe.contentDocument;
            const doc = d.document || d;
            doc.open();
            doc.write(docHtml);
            doc.close();
        }
    };

    window.triggerStudioThermalPrint = function () {
        const chosenSize = document.getElementById('wbs-paper-size')?.value || '100x100';
        const bagsCount = parseInt(document.getElementById('wbs-bags-count')?.value) || 1;
        const hidePrices = document.getElementById('wbs-hide-prices')?.checked || false;

        if (document.getElementById('wb-paper-size')) {
            document.getElementById('wb-paper-size').value = chosenSize;
        }
        if (typeof storeSettings !== 'undefined') {
            if (!storeSettings.waybillConfig) storeSettings.waybillConfig = {};
            storeSettings.waybillConfig.paperSize = chosenSize;
        }

        window.executeThermalPrint(window.waybillStudioState.orders, bagsCount, hidePrices);
    };

    window.openWaybillInNewTab = function () {
        const cfg = window.getWaybillConfig();
        cfg.paperSize = document.getElementById('wbs-paper-size')?.value || cfg.paperSize;
        const bagsCount = parseInt(document.getElementById('wbs-bags-count')?.value) || 1;
        const hidePrices = document.getElementById('wbs-hide-prices')?.checked || false;

        const docHtml = buildFullPrintDocument(window.waybillStudioState.orders, cfg, bagsCount, hidePrices);
        const win = window.open('', '_blank');
        if (!win) return alert('يرجى السماح بالنوافذ المنبثقة أو استخدام زر الطباعة المباشر الأخضر!');
        win.document.open();
        win.document.write(docHtml + `<script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>`);
        win.document.close();
    };

    window.toggleDirectPrintModeSetting = async function (isChecked) {
        if (typeof storeSettings !== 'undefined') {
            if (!storeSettings.waybillConfig) storeSettings.waybillConfig = {};
            storeSettings.waybillConfig.directPrintMode = isChecked;
            try {
                await db.collection('inventory').doc('settings').set({
                    waybillConfig: storeSettings.waybillConfig
                }, { merge: true });
            } catch (e) {}
        }
    };

    // =========================================================================
    // 🎯 6. الدوال الرئيسية المربوطة بأزرار النظام (مفرد + جماعي + عينة الإعدادات)
    // =========================================================================

    // أ. طباعة بوليصة طلب واحد من كارت الطلب
    window.printSingleOrderWaybill = function (orderId, forceDirect = false) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return alert('لم يتم العثور على بيانات هذا الطلب!');

        const cfg = window.getWaybillConfig();
        if (forceDirect || cfg.directPrintMode) {
            window.executeThermalPrint([order], 1, false);
        } else {
            window.openWaybillStudioModal([order]);
        }
    };

    // ب. طباعة بوالص الطلبات المحددة من شريط التحديد الجماعي
    window.printSelectedOrdersWaybills = function () {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return alert('قم بتحديد طلب واحد على الأقل لطباعة البوليصة!');

        const selectedOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => checkedIds.includes(o.id));
        if (selectedOrders.length === 0) return alert('لم يتم العثور على الطلبات المحددة!');

        window.openWaybillStudioModal(selectedOrders);
    };

    // ج. معاينة وتجربة البوليصة من شاشة إعدادات المتجر
    window.previewSampleWaybill = function () {
        const sampleOrder = (typeof allOrdersRaw !== 'undefined' && allOrdersRaw.length > 0)
            ? allOrdersRaw[0]
            : {
                id: 'SAMPLE99',
                customerName: 'د. أحمد ماضي (بوليصة تجريبية)',
                customerPhone: '01012345678',
                customerPhone2: '01208027294',
                zone: 'ههيا',
                customerAddress: 'شارع الجمهورية - بجوار مجمع الأصدقاء الطبي',
                orderDate: new Date().toLocaleDateString('en-US'),
                paymentMethod: 'cash',
                subtotal: 340,
                deliveryFee: 20,
                discount: 10,
                total: 350,
                driverName: 'كابتن محمد',
                driverNote: 'الاتصال قبل الوصول بـ 10 دقائق',
                items: [
                    { id: 'jumbo', name: 'طبق سمان جامبو', quantity: 2, price: 110 },
                    { id: 'special', name: 'طبق سمان سبشيال', quantity: 1, price: 120 }
                ]
            };

        window.openWaybillStudioModal([sampleOrder]);
    };

    // =========================================================================
    // 🔗 7. ربط تلقائي لحفظ واسترجاع إعدادات البوليصة مع saveAllSettings
    // =========================================================================
    function hookWaybillIntoSettings() {
        if (typeof window.saveAllSettings === 'function' && !window.saveAllSettings._wbHooked) {
            const _origSaveSettings = window.saveAllSettings;
            const wrappedSave = async function () {
                if (typeof storeSettings !== 'undefined') {
                    storeSettings.waybillConfig = window.getWaybillConfig();
                }
                return await _origSaveSettings.apply(this, arguments);
            };
            wrappedSave._wbHooked = true;
            window.saveAllSettings = wrappedSave;
        }

        // مراقبة تغير الحقول في شاشة الإعدادات لحفظها اللحظي في الذاكرة
        ['wb-slogan', 'wb-footer-msg', 'wb-logo-url', 'wb-paper-size', 'wb-show-barcode', 'wb-show-breakdown', 'wb-show-driver-note'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.hasAttribute('data-wb-bound')) {
                el.setAttribute('data-wb-bound', '1');
                el.addEventListener('change', () => {
                    if (typeof storeSettings !== 'undefined') {
                        storeSettings.waybillConfig = window.getWaybillConfig();
                        db.collection('inventory').doc('settings').set({
                            waybillConfig: storeSettings.waybillConfig
                        }, { merge: true }).catch(() => {});
                    }
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.syncWaybillSettingsUI();
                hookWaybillIntoSettings();
            }, 600);
        });
    } else {
        setTimeout(() => {
            window.syncWaybillSettingsUI();
            hookWaybillIntoSettings();
        }, 600);
    }
})();

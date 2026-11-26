// =========================================================================
// 🖨️ استوديو الطباعة الحرارية الملكي (Deli E750W — Unified Native APK Engine)
// الملف: waybill.js | مشروع: سمان ههيا (CRM)
// الجسر الأصلي المحفوظ 100%: window.SmanNativePrinter (Bluetooth SPP + USB OTG + System Print)
// الدقة: 203 DPI (8 dots/mm) | لغة الهاردوير: TSPL BITMAP | أقصى عرض: 108mm
// =========================================================================

(function () {
    const DOTS_PER_MM = 8; // 203 DPI = 8 dots per mm

    // =========================================================================
    // 1. الإعدادات الافتراضية وحالة الاستوديو
    // =========================================================================
    const defaultDeliConfig = {
        sizePreset: '70x130',
        widthMm: 70,
        heightMm: 130,
        sensorType: 'gap',       // 'gap' | 'continuous' | 'bmark'
        gapMm: 2,
        density: 13,             // 1..15
        speed: 3,                // 2..6
        direction: 0,            // 0 | 1
        offsetXMm: 0,
        offsetYMm: 0,
        paddingPct: 100,
        fontScalePct: 100,
        borderStyle: 'double',   // 'double' | 'solid' | 'rounded' | 'corners' | 'dashed' | 'none'
        selectedMac: 'AUTO',
        invertBitmap: false,
        instantPrint: false,
        copies: 1,
        showLogo: true,
        showBarcode: false,
        showItemsPrice: true,
        showWeightInfo: true,
        showPromoBanner: false,
        promoText: '',
        alwaysShowBagBadge: false,
        bagCustomLabel: '',
        customStoreTitle: '',
        customStorePhone: '',
        footerText: 'بالهنا والشفا من سمان ههيا 🤍 تشرفنا بخدمتكم',
        reversePrintOrder: false,
        cleanInvoiceVersion: 3
    };

    const PAPER_PRESETS = {
        '20x20':   { w: 20,  h: 20,  label: '2×2 سم' },
        '40x30':   { w: 40,  h: 30,  label: '4×3 سم' },
        '50x30':   { w: 50,  h: 30,  label: '5×3 سم' },
        '70x50':   { w: 70,  h: 50,  label: '7×5 سم' },
        '80x60':   { w: 80,  h: 60,  label: '8×6 سم' },
        '70x130':  { w: 70,  h: 130, label: '7×13 فاتورة' },
        '100x100': { w: 100, h: 100, label: '10×10 سم' },
        '100x150': { w: 100, h: 150, label: '10×15 بوليصة' }
    };

    window.deliPrinterConnection = {
        pairedDevices: [],
        isPrinting: false,
        lastOrdersQueue: []
    };

    const studioState = {
        activeTab: 'designer', // 'designer' | 'orders' | 'poultry' | 'freezer'
        hwDrawerOpen: false,
        // Orders tab state
        selectedOrderIds: new Set(),
        orderBagsMap: {},
        ordersPreviewMode: 'waybill', // 'waybill' | 'packing' | 'manifest'
        previewOrderIdx: 0,
        previewBagNum: 1,
        // Poultry tab state
        poultryItems: [],
        poultryPreviewIdx: 0,
        // Free Designer (Word/Canva) state
        designer: {
            elements: [],
            selectedId: null,
            showGrid: true,
            copies: 1,
            dragMode: null, // 'move' | 'resize'
            dragStartX: 0,
            dragStartY: 0,
            origEl: null
        }
    };

    // =========================================================================
    // 2. دوال الجسر الأصلي للـ APK + الأدوات المساعدة (محفوظة 100% بدون تغيير)
    // =========================================================================
    function isNativeApkBridgeAvailable() {
        return Boolean(window.SmanNativePrinter && typeof window.SmanNativePrinter.isNativeBridgeReady === 'function');
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

    function escapeHtml(val) {
        return String(val ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function normalizeDigits(str) {
        return String(str ?? '')
            .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0));
    }

    function notifyPrinterToast(msg) {
        if (typeof window.showQuickAppToast === 'function') {
            window.showQuickAppToast(msg);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg);
        } else {
            let box = document.getElementById('ps-inline-toast');
            if (!box) {
                box = document.createElement('div');
                box.id = 'ps-inline-toast';
                box.className = 'fixed bottom-5 left-4 z-[300] bg-slate-900 text-amber-300 border border-amber-400/40 px-4 py-3 rounded-2xl shadow-2xl text-xs font-black max-w-xs transition-all';
                document.body.appendChild(box);
            }
            box.textContent = msg;
            box.style.opacity = '1';
            clearTimeout(box._t);
            box._t = setTimeout(() => { box.style.opacity = '0'; }, 3200);
        }
    }

    window.getWaybillConfig = function () {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('sman_waybill_cfg') || '{}'); } catch (e) {}
        const remoteCfg = (typeof storeSettings !== 'undefined' && storeSettings.waybillConfig) ? storeSettings.waybillConfig : {};
        return { ...defaultDeliConfig, ...remoteCfg, ...saved };
    };

    function persistWaybillConfig(newCfg) {
        newCfg.cleanInvoiceVersion = 3;
        try { localStorage.setItem('sman_waybill_cfg', JSON.stringify(newCfg)); } catch (e) {}
        if (typeof storeSettings !== 'undefined') storeSettings.waybillConfig = newCfg;
        if (typeof db !== 'undefined') {
            db.collection('inventory').doc('settings').set({ waybillConfig: newCfg }, { merge: true }).catch(() => {});
        }
    }

    function resolveDimensionsMm(cfg) {
        if (cfg.sizePreset && PAPER_PRESETS[cfg.sizePreset]) {
            return { w: PAPER_PRESETS[cfg.sizePreset].w, h: PAPER_PRESETS[cfg.sizePreset].h };
        }
        return {
            w: Math.min(108, Math.max(15, Number(cfg.widthMm) || 70)),
            h: Math.min(250, Math.max(15, Number(cfg.heightMm) || 130))
        };
    }

    // =========================================================================
    // 3. مولد باركود CODE128 حاد (Vector على Canvas بدون مكتبات خارجية)
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
        const clean = normalizeDigits(text || '100200').replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().slice(0, 18) || '100200';
        const codes = [104];
        let checksum = 104;
        for (let i = 0; i < clean.length; i++) {
            const c = clean.charCodeAt(i) - 32;
            const valid = (c >= 0 && c < 95) ? c : 16;
            codes.push(valid);
            checksum += valid * (i + 1);
        }
        codes.push(checksum % 103, 106);
        return codes.map(c => CODE128_PATTERNS[c]).join('');
    }

    function drawBarcodeOnCanvas(ctx, text, centerX, topY, maxWidth, barHeight, showLabel = false) {
        const bits = encodeCode128Bits(text);
        const barW = Math.max(1, Math.floor(maxWidth / bits.length));
        const totalW = bits.length * barW;
        const startX = Math.round(centerX - (totalW / 2));
        const labelH = showLabel ? Math.max(14, Math.round(barHeight * 0.28)) : 0;
        const actualBarH = Math.max(10, barHeight - labelH);

        ctx.fillStyle = '#000000';
        for (let i = 0; i < bits.length; i++) {
            if (bits[i] === '1') {
                ctx.fillRect(startX + i * barW, Math.round(topY), barW, actualBarH);
            }
        }
        if (showLabel) {
            ctx.save();
            ctx.direction = 'ltr';
            ctx.font = `900 ${Math.max(11, labelH - 2)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(String(text || '').slice(0, 20), Math.round(centerX), Math.round(topY + actualBarH + 2));
            ctx.restore();
        }
    }

    // دوال رسم هندسية حادة للطباعة الحرارية
    function drawSharpHLine(ctx, x, y, w, thickness = 2) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.max(1, Math.round(thickness)));
    }
    function drawSharpVLine(ctx, x, y, h, thickness = 2) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(thickness)), Math.round(h));
    }
    function drawSharpRectBorder(ctx, x, y, w, h, thickness = 3) {
        const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
        const t = Math.max(1, Math.round(thickness));
        ctx.fillStyle = '#000000';
        ctx.fillRect(rx, ry, rw, t);
        ctx.fillRect(rx, ry + rh - t, rw, t);
        ctx.fillRect(rx, ry, t, rh);
        ctx.fillRect(rx + rw - t, ry, t, rh);
    }

    function drawFrameBorder(ctx, x, y, w, h, styleName, lineW = 4) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        if (styleName === 'none') { ctx.restore(); return; }
        if (styleName === 'double') {
            drawSharpRectBorder(ctx, x, y, w, h, Math.max(3, lineW));
            drawSharpRectBorder(ctx, x + 7, y + 7, w - 14, h - 14, 2);
        } else if (styleName === 'rounded') {
            const r = Math.min(20, Math.floor(Math.min(w, h) * 0.12));
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
            ctx.stroke();
        } else if (styleName === 'dashed') {
            ctx.lineWidth = Math.max(2, lineW - 1);
            ctx.setLineDash([12, 7]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        } else if (styleName === 'corners') {
            const len = Math.min(w, h) * 0.14;
            ctx.lineWidth = Math.max(5, lineW + 2);
            ctx.beginPath();
            ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
            ctx.moveTo(x + len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + len);
            ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
            ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
            ctx.stroke();
            drawSharpRectBorder(ctx, x + 4, y + 4, w - 8, h - 8, 1.5);
        } else {
            drawSharpRectBorder(ctx, x, y, w, h, lineW);
        }
        ctx.restore();
    }

    function wrapThermalText(ctx, text, maxWidth) {
        const rawLines = String(text || '').split('\n');
        const finalLines = [];
        rawLines.forEach(rawLine => {
            const trimmed = rawLine.trim();
            if (!trimmed) { finalLines.push(''); return; }
            const words = trimmed.split(/\s+/);
            let cur = '';
            words.forEach(word => {
                const test = cur ? (cur + ' ' + word) : word;
                if (ctx.measureText(test).width > maxWidth && cur) {
                    finalLines.push(cur);
                    cur = word;
                } else {
                    cur = test;
                }
            });
            if (cur) finalLines.push(cur);
        });
        return finalLines.length > 0 ? finalLines : [''];
    }

    function drawQuailLogoVector(ctx, x, y, w, h, inverted = false) {
        ctx.save();
        const cx = x + w / 2, cy = y + h / 2;
        const size = Math.min(w, h);
        const s = size / 64;
        ctx.fillStyle = inverted ? '#000000' : '#FFFFFF';
        ctx.fillRect(x, y, w, h);
        drawSharpRectBorder(ctx, x, y, w, h, Math.max(2, Math.round(size * 0.04)));
        ctx.translate(cx - (32 * s), cy - (32 * s));
        ctx.scale(s, s);
        ctx.fillStyle = inverted ? '#FFFFFF' : '#000000';
        const p1 = new Path2D("M52 18c-3.5 0-6.4 2.2-7.5 5.3-4.8-.9-9.8.6-13.3 4.1l-2.8 2.8c-2.6-1.5-5.7-2.2-8.9-1.8-6.1.8-11 5.7-11.8 11.8-.2 1.8.8 3.5 2.5 4.1 1.1.4 2.3.6 3.5.6h21.8c8.8 0 16-7.2 16-16v-2.1l4.9-2.5c1.2-.6 1.6-2.2.8-3.3-1.2-1.8-3.1-3-5.2-3zm-2 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z");
        const p2 = new Path2D("M22 47l-3 7h-4l2-7h5zm12 0l-2 7h-4l1-7h5z");
        ctx.fill(p1);
        ctx.fill(p2);
        ctx.restore();
    }

    // =========================================================================
    // 4. محرك تحويل الـ Canvas إلى لغة TSPL BITMAP (203 DPI) لـ Deli E750W
    // =========================================================================
    window.generateDeliTSPLHeader = function (cfg) {
        const dims = resolveDimensionsMm(cfg);
        const density = Math.min(15, Math.max(1, parseInt(cfg.density) || 13));
        const speed = Math.min(6, Math.max(2, parseInt(cfg.speed) || 3));
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

        const density = Math.min(15, Math.max(1, parseInt(cfg.density) || 13));
        const threshold = density >= 13 ? 195 : (density >= 10 ? 175 : 155);

        for (let y = 0; y < heightDots; y++) {
            for (let x = 0; x < widthDots; x++) {
                const idx = (y * widthDots + x) * 4;
                const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                if (lum < threshold) {
                    const byteIdx = y * widthBytes + Math.floor(x / 8);
                    const bitPos = 7 - (x % 8);
                    if (invert) bitmapBytes[byteIdx] |= (1 << bitPos);
                    else bitmapBytes[byteIdx] &= ~(1 << bitPos);
                }
            }
        }

        const encoder = new TextEncoder();
        const headerBytes = encoder.encode(
            window.generateDeliTSPLHeader(cfg) +
            `BITMAP 0,0,${widthBytes},${heightDots},0,`
        );
        const footerBytes = encoder.encode('\r\nPRINT 1,1\r\n');

        const packet = new Uint8Array(headerBytes.length + bitmapBytes.length + footerBytes.length);
        packet.set(headerBytes, 0);
        packet.set(bitmapBytes, headerBytes.length);
        packet.set(footerBytes, headerBytes.length + bitmapBytes.length);
        return packet;
    }

    function combineCanvasesToBase64TSPL(canvases, cfg) {
        let totalLen = 0;
        const pkts = canvases.map(cnv => {
            const p = convertCanvasToTSPLPacket(cnv, cfg);
            totalLen += p.length;
            return p;
        });
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        pkts.forEach(p => { combined.set(p, offset); offset += p.length; });
        return uint8ArrayToBase64(combined);
    }

    // =========================================================================
    // 5. مضخة البلوتوث والـ USB والـ Spooler الموحدة (تخدم كل التبويبات الـ 4)
    // =========================================================================
    window.scanAndLoadNativePairedPrinters = function (showFeedback = false) {
        const badge = document.getElementById('ps-bt-badge');
        const sel = document.getElementById('ps-bt-select');
        const sbBadge = document.getElementById('lc-sb-printer');

        if (!isNativeApkBridgeAvailable()) {
            if (badge) {
                badge.className = 'inline-flex items-center gap-1.5 bg-sky-500/20 text-sky-200 border border-sky-400/40 px-2.5 py-1 rounded-xl text-[10px] font-black';
                badge.innerHTML = '<i class="fa-solid fa-desktop"></i> وضع المتصفح / Spooler';
            }
            if (showFeedback) notifyPrinterToast('💻 أنت على المتصفح — يمكنك الطباعة عبر Spooler أو حفظ صورة PNG');
            return [];
        }

        try {
            const rawRes = window.SmanNativePrinter.getPairedDevicesJson();
            if (rawRes === 'PERMISSION_REQUIRED') {
                if (showFeedback) notifyPrinterToast('🔓 اضغط "سماح / Allow" لإذن البلوتوث ثم اضغط تحديث');
                return [];
            }
            if (rawRes === 'BLUETOOTH_OFF') {
                if (showFeedback) notifyPrinterToast('🔵 شغّل البلوتوث في هاتفك ثم اضغط تحديث');
                return [];
            }
            if (rawRes === 'NO_BLUETOOTH' || String(rawRes).startsWith('ERROR:')) {
                if (showFeedback) notifyPrinterToast('⚠️ تنبيه البلوتوث: ' + rawRes);
                return [];
            }

            const list = JSON.parse(rawRes || '[]');
            window.deliPrinterConnection.pairedDevices = Array.isArray(list) ? list : [];
            const cfg = window.getWaybillConfig();

            let autoMac = null;
            let html = '<option value="AUTO">🤖 اختيار تلقائي ذكي (Deli E750W)</option>';
            window.deliPrinterConnection.pairedDevices.forEach(d => {
                const nm = (d.name || 'طابعة بلوتوث').trim();
                const addr = (d.address || '').trim();
                const low = nm.toLowerCase();
                if (!autoMac && (low.includes('deli') || low.includes('750') || low.includes('printer') || low.includes('label'))) {
                    autoMac = addr;
                }
                const isSel = (cfg.selectedMac === addr) || (cfg.selectedMac === 'AUTO' && autoMac === addr);
                html += `<option value="${escapeHtml(addr)}" ${isSel ? 'selected' : ''}>🖨️ ${escapeHtml(nm)} (${escapeHtml(addr)})</option>`;
            });

            if (sel) {
                sel.innerHTML = html;
                if (autoMac && (!cfg.selectedMac || cfg.selectedMac === 'AUTO')) sel.value = autoMac;
            }
            if (badge) {
                badge.className = 'inline-flex items-center gap-1.5 bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-xl text-[10px] font-black shadow-sm';
                badge.innerHTML = `<i class="fa-brands fa-bluetooth-b"></i> بلوتوث الـ APK متصل (${window.deliPrinterConnection.pairedDevices.length})`;
            }
            if (sbBadge) sbBadge.classList.remove('hidden');

            if (showFeedback) {
                notifyPrinterToast(
                    window.deliPrinterConnection.pairedDevices.length
                        ? `✅ تم العثور على (${window.deliPrinterConnection.pairedDevices.length}) طابعة مقترنة جاهزة!`
                        : '📲 اقترن بطابعة Deli E750W من إعدادات بلوتوث الهاتف أولاً ثم اضغط تحديث.'
                );
            }
            return window.deliPrinterConnection.pairedDevices;
        } catch (e) {
            console.error('Native BT scan error:', e);
            return [];
        }
    };

    window.sendDeliHardwareCommand = function (cmdType) {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const tsplCmd = cmdType === 'calibrate'
            ? `SIZE ${dims.w} mm,${dims.h} mm\r\nGAP ${cfg.gapMm || 2} mm,0 mm\r\nHOME\r\nSOUND 2,100\r\n`
            : `SIZE ${dims.w} mm,${dims.h} mm\r\nFORMFEED\r\n`;

        if (!isNativeApkBridgeAvailable()) {
            return notifyPrinterToast('⚡ أوامر المعايرة وسحب الورق تعمل من داخل تطبيق الـ APK');
        }
        const b64 = uint8ArrayToBase64(new TextEncoder().encode(tsplCmd));
        const mac = document.getElementById('ps-bt-select')?.value || cfg.selectedMac || 'AUTO';
        const res = window.SmanNativePrinter.printRawBase64Bluetooth(mac, b64);
        if (String(res).startsWith('OK:')) {
            notifyPrinterToast(cmdType === 'calibrate' ? '🎯 تمت معايرة حساس الفواصل على Deli E750W' : '⏬ تم سحب ورقة استيكر بنجاح');
        } else {
            notifyPrinterToast('⚠️ ' + res);
            window.scanAndLoadNativePairedPrinters(false);
        }
    };

    // المضخة الموحدة لإرسال أي مصفوفة Canvases عبر بلوتوث الـ APK بأمان بدون تقطيع
    async function sendCanvasesViaBluetooth(canvases, cfg) {
        if (!canvases || canvases.length === 0) return notifyPrinterToast('⚠️ لا توجد ملصقات جاهزة للطباعة!');
        if (window.deliPrinterConnection.isPrinting) return;

        if (!isNativeApkBridgeAvailable()) {
            return sendCanvasesViaSpooler(canvases, cfg);
        }

        const btn = document.getElementById('ps-btn-print-bt');
        const origHtml = btn ? btn.innerHTML : '';
        window.deliPrinterConnection.isPrinting = true;
        const targetMac = document.getElementById('ps-bt-select')?.value || cfg.selectedMac || 'AUTO';

        try {
            const BATCH_STEP = 2; // إرسال 2 ملصق في كل دفعة لمنع امتلاء ذاكرة البلوتوث
            let printedOk = 0;

            for (let i = 0; i < canvases.length; i += BATCH_STEP) {
                const endIdx = Math.min(canvases.length, i + BATCH_STEP);
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الطباعة بالبلوتوث (${endIdx} من ${canvases.length})...`;
                }
                await new Promise(r => setTimeout(r, 70));

                const slice = canvases.slice(i, endIdx);
                const b64 = combineCanvasesToBase64TSPL(slice, cfg);
                const res = window.SmanNativePrinter.printRawBase64Bluetooth(targetMac, b64);

                if (String(res).startsWith('OK:')) {
                    printedOk += slice.length;
                } else if (res === 'PERMISSION_REQUIRED') {
                    alert('🔓 وافق على إذن البلوتوث الظاهر على الشاشة ثم اضغط طباعة مرة أخرى.');
                    break;
                } else if (res === 'BLUETOOTH_OFF') {
                    window.SmanNativePrinter.getPairedDevicesJson();
                    alert('🔵 البلوتوث مغلق! شغّله ثم اضغط طباعة.');
                    break;
                } else if (res === 'NO_PAIRED_PRINTER') {
                    alert('⚠️ لم يتم العثور على طابعة مقترنة في بلوتوث الهاتف! اقترن بـ Deli E750W أولاً.');
                    break;
                } else {
                    alert(`⚠️ توقفت الطباعة عند الملصق #${i + 1}: (${res})`);
                    break;
                }

                if (endIdx < canvases.length) {
                    await new Promise(r => setTimeout(r, 220));
                }
            }

            if (printedOk > 0) {
                notifyPrinterToast(`✅ تمت طباعة (${printedOk}) ملصق بالبلوتوث بنجاح!`);
            }
        } catch (err) {
            console.error(err);
            alert('خطأ أثناء الإرسال بالبلوتوث: ' + err.message);
        } finally {
            window.deliPrinterConnection.isPrinting = false;
            if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
        }
    }

    async function sendCanvasesViaUSB(canvases, cfg) {
        if (!canvases || canvases.length === 0) return notifyPrinterToast('⚠️ لا توجد ملصقات جاهزة للطباعة!');
        if (!isNativeApkBridgeAvailable() || typeof window.SmanNativePrinter.printRawBase64Usb !== 'function') {
            return sendCanvasesViaSpooler(canvases, cfg);
        }
        try {
            const b64 = combineCanvasesToBase64TSPL(canvases, cfg);
            const res = window.SmanNativePrinter.printRawBase64Usb(b64);
            if (String(res).startsWith('OK:')) {
                notifyPrinterToast(`🔌 تمت طباعة (${canvases.length}) ملصق عبر كابل الـ USB بنجاح!`);
            } else if (res === 'USB_PERMISSION_REQUESTED') {
                notifyPrinterToast('🔓 اضغط "موافق" على إذن الـ USB ثم أعد الضغط على زر USB');
            } else if (res === 'NO_USB_DEVICE') {
                alert('🔌 لم يتم اكتشاف طابعة متصلة بكابل الـ USB / OTG.');
            } else {
                alert('تنبيه USB: ' + res);
            }
        } catch (e) {
            alert('خطأ USB: ' + e.message);
        }
    }

    function sendCanvasesViaSpooler(canvases, cfg) {
        if (!canvases || canvases.length === 0) return notifyPrinterToast('⚠️ لا توجد ملصقات للطباعة!');
        const dims = resolveDimensionsMm(cfg);
        document.getElementById('deli-direct-print-mount')?.remove();
        document.getElementById('deli-direct-print-style')?.remove();

        const mount = document.createElement('div');
        mount.id = 'deli-direct-print-mount';
        const style = document.createElement('style');
        style.id = 'deli-direct-print-style';
        style.innerHTML = `
            #deli-direct-print-mount { display: none; }
            @media print {
                @page { size: ${dims.w}mm ${dims.h}mm; margin: 0mm !important; }
                html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; height: auto !important; }
                body > *:not(#deli-direct-print-mount) { display: none !important; }
                #deli-direct-print-mount { display: block !important; width: ${dims.w}mm !important; }
                .deli-print-page-img { width: ${dims.w}mm !important; height: ${dims.h}mm !important; display: block !important; page-break-after: always !important; break-after: page !important; }
                .deli-print-page-img:last-child { page-break-after: auto !important; break-after: auto !important; }
            }
        `;
        document.head.appendChild(style);
        canvases.forEach(cnv => {
            const img = document.createElement('img');
            img.src = cnv.toDataURL('image/png');
            img.className = 'deli-print-page-img';
            mount.appendChild(img);
        });
        document.body.appendChild(mount);

        setTimeout(() => {
            if (isNativeApkBridgeAvailable() && typeof window.SmanNativePrinter.triggerAndroidSystemPrint === 'function') {
                window.SmanNativePrinter.triggerAndroidSystemPrint('Sman_Hehya_PrintStudio');
            } else {
                window.print();
            }
        }, 200);
    }

    // =========================================================================
    // 6. محرك المصمم الحر بنظام الوورد / كانفا باللمس (Free Drag & Resize Canvas)
    // =========================================================================
    function getSavedDesignerTemplates() {
        try {
            const arr = JSON.parse(localStorage.getItem('sman_free_designer_templates_v1') || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function saveDesignerTemplatesList(list) {
        try { localStorage.setItem('sman_free_designer_templates_v1', JSON.stringify(list.slice(0, 30))); } catch (e) {}
        if (typeof db !== 'undefined') {
            db.collection('inventory').doc('settings').set({ freeDesignerTemplatesV1: list.slice(0, 30) }, { merge: true }).catch(() => {});
        }
    }

    function createStarterDesignerElements(presetKey, W, H) {
        const storeName = (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا';
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294';

        if (presetKey === '20x20') {
            return [
                { id: 'el_1', type: 'box', x: 6, y: 6, w: W - 12, h: H - 12, text: '', fontSize: 18, bold: true, align: 'center', inverted: false, border: 'solid', borderWidth: 3 },
                { id: 'el_2', type: 'badge', x: 14, y: 14, w: W - 28, h: 36, text: storeName, fontSize: 20, bold: true, align: 'center', inverted: true, border: 'none', borderWidth: 0 },
                { id: 'el_3', type: 'text', x: 14, y: 58, w: W - 28, h: 48, text: '150 ج.م', fontSize: 30, bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 },
                { id: 'el_4', type: 'text', x: 14, y: 112, w: W - 28, h: 32, text: 'طازج اليوم', fontSize: 18, bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 }
            ];
        }
        if (presetKey === '50x30') {
            return [
                { id: 'el_1', type: 'box', x: 8, y: 8, w: W - 16, h: H - 16, text: '', fontSize: 20, bold: true, align: 'center', inverted: false, border: 'double', borderWidth: 3 },
                { id: 'el_2', type: 'badge', x: 20, y: 18, w: W - 40, h: 46, text: `${storeName} • ${storePhone}`, fontSize: 22, bold: true, align: 'center', inverted: true, border: 'none', borderWidth: 0 },
                { id: 'el_3', type: 'text', x: 20, y: 74, w: W - 40, h: 64, text: 'سمان جامبو طازج يومياً\nالوزن صافي: 400 جم', fontSize: 24, bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 },
                { id: 'el_4', type: 'barcode', x: 44, y: 148, w: W - 88, h: 72, text: storePhone, fontSize: 16, bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 }
            ];
        }
        if (presetKey === 'blank') {
            return [
                { id: 'el_1', type: 'text', x: Math.round(W * 0.1), y: Math.round(H * 0.35), w: Math.round(W * 0.8), h: Math.round(H * 0.25), text: 'اضغط هنا للكتابة...\nواسحبني بإيدك لأي مكان', fontSize: Math.max(20, Math.round(Math.min(W, H) * 0.08)), bold: true, align: 'center', inverted: false, border: 'dashed', borderWidth: 2 }
            ];
        }
        // Default 70x50 / general
        return [
            { id: 'el_1', type: 'box', x: 12, y: 12, w: W - 24, h: H - 24, text: '', fontSize: 22, bold: true, align: 'center', inverted: false, border: 'double', borderWidth: 4 },
            { id: 'el_2', type: 'badge', x: 26, y: 26, w: W - 52, h: Math.max(46, Math.round(H * 0.16)), text: storeName, fontSize: Math.max(24, Math.round(W * 0.065)), bold: true, align: 'center', inverted: true, border: 'none', borderWidth: 0 },
            { id: 'el_3', type: 'text', x: 28, y: Math.round(H * 0.28), w: W - 56, h: Math.round(H * 0.38), text: 'أصل الطعم يبدأ من التربية\nيُحفظ مجمداً في الفريزر فور الاستلام', fontSize: Math.max(20, Math.round(W * 0.05)), bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 },
            { id: 'el_4', type: 'line', x: 30, y: Math.round(H * 0.72), w: W - 60, h: 12, text: '', fontSize: 18, bold: true, align: 'center', inverted: false, border: 'solid', borderWidth: 3 },
            { id: 'el_5', type: 'text', x: 26, y: Math.round(H * 0.76), w: W - 52, h: Math.round(H * 0.16), text: `واتساب: ${storePhone} — بالهنا والشفا 🤍`, fontSize: Math.max(16, Math.round(W * 0.038)), bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 0 }
        ];
    }

    function ensureDesignerInitialized() {
        if (studioState.designer.elements.length > 0) return;
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        studioState.designer.elements = createStarterDesignerElements(cfg.sizePreset, dims.w * DOTS_PER_MM, dims.h * DOTS_PER_MM);
        studioState.designer.selectedId = studioState.designer.elements[1]?.id || studioState.designer.elements[0]?.id || null;
    }

    function renderFreeDesignerToCanvas203DPI(cfg, showEditorOverlay = false) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        // شبكة خفيفة للمساعدة في المحاذاة أثناء التصميم فقط (لا تطبع أبداً!)
        if (showEditorOverlay && studioState.designer.showGrid) {
            ctx.save();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            const step = 40; // 5mm
            for (let gx = step; gx < W; gx += step) {
                ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
            }
            for (let gy = step; gy < H; gy += step) {
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
            }
            // خط المنتصف الأفقي والرأسي
            ctx.strokeStyle = '#cbd5e1';
            ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
            ctx.restore();
        }

        const offsetX = showEditorOverlay ? 0 : Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = showEditorOverlay ? 0 : Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.direction = 'rtl';

        studioState.designer.elements.forEach(el => {
            const x = Math.round(el.x), y = Math.round(el.y);
            const w = Math.max(16, Math.round(el.w)), h = Math.max(10, Math.round(el.h));

            ctx.save();
            if (el.type === 'line') {
                ctx.strokeStyle = '#000000';
                ctx.fillStyle = '#000000';
                const lw = Math.max(2, Number(el.borderWidth) || 3);
                if (el.border === 'dashed') {
                    ctx.lineWidth = lw;
                    ctx.setLineDash([12, 8]);
                    ctx.beginPath();
                    ctx.moveTo(x, y + Math.round(h / 2));
                    ctx.lineTo(x + w, y + Math.round(h / 2));
                    ctx.stroke();
                } else {
                    ctx.fillRect(x, y + Math.round((h - lw) / 2), w, lw);
                }
            } else if (el.type === 'barcode') {
                if (el.border && el.border !== 'none') drawFrameBorder(ctx, x, y, w, h, el.border, el.borderWidth || 2);
                drawBarcodeOnCanvas(ctx, el.text || '01208027294', x + w / 2, y + 4, Math.max(40, w - 12), Math.max(20, h - 8), true);
            } else if (el.type === 'logo') {
                drawQuailLogoVector(ctx, x, y, w, h, Boolean(el.inverted));
            } else {
                // text | box | badge
                if (el.inverted) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(x, y, w, h);
                } else if (el.border && el.border !== 'none') {
                    drawFrameBorder(ctx, x, y, w, h, el.border, el.borderWidth || 3);
                }

                if (el.text && String(el.text).trim() !== '') {
                    const fs = Math.max(10, Number(el.fontSize) || 24);
                    ctx.fillStyle = el.inverted ? '#FFFFFF' : '#000000';
                    ctx.font = `${el.bold !== false ? '900' : '700'} ${fs}px Cairo, Tahoma, sans-serif`;
                    ctx.textBaseline = 'middle';
                    const padX = Math.max(6, Math.round(w * 0.04));
                    const lines = wrapThermalText(ctx, el.text, Math.max(20, w - padX * 2));
                    const lineHeight = Math.round(fs * 1.28);
                    const totalTextH = lines.length * lineHeight;
                    let startY = y + Math.round((h - totalTextH) / 2) + Math.round(lineHeight / 2);

                    let drawX = x + Math.round(w / 2);
                    ctx.textAlign = 'center';
                    if (el.align === 'right') { ctx.textAlign = 'right'; drawX = x + w - padX; }
                    else if (el.align === 'left') { ctx.textAlign = 'left'; drawX = x + padX; }

                    lines.forEach(ln => {
                        ctx.fillText(ln, drawX, startY);
                        startY += lineHeight;
                    });
                }
            }
            ctx.restore();

            // إطار التحديد ومقبض التكبير والتصغير باللمس (أثناء التحرير فقط)
            if (showEditorOverlay && el.id === studioState.designer.selectedId) {
                ctx.save();
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = Math.max(2, Math.round(W * 0.005));
                ctx.setLineDash([8, 5]);
                ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
                ctx.setLineDash([]);

                // مقبض التكبير والتصغير في الزاوية السفلى اليمنى/اليسرى (نقطة دائرية واضحة للإصبع)
                const handleR = Math.max(9, Math.round(Math.min(W, H) * 0.035));
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(x + w, y + h, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // سهم صغير داخل مقبض التكبير
                ctx.fillStyle = '#ffffff';
                ctx.font = `900 ${Math.max(10, Math.round(handleR * 1.1))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⤡', x + w, y + h + 1);
                ctx.restore();
            }
        });

        ctx.restore();
        return canvas;
    }

    function bindInteractiveCanvasPointerEvents(cnv) {
        cnv.style.touchAction = 'none';
        cnv.style.cursor = 'move';

        const getCanvasPos = (ev) => {
            const rect = cnv.getBoundingClientRect();
            const sx = cnv.width / rect.width;
            const sy = cnv.height / rect.height;
            return {
                x: (ev.clientX - rect.left) * sx,
                y: (ev.clientY - rect.top) * sy,
                sx
            };
        };

        cnv.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            cnv.setPointerCapture(ev.pointerId);
            const pt = getCanvasPos(ev);
            const els = studioState.designer.elements;

            // 1. فحص هل لمس مقبض التكبير والتصغير للعنصر المحدد حالياً
            const selEl = els.find(e => e.id === studioState.designer.selectedId);
            if (selEl) {
                const hitRadius = Math.max(24, 24 * pt.sx); // مساحة لمس مريحة للإصبع على الموبايل
                const dx = pt.x - (selEl.x + selEl.w);
                const dy = pt.y - (selEl.y + selEl.h);
                if (Math.hypot(dx, dy) <= hitRadius) {
                    studioState.designer.dragMode = 'resize';
                    studioState.designer.dragStartX = pt.x;
                    studioState.designer.dragStartY = pt.y;
                    studioState.designer.origEl = { ...selEl };
                    return;
                }
            }

            // 2. فحص هل لمس أي عنصر (نبحث من الأعلى للأسفل — آخر عنصر مرسوم أولاً)
            let hitEl = null;
            for (let i = els.length - 1; i >= 0; i--) {
                const e = els[i];
                const pad = 10;
                if (pt.x >= e.x - pad && pt.x <= e.x + e.w + pad && pt.y >= e.y - pad && pt.y <= e.y + e.h + pad) {
                    hitEl = e;
                    break;
                }
            }

            if (hitEl) {
                studioState.designer.selectedId = hitEl.id;
                studioState.designer.dragMode = 'move';
                studioState.designer.dragStartX = pt.x;
                studioState.designer.dragStartY = pt.y;
                studioState.designer.origEl = { ...hitEl };
                renderDesignerPropertiesBar();
                refreshStudioPreviewStage();
            } else {
                studioState.designer.selectedId = null;
                studioState.designer.dragMode = null;
                renderDesignerPropertiesBar();
                refreshStudioPreviewStage();
            }
        });

        cnv.addEventListener('pointermove', (ev) => {
            if (!studioState.designer.dragMode || !studioState.designer.origEl) return;
            ev.preventDefault();
            const pt = getCanvasPos(ev);
            const selEl = studioState.designer.elements.find(e => e.id === studioState.designer.selectedId);
            if (!selEl) return;

            const dx = pt.x - studioState.designer.dragStartX;
            const dy = pt.y - studioState.designer.dragStartY;
            const orig = studioState.designer.origEl;

            if (studioState.designer.dragMode === 'move') {
                let nx = Math.round(orig.x + dx);
                let ny = Math.round(orig.y + dy);
                // مغناطيس توسيط ذكي عند الاقتراب من منتصف الورقة
                const centerX = Math.round((cnv.width - selEl.w) / 2);
                if (Math.abs(nx - centerX) < 10) nx = centerX;
                selEl.x = Math.max(-selEl.w + 24, Math.min(cnv.width - 24, nx));
                selEl.y = Math.max(-selEl.h + 20, Math.min(cnv.height - 20, ny));
            } else if (studioState.designer.dragMode === 'resize') {
                selEl.w = Math.max(28, Math.min(cnv.width - selEl.x + 20, Math.round(orig.w + dx)));
                selEl.h = Math.max(14, Math.min(cnv.height - selEl.y + 20, Math.round(orig.h + dy)));
                // تكبير الخط نسبياً عند تكبير صندوق النص أو الشارة
                if ((selEl.type === 'text' || selEl.type === 'badge') && orig.h > 0) {
                    const ratio = selEl.h / orig.h;
                    selEl.fontSize = Math.max(10, Math.min(120, Math.round((orig.fontSize || 24) * Math.sqrt(ratio))));
                }
            }

            // إعادة رسم سريعة 60FPS على نفس الـ Canvas مباشرة
            const cfg = window.getWaybillConfig();
            const updated = renderFreeDesignerToCanvas203DPI(cfg, true);
            const ctx = cnv.getContext('2d');
            ctx.clearRect(0, 0, cnv.width, cnv.height);
            ctx.drawImage(updated, 0, 0);
        });

        const endDrag = () => {
            if (studioState.designer.dragMode) {
                studioState.designer.dragMode = null;
                studioState.designer.origEl = null;
                renderDesignerPropertiesBar();
            }
        };
        cnv.addEventListener('pointerup', endDrag);
        cnv.addEventListener('pointercancel', endDrag);
    }

    // =========================================================================
    // 7. محرك رسم بوالص الطلبات الشيك + ملخص التجهيز + خط سير المندوب
    // =========================================================================
    function formatCleanInvoiceItem(item, prodsObj, showWeightInfo) {
        let rawName = String(item.name || 'صنف').trim();
        let subDetail = '';
        const bracketMatch = rawName.match(/^(.*?)\s*\[(.*?)\]\s*(?:\((.*?)\))?$/);
        if (bracketMatch) {
            rawName = bracketMatch[1].trim();
            subDetail = bracketMatch[2].replace('=', '•').trim();
        } else {
            const pInfo = prodsObj[item.id] || {};
            if (showWeightInfo !== false && pInfo.weight) subDetail = pInfo.weight;
        }
        const rawQty = Number(item.quantity) || 1;
        let qtyText = Number.isInteger(rawQty) ? String(rawQty) : String(Number(rawQty.toFixed(2)));
        if (bracketMatch && item.birdsCount) qtyText = `${item.birdsCount} (${qtyText} ك)`;
        return {
            title: rawName,
            subDetail,
            qtyText,
            lineTotal: Math.round(rawQty * (Number(item.price) || 0))
        };
    }

    window.renderWaybillToCanvas203DPI = function (order, cfg, indexNum = 1, totalCount = 1, bagIndex = 1, bagsTotal = 1) {
        cfg = cfg || window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM);
        const H = Math.floor(dims.h * DOTS_PER_MM);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        const padPct = (Number(cfg.paddingPct) || 100) / 100;
        const pad = Math.max(8, Math.round(Math.min(W, H) * 0.022 * padPct));
        const borderStyle = cfg.borderStyle || 'double';
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, borderStyle, 4);

        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();
        const storeSlogan = (typeof storeSettings !== 'undefined' && storeSettings.waybillSlogan) || 'أصل الطعم يبدأ من التربية 🤍 طازج لمائدتك';
        const orderDateStr = order.orderDate || new Date().toLocaleDateString('ar-EG');

        const globalScale = Math.min(1.35, Math.max(0.70, (Number(cfg.fontScalePct) || 100) / 100));
        const innerMargin = borderStyle === 'double' ? 16 : 12;
        const innerLeft = pad + innerMargin;
        const innerRight = W - pad - innerMargin;
        const innerWidth = innerRight - innerLeft;

        const baseW = Math.min(W, Math.round(H * 0.95));
        const fBrand = Math.max(20, Math.round(baseW * 0.068 * globalScale));
        const fSlogan = Math.max(12, Math.round(baseW * 0.032 * globalScale));
        const fSecTitle = Math.max(15, Math.round(baseW * 0.041 * globalScale));
        const fBody = Math.max(14, Math.round(baseW * 0.038 * globalScale));
        const fSmall = Math.max(11, Math.round(baseW * 0.031 * globalScale));
        const fTotalVal = Math.max(20, Math.round(baseW * 0.062 * globalScale));

        let curY = pad + innerMargin + 4;

        // 1. الهيدر
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (cfg.showLogo !== false) {
            ctx.font = `900 ${fBrand}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storeName, Math.round(W / 2), curY);
            curY += fBrand + 5;
            ctx.font = `800 ${fSlogan}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(storeSlogan, Math.round(W / 2), curY);
            curY += fSlogan + 8;
        }

        drawSharpHLine(ctx, innerLeft, curY, innerWidth, 2);
        curY += 6;
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`للتواصل: ${storePhone}`, innerRight - 4, curY);
        ctx.textAlign = 'left';
        const showBagPill = (bagsTotal > 1) || cfg.alwaysShowBagBadge;
        const bagLabelNote = cfg.bagCustomLabel ? ` (${cfg.bagCustomLabel})` : '';
        ctx.fillText(showBagPill ? `شنطة ${bagIndex}/${bagsTotal}${bagLabelNote} • ${orderDateStr}` : `التاريخ: ${orderDateStr}`, innerLeft + 4, curY);
        curY += fSmall + 7;
        drawSharpHLine(ctx, innerLeft, curY, innerWidth, 3);

        if (cfg.showBarcode === true) {
            curY += 6;
            const shortId = (order.id || '100200').slice(-6).toUpperCase();
            drawBarcodeOnCanvas(ctx, shortId, Math.round(W / 2), curY, Math.round(innerWidth * 0.72), 34, false);
            curY += 38;
            drawSharpHLine(ctx, innerLeft, curY, innerWidth, 2);
        }
        curY += 10;

        // 2. بطاقة العميل
        const custNameClean = (order.customerName || 'عميل سمان ههيا').trim();
        const phonesLine = `${order.customerPhone || ''}${order.customerPhone2 ? ' - ' + order.customerPhone2 : ''}`;
        const zoneClean = (order.zone || '').trim();
        const addrClean = (order.customerAddress || '').trim();
        const fullLocation = [zoneClean, addrClean].filter(Boolean).join(' - ') || 'استلام حسب المنطقة';

        ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
        const addrLines = wrapThermalText(ctx, `العنوان: ${fullLocation}`, innerWidth - 22).slice(0, 2);
        const custBoxH = Math.round(16 + (fSecTitle + 7) + (fBody + 7) + (addrLines.length * (fSmall + 5)) + 8);
        drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, custBoxH, 3);

        let cy = curY + 9;
        if (zoneClean) {
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            const zW = Math.min(Math.round(innerWidth * 0.36), Math.max(85, Math.round(ctx.measureText(zoneClean).width + 22)));
            const zH = fSecTitle + 8;
            drawSharpRectBorder(ctx, innerLeft + 9, cy - 2, zW, zH, 2);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(zoneClean, innerLeft + 9 + Math.round(zW / 2), cy - 2 + Math.round(zH / 2));
        }

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.font = `900 ${fSecTitle}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`عميلنا: ${custNameClean.slice(0, 24)}`, innerRight - 10, cy);
        cy += fSecTitle + 7;
        ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`موبايل: ${phonesLine}`, innerRight - 10, cy);
        cy += fBody + 5;
        drawSharpHLine(ctx, innerLeft + 10, cy, innerWidth - 20, 1);
        cy += 5;
        ctx.font = `800 ${fSmall}px Cairo, Tahoma, sans-serif`;
        addrLines.forEach(line => { ctx.fillText(line, innerRight - 10, cy); cy += fSmall + 4; });
        curY += custBoxH + 10;

        // 3. جدول الأصناف
        const itemsList = Array.isArray(order.items) ? order.items : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const thH = Math.max(28, fBody + 12);
        drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, thH, 3);

        const showPrices = cfg.showItemsPrice !== false;
        const priceColW = showPrices ? Math.round(innerWidth * 0.24) : 0;
        const qtyColW = Math.round(innerWidth * 0.22);
        const itemColRight = innerRight - 9;
        const qtyColCenter = innerLeft + priceColW + Math.round(qtyColW / 2);
        const priceColCenter = innerLeft + Math.round(priceColW / 2);

        ctx.fillStyle = '#000000'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = 'right'; ctx.fillText('الصنف', itemColRight, curY + Math.round(thH / 2));
        ctx.textAlign = 'center'; ctx.fillText('الكمية', qtyColCenter, curY + Math.round(thH / 2));
        if (showPrices) ctx.fillText('الإجمالي', priceColCenter, curY + Math.round(thH / 2));

        drawSharpVLine(ctx, innerLeft + priceColW + qtyColW, curY, thH, 2);
        if (showPrices) drawSharpVLine(ctx, innerLeft + priceColW, curY, thH, 2);
        curY += thH;

        const maxRows = Math.max(1, Math.min(itemsList.length || 1, 7));
        for (let idx = 0; idx < maxRows; idx++) {
            const rawItem = itemsList[idx];
            if (!rawItem) break;
            const formatted = formatCleanInvoiceItem(rawItem, prodsObj, cfg.showWeightInfo);
            const nameColMaxW = innerWidth - priceColW - qtyColW - 18;
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            const titleLines = wrapThermalText(ctx, formatted.title, nameColMaxW).slice(0, 2);
            const hasSub = Boolean(formatted.subDetail);
            const rowH = Math.max(34, Math.round((titleLines.length * (fBody + 4)) + (hasSub ? (fSmall + 4) : 0) + 12));

            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, rowH, 2);
            drawSharpVLine(ctx, innerLeft + priceColW + qtyColW, curY, rowH, 2);
            if (showPrices) drawSharpVLine(ctx, innerLeft + priceColW, curY, rowH, 2);

            ctx.fillStyle = '#000000'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            let textY = curY + 6;
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            titleLines.forEach(ln => { ctx.fillText(ln, itemColRight, textY); textY += fBody + 3; });
            if (hasSub) {
                ctx.font = `800 ${Math.max(10, fSmall - 1)}px Cairo, Tahoma, sans-serif`;
                ctx.fillText(formatted.subDetail, itemColRight, textY);
            }
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `900 ${fBody}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(formatted.qtyText, qtyColCenter, curY + Math.round(rowH / 2));
            if (showPrices) ctx.fillText(`${formatted.lineTotal} ج`, priceColCenter, curY + Math.round(rowH / 2));
            curY += rowH;
        }
        curY += 10;

        // 4. الصندوق المالي (كاش / أونلاين / نص ونص)
        const br = (typeof window.getOrderPaymentBreakdown === 'function')
            ? window.getOrderPaymentBreakdown(order)
            : {
                method: order.paymentMethod || 'cash',
                cash: order.paymentMethod === 'online' ? 0 : (order.paymentMethod === 'split' ? (Number(order.paidCash) || 0) : (Number(order.total) || 0)),
                online: order.paymentMethod === 'online' ? (Number(order.total) || 0) : (order.paymentMethod === 'split' ? (Number(order.paidOnline) || 0) : 0),
                total: Number(order.total) || 0
            };

        const isOnline = br.method === 'online';
        const isSplit = br.method === 'split';
        const subtotal = Number(order.subtotal) || Number(order.total) || 0;
        const delivery = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const total = Number(order.total) || 0;
        const debt = Number(order.debt) || 0;

        const breakdownH = fSmall + 14;
        drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, breakdownH, 2);
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        const parts = [`المنتجات: ${subtotal} ج`, delivery > 0 ? `التوصيل: ${delivery} ج` : 'التوصيل: مجاني'];
        if (discount > 0) parts.push(`خصم: -${discount} ج`);
        if (isSplit && br.online > 0) parts.push(`مدفوع محفظة: ${br.online} ج`);
        if (debt > 0) parts.push(`باقي حساب: ${debt} ج`);
        ctx.fillText(parts.join('  •  '), Math.round(W / 2), curY + Math.round(breakdownH / 2));
        curY += breakdownH + 6;

        const totalBoxH = Math.max(48, fTotalVal + 20);
        drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, totalBoxH, 4);
        drawSharpRectBorder(ctx, innerLeft + 5, curY + 5, innerWidth - 10, totalBoxH - 10, 1);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right'; ctx.font = `900 ${fSecTitle}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'حالة الفاتورة:' : (isSplit ? 'المتبقي كاش:' : 'الإجمالي المطلوب:'), innerRight - 14, curY + Math.round(totalBoxH / 2));
        ctx.textAlign = 'left'; ctx.font = `900 ${fTotalVal}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(isOnline ? 'خالص أونلاين' : `${isSplit ? br.cash : total} ج.م`, innerLeft + 14, curY + Math.round(totalBoxH / 2));
        curY += totalBoxH + 8;

        // 5. الدعاية والفوتر
        if (cfg.showPromoBanner && cfg.promoText && cfg.promoText.trim()) {
            const pH = fSmall + 12;
            drawSharpRectBorder(ctx, innerLeft, curY, innerWidth, pH, 2);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(cfg.promoText.trim().slice(0, 58), Math.round(W / 2), curY + Math.round(pH / 2));
            curY += pH + 6;
        }
        const footerMsg = (cfg.footerText && cfg.footerText.trim()) || 'بالهنا والشفا من سمان ههيا 🤍 تشرفنا بخدمتكم';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = `900 ${fSmall}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(footerMsg, Math.round(W / 2), Math.max(curY + fSmall, H - pad - innerMargin - 2));

        ctx.restore();
        return canvas;
    };

    function renderPackingSummaryCanvas203DPI(ordersList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM), H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        const pad = 16;
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, 'double', 4);

        const totals = new Map();
        let totalQty = 0;
        ordersList.forEach(o => {
            (Array.isArray(o.items) ? o.items : []).forEach(i => {
                const nm = String(i.name || 'صنف').trim();
                const q = Number(i.quantity) || 1;
                totalQty += q;
                totals.set(nm, (totals.get(nm) || 0) + q);
            });
        });

        let y = pad + 20;
        const fH = Math.max(20, Math.round(W * 0.055));
        const fRow = Math.max(15, Math.round(W * 0.038));
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `900 ${fH}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('📦 ملخص تجميع وتجهيز المطبخ', W / 2, y);
        y += fH + 8;
        ctx.font = `800 ${Math.round(fRow * 0.85)}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${new Date().toLocaleDateString('ar-EG')} • إجمالي الطلبات: ${ordersList.length} طلب`, W / 2, y);
        y += fRow + 10;
        drawSharpHLine(ctx, pad + 14, y, W - (pad + 14) * 2, 3);
        y += 12;

        ctx.textAlign = 'right';
        ctx.font = `900 ${fRow}px Cairo, Tahoma, sans-serif`;
        let idx = 1;
        for (const [nm, q] of totals.entries()) {
            if (y > H - pad - 80) break;
            ctx.fillText(`${idx++}. ${nm.slice(0, 30)}`, W - pad - 20, y);
            ctx.textAlign = 'left';
            ctx.fillText(`${Number(q.toFixed(2))}`, pad + 24, y);
            ctx.textAlign = 'right';
            y += fRow + 12;
            drawSharpHLine(ctx, pad + 18, y - 5, W - (pad + 18) * 2, 1);
        }

        const boxH = 54;
        ctx.fillStyle = '#000000';
        ctx.fillRect(pad + 14, H - pad - boxH - 12, W - (pad + 14) * 2, boxH);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(18, Math.round(W * 0.045))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`إجمالي القطع / الأطباق: ${Number(totalQty.toFixed(1))} وحدة`, W / 2, H - pad - 12 - boxH / 2);
        return canvas;
    }

    function renderDriverManifestCanvas203DPI(ordersList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM), H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        const pad = 16;
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, 'double', 4);

        let totalCash = 0;
        ordersList.forEach(o => {
            if (o.paymentMethod === 'split') totalCash += (Number(o.paidCash) || 0);
            else if (o.paymentMethod !== 'online') totalCash += (Number(o.total) || 0);
        });

        let y = pad + 18;
        const fH = Math.max(20, Math.round(W * 0.055));
        const fRow = Math.max(14, Math.round(W * 0.036));
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `900 ${fH}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('🛵 كشف خط سير وتحصيل المندوب', W / 2, y);
        y += fH + 6;
        ctx.font = `800 ${Math.round(fRow * 0.85)}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${new Date().toLocaleDateString('ar-EG')} • عدد الطلبات: ${ordersList.length}`, W / 2, y);
        y += fRow + 10;
        drawSharpHLine(ctx, pad + 14, y, W - (pad + 14) * 2, 3);
        y += 10;

        ctx.font = `900 ${fRow}px Cairo, Tahoma, sans-serif`;
        ordersList.forEach((o, i) => {
            if (y > H - pad - 85) return;
            const cash = o.paymentMethod === 'online' ? 0 : (o.paymentMethod === 'split' ? (Number(o.paidCash) || 0) : (Number(o.total) || 0));
            ctx.textAlign = 'right';
            ctx.fillText(`${i + 1}. ${(o.customerName || 'عميل').slice(0, 18)} (${(o.zone || '').slice(0, 10)})`, W - pad - 18, y);
            ctx.textAlign = 'left';
            ctx.fillText(cash === 0 ? 'خالص' : `${cash} ج`, pad + 18, y);
            y += fRow + 10;
            drawSharpHLine(ctx, pad + 18, y - 4, W - (pad + 18) * 2, 1);
        });

        const boxH = 56;
        ctx.fillStyle = '#000000';
        ctx.fillRect(pad + 14, H - pad - boxH - 12, W - (pad + 14) * 2, boxH);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(18, Math.round(W * 0.044))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`إجمالي الكاش المطلوب: ${totalCash.toLocaleString()} ج.م`, W / 2, H - pad - 12 - boxH / 2);
        return canvas;
    }

    // =========================================================================
    // 8. محرك رسم تكت ميزان الفراخ + تكت ملخص البرنيكة (203 DPI)
    // =========================================================================
    window.parsePoultryWeightsList = function () {
        const rawText = normalizeDigits(document.getElementById('ps-pb-weights')?.value || '');
        const kiloPrice = Math.max(0, parseFloat(normalizeDigits(document.getElementById('ps-pb-kilo')?.value || '110')) || 0);
        const tareGrams = Math.max(0, parseFloat(normalizeDigits(document.getElementById('ps-pb-tare')?.value || '0')) || 0);
        const roundMode = document.getElementById('ps-pb-round')?.value || 'nearest_1';

        const tokens = [];
        rawText.split(/\r?\n/).forEach(line => {
            let clean = line.trim().replace(/^(?:#?\d+\s*[\-\)\.\:]\s*)/, '');
            const matches = clean.match(/\d+(?:\.\d+)?/g);
            if (matches) matches.forEach(m => tokens.push(m));
        });

        const items = [];
        tokens.forEach(tok => {
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
                grossGrams,
                netGrams,
                kiloPrice,
                price: finalPrice,
                isAnomaly: netGrams < 350 || netGrams > 4500
            });
        });

        studioState.poultryItems = items;
        if (studioState.poultryPreviewIdx >= items.length) {
            studioState.poultryPreviewIdx = Math.max(0, items.length - 1);
        }
        renderPoultryChipsAndStats();
        return items;
    };

    window.renderSinglePoultryScaleTag203DPI = function (itemObj, totalItemsCount, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM), H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

        const offsetX = Math.round((Number(cfg.offsetXMm) || 0) * DOTS_PER_MM);
        const offsetY = Math.round((Number(cfg.offsetYMm) || 0) * DOTS_PER_MM);
        ctx.save(); ctx.translate(offsetX, offsetY);

        const pad = Math.max(6, Math.round(Math.min(W, H) * 0.028));
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, cfg.borderStyle || 'double', 3);

        const innerMargin = (cfg.borderStyle || 'double') === 'double' ? 12 : 8;
        const innerL = pad + innerMargin, innerR = W - pad - innerMargin, innerW = innerR - innerL;
        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();
        const prodName = (document.getElementById('ps-pb-name')?.value || 'فراخ تسمين طازجة - ذبح اليوم').trim();
        const dateNote = (document.getElementById('ps-pb-date')?.value || `ذبح: ${new Date().toLocaleDateString('ar-EG')} • طازج 100%`).trim();
        const fScale = Math.min(1.4, Math.max(0.7, (Number(cfg.fontScalePct) || 100) / 100));

        let y = pad + innerMargin;
        const hdrH = Math.max(24, Math.round(H * 0.16));
        ctx.fillStyle = '#000000'; ctx.fillRect(innerL, y, innerW, hdrH);
        ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.48 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${storeName} (${storePhone})`, innerR - 8, y + hdrH / 2);
        ctx.textAlign = 'left';
        ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.48 * fScale))}px monospace`;
        ctx.fillText(`#${itemObj.index}/${totalItemsCount}`, innerL + 8, y + hdrH / 2);
        y += hdrH + Math.max(4, Math.round(H * 0.03));

        // اسم الصنف والتاريخ
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const fProd = Math.max(13, Math.round(H * 0.095 * fScale));
        ctx.font = `900 ${fProd}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(prodName.slice(0, 36), W / 2, y);
        y += fProd + 4;
        const fDate = Math.max(10, Math.round(H * 0.058 * fScale));
        ctx.font = `800 ${fDate}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(dateNote.slice(0, 44), W / 2, y);
        y += fDate + Math.max(6, Math.round(H * 0.04));

        // مربعات الوزن | سعر الكيلو | السعر المطلوب
        const boxH = Math.max(46, Math.round(H * 0.32));
        const gapX = Math.max(6, Math.round(innerW * 0.02));
        const colPriceW = Math.round((innerW - gapX * 2) * 0.42);
        const colRateW = Math.round((innerW - gapX * 2) * 0.25);
        const colWeightW = innerW - gapX * 2 - colPriceW - colRateW;

        // السعر (أسود معكوس)
        ctx.fillStyle = '#000000'; ctx.fillRect(innerL, y, colPriceW, boxH);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.max(9, Math.round(boxH * 0.22 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('السعر المطلوب', innerL + colPriceW / 2, y + 5);
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(14, Math.round(boxH * 0.44 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${itemObj.price} ج.م`, innerL + colPriceW / 2, y + Math.round(boxH * 0.67));

        // سعر الكيلو
        const rateX = innerL + colPriceW + gapX;
        drawSharpRectBorder(ctx, rateX, y, colRateW, boxH, 3);
        ctx.fillStyle = '#000000'; ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.max(9, Math.round(boxH * 0.21 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('سعر الكيلو', rateX + colRateW / 2, y + 5);
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(12, Math.round(boxH * 0.36 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${itemObj.kiloPrice} ج`, rateX + colRateW / 2, y + Math.round(boxH * 0.67));

        // الوزن الصافي
        const weightX = rateX + colRateW + gapX;
        drawSharpRectBorder(ctx, weightX, y, colWeightW, boxH, 3);
        ctx.fillStyle = '#000000'; ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.max(9, Math.round(boxH * 0.21 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('الوزن الصافي', weightX + colWeightW / 2, y + 5);
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(13, Math.round(boxH * 0.38 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${itemObj.netGrams} جم`, weightX + colWeightW / 2, y + Math.round(boxH * 0.67));
        y += boxH + Math.max(5, Math.round(H * 0.03));

        const remH = H - pad - innerMargin - y;
        if (cfg.showBarcode && remH >= 24) {
            const bcText = `P${itemObj.index}-${itemObj.netGrams}-${Math.round(itemObj.price)}`;
            drawBarcodeOnCanvas(ctx, bcText, W / 2, y, Math.round(innerW * 0.8), Math.min(44, remH - 14), false);
        }
        if (cfg.footerText) {
            ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.font = `900 ${Math.max(9, Math.round(H * 0.052 * fScale))}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(cfg.footerText.trim().slice(0, 50), W / 2, H - pad - Math.max(3, Math.floor(innerMargin * 0.3)));
        }

        ctx.restore();
        return canvas;
    };

    function renderPoultrySummaryCanvas203DPI(itemsList, cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM), H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        const pad = Math.max(8, Math.round(Math.min(W, H) * 0.03));
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, 'double', 3);

        const prodName = (document.getElementById('ps-pb-name')?.value || 'دفعة فراخ طازجة').trim();
        const totalGrams = itemsList.reduce((s, i) => s + i.netGrams, 0);
        const totalCash = itemsList.reduce((s, i) => s + i.price, 0);
        const avgGrams = itemsList.length ? Math.round(totalGrams / itemsList.length) : 0;

        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const fH = Math.max(14, Math.round(H * 0.11));
        ctx.font = `900 ${fH}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('📦 ملصق إجمالي الدفعة والبرنيكة', W / 2, pad + 10);
        const fSub = Math.max(12, Math.round(H * 0.08));
        ctx.font = `900 ${fSub}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${prodName} (${new Date().toLocaleDateString('ar-EG')})`, W / 2, pad + 16 + fH);

        let curY = pad + 26 + fH + fSub;
        ctx.textAlign = 'right';
        ctx.font = `900 ${Math.max(11, Math.round(H * 0.078))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`• العدد الإجمالي: ${itemsList.length} فرخة / عبوة`, W - pad - 16, curY); curY += Math.round(H * 0.11);
        ctx.fillText(`• إجمالي الوزن الصافي: ${(totalGrams / 1000).toFixed(3)} كجم`, W - pad - 16, curY); curY += Math.round(H * 0.11);
        ctx.fillText(`• متوسط القطعة: ${avgGrams} جم | الكيلو: ${itemsList[0]?.kiloPrice || 0} ج`, W - pad - 16, curY);

        const boxH = Math.max(30, Math.round(H * 0.2));
        ctx.fillStyle = '#000000'; ctx.fillRect(pad + 12, H - pad - boxH - 10, W - (pad + 12) * 2, boxH);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(14, Math.round(boxH * 0.52))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`إجمالي الدفعة: ${totalCash.toLocaleString()} ج.م`, W / 2, H - pad - 10 - boxH / 2);
        return canvas;
    }

    // =========================================================================
    // 9. محرك رسم استيكر أطباق السمان والفريزر (203 DPI)
    // =========================================================================
    function renderFreezerTagCanvas203DPI(cfg) {
        const dims = resolveDimensionsMm(cfg);
        const W = Math.floor(dims.w * DOTS_PER_MM), H = Math.floor(dims.h * DOTS_PER_MM);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.direction = 'rtl'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

        const pad = Math.max(6, Math.round(Math.min(W, H) * 0.028));
        drawFrameBorder(ctx, pad, pad, W - pad * 2, H - pad * 2, cfg.borderStyle || 'double', 3);

        const innerMargin = (cfg.borderStyle || 'double') === 'double' ? 12 : 8;
        const innerL = pad + innerMargin, innerR = W - pad - innerMargin, innerW = innerR - innerL;
        const storeName = (cfg.customStoreTitle || (typeof storeSettings !== 'undefined' && storeSettings.storeName) || 'سمان ههيا').trim();
        const storePhone = (cfg.customStorePhone || (typeof storeSettings !== 'undefined' && storeSettings.storePhone) || '01208027294').trim();

        const pName = (document.getElementById('ps-fz-name')?.value || 'طبق سمان جامبو ملكي').trim();
        const pWeight = (document.getElementById('ps-fz-weight')?.value || '350 - 400 جم صافي').trim();
        const pPrice = document.getElementById('ps-fz-price')?.value || '';
        const showPrice = document.getElementById('ps-fz-show-price')?.checked;
        const prodDateRaw = document.getElementById('ps-fz-prod-date')?.value || new Date().toISOString().slice(0, 10);
        const expMode = document.getElementById('ps-fz-expiry')?.value || '3months';
        const lotNum = (document.getElementById('ps-fz-lot')?.value || '').trim();
        const bcVal = (document.getElementById('ps-fz-barcode')?.value || '').trim();

        const dProd = new Date(prodDateRaw + 'T00:00:00');
        const dExp = new Date(dProd.getTime());
        let note = '❄️ يُحفظ مجمداً في الفريزر (-18°)';
        if (expMode === '6months') { dExp.setMonth(dExp.getMonth() + 6); note = '❄️ يُحفظ مجمداً في الفريزر'; }
        else if (expMode === '3days') { dExp.setDate(dExp.getDate() + 3); note = '🌡️ يُحفظ مبرداً بالثلاجة (طازج)'; }
        else if (expMode === '15days') { dExp.setDate(dExp.getDate() + 15); note = '🥚 يُحفظ في مكان بارد وجاف'; }
        else { dExp.setMonth(dExp.getMonth() + 3); }

        const fmtDate = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        const fScale = Math.min(1.35, Math.max(0.7, (Number(cfg.fontScalePct) || 100) / 100));

        let y = pad + innerMargin;
        const hdrH = Math.max(24, Math.round(H * 0.17));
        ctx.fillStyle = '#000000'; ctx.fillRect(innerL, y, innerW, hdrH);
        ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = `900 ${Math.max(12, Math.round(hdrH * 0.52 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(storeName, innerR - 8, y + hdrH / 2);
        ctx.textAlign = 'left';
        ctx.font = `900 ${Math.max(11, Math.round(hdrH * 0.44 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(storePhone, innerL + 8, y + hdrH / 2);
        y += hdrH + Math.max(6, Math.round(H * 0.03));

        // بطاقة المنتج
        const cardH = Math.max(46, Math.round(H * 0.30));
        drawSharpRectBorder(ctx, innerL, y, innerW, cardH, 3);
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const fTitle = Math.max(14, Math.round(cardH * 0.30 * fScale));
        ctx.font = `900 ${fTitle}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(pName.slice(0, 32), W / 2, y + 6);

        ctx.font = `900 ${Math.max(11, Math.round(cardH * 0.22 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`الوزن: ${pWeight}${lotNum ? ' • تشغيلة: ' + lotNum : ''}`, W / 2, y + 10 + fTitle);

        if (showPrice && pPrice) {
            const pillH = Math.max(20, Math.round(cardH * 0.26));
            const pillW = Math.round(innerW * 0.52);
            ctx.fillStyle = '#000000';
            ctx.fillRect(Math.round((W - pillW) / 2), y + cardH - pillH - 5, pillW, pillH);
            ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.max(11, Math.round(pillH * 0.65))}px Cairo, Tahoma, sans-serif`;
            ctx.fillText(`السعر: ${pPrice} ج.م`, W / 2, y + cardH - pillH / 2 - 5);
        }
        y += cardH + Math.max(5, Math.round(H * 0.025));

        // تاريخ الإنتاج والصلاحية
        const dateBoxH = Math.max(32, Math.round(H * 0.17));
        const halfW = Math.round((innerW - 8) / 2);
        drawSharpRectBorder(ctx, innerL, y, halfW, dateBoxH, 2);
        drawSharpRectBorder(ctx, innerL + halfW + 8, y, innerW - halfW - 8, dateBoxH, 2);
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `800 ${Math.max(9, Math.round(dateBoxH * 0.32))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText('انتهاء الصلاحية', innerL + halfW / 2, y + 4);
        ctx.fillText('تاريخ الذبح / الإنتاج', innerL + halfW + 8 + halfW / 2, y + 4);
        ctx.textBaseline = 'bottom';
        ctx.font = `900 ${Math.max(11, Math.round(dateBoxH * 0.44))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(fmtDate(dExp), innerL + halfW / 2, y + dateBoxH - 4);
        ctx.fillText(fmtDate(dProd), innerL + halfW + 8 + halfW / 2, y + dateBoxH - 4);
        y += dateBoxH + Math.max(4, Math.round(H * 0.02));

        const remH = H - pad - innerMargin - y;
        if (bcVal && remH >= 24) {
            drawBarcodeOnCanvas(ctx, bcVal, W / 2, y, Math.round(innerW * 0.78), Math.min(40, remH - 16), false);
        }
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = `900 ${Math.max(9, Math.round(H * 0.055 * fScale))}px Cairo, Tahoma, sans-serif`;
        ctx.fillText(`${note} — بالهنا والشفا 🤍`, W / 2, H - pad - Math.max(3, Math.floor(innerMargin * 0.3)));
        return canvas;
    }

    // =========================================================================
    // 10. تجميع ملصقات التبويب النشط حالياً للطباعة (بلوتوث / USB / Spooler)
    // =========================================================================
    function getActiveOrdersForPrinting() {
        const liveList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        let list = liveList.filter(o => o && studioState.selectedOrderIds.has(o.id) && o.status !== 'trash' && !o.isArchived);
        if (list.length === 0 && window.deliPrinterConnection.lastOrdersQueue.length > 0) {
            list = window.deliPrinterConnection.lastOrdersQueue;
        }
        return list;
    }

    function buildActiveTabCanvases(cfg) {
        const copies = Math.max(1, parseInt(cfg.copies) || 1);
        const canvases = [];

        if (studioState.activeTab === 'designer') {
            ensureDesignerInitialized();
            const dCopies = Math.max(1, parseInt(document.getElementById('ps-des-copies')?.value) || studioState.designer.copies || 1);
            const single = renderFreeDesignerToCanvas203DPI(cfg, false);
            for (let i = 0; i < dCopies; i++) canvases.push(single);
            return canvases;
        }

        if (studioState.activeTab === 'poultry') {
            const items = window.parsePoultryWeightsList();
            if (items.length === 0) return [];
            const ordered = cfg.reversePrintOrder ? items.slice().reverse() : items;
            const pCopies = Math.max(1, parseInt(document.getElementById('ps-pb-copies')?.value) || 1);
            ordered.forEach(it => {
                for (let c = 0; c < pCopies; c++) {
                    canvases.push(window.renderSinglePoultryScaleTag203DPI(it, items.length, cfg));
                }
            });
            if (document.getElementById('ps-pb-master-summary')?.checked && items.length > 1) {
                canvases.push(renderPoultrySummaryCanvas203DPI(items, cfg));
            }
            return canvases;
        }

        if (studioState.activeTab === 'freezer') {
            const fCopies = Math.max(1, parseInt(document.getElementById('ps-fz-copies')?.value) || 1);
            const single = renderFreezerTagCanvas203DPI(cfg);
            for (let c = 0; c < fCopies; c++) canvases.push(single);
            return canvases;
        }

        // Orders tab
        let orders = getActiveOrdersForPrinting();
        if (orders.length === 0) return [];
        if (cfg.reversePrintOrder && orders.length > 1) orders = orders.slice().reverse();

        if (studioState.ordersPreviewMode === 'packing') {
            canvases.push(renderPackingSummaryCanvas203DPI(orders, cfg));
            return canvases;
        }
        if (studioState.ordersPreviewMode === 'manifest') {
            canvases.push(renderDriverManifestCanvas203DPI(orders, cfg));
            return canvases;
        }

        orders.forEach((ord, idx) => {
            const bags = Math.max(1, Math.min(20, parseInt(studioState.orderBagsMap[ord.id]) || parseInt(ord._bagsCount) || 1));
            for (let c = 0; c < copies; c++) {
                for (let b = 1; b <= bags; b++) {
                    canvases.push(window.renderWaybillToCanvas203DPI(ord, cfg, idx + 1, orders.length, b, bags));
                }
            }
        });
        return canvases;
    }

    // =========================================================================
    // 11. واجهة صفحة «استوديو الطابعة» الملكية داخل #view-printer
    // =========================================================================
    window.renderPrinterStudioPage = function () {
        const container = document.getElementById('view-printer');
        if (!container) return;

        if (!container.dataset.built) {
            buildPrinterStudioShellHTML(container);
            container.dataset.built = '1';
        }

        syncInputsFromConfig();
        ensureDesignerInitialized();
        window.scanAndLoadNativePairedPrinters(false);
        populateFreezerProductsSelect();
        renderSavedDesignerTemplatesUI();
        renderOrdersTabQueue();
        window.parsePoultryWeightsList();
        switchPrinterStudioSubTab(studioState.activeTab, true);
        refreshStudioPreviewStage();
    };

    function buildPrinterStudioShellHTML(container) {
        const presetBtnsHtml = Object.keys(PAPER_PRESETS).map(k => {
            const p = PAPER_PRESETS[k];
            return `<button type="button" data-preset="${k}" onclick="psSelectPaperPreset('${k}')" class="ps-preset-btn px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-white/10 hover:bg-amber-400 hover:text-slate-950 text-emerald-100 border border-white/15 transition-all whitespace-nowrap">${p.label}</button>`;
        }).join('');

        container.innerHTML = `
            <!-- 1. شريط القيادة والبلوتوث والمقاسات العلوي (Royal Emerald & Gold) -->
            <div class="bg-gradient-to-l from-[#042f2e] via-[#064e3b] to-slate-900 text-white p-4 rounded-[1.5rem] shadow-soft border border-amber-400/25 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2.5">
                        <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20 shrink-0">
                            <i class="fa-solid fa-print"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="text-base sm:text-lg font-black text-white">استوديو الطباعة الحرارية (Deli E750W)</h2>
                                <span id="ps-bt-badge" class="inline-flex items-center gap-1.5 bg-emerald-400 text-slate-950 px-2.5 py-0.5 rounded-xl text-[10px] font-black">فحص البلوتوث...</span>
                            </div>
                            <p class="text-[11px] font-bold text-emerald-200/80">مصمم حر باللمس (وورد) • بوالص الطلبات والشنط • ميزان الفراخ • استيكرات الفريزر</p>
                        </div>
                    </div>

                    <!-- اختيار طابعة البلوتوث وأوامر المعايرة -->
                    <div class="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
                        <select id="ps-bt-select" onchange="psUpdateCfgField('selectedMac', this.value)" class="flex-1 lg:w-56 bg-slate-900/90 border border-white/20 text-white rounded-xl px-3 py-2 text-xs font-black outline-none">
                            <option value="AUTO">🤖 اختيار تلقائي (Deli E750W)</option>
                        </select>
                        <button type="button" onclick="scanAndLoadNativePairedPrinters(true)" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95" title="تحديث طابعات البلوتوث"><i class="fa-brands fa-bluetooth-b"></i></button>
                        <button type="button" onclick="sendDeliHardwareCommand('calibrate')" class="bg-white/10 hover:bg-indigo-500 text-white px-2.5 py-2 rounded-xl text-[11px] font-black border border-white/15 transition-all" title="معايرة حساس الورق">🎯 معايرة</button>
                        <button type="button" onclick="sendDeliHardwareCommand('feed')" class="bg-white/10 hover:bg-slate-700 text-white px-2.5 py-2 rounded-xl text-[11px] font-black border border-white/15 transition-all" title="سحب ورقة">⏬ ورقة</button>
                        <button type="button" onclick="psToggleHwDrawer()" class="bg-amber-400/20 hover:bg-amber-400 text-amber-200 hover:text-slate-950 px-2.5 py-2 rounded-xl text-[11px] font-black border border-amber-400/35 transition-all"><i class="fa-solid fa-sliders"></i> إعدادات</button>
                    </div>
                </div>

                <!-- شريط المقاسات السريعة + إدخال حر بالملليمتر -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/10">
                    <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full" style="scrollbar-width:none;">
                        <span class="text-[10px] font-black text-amber-300 shrink-0 ml-1">📐 المقاس:</span>
                        ${presetBtnsHtml}
                    </div>
                    <div class="flex items-center gap-1.5 bg-black/30 px-2.5 py-1 rounded-xl border border-white/15 shrink-0">
                        <span class="text-[10px] font-bold text-emerald-200">عرض(مم):</span>
                        <input type="number" id="ps-w-mm" min="15" max="108" oninput="psManualDimChanged()" class="w-14 bg-slate-900 border border-white/20 rounded-lg py-1 text-center text-xs font-black text-amber-300 outline-none">
                        <span class="text-[10px] font-bold text-emerald-200">× طول:</span>
                        <input type="number" id="ps-h-mm" min="15" max="250" oninput="psManualDimChanged()" class="w-14 bg-slate-900 border border-white/20 rounded-lg py-1 text-center text-xs font-black text-amber-300 outline-none">
                    </div>
                </div>

                <!-- درج إعدادات الهاردوير المتقدمة (مطوي افتراضياً لنظافة الشاشة) -->
                <div id="ps-hw-drawer" class="hidden bg-slate-950/85 border border-amber-400/25 rounded-2xl p-3.5 space-y-3 text-xs">
                    <div class="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">غمقان الحبر (1-15)</label>
                            <input type="number" id="ps-cfg-density" min="1" max="15" oninput="psUpdateCfgField('density', Number(this.value))" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-center font-black text-amber-300">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">الفاصل Gap (مم)</label>
                            <input type="number" id="ps-cfg-gap" min="0" max="10" step="0.5" oninput="psUpdateCfgField('gapMm', Number(this.value))" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-center font-black text-white">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">إزاحة X (مم)</label>
                            <input type="number" id="ps-cfg-ox" min="-10" max="10" step="0.5" oninput="psUpdateCfgField('offsetXMm', Number(this.value))" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-center font-black text-white">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">إزاحة Y (مم)</label>
                            <input type="number" id="ps-cfg-oy" min="-10" max="10" step="0.5" oninput="psUpdateCfgField('offsetYMm', Number(this.value))" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-center font-black text-white">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">اتجاه الورق</label>
                            <select id="ps-cfg-dir" onchange="psUpdateCfgField('direction', Number(this.value))" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 font-black text-white">
                                <option value="0">طبيعي (0°)</option>
                                <option value="1">مقلوب (180°)</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">شكل البرواز</label>
                            <select id="ps-cfg-border" onchange="psUpdateCfgField('borderStyle', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 font-black text-white">
                                <option value="double">مزدوج ملكي</option>
                                <option value="solid">سميك عادي</option>
                                <option value="rounded">دائري الحواف</option>
                                <option value="corners">أركان مودرن</option>
                                <option value="dashed">منقط</option>
                                <option value="none">بدون برواز</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <input type="text" id="ps-cfg-store-title" placeholder="اسم البراند بالبوليصة (افتراضي: سمان ههيا)" oninput="psUpdateCfgField('customStoreTitle', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white">
                        <input type="text" id="ps-cfg-store-phone" dir="ltr" placeholder="رقم التليفون بالبوليصة" oninput="psUpdateCfgField('customStorePhone', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white text-center">
                        <input type="text" id="ps-cfg-footer" placeholder="رسالة الفوتر بالأسفل" oninput="psUpdateCfgField('footerText', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white">
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div class="flex flex-wrap gap-3 text-[11px] font-black text-slate-200">
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="ps-cfg-barcode" onchange="psUpdateCfgField('showBarcode', this.checked)" class="w-4 h-4 accent-amber-400"> باركود</label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="ps-cfg-prices" onchange="psUpdateCfgField('showItemsPrice', this.checked)" class="w-4 h-4 accent-amber-400"> أسعار</label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="ps-cfg-invert" onchange="psUpdateCfgField('invertBitmap', this.checked)" class="w-4 h-4 accent-amber-400"> عكس الحبر</label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="ps-cfg-reverse" onchange="psUpdateCfgField('reversePrintOrder', this.checked)" class="w-4 h-4 accent-amber-400"> عكس ترتيب الرول (10⬅️1)</label>
                            <label class="flex items-center gap-1.5 cursor-pointer text-emerald-300"><input type="checkbox" id="ps-cfg-instant" onchange="psUpdateCfgField('instantPrint', this.checked)" class="w-4 h-4 accent-emerald-400"> طباعة فورية من الكارت</label>
                        </div>
                        <button type="button" onclick="saveWaybillSettings()" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-black shadow">💾 حفظ الإعدادات نهائياً</button>
                    </div>
                </div>
            </div>

            <!-- 2. شريط التبويبات الـ 4 الرئيسية للاستوديو -->
            <div class="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-soft grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button type="button" id="ps-tab-btn-designer" onclick="switchPrinterStudioSubTab('designer')" class="ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-pen-ruler text-amber-400"></i> <span>المصمم الحر (وورد)</span>
                </button>
                <button type="button" id="ps-tab-btn-orders" onclick="switchPrinterStudioSubTab('orders')" class="ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-receipt text-emerald-600"></i> <span>بوالص الطلبات والشنط</span>
                </button>
                <button type="button" id="ps-tab-btn-poultry" onclick="switchPrinterStudioSubTab('poultry')" class="ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-scale-balanced text-amber-600"></i> <span>ميزان وتكت الفراخ</span>
                </button>
                <button type="button" id="ps-tab-btn-freezer" onclick="switchPrinterStudioSubTab('freezer')" class="ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-snowflake text-cyan-600"></i> <span>أطباق السمان والفريزر</span>
                </button>
            </div>

            <!-- 3. مساحة العمل الموحدة: أدوات التحكم يميناً (7 أعمدة) + منصة المعاينة والطباعة يساراً (5 أعمدة) -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                <!-- ====== العمود الأيسر: منصة المعاينة الحية + أزرار الطباعة الثابتة (تظهر أولاً في الموبايل لسهولة اللمس) ====== -->
                <div class="lg:col-span-5 lg:order-2 lg:sticky lg:top-4 space-y-3">
                    <div class="bg-slate-900 text-white p-3.5 rounded-[1.5rem] shadow-lg border border-slate-700 space-y-3">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                <i class="fa-solid fa-eye"></i> المعاينة الحية
                                <span id="ps-preview-count" class="bg-white/15 text-white px-2 py-0.5 rounded-lg text-[10px]">1 ملصق</span>
                            </span>
                            <span id="ps-dims-label" class="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-lg" dir="ltr">70×130mm</span>
                        </div>

                        <!-- شريط التنقل بين الملصقات في حالة تعدد الطلبات أو تكتات الفراخ -->
                        <div id="ps-preview-nav" class="hidden flex items-center justify-between bg-slate-800 px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-slate-700"></div>

                        <!-- مسرح الرسم الحراري 203 DPI (تفاعلي باللمس في المصمم الحر) -->
                        <div id="ps-stage-wrap" class="bg-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center min-h-[260px] max-h-[420px] overflow-auto border-2 border-dashed border-slate-500">
                            <div id="ps-canvas-stage" class="flex items-center justify-center w-full"></div>
                        </div>

                        <!-- أزرار الطباعة الموحدة لجميع الأنظمة الـ 4 -->
                        <div class="space-y-2">
                            <button type="button" id="ps-btn-print-bt" onclick="psExecutePrint('bluetooth')" class="w-full bg-gradient-to-l from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black py-3.5 rounded-2xl text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all">
                                <i class="fa-solid fa-bolt text-base"></i>
                                <span>طباعة بلوتوث مباشرة (Deli E750W)</span>
                            </button>
                            <div class="grid grid-cols-3 gap-1.5">
                                <button type="button" onclick="psExecutePrint('usb')" class="bg-cyan-700 hover:bg-cyan-600 text-white font-black py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95">
                                    <i class="fa-brands fa-usb"></i> USB
                                </button>
                                <button type="button" onclick="psExecutePrint('spooler')" class="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-black py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-print"></i> Spooler/PDF
                                </button>
                                <button type="button" onclick="psDownloadCurrentPNG()" class="bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-black py-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-image"></i> صورة PNG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ====== العمود الأيمن: أدوات التبويب النشط (7 أعمدة) ====== -->
                <div class="lg:col-span-7 lg:order-1 space-y-4">

                    <!-- 1️⃣ تبويب المصمم الحر (وورد / كانفا باللمس) -->
                    <div id="ps-panel-designer" class="space-y-3.5">
                        <!-- شريط إضافة العناصر -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                <div>
                                    <h3 class="text-sm font-black text-slate-800"><i class="fa-solid fa-wand-magic-sparkles text-amber-500 ml-1"></i> لوحة التصميم الحر (اسحب وكبّر بإيدك)</h3>
                                    <p class="text-[11px] font-bold text-slate-400">المس أي عنصر في الورقة وحرّكه بإيدك، وامسك الدائرة الخضراء لتكبيره وتصغيره</p>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <label class="flex items-center gap-1 text-[11px] font-black text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl cursor-pointer">
                                        <input type="checkbox" id="ps-des-grid" checked onchange="psToggleDesignerGrid(this.checked)" class="w-3.5 h-3.5 accent-emerald-600"> شبكة
                                    </label>
                                    <div class="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-xl">
                                        <span class="text-[10px] font-black text-emerald-800">نسخ:</span>
                                        <input type="number" id="ps-des-copies" value="1" min="1" max="50" onchange="psUpdateDesignerCopies(this.value)" class="w-11 bg-white border border-emerald-200 rounded-lg text-center text-xs font-black text-emerald-900">
                                    </div>
                                </div>
                            </div>

                            <!-- أزرار إضافة العناصر -->
                            <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                <button type="button" onclick="psAddDesignerEl('text')" class="bg-slate-900 hover:bg-emerald-700 text-white py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-font text-amber-400 text-sm"></i><span>+ نص حر</span>
                                </button>
                                <button type="button" onclick="psAddDesignerEl('box')" class="bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 border border-slate-200 py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-regular fa-square text-indigo-500 text-sm"></i><span>+ مربع</span>
                                </button>
                                <button type="button" onclick="psAddDesignerEl('badge')" class="bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 border border-slate-200 py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-square text-slate-900 text-sm"></i><span>+ شارة سوداء</span>
                                </button>
                                <button type="button" onclick="psAddDesignerEl('line')" class="bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 border border-slate-200 py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-minus text-emerald-600 text-sm"></i><span>+ خط فاصل</span>
                                </button>
                                <button type="button" onclick="psAddDesignerEl('barcode')" class="bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 border border-slate-200 py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-barcode text-amber-600 text-sm"></i><span>+ باركود</span>
                                </button>
                                <button type="button" onclick="psAddDesignerEl('logo')" class="bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-800 border border-slate-200 py-2.5 px-2 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition-all active:scale-95">
                                    <i class="fa-solid fa-kiwi-bird text-emerald-700 text-sm"></i><span>+ لوجو</span>
                                </button>
                            </div>
                        </div>

                        <!-- لوحة خصائص العنصر المحدد حالياً -->
                        <div id="ps-designer-props-box" class="bg-white p-4 rounded-2xl border-2 border-emerald-200/80 shadow-soft space-y-3"></div>

                        <!-- شريط القوالب الجاهزة والمحفوظة -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft space-y-2.5">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="text-xs font-black text-slate-700"><i class="fa-solid fa-bookmark text-amber-500 ml-1"></i> قوالب جاهزة وقوالبك المحفوظة:</span>
                                <div class="flex gap-1.5">
                                    <button type="button" onclick="psSaveCurrentDesignerTemplate()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm">💾 حفظ تصميمي كقالب</button>
                                    <button type="button" onclick="psClearDesignerCanvas()" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 px-3 py-1.5 rounded-xl text-[11px] font-black">🧹 ورقة بيضاء</button>
                                </div>
                            </div>
                            <div id="ps-designer-templates-list" class="flex flex-wrap gap-1.5"></div>
                        </div>
                    </div>

                    <!-- 2️⃣ تبويب بوالص الطلبات الحية والشنط -->
                    <div id="ps-panel-orders" class="hidden space-y-3.5">
                        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <h3 class="text-sm font-black text-slate-800"><i class="fa-solid fa-truck-fast text-emerald-600 ml-1"></i> طابور الطلبات الحية للطباعة</h3>
                                <div class="flex flex-wrap gap-1.5">
                                    <button type="button" onclick="psSelectAllFilteredOrders()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl text-[11px] font-black">☑️ تحديد الكل</button>
                                    <button type="button" onclick="psClearSelectedOrders()" class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1.5 rounded-xl text-[11px] font-black">✕ إلغاء</button>
                                    <button type="button" onclick="psSetOrdersPrintMode('waybill')" id="ps-omode-waybill" class="bg-slate-900 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black">🧾 البوالص</button>
                                    <button type="button" onclick="psSetOrdersPrintMode('packing')" id="ps-omode-packing" class="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black">📦 تجهيز</button>
                                    <button type="button" onclick="psSetOrdersPrintMode('manifest')" id="ps-omode-manifest" class="bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black">🛵 مندوب</button>
                                    <button type="button" onclick="psMarkSelectedOrdersPrinted()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black" title="تسجيل أن الطلبات المحددة تم طباعتها">✅ تسجيل كمطبوع</button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <select id="ps-ord-status" onchange="renderOrdersTabQueue()" class="border border-slate-200 bg-slate-50 rounded-xl p-2 text-xs font-black text-slate-700 outline-none">
                                    <option value="active">🔥 كل النشط (جديد + تجهيز + بالطريق)</option>
                                    <option value="unprinted">🖨️ لم يُطبع بعد فقط</option>
                                    <option value="new">🆕 جديد</option>
                                    <option value="processing">⏳ تجهيز</option>
                                    <option value="for_driver">📦 للمندوب</option>
                                    <option value="dispatched">🛵 بالطريق</option>
                                    <option value="completed">✅ مكتمل</option>
                                </select>
                                <input type="search" id="ps-ord-search" oninput="renderOrdersTabQueue()" placeholder="بحث بالاسم أو الرقم أو المنطقة..." class="col-span-1 sm:col-span-2 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:bg-white">
                            </div>

                            <div id="ps-orders-queue-list" class="space-y-2 max-h-[55vh] overflow-y-auto custom-scroll pr-0.5"></div>
                        </div>
                    </div>

                    <!-- 3️⃣ تبويب ميزان وتكت الفراخ (مربوط بالبلوتوث 100%) -->
                    <div id="ps-panel-poultry" class="hidden space-y-3.5">
                        <div class="bg-white p-4 rounded-2xl border-2 border-amber-300/80 shadow-soft space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2.5">
                                <div>
                                    <h3 class="text-sm font-black text-slate-900"><i class="fa-solid fa-scale-balanced text-amber-600 ml-1"></i> منظومة ميزان وتكت الفراخ (بالترتيب الصارم)</h3>
                                    <p class="text-[11px] font-bold text-slate-500">مربوطة مباشرة بالبلوتوث والـ USB — رص الأوزان وستخرج من الطابعة بنفس التسلسل</p>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    <button type="button" onclick="psPasteWeightsFromClipboard()" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">📋 لصق الأوزان</button>
                                    <button type="button" onclick="psCopyPoultryWhatsApp()" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all">📲 كشف واتساب</button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div class="col-span-2">
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">اسم الصنف على التكت</label>
                                    <input type="text" id="ps-pb-name" value="فراخ تسمين طازجة - ذبح اليوم" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-emerald-700 block mb-1">💰 سعر الكيلو (ج)</label>
                                    <input type="number" id="ps-pb-kilo" value="110" min="1" step="0.5" oninput="parsePoultryWeightsList(); refreshStudioPreviewStage()" class="w-full border-2 border-emerald-400 rounded-xl p-2 text-center text-xs font-black bg-emerald-50 text-emerald-950">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">التقريب</label>
                                    <select id="ps-pb-round" onchange="parsePoultryWeightsList(); refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black bg-slate-50">
                                        <option value="nearest_1" selected>أقرب جنيه</option>
                                        <option value="floor_1">لصالح العميل</option>
                                        <option value="nearest_5">أقرب 5 ج</option>
                                        <option value="exact">بدون تقريب</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-3 gap-2.5">
                                <div>
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">بيان التاريخ</label>
                                    <input type="text" id="ps-pb-date" value="ذبح اليوم • طازج 100%" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">خصم الطبق (جم)</label>
                                    <input type="number" id="ps-pb-tare" value="0" min="0" max="200" oninput="parsePoultryWeightsList(); refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">نسخ لكل فرخة</label>
                                    <input type="number" id="ps-pb-copies" value="1" min="1" max="10" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                <div class="sm:col-span-5 space-y-2">
                                    <div class="flex gap-1">
                                        <input type="number" id="ps-pb-quick-w" placeholder="اكتب الوزن بالجرام ثم Enter" onkeydown="if(event.key==='Enter'){event.preventDefault(); psQuickAddPoultryWeight();}" class="flex-1 border border-amber-300 rounded-xl px-2.5 py-2 text-xs font-black bg-amber-50/40 outline-none">
                                        <button type="button" onclick="psQuickAddPoultryWeight()" class="bg-slate-900 text-amber-300 px-3 py-2 rounded-xl text-xs font-black">+ أضف</button>
                                    </div>
                                    <textarea id="ps-pb-weights" rows="5" oninput="parsePoultryWeightsList(); refreshStudioPreviewStage()" placeholder="1389&#10;1450&#10;1700" class="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-black bg-slate-50 font-mono leading-relaxed outline-none focus:border-emerald-600">1389
1450
1700</textarea>
                                </div>
                                <div class="sm:col-span-7 flex flex-col justify-between space-y-2">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[10px] font-black text-slate-600">طابور الطباعة المرتب (اضغط على أي تكت لمعاينته):</span>
                                        <button type="button" onclick="document.getElementById('ps-pb-weights').value=''; parsePoultryWeightsList(); refreshStudioPreviewStage();" class="text-[10px] font-black text-rose-600 hover:underline">🗑️ مسح</button>
                                    </div>
                                    <div id="ps-pb-chips" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto custom-scroll p-1.5 bg-slate-100 rounded-xl border border-slate-200"></div>
                                    <div id="ps-pb-stats"></div>
                                </div>
                            </div>

                            <label class="flex items-center gap-2 text-xs font-black text-amber-950 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-200 cursor-pointer">
                                <input type="checkbox" id="ps-pb-master-summary" checked onchange="refreshStudioPreviewStage()" class="w-4 h-4 accent-amber-600">
                                <span>📦 طباعة «تكت ملخص الدفعة والبرنيكة» تلقائياً بعد انتهاء تكتات الفراخ</span>
                            </label>
                        </div>
                    </div>

                    <!-- 4️⃣ تبويب استيكرات أطباق السمان والفريزر -->
                    <div id="ps-panel-freezer" class="hidden space-y-3.5">
                        <div class="bg-white p-4 rounded-2xl border border-cyan-200 shadow-soft space-y-3.5">
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                <div>
                                    <h3 class="text-sm font-black text-slate-800"><i class="fa-solid fa-snowflake text-cyan-600 ml-1"></i> استيكرات أطباق السمان والفريزر</h3>
                                    <p class="text-[11px] font-bold text-slate-400">اختر الصنف من الكتالوج وتُحسب الصلاحية والوزن وتُطبع بالبلوتوث فوراً</p>
                                </div>
                                <button type="button" onclick="psAutoGenFreezerLot()" class="bg-cyan-50 hover:bg-cyan-600 text-cyan-800 hover:text-white border border-cyan-200 px-3 py-1.5 rounded-xl text-xs font-black transition-all">🔖 تشغيلة وباركود تلقائي</button>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">اختر الصنف من الكتالوج</label>
                                    <select id="ps-fz-select" onchange="psOnFreezerProductSelect()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50"></select>
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">اسم الصنف على الاستيكر</label>
                                    <input type="text" id="ps-fz-name" value="طبق سمان جامبو" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">الوزن الصافي / الوصف</label>
                                    <input type="text" id="ps-fz-weight" value="350 - 400 جم صافي" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">السعر (اختياري)</label>
                                    <div class="flex items-center gap-2">
                                        <input type="number" id="ps-fz-price" oninput="refreshStudioPreviewStage()" class="flex-1 border border-slate-200 rounded-xl p-2 text-center text-xs font-black bg-slate-50">
                                        <label class="flex items-center gap-1 text-[11px] font-black cursor-pointer shrink-0">
                                            <input type="checkbox" id="ps-fz-show-price" onchange="refreshStudioPreviewStage()" class="w-4 h-4 accent-emerald-600"> إظهار
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">تاريخ الذبح / الإنتاج</label>
                                    <input type="date" id="ps-fz-prod-date" value="${new Date().toISOString().slice(0, 10)}" onchange="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">الصلاحية وطريقة الحفظ</label>
                                    <select id="ps-fz-expiry" onchange="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                        <option value="3months">3 شهور (مجمد بالفريزر -18°)</option>
                                        <option value="6months">6 شهور (مجمد بالفريزر)</option>
                                        <option value="3days">3 أيام (طازج بالثلاجة)</option>
                                        <option value="15days">15 يوم (أطباق بيض سمان)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">رقم التشغيلة (اختياري)</label>
                                    <input type="text" id="ps-fz-lot" dir="ltr" placeholder="SH-1126-01" oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                </div>
                                <div>
                                    <label class="text-[11px] font-black text-slate-600 block mb-1">باركود (اختياري)</label>
                                    <input type="text" id="ps-fz-barcode" dir="ltr" placeholder="622..." oninput="refreshStudioPreviewStage()" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50">
                                </div>
                            </div>

                            <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                                <span class="text-xs font-bold text-slate-500">عدد استيكرات الأطباق المطلوبة:</span>
                                <input type="number" id="ps-fz-copies" value="1" min="1" max="100" oninput="refreshStudioPreviewStage()" class="w-24 border-2 border-emerald-600 rounded-xl p-2 text-center text-sm font-black text-emerald-800">
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }

    // =========================================================================
    // 12. دوال التفاعل وتحديث واجهة المصمم الحر والطلبات والفراخ
    // =========================================================================
    function syncInputsFromConfig() {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

        setVal('ps-w-mm', dims.w);
        setVal('ps-h-mm', dims.h);
        setVal('ps-cfg-density', cfg.density || 13);
        setVal('ps-cfg-gap', cfg.gapMm !== undefined ? cfg.gapMm : 2);
        setVal('ps-cfg-ox', cfg.offsetXMm || 0);
        setVal('ps-cfg-oy', cfg.offsetYMm || 0);
        setVal('ps-cfg-dir', String(cfg.direction ? 1 : 0));
        setVal('ps-cfg-border', cfg.borderStyle || 'double');
        setVal('ps-cfg-store-title', cfg.customStoreTitle || '');
        setVal('ps-cfg-store-phone', cfg.customStorePhone || '');
        setVal('ps-cfg-footer', cfg.footerText || '');
        setChk('ps-cfg-barcode', cfg.showBarcode === true);
        setChk('ps-cfg-prices', cfg.showItemsPrice !== false);
        setChk('ps-cfg-invert', cfg.invertBitmap === true);
        setChk('ps-cfg-reverse', cfg.reversePrintOrder === true);
        setChk('ps-cfg-instant', cfg.instantPrint === true);

        document.querySelectorAll('.ps-preset-btn').forEach(btn => {
            const active = btn.getAttribute('data-preset') === cfg.sizePreset;
            btn.className = active
                ? 'ps-preset-btn px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-amber-400 text-slate-950 shadow-sm transition-all whitespace-nowrap'
                : 'ps-preset-btn px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-white/10 hover:bg-amber-400 hover:text-slate-950 text-emerald-100 border border-white/15 transition-all whitespace-nowrap';
        });
    }

    window.psToggleHwDrawer = function () {
        studioState.hwDrawerOpen = !studioState.hwDrawerOpen;
        document.getElementById('ps-hw-drawer')?.classList.toggle('hidden', !studioState.hwDrawerOpen);
    };

    window.psUpdateCfgField = function (field, value) {
        const cfg = window.getWaybillConfig();
        cfg[field] = value;
        persistWaybillConfig(cfg);
        refreshStudioPreviewStage();
    };

    window.psSelectPaperPreset = function (presetKey) {
        const p = PAPER_PRESETS[presetKey];
        if (!p) return;
        const cfg = window.getWaybillConfig();
        const oldDims = resolveDimensionsMm(cfg);
        cfg.sizePreset = presetKey;
        cfg.widthMm = p.w;
        cfg.heightMm = p.h;
        persistWaybillConfig(cfg);

        // تحجيم عناصر المصمم الحر بذكاء لتتناسب مع المقاس الجديد
        scaleDesignerElementsToNewPaper(oldDims.w * DOTS_PER_MM, oldDims.h * DOTS_PER_MM, p.w * DOTS_PER_MM, p.h * DOTS_PER_MM);
        syncInputsFromConfig();
        refreshStudioPreviewStage();
    };

    window.psManualDimChanged = function () {
        const w = Math.min(108, Math.max(15, Number(document.getElementById('ps-w-mm')?.value) || 70));
        const h = Math.min(250, Math.max(15, Number(document.getElementById('ps-h-mm')?.value) || 130));
        const cfg = window.getWaybillConfig();
        const oldDims = resolveDimensionsMm(cfg);
        cfg.sizePreset = 'custom';
        cfg.widthMm = w;
        cfg.heightMm = h;
        persistWaybillConfig(cfg);

        scaleDesignerElementsToNewPaper(oldDims.w * DOTS_PER_MM, oldDims.h * DOTS_PER_MM, w * DOTS_PER_MM, h * DOTS_PER_MM);
        syncInputsFromConfig();
        refreshStudioPreviewStage();
    };

    function scaleDesignerElementsToNewPaper(oldW, oldH, newW, newH) {
        if (!oldW || !oldH || (oldW === newW && oldH === newH)) return;
        const rx = newW / oldW, ry = newH / oldH;
        const rf = Math.min(rx, ry);
        studioState.designer.elements.forEach(el => {
            el.x = Math.round(el.x * rx);
            el.y = Math.round(el.y * ry);
            el.w = Math.max(24, Math.round(el.w * rx));
            el.h = Math.max(12, Math.round(el.h * ry));
            if (el.fontSize) el.fontSize = Math.max(10, Math.min(120, Math.round(el.fontSize * rf)));
        });
    }

    window.switchPrinterStudioSubTab = function (tabId, skipPreview = false) {
        studioState.activeTab = tabId;
        ['designer', 'orders', 'poultry', 'freezer'].forEach(t => {
            document.getElementById('ps-panel-' + t)?.classList.toggle('hidden', t !== tabId);
            const btn = document.getElementById('ps-tab-btn-' + t);
            if (btn) {
                btn.className = (t === tabId)
                    ? 'ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all flex items-center justify-center gap-1.5'
                    : 'ps-subtab-btn py-2.5 px-3 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5';
            }
        });
        if (tabId === 'designer') renderDesignerPropertiesBar();
        if (tabId === 'orders') renderOrdersTabQueue();
        if (tabId === 'poultry') window.parsePoultryWeightsList();
        if (!skipPreview) refreshStudioPreviewStage();
    };

    // --- أدوات المصمم الحر ---
    window.psToggleDesignerGrid = function (checked) {
        studioState.designer.showGrid = Boolean(checked);
        refreshStudioPreviewStage();
    };
    window.psUpdateDesignerCopies = function (val) {
        studioState.designer.copies = Math.max(1, Math.min(50, parseInt(val) || 1));
        refreshStudioPreviewStage();
    };

    window.psAddDesignerEl = function (type) {
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const W = dims.w * DOTS_PER_MM, H = dims.h * DOTS_PER_MM;
        const id = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 999);
        const baseFont = Math.max(14, Math.round(Math.min(W, H) * 0.08));

        let el = { id, type, x: Math.round(W * 0.12), y: Math.round(H * 0.35), w: Math.round(W * 0.76), h: Math.max(36, Math.round(H * 0.22)), text: 'اكتب النص هنا', fontSize: baseFont, bold: true, align: 'center', inverted: false, border: 'none', borderWidth: 3 };
        if (type === 'box') { el.text = ''; el.border = 'solid'; el.h = Math.round(H * 0.3); }
        else if (type === 'badge') { el.text = 'سمان ههيا'; el.inverted = true; el.h = Math.max(34, Math.round(H * 0.18)); }
        else if (type === 'line') { el.text = ''; el.h = 14; el.border = 'solid'; el.borderWidth = 3; }
        else if (type === 'barcode') { el.text = '01208027294'; el.h = Math.max(54, Math.round(H * 0.24)); }
        else if (type === 'logo') { const s = Math.max(44, Math.round(Math.min(W, H) * 0.25)); el.w = s; el.h = s; el.text = ''; }

        studioState.designer.elements.push(el);
        studioState.designer.selectedId = id;
        renderDesignerPropertiesBar();
        refreshStudioPreviewStage();
    };

    window.psUpdateSelectedEl = function (field, value) {
        const el = studioState.designer.elements.find(e => e.id === studioState.designer.selectedId);
        if (!el) return;
        el[field] = value;
        if (field === 'fontSize') {
            const lbl = document.getElementById('ps-el-fs-lbl');
            if (lbl) lbl.textContent = value + 'px';
        }
        refreshStudioPreviewStage();
    };

    window.psNudgeSelectedEl = function (dx, dy) {
        const el = studioState.designer.elements.find(e => e.id === studioState.designer.selectedId);
        if (!el) return;
        el.x += dx; el.y += dy;
        refreshStudioPreviewStage();
    };

    window.psActionSelectedEl = function (act) {
        const els = studioState.designer.elements;
        const idx = els.findIndex(e => e.id === studioState.designer.selectedId);
        if (idx === -1) return;
        const el = els[idx];
        const dims = resolveDimensionsMm(window.getWaybillConfig());
        const W = dims.w * DOTS_PER_MM, H = dims.h * DOTS_PER_MM;

        if (act === 'delete') {
            els.splice(idx, 1);
            studioState.designer.selectedId = els[els.length - 1]?.id || null;
        } else if (act === 'dup') {
            const copy = { ...el, id: 'el_' + Date.now(), x: Math.min(W - 30, el.x + 16), y: Math.min(H - 30, el.y + 16) };
            els.push(copy);
            studioState.designer.selectedId = copy.id;
        } else if (act === 'center_x') {
            el.x = Math.round((W - el.w) / 2);
        } else if (act === 'center_y') {
            el.y = Math.round((H - el.h) / 2);
        } else if (act === 'front' && idx < els.length - 1) {
            els.splice(idx, 1); els.push(el);
        } else if (act === 'back' && idx > 0) {
            els.splice(idx, 1); els.unshift(el);
        } else if (act === 'invert') {
            el.inverted = !el.inverted;
        }
        renderDesignerPropertiesBar();
        refreshStudioPreviewStage();
    };

    function renderDesignerPropertiesBar() {
        const box = document.getElementById('ps-designer-props-box');
        if (!box) return;
        const el = studioState.designer.elements.find(e => e.id === studioState.designer.selectedId);

        if (!el) {
            box.innerHTML = `<div class="text-center py-4 text-xs font-bold text-slate-400">👆 المس أي عنصر في المعاينة (أو أضف عنصراً جديداً بالأعلى) للتحكم في نصّه وحجمه وشكله</div>`;
            return;
        }

        const typeNames = { text: 'نص حر', box: 'مربع / برواز', badge: 'شارة سوداء', line: 'خط فاصل', barcode: 'باركود', logo: 'لوجو' };
        const showTextEditor = ['text', 'box', 'badge', 'barcode'].includes(el.type);

        box.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                <span class="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    تعديل العنصر المحدد: (${typeNames[el.type] || el.type})
                </span>
                <div class="flex flex-wrap gap-1">
                    <button type="button" onclick="psActionSelectedEl('center_x')" class="bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black" title="توسيط أفقي">↔️ وسط</button>
                    <button type="button" onclick="psActionSelectedEl('center_y')" class="bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black" title="توسيط رأسي">↕️ وسط</button>
                    <button type="button" onclick="psActionSelectedEl('front')" class="bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black">⬆️ أمام</button>
                    <button type="button" onclick="psActionSelectedEl('back')" class="bg-slate-100 hover:bg-slate-800 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black">⬇️ خلف</button>
                    <button type="button" onclick="psActionSelectedEl('dup')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black">📋 تكرار</button>
                    <button type="button" onclick="psActionSelectedEl('delete')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white px-2 py-1 rounded-lg text-[10px] font-black">🗑️ حذف</button>
                </div>
            </div>

            ${showTextEditor ? `
                <div>
                    <label class="text-[10px] font-black text-slate-500 block mb-1">${el.type === 'barcode' ? 'رقم أو كود الباركود (إنجليزي/أرقام):' : 'النص داخل العنصر (يقبل أكثر من سطر):'}</label>
                    <textarea rows="2" ${el.type === 'barcode' ? 'dir="ltr"' : ''} oninput="psUpdateSelectedEl('text', this.value)" class="w-full border border-slate-300 rounded-xl p-2.5 text-sm font-black bg-slate-50 focus:bg-white outline-none">${escapeHtml(el.text || '')}</textarea>
                </div>
            ` : ''}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                ${['text', 'box', 'badge'].includes(el.type) ? `
                    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <div class="flex justify-between text-[10px] font-black text-slate-700 mb-1">
                            <span>🔤 حجم الخط</span>
                            <span id="ps-el-fs-lbl" class="text-emerald-700">${el.fontSize || 24}px</span>
                        </div>
                        <input type="range" min="10" max="110" step="1" value="${el.fontSize || 24}" oninput="psUpdateSelectedEl('fontSize', Number(this.value))" class="w-full accent-emerald-600 cursor-pointer">
                    </div>
                ` : ''}

                <div class="flex flex-wrap items-center gap-1.5">
                    ${['text', 'box', 'badge'].includes(el.type) ? `
                        <button type="button" onclick="psUpdateSelectedEl('align', 'right'); renderDesignerPropertiesBar()" class="px-2.5 py-1.5 rounded-lg text-xs font-black ${el.align === 'right' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}"><i class="fa-solid fa-align-right"></i></button>
                        <button type="button" onclick="psUpdateSelectedEl('align', 'center'); renderDesignerPropertiesBar()" class="px-2.5 py-1.5 rounded-lg text-xs font-black ${(!el.align || el.align === 'center') ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}"><i class="fa-solid fa-align-center"></i></button>
                        <button type="button" onclick="psUpdateSelectedEl('align', 'left'); renderDesignerPropertiesBar()" class="px-2.5 py-1.5 rounded-lg text-xs font-black ${el.align === 'left' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}"><i class="fa-solid fa-align-left"></i></button>
                    ` : ''}
                    ${el.type !== 'line' && el.type !== 'barcode' ? `
                        <button type="button" onclick="psActionSelectedEl('invert')" class="px-2.5 py-1.5 rounded-lg text-[11px] font-black ${el.inverted ? 'bg-slate-950 text-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">🌓 عكس اللون</button>
                    ` : ''}
                    <select onchange="psUpdateSelectedEl('border', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-[11px] font-black text-slate-700 outline-none">
                        <option value="none" ${el.border === 'none' ? 'selected' : ''}>بدون برواز</option>
                        <option value="solid" ${el.border === 'solid' ? 'selected' : ''}>برواز عادي</option>
                        <option value="double" ${el.border === 'double' ? 'selected' : ''}>برواز مزدوج</option>
                        <option value="rounded" ${el.border === 'rounded' ? 'selected' : ''}>حواف دائرية</option>
                        <option value="dashed" ${el.border === 'dashed' ? 'selected' : ''}>برواز منقط</option>
                    </select>
                </div>
            </div>

            <!-- تحريك دقيق بالمللي (مفيد جداً في مقاس 2×2 سم) -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[10px] font-black text-slate-500">
                <span>🎯 تحريك دقيق بالبكسل:</span>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="psNudgeSelectedEl(0, -6)" class="w-8 h-7 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-lg">⬆️</button>
                    <button type="button" onclick="psNudgeSelectedEl(0, 6)" class="w-8 h-7 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-lg">⬇️</button>
                    <button type="button" onclick="psNudgeSelectedEl(6, 0)" class="w-8 h-7 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-lg">➡️</button>
                    <button type="button" onclick="psNudgeSelectedEl(-6, 0)" class="w-8 h-7 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-lg">⬅️</button>
                </div>
            </div>
        `;
    }

    function renderSavedDesignerTemplatesUI() {
        const cont = document.getElementById('ps-designer-templates-list');
        if (!cont) return;
        const builtins = [
            { key: '20x20', label: '🔖 قالب 2×2 سم سعر' },
            { key: '50x30', label: '🏷️ قالب 5×3 سم منتج' },
            { key: '70x50', label: '❄️ قالب 7×5 سم فريزر' }
        ];
        const custom = getSavedDesignerTemplates();

        let html = builtins.map(b => `
            <button type="button" onclick="psLoadBuiltinDesignerTemplate('${b.key}')" class="bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 px-3 py-1.5 rounded-xl text-[11px] font-black border border-slate-200 transition-all">${b.label}</button>
        `).join('');

        html += custom.map((t, i) => `
            <div class="inline-flex items-center bg-emerald-50 border border-emerald-200 rounded-xl overflow-hidden">
                <button type="button" onclick="psLoadCustomDesignerTemplate(${i})" class="hover:bg-emerald-600 hover:text-white text-emerald-900 px-2.5 py-1.5 text-[11px] font-black transition-all">📌 ${escapeHtml(t.name)}</button>
                <button type="button" onclick="psDeleteCustomDesignerTemplate(${i})" class="px-2 py-1.5 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-black border-r border-emerald-200">×</button>
            </div>
        `).join('');
        cont.innerHTML = html;
    }

    window.psLoadBuiltinDesignerTemplate = function (presetKey) {
        const p = PAPER_PRESETS[presetKey] || PAPER_PRESETS['70x50'];
        const cfg = window.getWaybillConfig();
        cfg.sizePreset = presetKey; cfg.widthMm = p.w; cfg.heightMm = p.h;
        persistWaybillConfig(cfg);
        studioState.designer.elements = createStarterDesignerElements(presetKey, p.w * DOTS_PER_MM, p.h * DOTS_PER_MM);
        studioState.designer.selectedId = studioState.designer.elements[1]?.id || null;
        syncInputsFromConfig();
        renderDesignerPropertiesBar();
        refreshStudioPreviewStage();
    };

    window.psClearDesignerCanvas = function () {
        const dims = resolveDimensionsMm(window.getWaybillConfig());
        studioState.designer.elements = createStarterDesignerElements('blank', dims.w * DOTS_PER_MM, dims.h * DOTS_PER_MM);
        studioState.designer.selectedId = studioState.designer.elements[0]?.id || null;
        renderDesignerPropertiesBar();
        refreshStudioPreviewStage();
    };

    window.psSaveCurrentDesignerTemplate = function () {
        const name = prompt('اكتب اسماً للقالب لحفظه (مثال: استيكر بيض 5×3):');
        if (!name || !name.trim()) return;
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);
        const list = getSavedDesignerTemplates();
        list.push({
            name: name.trim().slice(0, 40),
            w: dims.w,
            h: dims.h,
            sizePreset: cfg.sizePreset,
            elements: JSON.parse(JSON.stringify(studioState.designer.elements))
        });
        saveDesignerTemplatesList(list);
        renderSavedDesignerTemplatesUI();
        notifyPrinterToast(`💾 تم حفظ القالب "${name.trim()}" بنجاح!`);
    };

    window.psLoadCustomDesignerTemplate = function (idx) {
        const list = getSavedDesignerTemplates();
        const tpl = list[idx];
        if (!tpl) return;
        const cfg = window.getWaybillConfig();
        cfg.widthMm = tpl.w; cfg.heightMm = tpl.h; cfg.sizePreset = tpl.sizePreset || 'custom';
        persistWaybillConfig(cfg);
        studioState.designer.elements = JSON.parse(JSON.stringify(tpl.elements || []));
        studioState.designer.selectedId = studioState.designer.elements[0]?.id || null;
        syncInputsFromConfig();
        renderDesignerPropertiesBar();
        refreshStudioPreviewStage();
    };

    window.psDeleteCustomDesignerTemplate = function (idx) {
        const list = getSavedDesignerTemplates();
        list.splice(idx, 1);
        saveDesignerTemplatesList(list);
        renderSavedDesignerTemplatesUI();
        notifyPrinterToast('تم حذف القالب');
    };

    // --- أدوات تبويب الطلبات ---
    function getFilteredStudioOrders() {
        const st = document.getElementById('ps-ord-status')?.value || 'active';
        const q = normalizeDigits(document.getElementById('ps-ord-search')?.value || '').toLowerCase().trim();
        const raw = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        return raw.filter(o => {
            if (!o || o.status === 'trash' || o.status === 'canceled' || o.isArchived) return false;
            if (st === 'active' && !['new', 'processing', 'for_driver', 'dispatched'].includes(o.status)) return false;
            if (st === 'unprinted' && ((Number(o.printedCount) || 0) > 0 || !['new', 'processing', 'for_driver', 'dispatched'].includes(o.status))) return false;
            if (['new', 'processing', 'for_driver', 'dispatched', 'completed'].includes(st) && o.status !== st) return false;
            if (q) {
                const hay = normalizeDigits(`${o.customerName || ''} ${o.customerPhone || ''} ${o.zone || ''} ${o.customerAddress || ''}`).toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    window.renderOrdersTabQueue = function () {
        const listEl = document.getElementById('ps-orders-queue-list');
        if (!listEl) return;
        const list = getFilteredStudioOrders();
        if (list.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-xs font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">لا توجد طلبات مطابقة للفلتر الحالي.</div>`;
            return;
        }
        listEl.innerHTML = list.slice(0, 60).map(o => {
            const sel = studioState.selectedOrderIds.has(o.id);
            const bags = Math.max(1, parseInt(studioState.orderBagsMap[o.id]) || 1);
            const itemsTxt = (Array.isArray(o.items) ? o.items : []).map(i => `${i.quantity}× ${i.name}`).join(' ، ');
            const pBadge = (Number(o.printedCount) || 0) > 0
                ? `<span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-black">طُبع (${o.printedCount})</span>`
                : `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-black">لم يُطبع</span>`;
            return `
                <div onclick="psToggleOrderSelect('${o.id}')" class="p-3 rounded-2xl border-2 cursor-pointer transition-all flex justify-between items-center gap-2 ${sel ? 'bg-emerald-50/70 border-emerald-600 shadow-sm' : 'bg-slate-50/60 border-slate-200/80 hover:border-slate-300'}">
                    <div class="flex items-start gap-2.5 min-w-0">
                        <input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation(); psToggleOrderSelect('${o.id}')" class="mt-1 w-4 h-4 accent-emerald-600">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="font-black text-xs sm:text-sm text-slate-800">${escapeHtml(o.customerName || 'عميل')}</span>
                                <span class="text-[10px] font-bold text-slate-500" dir="ltr">${escapeHtml(o.customerPhone || '')}</span>
                                ${pBadge}
                            </div>
                            <p class="text-[10px] font-bold text-slate-500 truncate">📍 ${escapeHtml(o.zone || '')} ${o.customerAddress ? '- ' + escapeHtml(o.customerAddress) : ''}</p>
                            <p class="text-[10px] font-black text-emerald-800 truncate mt-0.5">🛒 ${escapeHtml(itemsTxt || 'بدون أصناف')}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0" onclick="event.stopPropagation()">
                        <span class="font-black text-sm text-slate-900">${o.paymentMethod === 'online' ? 'خالص' : (o.total || 0) + ' ج'}</span>
                        <div class="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-lg border border-slate-200">
                            <span class="text-[9px] font-black text-slate-500">شنط:</span>
                            <button type="button" onclick="psStepOrderBag('${o.id}', -1)" class="w-5 h-5 bg-rose-50 text-rose-600 rounded text-xs font-black">-</button>
                            <span class="text-xs font-black px-1">${bags}</span>
                            <button type="button" onclick="psStepOrderBag('${o.id}', 1)" class="w-5 h-5 bg-emerald-50 text-emerald-700 rounded text-xs font-black">+</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.psToggleOrderSelect = function (orderId) {
        if (studioState.selectedOrderIds.has(orderId)) studioState.selectedOrderIds.delete(orderId);
        else studioState.selectedOrderIds.add(orderId);
        studioState.previewOrderIdx = 0;
        renderOrdersTabQueue();
        refreshStudioPreviewStage();
    };
    window.psSelectAllFilteredOrders = function () {
        const list = getFilteredStudioOrders();
        list.forEach(o => studioState.selectedOrderIds.add(o.id));
        renderOrdersTabQueue();
        refreshStudioPreviewStage();
    };
    window.psClearSelectedOrders = function () {
        studioState.selectedOrderIds.clear();
        window.deliPrinterConnection.lastOrdersQueue = [];
        renderOrdersTabQueue();
        refreshStudioPreviewStage();
    };
    window.psStepOrderBag = function (orderId, delta) {
        const cur = Math.max(1, parseInt(studioState.orderBagsMap[orderId]) || 1);
        studioState.orderBagsMap[orderId] = Math.max(1, Math.min(20, cur + delta));
        studioState.selectedOrderIds.add(orderId);
        renderOrdersTabQueue();
        refreshStudioPreviewStage();
    };
    window.psSetOrdersPrintMode = function (mode) {
        studioState.ordersPreviewMode = mode;
        ['waybill', 'packing', 'manifest'].forEach(m => {
            const btn = document.getElementById('ps-omode-' + m);
            if (btn) btn.className = m === mode
                ? 'bg-slate-900 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black'
                : 'bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black';
        });
        refreshStudioPreviewStage();
    };
    window.psMarkSelectedOrdersPrinted = async function () {
        const orders = getActiveOrdersForPrinting();
        if (!orders.length || typeof db === 'undefined') return notifyPrinterToast('حدد طلبات أولاً');
        try {
            const batch = db.batch();
            orders.forEach(o => {
                if (o.id && o.id !== 'SMAN2026') {
                    batch.update(db.collection('orders').doc(o.id), {
                        printedCount: firebase.firestore.FieldValue.increment(1),
                        lastPrintedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            });
            await batch.commit();
            notifyPrinterToast(`✅ تم تسجيل طباعة (${orders.length}) طلب بالنظام`);
            setTimeout(renderOrdersTabQueue, 200);
        } catch (e) { notifyPrinterToast('تعذر تحديث عداد الطباعة'); }
    };

    // --- أدوات تبويب الفراخ ---
    function renderPoultryChipsAndStats() {
        const items = studioState.poultryItems || [];
        const chips = document.getElementById('ps-pb-chips');
        const stats = document.getElementById('ps-pb-stats');
        const totalGrams = items.reduce((s, i) => s + i.netGrams, 0);
        const totalCash = items.reduce((s, i) => s + i.price, 0);
        const avg = items.length ? Math.round(totalGrams / items.length) : 0;

        if (stats) {
            stats.innerHTML = `
                <div class="grid grid-cols-4 gap-1.5 text-center">
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl"><span class="block text-[9px] text-slate-400">العدد</span><span class="text-xs font-black text-amber-300">${items.length} تكت</span></div>
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl"><span class="block text-[9px] text-slate-400">الوزن</span><span class="text-xs font-black text-emerald-300">${(totalGrams / 1000).toFixed(2)} كجم</span></div>
                    <div class="bg-slate-900 text-white p-1.5 rounded-xl"><span class="block text-[9px] text-slate-400">المتوسط</span><span class="text-xs font-black text-cyan-300">${avg} جم</span></div>
                    <div class="bg-emerald-700 text-white p-1.5 rounded-xl"><span class="block text-[9px] text-emerald-200">الإجمالي</span><span class="text-xs font-black">${totalCash.toLocaleString()} ج</span></div>
                </div>
            `;
        }
        if (chips) {
            chips.innerHTML = items.length === 0
                ? `<div class="col-span-2 text-center py-3 text-[11px] font-bold text-slate-400">اكتب الأوزان بالجرام على اليمين</div>`
                : items.map((it, idx) => `
                    <div onclick="psSelectPoultryIdx(${idx})" class="flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl border-2 text-[11px] font-black cursor-pointer ${idx === studioState.poultryPreviewIdx ? 'bg-emerald-50 border-emerald-600' : (it.isAnomaly ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200')}">
                        <span class="truncate"><span class="bg-slate-900 text-amber-300 px-1 rounded text-[9px]">#${it.index}</span> ${it.netGrams} جم</span>
                        <div class="flex items-center gap-1 shrink-0">
                            <span class="text-emerald-700">${it.price}ج</span>
                            <button type="button" onclick="event.stopPropagation(); psMovePoultryItem(${idx}, -1)" class="text-slate-400 hover:text-slate-900">▲</button>
                            <button type="button" onclick="event.stopPropagation(); psMovePoultryItem(${idx}, 1)" class="text-slate-400 hover:text-slate-900">▼</button>
                            <button type="button" onclick="event.stopPropagation(); psRemovePoultryItem(${idx})" class="text-rose-500">×</button>
                        </div>
                    </div>
                `).join('');
        }
    }

    window.psSelectPoultryIdx = function (idx) {
        studioState.poultryPreviewIdx = idx;
        renderPoultryChipsAndStats();
        refreshStudioPreviewStage();
    };
    window.psMovePoultryItem = function (idx, delta) {
        const items = studioState.poultryItems;
        const target = idx + delta;
        if (target < 0 || target >= items.length) return;
        const raw = items.map(i => i.grossGrams);
        [raw[idx], raw[target]] = [raw[target], raw[idx]];
        document.getElementById('ps-pb-weights').value = raw.join('\n');
        studioState.poultryPreviewIdx = target;
        window.parsePoultryWeightsList();
        refreshStudioPreviewStage();
    };
    window.psRemovePoultryItem = function (idx) {
        const raw = studioState.poultryItems.filter((_, i) => i !== idx).map(i => i.grossGrams);
        document.getElementById('ps-pb-weights').value = raw.join('\n');
        window.parsePoultryWeightsList();
        refreshStudioPreviewStage();
    };
    window.psQuickAddPoultryWeight = function () {
        const inp = document.getElementById('ps-pb-quick-w');
        const area = document.getElementById('ps-pb-weights');
        const v = normalizeDigits(inp?.value || '').trim();
        if (!v || isNaN(parseFloat(v))) return;
        area.value = (area.value.trim() ? area.value.trim() + '\n' : '') + v;
        inp.value = ''; inp.focus();
        window.parsePoultryWeightsList();
        studioState.poultryPreviewIdx = Math.max(0, studioState.poultryItems.length - 1);
        refreshStudioPreviewStage();
    };
    window.psPasteWeightsFromClipboard = async function () {
        try {
            const txt = await navigator.clipboard.readText();
            if (txt && txt.trim()) {
                document.getElementById('ps-pb-weights').value = txt.trim();
                const parsed = window.parsePoultryWeightsList();
                refreshStudioPreviewStage();
                notifyPrinterToast(`📋 تم لصق وترتيب (${parsed.length}) وزن بنجاح!`);
            }
        } catch (e) { notifyPrinterToast('الصق الأوزان مباشرة داخل المربع'); }
    };
    window.psCopyPoultryWhatsApp = function () {
        const items = window.parsePoultryWeightsList();
        if (!items.length) return notifyPrinterToast('أدخل الأوزان أولاً');
        const prod = document.getElementById('ps-pb-name')?.value || 'فراخ طازجة';
        const kilo = document.getElementById('ps-pb-kilo')?.value || '110';
        const totalG = items.reduce((s, i) => s + i.netGrams, 0);
        const totalC = items.reduce((s, i) => s + i.price, 0);
        const msg = [
            `🐔 *بيان أوزان وتسعير: ${prod}*`,
            `📅 ${new Date().toLocaleDateString('ar-EG')} | الكيلو: ${kilo} ج`,
            '----------------',
            ...items.map(i => `#${i.index} ⬅️ *${i.netGrams} جم* = *${i.price} ج.م*`),
            '----------------',
            `📦 العدد: ${items.length} | ⚖️ الصافي: ${(totalG / 1000).toFixed(3)} كجم`,
            `💰 *الإجمالي: ${totalC.toLocaleString()} ج.م*`
        ].join('\n');
        navigator.clipboard?.writeText(msg).then(() => notifyPrinterToast('📲 تم نسخ كشف الأوزان للواتساب!'));
    };

    // --- أدوات تبويب الفريزر ---
    function populateFreezerProductsSelect() {
        const sel = document.getElementById('ps-fz-select');
        if (!sel || typeof storeProducts === 'undefined') return;
        const keys = Object.keys(storeProducts || {});
        if (!keys.length) return;
        sel.innerHTML = keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(storeProducts[k]?.name || k)}</option>`).join('');
        window.psOnFreezerProductSelect();
    }
    window.psOnFreezerProductSelect = function () {
        const k = document.getElementById('ps-fz-select')?.value;
        const p = (typeof storeProducts !== 'undefined') ? storeProducts[k] : null;
        if (p) {
            document.getElementById('ps-fz-name').value = p.name || '';
            document.getElementById('ps-fz-weight').value = p.weight || '350 - 400 جم';
            document.getElementById('ps-fz-price').value = (typeof storePrices !== 'undefined' && storePrices[k]) || p.basePrice || '';
        }
        refreshStudioPreviewStage();
    };
    window.psAutoGenFreezerLot = function () {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const r = Math.floor(10 + Math.random() * 90);
        document.getElementById('ps-fz-lot').value = `SH-${mm}${dd}-${r}`;
        document.getElementById('ps-fz-barcode').value = `622${mm}${dd}${r}01`;
        refreshStudioPreviewStage();
    };

    // =========================================================================
    // 13. تحديث مسرح المعاينة وتنفيذ الطباعة
    // =========================================================================
    window.refreshStudioPreviewStage = function () {
        const stage = document.getElementById('ps-canvas-stage');
        if (!stage) return;
        const cfg = window.getWaybillConfig();
        const dims = resolveDimensionsMm(cfg);

        const dimsLbl = document.getElementById('ps-dims-label');
        if (dimsLbl) dimsLbl.textContent = `${dims.w}×${dims.h}mm (${dims.w * DOTS_PER_MM}×${dims.h * DOTS_PER_MM}px)`;

        const nav = document.getElementById('ps-preview-nav');
        const cntLbl = document.getElementById('ps-preview-count');
        let cnv = null;

        if (studioState.activeTab === 'designer') {
            ensureDesignerInitialized();
            cnv = renderFreeDesignerToCanvas203DPI(cfg, true);
            bindInteractiveCanvasPointerEvents(cnv);
            if (nav) nav.classList.add('hidden');
            const dCopies = Math.max(1, parseInt(document.getElementById('ps-des-copies')?.value) || 1);
            if (cntLbl) cntLbl.textContent = `${dCopies} ملصق حر`;
        } else if (studioState.activeTab === 'poultry') {
            const items = studioState.poultryItems.length ? studioState.poultryItems : [{ index: 1, netGrams: 1389, kiloPrice: 110, price: 153 }];
            const idx = Math.min(items.length - 1, Math.max(0, studioState.poultryPreviewIdx));
            cnv = window.renderSinglePoultryScaleTag203DPI(items[idx], items.length, cfg);
            const includeMaster = document.getElementById('ps-pb-master-summary')?.checked && items.length > 1;
            const totalCnt = (items.length * (parseInt(document.getElementById('ps-pb-copies')?.value) || 1)) + (includeMaster ? 1 : 0);
            if (cntLbl) cntLbl.textContent = `${totalCnt} تكت`;
            if (nav) {
                if (items.length > 1) {
                    nav.classList.remove('hidden');
                    nav.innerHTML = `
                        <button type="button" onclick="psStepPoultryPreview(-1)" class="px-2 py-0.5 bg-slate-700 rounded">◀ السابق</button>
                        <span class="text-amber-300">تكت #${idx + 1} من ${items.length} (${items[idx].netGrams} جم)</span>
                        <button type="button" onclick="psStepPoultryPreview(1)" class="px-2 py-0.5 bg-slate-700 rounded">التالي ▶</button>
                    `;
                } else nav.classList.add('hidden');
            }
        } else if (studioState.activeTab === 'freezer') {
            cnv = renderFreezerTagCanvas203DPI(cfg);
            const fCopies = Math.max(1, parseInt(document.getElementById('ps-fz-copies')?.value) || 1);
            if (cntLbl) cntLbl.textContent = `${fCopies} استيكر`;
            if (nav) nav.classList.add('hidden');
        } else {
            const orders = getActiveOrdersForPrinting();
            const sample = orders.length ? orders : [{
                id: 'SMAN2026', customerName: 'عميل سمان ههيا (نموذج)', customerPhone: '01208027294',
                zone: 'ههيا', customerAddress: 'شارع الجمهورية', orderDate: new Date().toLocaleDateString('ar-EG'),
                paymentMethod: 'cash', subtotal: 290, deliveryFee: 20, discount: 0, total: 310,
                items: [{ id: 'jumbo', name: 'طبق سمان جامبو', quantity: 2, price: 145 }]
            }];
            const idx = Math.min(sample.length - 1, Math.max(0, studioState.previewOrderIdx));
            const ord = sample[idx];
            const bags = Math.max(1, parseInt(studioState.orderBagsMap[ord.id]) || parseInt(ord._bagsCount) || 1);

            if (studioState.ordersPreviewMode === 'packing') {
                cnv = renderPackingSummaryCanvas203DPI(sample, cfg);
                if (cntLbl) cntLbl.textContent = '1 ملصق تجهيز';
                if (nav) nav.classList.add('hidden');
            } else if (studioState.ordersPreviewMode === 'manifest') {
                cnv = renderDriverManifestCanvas203DPI(sample, cfg);
                if (cntLbl) cntLbl.textContent = '1 كشف مندوب';
                if (nav) nav.classList.add('hidden');
            } else {
                cnv = window.renderWaybillToCanvas203DPI(ord, cfg, idx + 1, sample.length, 1, bags);
                const totalStickers = sample.reduce((s, o) => s + (parseInt(studioState.orderBagsMap[o.id]) || parseInt(o._bagsCount) || 1), 0);
                if (cntLbl) cntLbl.textContent = `${totalStickers} بوليصة`;
                if (nav) {
                    if (sample.length > 1) {
                        nav.classList.remove('hidden');
                        nav.innerHTML = `
                            <button type="button" onclick="psStepOrderPreview(-1)" class="px-2 py-0.5 bg-slate-700 rounded">◀ السابق</button>
                            <span class="text-amber-300">طلب ${idx + 1}/${sample.length}: ${escapeHtml(ord.customerName || '')}</span>
                            <button type="button" onclick="psStepOrderPreview(1)" class="px-2 py-0.5 bg-slate-700 rounded">التالي ▶</button>
                        `;
                    } else nav.classList.add('hidden');
                }
            }
        }

        if (cnv) {
            cnv.style.maxWidth = '100%';
            cnv.style.maxHeight = '380px';
            cnv.style.width = 'auto';
            cnv.style.height = 'auto';
            cnv.style.borderRadius = '8px';
            cnv.style.boxShadow = '0 10px 25px rgba(0,0,0,0.28)';
            stage.innerHTML = '';
            stage.appendChild(cnv);
        }
    };

    window.psStepPoultryPreview = function (delta) {
        const len = studioState.poultryItems.length;
        if (len <= 1) return;
        studioState.poultryPreviewIdx = (studioState.poultryPreviewIdx + delta + len) % len;
        renderPoultryChipsAndStats();
        refreshStudioPreviewStage();
    };
    window.psStepOrderPreview = function (delta) {
        const len = getActiveOrdersForPrinting().length;
        if (len <= 1) return;
        studioState.previewOrderIdx = (studioState.previewOrderIdx + delta + len) % len;
        refreshStudioPreviewStage();
    };

    window.psExecutePrint = async function (channel) {
        const cfg = window.getWaybillConfig();
        const canvases = buildActiveTabCanvases(cfg);
        if (!canvases.length) {
            return notifyPrinterToast(studioState.activeTab === 'orders' ? 'اختر طلباً واحداً على الأقل من القائمة!' : 'لا توجد ملصقات جاهزة للطباعة!');
        }
        if (channel === 'bluetooth') return sendCanvasesViaBluetooth(canvases, cfg);
        if (channel === 'usb') return sendCanvasesViaUSB(canvases, cfg);
        return sendCanvasesViaSpooler(canvases, cfg);
    };

    window.psDownloadCurrentPNG = function () {
        const cfg = window.getWaybillConfig();
        const canvases = buildActiveTabCanvases(cfg);
        if (!canvases.length) return notifyPrinterToast('لا يوجد ملصق لتحميله');
        const link = document.createElement('a');
        link.download = `sman-hehya-label-${Date.now()}.png`;
        link.href = canvases[0].toDataURL('image/png');
        link.click();
        notifyPrinterToast('🖼️ تم حفظ صورة الملصق بجودة 203 DPI');
    };

    // =========================================================================
    // 14. ربط وتوافق كامل 100% مع كل أزرار الطباعة في الـ CRM القديم
    // =========================================================================
    function openPrinterPageWithTab(subTab, ordersQueue = null) {
        studioState.activeTab = subTab || 'designer';
        if (Array.isArray(ordersQueue) && ordersQueue.length > 0) {
            studioState.selectedOrderIds.clear();
            window.deliPrinterConnection.lastOrdersQueue = ordersQueue.map(o => ({ ...o }));
            ordersQueue.forEach(o => { if (o && o.id) studioState.selectedOrderIds.add(o.id); });
            studioState.previewOrderIdx = 0;
            studioState.ordersPreviewMode = 'waybill';
        }
        if (typeof window.switchTab === 'function') {
            const btn = document.querySelector(`#sidebar button[onclick*="switchTab('printer'"]`);
            window.switchTab('printer', btn);
        } else {
            window.renderPrinterStudioPage();
        }
    }

    window.openWaybillSettingsModal = function (ordersQueue = null) {
        openPrinterPageWithTab(Array.isArray(ordersQueue) && ordersQueue.length ? 'orders' : 'designer', ordersQueue);
    };
    window.previewWaybillSample = () => openPrinterPageWithTab('orders');
    window.previewSampleWaybill = window.previewWaybillSample;

    window.saveWaybillSettings = function () {
        persistWaybillConfig(window.getWaybillConfig());
        notifyPrinterToast('✅ تم حفظ إعدادات طابعة Deli E750W بنجاح!');
    };

    window.printDirectViaNativeBluetooth = async function (ordersQueue = null, customCfg = null) {
        const cfg = customCfg || window.getWaybillConfig();
        if (Array.isArray(ordersQueue) && ordersQueue.length > 0) {
            const canvases = [];
            ordersQueue.forEach((o, i) => {
                const bags = Math.max(1, parseInt(o._bagsCount) || parseInt(studioState.orderBagsMap[o.id]) || 1);
                for (let b = 1; b <= bags; b++) {
                    canvases.push(window.renderWaybillToCanvas203DPI(o, cfg, i + 1, ordersQueue.length, b, bags));
                }
            });
            return sendCanvasesViaBluetooth(canvases, cfg);
        }
        return window.psExecutePrint('bluetooth');
    };

    window.printDirectViaNativeUSB = () => window.psExecutePrint('usb');
    window.printViaInPageThermalFrame = function (ordersToPrint, customCfg = null) {
        const cfg = customCfg || window.getWaybillConfig();
        if (Array.isArray(ordersToPrint) && ordersToPrint.length > 0) {
            const canvases = ordersToPrint.map((o, i) => window.renderWaybillToCanvas203DPI(o, cfg, i + 1, ordersToPrint.length, 1, 1));
            return sendCanvasesViaSpooler(canvases, cfg);
        }
        return window.psExecutePrint('spooler');
    };

    window.printSingleOrderWaybill = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return notifyPrinterToast('⚠️ لم يتم العثور على الطلب!');
        const cfg = window.getWaybillConfig();
        if (cfg.instantPrint) {
            return window.printDirectViaNativeBluetooth([order], cfg);
        }
        openPrinterPageWithTab('orders', [order]);
    };

    window.bulkPrintWaybills = function () {
        const checkedBoxes = Array.from(document.querySelectorAll('.bulk-order-cb:checked'));
        if (!checkedBoxes.length) return alert('يرجى تحديد طلب واحد على الأقل لطباعة البوليصة!');
        const rawList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        let ordersToPrint = checkedBoxes.map(cb => rawList.find(o => o && o.id === cb.value)).filter(Boolean);
        if (!ordersToPrint.length) return;

        const cfg = window.getWaybillConfig();
        if (cfg.reversePrintOrder && ordersToPrint.length > 1) ordersToPrint = ordersToPrint.slice().reverse();
        if (cfg.instantPrint) return window.printDirectViaNativeBluetooth(ordersToPrint, cfg);
        openPrinterPageWithTab('orders', ordersToPrint);
    };
    window.printSelectedOrdersWaybills = window.bulkPrintWaybills;
    window.printPoultryBatchSequentiallyBluetooth = () => window.psExecutePrint('bluetooth');

    // زر الطابعة السريع في الهيدر
    function injectHeaderPrinterQuickBtn() {
        const pulseBar = document.getElementById('lc-header-pulse-bar');
        if (pulseBar && !document.getElementById('lc-hdr-printer-btn')) {
            const prnBtn = document.createElement('button');
            prnBtn.id = 'lc-hdr-printer-btn';
            prnBtn.onclick = () => openPrinterPageWithTab(studioState.activeTab || 'designer');
            prnBtn.title = 'استوديو الطباعة الحرارية (Deli E750W)';
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

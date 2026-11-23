// =========================================================================
// 🐣 مركز القيادة الشامل للدفعات، المسارات المستقلة، الذبح، والتوزيع الذكي (www/batches.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة التنفيذية (3 Independent Tracks)
// =========================================================================

(function () {
    // 1. حالة فلترة نافذة كشف تسليمات الدفعة
    window.batchManifestState = {
        activeBatchId: null,
        zoneFilter: 'all',
        statusFilter: 'all_valid'
    };

    // 2. حالة واجهة مركز الدفعات (التركيز على دفعة واحدة + 3 تبويبات داخلية + وضع مقارنة الكل)
    window.batchUIState = {
        viewMode: 'focus',          // 'focus' (التركيز على دفعة واحدة) | 'compare_all' (مقارنة سريعة لكل الدفعات)
        focusedBatchId: null,       // معرف الدفعة المفتوحة حالياً
        activeInnerTab: 'stock',    // 'stock' | 'orders_zones' | 'lifecycle'
        showZeroProducts: {}        // { [bId]: true/false }
    };

    function escapeJsAttr(str) {
        return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    function escapeHtmlSafe(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 🧭 محرك تصنيف المسارات الـ 3 المستقلة (متوافق 100% مع الدفعات القديمة بدون تعديلها)
    // =========================================================================
    window.getBatchTrackType = function (batch) {
        if (!batch) return 'quail';
        if (batch.batchType === 'quail' || batch.batchType === 'chicks' || batch.batchType === 'weight') {
            return batch.batchType;
        }
        const n = String(batch.name || '').toLowerCase();
        if (n.includes('كتكوت') || n.includes('كتاكيت') || n.includes('عمر يوم') || n.includes('تفريخ') || n.includes('فقس')) {
            return 'chicks';
        }
        if (n.includes('فراخ') || n.includes('تسمين') || n.includes('رومي') || n.includes('بط')) {
            return 'weight';
        }
        return 'quail';
    };

    window.getProductTrackType = function (pId, pObj) {
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const p = pObj || prodsObj[pId];
        if (!p) return 'quail';

        if (p.categoryType === 'custom') return 'immediate';
        if (p.categoryType === 'weight' || p.isWeightBased) return 'weight';
        if (p.categoryType === 'quail') return 'quail';

        const safeId = String(pId || '').toLowerCase();
        const safeName = String(p.name || '').toLowerCase();

        if (safeId === 'chicks' || safeName.includes('كتكوت') || safeName.includes('كتاكيت') || safeName.includes('عمر يوم') || safeName.includes('عمر')) {
            return 'chicks';
        }
        if (p.categoryType === 'eggs_chicks' || p.isExtra || safeId === 'eggs' || safeName.includes('بيض')) {
            return 'immediate';
        }
        return 'quail';
    };


    function getTrackMeta(trackType) {
        if (trackType === 'chicks') {
            return {
                key: 'chicks',
                icon: '🐣',
                label: 'دورة تفريخ (عمر يوم)',
                shortLabel: 'تفريخ عمر يوم',
                unitLabel: 'كتكوت',
                badgeCls: 'bg-amber-100 text-amber-900 border-amber-300',
                hasBirdsPairConversion: false
            };
        }
        if (trackType === 'weight') {
            return {
                key: 'weight',
                icon: '⚖️',
                label: 'دورة فراخ / رومي (بالوزن)',
                shortLabel: 'فراخ / رومي',
                unitLabel: 'طائر',
                badgeCls: 'bg-indigo-100 text-indigo-900 border-indigo-300',
                hasBirdsPairConversion: false
            };
        }
        return {
            key: 'quail',
            icon: '🥩',
            label: 'دورة سمان مذبوح',
            shortLabel: 'سمان مذبوح',
            unitLabel: 'جوز',
            badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            hasBirdsPairConversion: true
        };
    }

    function doesProductMatchBatchTrack(pId, trackType) {
        const pTrack = window.getProductTrackType(pId);
        return pTrack === trackType;
    }

    // تصنيف الصنف (سمان لحم أساسي مقابل إضافات كالبيض والكتاكيت)
    function isMainQuailProduct(pId) {
        return window.getProductTrackType(pId) === 'quail';
    }

    // ترتيب الأصناف بنفس الترتيب الموحد في النظام (سوبر -> جامبو -> سبشيال -> سوبر سبشيال -> بيض وكتاكيت -> وزن)
    function getBatchProductRank(pId, p) {
        if (typeof window.getOrderProductCategoryAndRank === 'function') {
            const meta = window.getOrderProductCategoryAndRank(pId, p);
            const groupOffset = meta.group === 'quail' ? 0 : (meta.group === 'eggs_chicks' ? 100 : 200);
            return groupOffset + meta.rank;
        }
        const safeId = String(pId || '').toLowerCase();
        const safeName = String(p?.name || '').toLowerCase();
        if (p && p.isWeightBased) return 250;
        if (safeId === 'eggs' || safeName.includes('بيض')) return 110;
        if (safeId === 'chicks' || safeName.includes('كتكوت') || safeName.includes('كتاكيت')) return 120;
        if (safeId === 'super' || (safeName.includes('سوبر') && !safeName.includes('سبشيال') && !safeName.includes('اسبيشيال'))) return 10;
        if (safeId === 'jumbo' || safeName.includes('جامبو')) return 20;
        if (safeId === 'special' || ((safeName.includes('سبشيال') || safeName.includes('اسبيشيال')) && !safeName.includes('سوبر'))) return 30;
        if (safeId === 'superspecial' || (safeName.includes('سوبر') && (safeName.includes('سبشيال') || safeName.includes('اسبيشيال')))) return 40;
        return 50;
    }

    function getProdPrice(pId) {
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        return Number(pricesObj[pId] || (prodsObj[pId] ? prodsObj[pId].basePrice : 0)) || 0;
    }

    function getOrderNetProductsTotal(o) {
        if (!o) return 0;
        if (typeof window.getAccurateOrderFinancials === 'function') {
            return window.getAccurateOrderFinancials(o).total;
        }
        const del = Number(o.deliveryFee) || 0;
        const disc = Number(o.discount) || 0;
        const sub = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - del + disc);
        return Math.max(0, Math.round(sub - disc));
    }

    function doesOrderBelongToBatch(o, bId, bName) {
        if (!o || o.status === 'trash') return false;
        if (o.batchId && o.batchId === bId) return true;
        const cleanBName = (bName || '').trim();
        if (cleanBName && cleanBName !== 'undefined') {
            if (o.batchName && o.batchName.trim() === cleanBName) return true;
            if (typeof window.resolveOrderBatchName === 'function' && window.resolveOrderBatchName(o) === cleanBName) return true;
        }
        return false;
    }

    async function askConfirmSafe(msg, opts) {
        if (typeof window.execConfirm === 'function') {
            return await window.execConfirm(msg, opts || {});
        }
        return confirm(msg);
    }

    async function askPromptSafe(msg, defVal, opts) {
        if (typeof window.execPrompt === 'function') {
            return await window.execPrompt(msg, defVal, opts || {});
        }
        return prompt(msg, defVal);
    }

    // =========================================================================
    // 📊 1. محرك التحليل اللحظي الشامل للدفعة (Batch Deep Intelligence)
    // =========================================================================
    window.getBatchDeepMetrics = function (bId, bName) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let totalOrders = 0;
        let completedOrders = 0;
        let activeOrders = 0;
        let canceledOrders = 0;

        const statusCounts = { new: 0, processing: 0, dispatched: 0, deferred: 0, no_answer: 0, completed: 0, canceled: 0 };
        const zonesMap = {};
        const realBookedByProd = {};
        const realCompletedByProd = {};
        const realBookedByName = {};

        let totalRevenue = 0;
        let netProductsRevenue = 0;
        let collectedNetRevenue = 0;
        let pendingNetRevenue = 0;
        let collectedGrossRevenue = 0;
        let pendingGrossRevenue = 0;
        let totalDiscounts = 0;
        let totalDebt = 0;

        const batchOrdersList = [];

        ordersList.forEach(o => {
            if (!doesOrderBelongToBatch(o, bId, bName)) return;
            batchOrdersList.push(o);

            const st = o.status || 'new';
            if (statusCounts[st] !== undefined) statusCounts[st]++;

            if (st === 'canceled') {
                canceledOrders++;
                return;
            }

            totalOrders++;
            const oGross = Number(o.total) || 0;
            const oNet = getOrderNetProductsTotal(o);
            const oDisc = Number(o.discount) || 0;
            const oDebt = Number(o.debt) || 0;

            totalRevenue += oGross;
            netProductsRevenue += oNet;
            totalDiscounts += oDisc;
            if (oDebt > 0) totalDebt += oDebt;

            if (st === 'completed') {
                completedOrders++;
                collectedNetRevenue += oNet;
                collectedGrossRevenue += oGross;
            } else {
                activeOrders++;
                pendingNetRevenue += oNet;
                pendingGrossRevenue += oGross;
            }

            const zName = (o.zone || 'غير محدد').trim();
            if (!zonesMap[zName]) zonesMap[zName] = { count: 0, revenue: 0, netRevenue: 0, activeCount: 0 };
            zonesMap[zName].count++;
            zonesMap[zName].revenue += oGross;
            zonesMap[zName].netRevenue += oNet;
            if (st !== 'completed') zonesMap[zName].activeCount++;

            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const q = Number(i.quantity) || 0;
                    let targetPid = i.id;
                    if (!targetPid) {
                        targetPid = Object.keys(prodsObj).find(k => prodsObj[k]?.name === i.name);
                    }
                    if (targetPid) {
                        const addQty = (prodsObj[targetPid]?.isWeightBased && Number(i.birdsCount) > 0) ? Number(i.birdsCount) : q;
                        realBookedByProd[targetPid] = (realBookedByProd[targetPid] || 0) + addQty;
                        if (st === 'completed') {
                            realCompletedByProd[targetPid] = (realCompletedByProd[targetPid] || 0) + addQty;
                        }
                    }
                    const iName = i.name || 'صنف';
                    realBookedByName[iName] = (realBookedByName[iName] || 0) + q;
                });
            }
        });

        return {
            totalOrders,
            completedOrders,
            activeOrders,
            canceledOrders,
            statusCounts,
            zonesMap,
            realBookedByProd,
            realCompletedByProd,
            realBookedByName,
            totalRevenue,
            netProductsRevenue,
            collectedRevenue: collectedNetRevenue,
            pendingRevenue: pendingNetRevenue,
            collectedGrossRevenue,
            pendingGrossRevenue,
            totalDiscounts,
            totalDebt,
            batchOrdersList
        };
    };

    function toWesternDigitsCRM(str) {
        return String(str || '')
            .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0));
    }

    function parseDateFromBatchNameCRM(batchName, fallbackDate) {
        if (!batchName) return null;
        const norm = toWesternDigitsCRM(batchName);
        const m = norm.match(/(?:^|[^\d])(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?(?!\d)/);
        if (!m) return null;

        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const yRaw = m[3] ? parseInt(m[3], 10) : null;
        const now = new Date();
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const makeValidDate = (dayNum, monthNum, yearOpt) => {
            if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
            if (yearOpt !== null && !isNaN(yearOpt)) {
                const yr = yearOpt < 100 ? 2000 + yearOpt : yearOpt;
                const d = new Date(yr, monthNum - 1, dayNum);
                return (d.getMonth() === monthNum - 1 && d.getDate() === dayNum) ? d : null;
            }
            const cands = [];
            [todayMid.getFullYear() - 1, todayMid.getFullYear(), todayMid.getFullYear() + 1].forEach(yr => {
                const d = new Date(yr, monthNum - 1, dayNum);
                if (d.getMonth() === monthNum - 1 && d.getDate() === dayNum) {
                    const diff = Math.round((d.getTime() - todayMid.getTime()) / 86400000);
                    const score = diff >= -45 ? Math.abs(diff) : Math.abs(diff) + 400;
                    cands.push({ score, d });
                }
            });
            cands.sort((x, y) => x.score - y.score);
            return cands[0] ? cands[0].d : null;
        };

        const candDM = makeValidDate(a, b, yRaw);
        const candMD = makeValidDate(b, a, yRaw);
        if (candDM && !candMD) return candDM;
        if (candMD && !candDM) return candMD;
        if (!candDM && !candMD) return null;

        const anchor = (fallbackDate instanceof Date && !isNaN(fallbackDate.getTime())) ? fallbackDate : todayMid;
        const distDM = Math.abs(Math.round((candDM.getTime() - anchor.getTime()) / 86400000));
        const distMD = Math.abs(Math.round((candMD.getTime() - anchor.getTime()) / 86400000));
        return (distMD + 45 < distDM) ? candMD : candDM;
    }

    function formatArabicRangeCRM(startD, endD) {
        if (!startD || isNaN(startD.getTime())) return 'غير محدد بعد';
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const d1 = startD.getDate();
        const m1 = months[startD.getMonth()];
        if (endD && !isNaN(endD.getTime()) && (endD.getDate() !== d1 || endD.getMonth() !== startD.getMonth())) {
            const d2 = endD.getDate();
            const m2 = months[endD.getMonth()];
            return m1 === m2 ? `من ${d1} إلى ${d2} ${m1}` : `من ${d1} ${m1} إلى ${d2} ${m2}`;
        }
        return `بداية من ${d1} ${m1}`;
    }

    function resolveBatchDeliveryWindowCRM(b) {
        if (!b) return { startDate: null, endDate: null, phrase: 'غير محدد بعد', minAge: 38, maxAge: 45 };
        const minAge = Number(b.slaughterAgeMin) || 38;
        const maxAge = Math.max(Number(b.slaughterAgeMax) || Number(b.slaughterAge) || 45, minAge + 5);

        const sStored = b.deliveryStart ? new Date(b.deliveryStart) : null;
        const validStart = (sStored && !isNaN(sStored.getTime())) ? sStored : null;
        const eStored = b.deliveryEnd ? new Date(b.deliveryEnd) : null;
        const validEnd = (eStored && !isNaN(eStored.getTime())) ? eStored : null;

        const nameDate = parseDateFromBatchNameCRM(b.name, validStart);
        if (nameDate) {
            const endPlus2 = new Date(nameDate.getFullYear(), nameDate.getMonth(), nameDate.getDate() + 2);
            return { startDate: nameDate, endDate: endPlus2, phrase: formatArabicRangeCRM(nameDate, endPlus2), minAge, maxAge };
        }

        if (validStart) {
            const effEnd = (validEnd && validEnd.getTime() > validStart.getTime())
                ? validEnd
                : new Date(validStart.getFullYear(), validStart.getMonth(), validStart.getDate() + 2);
            return { startDate: validStart, endDate: effEnd, phrase: formatArabicRangeCRM(validStart, effEnd), minAge, maxAge };
        }

        if (b.hatchDate) {
            const hMs = Number(b.hatchDate);
            if (!isNaN(hMs) && hMs > 0) {
                const sD = new Date(hMs + minAge * 86400000);
                const eD = new Date(hMs + maxAge * 86400000);
                return { startDate: sD, endDate: eD, phrase: formatArabicRangeCRM(sD, eD), minAge, maxAge };
            }
        }

        return { startDate: null, endDate: null, phrase: 'غير محدد بعد', minAge, maxAge };
    }

    function getBatchBioStatus(b, metrics) {
        if (!b) return { ageDays: null, minAge: 38, targetAge: 45, remainingDays: null, deliveryPhrase: 'غير محدد بعد', stageLabel: 'غير محدد', stageColor: 'bg-slate-100 text-slate-600 border-slate-200', autoMsg: '' };

        const trackType = window.getBatchTrackType(b);
        const win = resolveBatchDeliveryWindowCRM(b);
        const minAge = win.minAge;
        const maxAge = win.maxAge;
        const deliveryPhrase = win.phrase;
        const deliveryTextPart = deliveryPhrase !== 'غير محدد بعد' ? ` — التسليم المتوقع (${deliveryPhrase})` : '';

        let ageDays = null;
        let remainingDays = null;
        if (b.hatchDate) {
            ageDays = Math.max(0, Math.floor((Date.now() - Number(b.hatchDate)) / 86400000));
            remainingDays = minAge - ageDays;
        }

        const activeOrdersCount = metrics ? (Number(metrics.activeOrders) || 0) : 0;
        const completedOrdersCount = metrics ? (Number(metrics.completedOrders) || 0) : 0;
        const isFutureDelivery = Boolean(win.startDate && win.startDate.getTime() > Date.now() + 86400000);

        let stageLabel = '📋 جاهزة للتشغيل';
        let stageColor = 'bg-slate-100 text-slate-700 border-slate-200';
        let autoMsg = '';

        if (b.isVisible === false) {
            stageLabel = '🚫 مخفية عن المتجر';
            stageColor = 'bg-red-50 text-red-600 border-red-200';
            autoMsg = 'هذه الدفعة مخفية حالياً ولا تظهر للعملاء في المتجر.';
        } else if (trackType === 'chicks') {
            if (!b.isOpen) {
                stageLabel = '🔒 اكتمل حجز التفريخ';
                stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
                autoMsg = `🐣 اكتمل حجز دورة الكتاكيت${deliveryTextPart} وهنتواصل معاك قبلها للتأكيد.`;
            } else {
                stageLabel = '🐣 حجز تفريخ مفتوح';
                stageColor = 'bg-amber-50 text-amber-900 border-amber-300';
                autoMsg = `🐣 متاح حجز كتاكيت عمر يوم في هذه الدورة${deliveryTextPart} وهنتواصل معاك قبلها للتأكيد.`;
            }
        } else if (trackType === 'weight') {
            if (b.slaughteredAt && !b.isOpen) {
                stageLabel = '⚖️ تم التجهيز والوزن';
                stageColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                autoMsg = '⚖️ تم تجهيز الأوزان الطازجة ومتاحة للطلب المباشر بالجرام.';
            } else if (!b.isOpen) {
                stageLabel = '🔒 دورة مغلقة';
                stageColor = 'bg-slate-100 text-slate-700 border-slate-200';
                autoMsg = 'تم إغلاق الحجز على هذه الدورة حالياً.';
            } else {
                stageLabel = '⚖️ دورة بالوزن متاحة';
                stageColor = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                autoMsg = '⚖️ متاح الطلب بالوزن الطازج مباشرة.';
            }
        } else if (b.slaughteredAt && !b.isOpen && !isFutureDelivery) {
            const daysSinceSlaughter = (Date.now() - Number(b.slaughteredAt)) / 86400000;
            if (activeOrdersCount === 0 && completedOrdersCount > 0 && daysSinceSlaughter >= 2) {
                stageLabel = '✅ تم التسليم بالكامل';
                stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                autoMsg = '✅ تم تسليم هذه الدفعة للعملاء بالكامل. بالهنا والشفا!';
            } else {
                stageLabel = '🛵 تم الذبح وجاري التوزيع';
                stageColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                autoMsg = `🛵 تم الذبح الطازج وجاري التوزيع${activeOrdersCount > 0 ? ` (${activeOrdersCount} طلب قيد التسليم)` : ''} — هنتواصل معاك قبل تحرك المندوب!`;
            }
        } else if (!b.isOpen) {
            stageLabel = '🔒 مكتملة الحجز';
            stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
            autoMsg = `✅ اكتمل الحجز على الدفعة${deliveryTextPart} — جاري التجهيز وهنتواصل معاك قبلها للتأكيد وتحديد الوقت المناسب.`;
        } else if (ageDays !== null) {
            if (ageDays > maxAge) {
                stageLabel = `🔪 جاهز للذبح الآن (${ageDays}ي)`;
                stageColor = 'bg-rose-50 text-rose-700 border-rose-200';
                autoMsg = `🔪 السمان جاهز فريش للذبح والتسليم${deliveryTextPart} — هنتواصل معاك قبلها للتأكيد قبل تحرك المندوب!`;
            } else if (ageDays >= minAge) {
                stageLabel = `🔪 فترة الذبح الآمنة (${ageDays} / ${minAge}–${maxAge}ي)`;
                stageColor = 'bg-emerald-50 text-emerald-800 border-emerald-300';
                autoMsg = `🔪 الدفعة الآن في فترة الجاهزية والذبح الطازج الآمنة (${minAge}–${maxAge} يوم)${deliveryTextPart} — وهنتواصل معاك قبلها للتأكيد.`;
            } else if (remainingDays <= 5) {
                stageLabel = `⏳ قرب يجهز (${ageDays}ي • الذبح ${minAge}–${maxAge}ي)`;
                stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
                autoMsg = `⏳ الدفعة بتكمل أوزانها النهائية${deliveryTextPart} — وهنتواصل معاك قبلها للتأكيد قبل الذبح والتوصيل.`;
            } else if (ageDays <= 15) {
                stageLabel = `🐣 تحضين (${ageDays} يوم)`;
                stageColor = 'bg-sky-50 text-sky-700 border-sky-200';
                autoMsg = `🐣 الدفعة في مرحلة التحضين والرعاية${deliveryTextPart} — وهنتواصل معاك قبلها للتأكيد.`;
            } else {
                stageLabel = `📈 تسمين (${ageDays}ي • الذبح ${minAge}–${maxAge}ي)`;
                stageColor = 'bg-purple-50 text-purple-700 border-purple-200';
                autoMsg = `📈 السمان في مرحلة التسمين وبناء اللحم${deliveryTextPart} — وهنتواصل معاك قبلها للتأكيد.`;
            }
        } else {
            stageLabel = '🟢 مفتوحة للحجز';
            stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            autoMsg = `🟢 متاح الحجز الآن${deliveryTextPart} — وهنتواصل معاك قبلها للتأكيد قبل الذبح والتوصيل 🌿`;
        }

        return { ageDays, minAge, targetAge: maxAge, remainingDays, deliveryPhrase, stageLabel, stageColor, autoMsg };
    }


    // دوال التنقل وتغيير نوع المسار داخل مركز قيادة الدفعات
    window.selectFocusedBatch = function (bId) {
        window.batchUIState.viewMode = 'focus';
        window.batchUIState.focusedBatchId = bId;
        window.renderBatchesUI();
    };

    window.setBatchesViewMode = function (mode) {
        window.batchUIState.viewMode = mode;
        window.renderBatchesUI();
    };

    window.setBatchInnerTab = function (tabKey) {
        window.batchUIState.activeInnerTab = tabKey;
        window.renderBatchesUI();
    };

    window.toggleBatchZeroProducts = function (bId) {
        window.batchUIState.showZeroProducts[bId] = !window.batchUIState.showZeroProducts[bId];
        window.renderBatchesUI();
    };

    window.updateBatchTrackType = async function (bId, newType) {
        if (!storeBatches[bId] || !['quail', 'chicks', 'weight'].includes(newType)) return;
        storeBatches[bId].batchType = newType;
        window.renderBatchesUI();
        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: { batchType: newType }
            }, { merge: true });
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            const tMeta = getTrackMeta(newType);
            if (typeof window.showToast === 'function') {
                window.showToast(`${tMeta.icon} تم ضبط مسار الدفعة إلى: ${tMeta.label}`);
            }
        } catch (e) {
            console.error('Update batch track type error:', e);
        }
    };
    // 🔔 بوابة موافقة المدير على الدفعات الواردة من المزرعة/المفرخة قبل ظهورها للعملاء
    window.getPendingFarmBatches = function () {
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        return Object.keys(batchesObj)
            .filter(bId => batchesObj[bId] && batchesObj[bId].pendingApproval === true)
            .map(bId => ({ id: bId, ...batchesObj[bId] }))
            .sort((a, b) => (Number(b.farmSyncedAt) || 0) - (Number(a.farmSyncedAt) || 0));
    };

    window.approveFarmBatch = async function (bId, publishToStore = true) {
        if (!storeBatches[bId]) return;
        const b = storeBatches[bId];
        const updates = {
            pendingApproval: false,
            isVisible: Boolean(publishToStore),
            isOpen: Boolean(publishToStore),
            approvedAt: Date.now()
        };
        Object.assign(b, updates);

        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: updates
            }, { merge: true });

            window.batchUIState.viewMode = 'focus';
            window.batchUIState.focusedBatchId = bId;
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            if (typeof window.showToast === 'function') {
                window.showToast(publishToStore
                    ? `✅ تم اعتماد ونشر (${b.name}) على موقع العملاء بنجاح!`
                    : `👁️ تم اعتماد (${b.name}) وإبقائها مخفية للمراجعة.`);
            }
        } catch (e) {
            console.error('Approve farm batch error:', e);
            alert('حدث خطأ أثناء اعتماد الدفعة!');
        }
    };

    function buildPendingFarmApprovalCardHtml() {
        const pendingList = window.getPendingFarmBatches();
        if (pendingList.length === 0) return '';

        const rowsHtml = pendingList.map(b => {
            const trackType = window.getBatchTrackType(b);
            const tMeta = getTrackMeta(trackType);
            const stageTxt = b.stage === 'rearing' ? 'عنبر التربية' : 'المفرخة (الماكينة)';
            const statsParts = [];
            if (Number(b.initialEggs) > 0) statsParts.push(`🥚 ${b.initialEggs} بيضة`);
            if (Number(b.hatchedChicks) > 0) statsParts.push(`🐣 ${b.hatchedChicks} كتكوت`);
            if (Number(b.expectedPairs) > 0) statsParts.push(`🥩 متوقع ~${b.expectedPairs} جوز`);

            return `
                <div class="bg-white/10 border border-amber-400/30 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="space-y-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-lg text-[10px] font-black">بانتظار إذنك</span>
                            <span class="font-black text-white text-sm">${escapeHtmlSafe(b.name || 'دفعة جديدة')}</span>
                            <span class="text-[10px] font-bold text-emerald-200 bg-black/25 px-2 py-0.5 rounded-lg">${tMeta.icon} ${stageTxt}</span>
                        </div>
                        <p class="text-[11px] font-bold text-amber-100/90">${statsParts.join(' • ') || 'دفعة جديدة واردة من سيستم المزرعة'}</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button type="button" onclick="approveFarmBatch('${b.id}', true)" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-2 rounded-xl text-[11px] font-black shadow-md transition-all active:scale-95 flex items-center gap-1">
                            <i class="fa-solid fa-check-double"></i> اعتماد ونشر بالموقع
                        </button>
                        <button type="button" onclick="approveFarmBatch('${b.id}', false)" class="bg-white/15 hover:bg-white/25 text-white border border-white/20 px-2.5 py-2 rounded-xl text-[11px] font-black transition-all">
                            اعتماد (مخفية)
                        </button>
                        <button type="button" onclick="deleteBatchUI('${b.id}')" class="bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-400/30 w-9 h-9 rounded-xl flex items-center justify-center transition-all" title="حذف الدفعة">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="w-full max-w-full overflow-hidden bg-gradient-to-l from-[#042f2e] via-[#064e3b] to-[#0f172a] border-2 border-amber-400/70 rounded-[1.5rem] p-4 shadow-xl space-y-3">
                <div class="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-base shadow-md shrink-0">
                            <i class="fa-solid fa-bell fa-shake"></i>
                        </span>
                        <div>
                            <h4 class="text-sm font-black text-white">دفعات واردة من المزرعة بانتظار موافقتك (${pendingList.length})</h4>
                            <p class="text-[10px] font-bold text-amber-200/90">هذه الدفعات مخفية تماماً عن موقع العملاء ولن تظهر إلا بعد ضغطك على «اعتماد ونشر».</p>
                        </div>
                    </div>
                </div>
                <div class="space-y-2">${rowsHtml}</div>
            </div>
        `;
    }

    window.toggleBatchBooleanFlag = async function (bId, field, checkedVal) {
        if (!storeBatches[bId]) return;
        storeBatches[bId][field] = Boolean(checkedVal);
        window.renderBatchesUI();
        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.${field}`]: Boolean(checkedVal)
            });
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.showToast === 'function') {
                if (field === 'isOpen') {
                    window.showToast(checkedVal ? '🟢 تم فتح الحجز على الدفعة' : '🔒 تم إغلاق الحجز على الدفعة');
                } else {
                    window.showToast(checkedVal ? '👁️ الدفعة ظاهرة الآن في المتجر' : '🚫 تم إخفاء الدفعة من المتجر');
                }
            }
        } catch (e) {
            console.error('Toggle batch flag error:', e);
        }
    };

    // حساب سقف الدفعة الكلي حسب مسارها (جوز وفردة للسمان، كتكوت للتفريخ، طائر للوزن)
    window.getBatchCeilingAndRemaining = function (bId) {
        const b = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches[bId] : null;
        if (!b) {
            return { ceilingPairs: 0, ceilingBirds: 0, bookedPairs: 0, bookedBirds: 0, remainingPairs: 0, remainingBirds: 0, allocatedPairs: 0, trackType: 'quail', unitLabel: 'جوز' };
        }

        const trackType = window.getBatchTrackType(b);
        const tMeta = getTrackMeta(trackType);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const metrics = window.getBatchDeepMetrics(bId, b.name);

        let allocatedTrackUnits = 0;
        let bookedTrackUnits = 0;

        Object.keys(prodsObj).forEach(pId => {
            if (!prodsObj[pId]) return;
            if (doesProductMatchBatchTrack(pId, trackType)) {
                allocatedTrackUnits += (Number(b.stock?.[pId]) || 0);
                const savedB = Number(b.booked?.[pId]) || 0;
                const liveB = metrics.realBookedByProd[pId] || 0;
                bookedTrackUnits += ((metrics.totalOrders > 0 || savedB === 0) ? liveB : savedB);
            }
        });

        const explicitUnits = Number(b.actualPairs);
        const publicUnits = Number(b.publicPairs);

        let effectiveCeiling = 0;
        if (!isNaN(explicitUnits) && explicitUnits > 0) {
            effectiveCeiling = explicitUnits;
        } else if (allocatedTrackUnits > 0) {
            effectiveCeiling = allocatedTrackUnits;
        } else if (!isNaN(publicUnits) && publicUnits > 0) {
            effectiveCeiling = publicUnits;
        }

        const remainingUnits = Number((effectiveCeiling - bookedTrackUnits).toFixed(1));
        const birdsMult = tMeta.hasBirdsPairConversion ? 2 : 1;

        return {
            trackType: trackType,
            unitLabel: tMeta.unitLabel,
            ceilingPairs: effectiveCeiling,
            ceilingBirds: Math.round(effectiveCeiling * birdsMult),
            allocatedPairs: allocatedTrackUnits,
            bookedPairs: Number(bookedTrackUnits.toFixed(1)),
            bookedBirds: Math.round(bookedTrackUnits * birdsMult),
            remainingPairs: remainingUnits,
            remainingBirds: Math.round(remainingUnits * birdsMult)
        };
    };

    // تعديل سقف الدفعة الكلي مباشرة وحفظه مع مزامنة الخانات الفرعية لنفس المسار فقط
    window.updateBatchTotalPairsCeiling = async function (bId, val) {
        if (!storeBatches[bId]) return;
        const b = storeBatches[bId];
        const trackType = window.getBatchTrackType(b);
        const tMeta = getTrackMeta(trackType);
        const units = Math.max(0, parseInt(val) || 0);

        b.actualPairs = units;
        b.publicPairs = units;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        let oldAllocatedSum = 0;
        const trackIds = [];
        Object.keys(prodsObj).forEach(pId => {
            if (prodsObj[pId] && doesProductMatchBatchTrack(pId, trackType)) {
                trackIds.push(pId);
                oldAllocatedSum += (Number(b.stock?.[pId]) || 0);
            }
        });

        // إذا كان المسار به صنف واحد فقط (مثل الكتاكيت عمر يوم)، نضبط خانته تلقائياً بدون إزعاج
        if (trackIds.length === 1) {
            if (!b.stock) b.stock = {};
            b.stock[trackIds[0]] = units;
        } else if (units > 0 && oldAllocatedSum > 0 && oldAllocatedSum !== units) {
            const birdsTxt = tMeta.hasBirdsPairConversion ? ` = ${units * 2} فردة` : '';
            const syncChoice = await askConfirmSafe(
                `🎯 تم تغيير سقف الدفعة إلى (${units} ${tMeta.unitLabel}${birdsTxt}).\n\n` +
                `مجموع خانات الأصناف بالأسفل ما زال مسجلاً على الرقم القديم (${oldAllocatedSum} ${tMeta.unitLabel}).\n` +
                `اضغط "توزيع تلقائي" لتعديل خانات الأصناف تلقائياً بنسبة السقف الجديد، أو "تصفير الخانات" للاعتماد على السقف الكلي (${units}) فقط.`,
                { title: 'مزامنة سقف الدفعة مع الأصناف', tone: 'brand', confirmText: 'توزيع تلقائي', cancelText: 'تصفير الخانات' }
            );
            if (!b.stock) b.stock = {};
            if (syncChoice) {
                let runningSum = 0;
                trackIds.forEach((pId, idx) => {
                    const oldVal = Number(b.stock[pId]) || 0;
                    if (idx === trackIds.length - 1) {
                        b.stock[pId] = Math.max(0, units - runningSum);
                    } else {
                        const scaled = Math.round((oldVal / oldAllocatedSum) * units);
                        b.stock[pId] = scaled;
                        runningSum += scaled;
                    }
                });
            } else {
                trackIds.forEach(pId => { b.stock[pId] = 0; });
            }
        } else if (units === 0 && oldAllocatedSum > 0) {
            trackIds.forEach(pId => { if (b.stock) b.stock[pId] = 0; });
        }

        try {
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set({
                    [bId]: {
                        actualPairs: b.actualPairs,
                        publicPairs: b.publicPairs,
                        stock: b.stock || {}
                    }
                }, { merge: true });
            }
        } catch (e) {
            console.error('Error saving batch ceiling:', e);
        }

        window.renderBatchesUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
        if (typeof window.showToast === 'function') {
            const extraTxt = tMeta.hasBirdsPairConversion ? ` = ${units * 2} فردة` : '';
            window.showToast(`🎯 تم تثبيت سقف الدفعة على (${units} ${tMeta.unitLabel}${extraTxt}) بنجاح!`);
        }
    };

    // تحديث شريط عداد الدفعة الحي داخل نافذة "إنشاء طلب جديد" لحظياً حسب مسار الدفعة
    window.updateNewOrderBatchMeter = function () {
        const bSel = document.getElementById('no-batch');
        const meterDiv = document.getElementById('no-batch-live-meter');
        if (!bSel || !meterDiv) return;

        const bId = bSel.value;
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        Object.keys(prodsObj).forEach(id => {
            const badgeEl = document.getElementById(`no-avail-badge-${id}`);
            if (!badgeEl) return;
            if (bId && storeBatches[bId] && Number(storeBatches[bId].stock?.[id]) > 0) {
                const bSt = Number(storeBatches[bId].stock[id]) || 0;
                const bBk = window.getBatchDeepMetrics(bId, storeBatches[bId].name).realBookedByProd[id] || 0;
                const curTyped = Number(document.getElementById(`no-q-${id}`)?.value) || 0;
                const rem = Number((bSt - bBk - curTyped).toFixed(1));
                badgeEl.className = `text-[9px] font-black ${rem < 0 ? 'text-white bg-red-600' : 'text-teal-700 bg-teal-50'} px-1.5 py-0.5 rounded mb-1 inline-block`;
                badgeEl.innerText = `متبقي بالدفعة: ${rem}`;
            } else {
                const stNow = Number(storeStock[id]) || 0;
                badgeEl.className = 'text-[9px] font-bold text-slate-400 mb-1 inline-block';
                badgeEl.innerText = `المتاح: ${stNow}`;
            }
        });

        if (!bId || !storeBatches[bId]) {
            meterDiv.classList.add('hidden');
            meterDiv.innerHTML = '';
            return;
        }

        const batchObj = storeBatches[bId];
        const trackType = window.getBatchTrackType(batchObj);
        const tMeta = getTrackMeta(trackType);
        const cap = window.getBatchCeilingAndRemaining(bId);

        let currentOrderTrackUnits = 0;
        Object.keys(prodsObj).forEach(id => {
            if (doesProductMatchBatchTrack(id, trackType)) {
                const qInput = document.getElementById(`no-q-${id}`);
                const q = Number(qInput?.value) || 0;
                if (q > 0) {
                    const birds = Number(qInput?.getAttribute('data-count')) || q;
                    currentOrderTrackUnits += prodsObj[id].isWeightBased ? birds : q;
                }
            }
        });

        const afterOrderBooked = Number((cap.bookedPairs + currentOrderTrackUnits).toFixed(1));
        const afterOrderRem = Number((cap.ceilingPairs - afterOrderBooked).toFixed(1));
        const afterOrderRemBirds = tMeta.hasBirdsPairConversion ? ` (${Math.round(afterOrderRem * 2)} فردة)` : '';
        const ceilBirdsTxt = tMeta.hasBirdsPairConversion ? ` (${cap.ceilingBirds} فردة)` : '';
        const isOver = cap.ceilingPairs > 0 && afterOrderRem < 0;

        meterDiv.classList.remove('hidden');
        if (cap.ceilingPairs <= 0) {
            meterDiv.innerHTML = `
                <div class="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs font-black flex items-center justify-between">
                    <span>${tMeta.icon} محجوز بالدفعة حالياً: ${cap.bookedPairs} ${tMeta.unitLabel} + طلبك الحالي (${currentOrderTrackUnits})</span>
                    <span class="text-[10px] text-amber-700">لم يحدد سقف كلي للدفعة بعد</span>
                </div>`;
        } else {
            meterDiv.innerHTML = `
                <div class="${isOver ? 'bg-red-600 text-white animate-pulse' : 'bg-teal-900 text-white'} p-3 rounded-xl text-xs font-black flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div>
                        <span>${tMeta.icon} سقف (${escapeHtmlSafe(batchObj.name)}): <strong class="text-amber-300">${cap.ceilingPairs} ${tMeta.unitLabel}${ceilBirdsTxt}</strong></span>
                        <span class="mx-1.5 opacity-50">|</span>
                        <span>محجوز شامل طلبك: <strong class="text-emerald-300">${afterOrderBooked} ${tMeta.unitLabel}</strong></span>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg ${isOver ? 'bg-white text-red-700' : 'bg-white/15 text-amber-300'}">
                        ${isOver ? `⚠️ تخطى سقف الدفعة بـ ${Math.abs(afterOrderRem)} ${tMeta.unitLabel}!` : `🟢 متبقي بالدفعة: ${afterOrderRem} ${tMeta.unitLabel}${afterOrderRemBirds}`}
                    </span>
                </div>`;
        }
    };

    // =========================================================================
    // 🎛️ 2. رسم مركز قيادة الدفعات بنظام التركيز والمسارات الـ 3 المستقلة
    // =========================================================================
    window.renderBatchesUI = function () {
        const batchesView = document.getElementById('view-batches');
        if (batchesView) {
            batchesView.classList.add('overflow-x-hidden');
            const topStaticCard = batchesView.firstElementChild;
            if (topStaticCard && !topStaticCard.hasAttribute('data-batches-slimmed')) {
                topStaticCard.setAttribute('data-batches-slimmed', '1');
                topStaticCard.className = 'flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200/80 shadow-soft shrink-0';
                const pDesc = topStaticCard.querySelector('p');
                if (pDesc) pDesc.classList.add('hidden', 'sm:block');
            }
        }

        const cont = document.getElementById('batches-list-container');
        if (!cont) return;

        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let ghostKeysFound = false;
        Object.keys(batchesObj).forEach(bId => {
            const b = batchesObj[bId];
            if (!b || typeof b !== 'object') {
                delete batchesObj[bId];
                ghostKeysFound = true;
                return;
            }
            const cleanName = (b.name || '').toString().trim();
            const hasConfiguredStock = b.stock && Object.values(b.stock).some(v => Number(v) > 0);
            const checkMetrics = window.getBatchDeepMetrics(bId, cleanName);

            if (!cleanName || cleanName === 'undefined' || (cleanName === 'دفعة غير مسماة' && !hasConfiguredStock && checkMetrics.totalOrders === 0)) {
                delete batchesObj[bId];
                ghostKeysFound = true;
            }
        });

        if (ghostKeysFound && typeof db !== 'undefined') {
            db.collection('inventory').doc('batches').set(batchesObj).catch(() => {});
        }

        const batchIds = Object.keys(batchesObj).reverse();

        if (batchIds.length === 0) {
            cont.innerHTML = '<div class="w-full text-center py-14 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">لا توجد دفعات حالياً. اضغط على (دورة جديدة) بالأعلى للبدء بالتنظيم.</div>';
            return;
        }

        // حساب مؤشرات كل دفعة مرة واحدة
        const batchMetaMap = {};
        const globalOverbookedAlerts = [];

        batchIds.forEach(bId => {
            const b = batchesObj[bId];
            const trackType = window.getBatchTrackType(b);
            const tMeta = getTrackMeta(trackType);
            const metrics = window.getBatchDeepMetrics(bId, b.name);
            const bio = getBatchBioStatus(b, metrics);
            const cap = window.getBatchCeilingAndRemaining(bId);

            let hasBookingMismatch = false;
            const overbookedItems = [];

            Object.keys(prodsObj).forEach(pId => {
                const p = prodsObj[pId];
                if (!p) return;
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                const liveBooked = metrics.realBookedByProd[pId] || 0;
                const bBooked = (metrics.totalOrders > 0 || savedBooked === 0) ? liveBooked : savedBooked;

                if (Math.abs(savedBooked - liveBooked) > 0.01) hasBookingMismatch = true;
                if (bStock > 0 && bStock - bBooked < 0) {
                    const msg = `${p.name} (عجز ${Math.abs(Number((bStock - bBooked).toFixed(1)))})`;
                    overbookedItems.push(msg);
                    globalOverbookedAlerts.push(`${b.name}: ${msg}`);
                }
            });

            if (cap.ceilingPairs > 0 && cap.remainingPairs < 0) {
                const capMsg = `تخطى السقف بـ ${Math.abs(cap.remainingPairs)} ${tMeta.unitLabel}`;
                overbookedItems.push(capMsg);
                globalOverbookedAlerts.push(`${b.name}: ${capMsg}`);
            }

            const sellProgress = cap.ceilingPairs > 0 ? Math.min(100, Math.round((cap.bookedPairs / cap.ceilingPairs) * 100)) : 0;

            batchMetaMap[bId] = { b, trackType, tMeta, metrics, bio, cap, hasBookingMismatch, overbookedItems, sellProgress };
        });

        // اختيار الدفعة النشطة تلقائياً إذا لم يختَر المستخدم دفعة بعد
        if (!window.batchUIState.focusedBatchId || !batchesObj[window.batchUIState.focusedBatchId]) {
            const firstOpenQuail = batchIds.find(id => batchesObj[id]?.isOpen && window.getBatchTrackType(batchesObj[id]) === 'quail');
            const firstOpenAny = batchIds.find(id => batchesObj[id]?.isOpen);
            window.batchUIState.focusedBatchId = firstOpenQuail || firstOpenAny || batchIds[0];
        }

        const focusedId = window.batchUIState.focusedBatchId;
        const viewMode = window.batchUIState.viewMode || 'focus';

        // 1. شريط اختيار الدفعات الأنيق في الأعلى (يميز كل مسار بأيقونته: 🥩 / 🐣 / ⚖️ ويميز دفعات انتظار الإذن)
        const selectorPillsHtml = batchIds.map(bId => {
            const m = batchMetaMap[bId];
            const isSel = (viewMode === 'focus' && focusedId === bId);
            const isPending = m.b.pendingApproval === true;
            const statusDot = isPending ? '🔔' : (m.b.isOpen ? '🟢' : (m.b.slaughteredAt ? '🛵' : '🔒'));
            const remTxt = isPending ? 'بانتظار الإذن' : (m.cap.ceilingPairs > 0 ? `متبقي ${m.cap.remainingPairs} ${m.tMeta.unitLabel}` : `${m.metrics.totalOrders} طلب`);

            return `
                <button type="button" onclick="selectFocusedBatch('${bId}')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 shrink-0 ${isSel ? 'bg-teal-600 text-white border-teal-600 shadow-md' : (isPending ? 'bg-amber-50 text-amber-950 border-amber-400' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100')}">
                    <span>${m.tMeta.icon} ${statusDot} ${escapeHtmlSafe(m.b.name)}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-md ${isSel ? 'bg-white/20 text-amber-200' : (isPending ? 'bg-amber-400 text-slate-950' : 'bg-white text-slate-500 border border-slate-200')}">${remTxt}</span>
                </button>
            `;
        }).join('');

        const topSelectorBarHtml = `
            ${buildPendingFarmApprovalCardHtml()}
            ${globalOverbookedAlerts.length > 0 ? `
            <div class="bg-red-600 text-white px-3.5 py-2 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-300 shrink-0"></i>
                <span class="truncate">تنبيه عجز كميات: ${escapeHtmlSafe(globalOverbookedAlerts.join(' | '))}</span>
            </div>` : ''}

            <div class="w-full max-w-full overflow-hidden bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-soft flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1" style="-webkit-overflow-scrolling: touch; scrollbar-width: none;">
                    ${selectorPillsHtml}
                </div>
                ${batchIds.length > 1 ? `
                <button type="button" onclick="setBatchesViewMode('${viewMode === 'compare_all' ? 'focus' : 'compare_all'}')" class="shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1 ${viewMode === 'compare_all' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}">
                    <i class="fa-solid ${viewMode === 'compare_all' ? 'fa-crosshairs text-amber-400' : 'fa-table-cells-large text-teal-600'} text-[10px]"></i>
                    <span>${viewMode === 'compare_all' ? 'عودة للدفعة' : `مقارنة (${batchIds.length})`}</span>
                </button>` : ''}
            </div>
        `;

        // 2. وضع مقارنة جميع الدفعات (Compare All Mode)
        if (viewMode === 'compare_all') {
            const compareCardsHtml = batchIds.map(bId => {
                const m = batchMetaMap[bId];
                const b = m.b;
                return `
                    <div onclick="selectFocusedBatch('${bId}')" class="bg-white p-4 rounded-2xl border-2 ${b.isOpen ? 'border-emerald-200 hover:border-emerald-500' : 'border-slate-200 hover:border-teal-500'} shadow-sm cursor-pointer transition-all space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <h4 class="font-black text-slate-900 text-sm sm:text-base">${escapeHtmlSafe(b.name)}</h4>
                                    <span class="px-2 py-0.5 rounded-lg text-[9px] font-black border ${m.tMeta.badgeCls}">${m.tMeta.icon} ${m.tMeta.shortLabel}</span>
                                </div>
                                <span class="inline-block mt-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${m.bio.stageColor}">${m.bio.stageLabel}</span>
                            </div>
                            <span class="bg-slate-900 text-amber-300 px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0">${m.metrics.totalOrders} طلب</span>
                        </div>

                        <div class="space-y-1">
                            <div class="flex justify-between text-[11px] font-black">
                                <span class="text-slate-600">محجوز: ${m.cap.bookedPairs} / ${m.cap.ceilingPairs} ${m.tMeta.unitLabel}</span>
                                <span class="${m.cap.remainingPairs < 0 ? 'text-rose-600' : 'text-emerald-700'}">متبقي: ${m.cap.remainingPairs} ${m.tMeta.unitLabel}</span>
                            </div>
                            <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full ${m.sellProgress >= 90 ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full" style="width: ${m.sellProgress}%"></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-1.5 text-center text-[10px] font-black pt-1 border-t border-slate-100">
                            <div class="bg-emerald-50 text-emerald-800 p-1.5 rounded-xl">
                                <span class="block text-[9px] opacity-75">مسلّم</span>
                                <span>${m.metrics.collectedRevenue.toLocaleString()} ج</span>
                            </div>
                            <div class="bg-amber-50 text-amber-800 p-1.5 rounded-xl">
                                <span class="block text-[9px] opacity-75">حي منتظر</span>
                                <span>${m.metrics.pendingRevenue.toLocaleString()} ج</span>
                            </div>
                            <div class="bg-slate-900 text-white p-1.5 rounded-xl flex items-center justify-center">
                                <span>إدارة ⬅️</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            cont.innerHTML = topSelectorBarHtml + `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${compareCardsHtml}</div>`;
            return;
        }

        // 3. وضع التركيز على الدفعة المختارة (Focus Workspace)
        const meta = batchMetaMap[focusedId];
        const b = meta.b;
        const trackType = meta.trackType;
        const tMeta = meta.tMeta;
        const metrics = meta.metrics;
        const bio = meta.bio;
        const cap = meta.cap;
        const activeTab = window.batchUIState.activeInnerTab || 'stock';
        const showZeros = Boolean(window.batchUIState.showZeroProducts[focusedId]);
        const safeBName = escapeJsAttr(b.name);

        let innerTabContentHtml = '';

        // --- التبويب 1: الكميات والأصناف (معزولة بذكاء حسب مسار الدورة) ---
        if (activeTab === 'stock') {
            const sortedProdIds = Object.keys(prodsObj)
                .filter(pId => Boolean(prodsObj[pId]))
                .sort((a, b2) => getBatchProductRank(a, prodsObj[a]) - getBatchProductRank(b2, prodsObj[b2]));

            let mainCardsHtml = '';
            let extraCardsHtml = '';
            let extraHiddenCount = 0;

            sortedProdIds.forEach(pId => {
                const p = prodsObj[pId];
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                const liveBooked = metrics.realBookedByProd[pId] || 0;
                const bBooked = (metrics.totalOrders > 0 || savedBooked === 0) ? liveBooked : savedBooked;
                const remaining = bStock - bBooked;
                const prodPrice = getProdPrice(pId);

                const matchesThisTrack = doesProductMatchBatchTrack(pId, trackType);

                const remCls = remaining < 0
                    ? 'bg-red-600 text-white border-red-600 animate-pulse'
                    : (remaining === 0 && bStock > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800');

                const safePName = escapeJsAttr(p.name);
                let weightHelperLine = '';
                if (p.isWeightBased && typeof window.parseWeightsArray === 'function') {
                    const wArr = window.parseWeightsArray(p.weightsList);
                    const kgSum = (wArr.reduce((s, v) => s + v, 0) / 1000).toFixed(2);
                    weightHelperLine = `<div class="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg text-center">⚖️ بمصفوفة المتجر حالياً: ${wArr.length} قطعة (${kgSum} كجم)</div>`;
                }

                const cardHtml = `
                    <div class="bg-slate-50/90 p-2.5 rounded-2xl border ${remaining < 0 ? 'border-red-300 bg-red-50/30' : 'border-slate-200/80'} space-y-2">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-xs font-black text-slate-900 truncate">${escapeHtmlSafe(p.name)}</span>
                            <span class="text-[10px] font-black text-emerald-700 bg-white px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">${prodPrice} ج</span>
                        </div>
                        ${weightHelperLine}
                        <div class="grid grid-cols-3 gap-1.5">
                            <div>
                                <span class="text-[9px] text-slate-400 font-bold block text-center mb-0.5">المتاح</span>
                                <input type="number" value="${bStock}" onchange="updateBatchStock('${focusedId}', '${pId}', this.value)" class="w-full border border-slate-200 bg-white rounded-xl py-1 px-1 text-xs font-black text-slate-800 text-center outline-none focus:border-brand-primary shadow-sm">
                            </div>
                            <button type="button" onclick="filterOrdersByBatchAndItem('${safeBName}', '${safePName}')" class="text-center bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl py-1 px-1 shadow-sm transition-colors" title="عرض الطلبات التي حجزت هذا الصنف">
                                <span class="text-[9px] text-slate-400 font-bold block mb-0.5">محجوز</span>
                                <span class="text-xs font-black text-blue-600">${Number(bBooked.toFixed(1))}</span>
                            </button>
                            <div class="text-center border rounded-xl py-1 px-1 shadow-sm ${remCls}">
                                <span class="text-[9px] font-bold block mb-0.5">${remaining < 0 ? 'عجز!' : 'متبقي'}</span>
                                <span class="text-xs font-black">${Number(remaining.toFixed(1))}</span>
                            </div>
                        </div>
                    </div>
                `;

                // نظهر فقط أصناف المسار المختار + أي صنف قديم عليه كمية أو حجوزات حتى لا يختفي شيء من القديم
                if (matchesThisTrack || bStock > 0 || bBooked > 0) {
                    mainCardsHtml += cardHtml;
                } else {
                    extraHiddenCount++;
                    if (showZeros) extraCardsHtml += cardHtml;
                }
            });

            const trackIsolationNotice = trackType === 'chicks'
                ? `<div class="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2"><i class="fa-solid fa-circle-info text-amber-600"></i> <span>هذه <strong>دورة تفريخ (عمر يوم)</strong> مستقلة؛ ستظهر للعميل على كارت الكتاكيت فقط ولن تخفي السمان المذبوح أو البيض.</span></div>`
                : (trackType === 'weight'
                    ? `<div class="bg-indigo-50 border border-indigo-200 text-indigo-900 px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2"><i class="fa-solid fa-scale-balanced text-indigo-600"></i> <span>هذه <strong>دورة طيور بالوزن</strong> مستقلة؛ البيع بالجرام يتم من مصفوفة الأوزان في شاشة (الأصناف والأسعار).</span></div>`
                    : '');

            innerTabContentHtml = `
                <div class="space-y-3">
                    ${trackIsolationNotice}

                    <!-- أدوات التحكم السريع في الكميات -->
                    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                        <div class="flex items-center gap-1.5 text-[11px] font-black text-teal-900">
                            <span>🎯 السقف الكلي للدورة:</span>
                            <input type="number" value="${cap.ceilingPairs || ''}" onchange="updateBatchTotalPairsCeiling('${focusedId}', this.value)" placeholder="200" class="w-16 bg-white border-2 border-teal-300 rounded-lg py-0.5 px-1 text-center font-black text-xs text-teal-900 outline-none">
                            <span class="text-[10px] text-slate-500">${tMeta.unitLabel}${tMeta.hasBirdsPairConversion ? ` (${cap.ceilingBirds} فردة)` : ''}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            ${trackType === 'quail' ? `
                            <button type="button" onclick="smartDistributeBatch('${focusedId}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-1 active:scale-95">
                                <i class="fa-solid fa-wand-magic-sparkles text-amber-300 text-[10px]"></i> توزيع ذكي
                            </button>` : ''}
                            ${meta.hasBookingMismatch ? `
                            <button type="button" onclick="syncAndHealBatchBooked('${focusedId}', '${safeBName}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-sm animate-pulse flex items-center gap-1">
                                <i class="fa-solid fa-rotate text-[10px]"></i> مطابقة المحجوز
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- شبكة أصناف هذا المسار فقط -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        ${mainCardsHtml || `<div class="col-span-full text-center py-6 text-xs font-bold text-slate-400">لا توجد أصناف مسجلة تحت مسار (${tMeta.label}) حالياً.</div>`}
                    </div>

                    ${extraHiddenCount > 0 ? `
                    <div class="pt-1">
                        <button type="button" onclick="toggleBatchZeroProducts('${focusedId}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black border border-dashed border-slate-300 transition-all">
                            ${showZeros ? 'إخفاء أصناف المسارات الأخرى ▲' : `+ إظهار باقي أصناف المسارات الأخرى (${extraHiddenCount} صنف) ▼`}
                        </button>
                        ${showZeros ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2.5">${extraCardsHtml}</div>` : ''}
                    </div>` : ''}
                </div>
            `;
        }

        // --- التبويب 2: الطلبات والمناطق والكشف ---
        else if (activeTab === 'orders_zones') {
            const sc = metrics.statusCounts;
            const sortedZones = Object.keys(metrics.zonesMap).sort((a, z2) => metrics.zonesMap[z2].count - metrics.zonesMap[a].count);
            const zonesChipsHtml = sortedZones.length > 0
                ? sortedZones.map(z => {
                    const zInfo = metrics.zonesMap[z];
                    const safeZ = escapeJsAttr(z);
                    return `
                        <button type="button" onclick="jumpToBatchZoneOrders('${safeBName}', '${safeZ}')" class="bg-white hover:bg-indigo-600 text-slate-800 hover:text-white border border-slate-200 hover:border-indigo-600 p-2.5 rounded-xl text-right transition-all shadow-sm flex items-center justify-between gap-2">
                            <span class="text-xs font-black"><i class="fa-solid fa-location-dot text-indigo-500 ml-1"></i>${escapeHtmlSafe(z)}</span>
                            <span class="text-[10px] font-black bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-lg">${zInfo.count} طلب • ${zInfo.netRevenue.toLocaleString()} ج</span>
                        </button>
                    `;
                }).join('')
                : '<div class="col-span-full text-center py-6 text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">لا توجد طلبات مسجلة على هذه الدفعة حتى الآن.</div>';

            innerTabContentHtml = `
                <div class="space-y-3.5">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button type="button" onclick="viewBatchBookings('${focusedId}')" class="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-3 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                            <i class="fa-solid fa-file-pdf text-amber-300"></i> كشف التسليمات والطباعة (${metrics.totalOrders})
                        </button>
                        <button type="button" onclick="bulkMoveBatchNewToProcessing('${focusedId}', '${safeBName}')" class="${sc.new > 0 ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-slate-100 text-slate-400 cursor-not-allowed'} py-2.5 px-3 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 active:scale-95" ${sc.new > 0 ? '' : 'disabled'}>
                            <i class="fa-solid fa-bolt"></i> تجهيز كل الجديد (${sc.new} طلب)
                        </button>
                        <button type="button" onclick="rolloverBatchActiveOrders('${focusedId}', '${safeBName}')" class="${metrics.activeOrders > 0 ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'} py-2.5 px-3 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 active:scale-95" ${metrics.activeOrders > 0 ? '' : 'disabled'}>
                            <i class="fa-solid fa-share-from-square"></i> ترحيل المتبقي لدفعة أخرى (${metrics.activeOrders})
                        </button>
                    </div>

                    <div>
                        <span class="text-[11px] font-black text-slate-500 block mb-2">📊 اضغط على أي مرحلة لعرض طلباتها في شاشة الطلبات الحية:</span>
                        <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'all')" class="bg-slate-900 text-white p-2 rounded-xl text-[11px] font-black">الكل<span class="block text-base text-amber-300">${metrics.totalOrders}</span></button>
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'new')" class="bg-blue-50 text-blue-800 border border-blue-200 p-2 rounded-xl text-[11px] font-black">🆕 جديد<span class="block text-base">${sc.new}</span></button>
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'processing')" class="bg-amber-50 text-amber-900 border border-amber-200 p-2 rounded-xl text-[11px] font-black">⏳ تجهيز<span class="block text-base">${sc.processing}</span></button>
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'dispatched')" class="bg-indigo-50 text-indigo-800 border border-indigo-200 p-2 rounded-xl text-[11px] font-black">🛵 بالطريق<span class="block text-base">${sc.dispatched}</span></button>
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'deferred')" class="bg-purple-50 text-purple-800 border border-purple-200 p-2 rounded-xl text-[11px] font-black">📵 مؤجل<span class="block text-base">${sc.deferred + sc.no_answer}</span></button>
                            <button type="button" onclick="jumpToBatchOrdersWithStatus('${safeBName}', 'completed')" class="bg-emerald-50 text-emerald-800 border border-emerald-200 p-2 rounded-xl text-[11px] font-black">✅ مكتمل<span class="block text-base">${sc.completed}</span></button>
                        </div>
                    </div>

                    <div>
                        <span class="text-[11px] font-black text-slate-500 block mb-2">📍 توزيع الطلبات حسب المنطقة (${sortedZones.length} منطقة):</span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            ${zonesChipsHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        // --- التبويب 3: الذبح / التجهيز، الواتساب، إعدادات العرض، والإغلاق ---
        else {
            const delWindowStr = (bio.deliveryPhrase && bio.deliveryPhrase !== 'غير محدد بعد')
                ? `${bio.deliveryPhrase} (عمر الأمان ${bio.minAge}–${bio.targetAge} يوم)`
                : ((b.deliveryStart || b.deliveryEnd)
                    ? `${b.deliveryStart || ''} ${b.deliveryEnd ? '⬅️ ' + b.deliveryEnd : ''}`
                    : 'غير محدد بعد');

            const step3Title = trackType === 'chicks' ? '3. تأكيد الفقس والتجهيز للتسليم' : '3. إتمام الذبح والترحيل للفريزر';
            const step3Desc = b.expectedValue
                ? `تم التسجيل (قيمة متوقعة: ${b.expectedValue.toLocaleString()} ج)`
                : (trackType === 'chicks' ? 'تسجيل الأعداد الجاهزة وإغلاق الحجز تلقائياً' : 'تسجيل المذبوح الفعلي وقفل الحجز تلقائياً');

            innerTabContentHtml = `
                <div class="space-y-3">
                    <div class="bg-purple-50/70 border border-purple-200 p-3 rounded-2xl space-y-1">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-[11px] font-black text-purple-900"><i class="fa-solid fa-bullhorn text-purple-600 ml-1"></i> رسالة الدورة الظاهرة للعملاء بالمتجر الآن:</span>
                            <span class="text-[10px] font-black bg-white text-slate-600 px-2 py-0.5 rounded-lg border border-purple-200">📅 التسليم: ${escapeHtmlSafe(delWindowStr)}</span>
                        </div>
                        <p class="text-xs font-bold text-slate-700 leading-relaxed bg-white p-2.5 rounded-xl border border-purple-100">
                            ${b.urgentNote ? `<strong class="text-amber-700 block mb-0.5">📌 تنبيه: ${escapeHtmlSafe(b.urgentNote)}</strong>` : ''}${escapeHtmlSafe(bio.autoMsg)}
                        </p>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button type="button" onclick="openBatchSettings('${focusedId}')" class="bg-white hover:bg-purple-50 border-2 border-purple-200 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-purple-900 block">1. إعدادات العمر والتواريخ والرسالة</span>
                                <span class="text-[10px] font-bold text-slate-500">تعديل مواعيد التسليم، العمر، والتنبيه الطارئ</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0"><i class="fa-solid fa-sliders"></i></span>
                        </button>

                        <button type="button" onclick="openBatchBroadcastUI('${focusedId}')" class="bg-white hover:bg-emerald-50 border-2 border-emerald-200 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-emerald-900 block">2. إرسال واتساب لعملاء الدفعة</span>
                                <span class="text-[10px] font-bold text-slate-500">إرسال رسالة تأكيد أو موعد التسليم للمحددين</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-[#25D366]/15 text-[#1da851] flex items-center justify-center shrink-0 text-lg"><i class="fa-brands fa-whatsapp"></i></span>
                        </button>

                        <button type="button" onclick="openSlaughterModal('${focusedId}')" class="bg-white hover:bg-rose-50 border-2 border-rose-200 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-rose-900 block">${step3Title}</span>
                                <span class="text-[10px] font-bold text-slate-500">${step3Desc}</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><i class="fa-solid ${trackType === 'chicks' ? 'fa-egg' : 'fa-knife-kitchen'}"></i></span>
                        </button>

                        <button type="button" onclick="archiveBatch('${focusedId}')" class="bg-white hover:bg-amber-50 border-2 border-amber-300 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-amber-950 block">4. إغلاق وترحيل الدفعة للأرشيف</span>
                                <span class="text-[10px] font-bold text-slate-500">حفظ التقرير الختامي وأرشفة الطلبات المكتملة فقط</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><i class="fa-solid fa-box-archive"></i></span>
                        </button>
                    </div>

                    <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 bg-rose-50/40 px-3 py-2 rounded-xl border border-rose-100">
                        <span class="text-[10px] font-bold text-rose-700">حذف هذه الدفعة نهائياً من قاعدة البيانات:</span>
                        <button type="button" onclick="deleteBatchUI('${focusedId}')" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-1">
                            <i class="fa-solid fa-trash text-[10px]"></i> حذف الدفعة
                        </button>
                    </div>
                </div>
            `;
        }

        const innerTabBtnCls = (k) => activeTab === k
            ? 'bg-slate-900 text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200';

        const ceilBirdsParen = tMeta.hasBirdsPairConversion ? ` (${cap.ceilingBirds} فردة)` : '';
        const remBirdsParen = tMeta.hasBirdsPairConversion ? ` (${cap.remainingBirds} فردة)` : '';

        // بطاقة القيادة الموحدة للدفعة المختارة
        const focusedWorkspaceHtml = `
            <div class="w-full max-w-full overflow-hidden bg-white rounded-[1.5rem] shadow-soft border-2 ${b.isOpen ? 'border-emerald-500/35' : 'border-slate-200'} p-3.5 sm:p-5 space-y-3.5">
                <!-- 1. رأس الدفعة: الاسم + اختيار نوع المسار + العمر + مفاتيح المتجر والحجز -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                    <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        <div class="relative flex-1 min-w-[155px] max-w-xs">
                            <i class="fa-solid fa-pen absolute right-2.5 top-2.5 text-slate-400 text-[10px] pointer-events-none"></i>
                            <input type="text" value="${escapeHtmlSafe(b.name)}" onchange="updateBatchNameAndOrders('${focusedId}', this.value)" class="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl py-1.5 pr-7 pl-2 text-sm font-black text-slate-900 outline-none focus:border-brand-primary">
                        </div>

                        <!-- مبدّل نوع المسار المباشر (لتعديل نوع أي دفعة قديمة أو جديدة بضغطة واحدة) -->
                        <select onchange="updateBatchTrackType('${focusedId}', this.value)" title="نوع مسار هذه الدورة في المتجر والـ CRM" class="px-2.5 py-1.5 rounded-xl text-[11px] font-black border outline-none cursor-pointer ${tMeta.badgeCls}">
                            <option value="quail" ${trackType === 'quail' ? 'selected' : ''}>🥩 دورة سمان مذبوح</option>
                            <option value="chicks" ${trackType === 'chicks' ? 'selected' : ''}>🐣 دورة تفريخ (عمر يوم)</option>
                            <option value="weight" ${trackType === 'weight' ? 'selected' : ''}>⚖️ دورة فراخ / رومي</option>
                        </select>

                        <span class="px-2.5 py-1 rounded-xl text-[10px] font-black border ${bio.stageColor}">${bio.stageLabel}</span>
                        ${bio.ageDays !== null && trackType === 'quail' ? `
                        <div class="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-xl text-[10px] font-black text-purple-900">
                            <button type="button" onclick="quickStepBatchAge('${focusedId}', -1)" class="w-5 h-5 bg-white rounded text-purple-700 hover:bg-purple-600 hover:text-white">-</button>
                            <span class="px-1">${bio.ageDays} يوم</span>
                            <button type="button" onclick="quickStepBatchAge('${focusedId}', 1)" class="w-5 h-5 bg-white rounded text-purple-700 hover:bg-purple-600 hover:text-white">+</button>
                        </div>` : ''}
                    </div>

                    <!-- مفتاحا الحالة الواضحان -->
                    <div class="grid grid-cols-2 gap-1.5 shrink-0">
                        <label class="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black cursor-pointer transition-colors ${b.isVisible !== false ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-500'}">
                            <input type="checkbox" ${b.isVisible !== false ? 'checked' : ''} onchange="toggleBatchBooleanFlag('${focusedId}', 'isVisible', this.checked)" class="w-3.5 h-3.5 accent-blue-600 rounded">
                            <span>بالمتجر</span>
                        </label>
                        <label class="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black cursor-pointer transition-colors ${b.isOpen ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}">
                            <input type="checkbox" ${b.isOpen ? 'checked' : ''} onchange="toggleBatchBooleanFlag('${focusedId}', 'isOpen', this.checked)" class="w-3.5 h-3.5 accent-emerald-600 rounded">
                            <span>حجز مفتوح</span>
                        </label>
                    </div>
                </div>

                <!-- 2. شريط المؤشرات الصافية ونسبة الامتلاء -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-3.5 rounded-2xl space-y-2.5 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-black">
                        <span>${tMeta.icon} حُجز <strong class="text-emerald-300 text-sm">${cap.bookedPairs}</strong> من <strong class="text-white">${cap.ceilingPairs} ${tMeta.unitLabel}</strong>${ceilBirdsParen}</span>
                        <span class="px-2.5 py-0.5 rounded-lg text-[11px] ${cap.remainingPairs < 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-white/15 text-amber-300'}">
                            ${cap.remainingPairs < 0 ? `عجز ${Math.abs(cap.remainingPairs)} ${tMeta.unitLabel}!` : `متبقي: ${cap.remainingPairs} ${tMeta.unitLabel}${remBirdsParen}`}
                        </span>
                    </div>
                    <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div class="h-full ${meta.sellProgress >= 90 ? 'bg-amber-400' : 'bg-emerald-400'} rounded-full transition-all duration-500" style="width: ${meta.sellProgress}%"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center pt-1">
                        <div class="bg-white/10 p-2 rounded-xl">
                            <span class="text-[9px] text-slate-300 font-bold block">✅ صافي المسلّم</span>
                            <span class="text-xs sm:text-sm font-black text-emerald-300">${metrics.collectedRevenue.toLocaleString()} ج</span>
                            <span class="block text-[9px] text-slate-300">(${metrics.completedOrders} طلب)</span>
                        </div>
                        <div class="bg-white/10 p-2 rounded-xl">
                            <span class="text-[9px] text-slate-300 font-bold block">⏳ حي منتظر</span>
                            <span class="text-xs sm:text-sm font-black text-amber-300">${metrics.pendingRevenue.toLocaleString()} ج</span>
                            <span class="block text-[9px] text-slate-300">(${metrics.activeOrders} طلب)</span>
                        </div>
                        <div class="bg-white/10 p-2 rounded-xl">
                            <span class="text-[9px] text-slate-300 font-bold block">💰 إجمالي الدفعة</span>
                            <span class="text-xs sm:text-sm font-black text-sky-300">${metrics.netProductsRevenue.toLocaleString()} ج</span>
                            <span class="block text-[9px] text-slate-300">(${meta.sellProgress}% ممتلئ)</span>
                        </div>
                    </div>
                </div>

                <!-- 3. شريط التبويبات الداخلية الـ 3 -->
                <div class="grid grid-cols-3 gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-200/80">
                    <button type="button" onclick="setBatchInnerTab('stock')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('stock')}">
                        📦 الكميات والأصناف
                    </button>
                    <button type="button" onclick="setBatchInnerTab('orders_zones')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('orders_zones')}">
                        📋 الطلبات (${metrics.totalOrders})
                    </button>
                    <button type="button" onclick="setBatchInnerTab('lifecycle')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('lifecycle')}">
                        ⚙️ ${trackType === 'chicks' ? 'التجهيز والإغلاق' : 'الذبح والإغلاق'}
                    </button>
                </div>

                <!-- 4. محتوى التبويب النشط -->
                <div>${innerTabContentHtml}</div>
            </div>
        `;

        cont.innerHTML = topSelectorBarHtml + focusedWorkspaceHtml;
    };

    // =========================================================================
    // ➕ 3. نافذة إنشاء دورة جديدة باختيار المسار (سمان مذبوح / عمر يوم / فراخ ورومي)
    // =========================================================================
    let selectedNewBatchTrack = 'quail';

    function ensureNewBatchTrackModal() {
        let modal = document.getElementById('new-batch-track-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'new-batch-track-modal';
        modal.className = 'fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[235] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-teal-950 text-white px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-white">إنشاء دورة جديدة مستقلة</h3>
                        <p class="text-[10px] text-teal-200 font-bold mt-0.5">اختر نوع المسار حتى لا تتعارض الدورات مع بعضها في المتجر</p>
                    </div>
                    <button type="button" onclick="closeModal('new-batch-track-modal')" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <div class="p-4 sm:p-5 space-y-4 bg-slate-50/60">
                    <div>
                        <label class="text-[11px] font-black text-slate-600 block mb-2">1. اختر نوع الدورة / المسار:</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" data-nb-track="quail" onclick="selectNewBatchTrackType('quail')" class="nb-track-card p-2.5 rounded-2xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 text-center transition-all shadow-sm">
                                <span class="text-xl block">🥩</span>
                                <span class="text-[11px] font-black block mt-1">سمان مذبوح</span>
                                <span class="text-[9px] font-bold text-emerald-700 block">أطباق بالجوز</span>
                            </button>
                            <button type="button" data-nb-track="chicks" onclick="selectNewBatchTrackType('chicks')" class="nb-track-card p-2.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 text-center transition-all">
                                <span class="text-xl block">🐣</span>
                                <span class="text-[11px] font-black block mt-1">تفريخ عمر يوم</span>
                                <span class="text-[9px] font-bold text-slate-400 block">حجز كتاكيت فقط</span>
                            </button>
                            <button type="button" data-nb-track="weight" onclick="selectNewBatchTrackType('weight')" class="nb-track-card p-2.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 text-center transition-all">
                                <span class="text-xl block">⚖️</span>
                                <span class="text-[11px] font-black block mt-1">فراخ / رومي</span>
                                <span class="text-[9px] font-bold text-slate-400 block">بالوزن الدقيق</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-black text-slate-600 block mb-1.5">2. اسم الدورة (مثال: دفعة ديسمبر / تفريخ 25 نوفمبر):</label>
                        <input type="text" id="nb-track-name-input" onkeydown="if(event.key==='Enter'){event.preventDefault(); confirmCreateNewBatchWithTrack();}" class="w-full border-2 border-slate-200 focus:border-teal-600 rounded-xl p-2.5 text-sm font-black text-slate-900 bg-white outline-none">
                    </div>

                    <div>
                        <label id="nb-track-cap-label" class="text-[11px] font-black text-slate-600 block mb-1.5">3. العدد المستهدف للدورة (اختياري — بالجوز):</label>
                        <input type="number" id="nb-track-cap-input" min="0" placeholder="مثال: 200" class="w-full border border-slate-200 focus:border-teal-600 rounded-xl p-2.5 text-sm font-black text-teal-900 bg-white text-center outline-none">
                    </div>
                </div>

                <div class="p-4 bg-white border-t border-slate-100 flex gap-2">
                    <button type="button" onclick="confirmCreateNewBatchWithTrack()" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-md active:scale-95">
                        <i class="fa-solid fa-plus ml-1"></i> إنشاء الدورة الآن
                    </button>
                    <button type="button" onclick="closeModal('new-batch-track-modal')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black px-4 py-3 rounded-xl text-xs">إلغاء</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    window.selectNewBatchTrackType = function (trackKey) {
        selectedNewBatchTrack = trackKey || 'quail';
        document.querySelectorAll('.nb-track-card').forEach(btn => {
            const isSel = btn.getAttribute('data-nb-track') === selectedNewBatchTrack;
            if (isSel) {
                const activeCls = trackKey === 'chicks'
                    ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-sm'
                    : (trackKey === 'weight' ? 'border-indigo-500 bg-indigo-50 text-indigo-950 shadow-sm' : 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm');
                btn.className = `nb-track-card p-2.5 rounded-2xl border-2 text-center transition-all ${activeCls}`;
            } else {
                btn.className = 'nb-track-card p-2.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 text-center transition-all';
            }
        });

        const dateStr = new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        const nameInp = document.getElementById('nb-track-name-input');
        const capLbl = document.getElementById('nb-track-cap-label');
        const tMeta = getTrackMeta(selectedNewBatchTrack);

        if (capLbl) capLbl.textContent = `3. العدد المستهدف للدورة (اختياري — بالـ ${tMeta.unitLabel}):`;
        if (nameInp && (!nameInp.value.trim() || nameInp.getAttribute('data-auto-filled') === '1')) {
            nameInp.value = selectedNewBatchTrack === 'chicks'
                ? `تفريخ عمر يوم ${dateStr}`
                : (selectedNewBatchTrack === 'weight' ? `دورة فراخ ${dateStr}` : `دفعة ${dateStr}`);
            nameInp.setAttribute('data-auto-filled', '1');
        }
    };

    window.addNewBatchUI = function () {
        ensureNewBatchTrackModal();
        const nameInp = document.getElementById('nb-track-name-input');
        const capInp = document.getElementById('nb-track-cap-input');
        if (nameInp) {
            nameInp.value = '';
            nameInp.setAttribute('data-auto-filled', '1');
            nameInp.oninput = () => nameInp.setAttribute('data-auto-filled', '0');
        }
        if (capInp) capInp.value = '';
        window.selectNewBatchTrackType('quail');

        if (typeof openModal === 'function') openModal('new-batch-track-modal');
        else document.getElementById('new-batch-track-modal')?.classList.remove('hidden');
        setTimeout(() => nameInp?.focus(), 100);
    };

    window.confirmCreateNewBatchWithTrack = async function () {
        const nameInp = document.getElementById('nb-track-name-input');
        const capInp = document.getElementById('nb-track-cap-input');
        const dateStr = new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        const cleanName = (nameInp?.value || '').trim() || `دفعة ${dateStr}`;
        const capVal = Math.max(0, parseInt(capInp?.value) || 0);
        const trackType = selectedNewBatchTrack || 'quail';

        const initStock = {};
        if (trackType === 'chicks' && capVal > 0 && typeof storeProducts !== 'undefined') {
            const chicksPid = Object.keys(storeProducts).find(id => window.getProductTrackType(id) === 'chicks');
            if (chicksPid) initStock[chicksPid] = capVal;
        }

        const bId = 'batch_' + Date.now();
        storeBatches[bId] = {
            name: cleanName,
            batchType: trackType,
            isOpen: true,
            isVisible: true,
            actualPairs: capVal,
            publicPairs: capVal,
            stock: initStock,
            booked: {},
            hatchDate: Date.now()
        };

        try {
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set({ [bId]: storeBatches[bId] }, { merge: true });
            }
            if (typeof closeModal === 'function') closeModal('new-batch-track-modal');
            else document.getElementById('new-batch-track-modal')?.classList.add('hidden');

            window.batchUIState.viewMode = 'focus';
            window.batchUIState.focusedBatchId = bId;
            window.batchUIState.activeInnerTab = 'stock';
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            const tMeta = getTrackMeta(trackType);
            if (typeof window.showToast === 'function') window.showToast(`${tMeta.icon} تم إنشاء (${cleanName}) كمسار مستقل بنجاح!`);
        } catch (e) {
            console.error('Error creating batch:', e);
            alert('حدث خطأ أثناء إنشاء الدورة الجديدة!');
        }
    };

    window.updateBatchStock = async function (bId, pId, val) {
        if (!storeBatches[bId]) return;
        const b = storeBatches[bId];
        if (!b.stock) b.stock = {};
        b.stock[pId] = Math.max(0, parseInt(val) || 0);

        const trackType = window.getBatchTrackType(b);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        let newTrackSum = 0;
        Object.keys(prodsObj).forEach(k => {
            if (prodsObj[k] && doesProductMatchBatchTrack(k, trackType)) {
                newTrackSum += (Number(b.stock[k]) || 0);
            }
        });

        if (newTrackSum > 0) {
            b.actualPairs = newTrackSum;
            b.publicPairs = newTrackSum;
        }

        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: {
                    stock: b.stock,
                    actualPairs: b.actualPairs || 0,
                    publicPairs: b.publicPairs || 0
                }
            }, { merge: true });
        } catch (e) {
            console.error('Update batch stock error:', e);
        }
        window.renderBatchesUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
    };

    window.quickStepBatchAge = async function (bId, deltaDays) {
        const b = storeBatches[bId];
        if (!b) return;
        const currentAge = b.hatchDate ? Math.max(0, Math.floor((Date.now() - b.hatchDate) / (1000 * 60 * 60 * 24))) : 0;
        const nextAge = Math.max(0, currentAge + deltaDays);
        const newHatchDate = Date.now() - (nextAge * 24 * 60 * 60 * 1000);

        b.hatchDate = newHatchDate;
        window.renderBatchesUI();
        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.hatchDate`]: newHatchDate
            });
            if (typeof window.showToast === 'function') window.showToast(`🐣 تم تحديث عمر الدفعة إلى (${nextAge} يوم)`);
        } catch (e) {}
    };

    window.jumpToBatchOrdersWithStatus = function (batchName, statusTab) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
                if (document.getElementById('so-filter-batch')) document.getElementById('so-filter-batch').value = batchName.trim();
            } else if (document.getElementById('search-order')) {
                document.getElementById('search-order').value = batchName.trim();
            }
            if (typeof window.setOrderTab === 'function') {
                window.setOrderTab(statusTab || 'all');
            }
        }, 80);
    };

    window.jumpToBatchZoneOrders = function (batchName, zoneName) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
                window.setOrdersQuickFilter('zone', zoneName.trim());
                if (document.getElementById('so-filter-batch')) document.getElementById('so-filter-batch').value = batchName.trim();
                if (document.getElementById('so-filter-zone')) document.getElementById('so-filter-zone').value = zoneName.trim();
            }
            if (typeof window.setOrderTab === 'function') window.setOrderTab('all');
        }, 80);
    };

    window.filterOrdersByBatchAndItem = function (batchName, itemName) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
            }
            const sBox = document.getElementById('search-order');
            if (sBox) sBox.value = `"${itemName.trim()}"`;
            if (typeof window.setOrderTab === 'function') window.setOrderTab('all');
        }, 80);
    };

    window.bulkMoveBatchNewToProcessing = async function (bId, bName) {
        const metrics = window.getBatchDeepMetrics(bId, bName);
        const newOrders = metrics.batchOrdersList.filter(o => o.status === 'new');
        if (newOrders.length === 0) return alert('لا توجد طلبات في حالة (جديد) داخل هذه الدفعة!');

        if (!(await askConfirmSafe(`⚡ هل تريد تحويل كل الطلبات الجديدة في دفعة (${bName}) وعددها (${newOrders.length} طلب) إلى قسم (جاري التجهيز) الآن؟`, { title: 'نقل جماعي للتجهيز', tone: 'brand', confirmText: 'تأكيد النقل' }))) return;

        try {
            const batchWrite = db.batch();
            const fzNew = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
            let fzTouched = false;

            newOrders.forEach(o => {
                const deductedMap = {};
                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        if (i && i.id && !i.pendingWeight) {
                            const needQty = Math.max(0, Number(i.quantity) || 0);
                            if (needQty <= 0) return;
                            const cur = Math.max(0, Number(fzNew[i.id]) || 0);
                            const actualDed = Math.min(cur, needQty);
                            deductedMap[i.id] = Number(((deductedMap[i.id] || 0) + actualDed).toFixed(3));
                            if (actualDed > 0) {
                                fzNew[i.id] = Number((cur - actualDed).toFixed(3));
                                if (typeof storeFreezer !== 'undefined') storeFreezer[i.id] = fzNew[i.id];
                                fzTouched = true;
                            }
                        }
                    });
                }
                batchWrite.update(db.collection('orders').doc(o.id), { status: 'processing', freezerDeductedMap: deductedMap });
                o.status = 'processing';
                o.freezerDeductedMap = deductedMap;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].status = 'processing';
                    globalOrdersMap[o.id].freezerDeductedMap = deductedMap;
                }
            });


            if (fzTouched) {
                batchWrite.set(db.collection('inventory').doc('freezer'), fzNew, { merge: true });
            }

            await batchWrite.commit();
            window.renderBatchesUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم نقل (${newOrders.length}) طلب إلى قيد التجهيز بنجاح!`);
        } catch (e) {
            alert('حدث خطأ أثناء نقل الطلبات للتجهيز!');
        }
    };

    window.syncAndHealBatchBooked = async function (bId, bName) {
        const b = storeBatches[bId];
        if (!b) return;
        const metrics = window.getBatchDeepMetrics(bId, bName);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const cleanBooked = {};
        Object.keys(prodsObj).forEach(pId => {
            cleanBooked[pId] = Number((metrics.realBookedByProd[pId] || 0).toFixed(2));
        });

        b.booked = cleanBooked;
        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.booked`]: cleanBooked
            });
            window.renderBatchesUI();
            if (typeof window.showToast === 'function') window.showToast(`✅ تمت مطابقة وإصلاح أرقام المحجوز لدفعة (${bName}) بنجاح!`);
        } catch (e) {
            alert('حدث خطأ أثناء مزامنة المحجوز!');
        }
    };

    window.rolloverBatchActiveOrders = async function (fromBatchId, fromBatchName) {
        const metrics = window.getBatchDeepMetrics(fromBatchId, fromBatchName);
        const activeOrders = metrics.batchOrdersList.filter(o => !['completed', 'canceled', 'trash'].includes(o.status));
        if (activeOrders.length === 0) return alert('لا توجد طلبات متبقية غير مسلمة في هذه الدفعة!');

        const otherBatches = Object.keys(storeBatches || {}).filter(id => id !== fromBatchId && storeBatches[id] && storeBatches[id].name);
        if (otherBatches.length === 0) {
            return alert('لا توجد دفعة أخرى مسجلة حالياً! أنشئ الدورة الجديدة أولاً ثم اضغط ترحيل المتبقي.');
        }

        let promptMsg = `🔀 ترحيل الطلبات المتبقية غير المسلمة من (${fromBatchName}) وعددها (${activeOrders.length} طلب):\n\nاكتب رقم الدفعة الجديدة التي تريد نقل الطلبات إليها:\n`;
        otherBatches.forEach((id, idx) => {
            promptMsg += `${idx + 1} = ${storeBatches[id].name}\n`;
        });

        const choice = await askPromptSafe(promptMsg, '1', { title: 'ترحيل الطلبات المتبقية', tone: 'brand', inputType: 'number', confirmText: 'التالي' });
        if (!choice) return;
        const targetIdx = parseInt(choice) - 1;
        const targetBatchId = otherBatches[targetIdx];
        if (!targetBatchId || !storeBatches[targetBatchId]) return alert('اختيار غير صحيح!');

        const targetBatchName = storeBatches[targetBatchId].name;
        if (!(await askConfirmSafe(`سيتم نقل (${activeOrders.length}) طلب بكامل أصنافها من (${fromBatchName}) إلى (${targetBatchName}). تأكيد؟`, { title: 'تأكيد الترحيل', tone: 'warning', confirmText: 'تأكيد ونقل' }))) return;

        try {
            const batchWrite = db.batch();
            activeOrders.forEach(o => {
                batchWrite.update(db.collection('orders').doc(o.id), {
                    batchId: targetBatchId,
                    batchName: targetBatchName
                });
                o.batchId = targetBatchId;
                o.batchName = targetBatchName;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].batchId = targetBatchId;
                    globalOrdersMap[o.id].batchName = targetBatchName;
                }
            });

            await batchWrite.commit();
            await window.syncAndHealBatchBooked(fromBatchId, fromBatchName);
            await window.syncAndHealBatchBooked(targetBatchId, targetBatchName);

            window.renderBatchesUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم ترحيل (${activeOrders.length}) طلب إلى (${targetBatchName}) بنجاح!`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء ترحيل الطلبات!');
        }
    };

    // =========================================================================
    // 📋 4. كشف تسليمات وتحضيرات الدفعة المطور (viewBatchBookings)
    // =========================================================================
    window.viewBatchBookings = async function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        window.batchManifestState.activeBatchId = bId;
        window.batchManifestState.zoneFilter = 'all';
        window.batchManifestState.statusFilter = 'all_valid';

        document.getElementById('bb-title').innerText = b.name;
        if (typeof openModal === 'function') openModal('batch-bookings-modal');
        window.renderBatchManifestContent();
    };

    window.setBatchManifestFilter = function (key, val) {
        window.batchManifestState[key] = val;
        window.renderBatchManifestContent();
    };

    window.renderBatchManifestContent = function () {
        const bId = window.batchManifestState.activeBatchId;
        const b = storeBatches[bId];
        const contentDiv = document.getElementById('bb-content');
        if (!b || !contentDiv) return;

        const metrics = window.getBatchDeepMetrics(bId, b.name);
        const allValidOrders = metrics.batchOrdersList.filter(o => o.status !== 'canceled' && o.status !== 'trash');

        if (allValidOrders.length === 0) {
            contentDiv.innerHTML = '<div class="text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لم يتم تأكيد أي حجوزات في هذه الدفعة حتى الآن.</div>';
            return;
        }

        const zFilter = window.batchManifestState.zoneFilter;
        const sFilter = window.batchManifestState.statusFilter;

        const filteredOrders = allValidOrders.filter(o => {
            if (zFilter !== 'all' && (o.zone || 'غير محدد').trim() !== zFilter) return false;
            if (sFilter === 'completed' && o.status !== 'completed') return false;
            if (sFilter === 'active_only' && o.status === 'completed') return false;
            return true;
        });

        const filteredItemsSum = {};
        let filteredMoneySum = 0;
        let filteredNetSum = 0;

        filteredOrders.forEach(o => {
            filteredMoneySum += (Number(o.total) || 0);
            filteredNetSum += getOrderNetProductsTotal(o);
            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const nm = i.name || 'صنف';
                    filteredItemsSum[nm] = (filteredItemsSum[nm] || 0) + (Number(i.quantity) || 0);
                });
            }
        });

        let zoneOpts = `<option value="all">📍 كل المناطق (${allValidOrders.length} طلب)</option>`;
        Object.keys(metrics.zonesMap).sort((a, b2) => metrics.zonesMap[b2].count - metrics.zonesMap[a].count).forEach(z => {
            zoneOpts += `<option value="${escapeHtmlSafe(z)}" ${zFilter === z ? 'selected' : ''}>📍 ${escapeHtmlSafe(z)} (${metrics.zonesMap[z].count} طلب)</option>`;
        });

        const itemsPillsHtml = Object.keys(filteredItemsSum).map(nm => `
            <div class="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-center">
                <span class="block text-[10px] font-bold text-slate-500">${escapeHtmlSafe(nm)}</span>
                <span class="text-base font-black text-brand-primary">${Number(filteredItemsSum[nm].toFixed(2))}</span>
            </div>
        `).join('');

        let tableRowsHtml = '';
        filteredOrders.forEach((o, idx) => {
            const itemsStr = Array.isArray(o.items)
                ? o.items.map(i => `<span class="bg-indigo-50 px-2 py-0.5 rounded-lg text-indigo-700 font-black border border-indigo-100 text-xs inline-block m-0.5">${i.quantity}x ${escapeHtmlSafe(i.name)}</span>`).join(' ')
                : '';
            const locationStr = `${o.zone || 'بدون منطقة'}${o.customerAddress ? ' - ' + o.customerAddress : ''}`;
            const stAr = o.status === 'completed' ? '✅ مسلم' : (o.status === 'dispatched' ? '🛵 بالطريق' : (o.status === 'processing' ? '⏳ تجهيز' : '🆕 جديد'));
            const payStr = o.paymentMethod === 'online'
                ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black block">خالص أونلاين</span>'
                : (o.paymentMethod === 'split' ? `<span class="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-black block">كاش: ${o.paidCash || 0} | محفظة: ${o.paidOnline || 0}</span>` : '');

            tableRowsHtml += `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-3.5 font-black text-slate-400 text-xs">${idx + 1}</td>
                    <td class="p-3.5">
                        <div class="font-black text-slate-800 text-sm mb-0.5">${escapeHtmlSafe(o.customerName || 'عميل')} <span class="text-[10px] font-bold text-slate-400">(${stAr})</span></div>
                        <div class="text-[11px] text-slate-600 font-bold"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${escapeHtmlSafe(locationStr)}</div>
                    </td>
                    <td class="p-3.5 font-black text-slate-700 text-xs" dir="ltr">
                        ${escapeHtmlSafe(o.customerPhone || '')}
                        ${o.customerPhone2 ? `<br><span class="text-[10px] text-purple-600">بديل: ${escapeHtmlSafe(o.customerPhone2)}</span>` : ''}
                    </td>
                    <td class="p-3.5">${itemsStr}</td>
                    <td class="p-3.5 font-black text-brand-primary text-center text-base">
                        ${o.total || 0} <span class="text-xs">ج</span>
                        ${payStr}
                    </td>
                    <td class="p-3.5 text-[11px] font-bold text-amber-700 max-w-[180px] leading-relaxed">${escapeHtmlSafe(o.driverNote || o.adminNote || '-')}</td>
                </tr>
            `;
        });

        contentDiv.innerHTML = `
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                <div class="flex flex-wrap items-center gap-2">
                    <select onchange="setBatchManifestFilter('zoneFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-indigo-900 outline-none">${zoneOpts}</select>
                    <select onchange="setBatchManifestFilter('statusFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none">
                        <option value="all_valid" ${sFilter === 'all_valid' ? 'selected' : ''}>📦 كل حجوزات الدفعة</option>
                        <option value="active_only" ${sFilter === 'active_only' ? 'selected' : ''}>⏳ المتبقي للتسليم فقط</option>
                        <option value="completed" ${sFilter === 'completed' ? 'selected' : ''}>✅ المسلم فقط</option>
                    </select>
                </div>
                <div class="text-xs font-black text-slate-600">
                    <span>الطلبات: <strong class="text-slate-900">${filteredOrders.length}</strong></span> |
                    <span>صافي المنتجات: <strong class="text-emerald-700">${filteredNetSum.toLocaleString()} ج</strong></span> |
                    <span>شامل التوصيل: <strong class="text-brand-primary">${filteredMoneySum.toLocaleString()} ج</strong></span>
                </div>
            </div>

            <div class="mb-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="text-xs font-black text-slate-700 mb-2.5"><i class="fa-solid fa-boxes-packing text-teal-600 mr-1"></i> إجمالي الأصناف المطلوبة في هذا الكشف (${filteredOrders.length} طلب):</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">${itemsPillsHtml}</div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table class="w-full text-right text-sm border-collapse" id="print-table">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                            <th class="p-3.5 font-black text-xs">#</th>
                            <th class="p-3.5 font-black text-xs">العميل والعنوان</th>
                            <th class="p-3.5 font-black text-xs">الموبايل</th>
                            <th class="p-3.5 font-black text-xs">الأصناف المطلوبة</th>
                            <th class="p-3.5 font-black text-xs text-center">المطلوب تحصيله</th>
                            <th class="p-3.5 font-black text-xs">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">${tableRowsHtml}</tbody>
                </table>
            </div>
        `;
    };

    // =========================================================================
    // 🔮 5. خوارزمية التوزيع الذكي للدفعة (تتعلم من الأرشيف والدفعات الحية)
    // =========================================================================
    window.smartDistributeBatch = async function (bId) {
        const currentBatch = storeBatches[bId];
        if (!currentBatch) return;

        const defaultTotal = currentBatch.actualPairs || currentBatch.expectedPairs || '';
        const totalInput = await askPromptSafe(`🔮 نظام التوزيع الذكي لدفعة (${currentBatch.name}):\n\nأدخل العدد الكلي للسمان المراد توزيعه على الأصناف (مثال: 200):`, defaultTotal, { title: 'التوزيع الذكي للدفعة', tone: 'brand', inputType: 'number', confirmText: 'احسب التوزيع' });
        if (!totalInput) return;

        const totalTarget = parseInt(totalInput);
        if (isNaN(totalTarget) || totalTarget <= 0) return alert('⛔ برجاء إدخال رقم صحيح للعدد الكلي!');

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const validMainProducts = {};
        const mainProdIds = [];

        Object.keys(prodsObj)
            .sort((a, b2) => getBatchProductRank(a, prodsObj[a]) - getBatchProductRank(b2, prodsObj[b2]))
            .forEach(id => {
                if (isMainQuailProduct(id) && !prodsObj[id].isHidden && !prodsObj[id].isWeightBased) {
                    validMainProducts[prodsObj[id].name] = id;
                    mainProdIds.push(id);
                }
            });

        if (mainProdIds.length === 0) return alert('لا توجد أصناف سمان أساسية مسجلة في المتجر!');

        const historyWeightsById = {};
        let grandTotalHistory = 0;

        const archList = (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData)) ? archivedBatchesData.slice(0, 3) : [];
        archList.forEach(a => {
            if (a && a.itemsSummary) {
                Object.keys(a.itemsSummary).forEach(itemName => {
                    const pId = validMainProducts[itemName];
                    if (pId) {
                        const q = Number(a.itemsSummary[itemName]) || 0;
                        historyWeightsById[pId] = (historyWeightsById[pId] || 0) + q;
                        grandTotalHistory += q;
                    }
                });
            }
        });

        if (grandTotalHistory === 0) {
            Object.keys(storeBatches).forEach(otherId => {
                if (otherId === bId || !storeBatches[otherId]?.stock) return;
                const s = storeBatches[otherId].stock;
                mainProdIds.forEach(pId => {
                    const q = Number(s[pId]) || 0;
                    if (q > 0) {
                        historyWeightsById[pId] = (historyWeightsById[pId] || 0) + q;
                        grandTotalHistory += q;
                    }
                });
            });
        }

        if (grandTotalHistory === 0) {
            mainProdIds.forEach(pId => {
                historyWeightsById[pId] = 1;
                grandTotalHistory += 1;
            });
        }

        const exactCalculations = [];
        let currentSum = 0;

        Object.keys(historyWeightsById).forEach(pId => {
            const weight = historyWeightsById[pId];
            if (weight <= 0) return;
            const percentage = weight / grandTotalHistory;
            const exactValue = percentage * totalTarget;
            const floorValue = Math.floor(exactValue);
            const remainder = exactValue - floorValue;

            exactCalculations.push({
                id: pId,
                itemName: prodsObj[pId]?.name || pId,
                floorValue: floorValue,
                remainder: remainder,
                percentage: percentage
            });
            currentSum += floorValue;
        });

        let difference = totalTarget - currentSum;
        exactCalculations.sort((a, b) => b.remainder - a.remainder);
        for (let i = 0; i < difference; i++) {
            exactCalculations[i % exactCalculations.length].floorValue += 1;
        }

        const newStock = { ...(currentBatch.stock || {}) };
        let textLog = `📊 مقترح التوزيع الذكي لعدد (${totalTarget}) طبق/جوز:\n\n`;
        exactCalculations.forEach(item => {
            newStock[item.id] = item.floorValue;
            textLog += `- ${item.itemName}: ${item.floorValue} (${Math.round(item.percentage * 100)}%)\n`;
        });
        textLog += `\nهل توافق على اعتماد هذا التوزيع وحفظه؟`;

        if (!(await askConfirmSafe(textLog, { title: 'اعتماد التوزيع الذكي', tone: 'success', confirmText: 'اعتماد وحفظ' }))) return;

        currentBatch.stock = newStock;
        currentBatch.actualPairs = totalTarget;
        currentBatch.publicPairs = totalTarget;
        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: { stock: newStock, actualPairs: totalTarget, publicPairs: totalTarget }
            }, { merge: true });
            window.renderBatchesUI();
            if (typeof window.showToast === 'function') window.showToast('✨ تم التوزيع الذكي للدفعة بنجاح!');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ التوزيع الذكي!');
        }
    };

    // =========================================================================
    // 🔪 6. نافذة إتمام الذبح / التجهيز للدفعة والترحيل الآمن للفريزر
    // =========================================================================
    window.openSlaughterModal = function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        document.getElementById('slaughter-batch-id').value = bId;

        const cont = document.getElementById('slaughter-items-container');
        if (!cont) return;

        const trackType = window.getBatchTrackType(b);
        const metrics = window.getBatchDeepMetrics(bId, b.name);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const sortedIds = Object.keys(prodsObj)
            .filter(id => {
                if (!prodsObj[id]) return false;
                const hasStockOrBooked = (Number(b.stock?.[id]) || 0) > 0 || (Number(metrics.realBookedByProd[id]) || 0) > 0;
                return doesProductMatchBatchTrack(id, trackType) || hasStockOrBooked;
            })
            .sort((a, b2) => getBatchProductRank(a, prodsObj[a]) - getBatchProductRank(b2, prodsObj[b2]));

        let html = '';
        sortedIds.forEach(id => {
            const p = prodsObj[id];
            const plannedStock = (b.stock && b.stock[id]) ? Number(b.stock[id]) : 0;
            const bookedNow = metrics.realBookedByProd[id] || (b.booked && b.booked[id] ? Number(b.booked[id]) : 0);
            const currentSlaughtered = (b.slaughtered && b.slaughtered[id] !== undefined)
                ? Number(b.slaughtered[id])
                : plannedStock;

            html += `
            <div class="flex justify-between items-center bg-white shadow-sm border border-slate-200/80 p-3 rounded-xl hover:border-rose-300 transition-colors">
                <div>
                    <span class="font-black text-slate-800 text-sm block">${escapeHtmlSafe(p.name)}</span>
                    <span class="text-[10px] font-bold text-slate-400">المتاح بالدفعة: ${plannedStock} | محجوز للعملاء: <strong class="text-blue-600">${Number(bookedNow.toFixed(1))}</strong></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-rose-600">${trackType === 'chicks' ? 'الجاهز:' : 'المذبوح:'}</span>
                    <input type="number" id="slaughter-q-${id}" value="${currentSlaughtered}" min="0" class="w-20 border border-rose-200 bg-rose-50/40 text-center font-black text-rose-700 text-base rounded-lg py-1 outline-none focus:ring-2 focus:ring-rose-300 focus:bg-white transition-all">
                </div>
            </div>`;
        });

        cont.innerHTML = html || '<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد أصناف مرتبطة بهذه الدورة.</div>';
        if (typeof openModal === 'function') openModal('slaughter-modal');
    };

    window.confirmBatchSlaughter = async function () {
        const bId = document.getElementById('slaughter-batch-id').value;
        if (!bId || !storeBatches[bId]) return;

        const btn = document.getElementById('btn-confirm-slaughter');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ والترحيل...';
        btn.disabled = true;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const trackType = window.getBatchTrackType(storeBatches[bId]);

        let slaughteredData = {};
        let expectedValue = 0;
        let freezerNewData = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
        let freezerChanged = false;

        Object.keys(prodsObj).forEach(id => {
            const inputEl = document.getElementById(`slaughter-q-${id}`);
            if (!inputEl) return;
            const q = parseInt(inputEl.value) || 0;
            if (q >= 0) {
                slaughteredData[id] = q;
                const price = getProdPrice(id);
                expectedValue += (q * price);

                // لا نرحّل الكتاكيت الحية (عمر يوم) إلى مخزن الفريزر!
                if (trackType !== 'chicks' && window.getProductTrackType(id) !== 'chicks') {
                    const oldSlaughtered = (storeBatches[bId].slaughtered && storeBatches[bId].slaughtered[id]) ? Number(storeBatches[bId].slaughtered[id]) : 0;
                    const diff = q - oldSlaughtered;
                    if (diff !== 0) {
                        const curFz = Math.max(0, Number(freezerNewData[id]) || 0);
                        freezerNewData[id] = Math.max(0, curFz + diff);
                        if (typeof storeFreezer !== 'undefined') storeFreezer[id] = freezerNewData[id];
                        freezerChanged = true;
                    }
                }
            }
        });

        try {
            const dbBatch = db.batch();
            const slaughterTime = Date.now();

            storeBatches[bId].isOpen = false;
            storeBatches[bId].isVisible = true;
            storeBatches[bId].slaughtered = slaughteredData;
            storeBatches[bId].expectedValue = expectedValue;
            storeBatches[bId].slaughteredAt = slaughterTime;
            storeBatches[bId].urgentNote = '';

            dbBatch.set(db.collection('inventory').doc('batches'), {
                [bId]: {
                    isOpen: false,
                    isVisible: true,
                    urgentNote: firebase.firestore.FieldValue.delete(),
                    slaughtered: slaughteredData,
                    expectedValue: expectedValue,
                    slaughteredAt: slaughterTime
                }
            }, { merge: true });

            if (freezerChanged) {
                dbBatch.set(db.collection('inventory').doc('freezer'), freezerNewData, { merge: true });
            }

            await dbBatch.commit();

            if (typeof closeModal === 'function') closeModal('slaughter-modal');
            window.renderBatchesUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            alert(
                trackType === 'chicks'
                    ? `✅ تم تأكيد جاهزية دورة التفريخ وإغلاق الحجز بنجاح!\n- القيمة الإجمالية المتوقعة: ${expectedValue.toLocaleString()} ج.م`
                    : `✅ تم إتمام الذبح بنجاح!\n- تم قفل الحجز على الدفعة.\n- تم ترحيل الكميات المذبوحة إلى مخزن الفريزر.\n- القيمة الإجمالية للمذبوح: ${expectedValue.toLocaleString()} ج.م`
            );
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ البيانات!');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    };

    // دالة الحذف الآمن للدفعة (باستخدام FieldValue.delete بدون الكتابة فوق باقي الدفعات)
    window.deleteBatchUI = async function (bId) {
        const targetBatch = storeBatches[bId];
        const batchTitle = targetBatch && targetBatch.name ? targetBatch.name : 'هذه الدفعة';

        if (!(await askConfirmSafe(`⚠️ هل أنت متأكد من حذف (${batchTitle}) نهائياً من النظام؟`, { title: 'حذف الدفعة نهائياً', tone: 'danger', confirmText: 'نعم، حذف نهائي' }))) return;

        try {
            delete storeBatches[bId];

            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').update({
                    [bId]: firebase.firestore.FieldValue.delete()
                }).catch(() => db.collection('inventory').doc('batches').set(storeBatches));

                const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
                const linkedOrders = ordersList.filter(o => o && o.batchId === bId);
                for (let i = 0; i < linkedOrders.length; i += 400) {
                    const chunk = linkedOrders.slice(i, i + 400);
                    const batchWrite = db.batch();
                    chunk.forEach(o => {
                        o.batchId = '';
                        if (o.batchName === 'دفعة غير مسماة') o.batchName = '';
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                            globalOrdersMap[o.id].batchId = '';
                            if (globalOrdersMap[o.id].batchName === 'دفعة غير مسماة') globalOrdersMap[o.id].batchName = '';
                        }
                        const upData = { batchId: '' };
                        if (o.batchName === '') upData.batchName = '';
                        batchWrite.update(db.collection('orders').doc(o.id), upData);
                    });
                    await batchWrite.commit();
                }
            }

            window.batchUIState.focusedBatchId = null;
            window.batchUIState.viewMode = 'focus';
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.showToast === 'function') {
                window.showToast(`🗑️ تم حذف (${batchTitle}) نهائياً من النظام!`);
            } else {
                alert(`تم حذف (${batchTitle}) نهائياً بنجاح!`);
            }
        } catch (e) {
            console.error('Delete Batch Error:', e);
            alert('حدث خطأ أثناء الحذف: ' + (e.message || e));
        }
    };

    const _prevScheduleRenderBatches = window.scheduleSystemRender;
    window.scheduleSystemRender = function () {
        if (typeof _prevScheduleRenderBatches === 'function') {
            _prevScheduleRenderBatches();
        }
        const batchesView = document.getElementById('view-batches');
        if (batchesView && batchesView.classList.contains('active')) {
            window.renderBatchesUI();
        }
    };
})();

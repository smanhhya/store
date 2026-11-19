// =========================================================================
// 🐣 مركز القيادة الشامل للدفعات، الذبح، التوزيع الذكي، والترحيل (www/batches.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة التنفيذية (Focus Workspace)
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

    // تصنيف الصنف (سمان لحم أساسي مقابل إضافات كالبيض والكتاكيت)
    function isMainQuailProduct(pId) {
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const p = prodsObj[pId];
        if (!p) return true;
        if (p.isExtra) return false;
        const name = String(p.name || '').toLowerCase();
        if (pId === 'eggs' || pId === 'chicks' || name.includes('بيض') || name.includes('كتكوت') || name.includes('كتاكيت')) {
            return false;
        }
        return true;
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
                        realBookedByProd[targetPid] = (realBookedByProd[targetPid] || 0) + q;
                        if (st === 'completed') {
                            realCompletedByProd[targetPid] = (realCompletedByProd[targetPid] || 0) + q;
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

    function getBatchBioStatus(b) {
        if (!b) return { ageDays: null, targetAge: 40, remainingDays: null, stageLabel: 'غير محدد', stageColor: 'bg-slate-100 text-slate-600 border-slate-200', autoMsg: '' };

        const targetAge = Number(b.slaughterAge) || 40;
        let ageDays = null;
        let remainingDays = null;

        if (b.hatchDate) {
            ageDays = Math.max(0, Math.floor((Date.now() - b.hatchDate) / (1000 * 60 * 60 * 24)));
            remainingDays = targetAge - ageDays;
        }

        let stageLabel = '📋 جاهزة للتشغيل';
        let stageColor = 'bg-slate-100 text-slate-700 border-slate-200';
        let autoMsg = '';

        if (b.isVisible === false) {
            stageLabel = '🚫 مخفية عن المتجر';
            stageColor = 'bg-red-50 text-red-600 border-red-200';
            autoMsg = 'هذه الدفعة مخفية حالياً ولا تظهر للعملاء في المتجر.';
        } else if (b.slaughteredAt) {
            const daysSinceSlaughter = (Date.now() - b.slaughteredAt) / (1000 * 60 * 60 * 24);
            if (daysSinceSlaughter >= 3) {
                stageLabel = '✅ تم التسليم بالكامل';
                stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                autoMsg = '✅ تم تسليم هذه الدفعة للعملاء بالكامل. بالهنا والشفا!';
            } else {
                stageLabel = '🛵 تم الذبح وجاري التوزيع';
                stageColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                autoMsg = '🛵 تم الذبح وجاري التوزيع.. انتظروا تواصل المناديب للتسليم!';
            }
        } else if (!b.isOpen) {
            stageLabel = '🔒 مكتملة الحجز';
            stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
            autoMsg = '✅ الدورة اكتملت واكتفينا بالحجز! السمان الآن في مرحلة التجهيز والذبح وجاري ترتيب مواعيد التسليم.';
        } else if (ageDays !== null) {
            if (remainingDays <= 0) {
                stageLabel = '🔪 جاهز للذبح الآن';
                stageColor = 'bg-rose-50 text-rose-700 border-rose-200';
                autoMsg = '🔪 السمان وصل لمرحلة النضج وجاهز فريش! سيتم قفل الحجز وتحديد مواعيد التسليم قريباً.';
            } else if (remainingDays <= 5) {
                stageLabel = `⏳ باقي ${remainingDays}ي للذبح`;
                stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
                autoMsg = '⏳ أيام بسيطة جداً والسمان يكون جاهز! استعدوا لاستلام أوردراتكم قريباً.';
            } else if (ageDays <= 15) {
                stageLabel = `🐣 تحضين (${ageDays} يوم)`;
                stageColor = 'bg-sky-50 text-sky-700 border-sky-200';
                autoMsg = '🐣 السمان حالياً في مرحلة التحضين والرعاية الأولية، بنجهزلكم أفضل جودة إن شاء الله!';
            } else {
                stageLabel = `📈 تسمين (${ageDays}/${targetAge} يوم)`;
                stageColor = 'bg-purple-50 text-purple-700 border-purple-200';
                autoMsg = '📈 السمان بيكبر وفي مرحلة التسمين وبناء اللحم الممتاز، تابعونا لتحديد موعد الذبح قريباً.';
            }
        } else {
            stageLabel = '🟢 مفتوحة للحجز';
            stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            autoMsg = 'متاح الحجز الآن في هذه الدفعة.';
        }

        return { ageDays, targetAge, remainingDays, stageLabel, stageColor, autoMsg };
    }

    // دوال التنقل السريع داخل مركز قيادة الدفعات
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

    // حساب سقف الدفعة الكلي بالجوز والفردة
    window.getBatchCeilingAndRemaining = function (bId) {
        const b = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches[bId] : null;
        if (!b) return { ceilingPairs: 0, ceilingBirds: 0, bookedPairs: 0, bookedBirds: 0, remainingPairs: 0, remainingBirds: 0, allocatedPairs: 0 };

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const metrics = window.getBatchDeepMetrics(bId, b.name);

        let allocatedMeatPairs = 0;
        let bookedMeatPairs = 0;

        Object.keys(prodsObj).forEach(pId => {
            if (!prodsObj[pId]) return;
            if (isMainQuailProduct(pId)) {
                allocatedMeatPairs += (Number(b.stock?.[pId]) || 0);
                const savedB = Number(b.booked?.[pId]) || 0;
                const liveB = metrics.realBookedByProd[pId] || 0;
                bookedMeatPairs += ((metrics.totalOrders > 0 || savedB === 0) ? liveB : savedB);
            }
        });

        const explicitPairs = Number(b.actualPairs);
        const publicPairs = Number(b.publicPairs);

        let effectiveCeilingPairs = 0;
        if (!isNaN(explicitPairs) && explicitPairs > 0) {
            effectiveCeilingPairs = explicitPairs;
        } else if (allocatedMeatPairs > 0) {
            effectiveCeilingPairs = allocatedMeatPairs;
        } else if (!isNaN(publicPairs) && publicPairs > 0) {
            effectiveCeilingPairs = publicPairs;
        }

        const remainingPairs = Number((effectiveCeilingPairs - bookedMeatPairs).toFixed(1));

        return {
            ceilingPairs: effectiveCeilingPairs,
            ceilingBirds: Math.round(effectiveCeilingPairs * 2),
            allocatedPairs: allocatedMeatPairs,
            bookedPairs: Number(bookedMeatPairs.toFixed(1)),
            bookedBirds: Math.round(bookedMeatPairs * 2),
            remainingPairs: remainingPairs,
            remainingBirds: Math.round(remainingPairs * 2)
        };
    };

    // تعديل سقف الدفعة الكلي مباشرة وحفظه مع مزامنة الخانات الفرعية
    window.updateBatchTotalPairsCeiling = async function (bId, val) {
        if (!storeBatches[bId]) return;
        const b = storeBatches[bId];
        const pairs = Math.max(0, parseInt(val) || 0);

        b.actualPairs = pairs;
        b.publicPairs = pairs;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        let oldAllocatedSum = 0;
        const mainIds = [];
        Object.keys(prodsObj).forEach(pId => {
            if (prodsObj[pId] && isMainQuailProduct(pId)) {
                mainIds.push(pId);
                oldAllocatedSum += (Number(b.stock?.[pId]) || 0);
            }
        });

        if (pairs > 0 && oldAllocatedSum > 0 && oldAllocatedSum !== pairs) {
            const syncChoice = await askConfirmSafe(
                `🎯 تم تغيير سقف الدفعة إلى (${pairs} جوز = ${pairs * 2} فردة).\n\n` +
                `مجموع خانات الأصناف بالأسفل ما زال مسجلاً على الرقم القديم (${oldAllocatedSum} جوز).\n` +
                `اضغط "توزيع تلقائي" لتعديل خانات الأصناف تلقائياً بنسبة السقف الجديد، أو "تراجع" لتصفير الخانات القديمة والاعتماد على السقف الكلي (${pairs}) فقط.`,
                { title: 'مزامنة سقف الدفعة مع الأصناف', tone: 'brand', confirmText: 'توزيع تلقائي', cancelText: 'تصفير الخانات' }
            );
            if (!b.stock) b.stock = {};
            if (syncChoice) {
                let runningSum = 0;
                mainIds.forEach((pId, idx) => {
                    const oldVal = Number(b.stock[pId]) || 0;
                    if (idx === mainIds.length - 1) {
                        b.stock[pId] = Math.max(0, pairs - runningSum);
                    } else {
                        const scaled = Math.round((oldVal / oldAllocatedSum) * pairs);
                        b.stock[pId] = scaled;
                        runningSum += scaled;
                    }
                });
            } else {
                mainIds.forEach(pId => { b.stock[pId] = 0; });
            }
        } else if (pairs === 0 && oldAllocatedSum > 0) {
            mainIds.forEach(pId => { if (b.stock) b.stock[pId] = 0; });
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
            window.showToast(`🎯 تم تثبيت سقف الدفعة على (${pairs} جوز = ${pairs * 2} فردة) بنجاح!`);
        }
    };

    // تحديث شريط عداد الدفعة الحي داخل نافذة "إنشاء طلب جديد" لحظياً أثناء كتابة الطلب
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

        const cap = window.getBatchCeilingAndRemaining(bId);
        let currentOrderMeatPairs = 0;
        Object.keys(prodsObj).forEach(id => {
            if (isMainQuailProduct(id)) {
                const qInput = document.getElementById(`no-q-${id}`);
                const q = Number(qInput?.value) || 0;
                if (q > 0) {
                    const birds = Number(qInput?.getAttribute('data-count')) || q;
                    currentOrderMeatPairs += prodsObj[id].isWeightBased ? birds : q;
                }
            }
        });

        const afterOrderBookedPairs = Number((cap.bookedPairs + currentOrderMeatPairs).toFixed(1));
        const afterOrderRemPairs = Number((cap.ceilingPairs - afterOrderBookedPairs).toFixed(1));
        const afterOrderRemBirds = Math.round(afterOrderRemPairs * 2);
        const isOver = cap.ceilingPairs > 0 && afterOrderRemPairs < 0;

        meterDiv.classList.remove('hidden');
        if (cap.ceilingPairs <= 0) {
            meterDiv.innerHTML = `
                <div class="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs font-black flex items-center justify-between">
                    <span>📌 محجوز بالدفعة حالياً: ${cap.bookedPairs} جوز (${cap.bookedBirds} فردة) + طلبك الحالي (${currentOrderMeatPairs})</span>
                    <span class="text-[10px] text-amber-700">لم يحدد سقف كلي للدفعة بعد</span>
                </div>`;
        } else {
            meterDiv.innerHTML = `
                <div class="${isOver ? 'bg-red-600 text-white animate-pulse' : 'bg-teal-900 text-white'} p-3 rounded-xl text-xs font-black flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div>
                        <span>🎯 سقف (${storeBatches[bId].name}): <strong class="text-amber-300">${cap.ceilingPairs} جوز (${cap.ceilingBirds} فردة)</strong></span>
                        <span class="mx-1.5 opacity-50">|</span>
                        <span>محجوز شامل طلبك: <strong class="text-emerald-300">${afterOrderBookedPairs} جوز</strong></span>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg ${isOver ? 'bg-white text-red-700' : 'bg-white/15 text-amber-300'}">
                        ${isOver ? `⚠️ تخطى سقف الدفعة بـ ${Math.abs(afterOrderRemPairs)} جوز!` : `🟢 متبقي بالدفعة: ${afterOrderRemPairs} جوز (${afterOrderRemBirds} فردة)`}
                    </span>
                </div>`;
        }
    };

    // =========================================================================
    // 🎛️ 2. رسم مركز قيادة الدفعات بنظام التركيز (صفر توهان + 3 تبويبات منظمة)
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
        let globalOpenCount = 0;

        batchIds.forEach(bId => {
            const b = batchesObj[bId];
            if (b.isOpen) globalOpenCount++;
            const metrics = window.getBatchDeepMetrics(bId, b.name);
            const bio = getBatchBioStatus(b);
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
                const capMsg = `تخطى السقف بـ ${Math.abs(cap.remainingPairs)} جوز`;
                overbookedItems.push(capMsg);
                globalOverbookedAlerts.push(`${b.name}: ${capMsg}`);
            }

            const sellProgress = cap.ceilingPairs > 0 ? Math.min(100, Math.round((cap.bookedPairs / cap.ceilingPairs) * 100)) : 0;

            batchMetaMap[bId] = { b, metrics, bio, cap, hasBookingMismatch, overbookedItems, sellProgress };
        });

        // اختيار الدفعة النشطة تلقائياً إذا لم يختَر المستخدم دفعة بعد
        if (!window.batchUIState.focusedBatchId || !batchesObj[window.batchUIState.focusedBatchId]) {
            const firstOpenId = batchIds.find(id => batchesObj[id]?.isOpen);
            window.batchUIState.focusedBatchId = firstOpenId || batchIds[0];
        }

        const focusedId = window.batchUIState.focusedBatchId;
        const viewMode = window.batchUIState.viewMode || 'focus';

        // 1. شريط اختيار الدفعات الأنيق في الأعلى (تبديل بلمسة واحدة بدون تقليب)
        const selectorPillsHtml = batchIds.map(bId => {
            const m = batchMetaMap[bId];
            const isSel = (viewMode === 'focus' && focusedId === bId);
            const dot = m.b.isOpen ? '🟢' : (m.b.slaughteredAt ? '🛵' : '🔒');
            const remTxt = m.cap.ceilingPairs > 0 ? `• متبقي ${m.cap.remainingPairs}` : `• ${m.metrics.totalOrders} طلب`;

            return `
                <button type="button" onclick="selectFocusedBatch('${bId}')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 shrink-0 ${isSel ? 'bg-teal-600 text-white border-teal-600 shadow-md' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}">
                    <span>${dot} ${m.b.name}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-md ${isSel ? 'bg-white/20 text-amber-200' : 'bg-white text-slate-500 border border-slate-200'}">${remTxt}</span>
                </button>
            `;
        }).join('');

        const topSelectorBarHtml = `
            ${globalOverbookedAlerts.length > 0 ? `
            <div class="bg-red-600 text-white px-3.5 py-2 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-300 shrink-0"></i>
                <span class="truncate">تنبيه عجز كميات: ${globalOverbookedAlerts.join(' | ')}</span>
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

        // 2. وضع مقارنة جميع الدفعات (Compare All Mode - كروت مختصرة بلمحة عين)
        if (viewMode === 'compare_all') {
            const compareCardsHtml = batchIds.map(bId => {
                const m = batchMetaMap[bId];
                const b = m.b;
                return `
                    <div onclick="selectFocusedBatch('${bId}')" class="bg-white p-4 rounded-2xl border-2 ${b.isOpen ? 'border-emerald-200 hover:border-emerald-500' : 'border-slate-200 hover:border-teal-500'} shadow-sm cursor-pointer transition-all space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <h4 class="font-black text-slate-900 text-sm sm:text-base">${b.name}</h4>
                                <span class="inline-block mt-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${m.bio.stageColor}">${m.bio.stageLabel}</span>
                            </div>
                            <span class="bg-slate-900 text-amber-300 px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0">${m.metrics.totalOrders} طلب</span>
                        </div>

                        <div class="space-y-1">
                            <div class="flex justify-between text-[11px] font-black">
                                <span class="text-slate-600">محجوز: ${m.cap.bookedPairs} / ${m.cap.ceilingPairs} جوز</span>
                                <span class="${m.cap.remainingPairs < 0 ? 'text-rose-600' : 'text-emerald-700'}">متبقي: ${m.cap.remainingPairs} جوز</span>
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
        const metrics = meta.metrics;
        const bio = meta.bio;
        const cap = meta.cap;
        const activeTab = window.batchUIState.activeInnerTab || 'stock';
        const showZeros = Boolean(window.batchUIState.showZeroProducts[focusedId]);
        const safeBName = escapeJsAttr(b.name);

        // بناء محتوى التبويب الداخلي المختار
        let innerTabContentHtml = '';

        // --- التبويب 1: الكميات والأصناف (مرتب بالنظام الموحد) ---
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

                const isPinnedItem = (typeof window.isProductPinnedForAdmin === 'function')
                    ? window.isProductPinnedForAdmin(pId)
                    : isMainQuailProduct(pId);

                const remCls = remaining < 0
                    ? 'bg-red-600 text-white border-red-600 animate-pulse'
                    : (remaining === 0 && bStock > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800');

                const safePName = escapeJsAttr(p.name);
                const cardHtml = `
                    <div class="bg-slate-50/90 p-2.5 rounded-2xl border ${remaining < 0 ? 'border-red-300 bg-red-50/30' : 'border-slate-200/80'} space-y-2">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-xs font-black text-slate-900 truncate">${p.name}</span>
                            <span class="text-[10px] font-black text-emerald-700 bg-white px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0">${prodPrice} ج</span>
                        </div>
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

                if (isPinnedItem || bStock > 0 || bBooked > 0) {
                    mainCardsHtml += cardHtml;
                } else {
                    extraHiddenCount++;
                    if (showZeros) extraCardsHtml += cardHtml;
                }
            });

            innerTabContentHtml = `
                <div class="space-y-3">
                    <!-- أدوات التحكم السريع في الكميات -->
                    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                        <div class="flex items-center gap-1.5 text-[11px] font-black text-teal-900">
                            <span>🎯 السقف الكلي للدفعة:</span>
                            <input type="number" value="${cap.ceilingPairs || ''}" onchange="updateBatchTotalPairsCeiling('${focusedId}', this.value)" placeholder="200" class="w-16 bg-white border-2 border-teal-300 rounded-lg py-0.5 px-1 text-center font-black text-xs text-teal-900 outline-none">
                            <span class="text-[10px] text-slate-500">جوز (${cap.ceilingBirds} فردة)</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="smartDistributeBatch('${focusedId}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-1 active:scale-95">
                                <i class="fa-solid fa-wand-magic-sparkles text-amber-300 text-[10px]"></i> توزيع ذكي
                            </button>
                            ${meta.hasBookingMismatch ? `
                            <button type="button" onclick="syncAndHealBatchBooked('${focusedId}', '${safeBName}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-sm animate-pulse flex items-center gap-1">
                                <i class="fa-solid fa-rotate text-[10px]"></i> مطابقة المحجوز
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- شبكة الأصناف الأساسية المرتبة -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        ${mainCardsHtml || '<div class="col-span-full text-center py-6 text-xs font-bold text-slate-400">لا توجد أصناف مسجلة</div>'}
                    </div>

                    ${extraHiddenCount > 0 ? `
                    <div class="pt-1">
                        <button type="button" onclick="toggleBatchZeroProducts('${focusedId}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black border border-dashed border-slate-300 transition-all">
                            ${showZeros ? 'إخفاء الأصناف الإضافية الصفرية ▲' : `+ إظهار باقي الأصناف الأخرى (${extraHiddenCount} صنف) ▼`}
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
                            <span class="text-xs font-black"><i class="fa-solid fa-location-dot text-indigo-500 ml-1"></i>${z}</span>
                            <span class="text-[10px] font-black bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-lg">${zInfo.count} طلب • ${zInfo.netRevenue.toLocaleString()} ج</span>
                        </button>
                    `;
                }).join('')
                : '<div class="col-span-full text-center py-6 text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">لا توجد طلبات مسجلة على هذه الدفعة حتى الآن.</div>';

            innerTabContentHtml = `
                <div class="space-y-3.5">
                    <!-- أزرار تشغيل سريعة للطلبات -->
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

                    <!-- مراحل طلبات الدفعة (اضغط للانتقال مباشرة) -->
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

                    <!-- توزيع المناطق الجغرافي للدفعة -->
                    <div>
                        <span class="text-[11px] font-black text-slate-500 block mb-2">📍 توزيع الطلبات حسب المنطقة (${sortedZones.length} منطقة):</span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            ${zonesChipsHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        // --- التبويب 3: الذبح، الواتساب، إعدادات العرض، والإغلاق ---
        else {
            const delWindowStr = (b.deliveryStart || b.deliveryEnd)
                ? `${b.deliveryStart || ''} ${b.deliveryEnd ? '⬅️ ' + b.deliveryEnd : ''}`
                : 'غير محدد بعد';

            innerTabContentHtml = `
                <div class="space-y-3">
                    <!-- معاينة رسالة المتجر الحالية للعميل -->
                    <div class="bg-purple-50/70 border border-purple-200 p-3 rounded-2xl space-y-1">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-[11px] font-black text-purple-900"><i class="fa-solid fa-bullhorn text-purple-600 ml-1"></i> رسالة الدفعة الظاهرة للعملاء بالمتجر الآن:</span>
                            <span class="text-[10px] font-black bg-white text-slate-600 px-2 py-0.5 rounded-lg border border-purple-200">📅 التسليم: ${delWindowStr}</span>
                        </div>
                        <p class="text-xs font-bold text-slate-700 leading-relaxed bg-white p-2.5 rounded-xl border border-purple-100">
                            ${b.urgentNote ? `<strong class="text-amber-700 block mb-0.5">📌 تنبيه: ${b.urgentNote}</strong>` : ''}${bio.autoMsg}
                        </p>
                    </div>

                    <!-- خطوات التشغيل الأساسية مرتبة بوضوح -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button type="button" onclick="openBatchSettings('${focusedId}')" class="bg-white hover:bg-purple-50 border-2 border-purple-200 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-purple-900 block">1. إعدادات العمر والتواريخ والرسالة</span>
                                <span class="text-[10px] font-bold text-slate-500">تعديل عمر السمان، مواعيد التسليم، والتنبيه الطارئ</span>
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
                                <span class="text-xs font-black text-rose-900 block">3. إتمام الذبح والترحيل للفريزر</span>
                                <span class="text-[10px] font-bold text-slate-500">${b.expectedValue ? `تم الذبح (قيمة متوقعة: ${b.expectedValue.toLocaleString()} ج)` : 'تسجيل المذبوح الفعلي وقفل الحجز تلقائياً'}</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-knife-kitchen"></i></span>
                        </button>

                        <button type="button" onclick="archiveBatch('${focusedId}')" class="bg-white hover:bg-amber-50 border-2 border-amber-300 p-3.5 rounded-2xl text-right flex items-center justify-between gap-3 transition-all shadow-sm">
                            <div>
                                <span class="text-xs font-black text-amber-950 block">4. إغلاق وترحيل الدفعة للأرشيف</span>
                                <span class="text-[10px] font-bold text-slate-500">حفظ التقرير الختامي وأرشفة الطلبات المكتملة فقط</span>
                            </div>
                            <span class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><i class="fa-solid fa-box-archive"></i></span>
                        </button>
                    </div>

                    <!-- منطقة الخطر المعزولة للحذف -->
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

        // بطاقة القيادة الموحدة للدفعة المختارة
        const focusedWorkspaceHtml = `
            <div class="w-full max-w-full overflow-hidden bg-white rounded-[1.5rem] shadow-soft border-2 ${b.isOpen ? 'border-emerald-500/35' : 'border-slate-200'} p-3.5 sm:p-5 space-y-3.5">
                <!-- 1. رأس الدفعة: الاسم + العمر + مفاتيح المتجر والحجز -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                    <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        <div class="relative flex-1 min-w-[160px] max-w-xs">
                            <i class="fa-solid fa-pen absolute right-2.5 top-2.5 text-slate-400 text-[10px] pointer-events-none"></i>
                            <input type="text" value="${b.name}" onchange="updateBatchNameAndOrders('${focusedId}', this.value)" class="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl py-1.5 pr-7 pl-2 text-sm font-black text-slate-900 outline-none focus:border-brand-primary">
                        </div>
                        <span class="px-2.5 py-1 rounded-xl text-[10px] font-black border ${bio.stageColor}">${bio.stageLabel}</span>
                        ${bio.ageDays !== null ? `
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
                        <span>🥩 حُجز <strong class="text-emerald-300 text-sm">${cap.bookedPairs}</strong> من <strong class="text-white">${cap.ceilingPairs} جوز</strong> (${cap.ceilingBirds} فردة)</span>
                        <span class="px-2.5 py-0.5 rounded-lg text-[11px] ${cap.remainingPairs < 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-white/15 text-amber-300'}">
                            ${cap.remainingPairs < 0 ? `عجز ${Math.abs(cap.remainingPairs)} جوز!` : `متبقي: ${cap.remainingPairs} جوز (${cap.remainingBirds} فردة)`}
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

                <!-- 3. شريط التبويبات الداخلية الـ 3 (بدون أي زحمة) -->
                <div class="grid grid-cols-3 gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-200/80">
                    <button type="button" onclick="setBatchInnerTab('stock')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('stock')}">
                        📦 الكميات والأصناف
                    </button>
                    <button type="button" onclick="setBatchInnerTab('orders_zones')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('orders_zones')}">
                        📋 الطلبات (${metrics.totalOrders})
                    </button>
                    <button type="button" onclick="setBatchInnerTab('lifecycle')" class="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all ${innerTabBtnCls('lifecycle')}">
                        ⚙️ الذبح والإغلاق
                    </button>
                </div>

                <!-- 4. محتوى التبويب النشط -->
                <div>${innerTabContentHtml}</div>
            </div>
        `;

        cont.innerHTML = topSelectorBarHtml + focusedWorkspaceHtml;
    };

    // =========================================================================
    // ➕ 3. إنشاء دورة جديدة وتحديث الكميات والأسماء بأمان تام
    // =========================================================================
    window.addNewBatchUI = async function () {
        const defaultName = `دفعة ${new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}`;
        const batchNameInput = await askPromptSafe('🐣 اكتب اسم الدورة / الدفعة الجديدة (مثال: دفعة الخميس 20 نوفمبر):', defaultName, { title: 'إنشاء دورة جديدة', tone: 'brand', confirmText: 'إنشاء الدفعة' });
        if (batchNameInput === null) return;
        const cleanName = batchNameInput.trim() || defaultName;

        const bId = 'batch_' + Date.now();
        storeBatches[bId] = {
            name: cleanName,
            isOpen: true,
            isVisible: true,
            stock: {},
            booked: {},
            hatchDate: Date.now()
        };

        try {
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set({ [bId]: storeBatches[bId] }, { merge: true });
            }
            window.batchUIState.viewMode = 'focus';
            window.batchUIState.focusedBatchId = bId;
            window.batchUIState.activeInnerTab = 'stock';
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.showToast === 'function') window.showToast(`🎉 تم إنشاء (${cleanName}) بنجاح!`);
        } catch (e) {
            console.error('Error creating batch:', e);
        }
    };

    window.updateBatchStock = async function (bId, pId, val) {
        if (!storeBatches[bId]) return;
        const b = storeBatches[bId];
        if (!b.stock) b.stock = {};
        b.stock[pId] = Math.max(0, parseInt(val) || 0);

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        let newMainSum = 0;
        Object.keys(prodsObj).forEach(k => {
            if (prodsObj[k] && isMainQuailProduct(k)) {
                newMainSum += (Number(b.stock[k]) || 0);
            }
        });

        if (newMainSum > 0) {
            b.actualPairs = newMainSum;
            b.publicPairs = newMainSum;
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
                batchWrite.update(db.collection('orders').doc(o.id), { status: 'processing' });
                o.status = 'processing';
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].status = 'processing';
                }
                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        if (i.id) {
                            const cur = Math.max(0, Number(fzNew[i.id]) || 0);
                            fzNew[i.id] = Math.max(0, cur - (Number(i.quantity) || 0));
                            if (typeof storeFreezer !== 'undefined') storeFreezer[i.id] = fzNew[i.id];
                            fzTouched = true;
                        }
                    });
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
            zoneOpts += `<option value="${z}" ${zFilter === z ? 'selected' : ''}>📍 ${z} (${metrics.zonesMap[z].count} طلب)</option>`;
        });

        const itemsPillsHtml = Object.keys(filteredItemsSum).map(nm => `
            <div class="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-center">
                <span class="block text-[10px] font-bold text-slate-500">${nm}</span>
                <span class="text-base font-black text-brand-primary">${Number(filteredItemsSum[nm].toFixed(2))}</span>
            </div>
        `).join('');

        let tableRowsHtml = '';
        filteredOrders.forEach((o, idx) => {
            const itemsStr = Array.isArray(o.items)
                ? o.items.map(i => `<span class="bg-indigo-50 px-2 py-0.5 rounded-lg text-indigo-700 font-black border border-indigo-100 text-xs inline-block m-0.5">${i.quantity}x ${i.name}</span>`).join(' ')
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
                        <div class="font-black text-slate-800 text-sm mb-0.5">${o.customerName || 'عميل'} <span class="text-[10px] font-bold text-slate-400">(${stAr})</span></div>
                        <div class="text-[11px] text-slate-600 font-bold"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${locationStr}</div>
                    </td>
                    <td class="p-3.5 font-black text-slate-700 text-xs" dir="ltr">
                        ${o.customerPhone || ''}
                        ${o.customerPhone2 ? `<br><span class="text-[10px] text-purple-600">بديل: ${o.customerPhone2}</span>` : ''}
                    </td>
                    <td class="p-3.5">${itemsStr}</td>
                    <td class="p-3.5 font-black text-brand-primary text-center text-base">
                        ${o.total || 0} <span class="text-xs">ج</span>
                        ${payStr}
                    </td>
                    <td class="p-3.5 text-[11px] font-bold text-amber-700 max-w-[180px] leading-relaxed">${o.driverNote || o.adminNote || '-'}</td>
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
    // 🔪 6. نافذة إتمام الذبح للدفعة والترحيل الآمن للفريزر
    // =========================================================================
    window.openSlaughterModal = function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        document.getElementById('slaughter-batch-id').value = bId;

        const cont = document.getElementById('slaughter-items-container');
        if (!cont) return;

        const metrics = window.getBatchDeepMetrics(bId, b.name);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const sortedIds = Object.keys(prodsObj)
            .filter(id => Boolean(prodsObj[id]))
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
                    <span class="font-black text-slate-800 text-sm block">${p.name}</span>
                    <span class="text-[10px] font-bold text-slate-400">المتاح بالدفعة: ${plannedStock} | محجوز للعملاء: <strong class="text-blue-600">${Number(bookedNow.toFixed(1))}</strong></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-rose-600">المذبوح:</span>
                    <input type="number" id="slaughter-q-${id}" value="${currentSlaughtered}" min="0" class="w-20 border border-rose-200 bg-rose-50/40 text-center font-black text-rose-700 text-base rounded-lg py-1 outline-none focus:ring-2 focus:ring-rose-300 focus:bg-white transition-all">
                </div>
            </div>`;
        });

        cont.innerHTML = html;
        if (typeof openModal === 'function') openModal('slaughter-modal');
    };

    window.confirmBatchSlaughter = async function () {
        const bId = document.getElementById('slaughter-batch-id').value;
        if (!bId || !storeBatches[bId]) return;

        const btn = document.getElementById('btn-confirm-slaughter');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الترحيل للفريزر...';
        btn.disabled = true;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

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

                const oldSlaughtered = (storeBatches[bId].slaughtered && storeBatches[bId].slaughtered[id]) ? Number(storeBatches[bId].slaughtered[id]) : 0;
                const diff = q - oldSlaughtered;
                if (diff !== 0) {
                    const curFz = Math.max(0, Number(freezerNewData[id]) || 0);
                    freezerNewData[id] = Math.max(0, curFz + diff);
                    if (typeof storeFreezer !== 'undefined') storeFreezer[id] = freezerNewData[id];
                    freezerChanged = true;
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

            alert(`✅ تم إتمام الذبح بنجاح!\n- تم قفل الحجز على الدفعة.\n- تم ترحيل الكميات المذبوحة إلى مخزن الفريزر.\n- القيمة الإجمالية للمذبوح: ${expectedValue.toLocaleString()} ج.م`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ الذبح والترحيل للفريزر!');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    };

    // دالة الحذف الجذري للدفعة
    window.deleteBatchUI = async function (bId) {
        const targetBatch = storeBatches[bId];
        const batchTitle = targetBatch && targetBatch.name ? targetBatch.name : 'هذه الدفعة';

        if (!(await askConfirmSafe(`⚠️ هل أنت متأكد من حذف (${batchTitle}) نهائياً من النظام؟`, { title: 'حذف الدفعة نهائياً', tone: 'danger', confirmText: 'نعم، حذف نهائي' }))) return;

        try {
            delete storeBatches[bId];
            Object.keys(storeBatches).forEach(k => {
                const item = storeBatches[k];
                if (!item || typeof item !== 'object' || !item.name || item.name === 'undefined' || item.name.trim() === '') {
                    delete storeBatches[k];
                }
            });

            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set(storeBatches);

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

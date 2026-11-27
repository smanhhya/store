// =========================================================================
// 🎁 استوديو العروض، الباكجات، وخزنة الهدايا الذكية (store-main/www/offers-studio.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يتحكم بالكامل في: خزنة النقاط (هدايا البيض بقيمة أعلى 🆚 خصم كاش بقيمة أقل) + السُلّم السري + الباكجات
// =========================================================================

(function () {
    const OFFERS_MIRROR_KEY = 'sman_loyalty_offers_mirror_v1';

    function getDefaultOffersConfig() {
        return {
            enabled: true,
            updatedAt: Date.now(),

            // 1. إعدادات خزنة الهدايا والنقاط (تحكم مرن كامل من الإدارة)
            wallet: {
                enabled: true,
                pointsPer100: 5,               // 5 نقاط لكل 100 ج
                pointValueEGP: 0.40,           // قيمة مرجعية لهدايا البيض
                cashPointValueEGP: 0.28,       // قيمة النقطة عند اختيار خصم كاش (125 نقطة = 35 ج)
                minPointsForCash: 125,         // أقل نقاط لفتح الكاش (اكتب 0 لفتحه بدون حد أدنى)
                eggPlateRealCost: 40,          // تكلفتك الحقيقية لطبق البيض
                allowGiftRedemption: true,     // فتح/قفل هدايا البيض (القيمة الأعلى)
                allowCashRedemption: true,     // فتح/قفل الخصم الكاش (القيمة الأقل)
                minOrderForRedeemEGP: 110,     // أقل أوردر لاستخدام النقاط
                rewards: [
                    {
                        id: 'rew_egg_1',
                        title: '🥚 طبق بيض سمان هدية (18 بيضة)',
                        productId: 'eggs',
                        qty: 1,
                        pointsCost: 125,
                        realCostEGP: 40,
                        enabled: true
                    },
                    {
                        id: 'rew_egg_2',
                        title: '🥚🥚 طبقين بيض سمان هدية (36 بيضة)',
                        productId: 'eggs',
                        qty: 2,
                        pointsCost: 250,
                        realCostEGP: 80,
                        enabled: true
                    }
                ]
            },

            // 2. سُلّم هدايا أطباق السمان المذبوح فقط (يعمل في الخلفية كمفاجآت بدون إظهار القواعد للعميل)
            ladder: {
                enabled: true,
                showTemptationBar: false,
                blockWithPromoCode: true,
                fallbackPointsIfOutOfStock: true,
                fallbackPointsPerEggPlate: 125,
                tiers: [
                    {
                        id: 'tier_4',
                        minPlates: 4,
                        rewardType: 'points_multiplier', // 'points_multiplier' | 'free_product'
                        multiplier: 1.5,
                        productId: 'eggs',
                        giftQty: 1,
                        label: 'نقاط مضاعفة 1.5x',
                        enabled: true
                    },
                    {
                        id: 'tier_7',
                        minPlates: 7,
                        rewardType: 'points_multiplier',
                        multiplier: 2,
                        productId: 'eggs',
                        giftQty: 1,
                        label: 'ضعف النقاط 2x 🔥',
                        enabled: true
                    },
                    {
                        id: 'tier_10',
                        minPlates: 10,
                        rewardType: 'free_product',
                        multiplier: 1,
                        productId: 'eggs',
                        giftQty: 1,
                        label: '🥚 طبق بيض سمان هدية مجاناً',
                        enabled: true
                    }
                ]
            },

            // 3. الباكجات والعروض المجمعة
            bundles: []
        };
    }

    window.storeOffersConfig = getDefaultOffersConfig();
    window.offersStudioState = {
        activeTab: 'wallet', // 'wallet' | 'ladder' | 'bundles'
        editingRewardId: null,
        editingTierId: null,
        editingBundleId: null
    };

    function escHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
        else if (typeof window.showQuickAppToast === 'function') window.showQuickAppToast(msg);
        else alert(msg);
    }

    function getProductsMap() {
        return (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
    }

    function getProductPrice(pId) {
        const prices = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const prods = getProductsMap();
        return Number(prices[pId] !== undefined ? prices[pId] : (prods[pId]?.basePrice || 0)) || 0;
    }

    function getAverageQuailPlatePrice() {
        const prods = getProductsMap();
        let sum = 0, cnt = 0;
        Object.keys(prods).forEach(id => {
            const p = prods[id];
            if (!p || p.isHidden || p.isWeightBased || p.isExtra || p.categoryType === 'custom') return;
            const n = String(p.name || '').toLowerCase();
            if (id === 'eggs' || id === 'chicks' || n.includes('بيض') || n.includes('كتكوت') || n.includes('كتاكيت')) return;
            const pr = getProductPrice(id);
            if (pr > 0) { sum += pr; cnt++; }
        });
        return cnt > 0 ? Math.round(sum / cnt) : 120;
    }

    // استرجاع فوري من الكاش المحلي
    try {
        const raw = localStorage.getItem(OFFERS_MIRROR_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const def = getDefaultOffersConfig();
                window.storeOffersConfig = {
                    ...def,
                    ...parsed,
                    wallet: { ...def.wallet, ...(parsed.wallet || {}) },
                    ladder: { ...def.ladder, ...(parsed.ladder || {}) },
                    bundles: Array.isArray(parsed.bundles) ? parsed.bundles : []
                };
            }
        }
    } catch (e) {}

    // =========================================================================
    // 🔄 1. التحميل والحفظ اللحظي في Firebase (inventory/loyalty_offers)
    // =========================================================================
    let offersListenerBound = false;
    let offersServerLoaded = false;
    let syncedPointsSnapshot = null;

    window.bindOffersStudioFirestore = function () {
        if (offersListenerBound || typeof db === 'undefined') return;
        offersListenerBound = true;
        try {
            db.collection('inventory').doc('loyalty_offers').onSnapshot(snap => {
                if (snap && snap.exists) {
                    const d = snap.data() || {};
                    const def = getDefaultOffersConfig();
                    window.storeOffersConfig = {
                        ...def,
                        ...d,
                        wallet: { ...def.wallet, ...(d.wallet || {}) },
                        ladder: { ...def.ladder, ...(d.ladder || {}) },
                        bundles: Array.isArray(d.bundles) ? d.bundles : []
                    };
                    try { localStorage.setItem(OFFERS_MIRROR_KEY, JSON.stringify(window.storeOffersConfig)); } catch (e) {}
                    if (window.smanCurrentActiveTab === 'offers') {
                        window.renderOffersStudioUI();
                    }
                }
                const wSnap = window.storeOffersConfig.wallet || {};
                syncedPointsSnapshot = {
                    pointsPer100: Number(wSnap.pointsPer100) || 5,
                    cashPointValueEGP: Number(wSnap.cashPointValueEGP) || 0.28
                };
                offersServerLoaded = true;
            }, () => {
                offersListenerBound = false;
            });
        } catch (e) {
            offersListenerBound = false;
        }
    };

    window.saveOffersStudioConfig = async function (silent = false) {
        if (typeof auth !== 'undefined' && !auth.currentUser) {
            if (!silent) alert('⚠️ يرجى تسجيل الدخول بحساب الأدمن أولاً ليتم الحفظ في السيرفر.');
            return;
        }
        if (!offersServerLoaded || typeof db === 'undefined' || !db) {
            if (!silent) alert('⏳ لسّه بنحمّل الإعدادات الحالية من السيرفر... استنى لحظة وجرّب الحفظ تاني.');
            return;
        }
        window.storeOffersConfig.updatedAt = Date.now();
        try { localStorage.setItem(OFFERS_MIRROR_KEY, JSON.stringify(window.storeOffersConfig)); } catch (e) {}

        try {
            const w = window.storeOffersConfig.wallet;
            const curPts = Number(w.pointsPer100) || 5;
            const curCashVal = Number(w.cashPointValueEGP) || 0.28;
            const pointsChanged = !syncedPointsSnapshot
                || syncedPointsSnapshot.pointsPer100 !== curPts
                || syncedPointsSnapshot.cashPointValueEGP !== curCashVal;

            const writes = [
                db.collection('inventory').doc('loyalty_offers').set(window.storeOffersConfig, { merge: true })
            ];
            if (pointsChanged) {
                writes.push(
                    db.collection('inventory').doc('settings').set({
                        pointsPer100: curPts,
                        pointValueInEGP: curCashVal
                    }, { merge: true })
                );
            }
            await Promise.all(writes);

            if (pointsChanged && typeof storeSettings !== 'undefined') {
                storeSettings.pointsPer100 = curPts;
                storeSettings.pointValueInEGP = curCashVal;
            }
            syncedPointsSnapshot = { pointsPer100: curPts, cashPointValueEGP: curCashVal };
            if (!silent) notify('✅ تم حفظ ونشر نظام الهدايا والباكجات على المتجر بنجاح!');
        } catch (e) {
            console.error('Save offers config error:', e);
            if (!silent) alert('حدث خطأ أثناء الحفظ: ' + (e.message || e));
        }
    };

    // =========================================================================
    // 🧩 2. حقن الشاشة وأيقونة القائمة الجانبية وزر لوحة القيادة تلقائياً
    // =========================================================================
    function ensureOffersStudioDOM() {
        if (!document.getElementById('view-offers')) {
            const settingsView = document.getElementById('view-settings');
            if (settingsView && settingsView.parentElement) {
                const div = document.createElement('div');
                div.id = 'view-offers';
                div.className = 'page-view space-y-4 max-w-6xl mx-auto pb-20';
                settingsView.parentElement.appendChild(div);
            }
        }

        if (!document.getElementById('sb-btn-offers-studio')) {
            const settingsSbBtn = document.querySelector(`#sidebar button[onclick*="switchTab('settings'"]`);
            if (settingsSbBtn && settingsSbBtn.parentElement) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'sb-btn-offers-studio';
                btn.className = 'nav-btn sb-tile';
                btn.setAttribute('onclick', "switchTab('offers', this)");
                btn.innerHTML = `
                    <i class="fa-solid fa-gift text-amber-300"></i>
                    <span class="sb-tile-label">العروض والولاء</span>
                `;
                settingsSbBtn.parentElement.insertBefore(btn, settingsSbBtn.nextSibling);
            }
        }

        const dashRoot = document.getElementById('smart-dashboard-root');
        if (dashRoot && !document.getElementById('dash-quick-offers-btn')) {
            const printBtn = dashRoot.querySelector('button[onclick*="printSmartDashboardReport"]');
            if (printBtn && printBtn.parentElement) {
                const qBtn = document.createElement('button');
                qBtn.type = 'button';
                qBtn.id = 'dash-quick-offers-btn';
                qBtn.onclick = () => {
                    const sbBtn = document.getElementById('sb-btn-offers-studio');
                    if (typeof switchTab === 'function') switchTab('offers', sbBtn);
                };
                qBtn.className = 'bg-gradient-to-l from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 shadow-sm';
                qBtn.innerHTML = '<i class="fa-solid fa-gift text-[10px]"></i> العروض والولاء';
                printBtn.parentElement.insertBefore(qBtn, printBtn);
            }
        }
    }

    // =========================================================================
    // 🎨 3. رسم واجهة الاستوديو الكاملة (3 تبويبات + حاسبة مقارنة البيض والكاش)
    // =========================================================================
    window.switchOffersStudioTab = function (tabKey) {
        window.offersStudioState.activeTab = tabKey || 'wallet';
        window.offersStudioState.editingRewardId = null;
        window.offersStudioState.editingTierId = null;
        window.offersStudioState.editingBundleId = null;
        window.renderOffersStudioUI();
    };

    window.toggleMasterOffersEnabled = async function (checked) {
        window.storeOffersConfig.enabled = Boolean(checked);
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
        notify(checked ? '🟢 تم تشغيل منظومة العروض والولاء على المتجر' : '⏸️ تم إيقاف منظومة العروض والولاء مؤقتاً');
    };

    window.renderOffersStudioUI = function () {
        ensureOffersStudioDOM();
        const root = document.getElementById('view-offers');
        if (!root) return;

        const cfg = window.storeOffersConfig;
        const w = cfg.wallet;
        const l = cfg.ladder;
        const bundles = Array.isArray(cfg.bundles) ? cfg.bundles : [];
        const activeTab = window.offersStudioState.activeTab || 'wallet';

        const eggSellPrice = getProductPrice('eggs') || 50;
        const eggRealCost = Math.max(1, Number(w.eggPlateRealCost) || 40);
        const ptsPer100 = Math.max(0.1, Number(w.pointsPer100) || 5);
        const ptVal = Math.max(0.01, Number(w.pointValueEGP) || 0.40);
        const cashValPt = Math.max(0.01, Number(w.cashPointValueEGP) || 0.28);
        const minPtsCash = Math.max(0, Number(w.minPointsForCash) || 0);
        const avgQuailPrice = getAverageQuailPlatePrice();

        const tabCls = (k) => activeTab === k
            ? 'bg-slate-900 text-amber-300 shadow-md'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50';

        let tabBodyHtml = '';

        // ==================== التبويب 1: خزنة الهدايا والنقاط ====================
        if (activeTab === 'wallet') {
            const rewards = Array.isArray(w.rewards) ? w.rewards : [];
            const editRw = window.offersStudioState.editingRewardId
                ? rewards.find(x => x.id === window.offersStudioState.editingRewardId)
                : null;
            const prods = getProductsMap();
            const prodOpts = Object.keys(prods)
                .filter(id => prods[id] && !prods[id].isWeightBased)
                .map(id => `<option value="${escHtml(id)}" ${editRw && editRw.productId === id ? 'selected' : ''}>${escHtml(prods[id].name)} (${getProductPrice(id)} ج)</option>`)
                .join('');

            const samplePts = Number(rewards[0]?.pointsCost) || 125;
            const cashSampleEGP = Math.floor(samplePts * cashValPt);
            const spendForSample = Math.round((samplePts / ptsPer100) * 100);
            const eggPctReal = spendForSample > 0 ? ((eggRealCost / spendForSample) * 100).toFixed(2) : '0';
            const cashPctReal = spendForSample > 0 ? ((cashSampleEGP / spendForSample) * 100).toFixed(2) : '0';
            const extraEggGain = Math.max(0, eggSellPrice - cashSampleEGP);

            const rewardsHtml = rewards.length === 0
                ? `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-2xl">لا توجد هدايا مضافة بعد — اضغط (+ إضافة هدية).</div>`
                : rewards.map((r, idx) => {
                    const spendNeeded = Math.round((Number(r.pointsCost) / ptsPer100) * 100);
                    const realCost = r.productId === 'eggs' ? eggRealCost * (Number(r.qty) || 1) : (Number(r.realCostEGP) || Math.round(getProductPrice(r.productId) * 0.7 * (Number(r.qty) || 1)));
                    const realPct = spendNeeded > 0 ? ((realCost / spendNeeded) * 100).toFixed(2) : '0';
                    const safeCls = Number(realPct) <= 2.2 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : (Number(realPct) <= 3.5 ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200');
                    return `
                    <div class="bg-slate-50 border ${r.enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'} rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                        <div class="space-y-1 min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="font-black text-slate-900 text-xs sm:text-sm">${escHtml(r.title)}</span>
                                <span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg text-[10px] font-black">🪙 ${r.pointsCost} نقطة</span>
                                <span class="border px-2 py-0.5 rounded-lg text-[10px] font-black ${safeCls}">تكلفتك: ${realCost} ج (${realPct}% من ${spendNeeded.toLocaleString()} ج مبيعات)</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" onclick="osEditWalletReward('${escHtml(r.id)}')" class="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 text-xs flex items-center justify-center" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" onclick="osToggleWalletReward(${idx})" class="px-2.5 py-1.5 rounded-xl text-[10px] font-black border ${r.enabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-300'}">${r.enabled ? '🟢 شغال' : '⏸️ متوقف'}</button>
                            <button type="button" onclick="osDeleteWalletReward(${idx})" class="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>`;
                }).join('');

            tabBodyHtml = `
                <div class="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-soft space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                            <h4 class="text-sm font-black text-slate-900"><i class="fa-solid fa-vault text-amber-500 ml-1"></i> إعدادات خزنة الهدايا والنقاط</h4>
                            <p class="text-[11px] font-bold text-slate-400">تحكم كامل في فتح/قفل هدايا البيض (بقيمة أعلى) أو خصم الكاش (بقيمة أقل) وحد الكاش الأدنى.</p>
                        </div>
                        <label class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-black text-emerald-900 cursor-pointer">
                            <input type="checkbox" ${w.enabled ? 'checked' : ''} onchange="storeOffersConfig.wallet.enabled=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-emerald-600 rounded">
                            <span>تفعيل الخزنة</span>
                        </label>
                    </div>

                    <!-- خانات التحكم الخمسة المرنة -->
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-500 block mb-1">نقاط لكل 100 ج</label>
                            <input type="number" step="0.5" value="${w.pointsPer100}" onchange="storeOffersConfig.wallet.pointsPer100=parseFloat(this.value)||5; renderOffersStudioUI();" class="w-full bg-white border border-slate-200 rounded-xl p-2 text-center font-black text-sm text-slate-900 outline-none">
                        </div>
                        <div class="bg-blue-50/70 p-3 rounded-2xl border border-blue-200">
                            <label class="text-[10px] font-black text-blue-900 block mb-1">قيمة النقطة كاش (ج)</label>
                            <input type="number" step="0.01" min="0.05" value="${cashValPt}" onchange="storeOffersConfig.wallet.cashPointValueEGP=parseFloat(this.value)||0.28; renderOffersStudioUI();" class="w-full bg-white border border-blue-300 rounded-xl p-2 text-center font-black text-sm text-blue-950 outline-none">
                        </div>
                        <div class="bg-blue-50/50 p-3 rounded-2xl border border-blue-200">
                            <label class="text-[10px] font-black text-blue-900 block mb-1">أقل نقاط للكاش (0=مفتوح)</label>
                            <input type="number" min="0" value="${minPtsCash}" onchange="const v=parseInt(this.value,10); storeOffersConfig.wallet.minPointsForCash=isNaN(v)?0:Math.max(0,v); renderOffersStudioUI();" class="w-full bg-white border border-blue-300 rounded-xl p-2 text-center font-black text-sm text-blue-950 outline-none">
                        </div>
                        <div class="bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
                            <label class="text-[10px] font-black text-amber-900 block mb-1">تكلفة طبق البيض عليك (ج)</label>
                            <input type="number" value="${w.eggPlateRealCost}" onchange="storeOffersConfig.wallet.eggPlateRealCost=parseFloat(this.value)||40; renderOffersStudioUI();" class="w-full bg-white border border-amber-300 rounded-xl p-2 text-center font-black text-sm text-amber-950 outline-none">
                        </div>
                        <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-500 block mb-1">أقل أوردر للصرف (ج)</label>
                            <input type="number" min="0" value="${w.minOrderForRedeemEGP}" onchange="storeOffersConfig.wallet.minOrderForRedeemEGP=Math.max(0,parseInt(this.value,10)||0);" class="w-full bg-white border border-slate-200 rounded-xl p-2 text-center font-black text-sm text-slate-900 outline-none">
                        </div>
                    </div>

                    <!-- حاسبة المقارنة المالية الحية -->
                    <div class="bg-gradient-to-l from-slate-900 to-emerald-950 text-white p-3.5 rounded-2xl space-y-1.5 text-xs font-black">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span>🥚 عند ${samplePts} نقطة (بيض): العميل ياخد <strong class="text-amber-300">${eggSellPrice} ج</strong> • تكلفتك <strong class="text-emerald-300">${eggRealCost} ج (${eggPctReal}%)</strong></span>
                            <span>💵 عند ${samplePts} نقطة (كاش): العميل ياخد <strong class="text-sky-300">${cashSampleEGP} ج</strong> • تكلفتك <strong class="text-sky-300">${cashSampleEGP} ج (${cashPctReal}%)</strong></span>
                        </div>
                        <p class="text-[11px] text-amber-200/90 pt-1 border-t border-white/10">
                            ✨ فرق القيمة الذكي: العميل بيكسب <strong>+${extraEggGain} ج زيادة</strong> لو اختار طبق البيض بمزاجه! ${minPtsCash === 0 ? '• (الكاش مفتوح بدون حد أدنى للنقاط)' : `• (الكاش يُفتح عند ${minPtsCash} نقطة)`}
                        </p>
                    </div>

                    <!-- زراير فتح وقفل الخيارين بحرية كاملة -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label class="flex items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl cursor-pointer">
                            <span class="text-xs font-black text-emerald-950">🥚 فتح استبدال النقاط بهدايا البيض (القيمة الأعلى)</span>
                            <input type="checkbox" ${w.allowGiftRedemption !== false ? 'checked' : ''} onchange="storeOffersConfig.wallet.allowGiftRedemption=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-emerald-600 rounded shrink-0">
                        </label>
                        <label class="flex items-center justify-between gap-2 bg-blue-50/80 border border-blue-200 p-3 rounded-2xl cursor-pointer">
                            <span class="text-xs font-black text-blue-950">💵 فتح استبدال النقاط بخصم كاش (القيمة الأقل)</span>
                            <input type="checkbox" ${w.allowCashRedemption === true ? 'checked' : ''} onchange="storeOffersConfig.wallet.allowCashRedemption=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-blue-600 rounded shrink-0">
                        </label>
                    </div>

                    <!-- كتالوج هدايا النقاط -->
                    <div class="pt-2 border-t border-slate-100 space-y-3">
                        <div class="flex items-center justify-between">
                            <h5 class="text-xs font-black text-slate-800">🎁 كتالوج الهدايا المتاحة للاستبدال بالنقاط (${rewards.length})</h5>
                            <button type="button" onclick="osToggleNewRewardForm()" class="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm">+ إضافة هدية</button>
                        </div>

                        <div id="os-new-reward-form" class="${editRw ? '' : 'hidden'} bg-amber-50/60 border-2 ${editRw ? 'border-blue-400' : 'border-amber-200'} rounded-2xl p-3 space-y-2.5">
                            ${editRw ? `<div class="text-[11px] font-black text-blue-800">✏️ تعديل الهدية: ${escHtml(editRw.title)}</div>` : ''}
                            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <input type="text" id="os-rw-title" value="${escHtml(editRw?.title || '')}" placeholder="اسم الهدية (مثال: طبق بيض هدية)" class="sm:col-span-2 border border-amber-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                                <select id="os-rw-prod" class="border border-amber-300 rounded-xl p-2 text-xs font-black bg-white outline-none">${prodOpts}</select>
                                <input type="number" id="os-rw-qty" value="${editRw ? (Number(editRw.qty) || 1) : 1}" min="1" placeholder="الكمية" class="border border-amber-300 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                            </div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <input type="number" id="os-rw-pts" value="${editRw ? (Number(editRw.pointsCost) || 125) : ''}" placeholder="عدد النقاط المطلوبة (مثال: 125)" class="border border-slate-200 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                                <input type="number" id="os-rw-cost" value="${editRw ? (Number(editRw.realCostEGP) || eggRealCost) : eggRealCost}" placeholder="تكلفتك الحقيقية (ج)" class="border border-slate-200 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                                <div class="col-span-2 sm:col-span-1 flex gap-1.5">
                                    ${editRw ? `<button type="button" onclick="offersStudioState.editingRewardId=null; renderOffersStudioUI();" class="px-3 bg-white border border-slate-300 text-slate-600 rounded-xl py-2 text-xs font-black">إلغاء</button>` : ''}
                                    <button type="button" onclick="osAddWalletReward()" class="flex-1 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl py-2 text-xs font-black">${editRw ? '💾 حفظ التعديل' : 'حفظ الهدية'}</button>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-2">${rewardsHtml}</div>
                    </div>
                </div>
            `;
        }

        // ==================== التبويب 2: سُلّم المفاجآت السري لأطباق السمان ====================
        else if (activeTab === 'ladder') {
            const tiers = (Array.isArray(l.tiers) ? l.tiers : []).slice().sort((a, b) => (Number(a.minPlates) || 0) - (Number(b.minPlates) || 0));
            const editTier = window.offersStudioState.editingTierId
                ? tiers.find(x => x.id === window.offersStudioState.editingTierId)
                : null;
            const formTierType = editTier ? editTier.rewardType : 'points_multiplier';
            const prods = getProductsMap();
            const prodOpts = Object.keys(prods)
                .filter(id => prods[id] && !prods[id].isWeightBased)
                .map(id => `<option value="${escHtml(id)}" ${editTier && editTier.productId === id ? 'selected' : ''}>${escHtml(prods[id].name)}</option>`)
                .join('');

            const tiersHtml = tiers.length === 0
                ? `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-2xl">لا توجد مستويات في السُلّم حالياً.</div>`
                : tiers.map((t) => {
                    const minP = Math.max(1, Number(t.minPlates) || 1);
                    const estOrderVal = minP * avgQuailPrice;
                    let realCostTotal = 0;
                    let rewardDesc = '';
                    if (t.rewardType === 'free_product') {
                        const unitRealCost = t.productId === 'eggs' ? eggRealCost : Math.round(getProductPrice(t.productId) * 0.72);
                        realCostTotal = unitRealCost * (Number(t.giftQty) || 1);
                        rewardDesc = `🎁 هدية فورية: ${t.giftQty || 1}× ${prods[t.productId]?.name || t.productId}`;
                    } else {
                        const mult = Number(t.multiplier) || 1.5;
                        const firstEggPts = Math.max(1, Number((w.rewards || [])[0]?.pointsCost) || 125);
                        const realCostPerPoint = Math.max(cashValPt, eggRealCost / firstEggPts);
                        const realBasePct = ptsPer100 * realCostPerPoint;
                        realCostTotal = Math.round((estOrderVal * (realBasePct / 100)) * mult);
                        rewardDesc = `⚡ نقاط مضاعفة ${mult}x على الطلب`;
                    }
                    const costPerPlate = (realCostTotal / minP).toFixed(1);
                    const pctOfOrder = estOrderVal > 0 ? ((realCostTotal / estOrderVal) * 100).toFixed(1) : '0';
                    const safetyBadge = Number(pctOfOrder) <= 3.2
                        ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg text-[10px] font-black">✅ آمن (${costPerPlate} ج/طبق • ${pctOfOrder}%)</span>`
                        : (Number(pctOfOrder) <= 4.5
                            ? `<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg text-[10px] font-black">⚠️ متوسط (${costPerPlate} ج/طبق • ${pctOfOrder}%)</span>`
                            : `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-lg text-[10px] font-black">🚨 مكلف (${costPerPlate} ج/طبق • ${pctOfOrder}%)</span>`);

                    return `
                    <div class="bg-slate-50 border ${t.enabled ? 'border-emerald-200' : 'border-slate-200 opacity-60'} rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                        <div class="space-y-1 min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="bg-slate-900 text-amber-300 px-2.5 py-0.5 rounded-lg text-xs font-black">من ${minP} أطباق سمان</span>
                                <span class="font-black text-slate-800 text-xs">${escHtml(t.label || rewardDesc)}</span>
                                ${safetyBadge}
                            </div>
                            <p class="text-[10px] font-bold text-slate-500">${rewardDesc} • قيمة الطلب التقريبية: ~${estOrderVal.toLocaleString()} ج</p>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" onclick="osEditLadderTier('${escHtml(t.id)}')" class="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 text-xs flex items-center justify-center" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" onclick="osToggleLadderTier('${escHtml(t.id)}')" class="px-2.5 py-1.5 rounded-xl text-[10px] font-black border ${t.enabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-300'}">${t.enabled ? '🟢 نشط' : '⏸️ متوقف'}</button>
                            <button type="button" onclick="osDeleteLadderTier('${escHtml(t.id)}')" class="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>`;
                }).join('');

            tabBodyHtml = `
                <div class="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-soft space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                            <h4 class="text-sm font-black text-slate-900"><i class="fa-solid fa-stairs text-emerald-600 ml-1"></i> سُلّم هدايا أطباق السمان (سمان مذبوح فقط)</h4>
                            <p class="text-[11px] font-bold text-slate-400">الهدية بتنزل لوحدها عند الوصول للعدد المحدد. تحكم تحت: تظهر للعميل شريط التقدم (فاضل كذا وتاخد…) في السلة ولا تفضل مفاجأة.</p>
                        </div>
                        <label class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-black text-emerald-900 cursor-pointer">
                            <input type="checkbox" ${l.enabled ? 'checked' : ''} onchange="storeOffersConfig.ladder.enabled=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-emerald-600 rounded">
                            <span>تفعيل السُلّم</span>
                        </label>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label class="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-[11px] font-black text-slate-700 cursor-pointer">
                            <input type="checkbox" ${l.showTemptationBar ? 'checked' : ''} onchange="storeOffersConfig.ladder.showTemptationBar=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-amber-500 rounded shrink-0">
                            <span>✨ إظهار شريط التقدم (فاضل كذا وتاخد…) في السلة</span>
                        </label>
                        <label class="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-[11px] font-black text-slate-700 cursor-pointer">
                            <input type="checkbox" ${l.blockWithPromoCode ? 'checked' : ''} onchange="storeOffersConfig.ladder.blockWithPromoCode=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-rose-600 rounded shrink-0">
                            <span>🛡️ إيقاف الهدية إذا استُخدم كود خصم</span>
                        </label>
                        <label class="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-[11px] font-black text-slate-700 cursor-pointer">
                            <input type="checkbox" ${l.fallbackPointsIfOutOfStock ? 'checked' : ''} onchange="storeOffersConfig.ladder.fallbackPointsIfOutOfStock=this.checked; saveOffersStudioConfig(true);" class="w-4 h-4 accent-emerald-600 rounded shrink-0">
                            <span>🔄 تحويل البيض لنقاط لو المخزون 0</span>
                        </label>
                    </div>

                    <div class="flex items-center justify-between pt-1">
                        <h5 class="text-xs font-black text-slate-800">📊 المستويات النشطة (${tiers.length})</h5>
                        <button type="button" onclick="osToggleNewTierForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm">+ إضافة مستوى جديد</button>
                    </div>

                    <div id="os-new-tier-form" class="${editTier ? '' : 'hidden'} bg-emerald-50/60 border-2 ${editTier ? 'border-blue-400' : 'border-emerald-200'} rounded-2xl p-3 space-y-2.5">
                        ${editTier ? `<div class="text-[11px] font-black text-blue-800">✏️ تعديل مستوى (${editTier.minPlates} أطباق سمان)</div>` : ''}
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                                <label class="text-[10px] font-black text-slate-600 block mb-1">عدد أطباق السمان</label>
                                <input type="number" id="os-tr-min" min="2" value="${editTier ? (Number(editTier.minPlates) || 4) : 10}" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-600 block mb-1">نوع المكافأة</label>
                                <select id="os-tr-type" onchange="document.getElementById('os-tr-mult-wrap').classList.toggle('hidden', this.value!=='points_multiplier'); document.getElementById('os-tr-prod-wrap').classList.toggle('hidden', this.value!=='free_product');" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                                    <option value="points_multiplier" ${formTierType === 'points_multiplier' ? 'selected' : ''}>⚡ مضاعفة نقاط</option>
                                    <option value="free_product" ${formTierType === 'free_product' ? 'selected' : ''}>🎁 صنف هدية مجاني</option>
                                </select>
                            </div>
                            <div id="os-tr-mult-wrap" class="${formTierType !== 'points_multiplier' ? 'hidden' : ''}">
                                <label class="text-[10px] font-black text-slate-600 block mb-1">المضاعف (مثال 1.5 أو 2)</label>
                                <input type="number" step="0.25" id="os-tr-mult" value="${editTier ? (Number(editTier.multiplier) || 1.5) : 1.5}" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                            </div>
                            <div id="os-tr-prod-wrap" class="${formTierType !== 'free_product' ? 'hidden' : ''} flex gap-1.5">
                                <div class="flex-1">
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">الصنف الهدية</label>
                                    <select id="os-tr-prod" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black bg-white outline-none">${prodOpts}</select>
                                </div>
                                <div class="w-16">
                                    <label class="text-[10px] font-black text-slate-600 block mb-1">الكمية</label>
                                    <input type="number" id="os-tr-qty" min="1" value="${editTier ? (Number(editTier.giftQty) || 1) : 1}" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black text-center bg-white outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-600 block mb-1">وصف إداري للمستوى</label>
                                <input type="text" id="os-tr-label" value="${escHtml(editTier?.label || '')}" placeholder="مثال: طبق بيض هدية 🥚" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                            </div>
                        </div>
                        <div class="flex justify-end gap-2">
                            ${editTier ? `<button type="button" onclick="offersStudioState.editingTierId=null; renderOffersStudioUI();" class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 text-xs font-black">إلغاء</button>` : ''}
                            <button type="button" onclick="osAddLadderTier()" class="bg-slate-900 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black">${editTier ? '💾 حفظ التعديل' : '💾 إضافة المستوى'}</button>
                        </div>
                    </div>

                    <div class="space-y-2">${tiersHtml}</div>
                </div>
            `;
        }

        // ==================== التبويب 3: صانع الباكجات والعروض المجمعة ====================
        else {
            const prods = getProductsMap();
            const selectableProds = Object.keys(prods).filter(id => prods[id] && !prods[id].isWeightBased);
            const editBnd = window.offersStudioState.editingBundleId
                ? bundles.find(x => x.id === window.offersStudioState.editingBundleId)
                : null;
            const editQtyMap = {};
            if (editBnd && Array.isArray(editBnd.items)) {
                editBnd.items.forEach(it => { editQtyMap[it.id] = Number(it.qty) || 0; });
            }

            const bundlesHtml = bundles.length === 0
                ? `<div class="text-center py-8 text-xs font-bold text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">لا توجد باكجات منشورة بعد — اضغط (+ إنشاء باكج جديد) لتصميم أول عرض مجمع لعملائك.</div>`
                : bundles.map(b => {
                    const origTotal = (b.items || []).reduce((s, it) => s + (getProductPrice(it.id) * (Number(it.qty) || 1)), 0);
                    const saveAmt = Math.max(0, origTotal - (Number(b.bundlePrice) || 0));
                    const savePct = origTotal > 0 ? Math.round((saveAmt / origTotal) * 100) : 0;
                    const itemsText = (b.items || []).map(it => `${it.qty}× ${prods[it.id]?.name || it.name || it.id}`).join(' + ');

                    return `
                    <div class="bg-white border-2 ${b.enabled ? 'border-amber-300' : 'border-slate-200 opacity-65'} rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-1 min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="bg-slate-900 text-amber-300 px-2.5 py-0.5 rounded-lg text-xs font-black">${escHtml(b.title)}</span>
                                ${b.badge ? `<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md text-[10px] font-black">${escHtml(b.badge)}</span>` : ''}
                                ${b.freeDelivery ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] font-black">🚚 توصيل مجاني</span>` : ''}
                                ${Number(b.bonusPoints) > 0 ? `<span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md text-[10px] font-black">+${b.bonusPoints} نقطة</span>` : ''}
                            </div>
                            <p class="text-xs font-bold text-slate-700">${escHtml(itemsText)}</p>
                            <div class="flex flex-wrap items-center gap-2 text-[11px] font-black">
                                <span class="text-emerald-700">سعر الباكج: ${b.bundlePrice} ج</span>
                                <span class="text-slate-400 line-through">${origTotal} ج</span>
                                <span class="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md text-[10px]">توفير ${saveAmt} ج (${savePct}%)</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" onclick="osEditBundle('${escHtml(b.id)}')" class="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 text-xs flex items-center justify-center" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" onclick="osToggleBundle('${escHtml(b.id)}')" class="px-3 py-1.5 rounded-xl text-[10px] font-black border ${b.enabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-300'}">${b.enabled ? '🟢 منشور' : '⏸️ مخفي'}</button>
                            <button type="button" onclick="osDeleteBundle('${escHtml(b.id)}')" class="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>`;
                }).join('');

            const prodPickerGrid = selectableProds.map(id => `
                <div class="bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <span class="block text-[11px] font-black text-slate-800 truncate">${escHtml(prods[id].name)}</span>
                        <span class="block text-[9px] font-bold text-emerald-700">${getProductPrice(id)} ج</span>
                    </div>
                    <input type="number" min="0" value="${editQtyMap[id] || 0}" data-os-bprod="${escHtml(id)}" oninput="osRecalcNewBundlePreview()" class="w-14 border border-slate-200 rounded-lg p-1 text-center font-black text-xs text-slate-900 bg-slate-50 outline-none">
                </div>`).join('');

            tabBodyHtml = `
                <div class="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-soft space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                            <h4 class="text-sm font-black text-slate-900"><i class="fa-solid fa-boxes-stacked text-amber-500 ml-1"></i> صانع الباكجات والعروض المجمعة</h4>
                            <p class="text-[11px] font-bold text-slate-400">صمّم أي باكج (أسرة، شوي، سمان + بيض) وبيظهر للعميل في المتجر بكارت شيك يضيفه بضغطة.</p>
                        </div>
                        <button type="button" onclick="osToggleNewBundleForm()" class="bg-slate-900 hover:bg-brand-primary text-amber-300 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm">+ إنشاء باكج جديد</button>
                    </div>

                    <div id="os-new-bundle-form" class="${editBnd ? '' : 'hidden'} bg-slate-50 border-2 ${editBnd ? 'border-blue-400' : 'border-amber-200'} rounded-2xl p-4 space-y-3">
                        ${editBnd ? `<div class="text-xs font-black text-blue-800">✏️ تعديل الباكج: ${escHtml(editBnd.title)}</div>` : ''}
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input type="text" id="os-b-title" value="${escHtml(editBnd?.title || '')}" placeholder="اسم الباكج (مثال: 🔥 باكج الأسرة)" class="border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-white outline-none">
                            <input type="text" id="os-b-badge" value="${escHtml(editBnd?.badge || '')}" placeholder="شارة (مثال: الأكثر توفيراً)" class="border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-white outline-none">
                            <input type="text" id="os-b-desc" value="${escHtml(editBnd?.desc || '')}" placeholder="وصف قصير مغري للعميل..." class="border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-white outline-none">
                        </div>

                        <div class="space-y-1.5">
                            <span class="text-[11px] font-black text-slate-700 block">اختر أصناف وكميات الباكج:</span>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${prodPickerGrid}</div>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end pt-2 border-t border-slate-200">
                            <div>
                                <label class="text-[10px] font-black text-slate-500 block mb-1">السعر الأصلي (تلقائي)</label>
                                <div id="os-b-orig-total" class="bg-slate-200/70 text-slate-700 rounded-xl p-2 text-center font-black text-xs">0 ج</div>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-emerald-700 block mb-1">سعر الباكج للبيع (ج) *</label>
                                <input type="number" id="os-b-price" value="${editBnd ? (Number(editBnd.bundlePrice) || '') : ''}" oninput="osRecalcNewBundlePreview()" placeholder="مثال: 385" class="w-full border-2 border-emerald-300 rounded-xl p-2 text-center font-black text-xs bg-white outline-none">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-indigo-700 block mb-1">بونص نقط إضافية (اختياري)</label>
                                <input type="number" id="os-b-bonus" value="${editBnd ? (Number(editBnd.bonusPoints) || 0) : 0}" min="0" class="w-full border border-slate-200 rounded-xl p-2 text-center font-black text-xs bg-white outline-none">
                            </div>
                            <label class="flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2 text-[11px] font-black text-slate-700 cursor-pointer h-[36px]">
                                <input type="checkbox" id="os-b-freedel" ${editBnd?.freeDelivery ? 'checked' : ''} class="w-4 h-4 accent-emerald-600 rounded">
                                <span>🚚 توصيل مجاني</span>
                            </label>
                        </div>

                        <div id="os-b-margin-preview" class="text-xs font-black text-slate-600 bg-white border border-slate-200 rounded-xl p-2.5 text-center">اختر الأصناف واكتب سعر الباكج لحساب نسبة الخصم فوراً</div>

                        <div class="flex justify-end gap-2">
                            <button type="button" onclick="offersStudioState.editingBundleId=null; document.getElementById('os-new-bundle-form').classList.add('hidden'); renderOffersStudioUI();" class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-black">إلغاء</button>
                            <button type="button" onclick="osSaveNewBundle()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md">${editBnd ? '💾 حفظ تعديلات الباكج' : '🚀 حفظ ونشر الباكج'}</button>
                        </div>
                    </div>

                    <div class="space-y-2.5">${bundlesHtml}</div>
                </div>
            `;
        }

        root.innerHTML = `
            <!-- الهيدر الملكي لاستوديو العروض والولاء -->
            <div class="bg-gradient-to-l from-[#042f2e] via-[#064e3b] to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-amber-400/35 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl shadow shrink-0"><i class="fa-solid fa-gift"></i></span>
                    <div class="min-w-0">
                        <h3 class="text-base sm:text-lg font-black text-white leading-tight">استوديو العروض، الباكجات، وخزنة الهدايا</h3>
                        <p class="text-[11px] font-bold text-emerald-200/85 mt-0.5">تحكم كامل في النقاط (هدايا بيض بقيمة أعلى 🆚 خصم كاش مرن) + السُلّم السري + الباكجات.</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <label class="flex items-center gap-1.5 bg-white/10 border border-white/20 px-3 py-2 rounded-xl text-xs font-black cursor-pointer">
                        <input type="checkbox" ${cfg.enabled ? 'checked' : ''} onchange="toggleMasterOffersEnabled(this.checked)" class="w-4 h-4 accent-amber-400 rounded">
                        <span>${cfg.enabled ? '🟢 شغال' : '⏸️ متوقف'}</span>
                    </label>
                    <button type="button" onclick="saveOffersStudioConfig(false)" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-4 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-floppy-disk"></i> حفظ ونشر الكل
                    </button>
                </div>
            </div>

            <!-- شريط التبويبات الـ 3 -->
            <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick="switchOffersStudioTab('wallet')" class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all ${tabCls('wallet')}">🪙 خزنة الهدايا (${(w.rewards || []).length})</button>
                <button type="button" onclick="switchOffersStudioTab('ladder')" class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all ${tabCls('ladder')}">📈 سُلّم السمان (${(l.tiers || []).length})</button>
                <button type="button" onclick="switchOffersStudioTab('bundles')" class="py-2.5 px-2 rounded-2xl text-xs font-black transition-all ${tabCls('bundles')}">📦 الباكجات (${bundles.length})</button>
            </div>

            ${tabBodyHtml}
        `;
        if (activeTab === 'bundles' && window.offersStudioState.editingBundleId) {
            window.osRecalcNewBundlePreview();
        }
    };

    // =========================================================================
    // ⚡ 4. دوال الإضافة والتعديل والحذف داخل الاستوديو
    // =========================================================================
    window.osToggleNewRewardForm = function () {
        if (window.offersStudioState.editingRewardId) {
            window.offersStudioState.editingRewardId = null;
            window.renderOffersStudioUI();
            document.getElementById('os-new-reward-form')?.classList.remove('hidden');
            return;
        }
        document.getElementById('os-new-reward-form')?.classList.toggle('hidden');
    };

    window.osEditWalletReward = function (rewardId) {
        window.offersStudioState.editingRewardId = rewardId;
        window.renderOffersStudioUI();
        document.getElementById('os-new-reward-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    window.osAddWalletReward = async function () {
        const title = (document.getElementById('os-rw-title')?.value || '').trim();
        const productId = document.getElementById('os-rw-prod')?.value || 'eggs';
        const qty = Math.max(1, parseInt(document.getElementById('os-rw-qty')?.value, 10) || 1);
        const pointsCost = Math.max(10, parseInt(document.getElementById('os-rw-pts')?.value, 10) || 125);
        const realCostEGP = productId === 'eggs'
            ? (Math.max(1, Number(window.storeOffersConfig.wallet.eggPlateRealCost) || 40) * qty)
            : Math.max(1, parseFloat(document.getElementById('os-rw-cost')?.value) || 40);
        if (!title) return alert('اكتب اسم الهدية أولاً!');

        if (!Array.isArray(window.storeOffersConfig.wallet.rewards)) window.storeOffersConfig.wallet.rewards = [];
        const editId = window.offersStudioState.editingRewardId;
        if (editId) {
            const existing = window.storeOffersConfig.wallet.rewards.find(x => x.id === editId);
            if (existing) Object.assign(existing, { title, productId, qty, pointsCost, realCostEGP });
            window.offersStudioState.editingRewardId = null;
        } else {
            window.storeOffersConfig.wallet.rewards.push({
                id: 'rew_' + Date.now(),
                title, productId, qty, pointsCost, realCostEGP, enabled: true
            });
        }
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
        notify(editId ? '✅ تم حفظ تعديلات الهدية!' : '✅ تمت إضافة الهدية إلى خزنة النقاط!');
    };

    window.osToggleWalletReward = async function (idx) {
        const r = window.storeOffersConfig.wallet.rewards?.[idx];
        if (!r) return;
        r.enabled = !r.enabled;
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };

    window.osDeleteWalletReward = async function (idx) {
        if (!confirm('حذف هذه الهدية من الكتالوج؟')) return;
        const removed = window.storeOffersConfig.wallet.rewards?.[idx];
        if (removed && removed.id === window.offersStudioState.editingRewardId) {
            window.offersStudioState.editingRewardId = null;
        }
        window.storeOffersConfig.wallet.rewards.splice(idx, 1);
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };

    window.osToggleNewTierForm = function () {
        if (window.offersStudioState.editingTierId) {
            window.offersStudioState.editingTierId = null;
            window.renderOffersStudioUI();
            document.getElementById('os-new-tier-form')?.classList.remove('hidden');
            return;
        }
        document.getElementById('os-new-tier-form')?.classList.toggle('hidden');
    };

    window.osEditLadderTier = function (tierId) {
        window.offersStudioState.editingTierId = tierId;
        window.renderOffersStudioUI();
        document.getElementById('os-new-tier-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    window.osAddLadderTier = async function () {
        const minPlates = Math.max(2, parseInt(document.getElementById('os-tr-min')?.value, 10) || 4);
        const rewardType = document.getElementById('os-tr-type')?.value || 'points_multiplier';
        const multiplier = Math.max(1.1, parseFloat(document.getElementById('os-tr-mult')?.value) || 1.5);
        const productId = document.getElementById('os-tr-prod')?.value || 'eggs';
        const giftQty = Math.max(1, parseInt(document.getElementById('os-tr-qty')?.value, 10) || 1);
        const label = (document.getElementById('os-tr-label')?.value || '').trim()
            || (rewardType === 'free_product' ? '🥚 طبق بيض سمان هدية مجاناً' : `نقاط مضاعفة ${multiplier}x`);

        if (!Array.isArray(window.storeOffersConfig.ladder.tiers)) window.storeOffersConfig.ladder.tiers = [];
        const tierPayload = {
            minPlates,
            rewardType,
            multiplier: rewardType === 'points_multiplier' ? multiplier : 1,
            productId,
            giftQty: rewardType === 'free_product' ? giftQty : 1,
            label
        };

        const editId = window.offersStudioState.editingTierId;
        if (editId) {
            const existing = window.storeOffersConfig.ladder.tiers.find(x => x.id === editId);
            if (existing) Object.assign(existing, tierPayload);
            window.offersStudioState.editingTierId = null;
        } else {
            window.storeOffersConfig.ladder.tiers.push({
                id: 'tier_' + Date.now(),
                ...tierPayload,
                enabled: true
            });
        }
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
        notify(editId ? '✅ تم حفظ تعديلات المستوى!' : '✅ تمت إضافة المستوى إلى سُلّم السمان!');
    };

    window.osToggleLadderTier = async function (tierId) {
        const t = (window.storeOffersConfig.ladder.tiers || []).find(x => x.id === tierId);
        if (!t) return;
        t.enabled = !t.enabled;
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };

    window.osDeleteLadderTier = async function (tierId) {
        if (!confirm('حذف هذا المستوى من السُلّم؟')) return;
        if (tierId === window.offersStudioState.editingTierId) window.offersStudioState.editingTierId = null;
        window.storeOffersConfig.ladder.tiers = (window.storeOffersConfig.ladder.tiers || []).filter(x => x.id !== tierId);
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };

    window.osToggleNewBundleForm = function () {
        if (window.offersStudioState.editingBundleId) {
            window.offersStudioState.editingBundleId = null;
            window.renderOffersStudioUI();
            document.getElementById('os-new-bundle-form')?.classList.remove('hidden');
            return;
        }
        document.getElementById('os-new-bundle-form')?.classList.toggle('hidden');
    };

    window.osEditBundle = function (bId) {
        window.offersStudioState.editingBundleId = bId;
        window.renderOffersStudioUI();
        document.getElementById('os-new-bundle-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    window.osRecalcNewBundlePreview = function () {
        let origTotal = 0;
        document.querySelectorAll('[data-os-bprod]').forEach(inp => {
            const q = parseInt(inp.value, 10) || 0;
            if (q > 0) origTotal += q * getProductPrice(inp.getAttribute('data-os-bprod'));
        });
        const origEl = document.getElementById('os-b-orig-total');
        if (origEl) origEl.innerText = `${origTotal} ج`;

        const bPrice = parseFloat(document.getElementById('os-b-price')?.value) || 0;
        const prevEl = document.getElementById('os-b-margin-preview');
        if (!prevEl) return;
        if (origTotal <= 0 || bPrice <= 0) {
            prevEl.innerText = 'اختر الأصناف واكتب سعر الباكج لحساب نسبة الخصم فوراً';
            return;
        }
        const save = Math.max(0, origTotal - bPrice);
        const pct = ((save / origTotal) * 100).toFixed(1);
        prevEl.innerHTML = save > 0
            ? `💰 العميل هيوفّر <strong class="text-emerald-700">${save} ج (${pct}%)</strong> — السعر قبل: ${origTotal} ج ⬅️ بعد: ${bPrice} ج`
            : `⚠️ سعر الباكج (${bPrice} ج) أكبر من أو يساوي السعر الأصلي (${origTotal} ج)`;
    };

    window.osSaveNewBundle = async function () {
        const title = (document.getElementById('os-b-title')?.value || '').trim();
        const badge = (document.getElementById('os-b-badge')?.value || '').trim();
        const desc = (document.getElementById('os-b-desc')?.value || '').trim();
        const bundlePrice = Math.max(1, parseFloat(document.getElementById('os-b-price')?.value) || 0);
        const bonusPoints = Math.max(0, parseInt(document.getElementById('os-b-bonus')?.value, 10) || 0);
        const freeDelivery = Boolean(document.getElementById('os-b-freedel')?.checked);
        const prods = getProductsMap();

        const items = [];
        document.querySelectorAll('[data-os-bprod]').forEach(inp => {
            const q = parseInt(inp.value, 10) || 0;
            const id = inp.getAttribute('data-os-bprod');
            if (q > 0 && prods[id]) {
                items.push({ id, name: prods[id].name, qty: q });
            }
        });

        if (!title) return alert('اكتب اسم الباكج أولاً!');
        if (items.length === 0) return alert('اختر صنفاً واحداً على الأقل داخل الباكج!');
        if (bundlePrice <= 0) return alert('اكتب سعر الباكج!');

        const origTotal = items.reduce((sum, it) => sum + (getProductPrice(it.id) * it.qty), 0);
        if (origTotal > 0 && bundlePrice >= origTotal) {
            return alert(`⚠️ سعر الباكج (${bundlePrice} ج) أكبر من أو يساوي السعر الأصلي للأصناف (${origTotal} ج) — كده العميل مش هيوفّر حاجة!`);
        }
        if (origTotal > 0) {
            const discountPct = ((origTotal - bundlePrice) / origTotal) * 100;
            if (discountPct > 25) {
                const ok = confirm(`⚠️ تنبيه: خصم الباكج ${discountPct.toFixed(1)}% (العميل هيوفّر ${origTotal - bundlePrice} ج من ${origTotal} ج).\nنسبة خصم أعلى من 25% — متأكد إنك مش هتخسر؟\n\nاضغط OK للنشر أو Cancel للتعديل.`);
                if (!ok) return;
            }
        }

        if (!Array.isArray(window.storeOffersConfig.bundles)) window.storeOffersConfig.bundles = [];
        const editId = window.offersStudioState.editingBundleId;
        if (editId) {
            const existing = window.storeOffersConfig.bundles.find(x => x.id === editId);
            if (existing) Object.assign(existing, { title, badge, desc, items, bundlePrice, bonusPoints, freeDelivery });
            window.offersStudioState.editingBundleId = null;
        } else {
            window.storeOffersConfig.bundles.unshift({
                id: 'bnd_' + Date.now(),
                title, badge, desc, items, bundlePrice, bonusPoints, freeDelivery, enabled: true
            });
        }
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
        notify(editId ? `✅ تم تحديث الباكج (${title}) بنجاح!` : `🚀 تم نشر الباكج (${title}) بنجاح!`);
    };

    window.osToggleBundle = async function (bId) {
        const b = (window.storeOffersConfig.bundles || []).find(x => x.id === bId);
        if (!b) return;
        b.enabled = !b.enabled;
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };

    window.osDeleteBundle = async function (bId) {
        if (!confirm('حذف هذا الباكج نهائياً؟')) return;
        if (bId === window.offersStudioState.editingBundleId) window.offersStudioState.editingBundleId = null;
        window.storeOffersConfig.bundles = (window.storeOffersConfig.bundles || []).filter(x => x.id !== bId);
        window.renderOffersStudioUI();
        await window.saveOffersStudioConfig(true);
    };



    function bootOffersStudio() {
        ensureOffersStudioDOM();
        window.bindOffersStudioFirestore();
        // إعادة التحقق بعد رسم لوحة القيادة الذكية لحقن الزر السريع في شريطها العلوي
        setTimeout(ensureOffersStudioDOM, 800);
        setTimeout(ensureOffersStudioDOM, 2000);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', bootOffersStudio);
    } else {
        bootOffersStudio();
    }
})();

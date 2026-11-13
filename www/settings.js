// =========================================================================
// ⚙️ المحرك المركزي لإدارة الأصناف، الإعدادات، الفريزر، والمزامنة (settings.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يدير: الكتالوج والأسعار، الأوزان، المناطق، المناديب، القوالب، النقاط، وجوجل شيت
// =========================================================================

(function () {
    let lastFocusedTemplateInput = null;

    // =========================================================================
    // 🥩 1. إدارة كتالوج الأصناف والأسعار والأوزان (Inventory & Products UI)
    // =========================================================================
    window.renderInventoryUI = function () {
        const cont = document.getElementById('products-list-container');
        if (!cont) return;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const stockObj = (typeof storeStock !== 'undefined' && storeStock) ? storeStock : {};

        const prodIds = Object.keys(prodsObj);
        let activeCount = 0;
        let hiddenCount = 0;
        let totalStockCount = 0;

        prodIds.forEach(id => {
            const p = prodsObj[id];
            if (!p) return;
            if (p.isHidden) hiddenCount++;
            else activeCount++;
            totalStockCount += Math.max(0, parseInt(stockObj[id]) || 0);
        });

        // شريط ملخص الكتالوج والحفظ السريع
        let html = `
            <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-md mb-4 flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-4 text-xs font-black">
                    <span>📦 إجمالي الأصناف: <strong class="text-amber-400">${prodIds.length}</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>🟢 معروض بالمتجر: <strong class="text-emerald-400">${activeCount}</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>🚫 مخفي: <strong class="text-rose-400">${hiddenCount}</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>📊 إجمالي المتاح للحجز: <strong class="text-sky-400">${totalStockCount}</strong></span>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="saveAllSettings()" class="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-floppy-disk"></i> حفظ الكتالوج والأسعار الآن
                    </button>
                </div>
            </div>
        `;

        if (prodIds.length === 0) {
            html += `<div class="text-center py-14 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">لا توجد أصناف مسجلة حالياً. اضغط "صنف جديد" للبدء.</div>`;
            cont.innerHTML = html;
            return;
        }

        prodIds.forEach(id => {
            const p = prodsObj[id];
            if (!p) return;
            const price = pricesObj[id] !== undefined ? pricesObj[id] : (p.basePrice || 0);
            const stock = stockObj[id] || 0;
            const oldPrice = p.oldPrice || '';
            const imgSrc = (p.images && p.images.length > 0) ? p.images[0] : '';

            // حساب إحصائيات الأوزان إذا كان الصنف يباع بالوزن (يدعم المسافات والأسطر والأرقام العربية والإنجليزية)
            let weightStatsHtml = '';
            if (p.isWeightBased) {
                const wArr = typeof window.parseWeightsArray === 'function'
                    ? window.parseWeightsArray(p.weightsList)
                    : String(p.weightsList || '').split(/[\s,،;\n\r\-]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0);
                const totalGrams = wArr.reduce((s, v) => s + v, 0);
                const totalKg = (totalGrams / 1000).toFixed(2);
                weightStatsHtml = `
                    <div class="mt-3 bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200/80">
                        <div class="flex flex-wrap justify-between items-center gap-2 mb-2">
                            <label class="text-[11px] font-black text-indigo-900">
                                <i class="fa-solid fa-scale-balanced mr-1 text-indigo-600"></i> مصفوفة الأوزان المتاحة بالجرام (جنب بعض بمسافة أو تحت بعض):
                            </label>
                            <div class="flex items-center gap-2 text-[10px] font-black">
                                <span id="weights-badge-${id}" class="bg-white text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200 shadow-sm">المتاح: ${wArr.length} قطعة (${totalKg} كجم)</span>
                            </div>
                        </div>
                        <textarea oninput="let arr = window.parseWeightsArray ? window.parseWeightsArray(this.value) : []; storeProducts['${id}'].weightsList = arr.join(' '); storeStock['${id}'] = arr.length; let b = document.getElementById('weights-badge-${id}'); if(b) b.innerText = 'المتاح: ' + arr.length + ' قطعة (' + (arr.reduce((s,v)=>s+v,0)/1000).toFixed(2) + ' كجم)'; if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" onchange="updateProductWeightList('${id}', this.value)" dir="ltr" class="w-full border border-indigo-200 rounded-xl p-2.5 text-xs font-black text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-300 custom-scroll" rows="3" placeholder="مثال: 1400 1550 1200 أو كل وزن في سطر">${p.weightsList || ''}</textarea>
                    </div>
                `;
            }

            html += `
            <div class="bg-white p-5 rounded-[1.5rem] border ${p.isHidden ? 'border-rose-200 bg-rose-50/10 opacity-85' : 'border-slate-100'} mb-4 shadow-soft hover:shadow-md transition-all">
                <div class="flex justify-between items-start gap-3 mb-3">
                    <div class="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">اسم المنتج</label>
                            <input type="text" value="${p.name || ''}" onchange="storeProducts['${id}'].name = this.value; generateDynamicOrderInputs();" class="w-full border border-slate-200/80 bg-slate-50 focus:bg-white rounded-xl p-2.5 text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">الوزن / الوصف</label>
                            <input type="text" value="${p.weight || ''}" onchange="storeProducts['${id}'].weight = this.value" class="w-full border border-slate-200/80 bg-slate-50 focus:bg-white rounded-xl p-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-blue-600 block mb-1">السعر الحالي (ج)</label>
                            <input type="number" value="${price}" onchange="storePrices['${id}'] = parseFloat(this.value) || 0; storeProducts['${id}'].basePrice = parseFloat(this.value) || 0;" class="w-full border border-blue-200 bg-blue-50/70 focus:bg-white rounded-xl p-2.5 text-sm font-black text-blue-700 text-center outline-none focus:ring-2 focus:ring-blue-200 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-amber-600 block mb-1">سعر الدفعة القديمة</label>
                            <input type="number" value="${p.oldBatchPrice || ''}" onchange="storeProducts['${id}'].oldBatchPrice = parseFloat(this.value) || 0" class="w-full border border-amber-200 bg-amber-50/70 focus:bg-white rounded-xl p-2.5 text-sm font-black text-amber-700 text-center outline-none focus:ring-2 focus:ring-amber-200 transition-all" placeholder="اختياري">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-emerald-600 block mb-1">المتاح للحجز</label>
                            <input type="number" value="${stock}" onchange="storeStock['${id}'] = parseInt(this.value) || 0" class="w-full border border-emerald-200 bg-emerald-50/70 focus:bg-white rounded-xl p-2.5 text-sm font-black text-emerald-700 text-center outline-none focus:ring-2 focus:ring-emerald-200 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 block mb-1">رابط الصورة</label>
                            <input type="text" value="${imgSrc}" onchange="storeProducts['${id}'].images = [this.value]" class="w-full border border-slate-200/80 bg-slate-50 focus:bg-white rounded-xl p-2.5 text-[10px] font-bold text-slate-500 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all" dir="ltr" placeholder="super.png أو رابط">
                        </div>
                    </div>
                    <button onclick="deleteProductUI('${id}')" title="حذف الصنف نهائياً" class="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex justify-center items-center hover:bg-red-500 hover:text-white mt-5 shrink-0 transition-colors shadow-sm">
                        <i class="fa-solid fa-trash text-sm"></i>
                    </button>
                </div>

                <div class="flex flex-wrap items-center gap-5 bg-slate-50/90 p-3 rounded-xl border border-slate-100 mt-2">
                    <label class="flex items-center gap-2 text-[11px] font-black cursor-pointer text-slate-700">
                        <input type="checkbox" ${p.isExtra ? 'checked' : ''} onchange="storeProducts['${id}'].isExtra = this.checked" class="w-4 h-4 accent-brand-primary rounded">
                        <span>يُعرض كمنتج إضافي (بيض/كتاكيت)</span>
                    </label>
                    <label class="flex items-center gap-2 text-[11px] font-black cursor-pointer text-amber-600">
                        <input type="checkbox" ${p.isBest ? 'checked' : ''} onchange="storeProducts['${id}'].isBest = this.checked" class="w-4 h-4 accent-amber-500 rounded">
                        <span>الأكثر طلباً 🔥</span>
                    </label>
                    <label class="flex items-center gap-2 text-[11px] font-black cursor-pointer text-indigo-600">
                        <input type="checkbox" ${p.isWeightBased ? 'checked' : ''} onchange="storeProducts['${id}'].isWeightBased = this.checked; renderInventoryUI(); generateDynamicOrderInputs();" class="w-4 h-4 accent-indigo-600 rounded">
                        <span>يباع بالوزن ⚖️</span>
                    </label>
                    <label class="flex items-center gap-2 text-[11px] font-black cursor-pointer text-rose-600">
                        <input type="checkbox" ${p.isHidden ? 'checked' : ''} onchange="storeProducts['${id}'].isHidden = this.checked; renderInventoryUI();" class="w-4 h-4 accent-rose-600 rounded">
                        <span>إخفاء من المتجر 🚫</span>
                    </label>
                    <div class="flex items-center gap-3 border-r border-slate-200 pr-4">
                        <label class="flex items-center gap-2 text-[11px] font-black cursor-pointer text-red-500">
                            <input type="checkbox" ${p.isDisc ? 'checked' : ''} onchange="storeProducts['${id}'].isDisc = this.checked; renderInventoryUI();" class="w-4 h-4 accent-red-500 rounded">
                            <span>تفعيل خصم بالمتجر</span>
                        </label>
                        ${p.isDisc ? `<input type="number" value="${oldPrice}" onchange="storeProducts['${id}'].oldPrice = parseFloat(this.value) || 0" class="w-24 border border-red-200 bg-white rounded-lg p-1.5 text-[11px] font-black text-red-500 text-center line-through shadow-sm outline-none" placeholder="السعر قبل">` : ''}
                    </div>
                </div>
                ${weightStatsHtml}
            </div>`;
        });

        cont.innerHTML = html;
    };

    window.updateProductWeightList = function (prodId, rawVal) {
        if (!storeProducts[prodId]) return;
        const parsedArr = typeof window.parseWeightsArray === 'function'
            ? window.parseWeightsArray(rawVal)
            : String(rawVal || '').split(/[\s,،;\n\r\-]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0);
        storeProducts[prodId].weightsList = parsedArr.join(' ');
        storeStock[prodId] = parsedArr.length;
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        window.saveAllSettings(true);
    };

    window.addNewProductUI = function () {
        const newId = 'p_' + Date.now();
        storeProducts[newId] = {
            name: 'صنف جديد',
            basePrice: 0,
            weight: '',
            images: [''],
            isExtra: false,
            isBest: false,
            isDisc: false,
            oldPrice: 0,
            oldBatchPrice: 0,
            isHidden: false,
            isWeightBased: false
        };
        storePrices[newId] = 0;
        storeStock[newId] = 0;
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
    };

    window.deleteProductUI = async function (id) {
        if (!confirm('هل أنت متأكد من حذف هذا الصنف من المتجر والنظام نهائياً؟')) return;
        try {
            const batchProcess = db.batch();
            batchProcess.set(db.collection('inventory').doc('settings'), {
                productsData: { [id]: firebase.firestore.FieldValue.delete() }
            }, { merge: true });
            batchProcess.set(db.collection('inventory').doc('prices'), {
                [id]: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            batchProcess.set(db.collection('inventory').doc('stock'), {
                [id]: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            await batchProcess.commit();
        } catch (e) {
            console.log('Firebase delete product error:', e);
        }

        delete storeProducts[id];
        delete storePrices[id];
        delete storeStock[id];
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
    };

    // =========================================================================
    // ❄️ 2. إدارة مخزن الفريزر الفعلي (Interactive Freezer Modal)
    // =========================================================================
    window.openFreezerModal = function () {
        window.renderFreezerItemsUI();
        if (typeof openModal === 'function') openModal('freezer-modal');
    };

    window.renderFreezerItemsUI = function () {
        const cont = document.getElementById('freezer-items-container');
        if (!cont) return;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const fzObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};

        let totalFreezerCount = 0;
        const rowsHtml = Object.keys(prodsObj).map(pId => {
            const p = prodsObj[pId];
            if (!p) return '';
            const currentQty = Math.max(0, Number(fzObj[pId]) || 0);
            totalFreezerCount += currentQty;

            return `
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
                    <div>
                        <span class="font-black text-slate-800 text-sm block">${p.name}</span>
                        <span class="text-[10px] font-bold text-slate-400">${p.weight || ''}</span>
                    </div>
                    <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1">
                        <button type="button" onclick="adjustFreezerItemQty('${pId}', -1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-red-500 hover:bg-red-50 font-black text-sm shadow-sm">-</button>
                        <input type="number" id="fz-input-${pId}" value="${currentQty}" min="0" onchange="setFreezerItemQty('${pId}', this.value)" class="w-16 bg-transparent text-center font-black text-base text-cyan-800 outline-none">
                        <button type="button" onclick="adjustFreezerItemQty('${pId}', 1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 font-black text-sm shadow-sm">+</button>
                    </div>
                </div>
            `;
        }).join('');

        cont.innerHTML = `
            <div class="bg-cyan-900 text-white p-3.5 rounded-2xl flex justify-between items-center mb-3 shadow-sm">
                <span class="text-xs font-black"><i class="fa-solid fa-snowflake text-cyan-300 ml-1"></i> إجمالي الرصيد الفعلي بالفريزر:</span>
                <span class="text-xl font-black text-amber-300">${totalFreezerCount} طبق</span>
            </div>
            <div class="space-y-2.5">${rowsHtml}</div>
        `;
    };

    window.adjustFreezerItemQty = function (pId, delta) {
        const cur = Math.max(0, Number(storeFreezer[pId]) || 0);
        const next = Math.max(0, cur + delta);
        window.setFreezerItemQty(pId, next);
    };

    window.setFreezerItemQty = async function (pId, val) {
        const cleanVal = Math.max(0, parseFloat(val) || 0);
        storeFreezer[pId] = cleanVal;
        window.renderFreezerItemsUI();
        if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

        try {
            await db.collection('inventory').doc('freezer').set({ [pId]: cleanVal }, { merge: true });
        } catch (e) {
            console.error('Freezer update error:', e);
        }
    };

    // =========================================================================
    // 🏪 3. إعدادات المتجر، المناطق، المناديب، والقوالب الذكية (Settings UI)
    // =========================================================================
    window.renderSettingsUI = function () {
        if (!document.getElementById('st-name')) return;

        document.getElementById('st-name').value = storeSettings.storeName || '';
        document.getElementById('st-phone').value = storeSettings.storePhone || '';
        document.getElementById('st-min-order').value = storeSettings.minOrder || 0;
        document.getElementById('st-is-open').checked = storeSettings.storeOpen !== false;
        document.getElementById('st-free-del').checked = !!storeSettings.freeDeliveryActive;
        document.getElementById('st-free-th').value = storeSettings.freeDeliveryThreshold || 0;
        document.getElementById('st-free-th').disabled = !storeSettings.freeDeliveryActive;

        if (document.getElementById('st-pts-per-100')) {
            document.getElementById('st-pts-per-100').value = storeSettings.pointsPer100 || 5;
        }
        if (document.getElementById('st-pts-value')) {
            document.getElementById('st-pts-value').value = storeSettings.pointValueInEGP || 0.40;
        }

        // 1. رسم مناطق التوصيل
        const zCont = document.getElementById('zones-list-container');
        if (zCont) {
            const zones = storeSettings.deliveryZones || [];
            zCont.innerHTML = zones.map((z, i) => `
                <div class="flex items-center gap-2 mb-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                    <span class="text-[10px] font-black text-slate-400 px-1.5">${i + 1}</span>
                    <input type="text" value="${z.name || ''}" onchange="storeSettings.deliveryZones[${i}].name=this.value.trim(); generateDynamicOrderInputs();" class="flex-1 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-100" placeholder="اسم المنطقة">
                    <div class="relative w-24">
                        <input type="number" value="${z.price || 0}" onchange="storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0; generateDynamicOrderInputs();" class="w-full border border-slate-200 rounded-lg p-2 pl-6 text-xs font-black text-indigo-600 bg-white outline-none text-center" placeholder="السعر">
                        <span class="absolute left-2 top-2 text-[10px] font-bold text-slate-400">ج</span>
                    </div>
                    <button onclick="storeSettings.deliveryZones.splice(${i}, 1); renderSettingsUI(); generateDynamicOrderInputs();" class="w-8 h-8 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد مناطق مسجلة، اضغط (+) لإضافة منطقة.</div>`;
        }

        // 2. رسم فريق المناديب
        const dCont = document.getElementById('drivers-list-container');
        if (dCont) {
            const drivers = storeSettings.drivers || [];
            dCont.innerHTML = drivers.map((d, i) => `
                <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 mb-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                    <input type="text" value="${d.name || ''}" onchange="storeSettings.drivers[${i}].name=this.value.trim()" placeholder="اسم المندوب" class="flex-1 min-w-[110px] border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none">
                    <input type="tel" value="${d.phone || ''}" onchange="storeSettings.drivers[${i}].phone=this.value.trim()" placeholder="رقم الواتساب" class="w-32 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none text-left" dir="ltr">
                    <input type="text" value="${d.pin || ''}" onchange="storeSettings.drivers[${i}].pin=this.value.trim()" placeholder="PIN" title="الرقم السري للمندوب" class="w-20 border border-slate-200 rounded-lg p-2 text-xs font-black text-blue-700 bg-white outline-none text-center">
                    <button onclick="storeSettings.drivers.splice(${i}, 1); renderSettingsUI();" class="w-8 h-8 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400">لا يوجد مناديب مسجلين، اضغط (+) لإضافة مندوب.</div>`;
        }

        // 3. قوالب الرسائل
        if (document.getElementById('admin-whatsapp-template')) {
            document.getElementById('admin-whatsapp-template').value = storeSettings.whatsappTemplate || '';
            document.getElementById('admin-dispatch-template').value = storeSettings.dispatchTemplate || '';
            document.getElementById('admin-ticktick-template').value = storeSettings.ticktickTemplate || '';
            document.getElementById('admin-batch-hashtag').value = storeSettings.batchHashtag || '';
        }

        // تفعيل الضغط على المتغيرات لإدراجها في القالب + حقن أدوات الشيت والنسخ الاحتياطي
        initInteractiveTemplateVariables();
        injectGoogleSheetAndBackupControls();
        if (typeof window.syncWaybillSettingsUI === 'function') window.syncWaybillSettingsUI();
    };

    window.addNewZoneUI = function () {
        if (!storeSettings.deliveryZones) storeSettings.deliveryZones = [];
        storeSettings.deliveryZones.push({ name: '', price: 0 });
        window.renderSettingsUI();
    };

    window.addNewDriverUI = function () {
        if (!storeSettings.drivers) storeSettings.drivers = [];
        storeSettings.drivers.push({ name: '', phone: '', pin: '' });
        window.renderSettingsUI();
    };

    // تحويل متغيرات القوالب إلى أزرار ذكية تدرج المتغير مكان المؤشر
    function initInteractiveTemplateVariables() {
        const templateIds = ['admin-whatsapp-template', 'admin-dispatch-template', 'admin-ticktick-template'];
        templateIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.hasAttribute('data-focus-tracked')) {
                el.setAttribute('data-focus-tracked', '1');
                el.addEventListener('focus', () => { lastFocusedTemplateInput = el; });
            }
        });

        const settingsView = document.getElementById('view-settings');
        if (!settingsView) return;
        const varSpans = settingsView.querySelectorAll('p span.text-brand-primary');
        varSpans.forEach(sp => {
            if (sp.hasAttribute('data-var-clickable')) return;
            sp.setAttribute('data-var-clickable', '1');
            sp.classList.add('cursor-pointer', 'hover:bg-brand-primary', 'hover:text-white', 'transition-colors', 'px-2', 'py-0.5', 'inline-block', 'my-0.5');
            sp.title = 'اضغط لإدراج هذا المتغير داخل مربع الرسالة النشط';
            sp.onclick = () => {
                const target = lastFocusedTemplateInput || document.getElementById('admin-whatsapp-template');
                if (!target) return;
                const token = sp.innerText.trim();
                const start = target.selectionStart || target.value.length;
                const end = target.selectionEnd || target.value.length;
                target.value = target.value.substring(0, start) + token + target.value.substring(end);
                target.focus();
                target.selectionStart = target.selectionEnd = start + token.length;
            };
        });
    }

    // حقن إعدادات رابط Google Sheet وزر النسخ الاحتياطي الكامل داخل شاشة الإعدادات
    function injectGoogleSheetAndBackupControls() {
        const migrateBtn = document.getElementById('btn-migrate');
        if (!migrateBtn || document.getElementById('st-gsheet-webhook-box')) return;

        const parentCard = migrateBtn.closest('.bg-blue-50');
        if (!parentCard) return;

        const extraBox = document.createElement('div');
        extraBox.id = 'st-gsheet-webhook-box';
        extraBox.className = 'mt-3 pt-3 border-t border-blue-200/80 space-y-3';
        extraBox.innerHTML = `
            <div>
                <label class="text-[10px] font-black text-blue-900 block mb-1">🔗 رابط Google Apps Script Webhook (للمزامنة التلقائية مع الشيت):</label>
                <input type="text" id="st-gsheet-url" dir="ltr" value="${storeSettings.googleSheetWebhookUrl || ''}" onchange="storeSettings.googleSheetWebhookUrl = this.value.trim()" placeholder="https://script.google.com/macros/s/.../exec" class="w-full border border-blue-200 rounded-xl p-2.5 text-xs font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 text-left">
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-blue-100">
                <div>
                    <span class="text-xs font-black text-slate-800 block"><i class="fa-solid fa-shield-halved text-emerald-600 ml-1"></i> النسخة الاحتياطية الشاملة (Full System Backup)</span>
                    <span class="text-[10px] font-bold text-slate-400">تحميل نسخة كاملة من (الطلبات + العملاء + المخزون + الإعدادات) في ملف واحد آمن</span>
                </div>
                <button type="button" onclick="exportFullSystemBackupJSON()" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 active:scale-95">
                    <i class="fa-solid fa-download text-amber-400"></i> تحميل نسخة احتياطية
                </button>
            </div>
        `;
        parentCard.appendChild(extraBox);
    }

    // =========================================================================
    // 💾 4. حفظ الإعدادات الشامل (saveAllSettings)
    // =========================================================================
    window.saveAllSettings = async function (silent = false) {
        const btn = document.getElementById('global-save-btn');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn && !silent) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
            btn.disabled = true;
        }

        try {
            if (document.getElementById('st-name')) {
                storeSettings.storeName = document.getElementById('st-name').value.trim();
                storeSettings.storePhone = document.getElementById('st-phone').value.trim();
                storeSettings.minOrder = parseInt(document.getElementById('st-min-order').value) || 0;
                storeSettings.storeOpen = document.getElementById('st-is-open').checked;
                storeSettings.freeDeliveryActive = document.getElementById('st-free-del').checked;
                storeSettings.freeDeliveryThreshold = parseInt(document.getElementById('st-free-th').value) || 0;
                storeSettings.pointsPer100 = parseFloat(document.getElementById('st-pts-per-100')?.value) || 5;
                storeSettings.pointValueInEGP = parseFloat(document.getElementById('st-pts-value')?.value) || 0.40;
            }

            if (document.getElementById('st-gsheet-url')) {
                storeSettings.googleSheetWebhookUrl = document.getElementById('st-gsheet-url').value.trim();
            }

            if (document.getElementById('admin-whatsapp-template')) {
                storeSettings.whatsappTemplate = document.getElementById('admin-whatsapp-template').value;
                storeSettings.dispatchTemplate = document.getElementById('admin-dispatch-template').value;
                storeSettings.ticktickTemplate = document.getElementById('admin-ticktick-template').value;
                storeSettings.batchHashtag = document.getElementById('admin-batch-hashtag').value.trim();
            }

            if (typeof window.getWaybillConfig === 'function') {
                storeSettings.waybillConfig = window.getWaybillConfig();
            }

            storeSettings.deliveryZones = (storeSettings.deliveryZones || []).filter(z => z && z.name && z.name.trim() !== '');
            storeSettings.drivers = (storeSettings.drivers || []).filter(d => d && (d.name || d.phone));
            storeSettings.productsData = storeProducts;

            await Promise.all([
                db.collection('inventory').doc('settings').set(storeSettings, { merge: true }),
                db.collection('inventory').doc('stock').set(storeStock, { merge: true }),
                db.collection('inventory').doc('prices').set(storePrices, { merge: true }),
                db.collection('inventory').doc('batches').set(storeBatches, { merge: true })
            ]);

            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();

            if (!silent) {
                if (typeof window.showToast === 'function') window.showToast('تم حفظ جميع الإعدادات والأصناف بنجاح! 🚀');
                else alert('تم الحفظ بنجاح! 🚀');
            }
        } catch (e) {
            console.error('Save settings error:', e);
            if (!silent) alert('حدث خطأ أثناء حفظ الإعدادات!');
        }

        if (btn && !silent) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // =========================================================================
    // 🪙 5. تفعيل نقاط الولاء بأثر رجعي (على الطلبات المكتملة فقط وبدون التوصيل)
    // =========================================================================
    window.calculateRetroactivePoints = async function () {
        const ptsPer100 = parseFloat(document.getElementById('st-pts-per-100')?.value) || storeSettings.pointsPer100 || 5;
        if (!confirm(`⚠️ سيتم حساب النقاط على (الطلبات المكتملة فقط) وبناءً على صافي قيمة المنتجات بدون التوصيل (${ptsPer100} نقطة لكل 100 ج).\n\nهل تريد المتابعة؟`)) return;

        const btn = document.getElementById('btn-retro-points');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري حساب الطلبات المكتملة...';
            btn.disabled = true;
        }

        try {
            const customerSpendingMap = {};
            (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
                if (!o || o.status !== 'completed' || !o.customerPhone) return;
                const normPhone = window.normalizePhone ? window.normalizePhone(o.customerPhone) : o.customerPhone.trim();
                if (!normPhone) return;
                const orderSubtotal = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - (Number(o.deliveryFee) || 0));
                customerSpendingMap[normPhone] = (customerSpendingMap[normPhone] || 0) + orderSubtotal;
            });

            let batchesCommits = [];
            let dbBatch = db.batch();
            let count = 0;
            let updatedCustomers = 0;

            Object.keys(customerSpendingMap).forEach(phone => {
                const totalSpent = customerSpendingMap[phone];
                if (totalSpent >= 100) {
                    const earnedPoints = Math.floor(totalSpent / 100) * ptsPer100;
                    if (earnedPoints > 0) {
                        const cleanPhone = phone.startsWith('0') ? phone : '0' + phone;
                        const ref = db.collection('customers').doc(cleanPhone);
                        dbBatch.set(ref, { totalSpent: totalSpent, walletPoints: earnedPoints }, { merge: true });
                        count++;
                        updatedCustomers++;
                        if (count >= 400) {
                            batchesCommits.push(dbBatch.commit());
                            dbBatch = db.batch();
                            count = 0;
                        }
                    }
                }
            });

            if (count > 0) batchesCommits.push(dbBatch.commit());
            await Promise.all(batchesCommits);

            if (typeof window.refreshCustomersData === 'function') window.refreshCustomersData();
            alert(`🎉 تمت العملية بنجاح! تم تحديث نقاط المحفظة لـ (${updatedCustomers}) عميل بناءً على طلباتهم المكتملة فقط.`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حساب النقاط: ' + e.message);
        }

        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // =========================================================================
    // 📊 6. المزامنة مع Google Sheets (متوافقة 100% مع سكربت كاشف الأرقام للموبايل)
    // =========================================================================
    const DEFAULT_GSHEET_URL = 'https://script.google.com/macros/s/AKfycbwp7qhmVx2Uz1ihRdvJ7bDEVsZfejG51116ylcWyVSiDm2OOTOWR_9A4UNDeHKuYgeQQw/exec';

    window.syncOrderToGoogleSheet = async function (orderObj, action = 'update') {
        if (!orderObj || !orderObj.customerPhone) return;
        const webhookUrl = storeSettings?.googleSheetWebhookUrl || DEFAULT_GSHEET_URL;
        if (!webhookUrl) return;

        try {
            let statusAr = 'جديد 🆕';
            if (orderObj.status === 'processing') statusAr = '⏳ قيد التجهيز';
            else if (orderObj.status === 'completed') statusAr = '✅ مكتمل';
            else if (orderObj.status === 'canceled') statusAr = '❌ ملغي';
            else if (orderObj.status === 'deferred') statusAr = '📅 مؤجل';
            else if (orderObj.status === 'dispatched') statusAr = '🛵 في الطريق';
            else if (orderObj.status === 'no_answer') statusAr = '📵 لم يرد';
            else if (orderObj.status === 'trash') statusAr = '🗑️ محذوف';

            let itemsText = '';
            if (orderObj.items && Array.isArray(orderObj.items)) {
                itemsText = orderObj.items.map(i => '▪️ ' + i.quantity + 'x ' + i.name).join('\n');
            }

            let notesText = '';
            if (orderObj.adminNote) notesText += '🔒 إداري: ' + orderObj.adminNote + '\n';
            if (orderObj.driverNote) notesText += '🛵 مندوب: ' + orderObj.driverNote;

            const payload = {
                action: action || 'update',
                phone: orderObj.customerPhone,
                name: orderObj.customerName || 'بدون اسم',
                zone: orderObj.zone || '---',
                status: orderObj.status || 'new',
                statusAr: statusAr,
                total: orderObj.total || 0,
                batch: orderObj.batchName || 'أوردر عادي',
                details: itemsText || 'لا توجد تفاصيل',
                notes: notesText.trim()
            };

            fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        } catch (e) {
            console.log('Google sheet sync skipped:', e);
        }
    };


    window.migrateOldOrdersToSheet = async function () {
        const webhookUrl = document.getElementById('st-gsheet-url')?.value.trim() || storeSettings?.googleSheetWebhookUrl;
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];

        if (ordersList.length === 0) return alert('لا توجد طلبات مسجلة لترحيلها!');

        if (!webhookUrl) {
            if (confirm(`لم يتم وضع رابط Google Apps Script Webhook بعد.\nهل تريد تصدير كل الطلبات (${ordersList.length} طلب) في ملف Excel (CSV) جاهز لرفعه مباشرة إلى جوجل شيت؟`)) {
                return window.exportAllOrdersToCSV(ordersList);
            }
            return;
        }

        if (!confirm(`سيتم إرسال (${ordersList.length}) طلب إلى شيت جوجل الآن. تأكيد البدء؟`)) return;

        const btn = document.getElementById('btn-migrate');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري النقل للشيت...';
            btn.disabled = true;
        }

        try {
            let sent = 0;
            for (const o of ordersList) {
                if (o.status === 'trash') continue;
                await window.syncOrderToGoogleSheet(o, 'update');
                sent++;
            }
            alert(`تم إرسال وترحيل (${sent}) طلب إلى جوجل شيت بنجاح! 🚀`);
        } catch (e) {
            alert('حدث خطأ أثناء ترحيل الطلبات!');
        }

        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // تصدير كافة الطلبات إلى ملف Excel CSV متوافق مع اللغة العربية
    window.exportAllOrdersToCSV = function (ordersArray) {
        const list = ordersArray || (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []);
        if (!list || list.length === 0) return alert('لا توجد بيانات لتصديرها!');

        const headers = ['كود الطلب', 'التاريخ', 'اسم العميل', 'الموبايل الأساسي', 'الموبايل البديل', 'المنطقة', 'العنوان', 'الأصناف', 'المنتجات', 'التوصيل', 'الخصم', 'الإجمالي', 'الدفع', 'آجل', 'الحالة', 'الدفعة', 'المندوب', 'ملاحظات إدارية'];
        const rows = list.map(o => {
            const itemsTxt = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' | ') : '';
            return [
                o.id || '',
                o.orderDate || '',
                o.customerName || '',
                o.customerPhone || '',
                o.customerPhone2 || '',
                o.zone || '',
                o.customerAddress || '',
                itemsTxt,
                o.subtotal || 0,
                o.deliveryFee || 0,
                o.discount || 0,
                o.total || 0,
                o.paymentMethod === 'online' ? 'أونلاين' : 'كاش',
                o.debt || 0,
                o.status || '',
                o.batchName || '',
                o.driverName || '',
                (o.adminNote || '').replace(/\n/g, ' ')
            ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sman_Hhya_Orders_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // تحميل نسخة احتياطية كاملة للنظام بصيغة JSON
    window.exportFullSystemBackupJSON = function () {
        const backupObj = {
            exportedAt: new Date().toISOString(),
            storeSettings: typeof storeSettings !== 'undefined' ? storeSettings : {},
            storeProducts: typeof storeProducts !== 'undefined' ? storeProducts : {},
            storePrices: typeof storePrices !== 'undefined' ? storePrices : {},
            storeStock: typeof storeStock !== 'undefined' ? storeStock : {},
            storeBatches: typeof storeBatches !== 'undefined' ? storeBatches : {},
            storeFreezer: typeof storeFreezer !== 'undefined' ? storeFreezer : {},
            customersCount: typeof customersData !== 'undefined' ? customersData.length : 0,
            ordersCount: typeof allOrdersRaw !== 'undefined' ? allOrdersRaw.length : 0,
            customers: typeof customersData !== 'undefined' ? customersData : [],
            orders: typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []
        };

        const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sman_Hhya_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // =========================================================================
    // 🔄 7. التحديث الفوري الإجباري للتطبيق على الموبايل والكمبيوتر (forceUpdateAppNow)
    // =========================================================================
    window.forceUpdateAppNow = async function () {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                    await reg.unregister();
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (const key of keys) {
                    await caches.delete(key);
                }
            }
        } catch (e) {
            console.log('Cache clear info:', e);
        }
        const cleanUrl = window.location.pathname + '?v=' + Date.now() + window.location.hash;
        window.location.replace(cleanUrl);
    };

    // تشغيل التهيئة التلقائية عند جاهزية الصفحة
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.renderInventoryUI();
                window.renderSettingsUI();
            }, 450);
        });
    } else {
        setTimeout(() => {
            window.renderInventoryUI();
            window.renderSettingsUI();
        }, 450);
    }
})();

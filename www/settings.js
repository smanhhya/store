
// www/settings.js
window.storeSettings = { deliveryZones: [], drivers: [], promoCodes: [], storeOpen: true };
window.storeProducts = {}; 
window.storePrices = {}; 
window.storeStock = {}; 

window.defaultProducts = {
    'super': { name: 'طبق سوبر', basePrice: 100, weight: '300-350 جم', images: ['super.png'], isExtra: false },
    'jumbo': { name: 'طبق جامبو', basePrice: 110, weight: '350-400 جم', images: ['jumbo.png'], isExtra: false },
    'special': { name: 'طبق سبشيال', basePrice: 120, weight: '400-450 جم', images: ['special.png'], isExtra: false },
    'superspecial': { name: 'سوبر سبشيال', basePrice: 130, weight: '450-500 جم', images: ['superspecial.png'], isExtra: false },
    'eggs': { name: 'طبق بيض سمان', basePrice: 50, weight: 'طبق 18 بيضة', images: ['eggs.jpg'], isExtra: true },
    'chicks': { name: 'كتاكيت سمان', basePrice: 8, weight: 'كتكوت', images: ['chicks.jpg'], isExtra: true }
};

window.renderSettingsUI = () => { 
    document.getElementById('st-name').value = storeSettings.storeName || ''; 
    document.getElementById('st-phone').value = storeSettings.storePhone || ''; 
    document.getElementById('st-min-order').value = storeSettings.minOrder || 0; 
    document.getElementById('st-is-open').checked = storeSettings.storeOpen !== false; 
    document.getElementById('st-free-del').checked = storeSettings.freeDeliveryActive; 
    document.getElementById('st-free-th').value = storeSettings.freeDeliveryThreshold || 0; 
    document.getElementById('st-free-th').disabled = !storeSettings.freeDeliveryActive; 
    document.getElementById('st-pts-per-100').value = storeSettings.pointsPer100 || 5; 
    document.getElementById('st-pts-value').value = storeSettings.pointValueInEGP || 0.40; 
    
    const zCont = document.getElementById('zones-list-container'); 
    if(zCont) { 
        zCont.innerHTML = ''; 
        (storeSettings.deliveryZones || []).forEach((z, i) => { 
            zCont.innerHTML += `<div class="flex gap-2 mb-2"><input type="text" value="${z.name}" onchange="storeSettings.deliveryZones[${i}].name=this.value" class="flex-1 border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-slate-50 outline-none" placeholder="المنطقة"><input type="number" value="${z.price}" onchange="storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0" class="w-24 border border-slate-200 rounded-xl p-2.5 text-xs font-black text-indigo-600 bg-slate-50 outline-none text-center" placeholder="السعر"><button onclick="storeSettings.deliveryZones.splice(${i}, 1); renderSettingsUI();" class="w-10 bg-slate-100 text-slate-400 hover:text-red-500 rounded-xl"><i class="fa-solid fa-trash"></i></button></div>`; 
        }); 
    } 
    
    const dCont = document.getElementById('drivers-list-container'); 
    if(dCont) { 
        dCont.innerHTML = ''; 
        (storeSettings.drivers || []).forEach((d, i) => { 
            dCont.innerHTML += `<div class="flex gap-2 mb-2"><input type="text" value="${d.name}" onchange="storeSettings.drivers[${i}].name=this.value" placeholder="المندوب" class="flex-1 border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-slate-50 outline-none"><input type="text" value="${d.phone}" onchange="storeSettings.drivers[${i}].phone=this.value" placeholder="واتساب" class="w-32 border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-slate-50 outline-none text-left" dir="ltr"><button onclick="storeSettings.drivers.splice(${i}, 1); renderSettingsUI();" class="w-10 bg-slate-100 text-slate-400 hover:text-red-500 rounded-xl"><i class="fa-solid fa-trash"></i></button></div>`; 
        }); 
    } 
    
    if(document.getElementById('admin-whatsapp-template')) { 
        document.getElementById('admin-whatsapp-template').value = storeSettings.whatsappTemplate || ''; 
        document.getElementById('admin-dispatch-template').value = storeSettings.dispatchTemplate || ''; 
        document.getElementById('admin-ticktick-template').value = storeSettings.ticktickTemplate || ''; 
        document.getElementById('admin-batch-hashtag').value = storeSettings.batchHashtag || ''; 
    } 
};

window.addNewZoneUI = () => { if(!storeSettings.deliveryZones) storeSettings.deliveryZones = []; storeSettings.deliveryZones.push({name:'', price:0}); renderSettingsUI(); }; 
window.addNewDriverUI = () => { if(!storeSettings.drivers) storeSettings.drivers = []; storeSettings.drivers.push({name:'', phone:'', pin:''}); renderSettingsUI(); };

window.saveAllSettings = async () => {
    const btn = document.getElementById('global-save-btn'); const origHtml = btn.innerHTML; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...'; btn.disabled = true;

    try {
        if(document.getElementById('st-name')) { 
            storeSettings.storeName = document.getElementById('st-name').value; 
            storeSettings.storePhone = document.getElementById('st-phone').value; 
            storeSettings.minOrder = parseInt(document.getElementById('st-min-order').value) || 0; 
            storeSettings.storeOpen = document.getElementById('st-is-open').checked; 
            storeSettings.freeDeliveryActive = document.getElementById('st-free-del').checked; 
            storeSettings.freeDeliveryThreshold = parseInt(document.getElementById('st-free-th').value) || 0; 
            storeSettings.pointsPer100 = parseFloat(document.getElementById('st-pts-per-100').value) || 5; 
            storeSettings.pointValueInEGP = parseFloat(document.getElementById('st-pts-value').value) || 0.40;
        }
        
        if(document.getElementById('admin-whatsapp-template')) { 
            storeSettings.whatsappTemplate = document.getElementById('admin-whatsapp-template').value; 
            storeSettings.dispatchTemplate = document.getElementById('admin-dispatch-template').value; 
            storeSettings.ticktickTemplate = document.getElementById('admin-ticktick-template').value; 
            storeSettings.batchHashtag = document.getElementById('admin-batch-hashtag').value; 
        }

        storeSettings.deliveryZones = (storeSettings.deliveryZones || []).filter(z => z && z.name && z.name.trim() !== ''); 
        storeSettings.drivers = (storeSettings.drivers || []).filter(d => d && (d.name || d.phone)); 
        storeSettings.productsData = storeProducts;

        await Promise.all([ 
            db.collection("inventory").doc("settings").set(storeSettings, {merge: true}), 
            db.collection("inventory").doc("stock").set(storeStock, {merge: true}), 
            db.collection("inventory").doc("prices").set(storePrices, {merge: true}) 
        ]);
        alert('تم الحفظ بنجاح! 🚀');
    } catch(e) { alert('خطأ في الحفظ!'); }
    btn.innerHTML = origHtml; btn.disabled = false;
};

window.renderInventoryUI = () => { 
    const cont = document.getElementById('products-list-container'); if(!cont) return; 
    cont.innerHTML = ''; 
    Object.keys(storeProducts).forEach(id => { 
        const p = storeProducts[id]; 
        const price = storePrices[id] || p.basePrice || 0; 
        const stock = storeStock[id] || 0; 
        
        cont.innerHTML += `
        <div class="bg-white p-5 rounded-[1.5rem] border border-slate-100 mb-4 shadow-soft">
            <div class="flex justify-between items-start gap-3 mb-3">
                <div class="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div><label class="text-[10px] font-bold text-slate-400 block mb-1">اسم المنتج</label><input type="text" value="${p.name}" onchange="storeProducts['${id}'].name = this.value" class="w-full border-none bg-slate-50 rounded-xl p-2.5 text-xs font-black text-slate-800"></div>
                    <div><label class="text-[10px] font-bold text-slate-400 block mb-1">الوزن / الوصف</label><input type="text" value="${p.weight||''}" onchange="storeProducts['${id}'].weight = this.value" class="w-full border-none bg-slate-50 rounded-xl p-2.5 text-xs font-bold text-slate-700"></div>
                    <div><label class="text-[10px] font-bold text-slate-400 block mb-1">السعر (ج)</label><input type="number" value="${price}" onchange="storePrices['${id}'] = parseInt(this.value) || 0" class="w-full border-none bg-blue-50 rounded-xl p-2.5 text-sm font-black text-blue-700 text-center"></div>
                    <div><label class="text-[10px] font-bold text-slate-400 block mb-1">المتاح للحجز</label><input type="number" value="${stock}" onchange="storeStock['${id}'] = parseInt(this.value) || 0" class="w-full border-none bg-emerald-50 rounded-xl p-2.5 text-sm font-black text-emerald-700 text-center"></div>
                    <div><label class="text-[10px] font-bold text-slate-400 block mb-1">رابط الصورة</label><input type="text" value="${p.images?.[0]||''}" onchange="storeProducts['${id}'].images = [this.value]" class="w-full border-none bg-slate-50 rounded-xl p-2.5 text-[10px] font-bold text-slate-500" dir="ltr"></div>
                </div>
            </div>
        </div>`; 
    }); 
};

window.addNewProductUI = () => { 
    const newId = 'p_' + Date.now(); 
    storeProducts[newId] = { name: "صنف جديد", basePrice: 0, weight: "", images: [""], isExtra: false }; 
    storePrices[newId] = 0; storeStock[newId] = 0; 
    renderInventoryUI(); 
};

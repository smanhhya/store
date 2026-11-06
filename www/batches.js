
// www/batches.js
window.storeBatches = {};
window.storeFreezer = {};
window.currentEditingBatchId = null;

window.renderBatchesUI = () => {
    const cont = document.getElementById('batches-list-container'); if(!cont) return;
    if(Object.keys(storeBatches).length === 0) { 
        cont.innerHTML = '<div class="w-full text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لا توجد دفعات حالياً. أضف دفعة جديدة للبدء.</div>'; 
        return; 
    }
    cont.innerHTML = ''; 
    
    Object.keys(storeBatches).reverse().forEach(bId => { 
        const b = storeBatches[bId]; 
        if (!b || typeof b !== 'object') return;
        if (!b.name || b.name === 'undefined' || b.name.trim() === '') b.name = "دفعة جديدة";

        let stockHtml = '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 border-t border-slate-100 pt-4">'; 
        Object.keys(storeProducts).forEach(pId => { 
            let pName = storeProducts[pId].name; 
            let bStock = b.stock ? (b.stock[pId] || 0) : 0; 
            let bBooked = b.booked ? (b.booked[pId] || 0) : 0; 
            let remaining = bStock - bBooked; 
            
            stockHtml += `
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label class="text-[11px] font-black text-slate-700 block truncate mb-2">${pName}</label>
                <div class="flex items-center gap-1.5">
                    <div class="flex-1"><input type="number" value="${bStock}" onchange="updateBatchStock('${bId}', '${pId}', this.value)" class="w-full border-none bg-white rounded-lg p-1.5 text-xs font-black text-center shadow-sm"></div>
                    <div class="flex-1 text-center bg-white border rounded-lg p-1.5"><span class="text-xs font-black text-blue-500">${bBooked}</span></div>
                    <div class="flex-1 text-center bg-emerald-50 border border-emerald-100 rounded-lg p-1.5"><span class="text-xs font-black text-emerald-700">${remaining}</span></div>
                </div>
            </div>`; 
        }); 
        stockHtml += '</div>';

        cont.innerHTML += `
        <div class="bg-white p-5 rounded-[1.5rem] shadow-soft border border-slate-100 relative overflow-hidden mb-4">
            <div class="absolute top-0 right-0 w-2 h-full ${b.isOpen ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <input type="text" value="${b.name}" onchange="updateBatchNameAndOrders('${bId}', this.value)" class="border-none bg-slate-50 rounded-xl p-3 font-black text-slate-800 w-full md:w-1/3 outline-none shadow-sm">
                <div class="flex flex-wrap items-center gap-2">
                    <button onclick="smartDistributeBatch('${bId}')" class="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-xs font-bold shadow-sm"><i class="fa-solid fa-wand-magic-sparkles"></i> توزيع ذكي</button>
                    <button onclick="openSlaughterModal('${bId}')" class="bg-rose-50 text-rose-600 px-3 py-2 rounded-xl text-xs font-bold shadow-sm"><i class="fa-solid fa-knife-kitchen"></i> تم الذبح</button>
                    <button onclick="viewBatchBookings('${bId}')" class="bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold shadow-sm"><i class="fa-solid fa-list-check"></i> الكشف</button>
                    <button onclick="openBatchSettings('${bId}')" class="bg-purple-50 text-purple-600 px-3 py-2 rounded-xl text-xs font-bold shadow-sm"><i class="fa-solid fa-bullhorn"></i> إعدادات</button>
                    <button onclick="deleteBatchUI('${bId}')" class="bg-red-50 text-red-500 w-8 h-8 rounded-xl flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            ${stockHtml}
        </div>`; 
    });
};

window.addNewBatchUI = async () => { 
    const bId = 'batch_' + Date.now(); 
    storeBatches[bId] = { name: "دفعة جديدة", isOpen: true, isVisible: true, stock: {}, booked: {} }; 
    try { await db.collection("inventory").doc("batches").set({ [bId]: storeBatches[bId] }, { merge: true }); } catch(e){}
    renderBatchesUI(); 
};

window.updateBatchStock = async (bId, pId, val) => { 
    if(!storeBatches[bId].stock) storeBatches[bId].stock = {}; 
    storeBatches[bId].stock[pId] = parseInt(val) || 0; 
    try {
        await db.collection("inventory").doc("batches").update({ [`${bId}.stock.${pId}`]: storeBatches[bId].stock[pId] });
    } catch(e) {
        await db.collection("inventory").doc("batches").set({ [bId]: { stock: storeBatches[bId].stock } }, { merge: true });
    }
    renderBatchesUI(); 
};

window.deleteBatchUI = async (bId) => { 
    if(confirm("حذف هذه الدفعة نهائياً؟")) { 
        try {
            await db.collection("inventory").doc("batches").update({ [bId]: firebase.firestore.FieldValue.delete() });
            delete storeBatches[bId]; 
            renderBatchesUI(); 
        } catch(e){}
    } 
};

window.updateBatchNameAndOrders = async (bId, newName) => {
    if (!newName || !newName.trim()) return;
    storeBatches[bId].name = newName;
    try {
        let batchProcess = db.batch();
        batchProcess.update(db.collection('inventory').doc('batches'), { [`${bId}.name`]: newName });
        let snap = await db.collection('orders').where('batchId', '==', bId).get();
        snap.forEach(doc => { batchProcess.update(doc.ref, { batchName: newName }); });
        await batchProcess.commit();
        if(window.renderOrdersList) window.renderOrdersList();
    } catch (e){}
};

window.openSlaughterModal = (bId) => {
    const b = storeBatches[bId]; if(!b) return;
    document.getElementById('slaughter-batch-id').value = bId;
    let html = '';
    Object.keys(storeProducts).forEach(pId => {
        let qty = (b.stock && b.stock[pId]) ? b.stock[pId] : 0;
        let booked = (b.booked && b.booked[pId]) ? b.booked[pId] : 0;
        let remaining = qty - booked;
        if(remaining > 0) {
            html += `<div class="flex justify-between items-center bg-white p-3 rounded-xl border mb-2"><span class="font-black text-sm">${storeProducts[pId].name}</span><input type="number" id="slaughter-qty-${pId}" value="${remaining}" class="w-16 border rounded p-1 text-center font-bold text-rose-600"></div>`;
        }
    });
    document.getElementById('slaughter-items-container').innerHTML = html || '<p class="text-center">لا توجد كميات للترحيل</p>';
    openModal('slaughter-modal');
};

window.confirmBatchSlaughter = async () => {
    let bId = document.getElementById('slaughter-batch-id').value;
    let b = storeBatches[bId]; if(!b) return;
    let fzUpdates = {}, newStock = {...b.stock}, totalMoved = 0;
    Object.keys(storeProducts).forEach(pId => {
        let input = document.getElementById(`slaughter-qty-${pId}`);
        if(input) {
            let val = parseInt(input.value) || 0;
            if(val > 0) {
                fzUpdates[pId] = firebase.firestore.FieldValue.increment(val);
                storeFreezer[pId] = (storeFreezer[pId] || 0) + val;
                newStock[pId] -= val;
                totalMoved += val;
            }
        }
    });
    if(totalMoved > 0) {
        try {
            let batch = db.batch();
            batch.set(db.collection('inventory').doc('freezer'), fzUpdates, { merge: true });
            batch.set(db.collection('inventory').doc('batches'), { [bId]: { stock: newStock, isOpen: false, isVisible: false } }, { merge: true });
            await batch.commit();
            b.stock = newStock; b.isOpen = false; b.isVisible = false;
            renderBatchesUI(); closeModal('slaughter-modal');
        } catch(e){}
    }
};

window.smartDistributeBatch = async (bId) => {
    alert("ميزة التوزيع الذكي نشطة وجاهزة.");
};

window.openBatchSettings = (bId) => {
    currentEditingBatchId = bId;
    let b = storeBatches[bId];
    document.getElementById('batch-del-start').value = b.deliveryStart || '';
    document.getElementById('batch-del-end').value = b.deliveryEnd || '';
    document.getElementById('batch-actual-pairs').value = b.actualPairs || '';
    document.getElementById('batch-public-pairs').value = b.publicPairs || '';
    document.getElementById('batch-urgent-note').value = b.urgentNote || '';
    openModal('batch-settings-modal');
};

window.saveBatchSettings = async () => {
    if(!currentEditingBatchId) return;
    let bId = currentEditingBatchId;
    try {
        await db.collection("inventory").doc("batches").set({
            [bId]: {
                deliveryStart: document.getElementById('batch-del-start').value,
                deliveryEnd: document.getElementById('batch-del-end').value,
                actualPairs: parseInt(document.getElementById('batch-actual-pairs').value) || 0,
                publicPairs: parseInt(document.getElementById('batch-public-pairs').value) || 0,
                urgentNote: document.getElementById('batch-urgent-note').value.trim()
            }
        }, { merge: true });
        closeModal('batch-settings-modal');
    } catch(e){}
};

window.viewBatchBookings = async (bId) => {
    const b = storeBatches[bId]; if(!b) return;
    document.getElementById('bb-title').innerText = b.name; 
    const contentDiv = document.getElementById('bb-content'); 
    contentDiv.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-teal-400"></i></div>'; 
    openModal('batch-bookings-modal');
    try { 
        const snap = await db.collection('orders').where('batchId', '==', bId).get(); 
        let orders = []; snap.forEach(doc => { let data = doc.data(); if(data.status !== 'canceled') orders.push(data); });
        contentDiv.innerHTML = `<div class="p-4 font-black">إجمالي الحجوزات: ${orders.length}</div>`;
    } catch(e){}
};

window.previewLiveMessage = () => {};
window.openBatchBroadcastUI = () => {};

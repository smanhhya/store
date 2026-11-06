
// www/customers.js
window.customersData = [];
window.currentViewedCustomerPhone = null;

window.refreshCustomersData = () => {
    db.collection('customers').get().then(snap => {
        customersData = [];
        snap.forEach(doc => customersData.push(doc.data()));
        customersData.sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0));

        let tbody = '';
        customersData.forEach(c => {
            let location = c.zone || '';
            if(c.address) location += ' - ' + c.address;
            let stickyHtml = c.stickyNote ? `<div class="text-[10px] text-yellow-900 font-black mt-1 max-w-[220px] truncate mx-auto bg-yellow-200/80 px-2 py-0.5 rounded border border-yellow-400"><i class="fa-solid fa-thumbtack"></i> ${c.stickyNote}</div>` : '';
            
            tbody += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 customer-row" data-search="${c.name}${c.phone}${location}">
                <td class="py-4 px-6">
                    <div class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary" onclick="openCustomerCard('${c.phone}')">${c.name || 'عميل'}</div>
                    <div class="text-[11px] text-slate-500 font-bold mt-0.5" dir="ltr">${c.phone || ''}</div>
                </td>
                <td class="py-4 px-6 text-center">
                    <div class="text-xs font-bold text-slate-700">${location || 'غير مسجل'}</div>
                    ${stickyHtml}
                </td>
                <td class="py-4 px-6 text-center font-black text-slate-700 text-base">${c.ordersCount || 0}</td>
                <td class="py-4 px-6 text-center font-black text-emerald-600 text-base">${(c.totalSpent || 0).toLocaleString()} ج</td>
                <td class="py-4 px-6 text-center">
                    <button onclick="openCustomerCard('${c.phone}')" class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white">الأرشيف</button>
                </td>
            </tr>`;
        });
        let tbEl = document.getElementById('customers-tbody');
        if(tbEl) tbEl.innerHTML = tbody || `<tr><td colspan="5" class="text-center p-12 text-slate-400 font-bold text-sm">لا يوجد عملاء</td></tr>`;
        
        renderDebtsUI();
        if(window.renderBlacklistUI) window.renderBlacklistUI();
    });
};

window.filterCustomers = () => {
    let input = document.getElementById('search-customer').value.toLowerCase();
    document.querySelectorAll('.customer-row').forEach(row => {
        let searchData = row.getAttribute('data-search').toLowerCase();
        row.style.display = searchData.includes(input) ? '' : 'none';
    });
};

window.openCustomerCard = async (phone) => {
    let c = customersData.find(x => x.phone === phone); if(!c) return;
    document.getElementById('cm-name').innerText = c.name || 'غير مسجل'; 
    document.getElementById('cm-phone').innerText = c.phone || '';
    document.getElementById('cm-address').innerText = (c.zone ? c.zone + ' - ' : '') + (c.address || 'لم يتم تسجيل عنوان');
    document.getElementById('cm-ltv').innerText = `${(c.totalSpent || 0).toLocaleString()} ج`; 
    document.getElementById('cm-orders').innerText = c.ordersCount || 0;
    document.getElementById('cm-debt').innerText = (c.debt || 0) + ' ج';
    document.getElementById('cm-btn-wa').href = `https://wa.me/${(c.phone||'').startsWith('0')?'2'+c.phone:c.phone}`;
    document.getElementById('cm-btn-call').href = `tel:${c.phone}`;
    document.getElementById('cm-notebook').value = c.notebook || '';
    document.getElementById('cm-sticky-note').value = c.stickyNote || '';
    
    renderAltPhonesList(c.phone);
    openModal('customer-modal');
};

window.manageCustomerDebt = async (action) => {
    const phone = document.getElementById('cm-phone').innerText;
    const currentDebt = parseInt(document.getElementById('cm-debt').innerText) || 0;
    let amountStr = prompt(action === 'pay' ? `سداد مديونية (الحالي: ${currentDebt} ج):` : `إضافة مديونية جديدة:`);
    if(amountStr) {
        let amount = parseInt(amountStr);
        let cleanPhone = phone.startsWith('0') ? phone : '0' + phone;
        await db.collection('customers').doc(cleanPhone).update({
            debt: firebase.firestore.FieldValue.increment(action === 'pay' ? -amount : amount)
        });
        openCustomerCard(phone);
        refreshCustomersData();
    }
};

window.saveCustomerNotebook = async () => {
    const phone = document.getElementById('cm-phone').innerText;
    const text = document.getElementById('cm-notebook').value.trim();
    if(!phone) return;
    await db.collection('customers').doc(phone.startsWith('0')?phone:'0'+phone).update({ notebook: text });
};

window.saveCustomerTrustAndBlacklist = async () => {
    const phone = document.getElementById('cm-phone').innerText;
    const sticky = document.getElementById('cm-sticky-note').value.trim();
    if(!phone) return;
    await db.collection('customers').doc(phone.startsWith('0')?phone:'0'+phone).update({ stickyNote: sticky });
};

window.addAltPhoneToCustomer = async () => {
    if(!currentViewedCustomerPhone) return;
    const input = document.getElementById('new-alt-phone');
    let phone = input.value.trim();
    if(!phone) return;
    await db.collection('customers').doc(currentViewedCustomerPhone.startsWith('0')?currentViewedCustomerPhone:'0'+currentViewedCustomerPhone).update({
        altPhones: firebase.firestore.FieldValue.arrayUnion(phone)
    });
    input.value = '';
    renderAltPhonesList(currentViewedCustomerPhone);
};

window.renderAltPhonesList = async (phone) => {
    currentViewedCustomerPhone = phone;
    const list = document.getElementById('alt-phones-list');
    let doc = await db.collection('customers').doc(phone.startsWith('0')?phone:'0'+phone).get();
    if(doc.exists) {
        let alt = doc.data().altPhones || [];
        list.innerHTML = alt.map(p => `<span class="bg-indigo-50 px-2 py-1 rounded text-xs">${p}</span>`).join('') || '<span class="text-xs text-slate-400">لا توجد أرقام إضافية</span>';
    }
};

window.renderDebtsUI = () => {
    const tbody = document.getElementById('debts-tbody'); if(!tbody) return;
    let totalDebt = 0;
    let html = '';
    customersData.forEach(c => {
        if(c.debt && c.debt > 0) {
            totalDebt += c.debt;
            html += `
            <tr class="hover:bg-slate-50 border-b">
                <td class="py-3 px-6 font-black">${c.name} <span class="text-xs text-slate-400" dir="ltr">${c.phone}</span></td>
                <td class="py-3 px-6 text-center font-bold">${c.zone || '-'}</td>
                <td class="py-3 px-6 text-center font-black text-red-600 text-base">${c.debt} ج</td>
                <td class="py-3 px-6 text-center"><button onclick="openCustomerCard('${c.phone}')" class="bg-red-50 text-red-600 px-3 py-1 rounded-xl text-xs font-bold">تسديد</button></td>
            </tr>`;
        }
    });
    tbody.innerHTML = html || '<tr><td colspan="4" class="text-center py-8 text-slate-400">لا توجد مديونيات في السوق</td></tr>';
    document.getElementById('total-market-debt').innerText = totalDebt.toLocaleString();
};

window.renderBlacklistUI = () => {};
window.openQuickBlacklistModal = () => { document.getElementById('quick-blacklist-box').classList.toggle('hidden'); };
window.submitQuickBlacklist = () => {};
window.openPointsDashboard = () => openModal('points-dashboard-modal');
window.processTickTickCSV = () => {};
window.calculateRetroactivePoints = () => {};

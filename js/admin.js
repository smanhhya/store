function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- نظام الدخول والخروج ---
window.openAdminLogin = () => { 
    const user = firebase.auth().currentUser;
    if (user && user.email) { openAdminDashboard(); } 
    else {
        const modal = document.getElementById('admin-login-modal');
        if(modal) { modal.classList.remove('hidden'); setTimeout(()=> modal.classList.remove('opacity-0'), 10); }
        if(document.getElementById('admin-password-input')) document.getElementById('admin-password-input').value = ''; 
    }
};

window.closeAdminLogin = () => { 
    const modal = document.getElementById('admin-login-modal');
    if(modal) { modal.classList.add('opacity-0'); setTimeout(()=> modal.classList.add('hidden'), 300); }
};

window.verifyAdminPin = () => { 
    const email = document.getElementById('admin-email-input')?.value.trim();
    const passInput = document.getElementById('admin-password-input');
    const pass = passInput?.value.trim();
    const btn = document.querySelector('#admin-login-modal button[onclick="verifyAdminPin()"]') || document.querySelector('#login-screen button');
    
    if(!email || !pass) { showAlert("تنبيه", "يرجى كتابة البريد الإلكتروني وكلمة المرور."); return; }
    
    let origHtml = btn ? btn.innerHTML : 'دخول';
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...'; btn.disabled = true; }
    
    firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(() => {
            closeAdminLogin(); 
            openAdminDashboard();
            if(btn) { btn.innerHTML = origHtml; btn.disabled = false; }
            const loginScreen = document.getElementById('login-screen');
            const dashScreen = document.getElementById('dashboard-screen');
            if(loginScreen && dashScreen) { loginScreen.classList.add('hidden'); dashScreen.classList.remove('hidden'); }
        })
        .catch((error) => {
            if(btn) { btn.innerHTML = origHtml; btn.disabled = false; }
            if(passInput) passInput.value = '';
            
            if(error.code === 'auth/network-request-failed') {
                showAlert("مشكلة في الاتصال", "تأكد من اتصالك بالإنترنت وحاول مرة أخرى.");
            } else {
                showAlert("خطأ", "بيانات الدخول غير صحيحة!");
            }
        });
};

window.adminLogout = () => {
    if(!confirm("هل تريد تسجيل الخروج؟")) return;
    firebase.auth().signOut().then(() => {
        closeAdminDashboard(); firebase.auth().signInAnonymously(); 
        showAlert("تم الخروج", "تم تسجيل الخروج بنجاح.");
        const loginScreen = document.getElementById('login-screen');
        const dashScreen = document.getElementById('dashboard-screen');
        if(loginScreen && dashScreen) { dashScreen.classList.add('hidden'); loginScreen.classList.remove('hidden'); }
    });
};


let currentAdminTab = 'stats'; let ordersList = []; let orderFilter = 'all'; window.dispatchOrdersList = [];
window.tempDrivers = []; // مصفوفة المناديب

window.switchAdminTab = (tab) => {
    currentAdminTab = tab;
    ['stats','store','products','orders','dispatch','delivery','marketing','advanced','texts','theme', 'gallery'].forEach(t => {
        const panel = document.getElementById('admin-panel-'+t);
        const btn = document.getElementById('admin-tab-'+t);
        if(panel) panel.classList.add('hidden');
        if(btn) {
            btn.className = btn.className.replace(/bg-brand-cyanDark text-white/g, '').replace(/text-gray-600 hover:bg-gray-100/g, '');
            if(t === tab) { btn.className += " bg-brand-cyanDark text-white"; if(panel) panel.classList.remove('hidden'); } 
            else { btn.className += " text-gray-600 hover:bg-gray-100"; }
        }
    });
    if(tab==='orders' || tab==='dispatch') loadOrders();
    if(tab==='products') renderAdminProducts();
    if(tab==='stats') renderTopProductsStats();
};

const getSafeVal = (id, def) => document.getElementById(id) ? document.getElementById(id).value.trim() : def;
const getSafeCheck = (id, def) => document.getElementById(id) ? document.getElementById(id).checked : def;
const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };

// --- محرك بناء اللوحة الشامل (الضمان لعدم اختفاء أي قسم) ---
const buildDashboardUI = () => {
    const pStats = document.getElementById('admin-panel-stats');
    if (pStats && pStats.innerHTML.trim() === '') {
        pStats.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-brand-light/50 border border-brand-cyan/30 rounded-xl p-4 flex flex-col items-center shadow-sm">
                    <i class="fa-solid fa-sack-dollar text-brand-cyanDark text-2xl mb-1"></i><span class="text-[10px] text-gray-500 font-bold">مبيعات اليوم</span><span class="font-black text-brand-navy text-xl" id="stat-sales">0</span>
                </div>
                <div class="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center shadow-sm">
                    <i class="fa-solid fa-boxes-stacked text-orange-500 text-2xl mb-1"></i><span class="text-[10px] text-gray-500 font-bold">إجمالي الطلبات</span><span class="font-black text-brand-navy text-xl" id="stat-orders">0</span>
                </div>
            </div>
            <div class="bg-white border rounded-xl p-4 shadow-sm mt-4">
                <h3 class="font-bold text-brand-navy mb-3">المنتجات الأكثر طلباً</h3>
                <div id="top-products-list" class="space-y-2 text-sm font-semibold text-gray-500">جاري الحساب...</div>
            </div>
        `;
    }

    const pStore = document.getElementById('admin-panel-store');
    if (pStore && pStore.innerHTML.trim() === '') {
        pStore.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm space-y-3 mb-4">
                <h3 class="font-black text-brand-navy"><i class="fa-solid fa-pen-to-square text-brand-cyanDark"></i> بيانات المتجر الأساسية</h3>
                <div><label class="text-xs font-bold text-gray-500">اسم المتجر</label><input type="text" id="admin-store-name" class="w-full border rounded-lg p-2 font-bold text-brand-navy"></div>
                <div><label class="text-xs font-bold text-gray-500">وصف المتجر (يظهر في الهيدر)</label><textarea id="admin-store-desc" rows="2" class="w-full border rounded-lg p-2 font-bold text-brand-navy"></textarea></div>
                <div><label class="text-xs font-bold text-gray-500">رقم الموبايل / الواتساب</label><input type="text" id="admin-store-phone" class="w-full border rounded-lg p-2 font-bold text-brand-navy text-left" dir="ltr"></div>
                <div><label class="text-xs font-bold text-gray-500">الحد الأدنى للطلب (جنيه)</label><input type="number" id="admin-min-order" class="w-full border rounded-lg p-2 font-bold text-brand-navy text-left" dir="ltr"></div>
            </div>
            <div class="bg-white border rounded-xl p-4 shadow-sm space-y-3">
                <h3 class="font-black text-brand-navy"><i class="fa-solid fa-shield-halved text-brand-cyanDark"></i> المربعات الأربعة (عناصر الثقة)</h3>
                <p class="text-[10px] text-gray-400 font-bold mb-2">تغيير العناوين والوصف والأيقونة في المربعات أسفل الهيدر.</p>
                ${[1, 2, 3, 4].map(i => `
                <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label class="text-[10px] font-black text-brand-navy block mb-2">المربع رقم ${i}</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div><label class="text-[9px] text-gray-500">أيقونة (FontAwesome)</label><input type="text" id="admin-badge-${i}-icon" class="w-full border p-1.5 rounded text-xs font-bold text-left text-gray-600" dir="ltr"></div>
                        <div><label class="text-[9px] text-gray-500">العنوان</label><input type="text" id="admin-badge-${i}-title" class="w-full border p-1.5 rounded text-xs font-bold text-brand-navy"></div>
                        <div><label class="text-[9px] text-gray-500">الوصف</label><input type="text" id="admin-badge-${i}-desc" class="w-full border p-1.5 rounded text-xs font-bold text-brand-navy"></div>
                    </div>
                </div>`).join('')}
            </div>
        `;
    }

    const pProducts = document.getElementById('admin-panel-products');
    if (pProducts && pProducts.innerHTML.trim() === '') {
        pProducts.innerHTML = `
            <div class="flex justify-between items-center bg-brand-light/30 p-3 rounded-lg border border-brand-cyan/20">
                <p class="text-xs text-gray-600 font-bold"><i class="fa-solid fa-circle-info text-brand-cyanDark"></i> إدارة المنتجات بالكامل</p>
                <button onclick="addNewAdminProduct()" class="bg-brand-cyanDark hover:opacity-90 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm"><i class="fa-solid fa-plus"></i> منتج جديد</button>
            </div>
            <div id="admin-inputs-container" class="space-y-4 mt-4"></div>
        `;
    }

    const pOrders = document.getElementById('admin-panel-orders');
    if (pOrders && pOrders.innerHTML.trim() === '') {
        pOrders.innerHTML = `
            <input type="text" id="order-search" placeholder="ابحث باسم العميل أو رقم الموبايل..." class="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 font-bold text-brand-navy outline-none focus:border-brand-cyan" onkeyup="renderOrdersList()">
            <div class="flex gap-2 mb-3">
                <button onclick="filterOrders('all')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200">الكل</button>
                <button onclick="filterOrders('new')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">جديد</button>
                <button onclick="filterOrders('processing')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-yellow-100 text-yellow-700">قيد التجهيز</button>
                <button onclick="filterOrders('completed')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 text-green-700">مكتمل</button>
                <button onclick="filterOrders('canceled')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 border border-gray-300">ملغي</button>
            </div>
            <div id="orders-list-container" class="space-y-3"></div>
        `;
        const sInput = document.getElementById('order-search');
        if (sInput) sInput.addEventListener('input', debounce(() => renderOrdersList(), 300));
    }

    const pDispatch = document.getElementById('admin-panel-dispatch');
    if (pDispatch && pDispatch.innerHTML.trim() === '') {
        pDispatch.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-truck-fast text-brand-cyanDark"></i> إرسال الطلبات</h3>
                <div class="mb-3">
                    <label class="text-[10px] font-bold text-gray-500 block mb-1">تصفية حسب المنطقة</label>
                    <select id="dispatch-zone-filter" class="w-full border rounded-lg p-2 font-bold text-brand-navy bg-white" onchange="renderDispatchOrders()"><option value="all">كل المناطق</option></select>
                </div>
                <div id="dispatch-orders-container" class="space-y-2 mb-4 max-h-96 overflow-y-auto cart-scroll border rounded-lg p-2 bg-gray-50"></div>
                <div class="flex items-center gap-2 mb-3">
                    <button onclick="toggleSelectAllDispatch()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs py-2 px-4 rounded-lg">تحديد الكل / إلغاء</button>
                    <span class="text-[10px] text-gray-500">المحدد: <span id="dispatch-selected-count" class="font-black text-brand-cyanDark">0</span></span>
                </div>
                <div class="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <label class="text-[10px] font-black text-brand-navy block mb-2">اختيار المندوب (من القائمة المحفوظة)</label>
                    <select id="dispatch-driver-select" class="w-full border rounded-lg p-2 font-bold text-gray-700 bg-white mb-2" onchange="if(this.value) document.getElementById('dispatch-driver-phone').value = this.value"></select>
                    <input type="text" id="dispatch-driver-phone" class="w-full border rounded-lg p-2 font-bold text-brand-navy text-left" dir="ltr" placeholder="رقم واتساب المندوب">
                </div>
                <button onclick="sendDispatchToDriver()" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 shadow-md">
                    <i class="fa-brands fa-whatsapp text-xl"></i> إرسال للمندوب
                </button>
            </div>
            <div class="bg-white border rounded-xl p-4 shadow-sm border-l-4 border-l-blue-500">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-users text-blue-500"></i> قائمة المناديب (للحفظ)</h3>
                <div id="admin-drivers-container" class="space-y-2 mb-3"></div>
                <button onclick="addNewAdminDriver()" class="w-full bg-gray-50 text-brand-navy text-sm font-bold py-2 rounded-lg border border-gray-200 hover:bg-gray-100"><i class="fa-solid fa-plus"></i> إضافة مندوب جديد للقائمة</button>
            </div>
        `;
    }

    const pDelivery = document.getElementById('admin-panel-delivery');
    if (pDelivery && pDelivery.innerHTML.trim() === '') {
        pDelivery.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-gift text-green-500"></i> التوصيل المجاني</h3>
                <label class="flex items-center gap-2 mb-2"><input type="checkbox" id="admin-free-delivery-active" class="accent-brand-cyanDark"> <span class="text-sm font-bold">تفعيل التوصيل المجاني</span></label>
                <input type="number" id="admin-free-delivery-threshold" placeholder="الحد الأدنى" class="w-full border rounded-lg p-2 font-bold text-brand-navy">
            </div>
            <div class="bg-white border rounded-xl p-4 shadow-sm">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-map-location-dot text-brand-cyanDark"></i> مناطق التوصيل</h3>
                <div id="admin-zones-container" class="space-y-2 mb-3"></div>
                <button onclick="addNewAdminZone()" class="w-full bg-gray-50 text-brand-navy text-sm font-bold py-2 rounded-lg border border-gray-200"><i class="fa-solid fa-plus"></i> إضافة منطقة</button>
            </div>
        `;
    }

    const pMarketing = document.getElementById('admin-panel-marketing');
    if (pMarketing && pMarketing.innerHTML.trim() === '') {
        pMarketing.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm border-l-4 border-l-green-500 mb-4">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-gift text-green-500"></i> نظام الولاء الذكي (كود تلقائي)</h3>
                <label class="flex items-center gap-2 mb-3"><input type="checkbox" id="admin-reward-active" class="accent-green-500 w-4 h-4"> <span class="text-sm font-bold text-green-700">تفعيل إنشاء كود الخصم التلقائي</span></label>
                <div class="grid grid-cols-2 gap-2 bg-green-50 p-3 rounded-lg border border-green-100 mb-3">
                    <div>
                        <label class="text-[10px] font-bold text-gray-500 block mb-1">نوع الخصم</label>
                        <select id="admin-reward-type" class="w-full border rounded p-2 font-bold text-brand-navy" onchange="document.getElementById('reward-max-disc-container').classList.toggle('hidden', this.value !== 'percent')">
                            <option value="fixed">مبلغ ثابت</option><option value="percent">نسبة مئوية</option><option value="free_delivery">توصيل مجاني</option>
                        </select>
                    </div>
                    <div><label class="text-[10px] font-bold text-gray-500 block mb-1">القيمة</label><input type="number" id="admin-reward-value" class="w-full border rounded p-2 font-bold text-brand-navy text-center"></div>
                    <div id="reward-max-disc-container" class="col-span-2 hidden">
                        <label class="text-[10px] font-bold text-gray-500 block mb-1">الحد الأقصى للخصم (لـ النسب المئوية)</label>
                        <input type="number" id="admin-reward-max-discount" class="w-full border rounded p-2 font-bold text-brand-navy text-center" placeholder="سيبه 0 لو مفيش حد">
                    </div>
                    <div class="col-span-2"><label class="text-[10px] font-bold text-gray-500 block mb-1">عدد الأكواد المسموح بتوليدها</label><input type="number" id="admin-reward-max-generations" class="w-full border rounded p-2 font-bold text-brand-navy text-center" placeholder="سيبه 0 لـ ∞"></div>
                </div>
                <div><label class="text-[10px] font-bold text-gray-500 block mb-1">رسالة العميل (التي تظهر مع الكود)</label><textarea id="admin-loyalty-msg" rows="2" class="w-full border rounded-lg p-2 text-xs font-bold text-brand-navy"></textarea></div>
            </div>

            <div class="bg-white border rounded-xl p-4 shadow-sm border-l-4 border-l-purple-500 mb-4">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-users text-purple-500"></i> إرسال أكواد لعملاء سابقين</h3>
                <textarea id="admin-bulk-numbers" rows="2" class="w-full border rounded-lg p-2 font-bold text-brand-navy bg-gray-50" dir="ltr" placeholder="الأرقام هنا..."></textarea>
                <textarea id="admin-bulk-message" rows="2" class="w-full border rounded-lg p-2 font-bold text-brand-navy mt-2">شكراً لثقتك! كود الخصم للأوردر الجاي: {الكود}</textarea>
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <select id="admin-bulk-reward-type" class="w-full border rounded p-2 font-bold text-brand-navy"><option value="fixed">مبلغ</option><option value="percent">نسبة</option><option value="free_delivery">توصيل مجاني</option></select>
                    <input type="number" id="admin-bulk-reward-value" placeholder="القيمة" class="w-full border rounded p-2 font-bold text-brand-navy text-center">
                </div>
                <button type="button" onclick="generateBulkWhatsAppLinks()" class="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl text-sm shadow-md">توليد وتجهيز الواتساب</button>
                <div id="bulk-whatsapp-links" class="mt-3 space-y-2 hidden max-h-40 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-200 cart-scroll"></div>
            </div>

            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4 border-l-4 border-l-blue-500">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-bell text-blue-500"></i> الإشعارات الحية الوهمية</h3>
                <label class="flex items-center gap-2 mb-3"><input type="checkbox" id="admin-live-noti-active" class="accent-blue-500 w-4 h-4"> <span class="text-sm font-bold text-blue-700">تفعيل الإشعارات</span></label>
                <div><label class="text-[10px] font-bold text-gray-500 block mb-1">الأسماء</label><textarea id="admin-noti-names" rows="2" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
                <div class="mt-2"><label class="text-[10px] font-bold text-gray-500 block mb-1">المناطق</label><textarea id="admin-noti-places" rows="2" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
            </div>

            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4 border-l-4 border-l-yellow-500">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-bullhorn text-yellow-500"></i> شريط الأخبار المتحرك</h3>
                <label class="flex items-center gap-2 mb-2"><input type="checkbox" id="admin-banner-active" class="accent-yellow-500 w-4 h-4"> <span class="text-sm font-bold text-yellow-700">تفعيل الشريط</span></label>
                <textarea id="admin-marquee-messages" rows="3" class="w-full border rounded-lg p-2 text-xs font-bold" placeholder="كل رسالة في سطر"></textarea>
            </div>

            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-lightbulb text-brand-yellow"></i> الاقتراح الذكي (Cross-sell)</h3>
                <label class="flex items-center gap-2 mb-2"><input type="checkbox" id="admin-crosssell-active" class="accent-brand-cyanDark"> <span class="text-sm font-bold">تفعيل نافذة الاقتراح</span></label>
                <select id="admin-crosssell-product" class="w-full border rounded-lg p-2 font-bold text-brand-navy"></select>
            </div>

            <div class="bg-white border rounded-xl p-4 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-black text-brand-navy"><i class="fa-solid fa-ticket text-brand-cyanDark"></i> رادار الأكواد</h3>
                    <button onclick="addNewPromoCode()" class="bg-gray-800 hover:bg-black text-white text-xs px-3 py-1.5 rounded shadow-sm">+ كود ثابت</button>
                </div>
                <label class="flex items-center gap-2 mb-4 bg-gray-50 p-2 rounded border"><input type="checkbox" id="admin-show-promo-field" class="accent-brand-cyanDark w-4 h-4"> <span class="text-xs font-bold">إظهار خانة الكوبون</span></label>
                <div id="admin-promos-container" class="space-y-3"></div>
            </div>
        `;
    }

    const pAdvanced = document.getElementById('admin-panel-advanced');
    if (pAdvanced && pAdvanced.innerHTML.trim() === '') {
        pAdvanced.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm mb-4 border-l-4 border-l-brand-cyanDark">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-language text-brand-cyanDark"></i> قوالب رسائل النظام</h3>
                <div class="space-y-4">
                    <div><label class="text-xs font-bold text-gray-500 block mb-1">رسالة الواتساب للعميل</label><textarea id="admin-whatsapp-template" rows="4" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
                    <div><label class="text-xs font-bold text-gray-500 block mb-1">رسالة الإرسال للمندوب</label><textarea id="admin-dispatch-template" rows="4" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
                    <div><label class="text-xs font-bold text-gray-500 block mb-1">رسالة مهام TickTick</label><textarea id="admin-ticktick-template" rows="4" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
                    <div><label class="text-xs font-bold text-gray-500 block mb-1">رسالة حجز الـ VIP</label><textarea id="admin-vip-whatsapp-template" rows="2" class="w-full border rounded-lg p-2 text-xs font-bold"></textarea></div>
                    <div><label class="text-xs font-bold text-gray-500 block mb-1">هاشتاج الدفعة</label><input type="text" id="admin-batch-hashtag" class="w-full border rounded-lg p-2 text-xs font-bold"></div>
                </div>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm mt-4">
                <h3 class="font-black text-red-600 mb-3"><i class="fa-solid fa-trash-can"></i> منطقة الخطر</h3>
                <div class="space-y-3">
                    <button onclick="resetStatsOnly()" class="w-full bg-orange-500 text-white font-bold py-3 rounded-lg hover:bg-orange-600 shadow-md">تصفير الإحصائيات</button>
                    <button onclick="deleteAllOrders()" class="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 shadow-md">مسح جميع سجلات الطلبات</button>
                </div>
            </div>
        `;
    }

    const pTexts = document.getElementById('admin-panel-texts');
    if (pTexts && pTexts.innerHTML.trim() === '') {
        pTexts.innerHTML = `<div class="bg-white border rounded-xl p-4 shadow-sm"><h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-book-open text-brand-cyanDark"></i> قاموس نصوص الواجهة</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="admin-texts-container"></div></div>`;
    }

    const pGallery = document.getElementById('admin-panel-gallery');
    if (pGallery && pGallery.innerHTML.trim() === '') {
        pGallery.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm border-l-4 border-l-brand-yellow">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-images text-brand-yellow"></i> معرض الكتالوج (السلايدر)</h3>
                <div id="admin-gallery-list"></div>
                <button onclick="globalSettings.galleryImages.push(''); renderGalleryTabUI()" class="w-full mt-3 bg-brand-navy text-white hover:bg-gray-800 py-3 rounded-xl font-black text-xs transition-colors shadow-md"><i class="fa-solid fa-plus"></i> إضافة صورة جديدة</button>
            </div>
        `;
    }

    const pTheme = document.getElementById('admin-panel-theme');
    if (pTheme && pTheme.innerHTML.trim() === '') {
        pTheme.innerHTML = `
            <div class="bg-white border rounded-xl p-4 shadow-sm border-l-4 border-l-brand-cyanDark">
                <h3 class="font-black text-brand-navy mb-3"><i class="fa-solid fa-palette text-brand-cyanDark"></i> ألوان الموقع</h3>
                <div class="grid grid-cols-1 gap-4 mb-4">
                    <div class="flex items-center justify-between bg-gray-50 p-2 rounded-lg border">
                        <label class="text-xs text-gray-700 font-bold">اللون الأساسي (أخضر)</label>
                        <input type="color" id="color-navy" class="w-12 h-10 border-0 rounded cursor-pointer bg-transparent" onchange="updateThemeColor('--brand-navy', this.value, 'theme_navy')">
                    </div>
                    <div class="flex items-center justify-between bg-gray-50 p-2 rounded-lg border">
                        <label class="text-xs text-gray-700 font-bold">لون التميز (الأحمر)</label>
                        <input type="color" id="color-cyanDark" class="w-12 h-10 border-0 rounded cursor-pointer bg-transparent" onchange="updateThemeColor('--brand-cyanDark', this.value, 'theme_cyanDark')">
                    </div>
                    <div class="flex items-center justify-between bg-gray-50 p-2 rounded-lg border">
                        <label class="text-xs text-gray-700 font-bold">لون الأيقونات (الأصفر)</label>
                        <input type="color" id="color-yellow" class="w-12 h-10 border-0 rounded cursor-pointer bg-transparent" onchange="updateThemeColor('--brand-yellow', this.value, 'theme_yellow')">
                    </div>
                </div>
                <button onclick="resetThemeColors()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-lg">استعادة ألوان ههيا الأصلية</button>
            </div>
        `;
    }
};

window.openAdminDashboard = () => {
    buildDashboardUI(); 

    // زر الخروج
    const headerDiv = document.querySelector('#admin-dashboard-modal .flex.items-center.gap-3');
    if(headerDiv && !document.getElementById('admin-logout-btn')) {
        headerDiv.innerHTML += `<button id="admin-logout-btn" onclick="adminLogout()" class="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded font-bold border border-red-200 hover:bg-red-200 transition-colors mr-3 shadow-sm"><i class="fa-solid fa-arrow-right-from-bracket"></i> خروج</button>`;
    }

    // تجهيز البيانات
    window.tempDrivers = JSON.parse(JSON.stringify(globalSettings.drivers || []));
    tempAdminZones = JSON.parse(JSON.stringify(globalDeliveryZones || []));
    tempPromoCodes = JSON.parse(JSON.stringify(globalSettings.promoCodes || []));
    tempProducts = JSON.parse(JSON.stringify(productsInfo || {}));
    if(!globalSettings.galleryImages) globalSettings.galleryImages = ["all-sizes.jpg"];

    setCheck('admin-store-open', globalSettings.storeOpen !== false);
    const storeOpenLabel = document.getElementById('store-open-label');
    if(storeOpenLabel) {
        storeOpenLabel.innerText = (globalSettings.storeOpen !== false) ? 'مفتوح' : 'مغلق';
        storeOpenLabel.className = (globalSettings.storeOpen !== false) ? 'mr-3 text-sm font-black text-green-600 w-12' : 'mr-3 text-sm font-black text-red-600 w-12';
    }

    setVal('admin-store-name', globalSettings.storeName || ''); 
    setVal('admin-store-desc', globalSettings.storeDesc || ''); 
    setVal('admin-store-phone', globalSettings.storePhone || ''); 
    setVal('admin-min-order', globalSettings.minOrder || 0);
    setVal('admin-free-delivery-threshold', globalSettings.freeDeliveryThreshold || 0); 
    setCheck('admin-free-delivery-active', globalSettings.freeDeliveryActive);

    const defaultBadges = [
        { icon: 'fa-regular fa-circle-check', title: 'أوزان دقيقة', desc: 'زي ما طلبت بالظبط' },
        { icon: 'fa-regular fa-star', title: 'طلبك باسمك', desc: 'استيكر مخصص ليك' },
        { icon: 'fa-regular fa-clock', title: 'تجهيز يومي', desc: 'طازج مية بالمية' },
        { icon: 'fa-solid fa-shield-halved', title: 'تغليف آمن', desc: 'أطباق صحية' }
    ];
    const badges = (globalSettings.trustBadges && globalSettings.trustBadges.length === 4) ? globalSettings.trustBadges : defaultBadges;
    for(let i=1; i<=4; i++) {
        setVal(`admin-badge-${i}-icon`, badges[i-1].icon);
        setVal(`admin-badge-${i}-title`, badges[i-1].title);
        setVal(`admin-badge-${i}-desc`, badges[i-1].desc);
    }
    
    setCheck('admin-reward-active', globalSettings.rewardActive);
    setVal('admin-reward-type', globalSettings.rewardType || 'fixed');
    setVal('admin-reward-value', globalSettings.rewardValue || 0);
    setVal('admin-reward-max-discount', globalSettings.rewardMaxDiscount || 0);
    setVal('admin-reward-max-generations', globalSettings.rewardMaxGenerations || 0);
    setVal('admin-loyalty-msg', globalSettings.autoPromoModalMsg || 'تم إصدار كود خصم خاص بك لطلبك القادم 🎁');
    
    const rewardTypeEl = document.getElementById('admin-reward-type');
    const maxDiscCont = document.getElementById('reward-max-disc-container');
    if(rewardTypeEl && maxDiscCont) maxDiscCont.classList.toggle('hidden', rewardTypeEl.value !== 'percent');
    
    setCheck('admin-live-noti-active', globalSettings.liveNotiActive !== false);
    setVal('admin-noti-names', (globalSettings.liveNotiNames || []).join('، '));
    setVal('admin-noti-places', (globalSettings.liveNotiPlaces || []).join('، '));
    
    setCheck('admin-banner-active', globalSettings.bannerActive);
    setVal('admin-marquee-messages', (globalSettings.marqueeMessages || []).join('\n'));
    setCheck('admin-crosssell-active', globalSettings.crossSellActive);
    setCheck('admin-show-promo-field', globalSettings.showPromoField !== false);

    setVal('admin-whatsapp-template', globalSettings.whatsappTemplate || '');
    setVal('admin-dispatch-template', globalSettings.dispatchTemplate || '');
    setVal('admin-ticktick-template', globalSettings.ticktickTemplate || '');
    setVal('admin-vip-whatsapp-template', globalSettings.vipWhatsappTemplate || '');
    setVal('admin-batch-hashtag', globalSettings.batchHashtag || '');

    const csSelect = document.getElementById('admin-crosssell-product');
    if(csSelect) {
        csSelect.innerHTML='';
        Object.keys(productsInfo).forEach(id => csSelect.innerHTML += `<option value="${id}" ${globalSettings.crossSellProductId===id?'selected':''}>${productsInfo[id].name}</option>`);
    }

    const textsCont = document.getElementById('admin-texts-container');
    if(textsCont && typeof textsConfig !== 'undefined') {
        textsCont.innerHTML = '';
        textsConfig.forEach(t => {
            const val = (globalSettings.uiTexts && globalSettings.uiTexts[t.id]) ? globalSettings.uiTexts[t.id] : t.default;
            textsCont.innerHTML += `<div><label class="text-[10px] font-bold text-gray-500 block mb-1">${t.label}</label><input type="text" id="ui-txt-${t.id}" value="${val}" class="w-full border rounded p-2 text-xs font-bold text-brand-navy outline-none"></div>`;
        });
    }

    renderAdminDrivers();
    renderAdminZones();
    renderAdminPromos();
    renderGalleryTabUI();
    renderAdminProducts(); 
    
    const modal = document.getElementById('admin-dashboard-modal');
    if(modal) { modal.classList.remove('hidden'); setTimeout(()=> modal.classList.remove('opacity-0'),10); }
    switchAdminTab('stats');
};

window.closeAdminDashboard = () => { 
    const modal = document.getElementById('admin-dashboard-modal');
    if(modal) { modal.classList.add('opacity-0'); setTimeout(()=> modal.classList.add('hidden'),300); }
};

window.renderTopProductsStats = () => {
    const c = document.getElementById('top-products-list'); if(!c) return;
    if(globalSettings.bestSellers && globalSettings.bestSellers.length > 0) { 
        c.innerHTML = globalSettings.bestSellers.map(id => { 
            const p = productsInfo[id]; 
            return p ? `<div class="flex justify-between items-center bg-gray-50 p-2 rounded border"><span class="font-bold text-brand-navy">${p.name}</span><span class="text-[10px] bg-brand-yellow text-brand-navy px-2 py-0.5 rounded-full font-black">🔥 الأكثر مبيعاً</span></div>` : ''; 
        }).join(''); 
    } else { c.innerHTML = '<div class="text-xs text-gray-400">لم تقم بتحديد منتجات كأكثر مبيعاً.</div>'; }
}

window.moveProduct = (id, direction) => {
    syncAdminProductsFromDOM();
    const keys = Object.keys(tempProducts);
    const idx = keys.indexOf(id);
    if (direction === 'up' && idx > 0) { [keys[idx], keys[idx - 1]] = [keys[idx - 1], keys[idx]]; } 
    else if (direction === 'down' && idx < keys.length - 1) { [keys[idx], keys[idx + 1]] = [keys[idx + 1], keys[idx]]; } 
    else { return; }
    const newObj = {}; keys.forEach(k => newObj[k] = tempProducts[k]); tempProducts = newObj; renderAdminProducts();
};

window.renderAdminProducts = () => {
    const container = document.getElementById('admin-inputs-container'); 
    if(!container) return; container.innerHTML = '';
    Object.keys(tempProducts).forEach(id => {
        const p = tempProducts[id]; const stock = globalStock[id] || 0; const price = globalPrices[id] || p.basePrice; const oldPrice = globalOldPrices[id] || price; const isDisc = globalDiscounts[id] || false; const isBest = globalSettings.bestSellers?.includes(id) || false;
        const imgSrc = (p.images && p.images.length > 0) ? p.images[0] : '';
        container.innerHTML += `
        <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm mb-3">
            <div class="flex justify-between items-center cursor-pointer" onclick="document.getElementById('edit-p-${id}').classList.toggle('hidden')">
                <div class="font-black text-brand-navy flex items-center gap-2">
                    <div class="flex flex-col gap-1 ml-1 mr-[-5px]">
                        <button onclick="event.stopPropagation(); moveProduct('${id}', 'up')" class="text-gray-400 hover:text-brand-cyanDark text-[12px] bg-gray-100 rounded w-5 h-5 flex justify-center items-center"><i class="fa-solid fa-chevron-up"></i></button>
                        <button onclick="event.stopPropagation(); moveProduct('${id}', 'down')" class="text-gray-400 hover:text-brand-cyanDark text-[12px] bg-gray-100 rounded w-5 h-5 flex justify-center items-center"><i class="fa-solid fa-chevron-down"></i></button>
                    </div>
                    <img src="${imgSrc}" class="w-8 h-8 rounded object-cover" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23f1f5f9\\'/></svg>'"> ${p.name}
                </div>
                <div class="text-xs bg-gray-50 border px-2 py-1 rounded font-bold text-gray-600">تعديل <i class="fa-solid fa-chevron-down"></i></div>
            </div>
            <div id="edit-p-${id}" class="hidden mt-4 space-y-3 border-t pt-3">
                <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-[10px] font-bold text-gray-500">الاسم</label><input type="text" id="p-name-${id}" value="${p.name}" class="w-full border p-2 rounded text-xs font-bold text-brand-navy outline-none"></div>
                    <div><label class="text-[10px] font-bold text-gray-500">الوزن / الوصف</label><input type="text" id="p-weight-${id}" value="${p.weight}" class="w-full border p-2 rounded text-xs font-bold text-brand-navy outline-none"></div>
                    <div><label class="text-[10px] font-bold text-gray-500">السعر (ج)</label><input type="number" id="p-price-${id}" value="${price}" class="w-full border p-2 rounded text-xs font-bold text-brand-cyanDark outline-none"></div>
                    <div><label class="text-[10px] font-bold text-gray-500">المخزون المتوفر</label><input type="number" id="p-stock-${id}" value="${stock}" class="w-full border p-2 rounded text-xs font-black outline-none ${stock<5?'border-red-500 bg-red-50 text-red-600':'text-brand-navy'}"></div>
                    <div class="col-span-2"><label class="text-[10px] font-bold text-gray-500">رابط الصورة</label><input type="text" id="p-img-${id}" value="${imgSrc}" class="w-full border p-2 rounded text-[10px] font-bold text-gray-500 outline-none" dir="ltr"></div>
                </div>
                <div class="flex flex-wrap gap-3 bg-gray-50 p-2 rounded border mb-2">
                    <label class="flex items-center gap-1 text-[10px] font-bold cursor-pointer"><input type="checkbox" id="p-extra-${id}" ${p.isExtra?'checked':''} class="accent-brand-cyanDark"> إضافي (بالأسفل)</label>
                    <label class="flex items-center gap-1 text-[10px] font-bold cursor-pointer"><input type="checkbox" id="p-best-${id}" ${isBest?'checked':''} class="accent-brand-yellow"> الأكثر طلباً 🔥</label>
                    <label class="flex items-center gap-1 text-[10px] font-bold text-red-600 cursor-pointer"><input type="checkbox" id="p-disc-${id}" ${isDisc?'checked':''} class="accent-red-500" onchange="document.getElementById('p-old-${id}').classList.toggle('hidden', !this.checked)"> خصم لسعر قديم:</label>
                    <input type="number" id="p-old-${id}" value="${oldPrice}" class="w-12 border rounded p-1 text-[10px] text-center bg-white text-red-500 font-bold line-through outline-none ${isDisc?'':'hidden'}">
                </div>
                <button onclick="deleteAdminProduct('${id}')" class="w-full mt-2 bg-red-50 border border-red-200 text-red-600 font-bold text-xs py-2 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash"></i> حذف المنتج</button>
            </div>
        </div>`;
    });
};

window.addNewAdminProduct = () => { 
    const newId = 'p_' + Date.now(); 
    tempProducts[newId] = { name: "منتج جديد", basePrice: 0, weight: "1 طبق", images: [""], isExtra: false }; 
    globalStock[newId] = 0; globalPrices[newId] = 0; globalOldPrices[newId] = 0; globalDiscounts[newId] = false; 
    renderAdminProducts(); 
    setTimeout(()=> { const el = document.getElementById(`edit-p-${newId}`); if(el) el.classList.remove('hidden'); }, 100); 
};

window.deleteAdminProduct = (id) => { 
    if(!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return; 
    delete tempProducts[id]; delete globalStock[id]; delete globalPrices[id]; delete globalOldPrices[id]; delete globalDiscounts[id]; 
    renderAdminProducts(); 
};

window.syncAdminProductsFromDOM = () => {
    if(!document.getElementById('admin-inputs-container') || document.getElementById('admin-inputs-container').innerHTML === '') return;
    let newBest = [];
    Object.keys(tempProducts).forEach(id => {
        if(!document.getElementById(`p-name-${id}`)) return; 
        tempProducts[id].name = document.getElementById(`p-name-${id}`).value; 
        tempProducts[id].weight = document.getElementById(`p-weight-${id}`).value; 
        tempProducts[id].images = [document.getElementById(`p-img-${id}`).value]; 
        tempProducts[id].isExtra = document.getElementById(`p-extra-${id}`).checked;
        globalPrices[id] = parseInt(document.getElementById(`p-price-${id}`).value) || 0; 
        globalStock[id] = parseInt(document.getElementById(`p-stock-${id}`).value) || 0; 
        globalOldPrices[id] = parseInt(document.getElementById(`p-old-${id}`).value) || 0; 
        globalDiscounts[id] = document.getElementById(`p-disc-${id}`).checked;
        if(document.getElementById(`p-best-${id}`).checked) newBest.push(id);
    });
    globalSettings.bestSellers = newBest;
};

window.renderGalleryTabUI = () => {
    const c = document.getElementById('admin-gallery-list'); if(!c) return;
    if(!globalSettings.galleryImages) globalSettings.galleryImages = ["all-sizes.jpg"];
    c.innerHTML = globalSettings.galleryImages.map((img, idx) => `
        <div class="flex gap-2 mb-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
            <span class="font-black text-gray-400 text-xs">${idx+1}</span>
            <input type="text" value="${img}" class="flex-1 border rounded p-2 text-xs font-bold text-brand-navy outline-none" onchange="globalSettings.galleryImages[${idx}]=this.value" placeholder="رابط الصورة أو مسارها" dir="ltr">
            <button onclick="globalSettings.galleryImages.splice(${idx},1); renderGalleryTabUI()" class="text-red-500 hover:bg-red-100 p-2 rounded transition-colors shadow-sm"><i class="fa-solid fa-trash text-sm"></i></button>
        </div>
    `).join('');
};

window.renderAdminZones = () => { 
    const c = document.getElementById('admin-zones-container'); if(!c) return; c.innerHTML=''; 
    tempAdminZones.forEach((z,i) => c.innerHTML += `<div class="flex gap-2 items-center"><input type="text" value="${z.name}" class="flex-1 border rounded p-2 text-sm font-bold text-brand-navy outline-none" onchange="tempAdminZones[${i}].name=this.value"><input type="number" value="${z.price}" class="w-16 border rounded p-2 text-sm text-center font-bold text-brand-cyanDark outline-none" onchange="tempAdminZones[${i}].price=parseInt(this.value)"><button onclick="tempAdminZones.splice(${i},1);renderAdminZones()" class="text-red-500 hover:bg-red-50 rounded w-8 h-8 transition-colors"><i class="fa-solid fa-trash"></i></button></div>`); 
};
window.addNewAdminZone = () => { tempAdminZones.push({id:'z_'+Date.now(), name:'', price:0}); renderAdminZones(); };

window.renderAdminDrivers = () => {
    const c = document.getElementById('admin-drivers-container'); 
    const sel = document.getElementById('dispatch-driver-select');
    if(!c) return; c.innerHTML=''; 
    let optionsHtml = '<option value="">-- اختار المندوب --</option>';
    
    (window.tempDrivers || []).forEach((d, i) => {
        c.innerHTML += `
            <div class="flex gap-2 items-center mb-2">
                <input type="text" value="${d.name}" placeholder="اسم المندوب أو خطه" class="flex-1 border rounded p-2 text-xs font-bold text-brand-navy outline-none" onchange="window.tempDrivers[${i}].name=this.value">
                <input type="text" value="${d.phone}" placeholder="رقم الواتساب" class="w-32 border rounded p-2 text-xs text-left font-bold text-brand-cyanDark outline-none" dir="ltr" onchange="window.tempDrivers[${i}].phone=this.value">
                <button onclick="window.tempDrivers.splice(${i},1); renderAdminDrivers()" class="text-red-500 hover:bg-red-50 rounded w-8 h-8 transition-colors shadow-sm"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        if(d.phone && d.name) { optionsHtml += `<option value="${d.phone}">${d.name} (${d.phone})</option>`; }
    });
    if(sel) sel.innerHTML = optionsHtml;
};
window.addNewAdminDriver = () => { 
    if(!window.tempDrivers) window.tempDrivers = [];
    window.tempDrivers.push({ name: '', phone: '' }); renderAdminDrivers(); 
};

// --- الأكواد ---
window.renderAdminPromos = () => { 
    const c = document.getElementById('admin-promos-container'); 
    if(!c) return; c.innerHTML=''; 
    tempPromoCodes.sort((a, b) => (b.isAuto ? 1 : 0) - (a.isAuto ? 1 : 0));
    
    tempPromoCodes.forEach((p,i) => {
        if(p.usesLeft === undefined) p.usesLeft = p.isAuto ? 1 : null;
        p.minOrder = p.minOrder || 0;
        p.maxDiscount = p.maxDiscount || 0;
        const isUsed = p.usesLeft !== null && p.usesLeft !== undefined && Number(p.usesLeft) <= 0;
        
        let badgeHtml = '';
        if (isUsed) { 
            badgeHtml = `<span class="bg-red-100 text-red-700 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">🔴 تم استهلاك الكود (مغلق)</span>`; 
        } else if (p.isAuto) { 
            badgeHtml = `<span class="bg-green-100 text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">🟢 صالح لم يُستخدم</span>`; 
        } else { 
            badgeHtml = `<span class="bg-gray-200 text-gray-700 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">⚙️ كود ثابت (متاح)</span>`; 
        }

        c.innerHTML += `
        <div class="flex flex-col gap-2 ${p.isAuto ? 'bg-blue-50/50' : 'bg-gray-50'} p-3 border border-gray-200 rounded-xl mb-3 relative overflow-hidden shadow-sm">
            ${p.customerPhone ? `<div class="absolute top-0 right-0 w-1 h-full ${isUsed ? 'bg-red-500' : 'bg-green-500'}"></div>` : ''}
            <div class="flex gap-2 items-center flex-wrap pr-2 mb-1">
                <input type="text" value="${p.code}" placeholder="الكود" class="w-24 border rounded p-1.5 text-xs text-center uppercase font-black text-brand-navy outline-none" onchange="tempPromoCodes[${i}].code=this.value.toUpperCase()">
                ${badgeHtml}
            </div>
            <div class="flex gap-2 items-center">
                <input type="number" value="${p.discount}" placeholder="الخصم" class="w-16 border rounded p-1.5 text-xs text-center font-bold text-brand-cyanDark outline-none" onchange="tempPromoCodes[${i}].discount=parseInt(this.value)">
                <select class="flex-1 border rounded p-1.5 text-xs bg-white font-bold text-gray-600 outline-none" onchange="tempPromoCodes[${i}].type=this.value; renderAdminPromos();">
                    <option value="fixed" ${p.type==='fixed'?'selected':''}>خصم مبلغ (ج.م)</option>
                    <option value="percent" ${p.type==='percent'?'selected':''}>خصم نسبة (%)</option>
                    <option value="free_delivery" ${p.type==='free_delivery'?'selected':''}>توصيل مجاني</option>
                </select>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-1">
                <div><label class="text-[10px] font-bold text-gray-500 block mb-0.5">الحد الأدنى للطلب</label><input type="number" value="${p.minOrder}" placeholder="بدون" class="w-full border rounded p-1.5 text-xs text-center font-bold text-brand-navy outline-none" onchange="tempPromoCodes[${i}].minOrder=parseInt(this.value) || 0"></div>
                <div><label class="text-[10px] font-bold text-gray-500 block mb-0.5">أقصى خصم (ج)</label><input type="number" value="${p.maxDiscount}" placeholder="بدون" class="w-full border rounded p-1.5 text-xs text-center font-bold text-brand-navy outline-none ${p.type !== 'percent' ? 'bg-gray-100 opacity-50' : ''}" ${p.type !== 'percent' ? 'disabled' : ''} onchange="tempPromoCodes[${i}].maxDiscount=parseInt(this.value) || 0"></div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-1">
                <div><label class="text-[10px] font-bold text-gray-500 block mb-0.5">مخصص لموبايل</label><input type="text" value="${p.customerPhone || ''}" placeholder="أي شخص" class="w-full border rounded p-1.5 text-xs text-center font-bold text-brand-navy outline-none" onchange="tempPromoCodes[${i}].customerPhone=this.value" dir="ltr"></div>
                <div><label class="text-[10px] font-bold text-gray-500 block mb-0.5">عدد مرات الاستخدام</label><input type="number" value="${p.usesLeft !== null ? p.usesLeft : ''}" placeholder="سيبه فاضي لـ ∞" class="w-full border rounded p-1.5 text-xs text-center font-bold text-brand-navy outline-none placeholder-gray-400" onchange="tempPromoCodes[${i}].usesLeft=this.value === '' ? null : parseInt(this.value)"></div>
            </div>
            <button onclick="tempPromoCodes.splice(${i},1);renderAdminPromos()" class="absolute top-2 left-2 text-red-500 hover:bg-red-100 rounded w-7 h-7 flex justify-center items-center transition-colors shadow-sm"><i class="fa-solid fa-trash text-[12px]"></i></button>
        </div>`;
    }); 
};

window.addNewPromoCode = () => { 
    tempPromoCodes.push({ code: 'CODE-' + Math.floor(100 + Math.random() * 900), discount: 10, type: 'fixed', usesLeft: null, minOrder: 0, maxDiscount: 0, expiryDate: '', customerPhone: '', isAuto: false }); 
    renderAdminPromos(); 
};

// --- أوامر الطلبات والتصدير ---
window.exportOrdersToCSV = () => {
    if(ordersList.length === 0) return showAlert("تنبيه", "لا توجد طلبات لتصديرها.");
    let csv = '\uFEFF'; 
    csv += "التاريخ والوقت,الاسم,الموبايل,المنطقة,العنوان,الطلبات,الإجمالي (ج.م),الخصم,الحالة\n";
    ordersList.forEach(o => {
        let items = o.items.map(i => `${i.quantity} ${i.name}`).join(' + ');
        let status = o.status === 'new' ? 'جديد' : (o.status === 'processing' ? 'قيد التجهيز' : (o.status === 'canceled' ? 'ملغي' : 'مكتمل'));
        let date = (o.orderDate || '') + " " + (o.orderTime || '');
        let discount = o.discount ? o.discount : 0;
        let address = o.customerAddress ? o.customerAddress.replace(/,/g, '-') : '';
        csv += `"${date}","${o.customerName}","${o.customerPhone}","${o.zone}","${address}","${items}","${o.total}","${discount}","${status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Saman_Orders_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.csv`;
    link.click();
};

window.sendMessageToCustomer = (phone, order) => {
    let itemsText = order.items.map(i => `${i.quantity}x ${i.name}`).join('\n');
    let msg = `مرحباً ${order.customerName}،\nتفاصيل طلبك:\n${itemsText}\nالإجمالي: ${order.total} ج.م\nشكراً لتعاملك معنا!`;
    let waNumber = phone.startsWith('0') ? '2' + phone : phone;
    window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(msg)}`, '_blank');
};

window.sendRatingRequest = (phone, order) => {
    let msg = `شكراً ${order.customerName} على طلبك!\nتقدر تقيم تجربتك معانا من هنا:\n⭐️ [رابط التقييم]\n(سيتم إضافة الرابط لاحقاً)`;
    let waNumber = phone.startsWith('0') ? '2' + phone : phone;
    window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(msg)}`, '_blank');
};

window.renderOrdersList = () => {
    const container = document.getElementById('orders-list-container');
    if(!container) return;
    
    if (!document.getElementById('export-csv-btn')) {
        const btnHtml = `<button id="export-csv-btn" onclick="exportOrdersToCSV()" class="w-full mb-3 bg-brand-navy hover:bg-gray-800 transition-colors text-white text-xs font-bold py-3 rounded-xl shadow-sm flex justify-center items-center gap-2"><i class="fa-solid fa-file-excel text-green-400"></i> تصدير جميع الطلبات لـ Excel</button>`;
        container.insertAdjacentHTML('beforebegin', btnHtml);
    }
    
    const searchEl = document.getElementById('order-search');
    const searchQuery = searchEl ? searchEl.value.trim().toLowerCase() : '';
    
    let filtered = ordersList.filter(o => {
        if(orderFilter !== 'all' && o.status !== orderFilter) return false;
        if(searchQuery) {
            const nameMatch = o.customerName?.toLowerCase().includes(searchQuery);
            const phoneMatch = o.customerPhone?.toLowerCase().includes(searchQuery);
            const zoneMatch = o.zone?.toLowerCase().includes(searchQuery);
            const addressMatch = o.customerAddress?.toLowerCase().includes(searchQuery);
            const itemsMatch = o.items?.some(i => i.name?.toLowerCase().includes(searchQuery));
            if(!nameMatch && !phoneMatch && !zoneMatch && !addressMatch && !itemsMatch) return false;
        }
        return true;
    });
    
    if(filtered.length === 0) { 
        container.innerHTML = '<p class="text-center text-gray-500 py-8 font-bold text-sm bg-gray-50 rounded-xl border border-dashed">لا توجد طلبات تطابق بحثك</p>'; 
        return; 
    }

    container.innerHTML = filtered.map(order => {
        let statusColor = order.status === 'new' ? 'bg-red-100 text-red-700 border-red-200' : (order.status === 'processing' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : (order.status === 'canceled' ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-green-100 text-green-700 border-green-200'));
        let statusText = order.status === 'new' ? 'جديد' : (order.status === 'processing' ? 'قيد التجهيز' : (order.status === 'canceled' ? 'ملغي' : 'مكتمل'));
        let itemsHtml = order.items.map(i => `<div class="flex justify-between text-xs text-gray-700 font-bold border-b border-gray-100 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0"><span><span class="text-brand-cyanDark">${i.quantity}x</span> ${i.name}</span><span>${i.quantity*i.price} ج</span></div>`).join('');

        return `
        <div class="bg-white border rounded-xl p-4 shadow-sm relative overflow-hidden mb-3 ${order.status === 'canceled' ? 'opacity-70' : ''}">
            <div class="absolute top-0 right-0 w-1 h-full ${order.status === 'new' ? 'bg-red-500' : (order.status === 'processing' ? 'bg-yellow-500' : (order.status === 'canceled' ? 'bg-gray-400' : 'bg-green-500'))}"></div>
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="font-black text-brand-navy">${order.customerName}</div>
                    <a href="tel:${order.customerPhone}" class="text-sm font-bold text-blue-600 hover:underline" dir="ltr">${order.customerPhone}</a>
                </div>
                <div class="flex gap-2 items-center">
                    <button onclick="sendMessageToCustomer('${order.customerPhone}', ordersList.find(o=>o.id==='${order.id}'))" class="text-[10px] bg-blue-500 text-white px-2 py-1 rounded font-bold hover:bg-blue-600 transition-colors"><i class="fa-brands fa-whatsapp"></i> رسالة</button>
                    <span class="px-2 py-1 rounded text-[10px] font-black border ${statusColor}">${statusText}</span>
                </div>
            </div>
            <div class="text-[11px] text-gray-500 mb-3 font-bold bg-gray-50 p-2 rounded border border-gray-100">
                <i class="fa-solid fa-location-dot text-brand-cyanDark mr-1"></i> ${order.zone} ${order.customerAddress && order.customerAddress !== 'غير محدد' ? ' - ' + order.customerAddress : ''}
            </div>
            <div class="bg-gray-50 border border-gray-100 p-2 rounded-lg mb-3 space-y-1">${itemsHtml}</div>
            
            <div class="bg-brand-light/20 p-3 rounded-xl border border-brand-cyan/10 text-xs font-bold space-y-1 mb-3">
                <div class="flex justify-between"><span>قيمة الطلبات:</span> <span>${order.subtotal || 0} ج.م</span></div>
                ${(order.discount && order.discount > 0) ? `<div class="flex justify-between text-red-500"><span>الخصم:</span> <span>-${order.discount} ج.م</span></div>` : ''}
                <div class="flex justify-between text-gray-500"><span>التوصيل:</span> <span>${order.deliveryFee || 0} ج.م</span></div>
                <div class="flex justify-between text-sm font-black text-brand-navy border-t border-brand-cyan/20 pt-2 mt-2">
                    <span>الإجمالي:</span> 
                    <span class="text-brand-cyanDark text-lg">${order.total} <span class="text-[10px] text-gray-500">ج.م</span></span>
                </div>
            </div>
            
            <div class="flex gap-2 flex-wrap">
                ${order.status === 'new' ? `<button onclick="updateOrderStatus('${order.id}', 'processing', ${order.total || 0})" class="flex-1 bg-yellow-500 hover:bg-yellow-600 transition-colors text-white py-2 rounded-lg text-xs font-black shadow-sm">قيد التجهيز</button>` : ''}
                ${order.status === 'processing' ? `<button onclick="updateOrderStatus('${order.id}', 'completed', ${order.total || 0})" class="flex-1 bg-green-500 hover:bg-green-600 transition-colors text-white py-2 rounded-lg text-xs font-black shadow-sm">تم التوصيل</button>` : ''}
                ${(order.status === 'new' || order.status === 'processing') ? `<button onclick="updateOrderStatus('${order.id}', 'canceled', ${order.total || 0})" class="flex-1 bg-red-50 hover:bg-red-100 transition-colors text-red-600 py-2 rounded-lg text-xs font-black shadow-sm border border-red-200">إلغاء</button>` : ''}
                ${order.status === 'completed' ? `<button onclick="sendRatingRequest('${order.customerPhone}', ordersList.find(o=>o.id==='${order.id}'))" class="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg text-xs font-black"><i class="fa-solid fa-star"></i> إرسال تقييم</button>` : ''}
                ${order.status === 'canceled' ? `<div class="flex-1 text-center bg-gray-100 text-red-500 py-2 rounded-lg text-xs font-black italic">❌ تم إلغاء الطلب</div>` : ''}
            </div>
        </div>`;
    }).join('');
};

async function loadOrders() { 
    if(!hasCloud || !db) return; 
    const container = document.getElementById('orders-list-container');
    if(container) container.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p class="text-xs font-bold">جاري جلب الطلبات...</p></div>';
    try { 
        const snap = await db.collection("orders").orderBy("createdAt","desc").get(); 
        ordersList=[]; 
        snap.forEach(d=>ordersList.push({id:d.id, ...d.data()})); 
        renderOrdersList();
        dispatchOrdersList = ordersList.filter(o => o.status === 'processing');
        if(currentAdminTab === 'dispatch') renderDispatchOrders();
    } catch(e){ console.log("Error loading orders", e); } 
}

window.filterOrders = (f) => { orderFilter=f; renderOrdersList(); };

// الدالة المسئولة عن تغيير حالة الأوردر (متضاف فيها كود خصم الإلغاء)
window.updateOrderStatus = async (id, s, amount = 0) => { 
    if (s === 'canceled') {
        if (!confirm("تأكيد: هل تريد إلغاء الأوردر؟ (سيتم خصم قيمته تلقائياً من إحصائيات المبيعات)")) return;
    }
    
    if(db){ 
        const btn = event.currentTarget; 
        const origText = btn.innerHTML; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
        btn.disabled = true;
        
        try {
            await db.collection("orders").doc(id).update({status:s}); 
            
            // لو الأوردر اتلغى، نطرح الفلوس من الإحصائيات الرئيسية
            if (s === 'canceled' && amount > 0) {
                await db.collection("inventory").doc("stats").update({ 
                    sales: firebase.firestore.FieldValue.increment(-amount),
                    orders: firebase.firestore.FieldValue.increment(-1)
                });
            }
            
            loadOrders();
        } catch (e) {
            console.error(e);
            btn.innerHTML = origText; 
            btn.disabled = false;
            showAlert("خطأ", "حدث مشكلة أثناء التحديث");
        }
    } 
};

window.deleteAllOrders = async () => {
    if(!confirm("⚠️ تحذير: هل أنت متأكد من مسح جميع الطلبات من السجل؟ (هذا لن يصفر إحصائيات المبيعات، استخدم التصفير أولاً إذا أردت)")) return;
    const btn = document.querySelector('button[onclick="deleteAllOrders()"]'); 
    let originalHtml = '';
    if(btn) { originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري المسح...'; }
    if(hasCloud && db) {
        try {
            const snap = await db.collection("orders").get();
            if(!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            if(btn) btn.innerHTML = originalHtml; 
            showAlert("تم المسح", "تم مسح جميع سجلات الطلبات بنجاح."); 
            loadOrders();
        } catch(e) { 
            if(btn) btn.innerHTML = originalHtml; 
            showAlert("خطأ", "حدث خطأ أثناء المسح."); 
        }
    } else { 
        ordersList = []; renderOrdersList(); 
        if(btn) btn.innerHTML = originalHtml; 
        showAlert("تم بنجاح", "تم المسح محلياً."); 
    }
};

window.resetStatsOnly = async () => {
    if(!confirm("⚠️ تحذير: هل أنت متأكد من تصفير عدادات الإحصائيات (مبيعات اليوم والطلبات) لتبدأ من صفر؟")) return;
    const btn = document.querySelector('button[onclick="resetStatsOnly()"]'); 
    let originalHtml = '';
    if(btn) { originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التصفير...'; }
    if(hasCloud && db) {
        try {
            await db.collection("inventory").doc("stats").set({ sales: 0, orders: 0 });
            if(btn) btn.innerHTML = originalHtml; 
            showAlert("تم التصفير", "تم تصفير عدادات المبيعات بنجاح.");
        } catch(e) { 
            if(btn) btn.innerHTML = originalHtml; 
            showAlert("خطأ", "حدث خطأ أثناء الاتصال بقاعدة البيانات."); 
        }
    } else {
        dailyStats = { sales: 0, orders: 0 }; 
        const sSales = document.getElementById('stat-sales'); if(sSales) sSales.innerText = 0; 
        const sOrders = document.getElementById('stat-orders'); if(sOrders) sOrders.innerText = 0;
        if(btn) btn.innerHTML = originalHtml; 
        showAlert("تم بنجاح", "تم التصفير محلياً.");
    }
};

window.renderDispatchOrders = () => {
    const container = document.getElementById('dispatch-orders-container');
    const zoneFilter = document.getElementById('dispatch-zone-filter')?.value || 'all';
    if (!container) return;

    const zoneSelect = document.getElementById('dispatch-zone-filter');
    if (zoneSelect && dispatchOrdersList.length > 0) {
        const zones = [...new Set(dispatchOrdersList.map(o => o.zone))].sort();
        zoneSelect.innerHTML = '<option value="all">كل المناطق</option>' +
            zones.map(z => `<option value="${z}" ${zoneFilter === z ? 'selected' : ''}>${z}</option>`).join('');
    }

    let filtered = dispatchOrdersList; 
    if (zoneFilter !== 'all') {
        filtered = filtered.filter(o => o.zone === zoneFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-sm font-bold">لا توجد طلبات قيد التجهيز في هذه التصفية</p>';
        return;
    }

    container.innerHTML = filtered.map(order => {
        const itemsText = order.items.map(i => `${i.quantity}x ${i.name}`).join('، ');
        const address = (order.customerAddress && order.customerAddress !== 'غير محدد') ? order.customerAddress : '';
        return `
        <div class="flex items-start gap-3 bg-white p-3 rounded-lg border shadow-sm">
            <input type="checkbox" class="dispatch-checkbox mt-1 accent-brand-cyanDark w-5 h-5" data-id="${order.id}" onchange="updateDispatchCount()">
            <div class="flex-1">
                <div class="font-black text-brand-navy">${order.customerName}</div>
                <div class="text-xs text-gray-500 mt-1">📱 ${order.customerPhone}</div>
                <div class="text-xs text-gray-500">📍 ${order.zone} ${address ? '- ' + address : ''}</div>
                <div class="text-xs mt-1 bg-gray-50 p-1 rounded border border-gray-100">🛒 ${itemsText}</div>
                <div class="text-xs font-bold text-brand-cyanDark mt-1">💰 الإجمالي: ${order.total} ج.م (توصيل: ${order.deliveryFee} ج.م)</div>
            </div>
        </div>`;
    }).join('');

    updateDispatchCount();
};

window.updateDispatchCount = () => {
    const count = document.querySelectorAll('.dispatch-checkbox:checked').length;
    const span = document.getElementById('dispatch-selected-count');
    if (span) span.innerText = count;
};

window.toggleSelectAllDispatch = () => {
    const checkboxes = document.querySelectorAll('.dispatch-checkbox');
    const allChecked = [...checkboxes].every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateDispatchCount();
};

window.sendDispatchToDriver = () => {
    const phoneEl = document.getElementById('dispatch-driver-phone');
    if(!phoneEl) return;
    const phone = phoneEl.value.trim();
    if (!phone || phone.length < 10) { showAlert('تنبيه', 'يرجى إدخال رقم موبايل المندوب بشكل صحيح'); return; }

    const checkedOrders = [];
    document.querySelectorAll('.dispatch-checkbox:checked').forEach(cb => {
        const id = cb.getAttribute('data-id');
        const order = dispatchOrdersList.find(o => o.id === id);
        if (order) checkedOrders.push(order);
    });

    if (checkedOrders.length === 0) { showAlert('تنبيه', 'لم تختر أي طلب للإرسال'); return; }

    const template = (globalSettings.dispatchTemplate || '📦 طلب جديد من {اسم_العميل}\n📱 {رقم_العميل}\n📍 {المنطقة} - {العنوان}\n🛒 الطلبات:\n{تفاصيل_الطلبات}\n💰 إجمالي الطلب: {إجمالي_الطلب} ج.م\n🚚 التوصيل: {التوصيل}\n⭐ الإجمالي النهائي: {الإجمالي_النهائي} ج.م');

    let fullMessage = '';
    checkedOrders.forEach(order => {
        let itemsText = order.items.map(i => `${i.quantity}x ${i.name}`).join('\n');
        let address = (order.customerAddress && order.customerAddress !== 'غير محدد') ? order.customerAddress : '';
        let msg = template.replace(/{اسم_العميل}/g, order.customerName).replace(/{رقم_العميل}/g, order.customerPhone).replace(/{المنطقة}/g, order.zone).replace(/{العنوان}/g, address).replace(/{تفاصيل_الطلبات}/g, itemsText).replace(/{إجمالي_الطلب}/g, order.subtotal).replace(/{التوصيل}/g, order.deliveryFee).replace(/{الإجمالي_النهائي}/g, order.total);
        fullMessage += msg + '\n\n' + '─'.repeat(10) + '\n\n';
    });

    let waNumber = phone.startsWith('0') ? '2' + phone : phone;
    window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(fullMessage.trim())}`, '_blank');
};

window.generateBulkWhatsAppLinks = () => {
    const numbersEl = document.getElementById('admin-bulk-numbers');
    const msgEl = document.getElementById('admin-bulk-message');
    const typeEl = document.getElementById('admin-bulk-reward-type');
    const valEl = document.getElementById('admin-bulk-reward-value');
    
    if(!numbersEl || !msgEl || !typeEl || !valEl) return;

    const numbersRaw = numbersEl.value.trim();
    const messageTemplate = msgEl.value.trim() || "شكراً لثقتك! كود الخصم بتاعك: {الكود}";
    const rewardType = typeEl.value;
    const rewardValue = parseInt(valEl.value) || 0;

    if(!numbersRaw) { showAlert("تنبيه", "يرجى إدخال أرقام الموبايلات أولاً"); return; }
    const numbers = numbersRaw.split('\n').map(n => n.trim()).filter(n => n.length >= 10);
    if(numbers.length === 0) { showAlert("تنبيه", "لم يتم العثور على أرقام صحيحة"); return; }

    const linksContainer = document.getElementById('bulk-whatsapp-links');
    if(!linksContainer) return;
    linksContainer.innerHTML = '<p class="text-xs font-black text-brand-navy mb-2 border-b pb-2"><i class="fa-solid fa-check-double text-green-500"></i> اضغط "إرسال" قدام كل رقم:</p>';

    numbers.forEach(num => {
        const randomCode = "THX-" + Math.floor(1000 + Math.random() * 9000);
        tempPromoCodes.push({ code: randomCode, type: rewardType, discount: rewardValue, isAuto: true, usesLeft: 1, customerPhone: num, minOrder: 0, maxDiscount: 0, expiryDate: '' });
        const finalMessage = messageTemplate.replace(/{الكود}/g, randomCode);
        let waNumber = num;
        if(waNumber.startsWith('0')) waNumber = '2' + waNumber; 

        linksContainer.innerHTML += `
            <div class="flex justify-between items-center bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                <span class="text-xs font-bold text-gray-600" dir="ltr">${num}</span>
                <a href="https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(finalMessage)}" target="_blank" class="bg-green-500 hover:bg-green-600 text-white text-[10px] px-4 py-1.5 rounded font-black transition-colors flex items-center gap-1 shadow-sm">
                    إرسال <i class="fa-brands fa-whatsapp text-sm"></i>
                </a>
            </div>
        `;
    });

    renderAdminPromos();
    linksContainer.classList.remove('hidden');
    showAlert("تم التجهيز بنجاح 🎉", `تم إنشاء أكواد لـ ${numbers.length} عميل. \n\n⚠️ مهم جداً: انزل تحت في لوحة التحكم ودوس "حفظ جميع التعديلات" عشان الأكواد تتفعل في السيستم وتقدر تبعت الرسايل.`);
};

// --- الدالة الذهبية لحفظ البيانات (آمنة تماماً) ---
window.saveAdminData = async () => {
    syncAdminProductsFromDOM(); 
    
    let newUiTexts = {};
    if(typeof textsConfig !== 'undefined') {
        textsConfig.forEach(t => {
            const el = document.getElementById(`ui-txt-${t.id}`);
            if(el) newUiTexts[t.id] = el.value.trim();
            else if(globalSettings.uiTexts && globalSettings.uiTexts[t.id]) newUiTexts[t.id] = globalSettings.uiTexts[t.id]; 
        });
    }

    const marqueeMsg = getSafeVal('admin-marquee-messages', '').split('\n').map(s=>s.trim()).filter(s=>s);
    const notiNames = getSafeVal('admin-noti-names', '').split('،').map(s=>s.trim()).filter(s=>s);
    const notiPlaces = getSafeVal('admin-noti-places', '').split('،').map(s=>s.trim()).filter(s=>s);

    const defaultBadges = [
        { icon: 'fa-regular fa-circle-check', title: 'أوزان دقيقة', desc: 'زي ما طلبت بالظبط' },
        { icon: 'fa-regular fa-star', title: 'طلبك باسمك', desc: 'استيكر مخصص ليك' },
        { icon: 'fa-regular fa-clock', title: 'تجهيز يومي', desc: 'طازج مية بالمية' },
        { icon: 'fa-solid fa-shield-halved', title: 'تغليف آمن', desc: 'أطباق صحية' }
    ];

    // فلترة الأكواد وحفظها بدون فقدان (مع إجبار تحويلها لأرقام لمنع التعليق)
    const finalPromoCodes = tempPromoCodes.filter(p => p.code && p.code.trim() !== '').map(p => ({
        ...p,
        discount: parseFloat(p.discount) || 0,
        minOrder: parseFloat(p.minOrder) || 0,
        maxDiscount: parseFloat(p.maxDiscount) || 0,
        usesLeft: p.usesLeft === '' || p.usesLeft === null ? null : parseInt(p.usesLeft)
    }));

    const newSettings = {
        ...globalSettings, 
        storeOpen: getSafeCheck('admin-store-open', globalSettings.storeOpen), 
        storeName: getSafeVal('admin-store-name', globalSettings.storeName), 
        storeDesc: getSafeVal('admin-store-desc', globalSettings.storeDesc), 
        storePhone: getSafeVal('admin-store-phone', globalSettings.storePhone), 
        minOrder: parseInt(getSafeVal('admin-min-order', globalSettings.minOrder)) || 0,
        freeDeliveryActive: getSafeCheck('admin-free-delivery-active', globalSettings.freeDeliveryActive), 
        freeDeliveryThreshold: parseInt(getSafeVal('admin-free-delivery-threshold', globalSettings.freeDeliveryThreshold)) || 0, 
        deliveryZones: tempAdminZones.filter(z => z.name.trim()),
        drivers: (window.tempDrivers || []).filter(d => d.name.trim() || d.phone.trim()), 
        
        trustBadges: [
            { icon: getSafeVal('admin-badge-1-icon', defaultBadges[0].icon), title: getSafeVal('admin-badge-1-title', defaultBadges[0].title), desc: getSafeVal('admin-badge-1-desc', defaultBadges[0].desc) },
            { icon: getSafeVal('admin-badge-2-icon', defaultBadges[1].icon), title: getSafeVal('admin-badge-2-title', defaultBadges[1].title), desc: getSafeVal('admin-badge-2-desc', defaultBadges[1].desc) },
            { icon: getSafeVal('admin-badge-3-icon', defaultBadges[2].icon), title: getSafeVal('admin-badge-3-title', defaultBadges[2].title), desc: getSafeVal('admin-badge-3-desc', defaultBadges[2].desc) },
            { icon: getSafeVal('admin-badge-4-icon', defaultBadges[3].icon), title: getSafeVal('admin-badge-4-title', defaultBadges[3].title), desc: getSafeVal('admin-badge-4-desc', defaultBadges[3].desc) }
        ],

        rewardActive: getSafeCheck('admin-reward-active', globalSettings.rewardActive), 
        rewardType: getSafeVal('admin-reward-type', globalSettings.rewardType), 
        rewardValue: parseInt(getSafeVal('admin-reward-value', globalSettings.rewardValue)) || 0, 
        rewardMaxDiscount: parseInt(getSafeVal('admin-reward-max-discount', globalSettings.rewardMaxDiscount)) || 0, 
        rewardMaxGenerations: parseInt(getSafeVal('admin-reward-max-generations', globalSettings.rewardMaxGenerations)) || 0,
        autoPromoModalMsg: getSafeVal('admin-loyalty-msg', globalSettings.autoPromoModalMsg),

        bannerActive: getSafeCheck('admin-banner-active', globalSettings.bannerActive), 
        bannerText: getSafeVal('admin-banner-text', globalSettings.bannerText), 
        crossSellActive: getSafeCheck('admin-crosssell-active', globalSettings.crossSellActive), 
        crossSellProductId: getSafeVal('admin-crosssell-product', globalSettings.crossSellProductId), 
        promoCodes: finalPromoCodes, 
        bestSellers: globalSettings.bestSellers,
        showPromoField: getSafeCheck('admin-show-promo-field', globalSettings.showPromoField),
        successTitle: getSafeVal('admin-success-title', globalSettings.successTitle), 
        successMessage: getSafeVal('admin-success-message', globalSettings.successMessage), 
        
        whatsappTemplate: getSafeVal('admin-whatsapp-template', globalSettings.whatsappTemplate),
        ticktickTemplate: getSafeVal('admin-ticktick-template', globalSettings.ticktickTemplate),
        vipWhatsappTemplate: getSafeVal('admin-vip-whatsapp-template', globalSettings.vipWhatsappTemplate),
        batchHashtag: getSafeVal('admin-batch-hashtag', globalSettings.batchHashtag),
        dispatchTemplate: getSafeVal('admin-dispatch-template', globalSettings.dispatchTemplate),
        
        uiTexts: newUiTexts,
        galleryImages: globalSettings.galleryImages || [],
        marqueeMessages: marqueeMsg.length > 0 ? marqueeMsg : (globalSettings.marqueeMessages || []),
        liveNotiActive: getSafeCheck('admin-live-noti-active', globalSettings.liveNotiActive),
        liveNotiNames: notiNames.length > 0 ? notiNames : (globalSettings.liveNotiNames || []),
        liveNotiPlaces: notiPlaces.length > 0 ? notiPlaces : (globalSettings.liveNotiPlaces || []),
        productsData: tempProducts
    };

    const btn = document.querySelector('button[onclick="saveAdminData()"]'); 
    let originalHtml = '';
    if(btn) { originalHtml = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xl"></i> جاري الحفظ...'; }

    if(hasCloud && db) {
        try {
            await Promise.all([ 
                db.collection("inventory").doc("settings").set(newSettings), 
                db.collection("inventory").doc("stock").set(globalStock), 
                db.collection("inventory").doc("prices").set(globalPrices), 
                db.collection("inventory").doc("old_prices").set(globalOldPrices), 
                db.collection("inventory").doc("discounts_status").set(globalDiscounts) 
            ]);
            if(btn) btn.innerHTML = originalHtml; 
            closeAdminDashboard(); 
            const iconCont = document.getElementById('alert-icon-container');
            if(iconCont) iconCont.className = "w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"; 
            const icon = document.getElementById('alert-icon');
            if(icon) icon.className = "fa-solid fa-check"; 
            showAlert("تم بنجاح", "تم حفظ جميع التعديلات بنجاح.");
        } catch(e) { 
            if(btn) btn.innerHTML = originalHtml; 
            showAlert("خطأ", "حدث خطأ أثناء الحفظ. تحقق من اتصالك بالإنترنت."); 
        }
    } else {
        Object.assign(globalSettings, newSettings); productsInfo = tempProducts; globalDeliveryZones = newSettings.deliveryZones; 
        closeAdminDashboard(); 
        if(btn) btn.innerHTML = originalHtml; 
        if(typeof applySettingsToUI === 'function') applySettingsToUI(); 
        if(typeof renderDeliveryZones === 'function') renderDeliveryZones(); 
        const container = document.getElementById('products-container'); 
        if(container) container.innerHTML = `<div class="text-center py-10 text-brand-cyanDark"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3"></i><p class="font-bold text-sm">جاري التحديث...</p></div>`; 
        setTimeout(() => { if(typeof renderProducts === 'function') renderProducts(); }, 500); 
        if(typeof updateUI === 'function') updateUI(); 
        showAlert("تم محلياً", "تم الحفظ مؤقتاً لأن المتصفح غير متصل بقاعدة البيانات.");
    }
};

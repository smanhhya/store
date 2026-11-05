// =========================================================================
// 📊 المحرك الذكي المستقل للوحة القيادة المالية والتحليلية (dashboard.js)
// خاص بمشروع: سمان ههيا (CRM)
// =========================================================================

(function () {
    // 1. إعدادات الفلترة الافتراضية للوحة القيادة (تفتح على الشهر الحالي تلقائياً)
    const now = new Date();
    const defaultMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    window.dashState = {
        period: 'this_month',      // 'today' | 'this_month' | 'last_month' | 'pick_month' | 'custom' | 'all_time'
        selectedMonth: defaultMonthStr,
        dateFrom: '',
        dateTo: '',
        sourceFilter: 'all',       // 'all' | 'batches_only' | 'normal_only' | 'batch:BATCH_NAME'
        dateBasis: 'effective',    // 'effective' (تاريخ التسليم الفعلي) | 'created' (تاريخ إنشاء الطلب)
        tableSubFilter: 'completed', // 'completed' | 'all_active' | 'discounted' | 'debt' | 'canceled'
        tableSearch: ''
    };

    // دالة مساعدة للتنبيهات السريعة (حماية للسيستم في حال عدم وجودها)
    if (typeof window.showToast !== 'function') {
        window.showToast = function (msg) {
            let toast = document.getElementById(' global-toast-notif');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'global-toast-notif';
                toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl text-xs font-black shadow-2xl z-[200] transition-all duration-300 opacity-0 pointer-events-none';
                document.body.appendChild(toast);
            }
            toast.innerText = msg;
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
            clearTimeout(window._toastTimer);
            window._toastTimer = setTimeout(() => {
                toast.classList.remove('opacity-100');
                toast.classList.add('opacity-0');
            }, 3000);
        };
    }

    // 2. بناء الهيكل البصري الذكي داخل #view-dashboard مع الحفاظ التام على كشاف الطوارئ
    window.initSmartDashboardLayout = function () {
        const dashView = document.getElementById('view-dashboard');
        if (!dashView || document.getElementById('smart-dashboard-root')) return;

        // الاحتفاظ بكشاف الطوارئ (أول عنصر داخل لوحة القيادة)
        const emergencySearchEl = dashView.firstElementChild;
        dashView.innerHTML = '';
        if (emergencySearchEl) {
            dashView.appendChild(emergencySearchEl);
        }

        const root = document.createElement('div');
        root.id = 'smart-dashboard-root';
        root.className = 'space-y-6 pb-12';

        root.innerHTML = `
            <!-- 🎛️ شريط التحكم والفلترة المالية الذكية -->
            <div class="bg-white p-5 rounded-[1.5rem] border border-slate-200/80 shadow-soft space-y-4">
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-3 border-b border-slate-100">
                    <div>
                        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
                            <i class="fa-solid fa-chart-pie text-brand-primary"></i>
                            <span>المركز المالي وتحليل المبيعات</span>
                            <span id="dash-active-period-badge" class="bg-emerald-50 text-brand-primary border border-emerald-200 px-3 py-0.5 rounded-full text-xs font-black">هذا الشهر</span>
                        </h3>
                        <p class="text-[11px] font-bold text-slate-400 mt-0.5">لا يتم تصفير البيانات يومياً — اختر الشهر أو الدفعة لمراجعة المبيعات والخصومات والأصناف بدقة.</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <select id="dash-date-basis" onchange="updateDashState('dateBasis', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none focus:bg-white">
                            <option value="effective">📅 الحساب حسب: تاريخ التسليم الفعلي</option>
                            <option value="created">📝 الحساب حسب: تاريخ تسجيل الطلب</option>
                        </select>
                        <button onclick="printSmartDashboardReport()" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95">
                            <i class="fa-solid fa-print text-amber-400"></i> طباعة تقرير الفترة
                        </button>
                    </div>
                </div>

                <!-- أزرار اختيار الفترة الزمنية -->
                <div class="flex flex-wrap items-center gap-2">
                    <button onclick="updateDashState('period', 'this_month')" id="d-period-this_month" class="dash-period-btn bg-brand-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all">📅 هذا الشهر</button>
                    <button onclick="updateDashState('period', 'last_month')" id="d-period-last_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">⏪ الشهر الماضي</button>
                    <button onclick="updateDashState('period', 'pick_month')" id="d-period-pick_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">🗓️ اختيار شهر محدد</button>
                    <button onclick="updateDashState('period', 'today')" id="d-period-today" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">☀️ اليوم فقط</button>
                    <button onclick="updateDashState('period', 'custom')" id="d-period-custom" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">📆 من تاريخ إلى تاريخ</button>
                    <button onclick="updateDashState('period', 'all_time')" id="d-period-all_time" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">🌍 كل الأوقات (شامل)</button>

                    <div class="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

                    <!-- فلتر الدفعة أو الفوري -->
                    <select id="dash-source-select" onchange="updateDashState('sourceFilter', this.value)" class="flex-1 md:flex-none border-2 border-teal-500/30 bg-teal-50/40 rounded-xl px-3 py-2 text-xs font-black text-teal-900 outline-none focus:border-teal-600">
                        <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                        <option value="batches_only">🏷️ طلبات الدفعات فقط (إجمالي)</option>
                        <option value="normal_only">❄️ الطلبات الفورية / بدون دفعة فقط</option>
                    </select>
                </div>

                <!-- خيارات إضافية تظهر عند اختيار شهر محدد أو فترة مخصصة -->
                <div id="dash-extra-date-controls" class="hidden pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
                    <div id="dash-month-picker-wrap" class="hidden flex items-center gap-2">
                        <label class="text-xs font-black text-slate-600">اختر الشهر والسنة:</label>
                        <input type="month" id="dash-month-input" value="${defaultMonthStr}" onchange="updateDashState('selectedMonth', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none focus:border-brand-primary">
                    </div>
                    <div id="dash-custom-range-wrap" class="hidden flex flex-wrap items-center gap-2">
                        <label class="text-xs font-black text-slate-600">من:</label>
                        <input type="date" id="dash-date-from" onchange="updateDashState('dateFrom', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none">
                        <label class="text-xs font-black text-slate-600">إلى:</label>
                        <input type="date" id="dash-date-to" onchange="updateDashState('dateTo', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none">
                    </div>
                </div>
            </div>

            <!-- 💰 الكروت المالية الـ 6 الشاملة -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- 1. إجمالي التحصيل الصافي للدرج -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-amber-200/80 shadow-soft relative overflow-hidden">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">إجمالي التحصيل الفعلي (المكتمل)</p>
                            <h3 id="sm-dash-total-revenue" class="text-3xl font-black text-amber-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-lg"><i class="fa-solid fa-wallet"></i></div>
                    </div>
                    <div id="sm-dash-payment-split" class="text-[11px] font-black text-slate-600 bg-amber-50/70 px-3 py-1.5 rounded-xl border border-amber-100 flex justify-between">
                        <span>💵 كاش: 0 ج</span>
                        <span>💳 أونلاين: 0 ج</span>
                    </div>
                </div>

                <!-- 2. صافي قيمة المنتجات بدون توصيل -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-emerald-200/80 shadow-soft relative overflow-hidden">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">إجمالي المنتجات (بدون توصيل)</p>
                            <h3 id="sm-dash-products-revenue" class="text-3xl font-black text-brand-primary mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg"><i class="fa-solid fa-sack-dollar"></i></div>
                    </div>
                    <div id="sm-dash-avg-order" class="text-[11px] font-bold text-emerald-800 bg-emerald-50/70 px-3 py-1.5 rounded-xl border border-emerald-100 flex justify-between">
                        <span>متوسط قيمة الطلب: 0 ج</span>
                        <span id="sm-dash-total-units">0 قطعة/طبق</span>
                    </div>
                </div>

                <!-- 3. كارت الخصومات والواجب (قابل للضغط للفلترة) -->
                <div onclick="updateDashState('tableSubFilter', 'discounted'); document.getElementById('sm-dash-orders-section').scrollIntoView({behavior:'smooth'});" class="bg-white p-5 rounded-[1.5rem] border border-red-200 shadow-soft relative overflow-hidden cursor-pointer hover:border-red-400 transition-all group" title="اضغط لعرض الطلبات التي حصلت على خصم في الجدول بالأسفل">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-red-600 flex items-center gap-1">إجمالي الخصومات والواجب <i class="fa-solid fa-arrow-down text-[10px] opacity-60 group-hover:translate-y-0.5 transition-transform"></i></p>
                            <h3 id="sm-dash-discounts-total" class="text-3xl font-black text-red-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-lg"><i class="fa-solid fa-tags"></i></div>
                    </div>
                    <div id="sm-dash-discounts-breakdown" class="text-[11px] font-black text-red-800 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 flex justify-between">
                        <span>خصم فواتير: 0 ج</span>
                        <span>فروق أسعار: 0 ج</span>
                    </div>
                </div>

                <!-- 4. إيرادات التوصيل -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-indigo-100 shadow-soft">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">إيرادات التوصيل (المكتمل)</p>
                            <h3 id="sm-dash-delivery-revenue" class="text-2xl font-black text-indigo-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-base"><i class="fa-solid fa-motorcycle"></i></div>
                    </div>
                    <div id="sm-dash-free-delivery-info" class="text-[11px] font-bold text-indigo-700 bg-indigo-50/60 px-3 py-1.5 rounded-xl border border-indigo-100">
                        طلبات بتوصيل مجاني: 0 طلب
                    </div>
                </div>

                <!-- 5. إحصائيات الطلبات (المكتمل مقابل قيد التنفيذ والملغي) -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-blue-100 shadow-soft">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">الطلبات المسلمة بنجاح</p>
                            <h3 id="sm-dash-completed-count" class="text-2xl font-black text-blue-600 mt-1">0 <span class="text-xs text-slate-400">طلب مكتمل</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-base"><i class="fa-solid fa-check-double"></i></div>
                    </div>
                    <div id="sm-dash-pipeline-info" class="text-[11px] font-black text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 flex justify-between">
                        <span class="text-amber-600">⏳ قيد التنفيذ: 0 (0 ج)</span>
                        <span class="text-slate-400">❌ ملغي: 0</span>
                    </div>
                </div>

                <!-- 6. الآجل المتبقي في الفترة -->
                <div onclick="updateDashState('tableSubFilter', 'debt'); document.getElementById('sm-dash-orders-section').scrollIntoView({behavior:'smooth'});" class="bg-white p-5 rounded-[1.5rem] border border-rose-100 shadow-soft cursor-pointer hover:border-rose-300 transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">باقي حساب (آجل مسجل بالفترة)</p>
                            <h3 id="sm-dash-debt-total" class="text-2xl font-black text-rose-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-base"><i class="fa-solid fa-book-journal-whills"></i></div>
                    </div>
                    <div id="sm-dash-debt-info" class="text-[11px] font-bold text-rose-700 bg-rose-50/60 px-3 py-1.5 rounded-xl border border-rose-100">
                        اضغط لعرض الطلبات الآجلة في هذه الفترة
                    </div>
                </div>
            </div>

            <!-- 🏷️ مقارنة أداء الدفعات مقابل البيع الفوري في هذه الفترة -->
            <div class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft">
                <div class="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <div>
                        <h4 class="text-sm font-black text-slate-800"><i class="fa-solid fa-layer-group text-teal-600 mr-1.5"></i> تفصيل مبيعات وخصومات (الدفعات) مقابل (الطلبات الفورية) في الفترة المحددة</h4>
                        <p class="text-[10px] font-bold text-slate-400 mt-0.5">اضغط على أي كارت لفلترة لوحة القيادة بالكامل على هذه الدفعة.</p>
                    </div>
                    <button onclick="updateDashState('sourceFilter', 'all')" id="sm-reset-batch-filter" class="hidden text-xs font-black bg-red-50 text-red-600 px-3 py-1 rounded-lg border border-red-200 hover:bg-red-600 hover:text-white transition-colors">إلغاء فلتر الدفعة ✕</button>
                </div>
                <div id="sm-dash-batches-breakdown" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
            </div>

            <!-- 📦 جرد الأصناف المباعة في الفترة (بالعدد وبالجنيه) -->
            <div class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft">
                <h4 class="text-sm font-black text-slate-800 mb-4 pb-2 border-b border-slate-100">
                    <i class="fa-solid fa-boxes-packing text-brand-primary mr-1.5"></i> جرد الأصناف المسلمة فعلياً في الفترة (كميات + إيراد كل صنف)
                </h4>
                <div id="sm-dash-items-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"></div>
            </div>

            <!-- 📋 جدول سجل الطلبات التفصيلي للفترة المحددة -->
            <div id="sm-dash-orders-section" class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft space-y-4">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-slate-100">
                    <div>
                        <h4 class="text-sm font-black text-slate-800"><i class="fa-solid fa-list-check text-indigo-500 mr-1.5"></i> السجل التفصيلي لطلبات الفترة</h4>
                        <p id="sm-dash-table-subtitle" class="text-[11px] font-bold text-slate-400 mt-0.5">يعرض كل تفاصيل المبيعات والخصومات للطلبات المفلترة.</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                        <button onclick="updateDashState('tableSubFilter', 'completed')" id="sm-tf-completed" class="sm-tf-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-black">✅ المكتمل والمسلم</button>
                        <button onclick="updateDashState('tableSubFilter', 'discounted')" id="sm-tf-discounted" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">🎁 طلبات بها خصم/واجب</button>
                        <button onclick="updateDashState('tableSubFilter', 'all_active')" id="sm-tf-all_active" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">⏳ قيد التنفيذ</button>
                        <button onclick="updateDashState('tableSubFilter', 'debt')" id="sm-tf-debt" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">📕 عليها باقي حساب</button>
                        <button onclick="updateDashState('tableSubFilter', 'canceled')" id="sm-tf-canceled" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">❌ الملغي</button>
                    </div>
                </div>

                <div class="relative w-full md:w-96">
                    <i class="fa-solid fa-search absolute right-3.5 top-3 text-slate-400 text-xs"></i>
                    <input type="search" id="sm-dash-table-search" oninput="updateDashState('tableSearch', this.value)" placeholder="ابحث داخل جدول الشهر (اسم، رقم، منطقة، صنف)..." class="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:bg-white focus:border-brand-primary">
                </div>

                <div class="overflow-x-auto custom-scroll max-h-[520px]">
                    <table class="w-full text-right text-xs whitespace-nowrap">
                        <thead class="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th class="py-3 px-4 font-black">العميل والمنطقة</th>
                                <th class="py-3 px-4 font-black text-center">الدفعة / النوع</th>
                                <th class="py-3 px-4 font-black text-center">الأصناف</th>
                                <th class="py-3 px-4 font-black text-center">المنتجات</th>
                                <th class="py-3 px-4 font-black text-center">التوصيل</th>
                                <th class="py-3 px-4 font-black text-center text-red-600">الخصم / الواجب</th>
                                <th class="py-3 px-4 font-black text-center">الصافي النهائي</th>
                                <th class="py-3 px-4 font-black text-center">التاريخ</th>
                                <th class="py-3 px-4 font-black text-center">إجراء</th>
                            </tr>
                        </thead>
                        <tbody id="sm-dash-orders-tbody" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>
        `;

        dashView.appendChild(root);
    };

    // 3. قراءة التاريخ الفعلي للطلب بأمان تام (يدعم التواريخ القديمة والجديدة)
    function parseOrderDateObj(o, basis) {
        if (basis === 'effective' && o.status === 'completed') {
            if (o.completedAt && typeof o.completedAt.toMillis === 'function') {
                return new Date(o.completedAt.toMillis());
            }
            if (o.completedAtStr) {
                const parsedComp = new Date(o.completedAtStr);
                if (!isNaN(parsedComp.getTime())) return parsedComp;
            }
        }
        if (o.createdAt && typeof o.createdAt.toMillis === 'function') {
            return new Date(o.createdAt.toMillis());
        }
        if (o.orderDate) {
            const parsedOrd = new Date(o.orderDate);
            if (!isNaN(parsedOrd.getTime())) return parsedOrd;
        }
        return null;
    }

    // 4. فحص هل الطلب يقع داخل الفترة الزمنية المحددة
    function isOrderInSelectedPeriod(o) {
        const st = window.dashState;
        if (st.period === 'all_time') return true;

        const dObj = parseOrderDateObj(o, st.dateBasis);
        if (!dObj) return false;

        const now = new Date();
        const oYear = dObj.getFullYear();
        const oMonth = dObj.getMonth();
        const oDate = dObj.getDate();

        if (st.period === 'today') {
            return oYear === now.getFullYear() && oMonth === now.getMonth() && oDate === now.getDate();
        }
        if (st.period === 'this_month') {
            return oYear === now.getFullYear() && oMonth === now.getMonth();
        }
        if (st.period === 'last_month') {
            const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return oYear === lastMonthDate.getFullYear() && oMonth === lastMonthDate.getMonth();
        }
        if (st.period === 'pick_month') {
            if (!st.selectedMonth) return true;
            const [selY, selM] = st.selectedMonth.split('-').map(Number);
            return oYear === selY && (oMonth + 1) === selM;
        }
        if (st.period === 'custom') {
            const dayStart = new Date(oYear, oMonth, oDate).getTime();
            if (st.dateFrom) {
                const fromParts = st.dateFrom.split('-').map(Number);
                const fromTime = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]).getTime();
                if (dayStart < fromTime) return false;
            }
            if (st.dateTo) {
                const toParts = st.dateTo.split('-').map(Number);
                const toTime = new Date(toParts[0], toParts[1] - 1, toParts[2]).getTime();
                if (dayStart > toTime) return false;
            }
            return true;
        }
        return true;
    }

    // 5. حساب فرق السعر (الواجب أو السعر القديم) في أصناف الطلب
    function calcOrderImplicitPriceDiscount(o) {
        if (!o.items || !Array.isArray(o.items)) return 0;
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let implicitDisc = 0;
        o.items.forEach(item => {
            const listPrice = Number(pricesObj[item.id] || (prodsObj[item.id] ? prodsObj[item.id].basePrice : 0)) || 0;
            const soldPrice = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            if (listPrice > 0 && soldPrice > 0 && soldPrice < listPrice) {
                implicitDisc += (listPrice - soldPrice) * qty;
            }
        });
        return Math.round(implicitDisc);
    }

    // 6. تحديث حالة الفلترة وإعادة رسم اللوحة فوراً
    window.updateDashState = function (key, val) {
        window.dashState[key] = val;

        // تحديث أزرار الفترة الزمنية
        if (key === 'period') {
            document.querySelectorAll('.dash-period-btn').forEach(btn => {
                btn.className = 'dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all';
            });
            const activeBtn = document.getElementById('d-period-' + val);
            if (activeBtn) {
                activeBtn.className = 'dash-period-btn bg-brand-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all';
            }

            const extraWrap = document.getElementById('dash-extra-date-controls');
            const monthWrap = document.getElementById('dash-month-picker-wrap');
            const customWrap = document.getElementById('dash-custom-range-wrap');

            if (val === 'pick_month') {
                extraWrap.classList.remove('hidden');
                monthWrap.classList.remove('hidden');
                customWrap.classList.add('hidden');
            } else if (val === 'custom') {
                extraWrap.classList.remove('hidden');
                customWrap.classList.remove('hidden');
                monthWrap.classList.add('hidden');
            } else {
                extraWrap.classList.add('hidden');
            }
        }

        // تحديث أزرار فلتر الجدول السفلي
        if (key === 'tableSubFilter') {
            document.querySelectorAll('.sm-tf-btn').forEach(btn => {
                btn.className = 'sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all';
            });
            const activeTf = document.getElementById('sm-tf-' + val);
            if (activeTf) {
                activeTf.className = 'sm-tf-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm transition-all';
            }
        }

        if (key === 'sourceFilter') {
            const sel = document.getElementById('dash-source-select');
            if (sel && sel.value !== val) sel.value = val;
            const resetBtn = document.getElementById('sm-reset-batch-filter');
            if (resetBtn) {
                if (val !== 'all') resetBtn.classList.remove('hidden');
                else resetBtn.classList.add('hidden');
            }
        }

        window.renderSmartDashboard();
    };

    // 7. المحرك الرئيسي لحساب ورسم لوحة القيادة الذكية
    window.renderSmartDashboard = function () {
        window.initSmartDashboardLayout();
        if (!document.getElementById('smart-dashboard-root')) return;

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const archivedArr = (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData)) ? archivedBatchesData : [];

        // تحديث قائمة الدفعات في الفلتر العلوي (تشمل الدفعات الحية والمؤرشفة وأي دفعة في الطلبات)
        const sourceSelect = document.getElementById('dash-source-select');
        if (sourceSelect) {
            const currentVal = window.dashState.sourceFilter;
            const batchNamesSet = new Set();

            Object.values(batchesObj).forEach(b => { if (b && b.name && b.name !== 'undefined') batchNamesSet.add(b.name.trim()); });
            archivedArr.forEach(a => { if (a && a.batchName && a.batchName !== 'undefined') batchNamesSet.add(a.batchName.trim()); });
            ordersList.forEach(o => { if (o && o.batchName && o.batchName !== 'undefined') batchNamesSet.add(o.batchName.trim()); });

            let optionsHtml = `
                <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                <option value="batches_only">🏷️ طلبات الدفعات فقط (إجمالي)</option>
                <option value="normal_only">❄️ الطلبات الفورية / بدون دفعة فقط</option>
            `;
            Array.from(batchNamesSet).forEach(bName => {
                const valKey = 'batch:' + bName;
                optionsHtml += `<option value="${valKey}" ${currentVal === valKey ? 'selected' : ''}>📌 دفعة: ${bName}</option>`;
            });
            sourceSelect.innerHTML = optionsHtml;
            sourceSelect.value = currentVal;
        }

        // تحديث شارة اسم الفترة النشطة
        const periodBadge = document.getElementById('dash-active-period-badge');
        if (periodBadge) {
            const pNames = {
                'this_month': 'هذا الشهر (' + new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }) + ')',
                'last_month': 'الشهر الماضي',
                'pick_month': 'شهر: ' + (window.dashState.selectedMonth || ''),
                'today': 'اليوم فقط',
                'custom': 'فترة مخصصة',
                'all_time': 'كل الأوقات (شامل)'
            };
            periodBadge.innerText = pNames[window.dashState.period] || 'هذا الشهر';
        }

        // أ) فلترة الطلبات حسب الفترة الزمنية أولاً (لحساب مقارنة الدفعات داخل الشهر)
        const periodOrders = ordersList.filter(o => {
            if (!o || o.status === 'trash') return false;
            return isOrderInSelectedPeriod(o);
        });

        // ب) تجميع أداء الدفعات مقابل الفوري داخل هذه الفترة الزمنية
        const sourcesSummary = {};
        periodOrders.forEach(o => {
            const hasBatch = Boolean((o.batchName && o.batchName !== 'undefined' && o.batchName.trim() !== '') || o.batchId);
            const bLabel = hasBatch ? ((o.batchName && o.batchName !== 'undefined') ? o.batchName.trim() : 'دفعة مسجلة') : '❄️ طلبات فورية (بدون دفعة)';
            const filterKey = hasBatch ? ('batch:' + bLabel) : 'normal_only';

            if (!sourcesSummary[bLabel]) {
                sourcesSummary[bLabel] = {
                    label: bLabel,
                    filterKey: filterKey,
                    isBatch: hasBatch,
                    completedCount: 0,
                    activeCount: 0,
                    revenue: 0,
                    discounts: 0
                };
            }

            if (o.status === 'completed') {
                sourcesSummary[bLabel].completedCount++;
                sourcesSummary[bLabel].revenue += Number(o.total) || 0;
                sourcesSummary[bLabel].discounts += (Number(o.discount) || 0) + calcOrderImplicitPriceDiscount(o);
            } else if (['new', 'processing', 'dispatched', 'deferred', 'no_answer'].includes(o.status)) {
                sourcesSummary[bLabel].activeCount++;
            }
        });

        // ج) تطبيق فلتر المصدر (دفعة معينة أو فوري أو الكل)
        const finalPeriodOrders = periodOrders.filter(o => {
            const sf = window.dashState.sourceFilter;
            if (sf === 'all') return true;
            const hasBatch = Boolean((o.batchName && o.batchName !== 'undefined' && o.batchName.trim() !== '') || o.batchId);
            if (sf === 'batches_only') return hasBatch;
            if (sf === 'normal_only') return !hasBatch;
            if (sf.startsWith('batch:')) {
                const targetBatchName = sf.replace('batch:', '').trim();
                return (o.batchName || '').trim() === targetBatchName;
            }
            return true;
        });

        // د) الحسابات المالية الشاملة للفترة المحددة
        let completedCount = 0;
        let activeCount = 0;
        let activeExpectedRev = 0;
        let canceledCount = 0;

        let totalRevenue = 0;
        let cashRevenue = 0;
        let onlineRevenue = 0;
        let productsSubtotal = 0;
        let deliveryRevenue = 0;
        let freeDeliveryCount = 0;

        let directDiscounts = 0;
        let implicitPriceDiscounts = 0;
        let discountedOrdersCount = 0;

        let periodDebtTotal = 0;
        let totalUnitsSold = 0;
        const itemsSoldMap = {}; // { itemName: { qty: 0, revenue: 0 } }

        finalPeriodOrders.forEach(o => {
            const stat = o.status || 'new';
            const oTotal = Number(o.total) || 0;
            const oSub = Number(o.subtotal) || 0;
            const oDel = Number(o.deliveryFee) || 0;
            const oDisc = Number(o.discount) || 0;
            const oImplicitDisc = calcOrderImplicitPriceDiscount(o);
            const oDebt = Number(o.debt) || 0;

            if (oDebt > 0 && stat !== 'canceled') {
                periodDebtTotal += oDebt;
            }

            if (stat === 'completed') {
                completedCount++;
                totalRevenue += oTotal;
                productsSubtotal += oSub;
                deliveryRevenue += oDel;

                if (o.paymentMethod === 'online') onlineRevenue += oTotal;
                else cashRevenue += oTotal;

                if (oDel === 0 && oTotal > 0) freeDeliveryCount++;

                if (oDisc > 0 || oImplicitDisc > 0) {
                    directDiscounts += oDisc;
                    implicitPriceDiscounts += oImplicitDisc;
                    discountedOrdersCount++;
                }

                if (o.items && Array.isArray(o.items)) {
                    o.items.forEach(item => {
                        const q = Number(item.quantity) || 0;
                        const p = Number(item.price) || 0;
                        const cleanName = item.name || 'صنف';
                        totalUnitsSold += q;
                        if (!itemsSoldMap[cleanName]) itemsSoldMap[cleanName] = { qty: 0, revenue: 0 };
                        itemsSoldMap[cleanName].qty += q;
                        itemsSoldMap[cleanName].revenue += (q * p);
                    });
                }
            } else if (stat === 'canceled') {
                canceledCount++;
            } else {
                activeCount++;
                activeExpectedRev += oTotal;
            }
        });

        const totalAllDiscounts = directDiscounts + implicitPriceDiscounts;
        const avgOrderVal = completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0;

        // هـ) تحديث الكروت الـ 6 في الواجهة
        const setElHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        setElHtml('sm-dash-total-revenue', `${totalRevenue.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-payment-split', `<span>💵 كاش: ${cashRevenue.toLocaleString()} ج</span><span>💳 أونلاين: ${onlineRevenue.toLocaleString()} ج</span>`);

        setElHtml('sm-dash-products-revenue', `${productsSubtotal.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-avg-order', `<span>متوسط الطلب: ${avgOrderVal.toLocaleString()} ج</span><span>📦 ${totalUnitsSold} طبق/وحدة</span>`);

        setElHtml('sm-dash-discounts-total', `${totalAllDiscounts.toLocaleString()} <span class="text-sm font-bold text-red-400">ج</span> <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">في ${discountedOrdersCount} طلب</span>`);
        setElHtml('sm-dash-discounts-breakdown', `<span>خصم مباشر: ${directDiscounts.toLocaleString()} ج</span><span>واجب/فرق سعر: ${implicitPriceDiscounts.toLocaleString()} ج</span>`);

        setElHtml('sm-dash-delivery-revenue', `${deliveryRevenue.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-free-delivery-info', `🎁 طلبات بتوصيل مجاني: ${freeDeliveryCount} طلب`);

        setElHtml('sm-dash-completed-count', `${completedCount} <span class="text-xs font-bold text-slate-400">طلب مكتمل</span>`);
        setElHtml('sm-dash-pipeline-info', `<span class="text-amber-600">⏳ قيد التنفيذ: ${activeCount} (${activeExpectedRev.toLocaleString()} ج)</span><span class="text-slate-400">❌ ملغي: ${canceledCount}</span>`);

        setElHtml('sm-dash-debt-total', `${periodDebtTotal.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);

        // و) رسم كروت مقارنة (الدفعات مقابل الفوري)
        const batchesCont = document.getElementById('sm-dash-batches-breakdown');
        if (batchesCont) {
            const sortedSources = Object.values(sourcesSummary).sort((a, b) => b.revenue - a.revenue);
            if (sortedSources.length === 0) {
                batchesCont.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 text-xs font-bold">لا توجد بيانات دفعات أو طلبات في هذه الفترة.</div>`;
            } else {
                batchesCont.innerHTML = sortedSources.map(src => {
                    const isSelected = window.dashState.sourceFilter === src.filterKey;
                    const borderClass = isSelected ? 'border-2 border-brand-primary bg-emerald-50/40 ring-2 ring-brand-primary/10' : 'border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-teal-400';
                    return `
                    <div onclick="updateDashState('sourceFilter', '${src.filterKey}')" class="p-4 rounded-2xl ${borderClass} cursor-pointer transition-all shadow-sm flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <span class="font-black text-slate-800 text-xs flex items-center gap-1.5">
                                <i class="fa-solid ${src.isBatch ? 'fa-layer-group text-teal-600' : 'fa-bolt text-amber-500'}"></i>
                                ${src.label}
                            </span>
                            <span class="text-sm font-black text-brand-primary">${src.revenue.toLocaleString()} ج</span>
                        </div>
                        <div class="flex flex-wrap justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-slate-200/60">
                            <span class="text-emerald-700">✅ مكتمل: ${src.completedCount}</span>
                            <span class="text-amber-600">⏳ حي: ${src.activeCount}</span>
                            <span class="text-red-600">🎁 خصومات: ${src.discounts.toLocaleString()} ج</span>
                        </div>
                    </div>`;
                }).join('');
            }
        }

        // ز) رسم جرد الأصناف المباعة بالكمية والإيراد
        const itemsGrid = document.getElementById('sm-dash-items-grid');
        if (itemsGrid) {
            const sortedItems = Object.keys(itemsSoldMap).sort((a, b) => itemsSoldMap[b].revenue - itemsSoldMap[a].revenue);
            if (sortedItems.length === 0) {
                itemsGrid.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 text-xs font-bold">لا توجد أصناف مسلمة في هذه الفترة.</div>`;
            } else {
                itemsGrid.innerHTML = sortedItems.map(itemName => {
                    const info = itemsSoldMap[itemName];
                    return `
                    <div class="bg-slate-50 border border-slate-200/70 p-3.5 rounded-2xl text-center shadow-sm flex flex-col justify-between">
                        <span class="text-[11px] font-black text-slate-700 mb-1 leading-snug">${itemName}</span>
                        <div class="my-1">
                            <span class="text-2xl font-black text-brand-primary">${Number(info.qty.toFixed(2))}</span>
                            <span class="text-[10px] font-bold text-slate-400 block">الكمية المباعة</span>
                        </div>
                        <span class="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-lg text-[11px] font-black">
                            ${Math.round(info.revenue).toLocaleString()} ج
                        </span>
                    </div>`;
                }).join('');
            }
        }

        // ح) رسم جدول سجل الطلبات التفصيلي للفترة
        const tbody = document.getElementById('sm-dash-orders-tbody');
        if (tbody) {
            const subFilter = window.dashState.tableSubFilter;
            const q = (window.dashState.tableSearch || '').toLowerCase().trim();

            const tableOrders = finalPeriodOrders.filter(o => {
                if (subFilter === 'completed' && o.status !== 'completed') return false;
                if (subFilter === 'all_active' && !['new', 'processing', 'dispatched', 'deferred', 'no_answer'].includes(o.status)) return false;
                if (subFilter === 'canceled' && o.status !== 'canceled') return false;
                if (subFilter === 'discounted') {
                    const hasDisc = (Number(o.discount) || 0) > 0 || calcOrderImplicitPriceDiscount(o) > 0;
                    if (!hasDisc || o.status === 'canceled') return false;
                }
                if (subFilter === 'debt' && (!o.debt || Number(o.debt) <= 0)) return false;

                if (q) {
                    const itemsTxt = (o.items && Array.isArray(o.items)) ? o.items.map(i => i.name).join(' ') : '';
                    const hay = `${o.customerName || ''} ${o.customerPhone || ''} ${o.zone || ''} ${o.batchName || ''} ${itemsTxt} ${o.adminNote || ''}`.toLowerCase();
                    return hay.includes(q);
                }
                return true;
            });

            if (tableOrders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400 font-bold">لا توجد طلبات مطابقة لهذا الفلتر في الفترة المحددة.</td></tr>`;
            } else {
                tbody.innerHTML = tableOrders.map(o => {
                    const itemsBadges = (o.items && Array.isArray(o.items))
                        ? o.items.map(i => `<span class="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold inline-block m-0.5">${i.quantity}x ${i.name} (${i.price}ج)</span>`).join('')
                        : '-';

                    const directD = Number(o.discount) || 0;
                    const implicitD = calcOrderImplicitPriceDiscount(o);
                    const totalD = directD + implicitD;

                    let discBadge = '<span class="text-slate-300">-</span>';
                    if (totalD > 0) {
                        discBadge = `<span class="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-black text-[11px]">-${totalD} ج</span>`;
                        if (implicitD > 0 && directD > 0) {
                            discBadge += `<span class="block text-[9px] text-red-400 mt-0.5">(${directD} فاتورة + ${implicitD} واجب)</span>`;
                        } else if (implicitD > 0) {
                            discBadge += `<span class="block text-[9px] text-amber-600 mt-0.5">(فرق سعر قديم/واجب)</span>`;
                        }
                    }

                    const batchLabel = (o.batchName && o.batchName !== 'undefined')
                        ? `<span class="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-lg text-[10px] font-black">${o.batchName}</span>`
                        : `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-bold">فوري</span>`;

                    const dObj = parseOrderDateObj(o, window.dashState.dateBasis);
                    const dateFormatted = dObj ? dObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : (o.orderDate || '-');

                    const payBadge = o.paymentMethod === 'online'
                        ? `<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black block mt-0.5">أونلاين</span>`
                        : `<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold block mt-0.5">كاش</span>`;

                    return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="py-3 px-4">
                            <div onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</div>
                            <div class="text-[10px] text-slate-400 font-bold" dir="ltr">${o.customerPhone || ''} • ${o.zone || ''}</div>
                        </td>
                        <td class="py-3 px-4 text-center">${batchLabel}</td>
                        <td class="py-3 px-4 text-center whitespace-normal min-w-[220px]">${itemsBadges}</td>
                        <td class="py-3 px-4 text-center font-bold text-slate-700">${o.subtotal || o.total || 0} ج</td>
                        <td class="py-3 px-4 text-center font-bold text-indigo-600">${o.deliveryFee || 0} ج</td>
                        <td class="py-3 px-4 text-center">${discBadge}</td>
                        <td class="py-3 px-4 text-center">
                            <span class="font-black text-brand-primary text-sm">${o.total || 0} ج</span>
                            ${payBadge}
                        </td>
                        <td class="py-3 px-4 text-center text-[11px] font-bold text-slate-500">${dateFormatted}</td>
                        <td class="py-3 px-4 text-center">
                            <button onclick="openEditOrderModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">فتح</button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }
    };

    // 8. طباعة تقرير الفترة المحددة (الشهر أو الدفعة)
    window.printSmartDashboardReport = function () {
        const periodTitle = document.getElementById('dash-active-period-badge')?.innerText || 'تقرير المبيعات';
        const totalRev = document.getElementById('sm-dash-total-revenue')?.innerText || '0';
        const prodRev = document.getElementById('sm-dash-products-revenue')?.innerText || '0';
        const discTotal = document.getElementById('sm-dash-discounts-total')?.innerText || '0';
        const delRev = document.getElementById('sm-dash-delivery-revenue')?.innerText || '0';
        const compCount = document.getElementById('sm-dash-completed-count')?.innerText || '0';
        const itemsHtml = document.getElementById('sm-dash-items-grid')?.innerHTML || '';
        const tableHtml = document.getElementById('sm-dash-orders-tbody')?.innerHTML || '';

        const win = window.open('', '_blank', 'width=900,height=800');
        if (!win) return alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير!');

        win.document.write(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير سمان ههيا - ${periodTitle}</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; padding: 25px; color: #0f172a; }
                    h2 { text-align: center; margin-bottom: 5px; }
                    p.sub { text-align: center; color: #64748b; font-size: 13px; margin-top: 0; margin-bottom: 20px; }
                    .summary { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                    .box { flex: 1; min-width: 140px; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 10px; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
                    th { background: #f1f5f9; font-weight: 900; }
                    button { display: none !important; }
                </style>
            </head>
            <body>
                <h2>سمان ههيا — التقرير المالي والتحليلي</h2>
                <p class="sub">الفترة: ${periodTitle} | تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
                <div class="summary">
                    <div class="box"><strong>إجمالي التحصيل</strong><br>${totalRev}</div>
                    <div class="box"><strong>صافي المنتجات</strong><br>${prodRev}</div>
                    <div class="box"><strong>إجمالي الخصومات</strong><br>${discTotal}</div>
                    <div class="box"><strong>إيراد التوصيل</strong><br>${delRev}</div>
                    <div class="box"><strong>الطلبات المكتملة</strong><br>${compCount}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>العميل والمنطقة</th>
                            <th>الدفعة</th>
                            <th>الأصناف</th>
                            <th>المنتجات</th>
                            <th>التوصيل</th>
                            <th>الخصم</th>
                            <th>الصافي</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>${tableHtml}</tbody>
                </table>
                <script>window.onload = function(){ window.print(); }<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    // 9. الربط التلقائي الآمن مع دوال النظام الأصلي دون تعديلها
    window.addEventListener('DOMContentLoaded', () => {
        window.initSmartDashboardLayout();
        setTimeout(() => window.renderSmartDashboard(), 400);
    });

    // ربط مع scheduleSystemRender ليتم تحديث اللوحة تلقائياً مع أي طلب جديد أو تعديل في فايربيس
    const _origScheduleSystemRender = window.scheduleSystemRender;
    window.scheduleSystemRender = function () {
        if (typeof _origScheduleSystemRender === 'function') {
            _origScheduleSystemRender();
        }
        window.renderSmartDashboard();
    };

    // ربط مع switchTab لتحديث اللوحة فور الضغط على زر لوحة القيادة
    const _origSwitchTab = window.switchTab;
    if (typeof _origSwitchTab === 'function') {
        window.switchTab = function (tabId, btnElement, isFromBackButton) {
            _origSwitchTab(tabId, btnElement, isFromBackButton);
            if (tabId === 'dashboard') {
                window.renderSmartDashboard();
            }
        };
    }
})();

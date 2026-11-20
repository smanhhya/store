// =========================================================================
// 👨‍🍳 محرك إدارة مطبخ سمان ههيا داخل تطبيق الـ CRM (kitchen-crm.js)
// معزول تماماً عن الطلبات والمخزون والدفعات — يدير kitchen_recipes و kitchen_feedback فقط
// =========================================================================

(function () {
    let kitchenRecipesList = [];
    let kitchenFeedbackList = [];
    let kitchenSubTab = 'recipes';
    let kitchenListenersStarted = false;
    let kitchenShellInjected = false;

    function getKDb() {
        return (typeof db !== 'undefined' && db) ? db : firebase.firestore();
    }

    function getKAuth() {
        return (typeof auth !== 'undefined' && auth) ? auth : firebase.auth();
    }

    function escK(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escKAttr(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;');
    }

    function kNotify(msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
        else if (typeof window.showQuickAppToast === 'function') window.showQuickAppToast(msg);
        else alert(msg);
    }

    function makeKitchenSlug(id, title) {
        const cleanTitle = String(title || '').trim().replace(/\s+/g, '-').replace(/[^\u0600-\u06FFa-zA-Z0-9\-]/g, '');
        return `${String(id || '').toLowerCase()}-${cleanTitle}`.slice(0, 80);
    }

    // تحويل المسارات النسبية لرابط الموقع العام عند المعاينة من داخل تطبيق الـ APK
    function resolveKitchenPreviewImg(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (/^(https?:\/\/|data:)/i.test(s)) return s;
        const clean = s.replace(/^\.?\//, '');
        return `https://smanhhya.github.io/kitchen/${clean}`;
    }

    // =========================================================================
    // 1. بناء هيكل شاشة المطبخ ونافذة التعديل داخل الـ CRM
    // =========================================================================
    function ensureKitchenShell() {
        const viewEl = document.getElementById('view-kitchen');
        if (!viewEl) return false;

        if (!kitchenShellInjected || !document.getElementById('kcrm-recipes-list')) {
            viewEl.innerHTML = `
                <!-- الهيدر العلوي والتبويبات -->
                <div class="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-soft space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-slate-900 via-emerald-950 to-slate-900 text-white px-3.5 py-2.5 rounded-xl">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-base shrink-0 shadow">
                                <i class="fa-solid fa-fire-burner"></i>
                            </span>
                            <div class="min-w-0">
                                <h3 class="text-sm sm:text-base font-black text-white leading-tight truncate">إدارة مطبخ سمان ههيا</h3>
                                <p class="text-[10px] text-emerald-200/85 font-bold">نشر الوصفات، الاعتماد العملي، رفع الصور بالـ ZIP، ومراجعة التقييمات</p>
                            </div>
                        </div>
                        <a href="https://smanhhya.github.io/kitchen/" target="_blank" rel="noopener noreferrer" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-1.5 shrink-0">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> معاينة المطبخ
                        </a>
                    </div>

                    <!-- الإحصائيات اللحظية -->
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 text-center">
                            <span class="block text-[10px] font-bold text-slate-500">الإجمالي</span>
                            <span id="kcrm-stat-total" class="text-lg font-black text-slate-800">0</span>
                        </div>
                        <div class="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200 text-center">
                            <span class="block text-[10px] font-bold text-emerald-700">🟢 منشور</span>
                            <span id="kcrm-stat-pub" class="text-lg font-black text-emerald-800">0</span>
                        </div>
                        <div class="bg-amber-50 rounded-xl p-2.5 border border-amber-200 text-center">
                            <span class="block text-[10px] font-bold text-amber-800">📝 مسودات</span>
                            <span id="kcrm-stat-draft" class="text-lg font-black text-amber-900">0</span>
                        </div>
                        <div class="bg-sky-50 rounded-xl p-2.5 border border-sky-200 text-center">
                            <span class="block text-[10px] font-bold text-sky-700">✅ مجرّبة</span>
                            <span id="kcrm-stat-tested" class="text-lg font-black text-sky-900">0</span>
                        </div>
                        <div class="col-span-2 sm:col-span-1 bg-purple-50 rounded-xl p-2.5 border border-purple-200 text-center">
                            <span class="block text-[10px] font-bold text-purple-700">💬 تقييمات جديدة</span>
                            <span id="kcrm-stat-fb" class="text-lg font-black text-purple-900">0</span>
                        </div>
                    </div>

                    <!-- التبويبات الـ 3 -->
                    <div class="grid grid-cols-3 gap-1.5">
                        <button type="button" id="kcrm-btn-tab-recipes" onclick="window.kcrmSwitchSubTab('recipes')" class="py-2 px-2 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all">📚 الوصفات</button>
                        <button type="button" id="kcrm-btn-tab-feedback" onclick="window.kcrmSwitchSubTab('feedback')" class="py-2 px-2 rounded-xl text-xs font-black bg-slate-100 text-slate-600 transition-all">💬 التقييمات</button>
                        <button type="button" id="kcrm-btn-tab-import" onclick="window.kcrmSwitchSubTab('import')" class="py-2 px-2 rounded-xl text-xs font-black bg-slate-100 text-slate-600 transition-all">📥 الاستيراد والصور</button>
                    </div>
                </div>

                <!-- التبويب 1: الوصفات -->
                <div id="kcrm-tab-recipes" class="space-y-3">
                    <div class="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-soft space-y-2.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="relative flex-1 min-w-[180px]">
                                <i class="fa-solid fa-magnifying-glass absolute right-3 top-2.5 text-slate-400 text-xs"></i>
                                <input type="search" id="kcrm-search" oninput="window.kcrmRenderRecipesList()" placeholder="ابحث باسم الوصفة أو الكود (SHK-001)..." class="w-full pr-8 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black outline-none focus:bg-white focus:border-brand-primary">
                            </div>
                            <button type="button" onclick="window.kcrmOpenEditor(null)" class="bg-brand-primary hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 active:scale-95">
                                <i class="fa-solid fa-plus"></i> وصفة جديدة
                            </button>
                        </div>

                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <select id="kcrm-filter-cat" onchange="window.kcrmRenderRecipesList()" class="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-700 outline-none">
                                <option value="all">كل التصنيفات</option>
                                <option value="وصفات السمان">🥩 وصفات السمان</option>
                                <option value="وصفات بيض السمان">🥚 وصفات بيض السمان</option>
                                <option value="وصفات الرومي">🦃 وصفات الرومي</option>
                                <option value="أطباق جانبية">🍚 أطباق جانبية</option>
                                <option value="صلصات وتغميسات">🥣 صلصات وتغميسات</option>
                            </select>
                            <select id="kcrm-filter-pub" onchange="window.kcrmRenderRecipesList()" class="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-700 outline-none">
                                <option value="all">كل حالات النشر</option>
                                <option value="published">🟢 منشور للعملاء</option>
                                <option value="draft">📝 مسودة مخفية</option>
                            </select>
                            <select id="kcrm-filter-ver" onchange="window.kcrmRenderRecipesList()" class="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-700 outline-none">
                                <option value="all">كل حالات التجربة</option>
                                <option value="practically_tested">✅ مجرّبة عملياً</option>
                                <option value="needs_practical_test">📋 تحتاج تجربة عملية</option>
                            </select>
                        </div>
                    </div>

                    <div id="kcrm-recipes-list" class="grid grid-cols-1 lg:grid-cols-2 gap-3"></div>
                </div>

                <!-- التبويب 2: التقييمات -->
                <div id="kcrm-tab-feedback" class="hidden space-y-3">
                    <div class="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-soft flex flex-wrap items-center justify-between gap-2">
                        <h4 class="text-xs sm:text-sm font-black text-slate-800">مراجعة واعتماد تقييمات العملاء</h4>
                        <select id="kcrm-fb-filter" onchange="window.kcrmRenderFeedbackList()" class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 outline-none">
                            <option value="pending">⏳ بانتظار الاعتماد فقط</option>
                            <option value="all">كل التقييمات</option>
                        </select>
                    </div>
                    <div id="kcrm-feedback-list" class="space-y-2.5"></div>
                </div>

                <!-- التبويب 3: الاستيراد السريع للـ ZIP و JSON والصور -->
                <div id="kcrm-tab-import" class="hidden space-y-4">
                    <div class="bg-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-200 shadow-soft space-y-3.5">
                        <div class="flex items-start gap-3">
                            <span class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg shrink-0">
                                <i class="fa-solid fa-file-zipper"></i>
                            </span>
                            <div>
                                <h4 class="text-sm sm:text-base font-black text-slate-800">رفع واستبدال الصور والوصفات (ZIP / JSON / صور)</h4>
                                <p class="text-[11px] font-bold text-slate-500 mt-0.5 leading-relaxed">
                                    اختر ملف الـ <strong>.zip</strong> مباشرة (أو ملف <strong>.json</strong> أو مجموعة صور مثل SHK-001.jpg) ليرفعها ويربطها تلقائياً ويستبدل الصور القديمة بدون مسح وبدون دخول GitHub.
                                </p>
                            </div>
                        </div>

                        <div class="space-y-2.5 bg-slate-50 p-3.5 rounded-2xl border border-dashed border-slate-300">
                            <div class="flex flex-wrap items-center gap-2.5">
                                <input type="file" id="kcrm-import-file" accept=".json,.zip,application/json,application/zip,image/*" multiple class="flex-1 min-w-[200px] text-xs font-bold text-slate-700">
                                <button type="button" id="kcrm-import-btn" onclick="window.kcrmRunSmartImport()" class="bg-slate-900 hover:bg-brand-primary text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95">
                                    <i class="fa-solid fa-cloud-arrow-up text-amber-400"></i> بدء الاستيراد ورفع الصور
                                </button>
                            </div>

                            <label class="flex items-center gap-2 text-[11px] font-black text-slate-700 cursor-pointer pt-1">
                                <input type="checkbox" id="kcrm-overwrite-images" checked class="w-4 h-4 accent-emerald-700 rounded">
                                <span>🔄 استبدال الصور القديمة تلقائياً بدون مسح يدوي (أزل العلامة لاستكمال الناقص فقط)</span>
                            </label>

                            <div id="kcrm-import-progress-wrap" class="hidden space-y-1 pt-1">
                                <div class="flex justify-between text-[11px] font-black text-slate-800">
                                    <span id="kcrm-import-progress-label">جاري التجهيز...</span>
                                    <span id="kcrm-import-progress-pct" dir="ltr">0%</span>
                                </div>
                                <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div id="kcrm-import-progress-bar" class="h-full bg-emerald-600 rounded-full transition-all duration-300" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <div id="kcrm-import-log" class="hidden text-xs font-bold p-3 rounded-xl border"></div>
                    </div>

                    <!-- مفتاح ImgBB المشترك مع استوديو الصور -->
                    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-soft space-y-2.5">
                        <h4 class="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                            <i class="fa-solid fa-key text-amber-500"></i> مفتاح رفع الصور التلقائي (ImgBB API)
                        </h4>
                        <p class="text-[11px] font-bold text-slate-500">نفس المفتاح المحفوظ في إعدادات المتجر (يُحفظ على موبايلك فقط بأمان).</p>
                        <div class="flex gap-2">
                            <input type="password" id="kcrm-imgbb-key" dir="ltr" placeholder="الصق مفتاح ImgBB API هنا..." class="flex-1 border border-slate-200 rounded-xl p-2 text-xs font-bold bg-slate-50 focus:bg-white outline-none text-left">
                            <button type="button" onclick="window.kcrmSaveImgbbKey()" class="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black">حفظ</button>
                        </div>
                    </div>
                </div>
            `;
            kitchenShellInjected = true;
        }

        // حقن نافذة تعديل الوصفة (باسم ينتهي بـ -modal ليدعمها زر الرجوع تلقائياً)
        if (!document.getElementById('kitchen-edit-modal')) {
            const modalEl = document.createElement('div');
            modalEl.id = 'kitchen-edit-modal';
            modalEl.className = 'fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[130] hidden flex items-center justify-center p-2.5 sm:p-4';
            modalEl.innerHTML = `
                <div class="bg-white rounded-[1.75rem] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
                    <div class="bg-gradient-to-l from-slate-900 via-emerald-950 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
                        <div class="min-w-0">
                            <h3 id="kce-modal-title" class="text-sm sm:text-base font-black truncate">تعديل الوصفة</h3>
                            <span id="kce-modal-id-sub" class="text-[10px] font-bold text-amber-300" dir="ltr"></span>
                        </div>
                        <button type="button" onclick="closeModal('kitchen-edit-modal')" class="w-8 h-8 rounded-xl bg-white/15 hover:bg-red-500 text-white flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scroll bg-slate-50/40">
                        <input type="hidden" id="kce-id">

                        <!-- النشر والاعتماد -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-emerald-50/80 p-3.5 rounded-2xl border border-emerald-200">
                            <div>
                                <label class="block text-[11px] font-black text-slate-800 mb-1">👁️ حالة النشر في المطبخ العام:</label>
                                <select id="kce-publish-status" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                                    <option value="draft">📝 مسودة (مخفية عن العملاء)</option>
                                    <option value="published">🟢 منشورة (ظاهرة للعملاء)</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-[11px] font-black text-slate-800 mb-1">🏅 حالة الاعتماد والتجربة العملية:</label>
                                <select id="kce-verify-status" onchange="window.kcrmTogglePracticalBox()" class="w-full border border-emerald-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                                    <option value="needs_practical_test">📋 مراجعة إرشادياً (تحتاج تجربة عملية)</option>
                                    <option value="practically_tested">✅ مجرّبة ومعتمدة عملياً</option>
                                </select>
                            </div>
                        </div>

                        <!-- توثيق التجربة العملية -->
                        <div id="kce-practical-box" class="hidden bg-sky-50 border-2 border-sky-200 rounded-2xl p-3.5 space-y-2.5">
                            <h4 class="text-xs font-black text-sky-950"><i class="fa-solid fa-clipboard-check text-sky-600 ml-1"></i> توثيق بيانات التجربة العملية الحقيقية</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">اسم المراجع / الشيف *</label>
                                    <input type="text" id="kce-test-reviewer" placeholder="مثال: د. محمد ماضي" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">تاريخ التجربة</label>
                                    <input type="date" id="kce-test-date" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">الحرارة بالترمومتر *</label>
                                    <input type="text" id="kce-test-temp" placeholder="مثال: 75°م في الصدر" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">وزن المنتج الفعلي</label>
                                    <input type="text" id="kce-test-weight" placeholder="مثال: طبق جامبو 380 جم" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">الجهاز والوقت الفعلي</label>
                                    <input type="text" id="kce-test-device" placeholder="مثال: فرن 190°م - 28 د" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-sky-900 mb-1">ملخص النتيجة</label>
                                    <input type="text" id="kce-test-notes" placeholder="طري ومتحمر ممتاز" class="w-full border border-sky-200 rounded-xl p-2 text-xs font-bold bg-white outline-none">
                                </div>
                            </div>
                        </div>

                        <!-- البيانات الأساسية -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-black text-slate-600 mb-1">عنوان الوصفة *</label>
                                <input type="text" id="kce-title" class="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-black outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-600 mb-1">التصنيف</label>
                                <select id="kce-category" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-white outline-none">
                                    <option value="وصفات السمان">وصفات السمان</option>
                                    <option value="وصفات بيض السمان">وصفات بيض السمان</option>
                                    <option value="وصفات الرومي">وصفات الرومي</option>
                                    <option value="أطباق جانبية">أطباق جانبية</option>
                                    <option value="صلصات وتغميسات">صلصات وتغميسات</option>
                                </select>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-xs font-black text-slate-600 mb-1">الأفراد</label>
                                    <input type="number" id="kce-servings" min="1" value="4" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black text-center outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-black text-slate-600 mb-1">الصعوبة</label>
                                    <select id="kce-difficulty" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-white outline-none">
                                        <option value="سهل">سهل</option>
                                        <option value="متوسط">متوسط</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-600 mb-1">وقت التحضير</label>
                                <input type="text" id="kce-prep" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-600 mb-1">وقت الطهي التقديري</label>
                                <input type="text" id="kce-cook" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold outline-none">
                            </div>
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-black text-slate-600 mb-1">نبذة عن الطبق</label>
                                <input type="text" id="kce-intro" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold outline-none">
                            </div>
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-black text-slate-600 mb-1">الأدوات المطلوبة</label>
                                <input type="text" id="kce-equipment" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold outline-none">
                            </div>
                        </div>

                        <!-- صورة الطبق -->
                        <div class="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="text-xs font-black text-amber-950"><i class="fa-regular fa-image text-amber-600 ml-1"></i> صورة الطبق</span>
                                <div class="flex items-center gap-1.5">
                                    <input type="file" id="kce-img-file" accept="image/*" class="hidden" onchange="window.kcrmUploadSingleImage(event)">
                                    <button type="button" id="kce-upload-img-btn" onclick="document.getElementById('kce-img-file').click()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1">
                                        <i class="fa-solid fa-camera"></i> رفع واستبدال صورة
                                    </button>
                                    <button type="button" onclick="window.kcrmCopyPrompt()" class="bg-white border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] font-black">
                                        📋 نسخ البرومبت
                                    </button>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <img id="kce-img-preview" src="" alt="" class="hidden w-16 h-16 rounded-xl object-cover border border-amber-300 shrink-0 bg-white">
                                <input type="text" id="kce-image-url" dir="ltr" oninput="window.kcrmUpdateImgPreview()" placeholder="رابط الصورة المباشر أو ./images/recipes/SHK-001.jpg" class="flex-1 min-w-0 border border-amber-200 rounded-xl p-2 text-xs font-bold bg-white outline-none text-left">
                            </div>
                            <textarea id="kce-image-prompt" rows="2" class="w-full border border-amber-200/80 rounded-xl p-2 text-[11px] font-bold text-slate-600 bg-white/80 outline-none" placeholder="وصف توليد الصورة (image_prompt_ar)..."></textarea>
                        </div>

                        <!-- الربط بأصناف المتجر -->
                        <div class="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
                            <span class="text-xs font-black text-slate-800 block">🛒 أصناف سمان ههيا المرتبطة بهذه الوصفة (اتركه فارغاً للربط الذكي التلقائي):</span>
                            <div id="kce-linked-products" class="flex flex-wrap gap-2"></div>
                        </div>

                        <!-- المقادير والخطوات -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-black text-slate-700 mb-1">المقادير (كل مكوّن في سطر)</label>
                                <textarea id="kce-ingredients" rows="6" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-white outline-none leading-relaxed"></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-700 mb-1">خطوات التحضير (كل خطوة في سطر)</label>
                                <textarea id="kce-steps" rows="6" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-white outline-none leading-relaxed"></textarea>
                            </div>
                        </div>

                        <!-- السلامة والتقديم والحفظ -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-black text-rose-700 mb-1">🌡️ علامات النضج وسلامة الغذاء</label>
                                <textarea id="kce-safety" rows="3" class="w-full border border-rose-200 bg-rose-50/30 rounded-xl p-2 text-xs font-bold outline-none"></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-black text-amber-800 mb-1">⚠️ الأخطاء الشائعة</label>
                                <textarea id="kce-mistakes" rows="3" class="w-full border border-amber-200 bg-amber-50/30 rounded-xl p-2 text-xs font-bold outline-none"></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-600 mb-1">🍽️ اقتراحات التقديم</label>
                                <textarea id="kce-serving" rows="2" class="w-full border border-slate-200 bg-white rounded-xl p-2 text-xs font-bold outline-none"></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-600 mb-1">❄️ الحفظ والتخزين</label>
                                <textarea id="kce-storage" rows="2" class="w-full border border-slate-200 bg-white rounded-xl p-2 text-xs font-bold outline-none"></textarea>
                            </div>
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-black text-purple-800 mb-1">مسببات الحساسية المحتملة</label>
                                <input type="text" id="kce-allergens" class="w-full border border-purple-200 bg-white rounded-xl p-2 text-xs font-bold outline-none">
                            </div>
                        </div>

                        <!-- سجل التعديلات -->
                        <div id="kce-audit-wrap" class="hidden bg-white border border-slate-200 rounded-2xl p-3 space-y-1">
                            <span class="text-[11px] font-black text-slate-500 block">🕒 سجل التعديلات:</span>
                            <div id="kce-audit-log" class="space-y-1 text-[10px] font-bold text-slate-500 max-h-24 overflow-y-auto"></div>
                        </div>
                    </div>

                    <div class="p-3.5 sm:px-5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <button type="button" id="kce-delete-btn" onclick="window.kcrmDeleteCurrentRecipe()" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 px-3.5 py-2 rounded-xl text-xs font-black transition-colors">
                            <i class="fa-solid fa-trash ml-1"></i> حذف
                        </button>
                        <div class="flex items-center gap-2 mr-auto">
                            <button type="button" onclick="closeModal('kitchen-edit-modal')" class="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-xs font-black">إلغاء</button>
                            <button type="button" id="kce-save-btn" onclick="window.kcrmSaveRecipe()" class="bg-brand-primary hover:bg-emerald-800 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5">
                                <i class="fa-solid fa-floppy-disk text-amber-300"></i> حفظ التعديلات
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
        }

        const keyInp = document.getElementById('kcrm-imgbb-key');
        if (keyInp && !keyInp.value) {
            try { keyInp.value = localStorage.getItem('sman_imgbb_api_key') || ''; } catch (e) {}
        }

        return true;
    }

    // =========================================================================
    // 2. الاستماع اللحظي لقواعد بيانات المطبخ (onSnapshot لا يتأثر ببطء النت)
    // =========================================================================
    function startKitchenListeners() {
        if (kitchenListenersStarted) return;
        const kDb = getKDb();
        if (!kDb) return;
        kitchenListenersStarted = true;

        kDb.collection('kitchen_recipes').onSnapshot((snap) => {
            const arr = [];
            snap.forEach((doc) => {
                const d = doc.data() || {};
                arr.push({ ...d, id: d.id || doc.id });
            });
            arr.sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
            kitchenRecipesList = arr;
            updateKitchenStatsUI();
            if (window.smanCurrentActiveTab === 'kitchen') {
                window.kcrmRenderRecipesList();
            }
        }, (err) => console.log('Kitchen recipes snapshot info:', err));

        kDb.collection('kitchen_feedback').onSnapshot((snap) => {
            const arr = [];
            snap.forEach((doc) => arr.push({ id: doc.id, ...(doc.data() || {}) }));
            arr.sort((a, b) => {
                if (Boolean(a.isApproved) !== Boolean(b.isApproved)) return a.isApproved ? 1 : -1;
                const ta = (a.createdAt && typeof a.createdAt.toMillis === 'function') ? a.createdAt.toMillis() : 0;
                const tb = (b.createdAt && typeof b.createdAt.toMillis === 'function') ? b.createdAt.toMillis() : 0;
                return tb - ta;
            });
            kitchenFeedbackList = arr;
            updateKitchenStatsUI();
            if (window.smanCurrentActiveTab === 'kitchen') {
                window.kcrmRenderFeedbackList();
            }
        }, (err) => console.log('Kitchen feedback snapshot info:', err));
    }

    function updateKitchenStatsUI() {
        const total = kitchenRecipesList.length;
        const pub = kitchenRecipesList.filter((r) => r.publishStatus === 'published').length;
        const draft = total - pub;
        const tested = kitchenRecipesList.filter((r) => r.verificationStatus === 'practically_tested').length;
        const pendingFb = kitchenFeedbackList.filter((f) => !f.isApproved).length;

        const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setT('kcrm-stat-total', total);
        setT('kcrm-stat-pub', pub);
        setT('kcrm-stat-draft', draft);
        setT('kcrm-stat-tested', tested);
        setT('kcrm-stat-fb', pendingFb);

        const sbBadge = document.getElementById('sidebar-kitchen-fb-badge');
        if (sbBadge) {
            if (pendingFb > 0) {
                sbBadge.textContent = pendingFb;
                sbBadge.classList.remove('hidden');
            } else {
                sbBadge.classList.add('hidden');
            }
        }
    }

    // الدالة الرئيسية التي تُستدعى عند فتح تبويب المطبخ في الـ CRM
    window.renderKitchenCRMUI = function () {
        if (!ensureKitchenShell()) return;
        startKitchenListeners();
        updateKitchenStatsUI();
        window.kcrmSwitchSubTab(kitchenSubTab || 'recipes');
        window.kcrmRenderRecipesList();
        window.kcrmRenderFeedbackList();
    };

    window.kcrmSwitchSubTab = function (tabKey) {
        kitchenSubTab = tabKey || 'recipes';
        ['recipes', 'feedback', 'import'].forEach((k) => {
            document.getElementById(`kcrm-tab-${k}`)?.classList.toggle('hidden', k !== kitchenSubTab);
            const btn = document.getElementById(`kcrm-btn-tab-${k}`);
            if (btn) {
                btn.className = (k === kitchenSubTab)
                    ? 'py-2 px-2 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all'
                    : 'py-2 px-2 rounded-xl text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all';
            }
        });
    };

    // =========================================================================
    // 3. قائمة الوصفات والتبديل السريع للنشر/المسودة
    // =========================================================================
    window.kcrmRenderRecipesList = function () {
        const cont = document.getElementById('kcrm-recipes-list');
        if (!cont) return;

        const q = String(document.getElementById('kcrm-search')?.value || '').trim().toLowerCase();
        const fCat = document.getElementById('kcrm-filter-cat')?.value || 'all';
        const fPub = document.getElementById('kcrm-filter-pub')?.value || 'all';
        const fVer = document.getElementById('kcrm-filter-ver')?.value || 'all';

        const filtered = kitchenRecipesList.filter((r) => {
            if (fCat !== 'all' && r.category !== fCat) return false;
            const pub = r.publishStatus === 'published' ? 'published' : 'draft';
            if (fPub !== 'all' && pub !== fPub) return false;
            const ver = r.verificationStatus === 'practically_tested' ? 'practically_tested' : 'needs_practical_test';
            if (fVer !== 'all' && ver !== fVer) return false;
            if (q && !`${r.id} ${r.title} ${r.category}`.toLowerCase().includes(q)) return false;
            return true;
        });

        if (filtered.length === 0) {
            cont.innerHTML = `<div class="col-span-full bg-white rounded-2xl p-8 text-center border-2 border-dashed border-slate-200 space-y-2.5">
                <p class="text-sm font-black text-slate-500">${kitchenRecipesList.length === 0 ? 'لا توجد وصفات في المطبخ بعد.' : 'لا توجد وصفات تطابق هذا البحث.'}</p>
                ${kitchenRecipesList.length === 0 ? `<button type="button" onclick="window.kcrmSwitchSubTab('import')" class="bg-brand-primary text-white px-4 py-2 rounded-xl text-xs font-black">استيراد الـ 50 وصفة والصور الآن 📥</button>` : ''}
            </div>`;
            return;
        }

        cont.innerHTML = filtered.map((r) => {
            const isPub = r.publishStatus === 'published';
            const isTested = r.verificationStatus === 'practically_tested';
            const previewUrl = resolveKitchenPreviewImg(r.image_url);
            const hasImg = Boolean(previewUrl);
            const safeId = escKAttr(r.id);

            return `
            <div class="bg-white rounded-2xl p-3 border-2 ${isPub ? 'border-emerald-200' : 'border-slate-200/80'} shadow-sm flex flex-col justify-between gap-2.5">
                <div class="flex items-start gap-3">
                    <div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 ${hasImg ? 'bg-slate-100' : 'bg-emerald-950'} flex items-center justify-center text-amber-300 text-[10px] font-black">
                        ${hasImg
                            ? `<img src="${escK(previewUrl)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.style.display='none'">`
                            : `<span dir="ltr">${escK(r.id)}</span>`}
                    </div>
                    <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="text-[10px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded" dir="ltr">${escK(r.id)}</span>
                            <span class="text-[10px] font-black ${isPub ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'} px-2 py-0.5 rounded-md">${isPub ? '🟢 منشورة' : '📝 مسودة'}</span>
                            <span class="text-[10px] font-black ${isTested ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded-md">${isTested ? '✅ مجرّبة' : '📋 إرشادية'}</span>
                        </div>
                        <h4 class="text-xs sm:text-sm font-black text-slate-800 truncate">${escK(r.title)}</h4>
                        <p class="text-[10px] font-bold text-slate-500">${escK(r.category)} • ${hasImg ? '🖼️ بها صورة' : '⚠️ بدون صورة'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button type="button" onclick="window.kcrmQuickTogglePublish('${safeId}')" class="flex-1 py-2 px-2.5 rounded-xl text-[11px] font-black transition-all ${isPub ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}">
                        ${isPub ? '⏸️ تحويل لمسودة' : '🚀 نشر للعملاء'}
                    </button>
                    <button type="button" onclick="window.kcrmOpenEditor('${safeId}')" class="bg-slate-900 hover:bg-brand-primary text-white py-2 px-3.5 rounded-xl text-[11px] font-black">
                        <i class="fa-solid fa-pen text-amber-400 ml-1"></i> تعديل وصورة
                    </button>
                </div>
            </div>`;
        }).join('');
    };

    window.kcrmQuickTogglePublish = async function (recipeId) {
        const rec = kitchenRecipesList.find((r) => r.id === recipeId);
        if (!rec) return;

        const nextStatus = rec.publishStatus === 'published' ? 'draft' : 'published';
        const audit = Array.isArray(rec.auditLog) ? [...rec.auditLog] : [];
        audit.unshift({
            at: new Date().toLocaleString('ar-EG'),
            by: getKAuth()?.currentUser?.email || 'Admin',
            action: nextStatus === 'published' ? 'نشر الوصفة في المطبخ العام' : 'إخفاء الوصفة وتحويلها لمسودة'
        });

        rec.publishStatus = nextStatus;
        rec.auditLog = audit.slice(0, 25);
        updateKitchenStatsUI();
        window.kcrmRenderRecipesList();

        try {
            await getKDb().collection('kitchen_recipes').doc(recipeId).update({
                publishStatus: nextStatus,
                auditLog: rec.auditLog,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            kNotify(nextStatus === 'published' ? `🚀 تم نشر (${rec.title}) في مطبخ العملاء!` : `📝 تم إخفاء (${rec.title}) كمسودة`);
        } catch (e) {
            kNotify('⚠️ تعذر حفظ التغيير — تأكد من الاتصال');
        }
    };

    // =========================================================================
    // 4. محرر الوصفة + الاعتماد العملي + رفع صورة فردية
    // =========================================================================
    window.kcrmTogglePracticalBox = function () {
        const val = document.getElementById('kce-verify-status')?.value;
        document.getElementById('kce-practical-box')?.classList.toggle('hidden', val !== 'practically_tested');
    };

    window.kcrmUpdateImgPreview = function () {
        const raw = String(document.getElementById('kce-image-url')?.value || '').trim();
        const url = resolveKitchenPreviewImg(raw);
        const img = document.getElementById('kce-img-preview');
        if (!img) return;
        if (url) {
            img.src = url;
            img.classList.remove('hidden');
        } else {
            img.classList.add('hidden');
        }
    };

    window.kcrmCopyPrompt = function () {
        const txt = String(document.getElementById('kce-image-prompt')?.value || '').trim();
        if (!txt) return;
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => kNotify('📋 تم نسخ برومبت الصورة')).catch(() => {});
    };

    window.kcrmOpenEditor = function (recipeId) {
        ensureKitchenShell();
        const rec = recipeId ? kitchenRecipesList.find((r) => r.id === recipeId) : null;
        const isNew = !rec;
        const defaultId = isNew ? `SHK-${String(kitchenRecipesList.length + 1).padStart(3, '0')}` : rec.id;

        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v !== undefined && v !== null ? v : ''; };
        setV('kce-id', isNew ? '' : rec.id);
        document.getElementById('kce-modal-title').textContent = isNew ? 'إضافة وصفة جديدة' : `تعديل: ${rec.title}`;
        document.getElementById('kce-modal-id-sub').textContent = defaultId;
        document.getElementById('kce-delete-btn')?.classList.toggle('hidden', isNew);

        setV('kce-publish-status', rec?.publishStatus || 'draft');
        setV('kce-verify-status', rec?.verificationStatus || 'needs_practical_test');
        setV('kce-title', rec?.title || '');
        setV('kce-category', rec?.category || 'وصفات السمان');
        setV('kce-servings', rec?.servings || 4);
        setV('kce-difficulty', rec?.difficulty || 'سهل');
        setV('kce-prep', rec?.prep_minutes || '');
        setV('kce-cook', rec?.cook_minutes_estimate || '');
        setV('kce-intro', rec?.intro || '');
        setV('kce-equipment', rec?.equipment || '');
        setV('kce-image-url', rec?.image_url || '');
        setV('kce-image-prompt', rec?.image_prompt_ar || '');
        setV('kce-ingredients', Array.isArray(rec?.ingredients) ? rec.ingredients.join('\n') : '');
        setV('kce-steps', Array.isArray(rec?.steps) ? rec.steps.join('\n') : '');
        setV('kce-safety', rec?.doneness_and_safety || '');
        setV('kce-mistakes', rec?.common_mistakes || '');
        setV('kce-serving', rec?.serving_suggestions || '');
        setV('kce-storage', rec?.storage || '');
        setV('kce-allergens', rec?.allergens || '');

        const pLog = rec?.practicalTestLog || {};
        setV('kce-test-reviewer', pLog.reviewer || '');
        setV('kce-test-date', pLog.testedAt || new Date().toISOString().split('T')[0]);
        setV('kce-test-temp', pLog.measuredTemp || '');
        setV('kce-test-weight', pLog.productWeight || '');
        setV('kce-test-device', pLog.deviceUsed || '');
        setV('kce-test-notes', pLog.resultNotes || '');

        window.kcrmTogglePracticalBox();
        window.kcrmUpdateImgPreview();

        // الربط المباشر بأصناف المتجر الحية في الـ CRM
        const linkedWrap = document.getElementById('kce-linked-products');
        const selectedProds = Array.isArray(rec?.recommendedProductIds) ? rec.recommendedProductIds : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        if (linkedWrap) {
            const pKeys = Object.keys(prodsObj).filter((k) => prodsObj[k] && !prodsObj[k].isHidden);
            linkedWrap.innerHTML = pKeys.map((pid) => {
                const p = prodsObj[pid];
                const chk = selectedProds.includes(pid) ? 'checked' : '';
                return `
                    <label class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer">
                        <input type="checkbox" class="kce-prod-chk w-3.5 h-3.5 accent-emerald-700" value="${escK(pid)}" ${chk}>
                        <span>${escK(p.name)}</span>
                    </label>`;
            }).join('') || '<span class="text-[11px] font-bold text-slate-400">سيتم الربط التلقائي بأصناف المتجر.</span>';
        }

        const auditWrap = document.getElementById('kce-audit-wrap');
        const auditBox = document.getElementById('kce-audit-log');
        if (auditWrap && auditBox) {
            const logs = Array.isArray(rec?.auditLog) ? rec.auditLog : [];
            if (logs.length > 0) {
                auditBox.innerHTML = logs.map((l) => `<div>• <strong>${escK(l.action)}</strong> — ${escK(l.by)} (${escK(l.at)})</div>`).join('');
                auditWrap.classList.remove('hidden');
            } else {
                auditWrap.classList.add('hidden');
            }
        }

        if (typeof openModal === 'function') openModal('kitchen-edit-modal');
        else document.getElementById('kitchen-edit-modal')?.classList.remove('hidden');
    };

    window.kcrmSaveRecipe = async function () {
        const existingId = String(document.getElementById('kce-id')?.value || '').trim();
        const title = String(document.getElementById('kce-title')?.value || '').trim();
        if (!title) return alert('يرجى كتابة عنوان الوصفة.');

        const verStatus = document.getElementById('kce-verify-status')?.value || 'needs_practical_test';
        let practicalTestLog = null;

        if (verStatus === 'practically_tested') {
            const reviewer = String(document.getElementById('kce-test-reviewer')?.value || '').trim();
            const measuredTemp = String(document.getElementById('kce-test-temp')?.value || '').trim();
            if (!reviewer || !measuredTemp) {
                return alert('التزاماً بمعيار اعتماد سمان ههيا: يرجى كتابة اسم المراجع والحرارة المقاسة بالترمومتر قبل تفعيل شارة «مجرّبة عملياً».');
            }
            practicalTestLog = {
                reviewer,
                testedAt: document.getElementById('kce-test-date')?.value || '',
                measuredTemp,
                productWeight: String(document.getElementById('kce-test-weight')?.value || '').trim(),
                deviceUsed: String(document.getElementById('kce-test-device')?.value || '').trim(),
                resultNotes: String(document.getElementById('kce-test-notes')?.value || '').trim()
            };
        }

        const btn = document.getElementById('kce-save-btn');
        if (btn) btn.disabled = true;

        try {
            const oldRec = existingId ? kitchenRecipesList.find((r) => r.id === existingId) : null;
            const docId = existingId || `SHK-${String(kitchenRecipesList.length + 1).padStart(3, '0')}-${Date.now().toString().slice(-3)}`;

            const selectedProds = [...document.querySelectorAll('.kce-prod-chk:checked')].map((el) => el.value);
            const ingredients = String(document.getElementById('kce-ingredients')?.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
            const steps = String(document.getElementById('kce-steps')?.value || '').split('\n').map((s) => s.trim()).filter(Boolean);

            const auditLog = Array.isArray(oldRec?.auditLog) ? [...oldRec.auditLog] : [];
            auditLog.unshift({
                at: new Date().toLocaleString('ar-EG'),
                by: getKAuth()?.currentUser?.email || 'Admin',
                action: existingId ? 'تحديث الوصفة من الـ CRM' : 'إنشاء وصفة جديدة من الـ CRM'
            });

            const payload = {
                id: docId,
                number: oldRec ? (Number(oldRec.number) || 999) : (kitchenRecipesList.length + 1),
                slug: oldRec?.slug || makeKitchenSlug(docId, title),
                title,
                category: document.getElementById('kce-category')?.value || 'وصفات السمان',
                servings: Math.max(1, parseInt(document.getElementById('kce-servings')?.value, 10) || 4),
                difficulty: document.getElementById('kce-difficulty')?.value || 'سهل',
                prep_minutes: String(document.getElementById('kce-prep')?.value || '').trim(),
                cook_minutes_estimate: String(document.getElementById('kce-cook')?.value || '').trim(),
                intro: String(document.getElementById('kce-intro')?.value || '').trim(),
                equipment: String(document.getElementById('kce-equipment')?.value || '').trim(),
                image_url: String(document.getElementById('kce-image-url')?.value || '').trim(),
                image_prompt_ar: String(document.getElementById('kce-image-prompt')?.value || '').trim(),
                image_alt_ar: `طبق ${title} مقدم للتناول`,
                recommendedProductIds: selectedProds,
                ingredients,
                steps,
                doneness_and_safety: String(document.getElementById('kce-safety')?.value || '').trim(),
                common_mistakes: String(document.getElementById('kce-mistakes')?.value || '').trim(),
                serving_suggestions: String(document.getElementById('kce-serving')?.value || '').trim(),
                storage: String(document.getElementById('kce-storage')?.value || '').trim(),
                allergens: String(document.getElementById('kce-allergens')?.value || '').trim(),
                publishStatus: document.getElementById('kce-publish-status')?.value || 'draft',
                verificationStatus: verStatus,
                practicalTestLog,
                editorial_status: verStatus === 'practically_tested'
                    ? 'وصفة مجرّبة ومعتمدة عملياً في مطبخ سمان ههيا.'
                    : 'محتوى أولي مُراجع إرشادياً؛ يحتاج تجربة عملية قبل وصفه بأنه مجرّب.',
                nutrition: oldRec?.nutrition || {
                    status: 'غير محسوبة بعد',
                    note: 'لا تُنشر أرقام غذائية قبل حسابها من المقادير الفعلية وقاعدة بيانات موثوقة.'
                },
                ratingAvg: Number(oldRec?.ratingAvg) || 0,
                ratingCount: Number(oldRec?.ratingCount) || 0,
                auditLog: auditLog.slice(0, 25),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await getKDb().collection('kitchen_recipes').doc(docId).set(payload, { merge: true });
            if (typeof closeModal === 'function') closeModal('kitchen-edit-modal');
            else document.getElementById('kitchen-edit-modal')?.classList.add('hidden');
            kNotify(`✅ تم حفظ وصفة (${title}) بنجاح!`);
        } catch (err) {
            alert('تعذر حفظ الوصفة: ' + err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    window.kcrmDeleteCurrentRecipe = async function () {
        const docId = String(document.getElementById('kce-id')?.value || '').trim();
        if (!docId) return;
        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(`هل أنت متأكد من حذف الوصفة (${docId}) نهائياً؟`, { title: 'حذف وصفة', tone: 'danger', confirmText: 'نعم، احذف' })
            : confirm(`هل أنت متأكد من حذف الوصفة (${docId}) نهائياً؟`);
        if (!ok) return;

        try {
            await getKDb().collection('kitchen_recipes').doc(docId).delete();
            if (typeof closeModal === 'function') closeModal('kitchen-edit-modal');
            else document.getElementById('kitchen-edit-modal')?.classList.add('hidden');
            kNotify('🗑️ تم حذف الوصفة نهائياً');
        } catch (e) {
            alert('تعذر حذف الوصفة!');
        }
    };

    // =========================================================================
    // 5. أدوات ضغط ورفع الصور (ImgBB) + استيراد ZIP / JSON / صور متعددة بدون مسح
    // =========================================================================
    function getSavedImgbbKey() {
        const inpVal = String(document.getElementById('kcrm-imgbb-key')?.value || '').trim();
        if (inpVal) {
            try { localStorage.setItem('sman_imgbb_api_key', inpVal); } catch (e) {}
            return inpVal;
        }
        try { return (localStorage.getItem('sman_imgbb_api_key') || '').trim(); } catch (e) { return ''; }
    }

    window.kcrmSaveImgbbKey = function () {
        const val = String(document.getElementById('kcrm-imgbb-key')?.value || '').trim();
        try {
            if (val) localStorage.setItem('sman_imgbb_api_key', val);
            else localStorage.removeItem('sman_imgbb_api_key');
        } catch (e) {}
        kNotify('🔑 تم حفظ مفتاح ImgBB على جهازك بأمان');
    };

    function compressBlobToJpegBase64(blob) {
        return new Promise((resolve, reject) => {
            const objUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                reject(new Error('ملف صورة غير صالح'));
            };
            img.onload = () => {
                try {
                    const cnv = document.createElement('canvas');
                    const maxD = 960;
                    const sc = Math.min(1, maxD / Math.max(img.width || 1, img.height || 1));
                    cnv.width = Math.max(1, Math.round(img.width * sc));
                    cnv.height = Math.max(1, Math.round(img.height * sc));
                    cnv.getContext('2d').drawImage(img, 0, 0, cnv.width, cnv.height);
                    const b64 = cnv.toDataURL('image/jpeg', 0.82).split(',')[1];
                    URL.revokeObjectURL(objUrl);
                    resolve(b64);
                } catch (err) {
                    URL.revokeObjectURL(objUrl);
                    reject(err);
                }
            };
            img.src = objUrl;
        });
    }

    async function uploadBase64ImgBB(base64Str, apiKey) {
        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const fd = new FormData();
                fd.append('image', base64Str);
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
                    method: 'POST',
                    body: fd
                });
                const json = await res.json();
                if (!res.ok || !json?.success || !json?.data) {
                    throw new Error(json?.error?.message || 'رفض سيرفر ImgBB رفع الصورة');
                }
                return json.data.display_url || json.data.url;
            } catch (err) {
                lastErr = err;
                if (attempt === 1) await new Promise((r) => setTimeout(r, 900));
            }
        }
        throw lastErr || new Error('تعذر رفع الصورة');
    }

    window.kcrmUploadSingleImage = async function (event) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const apiKey = getSavedImgbbKey();
        if (!apiKey) {
            alert('🔑 ضع مفتاح ImgBB API أولاً في تبويب (الاستيراد والصور) أو في إعدادات المتجر.');
            event.target.value = '';
            return;
        }

        const btn = document.getElementById('kce-upload-img-btn');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الرفع...';
        }

        try {
            const b64 = await compressBlobToJpegBase64(file);
            const url = await uploadBase64ImgBB(b64, apiKey);
            document.getElementById('kce-image-url').value = url;
            window.kcrmUpdateImgPreview();
            kNotify('✅ تم رفع الصورة واستبدالها! اضغط (حفظ التعديلات)');
        } catch (err) {
            alert('خطأ في رفع الصورة: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            event.target.value = '';
        }
    };

    window.kcrmRunSmartImport = async function () {
        const fileInp = document.getElementById('kcrm-import-file');
        const logEl = document.getElementById('kcrm-import-log');
        const btn = document.getElementById('kcrm-import-btn');
        const progWrap = document.getElementById('kcrm-import-progress-wrap');
        const progBar = document.getElementById('kcrm-import-progress-bar');
        const progLbl = document.getElementById('kcrm-import-progress-label');
        const progPct = document.getElementById('kcrm-import-progress-pct');
        const overwriteImages = document.getElementById('kcrm-overwrite-images')?.checked !== false;
        const files = Array.from(fileInp?.files || []);

        if (files.length === 0) {
            return kNotify('اختر ملف ZIP أو JSON أو صور الوصفات أولاً');
        }

        const kDb = getKDb();
        const actor = getKAuth()?.currentUser?.email || 'Admin';
        const nowStr = new Date().toLocaleString('ar-EG');

        function setProg(done, total, lbl) {
            if (!progWrap) return;
            progWrap.classList.remove('hidden');
            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
            if (progBar) progBar.style.width = `${pct}%`;
            if (progPct) progPct.textContent = `${pct}%`;
            if (progLbl) progLbl.textContent = lbl || '';
        }

        function normRelImg(raw) {
            const s = String(raw || '').trim();
            if (!s) return '';
            if (/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(s)) return s;
            return './' + s;
        }

        async function saveJsonToFirestore(jsonObj, skipRelImages) {
            const recipesArr = Array.isArray(jsonObj?.recipes) ? jsonObj.recipes : [];
            const guidesArr = Array.isArray(jsonObj?.knowledge_cards) ? jsonObj.knowledge_cards : [];
            const existingMap = new Map(kitchenRecipesList.map((r) => [r.id, r]));
            const batch = kDb.batch();
            let added = 0, linked = 0, skipped = 0;

            recipesArr.forEach((rec, idx) => {
                const docId = String(rec.id || `SHK-${String(idx + 1).padStart(3, '0')}`).trim();
                const resolvedImg = skipRelImages ? '' : normRelImg(rec.image_url || rec.image_path || '');
                const existing = existingMap.get(docId);

                if (existing) {
                    const hasCur = Boolean(existing.image_url && String(existing.image_url).trim());
                    if (!skipRelImages && resolvedImg && (!hasCur || overwriteImages)) {
                        const audit = Array.isArray(existing.auditLog) ? [...existing.auditLog] : [];
                        audit.unshift({ at: nowStr, by: actor, action: 'ربط مسار الصورة من JSON' });
                        batch.set(kDb.collection('kitchen_recipes').doc(docId), {
                            image_url: resolvedImg,
                            image_status: rec.image_status || existing.image_status || '',
                            auditLog: audit.slice(0, 25),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        linked++;
                    } else {
                        skipped++;
                    }
                    return;
                }

                const payload = {
                    ...rec,
                    id: docId,
                    number: Number(rec.number) || (idx + 1),
                    slug: makeKitchenSlug(docId, rec.title),
                    image_url: resolvedImg,
                    image_status: rec.image_status || '',
                    recommendedProductIds: Array.isArray(rec.recommendedProductIds) ? rec.recommendedProductIds : [],
                    publishStatus: 'draft',
                    verificationStatus: 'needs_practical_test',
                    practicalTestLog: null,
                    ratingAvg: 0,
                    ratingCount: 0,
                    auditLog: [{ at: nowStr, by: actor, action: 'استيراد تأسيسي من الـ CRM (مسودة)' }],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(kDb.collection('kitchen_recipes').doc(docId), payload);
                existingMap.set(docId, payload);
                kitchenRecipesList.push(payload);
                added++;
            });

            const guideIcons = ['fa-hand-sparkles', 'fa-snowflake', 'fa-temperature-high', 'fa-box-open', 'fa-certificate'];
            guidesArr.forEach((g, idx) => {
                const gId = `guide_${String(idx + 1).padStart(2, '0')}`;
                batch.set(kDb.collection('kitchen_guides').doc(gId), {
                    order: idx + 1,
                    icon: guideIcons[idx] || 'fa-shield-halved',
                    title: g.title || '',
                    content: g.content || ''
                }, { merge: true });
            });

            if (added > 0 || linked > 0 || guidesArr.length > 0) {
                await batch.commit();
            }
            return { added, linked, skipped, guides: guidesArr.length };
        }

        if (btn) btn.disabled = true;
        if (progWrap) progWrap.classList.add('hidden');
        if (logEl) {
            logEl.className = 'text-xs font-bold p-3 rounded-xl border bg-slate-50 border-slate-200 text-slate-700';
            logEl.textContent = '⏳ جاري فحص الملفات المختارة...';
            logEl.classList.remove('hidden');
        }

        try {
            const firstFile = files[0];
            const firstLow = String(firstFile.name || '').toLowerCase();
            const isZip = files.length === 1 && firstLow.endsWith('.zip');
            const isJson = files.length === 1 && firstLow.endsWith('.json');
            const imageItems = [];
            let jsonSummary = null;

            if (isJson) {
                const parsed = JSON.parse(await firstFile.text());
                if (!Array.isArray(parsed?.recipes) || parsed.recipes.length === 0) {
                    throw new Error('لم يتم العثور على مصفوفة recipes داخل ملف JSON.');
                }
                jsonSummary = await saveJsonToFirestore(parsed, false);
                if (logEl) {
                    logEl.className = 'text-xs font-black p-3.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900';
                    logEl.innerHTML = `✅ اكتمل استيراد ملف JSON!<br>• وصفات جديدة (كمسودات): ${jsonSummary.added}<br>• روابط صور محدثة: ${jsonSummary.linked}<br>• وصفات لم تُمس: ${jsonSummary.skipped}<br>• بطاقات السلامة: ${jsonSummary.guides}`;
                }
                kNotify('🎉 تم استيراد ملف JSON بنجاح!');
                return;
            }

            const apiKey = getSavedImgbbKey();
            if (!apiKey) {
                throw new Error('🔑 لرفع الصور مباشرة بدون GitHub: الصق مفتاح ImgBB API في الخانة بالأسفل أولاً ثم اضغط الزر مجدداً.');
            }

            if (isZip) {
                if (typeof window.JSZip === 'undefined') {
                    throw new Error('مكتبة JSZip لم تُحمّل — تأكد من الإنترنت وأعد فتح التطبيق.');
                }
                if (logEl) logEl.textContent = '📦 جاري فك ضغط ملف الـ ZIP داخل الموبايل...';
                const zip = await window.JSZip.loadAsync(firstFile);

                let jsonEntry = null;
                zip.forEach((relPath, entry) => {
                    if (!entry.dir && relPath.toLowerCase().endsWith('.json')) {
                        jsonEntry = entry;
                    }
                    if (!entry.dir && /\.(jpg|jpeg|png|webp)$/i.test(relPath)) {
                        const base = relPath.split('/').pop() || '';
                        const m = base.match(/(SHK-\d{3})/i);
                        if (m) {
                            imageItems.push({
                                docId: m[1].toUpperCase(),
                                fileName: base,
                                getBlob: () => entry.async('blob')
                            });
                        }
                    }
                });

                if (jsonEntry) {
                    const parsedJson = JSON.parse(await jsonEntry.async('string'));
                    if (Array.isArray(parsedJson?.recipes) && parsedJson.recipes.length > 0) {
                        jsonSummary = await saveJsonToFirestore(parsedJson, true);
                    }
                }
            } else {
                files.forEach((f) => {
                    const m = String(f.name || '').match(/(SHK-\d{3})/i);
                    if (m) {
                        imageItems.push({
                            docId: m[1].toUpperCase(),
                            fileName: f.name,
                            getBlob: () => Promise.resolve(f)
                        });
                    }
                });
            }

            if (imageItems.length === 0) {
                throw new Error('لم يتم العثور على صور تحمل أكواد الوصفات (مثل SHK-001.jpg إلى SHK-050.jpg).');
            }

            imageItems.sort((a, b) => a.docId.localeCompare(b.docId));
            const existingMap = new Map(kitchenRecipesList.map((r) => [r.id, r]));
            let uploaded = 0, skippedExisting = 0, failed = 0, unmatched = 0;

            for (let i = 0; i < imageItems.length; i++) {
                const item = imageItems[i];
                const rec = existingMap.get(item.docId);
                setProg(i + 1, imageItems.length, `⏳ معالجة ورفع (${item.docId}) — ${i + 1} من ${imageItems.length}`);

                if (!rec) {
                    unmatched++;
                    continue;
                }

                const hasHosted = Boolean(rec.image_url && /^https?:\/\//i.test(String(rec.image_url).trim()));
                if (hasHosted && !overwriteImages) {
                    skippedExisting++;
                    continue;
                }

                try {
                    const blob = await item.getBlob();
                    const b64 = await compressBlobToJpegBase64(blob);
                    const directUrl = await uploadBase64ImgBB(b64, apiKey);

                    const audit = Array.isArray(rec.auditLog) ? [...rec.auditLog] : [];
                    audit.unshift({ at: nowStr, by: actor, action: 'رفع واستبدال صورة الوصفة من الـ CRM' });

                    await kDb.collection('kitchen_recipes').doc(item.docId).set({
                        image_url: directUrl,
                        image_status: 'صورة توضيحية مرفوعة ومربوطة تلقائياً',
                        auditLog: audit.slice(0, 25),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    rec.image_url = directUrl;
                    uploaded++;
                    await new Promise((r) => setTimeout(r, 350));
                } catch (imgErr) {
                    console.error(`Kitchen img upload failed (${item.docId}):`, imgErr);
                    failed++;
                }
            }

            setProg(imageItems.length, imageItems.length, '✅ اكتملت المعالجة بالكامل!');
            if (logEl) {
                logEl.className = failed > 0
                    ? 'text-xs font-black p-3.5 rounded-xl border bg-amber-50 border-amber-300 text-amber-950 leading-relaxed'
                    : 'text-xs font-black p-3.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 leading-relaxed';
                logEl.innerHTML = `✅ اكتملت العملية بنجاح!<br>` +
                    (jsonSummary ? `• وصفات جديدة أُضيفت (كمسودات): ${jsonSummary.added}<br>` : '') +
                    `• صور تم رفعها وربطها تلقائياً: ${uploaded}<br>` +
                    (skippedExisting > 0 ? `• صور موجودة لم تُستبدل: ${skippedExisting}<br>` : '') +
                    (failed > 0 ? `• صور تعذر رفعها مؤقتاً: ${failed} (أزل علامة الاستبدال وأعد الضغط لاستكمالها فقط)<br>` : '') +
                    (unmatched > 0 ? `• صور بدون وصفة مطابقة: ${unmatched}` : '');
            }
            kNotify(`🎉 تم رفع وربط ${uploaded} صورة بنجاح!`);
        } catch (err) {
            if (logEl) {
                logEl.className = 'text-xs font-black p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-700 leading-relaxed';
                logEl.textContent = `❌ ${err.message}`;
            }
        } finally {
            if (btn) btn.disabled = false;
            if (fileInp) fileInp.value = '';
            updateKitchenStatsUI();
            window.kcrmRenderRecipesList();
        }
    };

    // =========================================================================
    // 6. مراجعة واعتماد تقييمات العملاء
    // =========================================================================
    window.kcrmRenderFeedbackList = function () {
        const cont = document.getElementById('kcrm-feedback-list');
        if (!cont) return;

        const mode = document.getElementById('kcrm-fb-filter')?.value || 'pending';
        const list = mode === 'pending' ? kitchenFeedbackList.filter((f) => !f.isApproved) : kitchenFeedbackList;

        if (list.length === 0) {
            cont.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200">لا توجد تقييمات في هذا القسم حالياً.</div>';
            return;
        }

        cont.innerHTML = list.map((fb) => {
            const safeId = escKAttr(fb.id);
            const safeRecId = escKAttr(fb.recipeId || '');
            const stars = '★'.repeat(Math.max(1, Math.min(5, Number(fb.rating) || 5)));
            return `
            <div class="bg-white rounded-2xl p-3.5 border ${fb.isApproved ? 'border-emerald-200' : 'border-amber-300 bg-amber-50/20'} shadow-sm flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-1 flex-1 min-w-[200px]">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-black text-slate-800">${escK(fb.customerName || 'عميل')}</span>
                        <span class="text-amber-500 text-xs">${stars}</span>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${fb.isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}">${fb.isApproved ? '✅ منشور' : '⏳ للمراجعة'}</span>
                    </div>
                    <p class="text-[11px] font-black text-slate-500">الوصفة: ${escK(fb.recipeTitle || fb.recipeId)}</p>
                    ${fb.comment ? `<p class="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100">${escK(fb.comment)}</p>` : ''}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" onclick="window.kcrmSetFeedbackApproval('${safeId}', '${safeRecId}', ${!fb.isApproved})" class="px-3 py-2 rounded-xl text-[11px] font-black ${fb.isApproved ? 'bg-amber-100 text-amber-900' : 'bg-emerald-600 text-white'}">
                        ${fb.isApproved ? 'إخفاء' : '✅ اعتماد ونشر'}
                    </button>
                    <button type="button" onclick="window.kcrmDeleteFeedback('${safeId}', '${safeRecId}')" class="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center justify-center">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    };

    async function recalcKitchenRating(recipeId) {
        if (!recipeId) return;
        const approved = kitchenFeedbackList.filter((f) => f.recipeId === recipeId && f.isApproved);
        const count = approved.length;
        const avg = count > 0 ? Number((approved.reduce((s, f) => s + (Number(f.rating) || 5), 0) / count).toFixed(1)) : 0;
        await getKDb().collection('kitchen_recipes').doc(recipeId).set({ ratingAvg: avg, ratingCount: count }, { merge: true }).catch(() => {});
    }

    window.kcrmSetFeedbackApproval = async function (fbId, recipeId, approve) {
        try {
            await getKDb().collection('kitchen_feedback').doc(fbId).update({ isApproved: Boolean(approve) });
            const item = kitchenFeedbackList.find((f) => f.id === fbId);
            if (item) item.isApproved = Boolean(approve);
            await recalcKitchenRating(recipeId);
            kNotify(approve ? '✅ تم اعتماد ونشر التقييم' : 'تم إخفاء التقييم');
        } catch (e) {
            kNotify('⚠️ تعذر تحديث حالة التقييم');
        }
    };

    window.kcrmDeleteFeedback = async function (fbId, recipeId) {
        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm('هل تريد حذف هذا التقييم نهائياً؟', { title: 'حذف تقييم', tone: 'danger', confirmText: 'نعم، احذف' })
            : confirm('هل تريد حذف هذا التقييم نهائياً؟');
        if (!ok) return;
        try {
            await getKDb().collection('kitchen_feedback').doc(fbId).delete();
            kitchenFeedbackList = kitchenFeedbackList.filter((f) => f.id !== fbId);
            await recalcKitchenRating(recipeId);
            kNotify('🗑️ تم حذف التقييم');
        } catch (e) {
            kNotify('⚠️ تعذر حذف التقييم');
        }
    };

    // بدء الاستماع الخلفي لشارة التقييمات بمجرد تسجيل دخول الإدارة في الـ CRM
    function bootKitchenCrmWatcher() {
        const kAuth = getKAuth();
        if (!kAuth) return;
        kAuth.onAuthStateChanged((user) => {
            if (user) {
                startKitchenListeners();
                if (window.smanCurrentActiveTab === 'kitchen') {
                    window.renderKitchenCRMUI();
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootKitchenCrmWatcher);
    } else {
        bootKitchenCrmWatcher();
    }
})();

import { ref, computed, onMounted } from 'vue';

export default {
    name: 'LearningLogApp',
    props: {
        categories: Array
    },
    emits: ['create-ebbinghaus-task'], // [新增] 声明触发创建复习计划的事件
    setup(props, { emit }) {
        const API_BASE = 'http://localhost:3000/api';
        const logs = ref([]);
        const showModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);

        const filterStartDate = ref('');
        const filterEndDate = ref('');
        const filterSubject = ref('');

        const getToday = () => new Date().toISOString().split('T')[0];

        // 艾宾浩斯复习时间生成器
        const generateEbbinghaus = (startDateStr) => {
            const intervals = [1, 2, 4, 7, 15, 30];
            const start = new Date(startDateStr);
            return intervals.map(days => {
                const d = new Date(start);
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
            });
        };

        const defaultForm = () => ({
            recorder: '', subject: '', title: '', description: '',
            date: getToday(), startTime: '08:00', endTime: '09:00', rating: 10, images: [],
            isPushedToMistake: false, // 记录是否已经同步到错题本
            syncToMistake: false // 用于控制 UI 复选框的临时状态
        });

        const form = ref(defaultForm());
        const viewerState = ref({ show: false, log: null, imgIndex: 0 });

        const fetchLogs = async () => {
            try {
                const res = await fetch(`${API_BASE}/learninglog`);
                if (res.ok) logs.value = await res.json();
            } catch (err) { console.error(err); }
        };

        const groupedLogs = computed(() => {
            let filtered = logs.value;
            
            if (filterStartDate.value) filtered = filtered.filter(log => log.date >= filterStartDate.value);
            if (filterEndDate.value) filtered = filtered.filter(log => log.date <= filterEndDate.value);
            if (filterSubject.value) filtered = filtered.filter(log => log.subject === filterSubject.value);

            const groups = {};
            filtered.forEach(log => {
                if (!groups[log.date]) groups[log.date] = [];
                groups[log.date].push(log);
            });
            
            const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
            
            return sortedDates.map(date => {
                const items = groups[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
                return { date, items };
            });
        });

        const clearFilters = () => {
            filterStartDate.value = '';
            filterEndDate.value = '';
            filterSubject.value = '';
        };

        const handleImageUpload = (event) => {
            const files = Array.from(event.target.files);
            files.forEach(file => {
                if (file.size > 5 * 1024 * 1024) return alert(`图片超过5MB！`);
                const reader = new FileReader();
                reader.onload = (e) => form.value.images.push(e.target.result);
                reader.readAsDataURL(file);
            });
        };

        const removeImage = (idx) => form.value.images.splice(idx, 1);

        const openAddModal = () => {
            isEditing.value = false;
            editingId.value = null;
            form.value = defaultForm();
            showModal.value = true;
        };

        const openEditModal = (log) => {
            isEditing.value = true;
            editingId.value = log.id;
            // 复制数据，并确保 UI 复选框状态同步
            form.value = JSON.parse(JSON.stringify({ ...log, syncToMistake: log.isPushedToMistake }));
            showModal.value = true;
        };

        const deleteLog = async (id) => {
            if (!confirm("确定要删除这条学习记录吗？\n注意：如果已经同步到错题本，错题本中的记录不会受影响。")) return;
            try {
                const res = await fetch(`${API_BASE}/learninglog/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    logs.value = logs.value.filter(l => l.id !== id);
                    if (viewerState.value.show && viewerState.value.log?.id === id) viewerState.value.show = false;
                }
            } catch (err) { console.error(err); }
        };

        const submitLog = async () => {
            if (!form.value.subject || !form.value.title || !form.value.date) {
                return alert('请填写必填项(科目、标题、日期)');
            }

            // 判断这次保存是否触发推送到错题本的操作
            const shouldPushToMistake = form.value.syncToMistake && !form.value.isPushedToMistake;
            
            if (shouldPushToMistake) {
                form.value.isPushedToMistake = true; // 标记为已同步
            }

            try {
                // 1. 保存学习日志记录
                const payload = { ...form.value };
                delete payload.syncToMistake; // 移除UI专用字段再保存到后端
                
               const url = isEditing.value ? `${API_BASE}/learninglog/${editingId.value}` : `${API_BASE}/learninglog`;
                const method = isEditing.value ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method, headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    const savedLog = await res.json();
                    
                    // 2. 如果需要同步，则静默推送到错题日志接口
                    if (shouldPushToMistake) {
                        const today = getToday();
                        const mistakePayload = {
                            date: today,
                            ebbinghausSchedule: generateEbbinghaus(today),
                            recorder: savedLog.recorder,
                            subject: savedLog.subject,
                            title: savedLog.title,
                            description: savedLog.description,
                            images: savedLog.images ? [...savedLog.images] : []
                        };
                        
                        const mRes = await fetch(`${API_BASE}/mistakelog`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(mistakePayload)
                        });
                        
                        if (mRes.ok) {
                            const savedMistake = await mRes.json();
                            // 触发仪表盘创建艾宾浩斯复习任务
                            emit('create-ebbinghaus-task', {
                                title: `📓 复习错题: ${mistakePayload.subject} - ${mistakePayload.title}`,
                                category: mistakePayload.subject,
                                startDate: today,
                                type: 'ebbinghaus',
                                linkedMistakeId: savedMistake.id
                            });
                        }
                    }

                    // 3. 更新本地列表
                    if (isEditing.value) {
                        const idx = logs.value.findIndex(l => l.id === savedLog.id);
                        if (idx !== -1) logs.value[idx] = savedLog;
                    } else {
                        logs.value.push(savedLog);
                    }
                    showModal.value = false;
                }
            } catch (err) { console.error("保存记录失败", err); }
        };

        const openViewer = (log) => viewerState.value = { show: true, log, imgIndex: 0 };
        const closeViewer = () => viewerState.value.show = false;
        const nextImg = () => { if (viewerState.value.imgIndex < viewerState.value.log.images.length - 1) viewerState.value.imgIndex++; };
        const prevImg = () => { if (viewerState.value.imgIndex > 0) viewerState.value.imgIndex--; };

        onMounted(fetchLogs);

        return {
            logs, groupedLogs, showModal, isEditing, form, viewerState,
            filterStartDate, filterEndDate, filterSubject, clearFilters,
            openAddModal, openEditModal, deleteLog, submitLog,
            openViewer, closeViewer, nextImg, prevImg,
            handleImageUpload, removeImage
        };
    },
    template: `
        <div class="h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative">
            
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <i class="fas fa-seedling text-emerald-500"></i> 学习成果日志
                </h2>
                <button @click="openAddModal" class="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-200 hover:bg-emerald-600 transition">
                    <i class="fas fa-plus mr-2"></i> 登记新成果
                </button>
            </div>

            <div class="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap gap-4 items-center shrink-0 text-sm">
                <span class="text-slate-500 font-bold"><i class="fas fa-filter mr-1 text-emerald-500"></i>筛选条件:</span>
                
                <div class="flex items-center gap-2">
                    <input type="date" v-model="filterStartDate" class="px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 text-slate-600 cursor-pointer">
                    <span class="text-slate-400 text-xs">至</span>
                    <input type="date" v-model="filterEndDate" class="px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 text-slate-600 cursor-pointer">
                </div>
                
                <select v-model="filterSubject" class="px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 text-slate-600 bg-white cursor-pointer min-w-[120px]">
                    <option value="">全部分类</option>
                    <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                </select>
                
                <button v-if="filterStartDate || filterEndDate || filterSubject" @click="clearFilters" class="text-slate-400 hover:text-red-500 transition ml-auto font-bold flex items-center gap-1">
                    <i class="fas fa-times-circle"></i> 清空筛选
                </button>
            </div>

            <div class="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <div v-if="groupedLogs.length === 0" class="flex flex-col items-center justify-center h-full text-slate-300">
                    <i class="fas fa-wind text-6xl mb-4 opacity-50"></i>
                    <p v-if="filterStartDate || filterEndDate || filterSubject">当前筛选条件下暂无记录</p>
                    <p v-else>暂无学习记录，开始种下你的第一棵学习之树吧！</p>
                </div>

                <div class="max-w-4xl mx-auto space-y-10 relative pl-4 border-l-2 border-slate-200 ml-4">
                    <div v-for="group in groupedLogs" :key="group.date" class="relative">
                        <div class="absolute -left-[23px] top-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-white shadow-sm flex items-center justify-center"><div class="w-1.5 h-1.5 bg-white rounded-full"></div></div>
                        <h3 class="font-bold text-xl text-slate-800 mb-6 flex items-center gap-3">
                            {{ group.date }} <span class="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{{ group.items.length }} 条记录</span>
                        </h3>
                        
                        <div class="space-y-4">
                            <div v-for="item in group.items" :key="item.id" class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition group relative flex flex-col cursor-pointer" @click="openViewer(item)">
                                
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex items-center gap-3 flex-wrap">
                                        <div class="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100">{{ item.startTime }} - {{ item.endTime }}</div>
                                        <span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">{{ item.subject }}</span>
                                        <span v-if="item.recorder" class="text-xs text-slate-400"><i class="fas fa-user-edit mr-1"></i>{{ item.recorder }}</span>
                                        <span v-if="item.isPushedToMistake" class="px-2 py-0.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg border border-rose-100 flex items-center gap-1">
                                            <i class="fas fa-book-dead"></i>已入错题本
                                        </span>
                                    </div>
                                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                        <button @click.stop="openEditModal(item)" class="text-slate-400 hover:text-emerald-500 transition w-8 h-8 rounded hover:bg-emerald-50 flex justify-center items-center"><i class="fas fa-edit"></i></button>
                                        <button @click.stop="deleteLog(item.id)" class="text-slate-400 hover:text-red-500 transition w-8 h-8 rounded hover:bg-red-50 flex justify-center items-center"><i class="fas fa-trash-alt"></i></button>
                                    </div>
                                </div>
                                
                                <h4 class="font-bold text-slate-800 text-lg mb-2">{{ item.title }}</h4>
                                <p class="text-sm text-slate-600 mb-4 line-clamp-2" :title="item.description">{{ item.description }}</p>
                                
                                <div class="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                                    <div class="flex gap-0.5 text-xs">
                                        <i v-for="i in 10" :key="i" class="fas fa-star" :class="i <= item.rating ? 'text-amber-400' : 'text-slate-200'"></i>
                                    </div>
                                    <div v-if="item.images && item.images.length" class="text-xs text-slate-400 font-bold flex items-center gap-1">
                                        <i class="fas fa-image"></i> {{ item.images.length }} 张
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="showModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-8 scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <h3 class="text-2xl font-bold mb-6 text-slate-800">{{ isEditing ? '✏️ 编辑学习记录' : '🌱 登记学习成果' }}</h3>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div><label class="block text-xs font-bold text-slate-500 mb-1">学习日期 <span class="text-red-400">*</span></label><input type="date" v-model="form.date" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"></div>
                        <div class="flex gap-2">
                            <div class="flex-1"><label class="block text-xs font-bold text-slate-500 mb-1">开始时间</label><input type="time" v-model="form.startTime" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"></div>
                            <div class="flex-1"><label class="block text-xs font-bold text-slate-500 mb-1">结束时间</label><input type="time" v-model="form.endTime" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"></div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div><label class="block text-xs font-bold text-slate-500 mb-1">科目分类 <span class="text-red-400">*</span></label><select v-model="form.subject" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 cursor-pointer"><option value="" disabled>选择科目</option><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></div>
                        <div><label class="block text-xs font-bold text-slate-500 mb-1">登记人</label><input v-model="form.recorder" placeholder="例如: 爸爸 / 自己" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"></div>
                    </div>

                    <div class="mb-4">
                        <label class="block text-xs font-bold text-slate-500 mb-1">成果打分 (最高10星)</label>
                        <div class="flex gap-1 text-2xl bg-slate-50 p-3 rounded-xl border border-slate-200 w-max">
                            <i v-for="i in 10" :key="i" @click="form.rating = i" class="fas fa-star cursor-pointer transition-transform hover:scale-125 active:scale-95" :class="i <= form.rating ? 'text-amber-400' : 'text-slate-300 drop-shadow-sm'"></i>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <div><label class="block text-xs font-bold text-slate-500 mb-1">成果标题 <span class="text-red-400">*</span></label><input v-model="form.title" placeholder="例如: 攻克了二次函数压轴题" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-500"></div>
                        <div><label class="block text-xs font-bold text-slate-500 mb-1">描述与反思</label><textarea v-model="form.description" rows="3" placeholder="写下学习过程中的收获和反思..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:border-emerald-500"></textarea></div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">上传照片 (选填)</label>
                            <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 relative group text-center cursor-pointer hover:bg-slate-100 transition">
                                <input type="file" multiple accept="image/*" @change="handleImageUpload" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                <i class="fas fa-camera text-2xl text-slate-400 mb-2"></i><p class="text-xs text-slate-500">点击上传成果照片 (每张≤5MB)</p>
                            </div>
                            <div v-if="form.images.length > 0" class="mt-3 grid grid-cols-5 gap-2">
                                <div v-for="(img, idx) in form.images" :key="'img-'+idx" class="relative group aspect-square rounded-lg border border-slate-200 overflow-hidden">
                                    <img :src="img" class="w-full h-full object-cover">
                                    <button @click.stop="removeImage(idx)" class="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 z-20 transition"><i class="fas fa-times"></i></button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-3 p-4 bg-rose-50/50 border border-rose-100 rounded-xl transition" @click="!form.isPushedToMistake && (form.syncToMistake = !form.syncToMistake)" :class="form.isPushedToMistake ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-rose-50'">
                            <div class="w-6 h-6 rounded flex items-center justify-center border-2 transition-colors" :class="(form.syncToMistake || form.isPushedToMistake) ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-rose-200'">
                                <i class="fas fa-check text-xs" v-if="form.syncToMistake || form.isPushedToMistake"></i>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-sm font-bold text-rose-800">同步至「错题日志」</span>
                                <span class="text-xs text-rose-500" v-if="form.isPushedToMistake">该记录已入库，错题本已生成独立复习计划</span>
                                <span class="text-xs text-rose-400" v-else>勾选后，保存时将自动在错题本中克隆副本并生成复习计划</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex gap-4 mt-8">
                        <button @click="showModal=false" class="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                        <button @click="submitLog" class="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition shadow-lg shadow-emerald-200">保存记录</button>
                    </div>
                </div>
            </div>

            <div v-if="viewerState.show" class="fixed inset-0 bg-slate-900/95 z-[100] flex flex-col items-center animate-fade-in backdrop-blur-sm">
                <div class="w-full p-6 flex justify-between items-center shrink-0">
                    <div class="text-white flex items-center gap-4">
                        <span class="bg-emerald-500 px-3 py-1 rounded-lg text-sm font-bold">{{ viewerState.log.subject }}</span>
                        <span v-if="viewerState.log.isPushedToMistake" class="bg-rose-500 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1"><i class="fas fa-book-dead"></i> 已入错题本</span>
                        <div class="flex flex-col">
                            <span class="text-xl font-bold">{{ viewerState.log.title }}</span>
                            <span class="text-xs text-slate-400">{{ viewerState.log.date }} | {{ viewerState.log.startTime }} - {{ viewerState.log.endTime }}</span>
                        </div>
                    </div>
                    <button @click="closeViewer" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white flex items-center justify-center transition"><i class="fas fa-times text-xl"></i></button>
                </div>

                <div class="flex-1 w-full flex items-center justify-center relative px-16 min-h-0">
                    <button v-if="viewerState.log.images && viewerState.log.images.length > 1" @click="prevImg" :class="{'opacity-30 cursor-not-allowed': viewerState.imgIndex === 0}" class="absolute left-6 w-14 h-14 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition z-10"><i class="fas fa-chevron-left text-2xl"></i></button>

                    <div v-if="!viewerState.log.images || viewerState.log.images.length === 0" class="text-slate-500 text-lg flex flex-col items-center">
                        <i class="fas fa-leaf text-5xl mb-4 opacity-50 text-emerald-900"></i> 无照片记录
                    </div>
                    <img v-else :src="viewerState.log.images[viewerState.imgIndex]" class="max-w-full max-h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10">

                    <button v-if="viewerState.log.images && viewerState.log.images.length > 1" @click="nextImg" :class="{'opacity-30 cursor-not-allowed': viewerState.imgIndex === viewerState.log.images.length - 1}" class="absolute right-6 w-14 h-14 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition z-10"><i class="fas fa-chevron-right text-2xl"></i></button>
                    
                    <div v-if="viewerState.log.images && viewerState.log.images.length > 1" class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-1.5 rounded-full text-white/80 text-sm tracking-widest font-mono">
                        {{ viewerState.imgIndex + 1 }} / {{ viewerState.log.images.length }}
                    </div>
                </div>

                <div class="w-full max-w-4xl p-6 mb-6 shrink-0">
                    <div class="bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-2xl">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex gap-1 text-lg">
                                <i v-for="i in 10" :key="i" class="fas fa-star" :class="i <= viewerState.log.rating ? 'text-amber-400' : 'text-slate-600'"></i>
                            </div>
                            <span v-if="viewerState.log.recorder" class="text-xs font-bold text-slate-400 bg-slate-700 px-3 py-1 rounded-full"><i class="fas fa-user mr-1"></i> {{ viewerState.log.recorder }}</span>
                        </div>
                        <p class="text-slate-300 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">{{ viewerState.log.description || '主人很懒，没有留下反思~' }}</p>
                    </div>
                </div>
            </div>
        </div>
    `
}
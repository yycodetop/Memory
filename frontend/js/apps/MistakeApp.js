import { ref, computed, onMounted } from 'vue';

export default {
    name: 'MistakeApp',
    props: {
        categories: Array
    },
    emits: ['create-ebbinghaus-task'],
    setup(props, { emit }) {
        const API_BASE = 'http://localhost:3000/api';
        const mistakes = ref([]);
        const showModal = ref(false);
        const filterSubject = ref('');
        const isEditing = ref(false);
        const editingId = ref(null);
        
        // 表单内照片切换标签页状态 ('mistake' | 'answer')
        const formTab = ref('mistake'); 

        // 新版表单结构：区分错题图片（含遮挡）和答案图片
        const newMistakeForm = ref({ 
            recorder: '', title: '', subject: '', description: '', 
            mistakeImages: [], // [{ url: '...', masks: [{x,y,w,h,r}] }]
            answerImages: []   // ['...']
        });
        
        const reviewLogsModal = ref({ show: false, mistake: null });
        const openReviewLogsModal = (mistake) => { reviewLogsModal.value = { show: true, mistake }; };
        const closeReviewLogsModal = () => { reviewLogsModal.value.show = false; };

        // 遮挡编辑器状态
        const occEditor = ref({ show: false, index: -1, url: '', masks: [] });
        const occImageContainer = ref(null);
        const isDrawingOcc = ref(false);
        const drawStartOcc = ref({ x: 0, y: 0 });
        const activeDrawingOcc = ref(null);

        // 查看器状态
        const viewerState = ref({
            show: false,
            mistake: null,
            tab: 'mistake', // 'mistake' | 'answer'
            mImages: [],
            aImages: [],
            imgIndex: 0,
            masksStatus: [],
            reflectionForm: ''
        });

        const generateEbbinghaus = (startDateStr) => {
            const intervals = [1, 2, 4, 7, 15, 30];
            const start = new Date(startDateStr);
            return intervals.map(days => {
                const d = new Date(start);
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
            });
        };

        const fetchMistakes = async () => {
            try {
                const res = await fetch(`${API_BASE}/mistakelog`);
                if (res.ok) mistakes.value = await res.json();
            } catch (err) { console.error("加载错题失败", err); }
        };

        const handleImageUpload = (event, type) => {
            const files = Array.from(event.target.files);
            const maxSize = 5 * 1024 * 1024;
            files.forEach(file => {
                if (file.size > maxSize) {
                    alert(`图片 ${file.name} 超过 5MB 限制！`);
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (type === 'mistake') {
                        newMistakeForm.value.mistakeImages.push({ url: e.target.result, masks: [] });
                    } else {
                        newMistakeForm.value.answerImages.push(e.target.result);
                    }
                };
                reader.readAsDataURL(file);
            });
            event.target.value = '';
        };

        const removeMistakeImage = (index) => newMistakeForm.value.mistakeImages.splice(index, 1);
        const removeAnswerImage = (index) => newMistakeForm.value.answerImages.splice(index, 1);

        // --- 遮挡编辑逻辑 ---
        const openOccEditor = (index) => {
            const item = newMistakeForm.value.mistakeImages[index];
            occEditor.value = { 
                show: true, index, url: item.url, 
                masks: JSON.parse(JSON.stringify(item.masks || [])) 
            };
        };
        const closeOccEditor = () => { occEditor.value.show = false; };
        const saveOccEditor = () => {
            newMistakeForm.value.mistakeImages[occEditor.value.index].masks = occEditor.value.masks;
            closeOccEditor();
        };
        const startDrawOcc = (e) => {
            if (!occImageContainer.value) return;
            e.preventDefault();
            isDrawingOcc.value = true;
            drawStartOcc.value = { x: e.clientX, y: e.clientY };
            const rect = occImageContainer.value.getBoundingClientRect();
            activeDrawingOcc.value = {
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100,
                w: 0, h: 0, r: 0
            };
        };
        const handleMouseMoveOcc = (e) => {
            if (isDrawingOcc.value && activeDrawingOcc.value && occImageContainer.value) {
                const rect = occImageContainer.value.getBoundingClientRect();
                const minX = Math.min(drawStartOcc.value.x, e.clientX) - rect.left;
                const minY = Math.min(drawStartOcc.value.y, e.clientY) - rect.top;
                const width = Math.abs(e.clientX - drawStartOcc.value.x);
                const height = Math.abs(e.clientY - drawStartOcc.value.y);
                activeDrawingOcc.value.x = (minX / rect.width) * 100;
                activeDrawingOcc.value.y = (minY / rect.height) * 100;
                activeDrawingOcc.value.w = (width / rect.width) * 100;
                activeDrawingOcc.value.h = (height / rect.height) * 100;
            }
        };
        const handleMouseUpOcc = () => {
            if (isDrawingOcc.value) {
                isDrawingOcc.value = false;
                if (activeDrawingOcc.value && activeDrawingOcc.value.w > 0.5 && activeDrawingOcc.value.h > 0.5) {
                    occEditor.value.masks.push({ ...activeDrawingOcc.value });
                }
                activeDrawingOcc.value = null;
            }
        };
        const removeOccMask = (idx) => occEditor.value.masks.splice(idx, 1);

        // --- 表单与提交逻辑 ---
        const openAddModal = () => {
            isEditing.value = false;
            editingId.value = null;
            formTab.value = 'mistake'; // 每次打开重置为错题照片页
            newMistakeForm.value = { recorder: '', title: '', subject: '', description: '', mistakeImages: [], answerImages: [] };
            showModal.value = true;
        };

        const openEditModal = (mistake) => {
            isEditing.value = true;
            editingId.value = mistake.id;
            formTab.value = 'mistake'; // 每次打开重置为错题照片页
            
            // 兼容老数据结构
            const savedImages = mistake.images || {};
            let mImages = [];
            let aImages = [];
            
            if (Array.isArray(savedImages)) {
                mImages = savedImages.map(url => ({ url, masks: [] }));
            } else {
                mImages = savedImages.mistake ? JSON.parse(JSON.stringify(savedImages.mistake)) : [];
                aImages = savedImages.answer ? [...savedImages.answer] : [];
            }

            newMistakeForm.value = {
                recorder: mistake.recorder || '',
                title: mistake.title || '',
                subject: mistake.subject || '',
                description: mistake.description || '',
                mistakeImages: mImages,
                answerImages: aImages
            };
            showModal.value = true;
        };

        const deleteMistake = async (id) => {
            if (!confirm("确定要彻底删除这条错题记录吗？这也会同时删除相关的复习日志！")) return;
            try {
                const res = await fetch(`${API_BASE}/mistakelog/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    mistakes.value = mistakes.value.filter(m => m.id !== id);
                    if (viewerState.value.show && viewerState.value.mistake?.id === id) closeViewer();
                }
            } catch (err) { console.error("删除错题失败", err); }
        };

        const submitMistake = async () => {
            if (!newMistakeForm.value.subject || !newMistakeForm.value.description || !newMistakeForm.value.title) {
                alert('请填写必填项(科目、标题、描述)');
                return;
            }

            const payload = {
                recorder: newMistakeForm.value.recorder,
                title: newMistakeForm.value.title,
                subject: newMistakeForm.value.subject,
                description: newMistakeForm.value.description,
                images: {
                    mistake: newMistakeForm.value.mistakeImages,
                    answer: newMistakeForm.value.answerImages
                }
            };

            if (isEditing.value) {
                try {
                    const res = await fetch(`${API_BASE}/mistakelog/${editingId.value}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        const updatedMistake = await res.json();
                        const idx = mistakes.value.findIndex(m => m.id === editingId.value);
                        if (idx !== -1) mistakes.value[idx] = updatedMistake;
                        showModal.value = false;
                    }
                } catch (err) { console.error("更新错题失败", err); }
            } else {
                const today = new Date().toISOString().split('T')[0];
                const newRecord = {
                    date: today,
                    ebbinghausSchedule: generateEbbinghaus(today),
                    ...payload
                };

                try {
                    const res = await fetch(`${API_BASE}/mistakelog`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newRecord)
                    });
                    
                    if (res.ok) {
                        const savedMistake = await res.json();
                        mistakes.value.unshift(savedMistake);

                        emit('create-ebbinghaus-task', {
                            title: `📓 复习错题: ${payload.subject} - ${payload.title}`,
                            category: payload.subject,
                            startDate: today,
                            type: 'ebbinghaus',
                            linkedMistakeId: savedMistake.id
                        });
                        showModal.value = false;
                    }
                } catch (err) { console.error(err); }
            }
        };

        const sortedMistakes = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            let filteredList = mistakes.value;
            if (filterSubject.value) filteredList = mistakes.value.filter(m => m.subject === filterSubject.value);

            return [...filteredList].sort((a, b) => {
                const getNextDateTimestamp = (mistake) => {
                    const schedule = mistake.ebbinghausSchedule || [];
                    const nextDateStr = schedule.find(d => d >= today);
                    return nextDateStr ? new Date(nextDateStr).getTime() : Infinity;
                };
                const timeA = getNextDateTimestamp(a);
                const timeB = getNextDateTimestamp(b);
                if (timeA === timeB) return new Date(b.date).getTime() - new Date(a.date).getTime();
                return timeA - timeB;
            });
        });

        const todaysReviews = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return mistakes.value.filter(m => {
                const schedule = m.ebbinghausSchedule || [];
                return schedule.includes(today);
            }).map(m => {
                const reviewedToday = m.reviewLogs && m.reviewLogs.some(log => log.reviewDate === today);
                return { ...m, reviewedToday };
            }).sort((a, b) => a.reviewedToday - b.reviewedToday);
        });

        const getNextReviewInfo = (mistake) => {
            const today = new Date().toISOString().split('T')[0];
            const schedule = mistake.ebbinghausSchedule || [];
            const nextDate = schedule.find(d => d >= today);
            if (!nextDate) return '复习已完结';
            const diffDays = Math.ceil((new Date(nextDate) - new Date(today)) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) return `今天 (${nextDate})`;
            return `${diffDays}天后 (${nextDate})`;
        };

        // --- 查看器与复习逻辑 ---
        const openViewer = (mistake) => {
            const savedImages = mistake.images || {};
            let mImages = [];
            let aImages = [];
            
            if (Array.isArray(savedImages)) {
                mImages = savedImages.map(url => ({ url, masks: [] }));
            } else {
                mImages = savedImages.mistake ? JSON.parse(JSON.stringify(savedImages.mistake)) : [];
                aImages = savedImages.answer ? [...savedImages.answer] : [];
            }

            viewerState.value = { 
                show: true, mistake, mImages, aImages,
                tab: 'mistake', imgIndex: 0, reflectionForm: '',
                masksStatus: (mImages[0] && mImages[0].masks) ? mImages[0].masks.map(m => ({ ...m, visible: true })) : []
            };
        };
        const closeViewer = () => viewerState.value.show = false;
        
        const switchViewerTab = (tab) => {
            viewerState.value.tab = tab;
            viewerState.value.imgIndex = 0;
            if (tab === 'mistake') {
                const m = viewerState.value.mImages[0];
                viewerState.value.masksStatus = (m && m.masks) ? m.masks.map(mask => ({ ...mask, visible: true })) : [];
            }
        };

        const currentViewerImagesList = computed(() => {
            return viewerState.value.tab === 'mistake' ? viewerState.value.mImages : viewerState.value.aImages;
        });

        const nextImg = () => {
            if (viewerState.value.imgIndex < currentViewerImagesList.value.length - 1) {
                viewerState.value.imgIndex++;
                if (viewerState.value.tab === 'mistake') {
                    const m = viewerState.value.mImages[viewerState.value.imgIndex];
                    viewerState.value.masksStatus = (m && m.masks) ? m.masks.map(mask => ({ ...mask, visible: true })) : [];
                }
            }
        };
        const prevImg = () => {
            if (viewerState.value.imgIndex > 0) {
                viewerState.value.imgIndex--;
                if (viewerState.value.tab === 'mistake') {
                    const m = viewerState.value.mImages[viewerState.value.imgIndex];
                    viewerState.value.masksStatus = (m && m.masks) ? m.masks.map(mask => ({ ...mask, visible: true })) : [];
                }
            }
        };
        const toggleViewerMask = (idx) => {
            viewerState.value.masksStatus[idx].visible = !viewerState.value.masksStatus[idx].visible;
        };

        const submitReviewLog = async () => {
            if (!viewerState.value.reflectionForm) {
                if(!confirm('未填写复习反思，确认直接完成吗？')) return;
            }

            const m = viewerState.value.mistake;
            try {
                const res = await fetch(`${API_BASE}/mistakelog/${m.id}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        reflection: viewerState.value.reflectionForm || '已阅复习', 
                        status: 'Completed' 
                    })
                });
                if(res.ok) {
                    const updatedMistake = await res.json();
                    const idx = mistakes.value.findIndex(x => x.id === m.id);
                    if(idx !== -1) mistakes.value[idx] = updatedMistake;
                    closeViewer();
                }
            } catch (err) { console.error("保存日志失败", err); }
        };

        onMounted(fetchMistakes);

        return {
            mistakes, sortedMistakes, showModal, newMistakeForm, isEditing, filterSubject, formTab,
            todaysReviews, getNextReviewInfo,
            viewerState, openViewer, closeViewer, switchViewerTab, currentViewerImagesList, nextImg, prevImg, toggleViewerMask, submitReviewLog,
            reviewLogsModal, openReviewLogsModal, closeReviewLogsModal,
            handleImageUpload, removeMistakeImage, removeAnswerImage, submitMistake,
            openAddModal, openEditModal, deleteMistake,
            occEditor, occImageContainer, openOccEditor, closeOccEditor, saveOccEditor,
            startDrawOcc, handleMouseMoveOcc, handleMouseUpOcc, removeOccMask, activeDrawingOcc
        };
    },
    template: `
        <div class="h-full flex bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative">
            
            <div class="flex-1 flex flex-col min-w-0">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div class="flex items-center gap-4">
                        <h2 class="text-xl font-bold text-slate-800">
                        <i class="fas fa-book-dead text-emerald-500"></i> 全部错题记录
                        </h2>
                        <select v-model="filterSubject" class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer">
                            <option value="">全部分类</option>
                            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                        </select>
                    </div>
                    
                    <button @click="openAddModal" class="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition">
                        <i class="fas fa-plus mr-2"></i> 录入错题
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar grid grid-cols-1 xl:grid-cols-2 gap-4 content-start">
                    <div v-if="sortedMistakes.length === 0" class="col-span-full text-center text-slate-400 py-12 flex flex-col items-center">
                        <i class="fas fa-inbox text-4xl mb-3 opacity-30"></i>
                        <p>该分类下暂无错题记录</p>
                    </div>

                    <div v-for="item in sortedMistakes" :key="item.id" class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col group transition-all hover:shadow-md">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center gap-2">
                                <span class="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg">{{ item.subject }}</span>
                                <span v-if="item.recorder" class="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg"><i class="fas fa-user-edit mr-1"></i>{{ item.recorder }}</span>
                            </div>
                            
                            <div class="flex items-center gap-3">
                                <span class="text-xs text-slate-400 font-mono">{{ item.date }}</span>
                                <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button @click.stop="openEditModal(item)" class="text-slate-400 hover:text-indigo-500 transition" title="编辑错题"><i class="fas fa-edit"></i></button>
                                    <button @click.stop="deleteMistake(item.id)" class="text-slate-400 hover:text-red-500 transition" title="删除错题"><i class="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        </div>
                        
                        <h3 class="font-bold text-slate-800 text-lg mb-2 truncate cursor-pointer hover:text-indigo-600 transition" :title="item.title" @click="openViewer(item)">{{ item.title }}</h3>
                        <p class="text-sm text-slate-600 mb-4 truncate flex-1 cursor-pointer" :title="item.description" @click="openViewer(item)">{{ item.description }}</p>
                        
                        <div class="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
                            <div class="text-xs">
                                <span class="text-slate-400">下次复习: </span>
                                <span class="font-bold text-indigo-600">{{ getNextReviewInfo(item) }}</span>
                            </div>
                            <button @click="openReviewLogsModal(item)" class="text-xs font-bold text-slate-500 hover:text-indigo-600 transition flex items-center gap-1">
                                <i class="fas fa-history"></i> 查看复习日志 ({{ item.reviewLogs ? item.reviewLogs.length : 0 }})
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-80 border-l border-slate-100 bg-slate-50/50 flex flex-col">
                <div class="p-6 border-b border-slate-100 bg-white">
                    <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <i class="fas fa-calendar-check text-emerald-500"></i> 今日复习任务
                    </h2>
                    <p class="text-xs text-slate-400 mt-1">根据艾宾浩斯记忆曲线生成</p>
                </div>
                
                <div class="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                    <div v-if="todaysReviews.length === 0" class="text-center text-slate-400 py-10 text-sm">今日无需复习错题，休息一下吧！</div>
                    
                    <div v-for="task in todaysReviews" :key="task.id" 
                        class="bg-white border rounded-xl p-4 transition-all hover:shadow-md cursor-pointer group"
                        :class="task.reviewedToday ? 'border-emerald-200 opacity-60' : 'border-slate-200 hover:border-indigo-300'"
                        @click="openViewer(task)">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-xs font-bold px-2 py-0.5 rounded-md" :class="task.reviewedToday ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'">{{ task.subject }}</span>
                            <div v-if="task.reviewedToday" class="text-emerald-500 text-sm"><i class="fas fa-check-circle"></i> 已复习</div>
                            <div v-else class="text-amber-500 text-xs font-bold px-2 py-0.5 bg-amber-50 rounded-md">待复习</div>
                        </div>
                        <h4 class="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition" :title="task.title">{{ task.title }}</h4>
                    </div>
                </div>
            </div>

            <div v-if="reviewLogsModal.show" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 scale-up max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <i class="fas fa-history text-indigo-500"></i> 复习历史记录
                        </h3>
                        <button @click="closeReviewLogsModal" class="text-slate-400 hover:text-red-500 transition"><i class="fas fa-times text-xl"></i></button>
                    </div>
                    <div class="mb-4 pb-4 border-b border-slate-100">
                        <div class="text-xs text-slate-500 mb-1">错题标题:</div>
                        <div class="font-bold text-slate-800">{{ reviewLogsModal.mistake.title }}</div>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <ul v-if="reviewLogsModal.mistake.reviewLogs && reviewLogsModal.mistake.reviewLogs.length" class="space-y-4">
                            <li v-for="(log, idx) in reviewLogsModal.mistake.reviewLogs" :key="idx" class="bg-slate-50 rounded-xl p-4 border border-slate-100 shadow-sm">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="font-mono text-sm font-bold text-slate-600"><i class="fas fa-calendar-day mr-1 text-slate-400"></i> {{ log.reviewDate }}</span>
                                    <span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md">第 {{ idx + 1 }} 次复习</span>
                                </div>
                                <p class="text-sm text-slate-700 leading-relaxed">{{ log.reflection }}</p>
                            </li>
                        </ul>
                        <div v-else class="text-center text-slate-400 py-10 flex flex-col items-center">
                            <i class="fas fa-inbox text-4xl mb-3 opacity-30"></i>
                            <p class="text-sm">这条错题还没有复习记录哦</p>
                        </div>
                    </div>
                    <div class="mt-6 pt-4 border-t border-slate-100">
                        <button @click="closeReviewLogsModal" class="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">关闭</button>
                    </div>
                </div>
            </div>

            <div v-if="viewerState.show" class="fixed inset-0 bg-slate-900/95 z-[100] flex flex-col items-center animate-fade-in backdrop-blur-sm">
                <div class="w-full p-6 flex justify-between items-center shrink-0">
                    <div class="text-white">
                        <span class="bg-indigo-500 px-3 py-1 rounded-lg text-sm font-bold mr-3">{{ viewerState.mistake.subject }}</span>
                        <span class="text-xl font-bold">{{ viewerState.mistake.title }}</span>
                    </div>
                    <div class="flex bg-slate-800/80 rounded-xl p-1 shadow-inner gap-1">
                        <button @click="switchViewerTab('mistake')" :class="viewerState.tab === 'mistake' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'" class="px-6 py-2 rounded-lg text-sm font-bold transition">
                            <i class="fas fa-image mr-1"></i> 错题照片
                        </button>
                        <button @click="switchViewerTab('answer')" :class="viewerState.tab === 'answer' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:text-white'" class="px-6 py-2 rounded-lg text-sm font-bold transition">
                            <i class="fas fa-check-double mr-1"></i> 正确答案
                        </button>
                    </div>
                    <button @click="closeViewer" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white flex items-center justify-center transition"><i class="fas fa-times text-xl"></i></button>
                </div>

                <div class="flex-1 w-full flex items-center justify-center relative px-16 min-h-0">
                    <button v-if="currentViewerImagesList.length > 1" @click="prevImg" :class="{'opacity-30 cursor-not-allowed': viewerState.imgIndex === 0}" class="absolute left-6 w-14 h-14 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition z-10"><i class="fas fa-chevron-left text-2xl"></i></button>

                    <div v-if="currentViewerImagesList.length === 0" class="text-slate-500 text-lg flex flex-col items-center">
                        <i class="fas fa-box-open text-4xl mb-3 opacity-50"></i> 该分类未上传照片
                    </div>
                    
                    <div v-else class="relative inline-block shadow-2xl rounded-lg overflow-hidden select-none">
                        <img v-if="viewerState.tab === 'mistake'" :src="viewerState.mImages[viewerState.imgIndex].url" class="max-h-[70vh] max-w-full block" draggable="false">
                        <img v-else :src="viewerState.aImages[viewerState.imgIndex]" class="max-h-[70vh] max-w-full block" draggable="false">

                        <template v-if="viewerState.tab === 'mistake'">
                            <div v-for="(mask, idx) in viewerState.masksStatus" :key="idx"
                                class="absolute border transition-all duration-300 cursor-pointer shadow-sm flex items-center justify-center"
                                :class="mask.visible ? 'bg-orange-500 border-orange-400 opacity-100' : 'bg-transparent border-emerald-400/50 opacity-100 hover:bg-emerald-500/10'"
                                :style="{ left: mask.x + '%', top: mask.y + '%', width: mask.w + '%', height: mask.h + '%', transform: 'rotate(' + (mask.r || 0) + 'deg)', transformOrigin: 'center center' }"
                                @click="toggleViewerMask(idx)"
                            >
                                <span v-if="mask.visible" class="text-white font-bold drop-shadow-md text-sm"><i class="fas fa-eye-slash"></i></span>
                            </div>
                        </template>
                    </div>

                    <button v-if="currentViewerImagesList.length > 1" @click="nextImg" :class="{'opacity-30 cursor-not-allowed': viewerState.imgIndex === currentViewerImagesList.length - 1}" class="absolute right-6 w-14 h-14 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition z-10"><i class="fas fa-chevron-right text-2xl"></i></button>
                    
                    <div v-if="currentViewerImagesList.length > 1" class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-1.5 rounded-full text-white/80 text-sm tracking-widest font-mono">
                        {{ viewerState.imgIndex + 1 }} / {{ currentViewerImagesList.length }}
                    </div>
                </div>

                <div class="w-full max-w-4xl p-6 mb-6 shrink-0">
                    <div class="bg-slate-800/80 backdrop-blur-md rounded-2xl p-5 border border-slate-700 flex gap-4 items-end shadow-2xl">
                        <div class="flex-1">
                            <label class="block text-indigo-300 text-xs font-bold mb-2 uppercase tracking-wider"><i class="fas fa-pen-nib mr-1"></i> 填写复习日志</label>
                            <textarea v-model="viewerState.reflectionForm" class="w-full bg-slate-900/50 text-white border border-slate-700 rounded-xl p-3 resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" rows="2" placeholder="已核对答案？写下这次重新解答的思路和反思..."></textarea>
                        </div>
                        <button @click="submitReviewLog" class="h-[74px] px-8 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-900/50 whitespace-nowrap">
                            <i class="fas fa-check-circle text-xl"></i> 标记复习完成
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="showModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-white rounded-3xl w-full max-w-3xl shadow-2xl p-8 scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <h3 class="text-2xl font-bold mb-6 text-slate-800">{{ isEditing ? '✏️ 编辑错题' : '✨ 录入新错题' }}</h3>
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">录入人 <span class="text-red-400">*</span></label>
                            <input v-model="newMistakeForm.recorder" placeholder="例如: 爸爸 / 妈妈" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">科目分类 <span class="text-red-400">*</span></label>
                            <select v-model="newMistakeForm.subject" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <option value="" disabled>选择科目</option>
                                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-5">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">错题标题 <span class="text-red-400">*</span></label>
                            <input v-model="newMistakeForm.title" placeholder="例如: 期中考试附加题" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">错题描述与反思 <span class="text-red-400">*</span></label>
                            <textarea v-model="newMistakeForm.description" rows="3" placeholder="描述错误原因和正确思路..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl resize-none"></textarea>
                        </div>
                        
                        <div class="pt-4 border-t border-slate-100">
                            <div class="flex bg-slate-100/80 rounded-xl p-1 mb-4 w-full md:w-2/3 lg:w-1/2">
                                <button @click="formTab = 'mistake'" :class="formTab === 'mistake' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition flex justify-center items-center gap-2">
                                    <i class="fas fa-image"></i> 错题照片
                                </button>
                                <button @click="formTab = 'answer'" :class="formTab === 'answer' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition flex justify-center items-center gap-2">
                                    <i class="fas fa-check-double"></i> 正确答案照片
                                </button>
                            </div>

                            <div v-show="formTab === 'mistake'" class="animate-fade-in">
                                <div class="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 relative group text-center cursor-pointer hover:bg-slate-100 transition mb-4">
                                    <input type="file" multiple accept="image/*" @change="e => handleImageUpload(e, 'mistake')" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                    <div class="bg-indigo-100 text-indigo-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                        <i class="fas fa-camera text-xl"></i>
                                    </div>
                                    <h4 class="font-bold text-slate-700 mb-1">上传错题原题 / 错误过程照片</h4>
                                    <p class="text-xs text-slate-500">上传后可点击照片【添加遮挡】</p>
                                </div>
                                <div v-if="newMistakeForm.mistakeImages.length > 0" class="grid grid-cols-3 md:grid-cols-4 gap-3">
                                    <div v-for="(img, idx) in newMistakeForm.mistakeImages" :key="'m-'+idx" class="relative group aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-800 shadow-sm hover:shadow-md transition">
                                        <img :src="img.url" class="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition duration-300">
                                        <div class="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 z-20">
                                            <button @click.stop="openOccEditor(idx)" class="bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-full mb-2 hover:bg-indigo-600 shadow-md transform hover:scale-105 transition"><i class="fas fa-mask mr-1"></i>编辑遮挡</button>
                                            <button @click.stop="removeMistakeImage(idx)" class="bg-red-500 text-white text-xs px-3 py-1.5 rounded-full hover:bg-red-600 shadow-md transform hover:scale-105 transition"><i class="fas fa-trash mr-1"></i>删除照片</button>
                                        </div>
                                        <div v-if="img.masks && img.masks.length" class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm pointer-events-none shadow-sm">{{ img.masks.length }} 个遮挡</div>
                                    </div>
                                </div>
                            </div>

                            <div v-show="formTab === 'answer'" class="animate-fade-in">
                                <div class="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 relative group text-center cursor-pointer hover:bg-slate-100 transition mb-4">
                                    <input type="file" multiple accept="image/*" @change="e => handleImageUpload(e, 'answer')" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                                    <div class="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                        <i class="fas fa-file-image text-xl"></i>
                                    </div>
                                    <h4 class="font-bold text-slate-700 mb-1">上传正确解法 / 标准答案照片</h4>
                                    <p class="text-xs text-slate-500">选填：作为复习核对的参考</p>
                                </div>
                                <div v-if="newMistakeForm.answerImages.length > 0" class="grid grid-cols-3 md:grid-cols-4 gap-3">
                                    <div v-for="(img, idx) in newMistakeForm.answerImages" :key="'a-'+idx" class="relative group aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-800 shadow-sm hover:shadow-md transition">
                                        <img :src="img" class="w-full h-full object-cover group-hover:opacity-80 transition duration-300">
                                        <button @click.stop="removeAnswerImage(idx)" class="absolute top-2 right-2 bg-red-500/90 hover:bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 z-20 transition shadow-md transform hover:scale-110"><i class="fas fa-times"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-4 mt-8 pt-6 border-t border-slate-100">
                        <button @click="showModal=false" class="flex-1 py-3.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                        <button @click="submitMistake" class="flex-1 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">{{ isEditing ? '保存修改 (不影响计划)' : '保存并生成计划' }}</button>
                    </div>
                </div>
            </div>

            <div v-if="occEditor.show" class="fixed inset-0 bg-slate-900/95 z-[110] flex flex-col animate-fade-in text-white backdrop-blur-md">
                <div class="h-16 px-6 border-b border-white/10 flex justify-between items-center bg-slate-900 shrink-0">
                    <div class="flex items-center gap-4">
                        <button @click="closeOccEditor" class="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition"><i class="fas fa-times"></i></button>
                        <h3 class="font-bold text-lg">编辑错题图片遮挡</h3>
                        <span class="text-xs text-slate-400 ml-4">在图片上 <span class="text-indigo-400 font-bold">按住左键拖动</span> 绘制遮盖区域掩盖答案</span>
                    </div>
                    <button @click="saveOccEditor" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition transform active:scale-95">完成遮挡</button>
                </div>
                
                <div class="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-8 select-none"
                     @mousemove="handleMouseMoveOcc" 
                     @mouseup="handleMouseUpOcc" 
                     @mouseleave="handleMouseUpOcc">
                    
                    <div class="relative inline-block shadow-2xl rounded-lg overflow-hidden cursor-crosshair" 
                         @mousedown="startDrawOcc" 
                         ref="occImageContainer">
                        
                        <img :src="occEditor.url" class="max-h-[80vh] max-w-full block select-none pointer-events-none" draggable="false">
                        
                        <div v-for="(mask, idx) in occEditor.masks" :key="idx" 
                             class="absolute bg-orange-500/80 border border-orange-300 shadow-sm flex items-center justify-center group z-10" 
                             :style="{ left: mask.x + '%', top: mask.y + '%', width: mask.w + '%', height: mask.h + '%', transform: 'rotate(' + (mask.r || 0) + 'deg)', transformOrigin: 'center center' }">
                            
                            <button @click.stop="removeOccMask(idx)" class="absolute -top-3 -right-3 w-6 h-6 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600 z-20">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div v-if="activeDrawingOcc" class="absolute bg-blue-500/40 border border-blue-300 z-20 pointer-events-none" :style="{ left: activeDrawingOcc.x + '%', top: activeDrawingOcc.y + '%', width: activeDrawingOcc.w + '%', height: activeDrawingOcc.h + '%', transform: 'rotate(' + (activeDrawingOcc.r || 0) + 'deg)', transformOrigin: 'center center' }"></div>
                    </div>
                </div>
            </div>

        </div>
    `
}
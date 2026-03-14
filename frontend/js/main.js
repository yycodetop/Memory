/**
 * js/main.js
 * 应用主入口 - 迭代版 v3.3
 * 修复：解决首页(Dashboard)图片遮挡快捷入口点击无效的问题 (指令重定向)
 */
import { createApp, ref, computed, onMounted } from 'vue';

// 导入业务模块
import { useTasks } from './composables/useTasks.js';
import { useVocabulary } from './composables/useVocabulary.js';
import { usePomodoro } from './composables/usePomodoro.js';
import { useConcepts } from './composables/useConcepts.js';
import { useFeynman } from './composables/useFeynman.js';
import { useImageOcclusion } from './composables/useImageOcclusion.js';

// 导入组件
import DashboardApp from './apps/DashboardApp.js';
import EnglishApp from './apps/EnglishApp.js';
import ConceptApp from './apps/ConceptApp.js';
import FeynmanApp from './apps/FeynmanApp.js';
import ImageOcclusionApp from './apps/ImageOcclusionApp.js'; 
import TheDock from './components/TheDock.js';
import MistakeApp from './apps/MistakeApp.js';
import LearningLogApp from './apps/LearningLogApp.js'; // [新增]

const app = createApp({
    components: { 
        DashboardApp, 
        EnglishApp, 
        ConceptApp, 
        FeynmanApp, 
        ImageOcclusionApp, 
        TheDock,
        MistakeApp,
        LearningLogApp
    },
    template: `
    <div id="app" v-cloak class="h-full flex flex-col relative">
        
        <header class="h-16 px-8 flex justify-between items-center bg-white/60 backdrop-blur-md border-b border-white/50 z-20">
            <div class="font-bold text-xl flex items-center gap-2">
                <span v-if="currentApp === 'dashboard'">综合概览</span>
                <span v-else-if="currentApp === 'english'"> 英语工作室</span>
                <span v-else-if="currentApp === 'cloze'"> 概念实验室</span> 
                <span v-else-if="currentApp === 'feynman'"> 费曼自测</span>
                <span v-else-if="currentApp === 'occlusion'"> 图像遮挡</span>
                <span v-else-if="currentApp === 'mistakes'"> 错题日志</span>
                <span v-else-if="currentApp === 'learninglog'">学习日志</span> 
            </div>
            <div v-if="currentApp === 'dashboard'" class="flex items-center bg-slate-200/50 rounded-full p-1 text-sm">
                <button @click="changeMonth(-1)" class="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-slate-500 transition">←</button>
                <span class="px-4 font-bold tabular-nums text-slate-700">{{ currentYear }}年 {{ currentMonth + 1 }}月</span>
                <button @click="changeMonth(1)" class="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-slate-500 transition">→</button>
            </div>
        </header>

        <main class="flex-1 overflow-hidden p-6 pb-32 relative">
            
            <dashboard-app v-if="currentApp === 'dashboard'"
                :calendar-days="calendarDays" :current-day-tasks="currentDayTasks" :all-tasks="tasks" :selected-date="selectedDate" :start-day-of-week="startDayOfWeek" :categories="categories" :chart-data="chartData" :grades="grades" 
                @select-date="selectDate" @open-pomodoro="openPomodoroModal" @open-rate="openRateModal" @edit-task="openEditTaskModal" @delete-task="deleteTask" @add-category="addCategory" @delete-category="deleteCategory" @postpone-task="handlePostponeTask" 
                @switch-app="handleSwitchApp" 
                @quick-add-concept="handleQuickAddConcept" 
                @add-concept="handleDashboardAddConcept"
            ></dashboard-app>

            <english-app v-if="currentApp === 'english'"
                :books="books" :current-book="currentBook" :vocabulary="vocabulary" :recitation-data="recitationData" :subject-tasks="englishTasks" :pos-options="posOptions" :book-icons="bookIcons" 
                @select-book="selectBook" @create-book="createBook" @delete-book="deleteBook" @update-book="updateBook" @export-book="exportBook" @request-recitation="handleRecitationRequest" @add-word="handleAddWord" @update-word="updateWord" @delete-word="deleteWord" @upload="handleVocabUpload" @download="downloadTemplate"
            ></english-app>

            <concept-app v-if="currentApp === 'cloze'"
                :mode="currentApp" :concepts="getConceptsByType(currentApp)" :subjects="categories" :grades="grades" :initial-action="conceptInitialAction"  
                @add-concept="addConcept" @update-concept="handleUpdateConcept" @delete-concept="deleteConcept" @refresh="loadConcepts" @back-home="handleSwitchApp('dashboard')"
            ></concept-app>

            <feynman-app v-if="currentApp === 'feynman'"
                :concepts="feynmanList" :subjects="categories" :grades="grades" 
                @add-concept="addFeynman" @update-concept="updateFeynman" @delete-concept="deleteFeynman" @back-home="handleSwitchApp('dashboard')"
            ></feynman-app>

            <image-occlusion-app v-if="currentApp === 'occlusion'"
                :subjects="categories"
                :grades="grades"
                :occlusions="occlusionList"
                @add-occlusion="addOcclusion"
                @update-occlusion="updateOcclusion"
                @delete-occlusion="deleteOcclusion"
                @back-home="handleSwitchApp('dashboard')"
            ></image-occlusion-app>

            <mistake-app v-if="currentApp === 'mistakes'"
                :categories="categories"
                @create-ebbinghaus-task="handleCreateMistakeTask"
            ></mistake-app>

            <learning-log-app v-if="currentApp === 'learninglog'"
                :categories="categories"
                @create-ebbinghaus-task="handleCreateMistakeTask"
            ></learning-log-app>
        </main>

        <the-dock 
            :current-app="currentApp" 
            @switch-app="handleSwitchApp"
            @add-task="openAddTaskModal"
            @open-pomodoro="openPomodoroModal(null)"
        ></the-dock>

        <div v-if="showTaskModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 scale-up max-h-[90vh] overflow-y-auto">
                <h3 class="text-2xl font-bold mb-6 text-slate-800">{{ isEditing ? '编辑任务' : '新建任务' }}</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">任务名称</label>
                        <input v-model="newTask.title" placeholder="例如: 新概念英语Lesson1" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">科目分类</label>
                            <select v-model="newTask.category" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="" disabled>选择科目</option>
                                <option v-for="c in categories" :value="c">{{ c }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">开始日期</label>
                            <input type="date" v-model="newTask.startDate" :disabled="isEditing" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
                        </div>
                    </div>
                    <div v-if="!isEditing" class="flex gap-2 p-1 bg-slate-100 rounded-xl mt-2">
                         <button @click="newTask.type='ebbinghaus'" :class="newTask.type==='ebbinghaus'?'bg-white shadow text-indigo-600':'text-slate-500'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-all"><i class="fas fa-chart-line mr-1"></i> 艾宾浩斯</button>
                         <button @click="newTask.type='weekend'" :class="newTask.type==='weekend'?'bg-white shadow text-indigo-600':'text-slate-500'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-all"><i class="fas fa-calendar-week mr-1"></i> 周末复习</button>
                    </div>
                    <div v-if="newTask.type === 'weekend' && !isEditing" class="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 space-y-3 animate-fade-in">
                        <div>
                            <label class="block text-xs font-bold text-indigo-500 mb-1">结束日期 (区间范围)</label>
                            <input type="date" v-model="newTask.endDate" class="w-full px-4 py-2 bg-white border border-indigo-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-indigo-500 mb-2">复习时间</label>
                            <div class="flex gap-4">
                                <label class="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-indigo-100 flex-1 justify-center hover:bg-indigo-50 transition">
                                    <input type="checkbox" v-model="newTask.weekendDays" :value="6" class="accent-indigo-600 w-4 h-4">
                                    <span class="text-sm font-bold text-slate-600">周六 (Sat)</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-indigo-100 flex-1 justify-center hover:bg-indigo-50 transition">
                                    <input type="checkbox" v-model="newTask.weekendDays" :value="0" class="accent-indigo-600 w-4 h-4">
                                    <span class="text-sm font-bold text-slate-600">周日 (Sun)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">附件</label>
                        <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-indigo-400 transition bg-slate-50 relative group">
                            <input type="file" multiple @change="handleFileUpload" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                            <div class="text-center text-slate-400 pointer-events-none">
                                <i class="fas fa-cloud-upload-alt text-2xl mb-2"></i>
                                <p class="text-xs">点击或拖拽上传</p>
                            </div>
                        </div>
                        <div v-if="newTask.attachments && newTask.attachments.length > 0" class="mt-3 grid grid-cols-4 gap-2">
                            <div v-for="(att, idx) in newTask.attachments" :key="idx" class="relative group aspect-square rounded-lg border border-slate-200 overflow-hidden bg-white">
                                <img v-if="att.type.startsWith('image/')" :src="att.data" class="w-full h-full object-cover">
                                <div v-else class="w-full h-full flex items-center justify-center text-slate-400 bg-slate-50 text-2xl"><i class="fas fa-file"></i></div>
                                <button @click="removeAttachment(idx)" class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm z-20"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-8">
                    <button @click="showTaskModal=false" class="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                    <button @click="confirmAddTask" class="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition transform active:scale-95">{{ isEditing ? '保存修改' : '立即创建' }}</button>
                </div>
            </div>
        </div>

        <div v-if="pomodoroModal.show" class="fixed inset-0 bg-slate-900/95 z-[70] flex items-center justify-center flex-col text-white animate-fade-in">
            <div class="text-8xl font-mono font-bold mb-8 tracking-wider tabular-nums">{{ formatTime(pomodoroModal.timeLeft) }}</div>
            <div class="text-xl opacity-60 mb-12">{{ pomodoroModal.taskItem ? '专注任务: ' + pomodoroModal.taskItem.title : '自由专注模式' }}</div>
            <div class="flex gap-6">
                <button v-if="!pomodoroModal.isRunning" @click="startPomodoro" class="px-10 py-4 bg-indigo-500 rounded-full font-bold text-xl hover:scale-105 transition shadow-lg shadow-indigo-500/50">开始</button>
                <button v-else @click="togglePomodoroPause" class="px-10 py-4 bg-white/10 rounded-full font-bold text-xl hover:bg-white/20 transition">{{ pomodoroModal.isPaused ? '继续' : '暂停' }}</button>
                <button @click="stopPomodoro" class="px-10 py-4 text-white/40 font-bold hover:text-white transition">结束</button>
            </div>
        </div>

        <div v-if="ratingModal.show" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center animate-fade-in">
            <div class="bg-white rounded-3xl p-8 text-center max-w-sm shadow-2xl scale-up">
                <h3 class="font-bold text-xl mb-6 text-slate-800">本次记忆效果如何？</h3>
                <div class="grid grid-cols-3 gap-3 mb-6">
                    <button @click="confirmRating('SSS')" class="p-4 bg-yellow-50 text-yellow-700 rounded-xl border border-yellow-200 hover:bg-yellow-100 transition transform hover:-translate-y-1"><div class="text-2xl mb-1">⚡️</div><div class="text-xs font-bold">秒杀</div></button>
                    <button @click="confirmRating('SS')" class="p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 hover:bg-emerald-100 transition transform hover:-translate-y-1"><div class="text-2xl mb-1">👍</div><div class="text-xs font-bold">记得</div></button>
                    <button @click="confirmRating('S')" class="p-4 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-100 transition transform hover:-translate-y-1"><div class="text-2xl mb-1">🤔</div><div class="text-xs font-bold">模糊</div></button>
                </div>
                <button @click="ratingModal.show=false" class="text-slate-400 hover:text-slate-600 transition">取消</button>
            </div>
        </div>

    </div>
    `,
    setup() {
        const API_BASE = 'http://localhost:3000/api';
        
        // 初始化各业务模块
        const taskModule = useTasks(API_BASE);
        const vocabModule = useVocabulary(API_BASE);
        const pomodoroModule = usePomodoro();
        const conceptModule = useConcepts(API_BASE);
        const feynmanModule = useFeynman(API_BASE); 
        const occlusionModule = useImageOcclusion(API_BASE); 

        const currentApp = ref('dashboard');
        const recitationData = ref([]); 
        const conceptInitialAction = ref(null);
        
        const englishTasks = computed(() => {
            const now = new Date().toISOString().split('T')[0];
            if (!taskModule.tasks.value) return [];
            return taskModule.tasks.value
                .filter(t => t.category === '英语' && Array.isArray(t.schedule))
                .map(t => {
                    const next = t.schedule.find(n => !n.completed && n.date >= now);
                    return next ? { id: t.id, title: t.title, nextDate: next.date, nextStage: next.stage } : null;
                })
                .filter(Boolean)
                .sort((a,b) => a.nextDate.localeCompare(b.nextDate))
                .slice(0, 10);
        });

        onMounted(async () => {
            await Promise.all([
                taskModule.loadTasks(), 
                vocabModule.loadBooks(),
                conceptModule.loadConcepts(),
                feynmanModule.loadFeynman(),
                occlusionModule.loadOcclusion() 
            ]);
        });

        // ==========================================
        // 核心修复：添加指令拦截器，统一处理应用切换
        // ==========================================
        const handleSwitchApp = (id) => {
            // 兼容首页或旧代码可能传来的 'image' 指令，自动转给 'occlusion'
            if (id === 'image') id = 'occlusion';
            currentApp.value = id;
        };

        const handleQuickAddConcept = (mode) => {
            // 兼容首页快捷添加的 'image' 指令
            if (mode === 'image') mode = 'occlusion';
            
            currentApp.value = mode;
            conceptInitialAction.value = 'add';
            setTimeout(() => { conceptInitialAction.value = null; }, 500);
        };
        // ==========================================

        const handleAddWord = async (wordObj) => {
            vocabModule.newWord.value = wordObj; 
            await vocabModule.addManualWord();
        };

        const handleRecitationRequest = async (bookIds) => {
            const data = await vocabModule.fetchAggregateVocab(bookIds);
            recitationData.value = data;
        };

        const handlePostponeTask = ({ taskId, stage, days }) => {
            taskModule.postponeTask(taskId, stage, days);
        };

        const handleConceptImport = async (file) => {
            try {
                const result = await conceptModule.importConceptsFromExcel(file, 'cloze');
                alert(`导入完成！\n成功: ${result.success} 条\n跳过: ${result.skipped} 条 (格式错误或缺少数据)`);
                await conceptModule.loadConcepts();
            } catch (e) {
                console.error(e);
                alert("导入失败，请检查文件格式。\n需要包含: 年级 | 课程 | 原句(含{{关键词}})");
            }
        };

        const handleDashboardAddConcept = (newConcept) => {
            conceptModule.addConcept(newConcept);
        };

        const handleUpdateConcept = (id, data) => {
            conceptModule.updateConcept(id, data);
        };
        // 在 setup() 内部添加
        const handleCreateMistakeTask = async (taskData) => {
            try {
                const res = await fetch(`${API_BASE}/data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskData)
                });
                const newTaskInfo = await res.json();
                tasks.value.push(newTaskInfo); // 将新任务推入总任务列表
                // 如果刚好是今天的任务，重新计算当天任务列表
                calculateCurrentDayTasks(); 
            } catch (err) {
                console.error("创建艾宾浩斯复习任务失败", err);
            }
        };
        return {
            currentApp,
            englishTasks,
            recitationData, 
            conceptInitialAction,
            
            ...taskModule,
            ...vocabModule,
            ...pomodoroModule,
            ...conceptModule, 
            ...feynmanModule,
            ...occlusionModule,
            
            handleSwitchApp, // 暴露给模板使用
            handleAddWord,
            handleRecitationRequest,
            handlePostponeTask,
            handleConceptImport,
            handleQuickAddConcept,
            handleDashboardAddConcept,
            handleUpdateConcept,
            handleCreateMistakeTask
        };
    }
});

app.mount('#app');
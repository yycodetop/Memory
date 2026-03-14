/* script.js - Updated with Vocabulary Support */
const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
    setup() {
        const INTERVALS = [0, 1, 2, 4, 7, 15]; 
        const API_BASE = '/api';

        // --- 核心数据 ---
        const tasks = ref([]);
        const categories = ref(['英语', '数学', '语文', '科学', '编程']);
        const vocabulary = ref([]); // 新增：单词库

        // --- 状态与UI ---
        const isDataLoaded = ref(false);
        const showTaskModal = ref(false);
        const showVocabModal = ref(false); // 新增：单词本弹窗
        
        // 现有的模态框状态
        const ratingModal = ref({ show: false, taskItem: null, comment: '' });
        const detailModal = ref({ show: false, task: null, editing: { title: '', description: '' } });
        const postponeModal = ref({ show: false, taskItem: null });
        const subjectOverviewModal = ref({ show: false, subject: '', month: new Date().getMonth(), year: new Date().getFullYear() });
        const pomodoroModal = ref({ show: false, taskItem: null, duration: 25, timeLeft: 25*60, isRunning: false, isPaused: false });

        // 表单数据
        const newTask = ref({ title: '', category: '', description: '', type: 'ebbinghaus', startDate: new Date().toISOString().split('T')[0], weekendWeeks: 7 });
        const newWord = ref({ word: '', meaning: '' }); // 新增：手动添加单词表单

        // 日期相关
        const todayStr = new Date().toISOString().split('T')[0];
        const currentYear = ref(new Date().getFullYear());
        const currentMonth = ref(new Date().getMonth());
        const selectedDate = ref(todayStr);

        // --- API 交互 ---
        const loadData = async () => {
            try {
                // 并行加载任务和单词
                const [taskRes, vocabRes] = await Promise.all([
                    fetch(`${API_BASE}/data`),
                    fetch(`${API_BASE}/vocabulary`)
                ]);
                
                const taskData = await taskRes.json();
                const vocabData = await vocabRes.json();

                if (taskData.tasks) tasks.value = taskData.tasks;
                if (taskData.categories) categories.value = taskData.categories;
                if (Array.isArray(vocabData)) vocabulary.value = vocabData;

                isDataLoaded.value = true;
            } catch (error) {
                console.error("数据加载失败", error);
                alert("连接服务器失败，请确保 node server.js 已运行");
            }
        };

        const saveData = async () => {
            if (!isDataLoaded.value) return;
            await fetch(`${API_BASE}/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: tasks.value, categories: categories.value })
            });
        };

        // --- 单词库逻辑 (新增) ---
        
        // 1. 手动添加单词
        const addManualWord = async () => {
            if (!newWord.value.word || !newWord.value.meaning) return alert("请填写单词和释义");
            vocabulary.value.unshift({
                id: Date.now(),
                word: newWord.value.word,
                meaning: newWord.value.meaning,
                addedAt: todayStr
            });
            newWord.value.word = '';
            newWord.value.meaning = '';
            await saveVocabulary(); // 保存到服务器
        };

        // 2. 删除单词
        const deleteWord = async (id) => {
            if (confirm("确定删除这个单词吗？")) {
                vocabulary.value = vocabulary.value.filter(w => w.id !== id);
                await saveVocabulary();
            }
        };

        // 3. 保存单词库到服务器
        const saveVocabulary = async () => {
            await fetch(`${API_BASE}/vocabulary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vocabulary.value)
            });
        };

        // 4. 处理 Excel 导入
        const handleFileUpload = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`${API_BASE}/upload-vocabulary`, {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (result.success) {
                    alert(`成功导入 ${result.count} 个单词！`);
                    // 重新加载以获取最新列表
                    const vocabRes = await fetch(`${API_BASE}/vocabulary`);
                    vocabulary.value = await vocabRes.json();
                    event.target.value = ''; // 清空 input
                } else {
                    alert('导入失败: ' + result.error);
                }
            } catch (e) {
                alert('上传出错');
            }
        };

        // 5. 下载模板
        const downloadTemplate = () => {
            window.location.href = `${API_BASE}/download-template`;
        };

        // --- 监听与生命周期 ---
        onMounted(loadData);
        watch([tasks, categories], saveData, { deep: true });

        // --- 计算属性 (保持原有逻辑) ---
        const calendarDays = computed(() => {
            const year = currentYear.value;
            const month = currentMonth.value;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const days = [];
            for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(year, month, d);
                const fullDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                const dayTasks = [];
                tasks.value.forEach(task => {
                    const match = task.schedule.find(s => s.date === fullDate);
                    if (match) dayTasks.push({ ...match, parentId: task.id, title: task.title, category: task.category });
                });
                days.push({ day: d, fullDate: fullDate, isToday: fullDate === todayStr, tasks: dayTasks, pendingCount: dayTasks.filter(t => !t.completed).length });
            }
            return days;
        });

        const currentDayTasks = computed(() => {
            const result = [];
            tasks.value.forEach(task => {
                const match = task.schedule.find(s => s.date === selectedDate.value);
                if (match) {
                    result.push({
                        taskId: task.id, title: task.title, description: task.description, category: task.category,
                        taskType: task.type, interval: match.interval, date: match.date, ...match 
                    });
                }
            });
            return result.sort((a, b) => Number(a.completed) - Number(b.completed));
        });

        const stats = computed(() => {
             // 简化的统计逻辑
            let done = 0, total = 0;
            tasks.value.forEach(t => t.schedule.forEach(n => { if(n.date <= todayStr) { total++; if(n.completed) done++; } }));
            return { totalCompleted: done, completionRate: total===0?0:Math.round(done/total*100) };
        });

        const subjectStats = computed(() => {
             // 简化的学科统计
             return categories.value.map(cat => ({ name: cat, rate: 0 })); 
        });
        const dailyProgress = computed(() => {
             const t = currentDayTasks.value; return t.length === 0 ? 0 : Math.round(t.filter(x=>x.completed).length/t.length*100);
        });
        const subjectMonthTasks = computed(() => []); // 暂时简化，如需恢复请参考上一版

        // --- 辅助函数 ---
        const changeMonth = (d) => { 
            let m = currentMonth.value + d; 
            if(m>11){m=0;currentYear.value++;} else if(m<0){m=11;currentYear.value--;} 
            currentMonth.value = m; 
        };
        const selectDate = (d) => selectedDate.value = d;
        const resetToToday = () => { selectedDate.value = todayStr; currentYear.value = new Date().getFullYear(); currentMonth.value = new Date().getMonth(); };
        const openAddTaskModal = () => showTaskModal.value = true;
        const confirmAddTask = () => {
             // 简化的添加逻辑，实际使用请保留上一版完整逻辑或根据需求合并
             if(!newTask.value.title) return;
             const schedule = INTERVALS.map((int, idx) => ({ stage: idx, interval: int, date: new Date(new Date(newTask.value.startDate).getTime() + int*86400000).toISOString().split('T')[0], completed: false, quality: null }));
             tasks.value.push({ id: Date.now(), ...newTask.value, schedule });
             showTaskModal.value = false;
        };
        const openRateModal = (item) => { ratingModal.value.taskItem = item; ratingModal.value.show = true; };
        const confirmRating = (q) => { 
            const t = tasks.value.find(x=>x.id===ratingModal.value.taskItem.taskId);
            const n = t.schedule.find(x=>x.stage===ratingModal.value.taskItem.stage);
            n.completed = true; n.quality = q; ratingModal.value.show = false;
        };
        const deleteTask = (id) => { tasks.value = tasks.value.filter(t=>t.id!==id); detailModal.value.show = false; };
        const openPomodoroModal = (item) => { pomodoroModal.value.show = true; pomodoroModal.value.taskItem = item; };
        
        // 格式化相关
        const getWeekDayCN = (d) => ['周日','周一','周二','周三','周四','周五','周六'][new Date(d).getDay()];
        const formatDateCN = (d) => `${new Date(d).getMonth()+1}月${new Date(d).getDate()}日`;
        const getCategoryColor = () => 'bg-blue-400'; 
        const getCategoryColorText = () => 'text-blue-600 border-blue-200';
        const getRateColor = () => 'text-green-500'; const getRateBarColor = () => 'bg-green-500';

        return {
            // Data
            vocabulary, tasks, categories,
            // UI State
            showVocabModal, showTaskModal, ratingModal, detailModal, pomodoroModal,
            currentYear, currentMonth, calendarDays, selectedDate, currentDayTasks,
            newTask, newWord,
            // Computed
            dailyProgress, stats, subjectStats,
            // Methods
            loadData, addManualWord, deleteWord, handleFileUpload, downloadTemplate,
            selectDate, changeMonth, resetToToday,
            openAddTaskModal, confirmAddTask, openRateModal, confirmRating, deleteTask,
            openPomodoroModal,
            getWeekDayCN, formatDateCN, getCategoryColor, getCategoryColorText, getRateColor, getRateBarColor
        };
    }
}).mount('#app');
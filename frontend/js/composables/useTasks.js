/**
 * js/composables/useTasks.js
 * 任务管理核心 - 修复 currentDayTasks 缺少 date 字段导致的 UI 判断失效问题
 */
import { ref, computed, watch } from 'vue';

export function useTasks(API_BASE) {
    const tasks = ref([]);
    const categories = ref(['英语', '数学', '编程', '语文', '科学']); 
    const isDataLoaded = ref(false);
    
    const currentYear = ref(new Date().getFullYear());
    const currentMonth = ref(new Date().getMonth());
    const todayStr = new Date().toISOString().split('T')[0];
    const selectedDate = ref(todayStr);

    const showTaskModal = ref(false);
    const isEditing = ref(false);
    const editingTaskId = ref(null);
    const ratingModal = ref({ show: false, taskItem: null });
    
    const defaultTaskState = { 
        title: '', 
        category: '', 
        type: 'ebbinghaus', 
        startDate: todayStr, 
        endDate: '', 
        weekendDays: [0, 6], 
        attachments: [] 
    };
    
    const newTask = ref({ ...defaultTaskState });
    const INTERVALS = [0, 1, 2, 4, 7, 15];

    // --- 数据加载与保存 (解绑分类) ---
    const loadCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/categories`);
            categories.value = await res.json();
        } catch (e) { console.error(e); }
    };

    const saveCategories = async () => {
        await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categories.value)
        });
    };

    const loadTasks = async () => {
        try {
            const res = await fetch(`${API_BASE}/data`);
            const data = await res.json();
            if (data.tasks) tasks.value = data.tasks;
            
            // 独立加载分类
            await loadCategories();
            
            isDataLoaded.value = true;
        } catch (e) { console.error(e); }
    };

    const saveTasks = async () => {
        if (!isDataLoaded.value) return;
        await fetch(`${API_BASE}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: tasks.value }) // 不再同时保存 categories
        });
    };
    
    // 关键：现在只监听 tasks 的变化，不再监听 categories
    watch(tasks, saveTasks, { deep: true });

    // --- 分类管理 (独立保存) ---
    const addCategory = async (name) => {
        const trimmed = name.trim();
        if (trimmed && !categories.value.includes(trimmed)) {
            categories.value.push(trimmed);
            await saveCategories(); // 独立触发保存
        }
    };
    
    const deleteCategory = async (name) => {
        if (confirm(`确定要删除分类 "${name}" 吗？`)) {
            categories.value = categories.value.filter(c => c !== name);
            await saveCategories(); // 独立触发保存
        }
    };

    // --- 统计数据模型 ---
    const chartData = computed(() => {
        const categoryCounts = {};
        tasks.value.forEach(t => {
            if (!categoryCounts[t.category]) categoryCounts[t.category] = 0;
            categoryCounts[t.category]++;
        });
        const pieData = Object.keys(categoryCounts).map(k => ({ value: categoryCounts[k], name: k }));

        const weeklyLabels = [];
        const weeklyValues = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            let count = 0;
            tasks.value.forEach(t => {
                if (t.schedule) {
                    const completedItem = t.schedule.find(s => s.date === dStr && s.completed);
                    if (completedItem) count++;
                }
            });
            weeklyLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
            weeklyValues.push(count);
        }

        let totalItems = 0;
        let completedItems = 0;
        tasks.value.forEach(t => {
            t.schedule.forEach(s => {
                if (s.date <= todayStr) {
                    totalItems++;
                    if (s.completed) completedItems++;
                }
            });
        });
        const completionRate = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

        return { pieData, weeklyLabels, weeklyValues, completionRate };
    });

    // --- 日历核心逻辑 ---
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
                if (match) dayTasks.push({ 
                    ...match, 
                    taskId: task.id, 
                    title: task.title, 
                    category: task.category,
                    type: task.type,
                    attachments: task.attachments || []
                });
            });
            
            days.push({
                day: d,
                fullDate: fullDate,
                isToday: fullDate === todayStr,
                tasks: dayTasks
            });
        }
        return days;
    });

    const startDayOfWeek = computed(() => new Date(currentYear.value, currentMonth.value, 1).getDay());

    // [关键修复]：确保返回的对象中包含 date 字段
    const currentDayTasks = computed(() => {
        const result = [];
        tasks.value.forEach(task => {
            const match = task.schedule.find(s => s.date === selectedDate.value);
            if (match) result.push({ 
                taskId: task.id, 
                title: task.title, 
                category: task.category, 
                type: task.type,
                attachments: task.attachments || [], 
                interval: match.interval, 
                completed: match.completed, 
                quality: match.quality, 
                date: match.date, // <--- 修复：补全日期字段
                scheduleItem: match 
            });
        });
        return result.sort((a, b) => Number(a.completed) - Number(b.completed));
    });

    const dailyProgress = computed(() => {
        const total = currentDayTasks.value.length;
        if (total === 0) return 0;
        return Math.round((currentDayTasks.value.filter(t => t.completed).length / total) * 100);
    });

    // --- Actions ---
    const addDays = (d, n) => { const date = new Date(d); date.setDate(date.getDate() + n); return date.toISOString().split('T')[0]; };

    const openAddTaskModal = () => {
        isEditing.value = false;
        editingTaskId.value = null;
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        newTask.value = { ...defaultTaskState, startDate: todayStr, endDate: nextMonth.toISOString().split('T')[0] };
        showTaskModal.value = true;
    };

    const openEditTaskModal = (taskItem) => {
        const fullTask = tasks.value.find(t => t.id === taskItem.taskId);
        if(!fullTask) return;
        isEditing.value = true;
        editingTaskId.value = fullTask.id;
        newTask.value = JSON.parse(JSON.stringify(fullTask));
        if(!newTask.value.attachments) newTask.value.attachments = [];
        if(!newTask.value.weekendDays) newTask.value.weekendDays = [0, 6];
        showTaskModal.value = true;
    };

    const deleteTask = (taskId) => {
        if(!confirm('⚠️ 警告\n确定要删除这个任务吗？')) return;
        tasks.value = tasks.value.filter(t => t.id !== taskId);
    };

    const postponeTask = (taskId, stage, days) => {
        const task = tasks.value.find(t => t.id === taskId);
        if (!task || !task.schedule) return;
        
        const delay = parseInt(days, 10);
        if (isNaN(delay) || delay <= 0) return;

        const startIndex = task.schedule.findIndex(s => s.stage === stage);
        if (startIndex === -1) return;

        for (let i = startIndex; i < task.schedule.length; i++) {
            const item = task.schedule[i];
            const oldDate = new Date(item.date);
            const newDate = new Date(oldDate.setDate(oldDate.getDate() + delay));
            item.date = newDate.toISOString().split('T')[0];
        }
    };

    const handleFileUpload = async (event) => {
        const files = event.target.files;
        if (!files.length) return;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = (e) => {
                newTask.value.attachments.push({ name: file.name, type: file.type, data: e.target.result });
            };
            reader.readAsDataURL(file);
        }
        event.target.value = ''; 
    };
    
    const removeAttachment = (index) => newTask.value.attachments.splice(index, 1);

    const generateWeekendSchedule = (start, end, days) => {
        const schedule = [];
        let current = new Date(start);
        const endDateObj = new Date(end);
        let guard = 0;
        while(current <= endDateObj && guard < 365) {
            if (days.includes(current.getDay())) {
                schedule.push({ stage: 0, interval: 0, date: current.toISOString().split('T')[0], completed: false });
            }
            current.setDate(current.getDate() + 1);
            guard++;
        }
        return schedule;
    };

    const confirmAddTask = () => {
        if (!newTask.value.title || !newTask.value.category) return alert("请填写完整任务信息");
        
        if (isEditing.value) {
            const idx = tasks.value.findIndex(t => t.id === editingTaskId.value);
            if (idx !== -1) {
                const oldTask = tasks.value[idx];
                tasks.value[idx] = { ...oldTask, ...newTask.value };
            }
        } else {
            let schedule = [];
            if (newTask.value.type === 'ebbinghaus') {
                schedule = INTERVALS.map((int, i) => ({ stage: i, interval: int, date: addDays(newTask.value.startDate, int), completed: false }));
            } else if (newTask.value.type === 'weekend') {
                if (!newTask.value.endDate) return alert("周末复习任务请选择结束日期");
                if (!newTask.value.weekendDays || newTask.value.weekendDays.length === 0) return alert("请至少选择周六或周日");
                schedule = generateWeekendSchedule(newTask.value.startDate, newTask.value.endDate, newTask.value.weekendDays);
                if (schedule.length === 0) return alert("所选日期范围内没有对应的周末。");
            }
            tasks.value.push({ id: Date.now(), ...newTask.value, schedule });
        }
        showTaskModal.value = false;
        newTask.value = { ...defaultTaskState };
    };

    const confirmRating = (q) => {
        const { scheduleItem } = ratingModal.value.taskItem;
        if (scheduleItem) { scheduleItem.completed = true; scheduleItem.quality = q; }
        ratingModal.value.show = false;
    };

    const getCategoryColor = (cat) => {
         const map = { '英语': 'bg-blue-500', '数学': 'bg-red-500', '编程': 'bg-slate-700', '语文': 'bg-orange-400', '科学': 'bg-emerald-500' };
         return map[cat] || 'bg-indigo-500';
    };

    return {
        tasks, categories, currentYear, currentMonth, selectedDate, calendarDays, startDayOfWeek,
        currentDayTasks, dailyProgress, showTaskModal, ratingModal, newTask,
        isEditing, editingTaskId,
        loadTasks, confirmAddTask, confirmRating,
        changeMonth: (d) => { let m = currentMonth.value + d; if(m>11){m=0;currentYear.value++;} else if(m<0){m=11;currentYear.value--;} currentMonth.value = m; },
        selectDate: (d) => selectedDate.value = d,
        openAddTaskModal, openEditTaskModal, deleteTask, postponeTask, 
        handleFileUpload, removeAttachment,
        openRateModal: (item) => { ratingModal.value.taskItem = item; ratingModal.value.show = true; },
        addCategory, deleteCategory,
        chartData,
        formatDateCN: (d) => `${new Date(d).getMonth()+1}月${new Date(d).getDate()}日`,
        getWeekDayCN: (d) => ['周日','周一','周二','周三','周四','周五','周六'][new Date(d).getDay()],
        getCategoryColor
    };
}
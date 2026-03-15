/**
 * js/apps/EnglishApp.js
 * 英语工作室 (包含：顶部下拉筛选、左侧工具箱、单词卡片网格、AI沉浸式记忆解码、四合一遗忘曲线复习)
 */
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { useTTS } from '../composables/useTTS.js';

export default {
    props: {
        books: { type: Array, default: () => [] },
        currentBook: { type: Object, default: null },
        bookIcons: { type: Array, default: () => [] },
        vocabulary: { type: Array, default: () => [] },
        recitationData: { type: Array, default: () => [] },
        posOptions: { type: Array, default: () => [] }
    },
    emits: ['selectBook', 'createBook', 'updateBook', 'deleteBook', 'exportBook', 'addWord', 'updateWord', 'deleteWord', 'upload', 'download', 'request-recitation'],
    
    setup(props, { emit }) {
        const API_BASE = `http://${window.location.hostname}:3000/api`;
        // const { speak, speakQueue, stop: stopSpeaking, voices, selectedVoiceURI, rate: ttsRate, isSpeaking } = useTTS();
        const { speak, speakQueue, stop: stopSpeaking, voices, englishVoice, rate: ttsRate, isSpeaking } = useTTS();

       

        // --- 1. 顶部过滤与分类状态 ---
        const filterGrade = ref('');
        const filterTerm = ref('');
        const filterType = ref('');
        const gradeOptions = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三', '其他'];
        const termOptions = ['第一学期', '第二学期', '全学年'];

        const filteredBooksList = computed(() => {
            let list = props.books || [];
            if (filterGrade.value) list = list.filter(b => b.grade === filterGrade.value);
            if (filterTerm.value) list = list.filter(b => b.term === filterTerm.value);
            if (filterType.value) list = list.filter(b => b.type === filterType.value);
            return list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        });

        // --- 2. 基础与表单状态定义 ---
        const selectedVoiceURI = ref('');
        const showCreateModal = ref(false);
        const isEditingBook = ref(false);
        const newBookForm = ref({ id: '', name: '', type: 'word', icon: 'fas fa-book', grade: '其他', term: '全学年', sortOrder: 1 });
        const editingId = ref(null);
        const editForm = ref({ word: '', pos: '', meaning: '' });
        const localNewWord = ref({ word: '', phonetic: '', pos: 'n.', meaning: '' });
        const isFetching = ref(false); 
        const isUpdatingPhonetics = ref(false);
        const searchQuery = ref('');

        // --- 3. AI 记忆解码器状态 ---
        const decoderState = ref({ 
            show: false, 
            isLoading: false, 
            word: '', 
            content: '',
            parsedContent: [], 
            isParsed: false    
        });
        // [新增] 记录已经被魔法解码的单词集合
        const decodedWords = ref(new Set());
        const fetchDecodedWords = async () => {
            try {
                const res = await fetch(`${API_BASE}/ai/decoded-words`);
                if (res.ok) {
                    const words = await res.json();
                    decodedWords.value = new Set(words);
                }
            } catch (e) {}
        };
        // --- 4. 错词本与艾宾浩斯 ---
        const showMistakeBook = ref(false);
        const mistakeList = ref([]);
        const selectedMistakeDate = ref(null); 
        const ebbinghausReviewList = ref([]);
        const isEbbinghausReview = ref(false);
        
        // [新增] 遗忘曲线弹窗状态
        const showEbbinghausModal = ref(false);

        // --- 5. 学习状态 ---
        const showReciteSetup = ref(false);
        const reciteConfig = ref({ 
            selectedBookIds: [], order: 'random', mode: 'unlimited', studyMode: 'recite', duration: 10,
            readRepeat: 2, readInterval: 1.5
        });
        const isWaitingForReciteData = ref(false);
        const isReciting = ref(false);
        const reciteQueue = ref([]);
        const reciteIndex = ref(0);
        const reciteInput = ref('');
        const reciteErrorCount = ref(0);
        const reciteStatus = ref('neutral'); 
        const showAnswer = ref(false);
        const showHintMeaning = ref(false); 
        const showHintWord = ref(false);    
        const inputRef = ref(null);
        const reciteTimer = ref(null);
        const reciteTimeRemaining = ref(0);
        const autoNextTimer = ref(null); 
        const memorizeStage = ref(0); 
        const flashCount = ref(0); 
        const memorizeSessionId = ref(0);
        const readSessionId = ref(0); 

        // --- 6. 连线测试状态 ---
        const isMatchingGame = ref(false);
        const matchGameMode = ref('playing'); 
        const matchTotalQueue = ref([]); 
        const matchBatchSize = 20; 
        const matchCurrentRound = ref(0);
        const matchCol1 = ref([]);
        const matchCol2 = ref([]);
        const matchCol3 = ref([]);
        const matchCol4 = ref([]);
        const matchSelection = ref(null); 
        const matchPairs = ref({});      
        const matchPairOrderMap = ref({}); 
        const matchNextOrder = ref(1);     
        const matchResults = ref([]);    

        // --- Computed 属性 ---
        const filteredVocab = computed(() => {
            let list = props.vocabulary || [];
            if (searchQuery.value.trim()) {
                const q = searchQuery.value.trim().toLowerCase();
                list = list.filter(v => v.word.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q));
            }
            return list;
        });
        
        const mistakeGroups = computed(() => { const groups = {}; mistakeList.value.forEach(m => { if (!groups[m.date]) groups[m.date] = []; groups[m.date].push(m); }); return groups; });
        const sortedMistakeDates = computed(() => Object.keys(mistakeGroups.value).sort((a, b) => new Date(b) - new Date(a)));
        const currentReciteWord = computed(() => reciteQueue.value[reciteIndex.value] || null);
        const wordSlots = computed(() => { if (!currentReciteWord.value) return []; return currentReciteWord.value.word.split('').map((char, i) => ({ char, isSpace: char === ' ', val: reciteInput.value[i] || '', isActive: i === reciteInput.value.length })); });
        const reciteProgress = computed(() => !reciteQueue.value.length ? 0 : Math.round(((reciteIndex.value + 1) / reciteQueue.value.length) * 100));
        const matchCorrectList = computed(() => matchResults.value.filter(r => r.isCorrect));
        const matchWrongList = computed(() => matchResults.value.filter(r => !r.isCorrect));

        // --- 监听器 ---
        // 监听 useTTS 的初始默认语音，赋予 select 初始值
        watch(englishVoice, (newVoice) => {
            if (newVoice && !selectedVoiceURI.value) {
                selectedVoiceURI.value = newVoice.voiceURI;
            }
        }, { immediate: true });

        // 监听用户在下拉框中的选择，并更新给底层的 englishVoice
        watch(selectedVoiceURI, (newURI) => {
            if (newURI) {
                const targetVoice = voices.value.find(v => v.voiceURI === newURI);
                if (targetVoice) {
                    englishVoice.value = targetVoice;
                }
            }
        });

        watch(() => props.currentBook, (newVal) => { 
            if (newVal) { 
                localNewWord.value.pos = newVal.type === 'word' ? 'n.' : 'phrase'; 
                editingId.value = null; 
                searchQuery.value = ''; 
            } 
        }, { immediate: true });
        
        watch(() => props.recitationData, (newData) => {
            if (isWaitingForReciteData.value && newData.length > 0) {
                if (reciteConfig.value.studyMode === 'match') initMatchGame(newData);
                else initRecitationSession(newData);
                isWaitingForReciteData.value = false;
            } else if (isWaitingForReciteData.value && newData.length === 0) { 
                alert("所选单词本没有单词！"); 
                isWaitingForReciteData.value = false; 
            }
        });

        // --- 辅助函数 ---
        const fetchPhonetic = async (word) => {
            if (!word) return '';
            try {
                const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
                if (!res.ok) return '';
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) { const item = data[0]; return item.phonetic || (item.phonetics && item.phonetics.find(p => p.text)?.text) || ''; }
            } catch (e) { }
            return '';
        };

        const getDaysDiff = (dateStr1, dateStr2) => {
            if (!dateStr1 || !dateStr2) return -1;
            const [y1, m1, d1] = dateStr1.split('-'); const [y2, m2, d2] = dateStr2.split('-');
            return Math.round((new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2)) / (1000 * 60 * 60 * 24));
        };

        const loadMistakesData = async () => {
            try {
                const res = await fetch(`${API_BASE}/vocabulary/mistakes`);
                const mistakes = await res.json();
                mistakeList.value = mistakes;
                const todayStr = new Date().toISOString().split('T')[0];
                const intervals = [1, 2, 4, 7, 14]; 
                const dueList = mistakes.filter(m => intervals.includes(getDaysDiff(todayStr, m.date)));
                const uniqueWords = new Map();
                dueList.forEach(m => { if (!uniqueWords.has(m.word)) uniqueWords.set(m.word, m); });
                ebbinghausReviewList.value = Array.from(uniqueWords.values());
            } catch (e) { }
        };

        onMounted(() => { 
            loadMistakesData(); 
            fetchDecodedWords(); // [新增] 加载已解码列表
        });

        const logMistake = async (item) => {
            if (!item || isEbbinghausReview.value) return; 
            try {
                await fetch(`${API_BASE}/vocabulary/mistakes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: item.word, meaning: item.meaning, bookId: item.bookId }) });
                loadMistakesData(); 
            } catch (e) { }
        };

        const getPosColor = (pos) => { const match = props.posOptions.find(p => p.value === pos); return match ? match.color : 'bg-gray-100 text-gray-500'; };
        const formatTime = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        const getPairOrder = (item) => matchPairOrderMap.value[item.cardId] || null;
        const isPaired = (item) => !!matchPairs.value[item.cardId];
        const isSelected = (item) => matchSelection.value && matchSelection.value.cardId === item.cardId;

        // --- 业务逻辑 ---
        
        // AI 记忆解码
        // [史诗级升级] AI 解码方法：支持本地缓存秒开与流式打字机效果
        const openMemoryDecoder = async (wordStr) => {
            decoderState.value = { show: true, isLoading: true, word: wordStr, content: '', parsedContent: [], isParsed: false };
            decodedWords.value.add(wordStr);
            // 封装的解析方法：将 AI 生成的完整文本拆解为酷炫三列卡片
            const processContent = (text) => {
                let cleanStr = text.replace(/```(html)?\n?/gi, '').replace(/```\n?/g, '');
                const split1 = cleanStr.indexOf('🧩');
                const split2 = cleanStr.indexOf('💡');
                const split3 = cleanStr.indexOf('🎯');
                
                if (split1 !== -1 && split2 !== -1 && split3 !== -1) {
                    const raw1 = cleanStr.substring(split1, split2);
                    const raw2 = cleanStr.substring(split2, split3);
                    const raw3 = cleanStr.substring(split3);
                    const cleanPart = (str) => {
                        let s = str.replace(/[\s\S]*?<\/b>[:：]?\s*/i, '');
                        s = s.replace(/^(?:<\/p>|<br\s*\/?>)\s*/i, '');
                        return s.trim();
                    };
                    decoderState.value.parsedContent = [
                         { title: '词根词缀', icon: '🧩', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', content: cleanPart(raw1) },
                         { title: '趣味记忆', icon: '💡', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', content: cleanPart(raw2) },
                         { title: '黄金搭配', icon: '🎯', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', content: cleanPart(raw3) }
                    ];
                    decoderState.value.isParsed = true;
                } else {
                    cleanStr = cleanStr.replace(/<b>/gi, '<b class="text-amber-400 font-black px-1">');
                    decoderState.value.content = cleanStr;
                    decoderState.value.isParsed = false;
                }
            };

            try {
                // 读取本地缓存的 API Key
                const userApiKey = localStorage.getItem('deepseek_api_key') || '';

                const res = await fetch(`${API_BASE}/ai/memory-decoder`,{
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // 将 apiKey 一起发送给后端
                    body: JSON.stringify({ word: wordStr, apiKey: userApiKey })
                });
                
                const contentType = res.headers.get('content-type');
                
                // 【情况 1】如果是 JSON 格式，说明命中了本地缓存或发生了网络错误 (0秒秒开)
                if (contentType && contentType.includes('application/json')) {
                    const data = await res.json();
                    decoderState.value.isLoading = false; // 取消 Loading
                    if (data.success) {
                        processContent(data.content);
                    } else {
                        decoderState.value.content = `<div class="text-red-400 text-center py-4 text-xl">${data.error}</div>`;
                    }
                } 
                // 【情况 2】如果是 Event Stream 格式，进入流式打字机模式
                else {
                    decoderState.value.isLoading = false; // 关闭转圈动画，准备开始打字
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let fullText = '';
                    let buffer = '';
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n\n');
                        buffer = parts.pop(); // 保留不完整的最后一部分
                        
                        for (const part of parts) {
                            if (part.startsWith('data: ')) {
                                const dataStr = part.slice(6);
                                if (dataStr === '[DONE]') continue;
                                
                                try {
                                    const parsed = JSON.parse(dataStr);
                                    if (parsed.error) {
                                        decoderState.value.content = `<div class="text-red-400 text-center py-4 text-xl">${parsed.error}</div>`;
                                        break;
                                    }
                                    if (parsed.text) {
                                        fullText += parsed.text;
                                        // 实时渲染打字机效果：加上一个闪烁的光标
                                        let displayStr = fullText.replace(/\n/g, '<br>');
                                        decoderState.value.content = displayStr + '<span class="text-amber-400 animate-pulse ml-1 text-2xl">▎</span>';
                                    }
                                } catch (e) { /* 忽略解析截断带来的错误 */ }
                            }
                        }
                    }
                    // AI 全部输出完毕后，瞬间将文字拆解重构成极美的三列排版！
                    processContent(fullText);
                }
            } catch (err) {
                decoderState.value.isLoading = false;
                decoderState.value.content = `<div class="text-red-400 text-center py-4 text-xl">网络请求失败，请检查 Node.js Server 是否开启。</div>`;
            }
        };

        const openCreateModal = () => { 
            isEditingBook.value = false; 
            newBookForm.value = { id: '', name: '', type: 'word', icon: 'fas fa-book', sortOrder: 1, type: filterType.value || 'word', grade: filterGrade.value || '其他', term: filterTerm.value || '全学年' }; 
            showCreateModal.value = true; 
        };
        const openEditBookModal = () => { 
            if (!props.currentBook) return; 
            isEditingBook.value = true; 
            newBookForm.value = { ...props.currentBook, grade: props.currentBook.grade || '其他', term: props.currentBook.term || '全学年', sortOrder: props.currentBook.sortOrder || 1 }; 
            showCreateModal.value = true; 
        };
        const handleSaveBook = () => {
            if (!newBookForm.value.name) return alert("请输入名称");
            if (isEditingBook.value) emit('updateBook', newBookForm.value.id, newBookForm.value);
            else emit('createBook', { ...newBookForm.value });
            showCreateModal.value = false;
        };
        const handleAddWord = async () => {
            if (!localNewWord.value.word || !localNewWord.value.meaning) return;
            isFetching.value = true;
            let phonetic = '';
            if (props.currentBook?.type === 'word') phonetic = await fetchPhonetic(localNewWord.value.word);
            emit('addWord', { ...localNewWord.value, phonetic });
            localNewWord.value.word = ''; localNewWord.value.meaning = '';
            isFetching.value = false;
        };
        const startEdit = (item) => { editingId.value = item.id; editForm.value = { ...item }; };
        const cancelEdit = () => { editingId.value = null; };
        const saveEdit = async () => {
            isFetching.value = true;
            let phonetic = editForm.value.phonetic;
            if (props.currentBook?.type === 'word') { const newPhonetic = await fetchPhonetic(editForm.value.word); if (newPhonetic) phonetic = newPhonetic; }
            emit('updateWord', { ...editForm.value, phonetic });
            editingId.value = null;
            isFetching.value = false;
        };
        const handleUpdateAllPhonetics = async () => {
            if (isUpdatingPhonetics.value) return;
            if (!props.currentBook || props.currentBook.type !== 'word') return alert("仅单词本支持音标自动更新功能。");
            if (filteredVocab.value.length === 0) return alert("当前单词本为空。");
            if (!confirm(`确定要自动更新当前 ${filteredVocab.value.length} 个单词的音标吗？\n这可能需要一些时间，请勿关闭页面。`)) return;
            isUpdatingPhonetics.value = true;
            let updateCount = 0;
            const items = [...filteredVocab.value];
            for (const item of items) {
                if (!props.currentBook || isUpdatingPhonetics.value === false) break;
                if (!item.word || item.word.includes(' ')) continue; 
                const newPhonetic = await fetchPhonetic(item.word);
                if (newPhonetic && newPhonetic !== item.phonetic) { emit('updateWord', { ...item, phonetic: newPhonetic }); updateCount++; }
                await new Promise(r => setTimeout(r, 150));
            }
            isUpdatingPhonetics.value = false;
            alert(`音标魔法施放完毕！✨\n共更新了 ${updateCount} 个单词的音标。`);
        };

        const openMistakeBook = async () => { await loadMistakesData(); if (sortedMistakeDates.value.length > 0) selectedMistakeDate.value = sortedMistakeDates.value[0]; showMistakeBook.value = true; };

        // [新增] 打开遗忘曲线模式选择弹窗
        const openEbbinghausModal = () => {
            if (ebbinghausReviewList.value.length === 0) return alert("太棒了！今天没有需要遗忘曲线复习的错词！🎉");
            showEbbinghausModal.value = true;
        };

        // [新增] 确认复习方式并执行
        const confirmEbbinghausReview = (mode) => {
            reciteConfig.value.studyMode = mode;
            reciteConfig.value.order = 'random';
            reciteConfig.value.mode = 'unlimited';
            isEbbinghausReview.value = true;
            isWaitingForReciteData.value = false;
            showEbbinghausModal.value = false;

            if (mode === 'match') {
                initMatchGame(ebbinghausReviewList.value);
            } else {
                initRecitationSession(ebbinghausReviewList.value);
            }
        };

        const openReciteSetup = (mode) => { reciteConfig.value.studyMode = mode; reciteConfig.value.selectedBookIds = props.currentBook ? [props.currentBook.id] : []; showReciteSetup.value = true; };
        const toggleBookSelection = (id) => { const idx = reciteConfig.value.selectedBookIds.indexOf(id); if (idx === -1) reciteConfig.value.selectedBookIds.push(id); else reciteConfig.value.selectedBookIds.splice(idx, 1); };
        const handleStartRecitation = () => { if (reciteConfig.value.selectedBookIds.length === 0) return alert("请至少选择一个单词本"); isWaitingForReciteData.value = true; showReciteSetup.value = false; emit('request-recitation', reciteConfig.value.selectedBookIds); };

        const initRecitationSession = (data) => {
            let queue = [...data]; if (reciteConfig.value.order === 'random') queue.sort(() => Math.random() - 0.5);
            reciteQueue.value = queue; reciteIndex.value = 0;
            if (reciteConfig.value.mode === 'timed') { reciteTimeRemaining.value = reciteConfig.value.duration * 60; startTimer(); } else { reciteTimeRemaining.value = 0; }
            isReciting.value = true; 
            
            // 【添加这行防御性代码】
            window.removeEventListener('keydown', handleKeydown); 
            window.addEventListener('keydown', handleKeydown); 
            
            resetWordState();
        };

        const startTimer = () => { clearInterval(reciteTimer.value); reciteTimer.value = setInterval(() => { reciteTimeRemaining.value--; if (reciteTimeRemaining.value <= 0) { clearInterval(reciteTimer.value); alert("时间到！学习结束。"); exitRecitation(); } }, 1000); };

        const resetWordState = () => {
            clearTimeout(autoNextTimer.value); stopSpeaking(); memorizeSessionId.value++; readSessionId.value++;
            reciteErrorCount.value = 0; reciteInput.value = ''; reciteStatus.value = 'neutral'; showAnswer.value = false;
            
            if (reciteConfig.value.studyMode === 'read') { showHintMeaning.value = true; showHintWord.value = true; startAutoRead(); } 
            else if (reciteConfig.value.studyMode === 'memorize') { memorizeStage.value = 0; showHintMeaning.value = true; showHintWord.value = true; startMemorizeFlash(); } 
            else if (reciteConfig.value.studyMode === 'dictate') { showHintMeaning.value = false; showHintWord.value = false; setTimeout(() => speak(currentReciteWord.value?.word, 'en'), 300); focusInput(); } 
            else { showHintMeaning.value = true; showHintWord.value = false; focusInput(); }
        };

        const startAutoRead = async () => {
            const currentSession = readSessionId.value;
            const word = currentReciteWord.value;
            if (!word) return;
            for (let i = 0; i < reciteConfig.value.readRepeat; i++) {
                if (readSessionId.value !== currentSession || !isReciting.value) return;
                await speak(word.word, 'en');
                if (readSessionId.value !== currentSession || !isReciting.value) return;
                const waitTime = reciteConfig.value.readInterval * 1000;
                const step = 100;
                for(let t = 0; t < waitTime; t += step) {
                    if (readSessionId.value !== currentSession || !isReciting.value) return;
                    await new Promise(resolve => setTimeout(resolve, Math.min(step, waitTime - t)));
                }
            }
            if (readSessionId.value === currentSession && isReciting.value) nextWord();
        };

        const startMemorizeFlash = async () => {
            const currentSession = memorizeSessionId.value; flashCount.value = 0;
            for (let i = 1; i <= 5; i++) {
                if (memorizeSessionId.value !== currentSession || !isReciting.value) return;
                flashCount.value = i; await speak(currentReciteWord.value.word, 'en');
                if (memorizeSessionId.value !== currentSession || !isReciting.value) return;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (memorizeSessionId.value === currentSession && isReciting.value) { memorizeStage.value = 1; reciteInput.value = ''; focusInput(); }
        };

        const handleMemorizeCheck = (inputVal, targetVal) => {
            if (inputVal === targetVal) {
                reciteStatus.value = 'correct'; setTimeout(() => { reciteStatus.value = 'neutral'; }, 500); 
                if (memorizeStage.value === 1) { memorizeStage.value = 2; reciteInput.value = ''; showHintWord.value = false; const spelling = targetVal.split('').join(', '); speakQueue([{ text: spelling, lang: 'en' }, { text: targetVal, lang: 'en' }]); } 
                else if (memorizeStage.value === 2) { memorizeStage.value = 3; reciteInput.value = ''; speak(targetVal, 'en'); } 
                else if (memorizeStage.value === 3) { memorizeStage.value = 4; reciteStatus.value = 'correct'; stopSpeaking(); autoNextTimer.value = setTimeout(() => nextWord(), 2000); }
            } else {
                reciteStatus.value = 'wrong'; reciteInput.value = ''; logMistake(currentReciteWord.value); 
                if (memorizeStage.value > 1) { alert("记忆模糊！正在回滚至第一阶段重塑记忆！"); stopSpeaking(); memorizeStage.value = 1; showHintWord.value = true; speak(targetVal, 'en'); }
                focusInput();
            }
        };

        const replayAudio = () => { if (currentReciteWord.value) speak(currentReciteWord.value.word, 'en'); };

        const checkReciteAnswer = () => {
            if (!currentReciteWord.value) return;
            if (reciteStatus.value === 'correct') { clearTimeout(autoNextTimer.value); nextWord(); return; }
            const inputVal = reciteInput.value.trim().toLowerCase(); const targetVal = currentReciteWord.value.word.trim().toLowerCase();
            if (reciteConfig.value.studyMode === 'memorize') { if (memorizeStage.value === 0) return; handleMemorizeCheck(inputVal, targetVal); return; }
            if (showAnswer.value) { addToRetryQueue(); nextWord(); return; }
            if (inputVal === targetVal) {
                reciteStatus.value = 'correct'; stopSpeaking(); if (reciteErrorCount.value > 0) addToRetryQueue();
                autoNextTimer.value = setTimeout(() => nextWord(), 2000);
            } else {
                reciteStatus.value = 'wrong'; reciteErrorCount.value++; logMistake(currentReciteWord.value);
                if (reciteConfig.value.studyMode === 'dictate' && reciteErrorCount.value >= 1) showHintMeaning.value = true;
                if (reciteErrorCount.value >= 3) showAnswer.value = true;
                focusInput();
            }
        };

        const addToRetryQueue = () => { const retryItem = { ...currentReciteWord.value, id: Date.now() + Math.random() }; reciteQueue.value.push(retryItem); };
        const nextWord = () => { if (reciteIndex.value < reciteQueue.value.length - 1) { reciteIndex.value++; resetWordState(); } else { if (confirm("学习完成！是否重新开始？")) { if (reciteConfig.value.order === 'random') reciteQueue.value.sort(() => Math.random() - 0.5); reciteIndex.value = 0; resetWordState(); } else { exitRecitation(); } } };
        const prevWord = () => { if (reciteIndex.value > 0) { reciteIndex.value--; resetWordState(); } };
        const handleReciteInput = () => {
            if (reciteConfig.value.studyMode === 'memorize' && memorizeStage.value === 0) { reciteInput.value = ''; return; }
            if (isSpeaking.value) stopSpeaking(); if (reciteStatus.value === 'wrong') reciteStatus.value = 'neutral';
            const target = currentReciteWord.value?.word || ''; let val = reciteInput.value; let newVal = ''; let valIdx = 0;
            for (let i = 0; i < target.length; i++) { if (valIdx >= val.length) break; if (target[i] === ' ') { newVal += ' '; if (val[valIdx] === ' ') valIdx++; } else { newVal += val[valIdx]; valIdx++; } }
            if (newVal !== val) reciteInput.value = newVal;
        };
        const handleKeydown = (e) => { if (isReciting.value) { if (e.key === 'ArrowRight') { e.preventDefault(); nextWord(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); prevWord(); } else if (e.key === 'Backspace') { inputRef.value?.focus(); } else if (e.key === 'Tab' && reciteConfig.value.studyMode === 'dictate') { e.preventDefault(); showHintMeaning.value = true; } else if ((e.ctrlKey || e.metaKey)) { e.preventDefault(); replayAudio(); } } };
        const exitRecitation = () => { stopSpeaking(); isReciting.value = false; clearTimeout(autoNextTimer.value); clearInterval(reciteTimer.value); memorizeSessionId.value++; readSessionId.value++; window.removeEventListener('keydown', handleKeydown); if (isEbbinghausReview.value) { isEbbinghausReview.value = false; loadMistakesData(); } };
        const focusInput = () => nextTick(() => inputRef.value?.focus());

        // 连线游戏逻辑
        const genCardId = (col, item) => `${col}-${item.id}`;
        const initMatchGame = (data) => { let allData = [...data]; if (reciteConfig.value.order === 'random') allData.sort(() => Math.random() - 0.5); matchTotalQueue.value = allData; matchResults.value = []; matchCurrentRound.value = 0; matchGameMode.value = 'playing'; isMatchingGame.value = true; startMatchRound(); };
        const startMatchRound = () => {
            const start = matchCurrentRound.value * matchBatchSize; 
            const currentBatch = matchTotalQueue.value.slice(start, start + matchBatchSize);
            if (currentBatch.length === 0) { matchGameMode.value = 'summary'; return; }
            const splitIndex = 10; 
            const setA = currentBatch.slice(0, splitIndex); 
            const setB = currentBatch.slice(splitIndex);
            const allMeanings = [...currentBatch].sort(() => Math.random() - 0.5); 
            const meaningsPart1 = allMeanings.slice(0, splitIndex); 
            const meaningsPart2 = allMeanings.slice(splitIndex);
            matchCol1.value = meaningsPart1.map(i => ({ ...i, type: 'meaning', col: 1, cardId: genCardId(1, i) })); 
            matchCol2.value = setA.map(i => ({ ...i, type: 'word', col: 2, cardId: genCardId(2, i) }));
            if (setB.length > 0) matchCol3.value = setB.map(i => ({ ...i, type: 'word', col: 3, cardId: genCardId(3, i) })); else matchCol3.value = [];
            if (meaningsPart2.length > 0) matchCol4.value = meaningsPart2.map(i => ({ ...i, type: 'meaning', col: 4, cardId: genCardId(4, i) })); else matchCol4.value = [];
            matchPairs.value = {}; matchPairOrderMap.value = {}; matchNextOrder.value = 1; matchSelection.value = null; 
        };
        const handleMatchClick = (item) => {
            if (matchPairs.value[item.cardId]) { const partnerCardId = matchPairs.value[item.cardId]; delete matchPairs.value[item.cardId]; if (partnerCardId) delete matchPairs.value[partnerCardId]; delete matchPairOrderMap.value[item.cardId]; if (partnerCardId) delete matchPairOrderMap.value[partnerCardId]; return; }
            if (item.type === 'word') speak(item.word, 'en'); 
            if (!matchSelection.value || matchSelection.value.type === item.type) { if (matchSelection.value && matchSelection.value.cardId === item.cardId) matchSelection.value = null; else matchSelection.value = item; return; }
            const sel = matchSelection.value; matchPairs.value[sel.cardId] = item.cardId; matchPairs.value[item.cardId] = sel.cardId; matchPairOrderMap.value[sel.cardId] = matchNextOrder.value; matchPairOrderMap.value[item.cardId] = matchNextOrder.value; matchNextOrder.value++; matchSelection.value = null; 
        };
        const submitMatchRound = () => { 
            const processGroup = (words) => { 
                words.forEach(w => { 
                    const linkedCardId = matchPairs.value[w.cardId]; 
                    let partnerItem = null; 
                    if (linkedCardId) partnerItem = [...matchCol1.value, ...matchCol4.value].find(i => i.cardId === linkedCardId); 
                    const isCorrect = partnerItem && partnerItem.id === w.id; 
                    const userMeaning = partnerItem ? partnerItem.meaning : "(未选择)"; 
                    if (!isCorrect) logMistake(w); 
                    matchResults.value.push({ word: w.word, correctMeaning: w.meaning, userMeaning: userMeaning, isCorrect: isCorrect }); 
                }); 
            }; 
            processGroup(matchCol2.value); 
            if (matchCol3.value.length > 0) processGroup(matchCol3.value); 
            matchCurrentRound.value++; 
            startMatchRound(); 
        };
        
        // [修复] 退出连线游戏时，也要判断是否需要重置艾宾浩斯状态
        const exitMatchGame = () => { 
            isMatchingGame.value = false; 
            matchResults.value = []; 
            if (isEbbinghausReview.value) { 
                isEbbinghausReview.value = false; 
                loadMistakesData(); 
            }
        };

        onUnmounted(() => { stopSpeaking(); clearTimeout(autoNextTimer.value); clearInterval(reciteTimer.value); window.removeEventListener('keydown', handleKeydown); });

        // [修复] 确保导出了最新的 openEbbinghausModal 和 confirmEbbinghausReview
        return {
            selectedVoiceURI,
            showCreateModal, isEditingBook, newBookForm, editingId, editForm, localNewWord, isFetching,
            openCreateModal, openEditBookModal, handleSaveBook, handleAddWord, startEdit, saveEdit, cancelEdit, getPosColor,
            handleExport: () => emit('exportBook', props.currentBook?.id), handleDownload: () => emit('download'),
            filteredVocab, searchQuery,
            filterGrade, filterTerm, filterType, gradeOptions, termOptions, filteredBooksList,
            showReciteSetup, reciteConfig, openReciteSetup, toggleBookSelection, handleStartRecitation,
            isReciting, currentReciteWord, reciteInput, reciteStatus, showAnswer, showHintMeaning, showHintWord,
            reciteProgress, inputRef, reciteIndex, reciteQueue, wordSlots, reciteTimeRemaining, formatTime,
            handleReciteInput, checkReciteAnswer, exitRecitation, nextWord, prevWord, focusInput,
            isMatchingGame, matchGameMode, matchCurrentRound, matchTotalQueue, matchCol1, matchCol2, matchCol3, matchCol4, matchSelection,
            handleMatchClick, getPairOrder, isPaired, isSelected, submitMatchRound, exitMatchGame, matchCorrectList, matchWrongList,
            memorizeStage, flashCount, voices, selectedVoiceURI, ttsRate, isSpeaking, replayAudio,
            getSetupTitle: () => ({ 'recite': '默写设置', 'dictate': '听写设置', 'match': '连线测试设置', 'memorize': '背诵设置', 'read': '朗读设置' }[reciteConfig.value.studyMode] || '学习设置'),
            showMistakeBook, mistakeList, mistakeGroups, selectedMistakeDate, sortedMistakeDates, openMistakeBook,
            ebbinghausReviewList, isEbbinghausReview, showEbbinghausModal, openEbbinghausModal, confirmEbbinghausReview,
            autoFillPhonetic: fetchPhonetic, isFetchingPhonetic: isFetching, handleUpdateAllPhonetics, isUpdatingPhonetics,
            decoderState, openMemoryDecoder,decodedWords, speakWord: (word) => speak(word, 'en')
        };
    },
    template: `
    <div class="h-full flex flex-col gap-4">
        
        <div class="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 shrink-0 overflow-hidden z-20">
            <div class="flex gap-2 shrink-0 border-r border-slate-100 pr-4">
                <select v-model="filterGrade" class="text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-slate-50 text-slate-600 font-medium w-28 cursor-pointer transition">
                    <option value="">全部年级</option>
                    <option v-for="g in gradeOptions" :value="g">{{g}}</option>
                </select>
                <select v-model="filterTerm" class="text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-slate-50 text-slate-600 font-medium w-28 cursor-pointer transition">
                    <option value="">全部学期</option>
                    <option v-for="t in termOptions" :value="t">{{t}}</option>
                </select>
                <select v-model="filterType" class="text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-slate-50 text-slate-600 font-medium w-28 cursor-pointer transition">
                    <option value="">全部类型</option>
                    <option value="word">单词本</option>
                    <option value="phrase">短语本</option>
                </select>
            </div>

            <div class="flex-1 flex items-center min-w-0 px-2">
                <div class="relative w-full max-w-lg">
                    <i class="fas fa-book-open absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none"></i>
                    <select 
                        :value="currentBook ? currentBook.id : ''"
                        @change="(e) => {
                            const selected = filteredBooksList.find(b => b.id === e.target.value);
                            if (selected) $emit('selectBook', selected);
                        }"
                        class="w-full text-sm pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-slate-50 text-slate-700 font-bold cursor-pointer transition shadow-inner appearance-none"
                        :disabled="filteredBooksList.length === 0"
                    >
                        <option value="" disabled>{{ filteredBooksList.length === 0 ? '无对应结果，请新建或调整筛选' : '📚 请选择要学习的词库...' }}</option>
                        <option v-for="book in filteredBooksList" :key="book.id" :value="book.id">
                            {{ book.name }} —— ({{ book.grade }} · {{ book.term }})
                        </option>
                    </select>
                    <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <i class="fas fa-chevron-down text-xs"></i>
                    </div>
                </div>
            </div>

            <div class="shrink-0 pl-4 border-l border-slate-100">
                <button @click="openCreateModal" class="h-[46px] px-5 rounded-xl border border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50 flex items-center justify-center gap-2 transition font-bold text-sm bg-white shrink-0 active:scale-95">
                    <i class="fas fa-plus"></i> 新建词库
                </button>
            </div>
        </div>

        <div class="flex-1 flex gap-4 min-h-0 z-10">
            
            <div class="w-[260px] shrink-0 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-3xl shadow-xl flex flex-col p-5 overflow-hidden relative border border-slate-700/50">
                <div class="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
                
                <div class="relative z-10 h-full flex flex-col">
                    <h3 class="font-bold text-lg mb-5 flex items-center gap-2 text-indigo-300 tracking-wider uppercase text-sm">
                        <i class="fas fa-toolbox"></i> 英语工具箱
                    </h3>
                    
                    <div class="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                        <button @click="openReciteSetup('read')" class="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-blue-500/30 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex items-center gap-4 w-full">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl transition group-hover:bg-blue-500 group-hover:text-white shrink-0 shadow-lg shadow-blue-500/0 group-hover:shadow-blue-500/30">
                                <i class="fas fa-volume-up"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <h4 class="font-bold text-sm leading-tight text-slate-200 group-hover:text-white transition">朗读单词</h4>
                                <p class="text-[10px] text-blue-200/60 mt-1 truncate">自动连读 · 语感培养</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-[10px] text-white/10 group-hover:text-white/50 transition"></i>
                        </button>

                        <button @click="openReciteSetup('memorize')" class="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-pink-500/30 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex items-center gap-4 w-full">
                            <div class="w-12 h-12 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center text-xl transition group-hover:bg-pink-500 group-hover:text-white shrink-0 shadow-lg shadow-pink-500/0 group-hover:shadow-pink-500/30">
                                <i class="fas fa-brain"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <h4 class="font-bold text-sm leading-tight text-slate-200 group-hover:text-white transition">背诵单词</h4>
                                <p class="text-[10px] text-pink-200/60 mt-1 truncate">5遍跟读 · 强力灌入</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-[10px] text-white/10 group-hover:text-white/50 transition"></i>
                        </button>

                        <button @click="openReciteSetup('match')" class="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex items-center gap-4 w-full">
                            <div class="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl transition group-hover:bg-emerald-500 group-hover:text-white shrink-0 shadow-lg shadow-emerald-500/0 group-hover:shadow-emerald-500/30">
                                <i class="fas fa-project-diagram"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <h4 class="font-bold text-sm leading-tight text-slate-200 group-hover:text-white transition">单词连线</h4>
                                <p class="text-[10px] text-emerald-200/60 mt-1 truncate">盲测 · 全局乱序</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-[10px] text-white/10 group-hover:text-white/50 transition"></i>
                        </button>

                        <button @click="openReciteSetup('recite')" class="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/30 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex items-center gap-4 w-full">
                            <div class="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xl transition group-hover:bg-indigo-500 group-hover:text-white shrink-0 shadow-lg shadow-indigo-500/0 group-hover:shadow-indigo-500/30">
                                <i class="fas fa-pencil-alt"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <h4 class="font-bold text-sm leading-tight text-slate-200 group-hover:text-white transition">默写单词</h4>
                                <p class="text-[10px] text-indigo-200/60 mt-1 truncate">看中文 · 默写英文</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-[10px] text-white/10 group-hover:text-white/50 transition"></i>
                        </button>

                        <button @click="openReciteSetup('dictate')" class="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-purple-500/30 rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex items-center gap-4 w-full">
                            <div class="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl transition group-hover:bg-purple-500 group-hover:text-white shrink-0 shadow-lg shadow-purple-500/0 group-hover:shadow-purple-500/30">
                                <i class="fas fa-headphones"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <h4 class="font-bold text-sm leading-tight text-slate-200 group-hover:text-white transition">听写单词</h4>
                                <p class="text-[10px] text-purple-200/60 mt-1 truncate">听发音 · 拼写英文</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-[10px] text-white/10 group-hover:text-white/50 transition"></i>
                        </button>
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 shrink-0">
                        <button @click="openMistakeBook" class="w-full bg-white/5 hover:bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:text-orange-300 rounded-xl p-3.5 font-bold shadow-sm flex items-center justify-center gap-2 transition transform active:scale-95 text-sm">
                            <i class="fas fa-fire"></i> 错词回顾记录
                        </button>
                        
                        <button @click="openEbbinghausModal" class="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl p-3.5 font-bold shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition transform active:scale-95 relative overflow-hidden text-sm">
                            <i class="fas fa-chart-line"></i> 遗忘曲线复习 
                            <span v-if="ebbinghausReviewList.length > 0" class="bg-white/20 px-2 py-0.5 rounded-full text-xs ml-1">{{ ebbinghausReviewList.length }}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col min-w-0 relative">
                
                <div v-if="currentBook" class="flex flex-col h-full">
                    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 rounded-t-3xl">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl border border-indigo-100">
                                <i :class="currentBook.icon"></i>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-xl leading-tight flex items-center gap-2">
                                    {{ currentBook.name }}
                                    <button @click="openEditBookModal" class="text-slate-300 hover:text-indigo-500 text-sm transition"><i class="fas fa-pen"></i></button>
                                </h3>
                                <p class="text-xs text-slate-400 mt-0.5 font-medium">当前共 {{ vocabulary.length }} 个内容</p>
                            </div>
                        </div>
                        
                        <div class="flex gap-3 items-center">
                            <div class="relative group hidden sm:block">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs group-focus-within:text-indigo-500 transition-colors"></i>
                                <input v-model="searchQuery" placeholder="搜索单词或释义..." class="pl-8 pr-8 py-2 w-56 rounded-xl border border-slate-200 text-sm focus:border-indigo-500 outline-none transition bg-slate-50 focus:bg-white text-slate-600">
                                <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><i class="fas fa-times-circle"></i></button>
                            </div>

                            <button v-if="currentBook.type === 'word'" @click="handleUpdateAllPhonetics" :disabled="isUpdatingPhonetics" class="h-9 px-3 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition border border-amber-100 font-bold text-sm gap-1.5" title="一键更新所有单词音标">
                                <i class="fas" :class="isUpdatingPhonetics ? 'fa-circle-notch fa-spin' : 'fa-magic'"></i>
                                <span class="hidden md:inline">音标补全</span>
                            </button>
                            <div class="w-px h-6 bg-slate-200 mx-1"></div>
                            
                            <div class="flex bg-slate-50 rounded-xl border border-slate-200 p-1">
                                <button @click="handleDownload" class="w-8 h-8 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm flex items-center justify-center transition" title="下载模板"><i class="fas fa-download text-sm"></i></button>
                                <label class="w-8 h-8 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm flex items-center justify-center transition cursor-pointer" title="导入 Excel">
                                    <i class="fas fa-file-import text-sm"></i>
                                    <input type="file" class="hidden" accept=".xlsx" @change="(e) => $emit('upload', e)">
                                </label>
                                <button @click="handleExport" class="w-8 h-8 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm flex items-center justify-center transition" title="导出 Excel"><i class="fas fa-file-export text-sm"></i></button>
                            </div>
                            <button @click="$emit('deleteBook', currentBook.id)" class="w-9 h-9 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition border border-red-100 ml-1" title="删除词库"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    
                    <div class="p-3 bg-slate-50/50 border-b border-slate-100 flex gap-2 items-center shrink-0">
                        <input v-model="localNewWord.word" :placeholder="currentBook.type === 'word' ? '录入新单词...' : '录入新短语...'" class="w-1/3 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500 focus:outline-none bg-white font-bold" @keyup.enter="handleAddWord">
                        <div v-if="isFetching" class="flex items-center gap-1 text-xs text-indigo-400 font-bold px-2"><i class="fas fa-circle-notch fa-spin"></i></div>
                        <select v-if="currentBook.type === 'word'" v-model="localNewWord.pos" class="w-24 px-2 py-2.5 rounded-xl border border-slate-200 text-sm bg-white cursor-pointer"><option v-for="opt in posOptions" :value="opt.value">{{ opt.label }}</option></select>
                        <input v-model="localNewWord.meaning" placeholder="中文释义..." class="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500 focus:outline-none bg-white" @keyup.enter="handleAddWord">
                        <button @click="handleAddWord" class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 transition active:scale-95 flex items-center gap-2"><i class="fas fa-paper-plane"></i> 添加</button>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-5 bg-slate-50/50">
                        
                        <div v-if="currentBook.type === 'word'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 content-start">
                            <div v-for="v in filteredVocab" :key="v.id" 
                                 class="rounded-3xl p-5 border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col relative min-h-[150px] overflow-hidden"
                                 :class="decodedWords.has(v.word) ? 'bg-gradient-to-br from-amber-50/80 to-orange-50/30 border-amber-300/60' : 'bg-white border-slate-200/60'">
                                
                                <div class="absolute top-0 left-0 w-1 h-full transition-opacity duration-300"
                                     :class="decodedWords.has(v.word) ? 'bg-gradient-to-b from-amber-400 to-orange-500 opacity-100' : 'bg-gradient-to-b from-indigo-400 to-purple-500 opacity-0 group-hover:opacity-100'"></div>
                                
                                <div v-if="decodedWords.has(v.word)" class="absolute top-3 right-3 text-amber-500/20 text-3xl pointer-events-none transition-transform group-hover:scale-110">
                                    <i class="fas fa-magic"></i>
                                </div>
                                
                                <template v-if="editingId !== v.id">
                                    <div class="flex justify-between items-start mb-3 relative z-10">
                                        <span class="text-[11px] font-mono text-slate-400 bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border" :class="decodedWords.has(v.word) ? 'border-amber-200/50' : 'border-slate-100'">/ {{ v.phonetic || '...' }} /</span>
                                        <span class="text-[10px] px-2 py-1 rounded-lg border font-bold tracking-wider uppercase bg-white/80 backdrop-blur-sm" :class="getPosColor(v.pos)">{{ v.pos }}</span>
                                    </div>
                                    <div class="text-2xl font-black text-slate-800 truncate select-all mb-1.5 tracking-tight relative z-10">{{ v.word }}</div>
                                    <div class="text-sm text-slate-500 line-clamp-2 flex-1 font-medium relative z-10">{{ v.meaning }}</div>
                                    
                                    <div class="absolute bottom-4 right-4 flex gap-1.5 translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-white/90 backdrop-blur-md shadow-sm border border-slate-100/50 p-1.5 rounded-2xl z-20">
                                        <button @click="openMemoryDecoder(v.word)" class="w-8 h-8 flex items-center justify-center transition-colors shadow-sm rounded-xl" :class="decodedWords.has(v.word) ? 'text-white bg-amber-400 hover:bg-amber-500' : 'text-amber-500 hover:bg-amber-400 hover:text-white'" :title="decodedWords.has(v.word) ? '查看魔法解码' : 'AI 记忆解码'"><i class="fas fa-lightbulb"></i></button>
                                        <button @click="speakWord(v.word)" class="w-8 h-8 flex items-center justify-center text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-colors shadow-sm" title="朗读此词"><i class="fas fa-volume-up"></i></button>
                                        <button @click="startEdit(v)" class="w-8 h-8 flex items-center justify-center text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-xl transition-colors shadow-sm" title="编辑"><i class="fas fa-pen text-xs"></i></button>
                                        <button @click="$emit('deleteWord', v.id)" class="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors shadow-sm" title="删除"><i class="fas fa-trash-alt text-xs"></i></button>
                                    </div>
                                </template>

                                <template v-else>
                                    <div class="flex flex-col gap-2.5 h-full justify-center relative z-20 bg-white/90 backdrop-blur-sm rounded-xl p-1">
                                        <input v-model="editForm.word" class="w-full px-3 py-1.5 border border-indigo-200 rounded-xl text-slate-700 font-bold outline-none focus:ring-2 ring-indigo-100 text-base transition bg-white/50">
                                        <div class="flex gap-2">
                                            <input v-model="editForm.phonetic" class="flex-1 px-3 py-1.5 border border-indigo-200 rounded-xl font-mono text-xs outline-none focus:ring-2 ring-indigo-100 transition bg-white/50" placeholder="音标">
                                            <select v-model="editForm.pos" class="w-20 text-xs px-2 py-1.5 border border-indigo-200 rounded-xl outline-none focus:ring-2 ring-indigo-100 cursor-pointer bg-white/50 font-bold">
                                                <option v-for="o in posOptions" :value="o.value">{{ o.value }}</option>
                                            </select>
                                        </div>
                                        <input v-model="editForm.meaning" class="w-full px-3 py-1.5 border border-indigo-200 rounded-xl outline-none focus:ring-2 ring-indigo-100 text-sm transition bg-white/50" @keyup.enter="saveEdit" placeholder="中文释义">
                                        <div class="absolute -bottom-2 -right-2 flex gap-2">
                                            <button @click="saveEdit" class="w-10 h-10 flex items-center justify-center text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition"><i class="fas fa-check"></i></button>
                                            <button @click="cancelEdit" class="w-10 h-10 flex items-center justify-center text-white bg-slate-400 rounded-xl hover:bg-slate-500 shadow-lg shadow-slate-200 transition"><i class="fas fa-times"></i></button>
                                        </div>
                                    </div>
                                </template>
                            </div>

                            <div v-if="filteredVocab.length === 0" class="col-span-full py-20 flex flex-col items-center justify-center text-slate-300">
                                <i class="fas fa-box-open text-6xl mb-4 opacity-30"></i>
                                <span class="text-lg font-bold">{{ searchQuery ? '未找到匹配的单词或释义' : '词库空空如也，快来添加吧' }}</span>
                            </div>
                        </div>

                        <div v-else class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <table class="w-full text-sm text-left border-collapse">
                                <thead class="text-slate-400 bg-slate-50 text-xs uppercase font-bold border-b border-slate-200">
                                    <tr>
                                        <th class="p-4 pl-6">短语内容</th>
                                        <th class="p-4">中文释义</th>
                                        <th class="p-4 text-center w-40">操作</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-for="v in filteredVocab" :key="v.id" class="group hover:bg-indigo-50/30 transition-colors">
                                        <template v-if="editingId !== v.id">
                                            <td class="p-4 pl-6 font-bold text-slate-700 text-base select-all">{{ v.word }}</td>
                                            <td class="p-4 text-slate-600 font-medium">{{ v.meaning }}</td>
                                            <td class="p-4 text-center flex justify-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <button @click="speakWord(v.word)" class="w-8 h-8 flex items-center justify-center text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition" title="朗读此词"><i class="fas fa-volume-up"></i></button>
                                                <button @click="startEdit(v)" class="w-8 h-8 flex items-center justify-center text-indigo-500 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition" title="编辑"><i class="fas fa-pen text-xs"></i></button>
                                                <button @click="$emit('deleteWord', v.id)" class="w-8 h-8 flex items-center justify-center text-red-400 bg-red-50 rounded-lg hover:bg-red-100 transition" title="删除"><i class="fas fa-trash-alt text-xs"></i></button>
                                            </td>
                                        </template>
                                        <template v-else>
                                            <td class="p-3 pl-6"><input v-model="editForm.word" class="w-full px-3 py-2 border border-indigo-300 rounded-xl text-slate-700 font-bold outline-none ring-2 ring-indigo-100"></td>
                                            <td class="p-3"><input v-model="editForm.meaning" class="w-full px-3 py-2 border border-indigo-300 rounded-xl outline-none ring-2 ring-indigo-100" @keyup.enter="saveEdit"></td>
                                            <td class="p-3 text-center flex justify-center gap-2">
                                                <button @click="saveEdit" class="w-8 h-8 flex items-center justify-center text-emerald-500 bg-emerald-50 rounded-lg hover:bg-emerald-100"><i class="fas fa-check"></i></button>
                                                <button @click="cancelEdit" class="w-8 h-8 flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg hover:bg-slate-100"><i class="fas fa-times"></i></button>
                                            </td>
                                        </template>
                                    </tr>
                                    <tr v-if="filteredVocab.length === 0">
                                        <td colspan="3" class="p-16 text-center text-slate-300">
                                            <i class="fas fa-box-open text-5xl mb-4 opacity-30 block"></i>
                                            <span class="text-lg">{{ searchQuery ? '未找到匹配的短语或释义' : '短语库空空如也' }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                    </div>
                </div>

                <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300">
                    <i class="fas fa-book-open text-6xl mb-6 opacity-30"></i>
                    <p class="text-lg font-bold tracking-wider">请在顶部选择一个词库开始学习</p>
                </div>
            </div>
        </div>

        <div v-if="showEbbinghausModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl scale-up text-slate-800 flex flex-col">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold flex items-center gap-2 text-indigo-600">
                        <i class="fas fa-layer-group"></i> 选择复习方式
                    </h3>
                    <button @click="showEbbinghausModal=false" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"><i class="fas fa-times"></i></button>
                </div>
                <p class="text-sm text-slate-500 mb-6 leading-relaxed">今天有 <span class="font-bold text-orange-500 text-lg mx-1">{{ ebbinghausReviewList.length }}</span> 个遗忘曲线临期单词，请选择一种方式进行巩固：</p>
                
                <div class="grid grid-cols-2 gap-4 mb-2">
                    <button @click="confirmEbbinghausReview('match')" class="group bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-2xl p-4 text-center transition-all hover:-translate-y-1 shadow-sm flex flex-col items-center justify-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center text-xl transition group-hover:bg-emerald-500 group-hover:text-white"><i class="fas fa-project-diagram"></i></div>
                        <span class="font-bold text-sm text-slate-600 group-hover:text-emerald-700">单词连线</span>
                    </button>

                    <button @click="confirmEbbinghausReview('dictate')" class="group bg-slate-50 hover:bg-purple-50 border border-slate-100 hover:border-purple-200 rounded-2xl p-4 text-center transition-all hover:-translate-y-1 shadow-sm flex flex-col items-center justify-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-purple-100 text-purple-500 flex items-center justify-center text-xl transition group-hover:bg-purple-500 group-hover:text-white"><i class="fas fa-headphones"></i></div>
                        <span class="font-bold text-sm text-slate-600 group-hover:text-purple-700">听写单词</span>
                    </button>

                    <button @click="confirmEbbinghausReview('memorize')" class="group bg-slate-50 hover:bg-pink-50 border border-slate-100 hover:border-pink-200 rounded-2xl p-4 text-center transition-all hover:-translate-y-1 shadow-sm flex flex-col items-center justify-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center text-xl transition group-hover:bg-pink-500 group-hover:text-white"><i class="fas fa-brain"></i></div>
                        <span class="font-bold text-sm text-slate-600 group-hover:text-pink-700">背诵单词</span>
                    </button>

                    <button @click="confirmEbbinghausReview('recite')" class="group bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl p-4 text-center transition-all hover:-translate-y-1 shadow-sm flex flex-col items-center justify-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center text-xl transition group-hover:bg-indigo-500 group-hover:text-white"><i class="fas fa-pencil-alt"></i></div>
                        <span class="font-bold text-sm text-slate-600 group-hover:text-indigo-700">默写单词</span>
                    </button>
                </div>
            </div>
        </div>

        <div v-if="showCreateModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 class="text-xl font-bold mb-6 text-slate-800">{{ isEditingBook ? '编辑本子属性' : '✨ 创建新词库' }}</h3>
                <div class="space-y-5">
                    <div><label class="block text-xs font-bold text-slate-500 mb-1">名称</label><input v-model="newBookForm.name" class="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm transition" placeholder="例如: 考研核心词"></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">年级</label>
                            <select v-model="newBookForm.grade" class="w-full px-3 py-3 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm bg-white cursor-pointer">
                                <option v-for="g in gradeOptions" :value="g">{{g}}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">学期</label>
                            <select v-model="newBookForm.term" class="w-full px-3 py-3 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm bg-white cursor-pointer">
                                <option v-for="t in termOptions" :value="t">{{t}}</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">类型</label>
                            <div class="flex bg-slate-100 p-1 rounded-xl" :class="{'opacity-50 pointer-events-none': isEditingBook}">
                                <button @click="newBookForm.type='word'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="newBookForm.type==='word'?'bg-white shadow text-indigo-600':'text-slate-500 hover:text-slate-600'">单词</button>
                                <button @click="newBookForm.type='phrase'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="newBookForm.type==='phrase'?'bg-white shadow text-purple-600':'text-slate-500 hover:text-slate-600'">短语</button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">排序 (数字小靠前)</label>
                            <input v-model.number="newBookForm.sortOrder" type="number" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm transition text-center">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-2">选择图标</label>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="ic in bookIcons" :key="ic.icon" @click="newBookForm.icon = ic.icon" class="w-10 h-10 rounded-xl border flex items-center justify-center transition text-lg" :class="newBookForm.icon === ic.icon ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-inner' : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'">
                                <i :class="ic.icon"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-8">
                    <button @click="showCreateModal=false" class="flex-1 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition text-sm font-bold">取消</button>
                    <button @click="handleSaveBook" class="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition transform active:scale-95 text-sm">{{ isEditingBook ? '保存修改' : '创建词库' }}</button>
                </div>
            </div>
        </div>

        <div v-if="showMistakeBook" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl scale-up text-slate-800 overflow-hidden">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <h3 class="font-bold text-xl text-orange-500 flex items-center gap-2"><i class="fas fa-fire"></i> 错词回顾</h3>
                    <button @click="showMistakeBook=false" class="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i class="fas fa-times"></i></button>
                </div>
                <div class="flex flex-1 overflow-hidden">
                    <div class="w-1/4 bg-slate-50 border-r border-slate-200 overflow-y-auto custom-scrollbar">
                        <div v-if="sortedMistakeDates.length === 0" class="p-6 text-center text-sm text-slate-400">暂无错词记录</div>
                        <div v-for="date in sortedMistakeDates" :key="date" 
                             @click="selectedMistakeDate = date"
                             class="p-5 cursor-pointer transition-all border-b border-slate-100 hover:bg-white group"
                             :class="selectedMistakeDate === date ? 'bg-white border-l-4 border-l-orange-500 shadow-sm' : 'border-l-4 border-l-transparent text-slate-500'">
                            <div class="font-bold text-base mb-1 font-mono" :class="selectedMistakeDate === date ? 'text-slate-800' : ''">{{ date }}</div>
                            <div class="text-xs flex items-center justify-between">
                                <span :class="selectedMistakeDate === date ? 'text-orange-500 font-bold' : 'text-slate-400'">{{ mistakeGroups[date].length }} 词</span>
                                <i class="fas fa-chevron-right text-[10px] opacity-0 group-hover:opacity-50 transition" :class="selectedMistakeDate === date ? 'opacity-100 text-orange-400' : ''"></i>
                            </div>
                        </div>
                    </div>
                    <div class="flex-1 bg-white overflow-y-auto p-8 custom-scrollbar">
                        <div v-if="selectedMistakeDate && mistakeGroups[selectedMistakeDate]">
                            <h4 class="font-bold text-xl mb-6 text-slate-700 flex items-center gap-2">
                                <i class="far fa-calendar-alt text-slate-400"></i> {{ selectedMistakeDate }} 错词列表
                            </h4>
                            <div class="flex flex-col gap-4">
                                <div v-for="item in mistakeGroups[selectedMistakeDate]" :key="item.id" class="p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow bg-slate-50/50 group flex justify-between items-center">
                                    <div class="flex items-center gap-5">
                                        <div class="w-12 h-12 rounded-xl bg-red-50 text-red-600 font-black text-xl flex items-center justify-center border border-red-100 shadow-sm shrink-0">{{ item.count }}</div>
                                        <div>
                                            <div class="font-black text-2xl text-slate-800">{{ item.word }}</div>
                                            <div class="text-sm text-slate-500 mt-1">{{ item.meaning }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                            <i class="fas fa-inbox text-6xl opacity-30"></i>
                            <p class="text-lg">请选择左侧日期查看详情</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showReciteSetup" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl scale-up text-slate-800 flex flex-col max-h-[90vh]">
                <h3 class="text-2xl font-bold mb-6 flex items-center gap-2">
                    <i class="fas" :class="{'fa-pencil-alt text-indigo-500': reciteConfig.studyMode === 'recite', 'fa-headphones text-purple-500': reciteConfig.studyMode === 'dictate', 'fa-project-diagram text-emerald-500': reciteConfig.studyMode === 'match', 'fa-brain text-pink-500': reciteConfig.studyMode === 'memorize', 'fa-volume-up text-blue-500': reciteConfig.studyMode === 'read'}"></i> 
                    {{ getSetupTitle() }}
                </h3>
                <div class="space-y-6 overflow-y-auto px-1 custom-scrollbar">
                    <div v-if="['dictate', 'memorize', 'read'].includes(reciteConfig.studyMode)" class="bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-fade-in space-y-4">
                        <div><label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">发音 Voice</label><select v-model="selectedVoiceURI" class="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500"><option v-for="v in voices" :value="v.voiceURI">{{ v.name }}</option></select></div>
                        <div><label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">语速 Speed ({{ ttsRate }}x)</label><input type="range" v-model.number="ttsRate" min="0.5" max="2" step="0.1" class="w-full accent-indigo-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"></div>
                        <div v-if="reciteConfig.studyMode === 'read'" class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                            <div><label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">朗读次数 (次)</label><input type="number" v-model.number="reciteConfig.readRepeat" min="1" max="10" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white"></div>
                            <div><label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">间隔时间 (秒)</label><input type="number" v-model.number="reciteConfig.readInterval" min="0" max="10" step="0.5" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white"></div>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-600 mb-3 tracking-wide">选择参与测试的单词本</label>
                        <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-2xl p-2 space-y-1.5 custom-scrollbar">
                            <div v-for="b in filteredBooksList" :key="b.id" @click="toggleBookSelection(b.id)" class="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition" :class="reciteConfig.selectedBookIds.includes(b.id) ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'">
                                <div class="w-6 h-6 rounded-md border flex items-center justify-center transition" :class="reciteConfig.selectedBookIds.includes(b.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 bg-white text-transparent'"><i class="fas fa-check text-xs"></i></div>
                                <div class="flex-1"><span class="text-sm font-bold text-slate-700 block leading-none">{{ b.name }}</span><span class="text-xs text-slate-400 mt-1 inline-block">{{ b.grade }} · {{ b.term }}</span></div>
                            </div>
                        </div>
                    </div>
                    <div v-if="reciteConfig.studyMode !== 'match'" class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">顺序</label>
                            <div class="flex bg-slate-100 p-1 rounded-xl">
                                <button @click="reciteConfig.order='random'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="reciteConfig.order==='random'?'bg-white shadow text-indigo-600':'text-slate-500'">🎲 乱序</button>
                                <button @click="reciteConfig.order='sequential'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="reciteConfig.order==='sequential'?'bg-white shadow text-indigo-600':'text-slate-500'">📝 顺序</button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">模式</label>
                            <div class="flex bg-slate-100 p-1 rounded-xl relative">
                                <button @click="reciteConfig.mode='unlimited'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="reciteConfig.mode==='unlimited'?'bg-white shadow text-emerald-600':'text-slate-500'">♾️</button>
                                <button @click="reciteConfig.mode='timed'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all" :class="reciteConfig.mode==='timed'?'bg-white shadow text-orange-600':'text-slate-500'">⏳</button>
                                <input v-if="reciteConfig.mode==='timed'" v-model.number="reciteConfig.duration" type="number" class="absolute -top-10 right-0 w-16 text-center text-sm font-bold border border-slate-200 rounded-lg shadow-sm px-2 py-1 outline-none focus:border-indigo-500" placeholder="min">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-8">
                    <button @click="showReciteSetup=false" class="flex-1 py-3.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                    <button @click="handleStartRecitation" class="flex-1 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition transform active:scale-95">开始学习</button>
                </div>
            </div>
        </div>

        <div v-if="decoderState.show" class="fixed inset-0 bg-slate-900/95 z-[200] flex flex-col items-center animate-fade-in backdrop-blur-sm overflow-hidden">
            <div class="w-full p-6 flex justify-between items-center shrink-0">
                <div class="text-white flex items-center gap-3">
                    <span class="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2">
                        <i class="fas fa-magic"></i> 魔法记忆解码
                    </span>
                </div>
                <button @click="decoderState.show = false" class="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full text-white flex items-center justify-center transition active:scale-95">
                    <i class="fas fa-times text-2xl"></i>
                </button>
            </div>

            <div class="flex-1 w-full max-w-7xl flex flex-col items-center relative px-6 md:px-12 pb-12 overflow-y-auto custom-scrollbar">
                <div class="text-center mt-4 mb-10 shrink-0">
                    <span class="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 select-all tracking-wider drop-shadow-2xl">
                        {{ decoderState.word }}
                    </span>
                </div>

                <div v-if="decoderState.isLoading" class="py-20 flex flex-col items-center justify-center text-amber-400 space-y-6 w-full">
                    <div class="relative">
                        <i class="fas fa-hat-wizard text-7xl animate-bounce relative z-10"></i>
                        <div class="absolute inset-0 bg-amber-400 blur-2xl opacity-40 animate-pulse"></div>
                    </div>
                    <p class="font-bold text-2xl animate-pulse tracking-widest text-amber-200/80">魔法老师正在翻阅古老的魔法书...</p>
                </div>

                <div v-else-if="decoderState.isParsed" class="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div v-for="(part, index) in decoderState.parsedContent" :key="index" 
                         class="rounded-3xl p-6 md:p-8 backdrop-blur-md border shadow-2xl flex flex-col h-full transition-transform hover:-translate-y-1"
                         :class="[part.bg, part.border]">
                        <div class="flex items-center gap-3 mb-6 pb-4 border-b border-white/10 shrink-0">
                            <div class="text-4xl drop-shadow-lg">{{ part.icon }}</div>
                            <h4 class="text-xl font-bold tracking-widest" :class="part.color">{{ part.title }}</h4>
                        </div>
                        <div class="text-slate-200 leading-relaxed text-base md:text-lg [&_p]:mb-4 [&_strong]:text-white [&_strong]:font-bold [&_strong]:px-1 [&_b]:text-white [&_b]:font-bold [&_b]:px-1" v-html="part.content"></div>
                    </div>
                </div>

                <div v-else class="w-full bg-slate-800/80 border border-slate-700/50 shadow-2xl shadow-black/50 rounded-3xl p-8 md:p-12 backdrop-blur-md">
                    <div class="text-slate-200 text-lg md:text-xl leading-relaxed space-y-6 break-words [&_p]:mb-4 [&_strong]:text-amber-400 [&_b]:text-amber-400" v-html="decoderState.content"></div>
                </div>
            </div>
            
            <div class="shrink-0 p-4 w-full text-center text-slate-500 text-xs font-bold bg-black/20 border-t border-white/5">
                <i class="fas fa-robot mr-1"></i> 魔法解析由 AI 生成，请用想象力来感受单词的魅力！
            </div>
        </div>
        
        <div v-if="isReciting" class="fixed inset-0 bg-white z-[100] flex flex-col animate-fade-in" @click="focusInput">
            <div class="h-2 bg-slate-100 w-full">
                <div class="h-full transition-all duration-300 ease-out" :class="{'bg-indigo-500':reciteConfig.studyMode==='recite', 'bg-purple-500':reciteConfig.studyMode==='dictate', 'bg-pink-500':reciteConfig.studyMode==='memorize', 'bg-blue-500':reciteConfig.studyMode==='read'}" :style="{ width: reciteProgress + '%' }"></div>
            </div>
            <div class="p-6 flex justify-between items-center">
                <div class="text-slate-400 font-bold text-sm">
                    <span :class="{'text-indigo-600':reciteConfig.studyMode==='recite', 'text-purple-600':reciteConfig.studyMode==='dictate', 'text-pink-600':reciteConfig.studyMode==='memorize', 'text-blue-600':reciteConfig.studyMode==='read'}">{{ reciteIndex + 1 }}</span> / {{ reciteQueue.length }}
                </div>
                <button @click="exitRecitation" class="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition"><i class="fas fa-times"></i></button>
            </div>
            <div class="flex-1 flex flex-col items-center justify-center p-8 max-w-5xl mx-auto w-full text-center">
                
                <div v-if="reciteConfig.studyMode === 'read'" class="absolute inset-0 z-50 flex items-center justify-center bg-white flex-col">
                    <div class="flex flex-col items-center animate-fade-in mb-12">
                        <div class="text-6xl md:text-8xl font-black text-blue-600 mb-4">{{ currentReciteWord?.word }}</div>
                        <div class="text-2xl md:text-3xl text-slate-400 font-mono mb-6 font-medium">/ {{ currentReciteWord?.phonetic || '...' }} /</div>
                        <div class="text-3xl md:text-4xl text-slate-800 font-bold">{{ currentReciteWord?.meaning }}</div>
                    </div>
                    <div class="text-blue-400 font-bold text-xl flex flex-col items-center gap-6">
                        <div class="flex items-center gap-2 animate-pulse">
                            <i class="fas fa-volume-up"></i> Auto Reading...
                        </div>
                        <button @click="exitRecitation" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-sm font-bold transition flex items-center gap-2 shadow-sm border border-slate-200 active:scale-95">
                            <i class="fas fa-sign-out-alt"></i> 退出朗读
                        </button>
                    </div>
                </div>

                <div v-if="reciteConfig.studyMode === 'memorize' && memorizeStage === 0" class="absolute inset-0 z-50 flex items-center justify-center bg-white flex-col">
                    <div :key="flashCount" class="flex flex-col items-center animate-ping-once mb-12">
                        <div class="text-6xl md:text-8xl font-black text-pink-600 mb-4">{{ currentReciteWord?.word }}</div>
                        <div class="text-2xl md:text-3xl text-slate-400 font-mono mb-6 font-medium">/ {{ currentReciteWord?.phonetic || '...' }} /</div>
                        <div class="text-3xl md:text-4xl text-slate-800 font-bold">{{ currentReciteWord?.meaning }}</div>
                    </div>
                    <div class="text-pink-400 font-bold text-xl animate-pulse flex items-center gap-2"><i class="fas fa-volume-up"></i> Follow Reading {{ flashCount }}/5</div>
                </div>
                
                <div v-if="reciteConfig.studyMode === 'dictate'" class="mb-10 scale-up">
                    <div class="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-500 rounded-full text-sm font-bold"><i class="fas fa-headphones"></i> Listen & Type (听发音拼写)</div>
                </div>
                
                <div v-if="reciteConfig.studyMode === 'memorize' && memorizeStage > 0" class="mb-6 scale-up">
                    <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors" :class="{'bg-blue-50 text-blue-500': memorizeStage===1, 'bg-purple-50 text-purple-500': memorizeStage===2, 'bg-orange-50 text-orange-500': memorizeStage===3}">
                        <span v-if="memorizeStage===1">Stage 1: 临摹 (Copy)</span>
                        <span v-else-if="memorizeStage===2">Stage 2: 听拼 (Spell)</span>
                        <span v-else-if="memorizeStage===3">Stage 3: 默写 (Recall)</span>
                    </div>
                </div>
                
                <div class="mb-12 scale-up min-h-[100px] flex flex-col justify-center">
                    <div v-if="showHintMeaning">
                        <div class="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">DEFINITION</div>
                        <h2 class="text-4xl md:text-5xl font-black text-slate-800 leading-tight mb-4 transition-all">{{ currentReciteWord?.meaning }}</h2>
                    </div>
                    <div v-if="showHintWord && reciteConfig.studyMode === 'memorize' && memorizeStage === 1" class="text-3xl font-bold text-pink-300 select-none tracking-widest animate-pulse">{{ currentReciteWord?.word }}</div>
                </div>
                
                <div class="relative w-full flex justify-center mb-8">
                    <input ref="inputRef" v-model="reciteInput" @input="handleReciteInput" @keyup.enter="checkReciteAnswer" type="text" autocomplete="off" spellcheck="false" :maxlength="currentReciteWord?.word.length" class="absolute inset-0 opacity-0 cursor-default caret-transparent z-0">
                    <div class="flex flex-wrap justify-center gap-3 z-10 pointer-events-none">
                        <div v-for="(slot, index) in wordSlots" :key="index" class="flex items-end justify-center transition-all duration-200" :class="[slot.isSpace ? 'w-6 border-b-0' : 'w-10 md:w-14 border-b-4 h-16 md:h-20', slot.isSpace ? '' : (reciteStatus === 'wrong' ? 'border-red-400 text-red-500' : (reciteStatus === 'correct' ? 'border-emerald-400 text-emerald-500' : (slot.isActive ? (reciteConfig.studyMode==='memorize' ? (memorizeStage===1?'border-blue-500':(memorizeStage===2?'border-purple-500':'border-orange-500')) : (reciteConfig.studyMode==='dictate'?'border-purple-500':'border-indigo-500')) : 'border-slate-200 text-slate-800')))]">
                            <span class="text-4xl md:text-5xl font-bold font-mono pb-2" :class="{'animate-bounce-slow': slot.isActive && reciteStatus === 'neutral'}">{{ slot.val }}</span>
                        </div>
                    </div>
                </div>
                
                <div class="h-10 flex justify-center items-center gap-4 text-sm font-bold">
                    <span v-if="reciteStatus === 'wrong'" class="text-red-500 animate-bounce-slow flex items-center gap-2"><i class="fas fa-times-circle"></i> Try Again!</span>
                    <span v-else-if="reciteStatus === 'correct'" class="text-emerald-500 flex items-center gap-2"><i class="fas fa-check-circle"></i> Correct!</span>
                    <div v-else class="text-slate-300 flex gap-4 text-xs font-normal">
                        <span class="flex items-center gap-1"><kbd class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">←</kbd> Prev</span>
                        <span class="flex items-center gap-1"><kbd class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">Enter</kbd> Check</span>
                        <span class="flex items-center gap-1"><kbd class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">→</kbd> Next</span>
                    </div>
                </div>
                
                <div v-if="showAnswer" class="mt-8 p-6 rounded-xl animate-fade-in w-full max-w-md mx-auto border" :class="{'bg-indigo-50 border-indigo-100':reciteConfig.studyMode==='recite', 'bg-purple-50 border-purple-100':reciteConfig.studyMode==='dictate', 'bg-pink-50 border-pink-100':reciteConfig.studyMode==='memorize'}">
                    <p class="text-xs font-bold uppercase mb-1" :class="{'text-indigo-400':reciteConfig.studyMode==='recite', 'text-purple-400':reciteConfig.studyMode==='dictate', 'text-pink-400':reciteConfig.studyMode==='memorize'}">Answer</p>
                    <p class="text-3xl font-black tracking-wide select-all" :class="{'text-indigo-600':reciteConfig.studyMode==='recite', 'text-purple-600':reciteConfig.studyMode==='dictate', 'text-pink-600':reciteConfig.studyMode==='memorize'}">{{ currentReciteWord?.word }}</p>
                    <p class="text-xs mt-2" :class="{'text-indigo-400':reciteConfig.studyMode==='recite', 'text-purple-400':reciteConfig.studyMode==='dictate', 'text-pink-400':reciteConfig.studyMode==='memorize'}">Type it correctly to continue</p>
                </div>
            </div>
            <button @click.stop="prevWord" class="fixed left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition" :class="{'opacity-50 cursor-not-allowed': reciteIndex === 0}"><i class="fas fa-chevron-left"></i></button>
            <button @click.stop="nextWord" class="fixed right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition"><i class="fas fa-chevron-right"></i></button>
        </div>

        <div v-if="isMatchingGame" class="fixed inset-0 bg-white z-[100] flex flex-col animate-fade-in">
            <template v-if="matchGameMode === 'playing'">
                <div class="p-6 flex justify-between items-center bg-slate-50 border-b border-slate-100">
                    <div class="text-slate-500 font-bold flex gap-4 items-center">
                        <span class="text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-sm border border-emerald-100 shadow-sm">
                            <i class="fas fa-layer-group mr-2"></i>本轮进度: {{ Math.min((matchCurrentRound + 1) * 20, matchTotalQueue.length) }} / {{ matchTotalQueue.length }}
                        </span>
                    </div>
                    <button @click="submitMatchRound" class="px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition shadow-lg shadow-emerald-200 active:scale-95">
                        {{ (matchCurrentRound + 1) * 20 >= matchTotalQueue.length ? '完成测试' : '下一组' }} <i class="fas fa-arrow-right ml-1"></i>
                    </button>
                </div>
                <div class="flex-1 flex relative overflow-hidden bg-slate-50/30 p-6 items-center justify-center">
                    <div class="grid grid-cols-4 gap-6 w-full max-w-6xl" :class="matchCol3.length === 0 ? 'max-w-2xl !grid-cols-2' : ''">
                        <div class="flex flex-col gap-3">
                            <div v-for="item in matchCol1" :key="'c1-'+item.id" @click="handleMatchClick(item)" class="h-16 px-4 rounded-xl shadow-sm border-2 cursor-pointer transition-all flex items-center justify-center text-center text-sm font-medium select-none relative group" :class="[isSelected(item) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100 z-10' : (isPaired(item) ? 'bg-slate-100 border-slate-200 text-slate-400 shadow-none' : 'bg-white border-white text-slate-600 hover:border-emerald-100 hover:shadow-md')]">
                                {{ item.meaning }}
                                <div v-if="getPairOrder(item)" class="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold shadow-md border-2 border-white">{{ getPairOrder(item) }}</div>
                            </div>
                        </div>
                        <div class="flex flex-col gap-3">
                            <div v-for="item in matchCol2" :key="'c2-'+item.id" @click="handleMatchClick(item)" class="h-16 px-4 rounded-xl shadow-sm border-2 cursor-pointer transition-all flex items-center justify-center text-center font-bold text-lg select-none relative group" :class="[isSelected(item) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100 z-10' : (isPaired(item) ? 'bg-slate-100 border-slate-200 text-slate-400 shadow-none' : 'bg-white border-white text-slate-700 hover:border-emerald-100 hover:shadow-md')]">
                                {{ item.word }}
                                <div v-if="getPairOrder(item)" class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold shadow-md border-2 border-white">{{ getPairOrder(item) }}</div>
                            </div>
                        </div>
                        <div v-if="matchCol3.length > 0" class="flex flex-col gap-3 pl-4 border-l border-slate-200/50">
                            <div v-for="item in matchCol3" :key="'c3-'+item.id" @click="handleMatchClick(item)" class="h-16 px-4 rounded-xl shadow-sm border-2 cursor-pointer transition-all flex items-center justify-center text-center font-bold text-lg select-none relative group" :class="[isSelected(item) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100 z-10' : (isPaired(item) ? 'bg-slate-100 border-slate-200 text-slate-400 shadow-none' : 'bg-white border-white text-slate-700 hover:border-emerald-100 hover:shadow-md')]">
                                {{ item.word }}
                                <div v-if="getPairOrder(item)" class="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold shadow-md border-2 border-white">{{ getPairOrder(item) }}</div>
                            </div>
                        </div>
                        <div v-if="matchCol4.length > 0" class="flex flex-col gap-3">
                            <div v-for="item in matchCol4" :key="'c4-'+item.id" @click="handleMatchClick(item)" class="h-16 px-4 rounded-xl shadow-sm border-2 cursor-pointer transition-all flex items-center justify-center text-center text-sm font-medium select-none relative group" :class="[isSelected(item) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100 z-10' : (isPaired(item) ? 'bg-slate-100 border-slate-200 text-slate-400 shadow-none' : 'bg-white border-white text-slate-600 hover:border-emerald-100 hover:shadow-md')]">
                                {{ item.meaning }}
                                <div v-if="getPairOrder(item)" class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold shadow-md border-2 border-white">{{ getPairOrder(item) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
            <template v-else>
                <div class="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="text-2xl font-bold text-slate-800">测试结果汇总</h3>
                    <div class="flex gap-6 text-base font-bold bg-white px-6 py-2 rounded-xl shadow-sm border border-slate-100">
                        <span class="text-emerald-500"><i class="fas fa-check-circle mr-1"></i> 正确: {{ matchCorrectList.length }}</span>
                        <span class="text-red-500"><i class="fas fa-times-circle mr-1"></i> 错误: {{ matchWrongList.length }}</span>
                    </div>
                    <button @click="exitMatchGame" class="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition shadow-lg active:scale-95">结束测试</button>
                </div>
                <div class="flex-1 flex overflow-hidden">
                    <div class="flex-1 border-r border-slate-100 bg-emerald-50/20 p-8 overflow-y-auto custom-scrollbar">
                        <h4 class="text-lg font-bold text-emerald-600 mb-6 uppercase tracking-wider flex items-center gap-2"><i class="fas fa-check-circle"></i> 完美配对 (Correct)</h4>
                        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            <div v-for="res in matchCorrectList" :key="res.word" class="flex flex-col p-4 bg-white border border-emerald-100 rounded-2xl shadow-sm hover:shadow-md transition">
                                <span class="font-black text-slate-800 text-lg mb-1">{{ res.word }}</span>
                                <span class="text-sm text-slate-500">{{ res.correctMeaning }}</span>
                            </div>
                            <div v-if="matchCorrectList.length === 0" class="col-span-full text-center text-slate-400 py-10 italic">没有正确配对... 加油！</div>
                        </div>
                    </div>
                    <div class="flex-1 bg-red-50/20 p-8 overflow-y-auto custom-scrollbar">
                        <h4 class="text-lg font-bold text-red-500 mb-6 uppercase tracking-wider flex items-center gap-2"><i class="fas fa-times-circle"></i> 需要复习 (Incorrect)</h4>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div v-for="res in matchWrongList" :key="res.word" class="flex flex-col p-4 bg-white border border-red-100 rounded-2xl shadow-sm hover:shadow-md transition">
                                <div class="flex justify-between items-start mb-2">
                                    <span class="font-black text-red-600 line-through text-lg">{{ res.word }}</span>
                                </div>
                                <div class="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg mb-2">正确: {{ res.correctMeaning }}</div>
                                <div class="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">你的选择: {{ res.userMeaning }}</div>
                            </div>
                            <div v-if="matchWrongList.length === 0" class="col-span-full text-center text-emerald-400 py-20 flex flex-col items-center">
                                <i class="fas fa-crown text-6xl mb-4 opacity-50"></i>
                                <span class="font-bold text-2xl">全对！太棒了！🎉</span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </div>
    `
}
/**
 * js/apps/FeynmanApp.js
 * 费曼自测独立模块 - v4.3 (LaTeX 公式支持版)
 * 迭代：
 * 1. 接入 MathJax 渲染引擎，支持标准定义、题目、提示词的 LaTeX 渲染。
 * 2. 新增新建/编辑卡片时的公式实时预览区。
 * 3. 修复 DOM 刷新时公式不渲染的问题。
 */
import { ref, computed, onUnmounted, watch, onMounted, nextTick } from 'vue';

export default {
    props: ['concepts', 'subjects', 'grades'], 
    emits: ['add-concept', 'update-concept', 'delete-concept', 'back-home', 'refresh'],
    template: `
    <div class="h-full flex gap-6 animate-fade-in relative font-sans">
        <div class="w-64 bg-white/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-100/50 flex flex-col p-5">
            <div class="mb-6 flex items-center gap-3 px-2 pt-2">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/30">
                    <i class="fas fa-chalkboard-teacher text-lg"></i>
                </div>
                <div>
                    <h2 class="font-bold text-lg text-slate-800 leading-tight">费曼自测</h2>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mastery Learning</p>
                </div>
            </div>
            
            <div class="px-2 mb-4 space-y-4">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1.5 block">年级筛选</label>
                    <div class="relative group">
                        <select v-model="currentGrade" class="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition cursor-pointer">
                            <option value="all">🎓 全部年级</option>
                            <option v-for="g in grades" :value="g">{{ g }}</option>
                        </select>
                        <i class="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none group-hover:text-cyan-500 transition"></i>
                    </div>
                </div>
            </div>
            <div class="h-px bg-slate-100 mx-2 mb-2"></div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                <button @click="currentSubject = 'all'" class="w-full text-left px-4 py-3 rounded-2xl text-sm font-bold transition flex justify-between items-center" :class="currentSubject === 'all' ? 'bg-slate-800 text-white shadow-lg shadow-slate-300' : 'text-slate-500 hover:bg-slate-50 hover:pl-5'">
                    <span>📚 全部学科</span>
                    <span class="bg-white/20 px-2 py-0.5 rounded-lg text-xs backdrop-blur-sm">{{ filteredList.length }}</span>
                </button>
                <div class="h-px bg-slate-100 my-2 mx-2"></div>
                <button v-for="sub in subjects" :key="sub" @click="currentSubject = sub" class="w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold transition-all flex justify-between items-center group" :class="currentSubject === sub ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50 hover:pl-6'">
                    <span>{{ sub }}</span>
                    <span class="text-xs opacity-40 group-hover:opacity-100 transition-opacity">{{ concepts.filter(c => c.subject === sub).length }}</span>
                </button>
            </div>
            <button @click="$emit('back-home')" class="mt-4 w-full py-3 text-slate-400 hover:text-slate-600 text-sm font-bold bg-slate-50 hover:bg-slate-100 rounded-2xl transition flex items-center justify-center gap-2">
                <i class="fas fa-arrow-left"></i> 返回概览
            </button>
        </div>

        <div class="flex-1 flex flex-col min-w-0">
            <div class="h-20 mb-6 bg-white/70 backdrop-blur-md rounded-[2rem] flex items-center justify-between px-8 border border-white/60 shadow-sm sticky top-0 z-30">
                <div class="flex items-center gap-6 flex-1">
                    <div>
                        <h3 class="font-bold text-slate-800 text-xl flex items-center gap-2">
                            {{ currentSubject === 'all' ? '所有学科' : currentSubject }}
                            <span v-if="currentGrade !== 'all'" class="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-md border border-cyan-200">{{ currentGrade }}</span>
                        </h3>
                        <p class="text-xs text-slate-400 font-medium">Concept Explanation & Active Recall</p>
                    </div>
                    <div class="relative ml-4 flex-1 max-w-md group">
                        <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition"></i>
                        <input v-model="searchQuery" class="w-full pl-11 pr-4 py-2.5 bg-slate-100/50 border border-transparent rounded-2xl text-sm font-medium focus:outline-none focus:bg-white focus:border-cyan-200 focus:ring-4 focus:ring-cyan-500/10 transition placeholder-slate-400" placeholder="搜索核心概念(Q)...">
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <button @click="startEbbinghausQuiz" 
                            :disabled="dueCount === 0"
                            class="px-4 py-2.5 font-bold rounded-2xl transition flex items-center gap-2 text-xs relative group overflow-hidden"
                            :class="dueCount > 0 ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105' : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
                    >
                        <div v-if="dueCount > 0" class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <i class="fas fa-brain"></i> 
                        <span class="hidden lg:inline relative z-10">今日复习</span>
                        <span v-if="dueCount > 0" class="bg-white text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-md font-extrabold shadow-sm relative z-10">{{ dueCount }}</span>
                    </button>

                    <div class="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4 pl-2">
                        <button @click="downloadTemplate" class="w-9 h-9 bg-white text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl border border-slate-200 transition flex items-center justify-center shadow-sm" title="下载Excel模板">
                            <i class="fas fa-file-download"></i>
                        </button>
                        <label class="w-9 h-9 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl border border-emerald-100 transition flex items-center justify-center cursor-pointer shadow-sm relative overflow-hidden group" title="导入Excel">
                            <i class="fas fa-file-upload group-hover:scale-110 transition-transform"></i>
                            <input type="file" accept=".xlsx, .xls" class="hidden" @change="handleFileUpload">
                        </label>
                    </div>

                    <button @click="openAddModal(null)" class="px-5 py-2.5 rounded-2xl font-bold text-white shadow-lg bg-slate-900 hover:bg-slate-800 transition transform active:scale-95 flex items-center gap-2 text-sm">
                        <i class="fas fa-plus"></i> 新建
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
                <div v-if="filteredList.length === 0" class="h-full flex flex-col items-center justify-center text-slate-300">
                    <div class="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                        <i class="fas fa-wind text-4xl opacity-50"></i>
                    </div>
                    <p class="font-bold text-lg">一片荒芜...</p>
                    <p class="text-sm opacity-60">快去新建或者导入费曼卡片吧</p>
                </div>

                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 pb-24">
                    <div v-for="item in displayList" :key="item.id" 
                         class="group relative bg-white rounded-[1.5rem] p-6 transition-all duration-300 flex flex-col h-[260px] overflow-hidden border border-slate-100"
                         :class="[
                            item.isPinned ? 'ring-2 ring-cyan-100 shadow-md' : 'shadow-sm hover:shadow-xl hover:shadow-cyan-900/5 hover:border-cyan-100 hover:-translate-y-1',
                            isDueForReview(item) ? 'shadow-indigo-200 ring-1 ring-indigo-100' : ''
                         ]"
                    >
                        <div v-if="isDueForReview(item)" class="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-2xl opacity-60 pointer-events-none animate-pulse"></div>

                        <div class="flex justify-between items-start mb-4 relative z-10">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-500 border-slate-100 tracking-wide">{{ item.subject }}</span>
                                <span v-if="item.orderNum && item.orderNum > 0" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">No.{{ item.orderNum }}</span>
                                <span v-if="isDueForReview(item)" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-100 text-indigo-600 flex items-center gap-1 animate-pulse">
                                    <i class="fas fa-clock"></i> 待复习
                                </span>
                            </div>
                            
                            <button @click.stop="toggleCurve(item)" 
                                    class="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                                    :class="isInCurve(item) ? 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-500'"
                                    :title="isInCurve(item) ? '已加入复习计划 (点击移出)' : '加入遗忘曲线复习'"
                            >
                                <i class="fas fa-history text-xs"></i>
                            </button>
                        </div>

                        <div class="flex-1 flex flex-col relative z-10">
                            <h4 class="font-bold text-slate-800 text-xl mb-3 line-clamp-2 leading-snug group-hover:text-cyan-700 transition-colors math-content" :title="item.title">
                                {{ item.title }}
                            </h4>
                            
                            <div class="flex-1">
                                <div v-if="item.hints" class="inline-block bg-amber-50/80 px-3 py-2 rounded-xl border border-amber-100/50 max-w-full">
                                    <div class="flex items-center gap-1.5 mb-1">
                                        <div class="w-1 h-3 bg-amber-400 rounded-full"></div>
                                        <span class="text-[10px] font-bold text-amber-500 uppercase">Hints</span>
                                    </div>
                                    <p class="text-xs text-amber-800/80 line-clamp-2 leading-relaxed math-content">{{ item.hints }}</p>
                                </div>
                                <div v-else class="text-slate-300 text-xs italic py-2">
                                    无提示词...
                                </div>
                            </div>
                        </div>

                        <div class="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between relative z-10">
                            <div class="flex flex-col">
                                <div class="flex items-center gap-1 mb-1">
                                    <div class="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" :style="{ width: (item.proficiency || 0) * 10 + '%' }"></div>
                                    </div>
                                    <span class="text-[10px] font-bold text-slate-400">{{ item.proficiency || 0 }}/10</span>
                                </div>
                                <div class="text-[10px] text-slate-400 flex items-center gap-1">
                                    <i class="fas fa-sync-alt text-[8px] opacity-60"></i> {{ item.reviewCount || 0 }} 次自测
                                </div>
                            </div>

                            <div class="flex items-center gap-2">
                                <div class="flex gap-1 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                    <button @click.stop="togglePin(item)" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-300 hover:text-cyan-500 transition" :class="{'text-cyan-500': item.isPinned}"><i class="fas fa-thumbtack text-xs"></i></button>
                                    <button @click.stop="openAddModal(item)" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-indigo-500 transition"><i class="fas fa-pen text-xs"></i></button>
                                    <button @click.stop="$emit('delete-concept', item.id)" class="w-8 h-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition"><i class="fas fa-trash text-xs"></i></button>
                                </div>
                                
                                <button @click="startFeynmanTest(item)" class="w-10 h-10 bg-slate-900 hover:bg-cyan-600 text-white rounded-full shadow-lg shadow-slate-300/50 hover:shadow-cyan-500/30 transition-all transform hover:scale-110 flex items-center justify-center">
                                    <i class="fas fa-play ml-0.5"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showAddModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl p-8 scale-up max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-8">
                    <h3 class="text-2xl font-bold text-slate-800">{{ isEditing ? '编辑内容' : '新建费曼卡片' }}</h3>
                    <button @click="showAddModal=false" class="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 transition flex items-center justify-center"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="space-y-6">
                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">学科</label>
                            <select v-model="newItem.subject" @change="handleSubjectGradeChange" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-cyan-500 focus:bg-white transition">
                                <option v-for="s in subjects" :value="s">{{ s }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">年级</label>
                            <select v-model="newItem.grade" @change="handleSubjectGradeChange" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-cyan-500 focus:bg-white transition">
                                <option value="" disabled>选择</option>
                                <option v-for="g in grades" :value="g">{{ g }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">排序编号</label>
                            <input type="number" v-model.number="newItem.orderNum" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-cyan-600 outline-none focus:border-cyan-500 focus:bg-white transition" placeholder="自动计算">
                        </div>
                    </div>

                    <div>
                        <div class="flex justify-between items-end mb-2">
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wide">核心概念 (Question)</label>
                            <span class="text-[10px] text-cyan-500 bg-cyan-50 px-2 py-1 rounded" v-pre>支持 LaTeX $...$</span>
                        </div>
                        <input v-model="newItem.title" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-800 outline-none focus:border-cyan-500 focus:bg-white transition font-mono" placeholder="例如: 什么是量子纠缠？">
                    </div>

                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wide">关键词提示 (Hints)</label>
                        </div>
                        <textarea v-model="newItem.hints" rows="2" class="w-full px-5 py-3 bg-amber-50/50 border border-amber-100 rounded-xl text-sm text-slate-700 outline-none focus:border-amber-400 focus:bg-white transition font-mono" placeholder="例如: 叠加态, 远距离, 瞬时感应..."></textarea>
                    </div>

                    <div>
                        <div class="flex justify-between items-end mb-2">
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wide">标准定义 (Answer - 列表隐藏)</label>
                        </div>
                        <textarea v-model="newItem.content" rows="4" class="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-cyan-500 focus:bg-white transition custom-scrollbar leading-relaxed font-mono" placeholder="在此输入标准的定义或解释，支持 LaTeX 公式（如 $E=mc^2$）..."></textarea>
                        
                        <div class="mt-3 p-4 bg-cyan-50/50 rounded-xl border border-cyan-100">
                            <label class="block text-[10px] font-bold text-cyan-500 mb-2 uppercase">排版与公式预览</label>
                            <div class="math-content text-slate-700 text-sm whitespace-pre-wrap">{{ newItem.content }}</div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 mt-10">
                    <button @click="showAddModal=false" class="flex-1 py-3.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                    <button @click="handleSave" class="flex-1 py-3.5 bg-slate-900 hover:bg-cyan-600 text-white font-bold rounded-xl shadow-xl shadow-slate-200 transition transform active:scale-95">保存卡片</button>
                </div>
            </div>
        </div>

        <div v-if="showTestModal" class="fixed inset-0 bg-slate-950/95 z-[70] flex flex-col animate-fade-in text-slate-200">
            <div class="px-8 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
                <div class="flex items-center gap-6">
                    <button @click="exitTest" class="w-10 h-10 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition shadow-sm border border-slate-800 flex items-center justify-center"><i class="fas fa-times"></i></button>
                    <div>
                        <h2 class="text-xl font-bold text-white flex items-center gap-3">
                            {{ isEbbinghausMode ? '遗忘曲线自测' : '费曼自测模式' }}
                            <span v-if="testItem" class="text-xs bg-cyan-900/50 text-cyan-300 px-3 py-1 rounded-full border border-cyan-800 shadow-sm">{{ testItem.subject }}</span>
                        </h2>
                    </div>
                </div>
            </div>

            <div class="flex flex-1 overflow-hidden">
                <div class="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col overflow-hidden">
                    <div class="p-5 border-b border-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        {{ isEbbinghausMode ? '今日复习' : '练习队列' }} ({{ currentTestList.length }})
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                        <div v-for="item in currentTestList" :key="item.id" 
                             @click="switchTestItem(item)"
                             class="p-4 rounded-xl cursor-pointer transition flex items-center gap-3 group relative border"
                             :class="testItem && testItem.id === item.id ? 'bg-cyan-950/30 border-cyan-500/50' : 'hover:bg-slate-800/50 border-transparent'"
                        >
                            <div class="shrink-0">
                                <div class="w-2 h-2 rounded-full" :class="item.proficiency >= 8 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-700'"></div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-bold truncate transition-colors math-content" 
                                     :class="testItem && testItem.id === item.id ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-300'">
                                    {{ item.title }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex-1 flex overflow-hidden">
                    <div class="flex-1 flex flex-col border-r border-slate-800 p-10 bg-slate-950 overflow-y-auto custom-scrollbar relative">
                        <div v-if="testItem" class="max-w-2xl mx-auto w-full flex flex-col h-full">
                            <div class="mb-8">
                                <div class="text-cyan-500 font-bold text-xs uppercase tracking-[0.2em] mb-3">The Concept</div>
                                <h2 class="text-4xl font-bold text-white leading-tight math-content">{{ testItem.title }}</h2>
                            </div>
                            <div v-if="testItem.hints" class="mb-10 bg-amber-900/10 p-5 rounded-2xl border border-amber-900/30">
                                <div class="text-amber-500 font-bold text-xs uppercase tracking-widest mb-2"><i class="fas fa-lightbulb mr-2"></i>Hints</div>
                                <p class="text-amber-100/70 leading-relaxed math-content">{{ testItem.hints }}</p>
                            </div>
                            <div class="flex-1 flex flex-col relative">
                                <div class="text-slate-500 font-bold text-xs uppercase tracking-widest mb-3 flex justify-between items-center">
                                    <span>Your Explanation</span>
                                    <div class="flex items-center gap-2">
                                        <span v-if="isListening" class="text-red-500 animate-pulse text-xs font-bold flex items-center bg-red-950/30 px-2 py-1 rounded-md"><i class="fas fa-circle text-[6px] mr-2"></i> Recording</span>
                                        <span v-else class="text-slate-600 text-xs">键盘输入 或 点击麦克风</span>
                                    </div>
                                </div>
                                <div class="flex-1 relative bg-slate-900/50 rounded-3xl border border-slate-800 focus-within:border-cyan-500/50 transition overflow-hidden group">
                                    <textarea 
                                        v-model="userAnswer"
                                        class="w-full h-full bg-transparent p-8 text-slate-200 text-xl leading-relaxed outline-none resize-none custom-scrollbar placeholder-slate-700" 
                                        placeholder="请尝试用简单的语言，向一个小白复述这个概念..."
                                    ></textarea>
                                    <button @click="toggleSpeech" 
                                            class="absolute bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all transform hover:scale-110 active:scale-95 border border-white/10"
                                            :class="isListening ? 'bg-red-500 text-white shadow-red-500/30 animate-pulse' : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-cyan-500/30'"
                                    >
                                        <i class="fas text-xl" :class="isListening ? 'fa-stop' : 'fa-microphone'"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex-1 flex flex-col p-10 bg-slate-900/30 overflow-y-auto custom-scrollbar relative">
                        <div v-if="testItem" class="max-w-2xl mx-auto w-full flex flex-col h-full">
                            <div class="text-emerald-500 font-bold text-xs uppercase tracking-[0.2em] mb-6">Standard Definition</div>
                            
                            <div class="relative min-h-[300px] bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700/50 shrink-0">
                                <div class="text-2xl leading-loose text-slate-200 whitespace-pre-wrap transition-all duration-700 math-content"
                                     :class="isContentBlurred ? 'blur-lg select-none opacity-40' : 'blur-0 opacity-100'"
                                >
                                    {{ testItem.content }}
                                </div>
                                <div v-if="isContentBlurred" class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/10 backdrop-blur-[2px] rounded-[2rem]">
                                    <button @click="revealAnswer" class="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full shadow-lg shadow-emerald-900/50 transition transform hover:scale-105 flex items-center gap-3">
                                        <i class="fas fa-eye"></i> 
                                        <span>点击揭晓答案</span>
                                    </button>
                                    <p class="mt-4 text-slate-400 text-sm font-medium">对比自测 · 记录反思</p>
                                </div>
                            </div>

                            <div v-if="!isContentBlurred" class="mt-8 flex-1 flex flex-col animate-slide-up">
                                <div class="text-center mb-8 bg-slate-800/30 p-6 rounded-3xl border border-slate-700/50">
                                    <h4 class="text-slate-400 font-bold mb-4 text-sm tracking-wide">自我评价熟练度</h4>
                                    <div class="inline-flex gap-2">
                                        <button v-for="n in 10" :key="n" 
                                                @click="rateProficiency(n)"
                                                @mouseenter="hoverRating = n"
                                                @mouseleave="hoverRating = 0"
                                                class="w-8 h-12 rounded-lg flex items-center justify-center transition-all duration-200 transform hover:-translate-y-1 bg-slate-700/50 border-b-4 border-transparent"
                                                :class="(hoverRating ? n <= hoverRating : n <= testItem.proficiency) ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500' : 'text-slate-600 hover:bg-slate-700'"
                                        >
                                            <span class="text-xs font-bold">{{ n }}</span>
                                        </button>
                                    </div>
                                </div>

                                <div class="flex-1 flex flex-col">
                                    <div class="text-purple-400 font-bold text-xs uppercase tracking-widest mb-3 flex justify-between">
                                        <span>Reflections & Notes</span>
                                        <span class="text-[10px] text-slate-600 font-normal normal-case border border-slate-700 px-2 rounded">Auto-saved</span>
                                    </div>
                                    <textarea 
                                        v-model="testItem.notes"
                                        @blur="saveNotes"
                                        class="flex-1 w-full bg-slate-800/30 border border-slate-700 rounded-2xl p-6 text-slate-300 text-base leading-relaxed outline-none focus:border-purple-500/50 focus:bg-slate-800/50 transition resize-none custom-scrollbar"
                                        placeholder="记录你的不足，或者需要改进的地方..."
                                    ></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,
    setup(props, { emit }) {
        // --- 核心修复：引入 MathJax 渲染控制逻辑 ---
        let mathJaxTimeout = null;
        const renderMath = () => {
            if (mathJaxTimeout) clearTimeout(mathJaxTimeout);
            mathJaxTimeout = setTimeout(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    try {
                        if (window.MathJax.typesetClear) window.MathJax.typesetClear();
                        window.MathJax.typesetPromise().catch((err) => console.warn('MathJax error:', err));
                    } catch (e) {
                        console.error('MathJax execution failed:', e);
                    }
                }
            }, 100); 
        };

        const currentSubject = ref('all');
        const currentGrade = ref('all');
        const searchQuery = ref('');
        const today = new Date().toISOString().split('T')[0];

        const filteredList = computed(() => {
            let list = [...props.concepts];
            
            if (currentSubject.value !== 'all') list = list.filter(c => c.subject === currentSubject.value);
            if (currentGrade.value !== 'all') list = list.filter(c => c.grade === currentGrade.value);
            if (searchQuery.value.trim()) {
                const q = searchQuery.value.toLowerCase();
                list = list.filter(c => c.title && c.title.toLowerCase().includes(q));
            }
            
            return list.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                
                const orderA = (a.orderNum !== undefined && a.orderNum !== null && a.orderNum !== '') ? Number(a.orderNum) : Infinity;
                const orderB = (b.orderNum !== undefined && b.orderNum !== null && b.orderNum !== '') ? Number(b.orderNum) : Infinity;
                
                if (orderA !== orderB) return orderA - orderB;
                
                return b.id - a.id;
            });
        });

        const displayList = computed(() => filteredList.value);

        const isInCurve = (item) => item.reviewSchedule && item.reviewSchedule.length > 0;
        const isDueForReview = (item) => isInCurve(item) && item.reviewSchedule.includes(today);
        const dueCount = computed(() => props.concepts.filter(isDueForReview).length);

        const toggleCurve = (item) => {
            let newSchedule = [];
            if (!isInCurve(item)) {
                const addDays = (days) => {
                    const d = new Date();
                    d.setDate(d.getDate() + days);
                    return d.toISOString().split('T')[0];
                };
                newSchedule = [1, 2, 4, 7, 15].map(d => addDays(d));
            }
            emit('update-concept', item.id, { reviewSchedule: newSchedule });
        };

        const showAddModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const newItem = ref({ subject: '通用', grade: '通用', title: '', hints: '', content: '', isPinned: false, proficiency: 0, notes: '', reviewCount: 0, reviewSchedule: [], orderNum: 1 });

        const calculateNextOrderNum = (subject, grade) => {
            const existing = props.concepts.filter(c => c.subject === subject && c.grade === grade);
            const maxOrder = existing.reduce((max, c) => Math.max(max, Number(c.orderNum) || 0), 0);
            return maxOrder + 1;
        };

        const openAddModal = (item) => {
            if (item) {
                isEditing.value = true;
                editingId.value = item.id;
                newItem.value = JSON.parse(JSON.stringify(item));
            } else {
                isEditing.value = false;
                editingId.value = null;
                const defaultSub = props.subjects[0] || '通用';
                const defaultGrade = props.grades[0] || '通用';
                newItem.value = { 
                    subject: defaultSub, 
                    grade: defaultGrade, 
                    title: '', hints: '', content: '', 
                    isPinned: false, proficiency: 0, notes: '', reviewCount: 0, reviewSchedule: [],
                    orderNum: calculateNextOrderNum(defaultSub, defaultGrade) 
                };
            }
            showAddModal.value = true;
        };

        const handleSubjectGradeChange = () => {
            if (!isEditing.value) {
                newItem.value.orderNum = calculateNextOrderNum(newItem.value.subject, newItem.value.grade);
            }
        };

        const handleSave = () => {
            if (!newItem.value.title) return alert('请输入核心概念标题');
            newItem.value.orderNum = Number(newItem.value.orderNum) || 0;
            const conceptData = { type: 'feynman', ...newItem.value };
            
            if (isEditing.value) emit('update-concept', editingId.value, conceptData);
            else emit('add-concept', conceptData);
            
            showAddModal.value = false;
        };

        const togglePin = (item) => emit('update-concept', item.id, { isPinned: !item.isPinned });

        const showTestModal = ref(false);
        const isEbbinghausMode = ref(false);
        const testItem = ref(null);
        const userAnswer = ref('');
        const isContentBlurred = ref(true);
        const hoverRating = ref(0);
        
        const currentTestList = computed(() => {
            if (isEbbinghausMode.value) return props.concepts.filter(isDueForReview);
            return filteredList.value;
        });

        const startFeynmanTest = (item) => {
            isEbbinghausMode.value = false;
            initTest(item);
        };

        const startEbbinghausQuiz = () => {
            const dueItems = props.concepts.filter(isDueForReview);
            if (dueItems.length === 0) return;
            isEbbinghausMode.value = true;
            initTest(dueItems[0]);
        };

        const initTest = (item) => {
            testItem.value = item;
            userAnswer.value = '';
            isContentBlurred.value = true;
            isListening.value = false;
            showTestModal.value = true;
        };

        const switchTestItem = (item) => initTest(item);

        const revealAnswer = () => {
            isContentBlurred.value = false;
            if (testItem.value) {
                const newCount = (testItem.value.reviewCount || 0) + 1;
                testItem.value.reviewCount = newCount;
                emit('update-concept', testItem.value.id, { 
                    reviewCount: newCount,
                    lastReview: new Date().toISOString()
                });
            }
        };

        const rateProficiency = (score) => {
            if (!testItem.value) return;
            testItem.value.proficiency = score;
            emit('update-concept', testItem.value.id, { proficiency: score });
        };

        const saveNotes = () => {
            if (!testItem.value) return;
            emit('update-concept', testItem.value.id, { notes: testItem.value.notes });
        };

        const exitTest = () => {
            showTestModal.value = false;
            stopSpeech();
        };

        const downloadTemplate = () => window.open('/api/feynman/template');
        const handleFileUpload = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/feynman/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) { alert(`成功导入 ${data.count} 条`); emit('refresh'); } 
                else alert('导入失败: ' + data.message);
            } catch (e) { alert('上传错误'); }
            event.target.value = '';
        };

        const isListening = ref(false);
        let recognition = null;

        const toggleSpeech = () => {
            if (isListening.value) stopSpeech();
            else startSpeech();
        };

        const startSpeech = () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return alert("浏览器不支持语音识别");
            recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.interimResults = true;
            recognition.continuous = true; 
            recognition.onstart = () => { isListening.value = true; };
            recognition.onend = () => { isListening.value = false; };
            recognition.onresult = (event) => {
                let text = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) text += event.results[i][0].transcript;
                }
                if (text) userAnswer.value += text;
            };
            recognition.start();
        };

        const stopSpeech = () => {
            if (recognition) { recognition.stop(); recognition = null; }
            isListening.value = false;
        };

        // --- 添加全局侦听器：只要相关数据变动，自动触发公式重新渲染 ---
        watch(() => newItem.value.content, () => renderMath());
        watch(() => newItem.value.title, () => renderMath());
        watch(() => newItem.value.hints, () => renderMath());
        watch([showAddModal, showTestModal, testItem, isContentBlurred], () => renderMath());
        watch(displayList, () => renderMath(), { deep: true });

        onMounted(() => {
            renderMath();
        });
        
        onUnmounted(() => stopSpeech());

        return {
            currentSubject, currentGrade, searchQuery, filteredList, displayList,
            showAddModal, isEditing, newItem, openAddModal, handleSave, togglePin, handleSubjectGradeChange,
            showTestModal, isEbbinghausMode, currentTestList, testItem, userAnswer, isContentBlurred, hoverRating,
            startFeynmanTest, startEbbinghausQuiz, switchTestItem, revealAnswer, rateProficiency, saveNotes, exitTest,
            isListening, toggleSpeech,
            downloadTemplate, handleFileUpload,
            dueCount, isInCurve, isDueForReview, toggleCurve
        };
    }
}
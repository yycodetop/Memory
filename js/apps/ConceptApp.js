/**
 * js/apps/ConceptApp.js
 * 概念学习通用应用框架 (挖空填空)
 * 迭代 v3.9 (防崩溃 & 公式完美兼容版): 
 * 1. 修复 Vue 模板编译冲突导致的致命报错 (增加 v-pre 逃逸指令)
 * 2. 增加 String() 与 || '' 保护机制，防止底层核心报错
 * 3. 保留无视空格的抗干扰 LaTeX 判题算法与独立的 blankIdx 索引
 */
import { ref, computed, nextTick, onUnmounted, watch, onMounted } from 'vue';

export default {
    props: ['mode', 'concepts', 'subjects', 'grades', 'initialAction'], 
    emits: ['add-concept', 'update-concept', 'delete-concept', 'back-home', 'import-excel', 'refresh'],
    template: `
    <div class="h-full flex gap-6 animate-fade-in relative">
        <div class="w-64 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col p-4">
            <div class="mb-4 flex items-center gap-2 px-2 pt-2">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-md" :class="modeConfig.colorClass">
                    <i :class="modeConfig.icon"></i>
                </div>
                <h2 class="font-bold text-lg text-slate-800">{{ modeConfig.title }}</h2>
            </div>
            
            <div class="px-2 mb-4 space-y-3">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">年级筛选</label>
                    <div class="relative">
                        <select v-model="currentGrade" class="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:border-indigo-500 transition cursor-pointer">
                            <option value="all">🎓 全部年级</option>
                            <option v-for="g in grades" :value="g">{{ g }}</option>
                        </select>
                        <i class="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none"></i>
                    </div>
                </div>
            </div>
            <div class="h-px bg-slate-100 mx-2 mb-2"></div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                <button @click="currentSubject = 'all'" class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition flex justify-between items-center" :class="currentSubject === 'all' ? 'bg-slate-800 text-white shadow-lg shadow-slate-300' : 'text-slate-500 hover:bg-slate-50'"><span>📚 全部学科</span><span class="bg-white/20 px-2 py-0.5 rounded text-xs">{{ filteredList('all').length }}</span></button>
                <div class="h-px bg-slate-100 my-2 mx-2"></div>
                <button v-for="sub in subjects" :key="sub" @click="currentSubject = sub" class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition flex justify-between items-center group" :class="currentSubject === sub ? modeConfig.activeItemClass : 'text-slate-500 hover:bg-slate-50'"><span>{{ sub }}</span><span class="text-xs opacity-40 group-hover:opacity-100">{{ filteredList(sub).length }}</span></button>
            </div>
            <button @click="$emit('back-home')" class="mt-4 w-full py-3 text-slate-400 hover:text-slate-600 text-sm font-bold bg-slate-50 hover:bg-slate-100 rounded-xl transition"><i class="fas fa-arrow-left mr-1"></i> 返回概览</button>
        </div>

        <div class="flex-1 flex flex-col min-w-0">
            <div class="h-16 mb-4 bg-white/60 backdrop-blur-md rounded-2xl flex items-center justify-between px-6 border border-white/50 shadow-sm">
                <div>
                    <h3 class="font-bold text-slate-700 text-lg flex items-center gap-2">
                        {{ currentSubject === 'all' ? '所有学科' : currentSubject }}
                        <span v-if="currentGrade !== 'all'" class="text-xs bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-md border border-indigo-100">{{ currentGrade }}</span>
                    </h3>
                    <p class="text-xs text-slate-400">{{ modeConfig.subtitle }}</p>
                </div>
                
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4">
                        <button @click="showEbbinghausModal = true" class="px-3 py-2 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 font-bold rounded-xl shadow-sm border border-slate-200 transition flex items-center gap-2 text-xs">
                            <i class="fas fa-calendar-alt"></i> <span class="hidden lg:inline">遗忘曲线册</span>
                        </button>
                        
                        <button @click="startDailyReview" 
                                :disabled="dailyReviewCount === 0"
                                class="px-3 py-2 font-bold rounded-xl shadow-sm border transition flex items-center gap-2 text-xs relative group"
                                :class="dailyReviewCount > 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 hover:scale-105 cursor-pointer' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'"
                        >
                            <i class="fas fa-bolt"></i> 
                            <span class="hidden lg:inline">当日复习</span>
                            <span v-if="dailyReviewCount > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full shadow-md animate-bounce">{{ dailyReviewCount }}</span>
                        </button>
                    </div>

                    <div v-if="mode === 'cloze'" class="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4">
                        <button @click="downloadTemplate" class="px-3 py-2 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 font-bold rounded-xl shadow-sm border border-slate-200 transition flex items-center gap-2 text-xs" title="下载模板">
                            <i class="fas fa-download"></i>
                        </button>
                        <label class="px-3 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold rounded-xl shadow-sm border border-emerald-100 transition flex items-center gap-2 text-xs cursor-pointer relative overflow-hidden group">
                            <i class="fas fa-file-excel"></i> <span class="hidden lg:inline">导入</span>
                            <div class="absolute inset-0 bg-emerald-200 opacity-0 group-hover:opacity-20 transition"></div>
                            <input type="file" accept=".xlsx, .xls" class="hidden" @change="handleFileUpload">
                        </label>
                    </div>

                    <button @click="openAddModal(null)" class="px-6 py-2.5 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 flex items-center gap-2" :class="modeConfig.btnClass">
                        <i class="fas fa-plus"></i> 新建卡片
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-1">
                <div v-if="displayList.length === 0" class="h-full flex flex-col items-center justify-center text-slate-300">
                    <i class="fas fa-inbox text-5xl mb-4 opacity-30"></i>
                    <p>暂无符合筛选条件的知识卡片</p>
                </div>

                <div v-else class="grid grid-cols-3 gap-4 pb-20">
                    <div v-for="item in displayList" :key="item.id" 
                         class="bg-white rounded-2xl p-5 border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col relative overflow-hidden"
                         :class="item.isPinned ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-100'">
                        
                        <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br opacity-10 rounded-bl-3xl -mr-2 -mt-2 pointer-events-none" :class="modeConfig.gradientClass"></div>

                        <div class="flex justify-between items-start mb-3">
                            <div class="flex gap-1 flex-wrap">
                                <span class="text-[10px] font-bold px-2 py-1 rounded border" :class="getSubjectColor(item.subject)">{{ item.subject }}</span>
                                <span v-if="item.grade" class="text-[10px] font-bold px-2 py-1 rounded border bg-slate-50 text-slate-500 border-slate-200">{{ item.grade }}</span>
                                <span v-if="item.orderNum && item.orderNum > 0" class="text-[10px] font-bold px-2 py-1 rounded border bg-indigo-50 text-indigo-500 border-indigo-100">No.{{ item.orderNum }}</span>
                            </div>
                            <div class="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button @click.stop="togglePin(item)" class="w-6 h-6 rounded flex items-center justify-center transition" :class="item.isPinned ? 'bg-amber-100 text-amber-500' : 'bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-500'"><i class="fas fa-thumbtack text-xs"></i></button>
                                <button @click.stop="openAddModal(item)" class="w-6 h-6 rounded bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 transition flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                                <button @click.stop="$emit('delete-concept', item.id)" class="w-6 h-6 rounded bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 transition flex items-center justify-center"><i class="fas fa-trash text-xs"></i></button>
                            </div>
                        </div>

                        <h4 class="font-bold text-slate-800 text-lg mb-2 line-clamp-1 pr-6" :title="item.title">{{ item.title }}</h4>
                        
                        <div class="flex-1 min-h-[60px] mb-3">
                            <p v-if="mode === 'cloze'" class="text-sm text-slate-600 leading-relaxed line-clamp-3 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap math-content" v-html="formatClozePreview(item.content)"></p>
                            <div v-else-if="mode === 'image'" class="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 overflow-hidden relative">
                                <img v-if="item.imageUrl" :src="item.imageUrl" class="w-full h-full object-cover">
                                <i v-else class="fas fa-image text-2xl"></i>
                            </div>
                            <p v-else-if="mode === 'feynman'" class="text-sm text-slate-500 leading-relaxed line-clamp-3 italic">"{{ item.content }}"</p>
                        </div>

                        <div class="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                            <div class="flex gap-1.5 flex-wrap">
                                <div v-if="item.status === 'correct'" class="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1" title="全对">
                                    <i class="fas fa-check"></i> 掌握
                                </div>
                                <div v-else-if="item.status === 'error'" class="bg-red-50 text-red-500 text-[10px] font-bold px-2 py-1 rounded-md border border-red-100 flex items-center gap-1" title="错题">
                                    <i class="fas fa-times"></i> 错题
                                </div>
                                <div v-if="isDueForReview(item)" class="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-md border border-indigo-100 flex items-center gap-1 animate-pulse" title="待复习">
                                    <i class="fas fa-clock"></i> 待复习
                                </div>
                            </div>

                            <button @click="startRecitation(item)" class="px-5 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm transform active:scale-95 shrink-0" :class="modeConfig.actionBtnClass">
                                <i :class="modeConfig.actionIcon"></i> {{ modeConfig.actionText }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showEbbinghausModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in" @click.self="showEbbinghausModal = false">
            <div class="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-8 scale-up max-h-[85vh] flex flex-col">
                <div class="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h3 class="text-2xl font-bold text-slate-800">遗忘曲线册</h3>
                        <p class="text-sm text-slate-400">未来的复习任务时刻表</p>
                    </div>
                    <button @click="showEbbinghausModal = false" class="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 transition flex items-center justify-center"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <div v-if="Object.keys(scheduleStats).length === 0" class="text-center py-12 text-slate-300">
                        <i class="fas fa-calendar-check text-4xl mb-3"></i>
                        <p>目前没有待复习的错题</p>
                    </div>
                    
                    <div v-else class="space-y-4">
                        <div v-for="(count, date) in scheduleStats" :key="date" 
                             class="flex items-center p-4 rounded-xl border transition group"
                             :class="date === today ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-100'"
                        >
                            <div class="w-16 text-center shrink-0">
                                <div class="text-xs font-bold uppercase tracking-wider" :class="date === today ? 'text-indigo-400' : 'text-slate-400'">{{ getDayName(date) }}</div>
                                <div class="text-lg font-bold text-slate-700">{{ date.slice(5) }}</div>
                            </div>
                            
                            <div class="flex-1 px-4">
                                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div class="h-full bg-indigo-400 rounded-full" :style="{ width: Math.min(count * 5, 100) + '%' }"></div>
                                </div>
                            </div>
                            
                            <div class="flex items-center gap-3 shrink-0">
                                <span class="font-bold text-slate-700">{{ count }} <span class="text-xs text-slate-400 font-normal">题</span></span>
                                <span v-if="date === today" class="px-2 py-1 bg-indigo-500 text-white text-[10px] font-bold rounded-lg">今日</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showAddModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 scale-up max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-slate-800">{{ isEditing ? '编辑' : '新建' }} {{ modeConfig.title }}</h3>
                    <button @click="showAddModal=false" class="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 transition flex items-center justify-center"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="space-y-4">
                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">学科</label>
                            <select v-model="newItem.subject" @change="handleSubjectGradeChange" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500">
                                <option v-for="s in subjects" :value="s">{{ s }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">年级</label>
                            <select v-model="newItem.grade" @change="handleSubjectGradeChange" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500">
                                <option value="" disabled>选择</option>
                                <option v-for="g in grades" :value="g">{{ g }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">排序编号</label>
                            <input type="number" v-model.number="newItem.orderNum" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-indigo-600 outline-none focus:border-indigo-500" placeholder="自动分配">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">标题</label>
                        <input v-model="newItem.title" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500" placeholder="例如: 勾股定理">
                    </div>

                    <div v-if="mode === 'cloze'">
                        <div class="flex justify-between items-end mb-2">
                            <div>
                                <label class="block text-xs font-bold text-slate-500">定义内容 <span class="text-indigo-400 font-normal ml-1">(支持 LaTeX 公式 $...$)</span></label>
                                <p class="text-[10px] text-red-400 mt-1" v-pre>⚠️ 注意：不要将 {{}} 放在 $...$ 内部，保持公式独立。如：{{ $E=mc^2$ }}</p>
                            </div>
                            <span class="text-[10px] text-amber-500 bg-amber-50 px-2 py-1 rounded" v-pre>使用 <code class="font-mono font-bold">{{ }}</code> 挖空</span>
                        </div>
                        <textarea v-model="newItem.content" rows="4" class="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 custom-scrollbar whitespace-pre-wrap font-mono" :placeholder="'例：勾股定理的公式是 {{ $a^2 + b^2 = c^2$ }}'"></textarea>
                        
                        <div class="mt-3 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                            <label class="block text-[10px] font-bold text-indigo-400 mb-2 uppercase">排版与公式预览</label>
                            <div class="math-content text-slate-700 text-sm whitespace-pre-wrap" v-html="formatClozePreview(newItem.content)"></div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 mt-8">
                    <button @click="showAddModal=false" class="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">取消</button>
                    <button @click="handleSave" class="flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition transform active:scale-95" :class="modeConfig.btnClass">保存</button>
                </div>
            </div>
        </div>

        <div v-if="showReciteModal" class="fixed inset-0 bg-slate-900/95 z-[70] flex flex-col animate-fade-in">
            <div class="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                <div class="flex items-center gap-4">
                    <button @click="exitRecitation" class="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition shadow-sm border border-slate-700 flex items-center justify-center"><i class="fas fa-times"></i></button>
                    <div>
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            {{ currentReciteItem.title }}
                            <span v-if="isDailyReviewMode" class="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded border border-indigo-400 shadow-sm">⚡️ 今日复习</span>
                        </h2>
                        <span class="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{{ currentReciteItem.subject }} · {{ currentReciteItem.grade }}</span>
                    </div>
                </div>
                
                <div class="flex items-center gap-6">
                    <button @click="isReviewMode = !isReviewMode" 
                            class="flex items-center gap-2 px-4 py-2 rounded-full transition font-bold text-sm"
                            :class="isReviewMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'"
                    >
                        <i class="fas" :class="isReviewMode ? 'fa-book-open' : 'fa-toggle-off'"></i>
                        {{ isReviewMode ? '复习模式：开启' : '复习模式' }}
                    </button>
                </div>
            </div>

            <div class="flex flex-1 overflow-hidden relative">
                <div class="w-72 border-r border-slate-800 bg-slate-900/50 flex flex-col overflow-hidden">
                    <div class="p-4 border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider flex justify-between items-center">
                        <span>{{ isDailyReviewMode ? '⚡️ 今日任务' : '知识清单' }} ({{ currentReciteList.length }})</span>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        <div v-for="item in currentReciteList" :key="item.id" 
                             @click="switchReciteItem(item)"
                             class="p-3 rounded-lg cursor-pointer transition flex items-center gap-3 group relative"
                             :class="currentReciteItem.id === item.id ? 'bg-indigo-600/20 border border-indigo-500/50' : 'hover:bg-slate-800 border border-transparent'"
                        >
                            <div class="shrink-0">
                                <i v-if="item.status === 'correct'" class="fas fa-check-circle text-emerald-500"></i>
                                <i v-else-if="item.status === 'error'" class="fas fa-exclamation-circle text-red-500"></i>
                                <div v-else class="w-4 h-4 rounded-full border-2 border-slate-600 group-hover:border-slate-500"></div>
                            </div>
                            
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-bold truncate transition-colors" 
                                     :class="getListTitleClass(item)">
                                    {{ item.title }}
                                </div>
                            </div>

                            <div v-if="currentReciteItem.id === item.id" class="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-lg"></div>
                        </div>
                    </div>
                </div>

                <div class="flex-1 flex items-center justify-center p-8 overflow-y-auto bg-slate-900 relative">
                    
                    <div v-if="isGrading" class="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
                        <div class="relative w-40 h-40 mb-8">
                            <div class="absolute inset-0 rounded-full border-2 border-slate-700 animate-[spin_4s_linear_infinite]"></div>
                            <div class="absolute inset-2 rounded-full border border-slate-600/50"></div>
                            <div class="absolute inset-0 m-auto w-24 h-24 bg-indigo-500/20 rounded-full animate-ping"></div>
                            <div class="absolute inset-0 rounded-full border-t-4 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-[spin_1s_linear_infinite]"></div>
                            <div class="absolute inset-0 flex items-center justify-center text-5xl text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                                <i class="fas fa-microchip"></i>
                            </div>
                        </div>
                        <h3 class="text-cyan-400 text-xl font-mono font-bold tracking-widest animate-pulse mb-2">SYSTEM ANALYZING...</h3>
                        <p class="text-slate-500 text-xs font-bold uppercase tracking-wide">Syncing Answers • Verifying Knowledge</p>
                    </div>

                    <div v-if="mode === 'cloze'" class="max-w-4xl w-full bg-white rounded-3xl shadow-2xl p-12 min-h-[400px] flex flex-col border border-slate-100 relative">
                        <div v-if="!isReviewMode" class="absolute -top-6 left-8 bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg">
                            <i class="fas fa-keyboard mr-1"></i> 直接填写 · Enter 键跳转 · 焦点下显示语音
                        </div>
                        <div v-if="isReviewMode" class="absolute -top-6 left-8 bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg">
                            <i class="fas fa-book-reader mr-1"></i> 正在复习 · 显示全部内容
                        </div>

                        <div class="text-2xl leading-[3rem] text-slate-700 font-serif whitespace-pre-wrap text-justify math-content">
                            <template v-for="(segment, idx) in parsedClozeContent" :key="idx">
                                <span v-if="segment.type === 'text'">{{ segment.val }}</span>
                                
                                <span v-else class="relative inline-block mx-1 align-bottom">
                                    <span v-if="isReviewMode" class="text-indigo-600 font-bold border-b-2 border-indigo-100 px-1 select-text cursor-text">
                                        {{ segment.answer }}
                                    </span>

                                    <input v-else
                                           type="text"
                                           v-model="segment.userVal"
                                           @focus="handleInputFocus(idx)"
                                           @input="handleInputChange(idx)"
                                           @keyup.enter="focusNextInput(idx)"
                                           :id="'cloze-input-' + idx"
                                           :class="getClozeClass(segment)"
                                           :style="{ width: Math.max((segment.userVal || segment.answer).length, 4) + 'em' }"
                                           autocomplete="off"
                                           class="text-center outline-none border-b-2 bg-transparent transition-all duration-300 py-0.5 rounded-t"
                                    >

                                    <button v-if="activeInputIndex === idx && !isReviewMode"
                                            @mousedown.prevent="toggleSpeech(idx)" 
                                            class="absolute -top-9 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg z-20 transition-all transform animate-pop-in"
                                            :class="isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-white hover:bg-indigo-600 hover:scale-110'"
                                            title="点击语音输入"
                                    >
                                        <i class="fas" :class="isListening ? 'fa-microphone-slash' : 'fa-microphone'"></i>
                                    </button>
                                </span>
                            </template>
                        </div>
                    </div>
                </div>

                <div v-if="!isReviewMode && mode === 'cloze'" class="absolute bottom-8 left-80 z-40 animate-slide-up">
                    <button @click="submitCheck" class="group relative px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-xl shadow-indigo-900/40 transition-all active:scale-95 flex items-center gap-3 overflow-hidden">
                        <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <i class="fas fa-tasks text-xl"></i>
                        <div class="text-left">
                            <div class="text-[10px] uppercase font-bold text-indigo-200 tracking-wider">Finish All</div>
                            <div class="font-bold text-lg leading-none">提交所有判题</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>

        <div v-if="resultModal.show" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" @click.self="resultModal.show = false">
            <div class="bg-slate-800 rounded-3xl w-full max-w-sm shadow-2xl scale-up border border-slate-700 text-white relative overflow-hidden">
                <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                <div class="p-8 text-center relative z-10">
                    <div class="w-32 h-32 mx-auto mb-6 relative flex items-center justify-center">
                        <svg class="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="8" fill="transparent" class="text-slate-700" />
                            <circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="8" fill="transparent" 
                                    :stroke-dasharray="351.86" 
                                    :stroke-dashoffset="351.86 - (351.86 * resultModal.score) / 100" 
                                    class="text-emerald-500 transition-all duration-1000 ease-out" />
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                            <span class="text-4xl font-bold font-mono">{{ resultModal.score }}<span class="text-sm">%</span></span>
                            <span class="text-xs text-slate-400 uppercase tracking-widest mt-1">正确率</span>
                        </div>
                    </div>
                    
                    <h3 class="text-2xl font-bold mb-8">本次练习报告</h3>
                    
                    <div class="grid grid-cols-3 gap-4 mb-8">
                        <div class="bg-slate-700/50 rounded-xl p-3 border border-slate-600">
                            <div class="text-2xl font-bold text-slate-200">{{ resultModal.total }}</div>
                            <div class="text-[10px] text-slate-400 uppercase">总填空</div>
                        </div>
                        <div class="bg-slate-700/50 rounded-xl p-3 border border-slate-600">
                            <div class="text-2xl font-bold text-emerald-400">{{ resultModal.correct }}</div>
                            <div class="text-[10px] text-slate-400 uppercase">正确</div>
                        </div>
                        <div class="bg-slate-700/50 rounded-xl p-3 border border-slate-600">
                            <div class="text-2xl font-bold text-red-400">{{ resultModal.wrong }}</div>
                            <div class="text-[10px] text-slate-400 uppercase">错误</div>
                        </div>
                    </div>

                    <button @click="resultModal.show = false" class="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition">
                        继续学习 / 修改错题
                    </button>
                </div>
            </div>
        </div>
    </div>
    `,
    directives: {
        focus: { mounted: (el) => el.focus() }
    },
    setup(props, { emit }) {
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

        const today = computed(() => new Date().toISOString().split('T')[0]);

        const isDueForReview = (item) => {
            return item.reviewSchedule && item.reviewSchedule.includes(today.value);
        };

        const getDayName = (dateStr) => {
            const date = new Date(dateStr);
            const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            return days[date.getDay()];
        };

        const addDays = (dateStr, days) => {
            const result = new Date(dateStr);
            result.setDate(result.getDate() + days);
            return result.toISOString().split('T')[0];
        };

        const currentSubject = ref('all');
        const currentGrade = ref('all');
        const showAddModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const newItem = ref({ subject: '通用', grade: '通用', title: '', content: '', orderNum: 1, isPinned: false });

        const showEbbinghausModal = ref(false);
        const isDailyReviewMode = ref(false);
        const showReciteModal = ref(false);
        const currentReciteItem = ref(null);
        const parsedClozeContent = ref([]);
        const isReviewMode = ref(false);
        
        const userAnswers = ref({}); 
        const itemGradedStates = ref({});
        const isGrading = ref(false);
        const resultModal = ref({ show: false, total: 0, correct: 0, wrong: 0, score: 0 });
        
        const activeInputIndex = ref(null);
        const isListening = ref(false);
        let recognition = null; 

        const modeConfig = computed(() => {
            const configs = {
                cloze: { title: '挖空填空', subtitle: 'Cloze Deletion', icon: 'fas fa-highlighter', colorClass: 'bg-amber-500', btnClass: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200', activeItemClass: 'bg-amber-50 text-amber-600', gradientClass: 'from-amber-400 to-orange-500', actionText: '开始背诵', actionIcon: 'fas fa-eye', actionBtnClass: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
            };
            return configs[props.mode] || configs.cloze;
        });

        const filteredList = (sub) => {
            let list = [...props.concepts];
            if (sub !== 'all') list = list.filter(c => c.subject === sub);
            if (currentGrade.value !== 'all') list = list.filter(c => c.grade === currentGrade.value);
            
            return list.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                
                const orderA = (a.orderNum !== undefined && a.orderNum !== null && a.orderNum !== '') ? Number(a.orderNum) : Infinity;
                const orderB = (b.orderNum !== undefined && b.orderNum !== null && b.orderNum !== '') ? Number(b.orderNum) : Infinity;
                if (orderA !== orderB) return orderA - orderB;
                
                return b.id - a.id;
            });
        };
        const displayList = computed(() => filteredList(currentSubject.value));

        watch(displayList, () => renderMath(), { deep: true });
        watch(() => newItem.value.content, () => renderMath());
        watch([showAddModal, showReciteModal, isReviewMode, currentReciteItem], () => renderMath());

        const calculateNextOrderNum = (subject, grade) => {
            const existing = props.concepts.filter(c => c.subject === subject && c.grade === grade);
            const maxOrder = existing.reduce((max, c) => Math.max(max, Number(c.orderNum) || 0), 0);
            return maxOrder + 1;
        };

        const togglePin = (item) => {
            emit('update-concept', item.id, { isPinned: !item.isPinned });
        };

        const handleSubjectGradeChange = () => {
            if (!isEditing.value) {
                newItem.value.orderNum = calculateNextOrderNum(newItem.value.subject, newItem.value.grade);
            }
        };

        const currentReciteList = computed(() => {
            if (isDailyReviewMode.value) return props.concepts.filter(isDueForReview);
            if (!currentReciteItem.value) return [];
            return props.concepts.filter(c => 
                c.subject === currentReciteItem.value.subject && 
                (currentReciteItem.value.grade ? c.grade === currentReciteItem.value.grade : true)
            );
        });

        const scheduleStats = computed(() => {
            const stats = {};
            props.concepts.forEach(item => {
                if (item.reviewSchedule && Array.isArray(item.reviewSchedule)) {
                    item.reviewSchedule.forEach(date => {
                        if (!stats[date]) stats[date] = 0;
                        stats[date]++;
                    });
                }
            });
            return Object.keys(stats).sort().reduce((obj, key) => { obj[key] = stats[key]; return obj; }, {});
        });

        const dailyReviewCount = computed(() => props.concepts.filter(isDueForReview).length);

        const getListTitleClass = (item) => {
            if (currentReciteItem.value && currentReciteItem.value.id === item.id) return 'text-indigo-400';
            if (item.status === 'correct') return 'textemerald-500 font-bold';
            if (item.status === 'error') return 'text-red-500 font-bold';
            return 'text-slate-300';
        };

        // 核心保护：增加 String() 强转
        const getClozeClass = (segment) => {
            const itemId = currentReciteItem.value ? currentReciteItem.value.id : null;
            const state = (itemId && itemGradedStates.value[itemId]) ? itemGradedStates.value[itemId][segment.blankIdx] : 'editing';

            if (state !== 'graded') {
                if (segment.userVal) return 'border-blue-400 text-blue-600 font-bold bg-blue-50';
                return 'border-blue-200 text-transparent hover:border-blue-300';
            }
            
            const cleanUser = String(segment.userVal || '').replace(/\s+/g, '');
            const cleanAns = String(segment.answer || '').replace(/\s+/g, '');

            if (cleanUser === cleanAns) return 'border-orange-400 text-orange-500 font-bold bg-orange-50';
            return 'border-red-400 text-red-500 font-bold bg-red-50 line-through decoration-red-300';
        };

        const getSubjectColor = (sub) => {
            const colors = { '数学': 'bg-red-50 text-red-600 border-red-100', '物理': 'bg-blue-50 text-blue-600 border-blue-100', '化学': 'bg-purple-50 text-purple-600 border-purple-100', '生物': 'bg-emerald-50 text-emerald-600 border-emerald-100', '地理': 'bg-amber-50 text-amber-600 border-amber-100', '语文': 'bg-orange-50 text-orange-600 border-orange-100', '英语': 'bg-indigo-50 text-indigo-600 border-indigo-100' };
            return colors[sub] || 'bg-slate-50 text-slate-600 border-slate-100';
        };

        const resetReciteState = () => {
            if(currentReciteList.value) currentReciteList.value.forEach(i => i.status = null);
            userAnswers.value = {};
            itemGradedStates.value = {};
            isReviewMode.value = false;
        };

        const startRecitation = (item) => {
            isDailyReviewMode.value = false;
            resetReciteState();
            currentReciteItem.value = item;
            initClozeContent(item);
            showReciteModal.value = true;
        };

        const startDailyReview = () => {
            const dailyItems = props.concepts.filter(isDueForReview);
            if (dailyItems.length === 0) return;
            isDailyReviewMode.value = true;
            resetReciteState();
            currentReciteItem.value = dailyItems[0];
            initClozeContent(dailyItems[0]);
            showReciteModal.value = true;
        };

        const switchReciteItem = (item) => {
            currentReciteItem.value = item;
            initClozeContent(item);
        };

        // 核心保护：防止 item.content 为空导致 .split 报错
        const initClozeContent = (item) => {
            if (props.mode === 'cloze') {
                const regex = /(\{\{.+?\}\})/g;
                const parts = String(item.content || '').split(regex);
                let blankIdx = 0; 

                parsedClozeContent.value = parts.map((part) => {
                    if (part.startsWith('{{') && part.endsWith('}}')) {
                        const answer = part.slice(2, -2);
                        const currentBlankIdx = blankIdx++; 
                        const savedVal = userAnswers.value[item.id] ? userAnswers.value[item.id][currentBlankIdx] : '';
                        
                        return { type: 'cloze', val: part, userVal: savedVal, answer: answer, blankIdx: currentBlankIdx };
                    } else {
                        return { type: 'text', val: part };
                    }
                }).filter(p => p.val !== '');
            }
        };

        const exitRecitation = () => {
            showReciteModal.value = false;
            isDailyReviewMode.value = false;
            parsedClozeContent.value = [];
            userAnswers.value = {};
            itemGradedStates.value = {};
            activeInputIndex.value = null;
            stopSpeech();
        };

        const handleInputFocus = (index) => { activeInputIndex.value = index; };
        
        const handleInputChange = (idx) => {
            if (!currentReciteItem.value) return;
            const itemId = currentReciteItem.value.id;
            const segment = parsedClozeContent.value[idx];
            const blankIdx = segment.blankIdx;

            if (!userAnswers.value[itemId]) userAnswers.value[itemId] = {};
            userAnswers.value[itemId][blankIdx] = segment.userVal;
            
            if (!itemGradedStates.value[itemId]) itemGradedStates.value[itemId] = {};
            itemGradedStates.value[itemId][blankIdx] = 'editing';
        };

        const focusNextInput = (currentIndex) => {
            let nextIndex = currentIndex + 1;
            while (nextIndex < parsedClozeContent.value.length) {
                if (parsedClozeContent.value[nextIndex].type === 'cloze') {
                    const el = document.getElementById('cloze-input-' + nextIndex);
                    if (el) { el.focus(); return; }
                }
                nextIndex++;
            }
        };

        const submitCheck = () => {
            isGrading.value = true;
            setTimeout(() => {
                let totalBlanks = 0;
                let correctBlanks = 0;
                let wrongBlanks = 0;

                currentReciteList.value.forEach(item => {
                    const splitRegex = /(\{\{.+?\}\})/g;
                    // 核心保护：防止空字符引发错误
                    const parts = String(item.content || '').split(splitRegex);
                    
                    let isItemCorrect = true;
                    let hasCloze = false;
                    let blankIdx = 0; 

                    parts.forEach((part) => {
                        if (part.startsWith('{{') && part.endsWith('}}')) {
                            hasCloze = true;
                            totalBlanks++;
                            const standardAns = part.slice(2, -2);
                            const userAns = userAnswers.value[item.id] ? userAnswers.value[item.id][blankIdx] : '';
                            
                            // 核心保护与判题容错机制
                            const cleanStandard = String(standardAns || '').replace(/\s+/g, '');
                            const cleanUser = String(userAns || '').replace(/\s+/g, '');
                            const isSegmentCorrect = cleanUser === cleanStandard;

                            if (isSegmentCorrect) correctBlanks++; else wrongBlanks++;
                            
                            if (!itemGradedStates.value[item.id]) itemGradedStates.value[item.id] = {};
                            itemGradedStates.value[item.id][blankIdx] = 'graded';
                            
                            if (!isSegmentCorrect) isItemCorrect = false;
                            
                            blankIdx++; 
                        }
                    });

                    if (hasCloze) {
                        const newStatus = isItemCorrect ? 'correct' : 'error';
                        item.status = newStatus;
                        item.lastReview = new Date().toISOString();
                        
                        let updatedSchedule = item.reviewSchedule ? [...item.reviewSchedule] : [];
                        if (!isItemCorrect) {
                            const intervals = [1, 2, 4, 7, 15];
                            intervals.forEach(day => {
                                const nextDate = addDays(today.value, day);
                                if (!updatedSchedule.includes(nextDate)) updatedSchedule.push(nextDate);
                            });
                            updatedSchedule.sort();
                        } else if (isDailyReviewMode.value && isItemCorrect) {
                            updatedSchedule = updatedSchedule.filter(d => d !== today.value);
                        }
                        emit('update-concept', item.id, { lastReview: new Date().toISOString(), status: newStatus, reviewSchedule: updatedSchedule });
                    }
                });
                isGrading.value = false;
                resultModal.value = { show: true, total: totalBlanks, correct: correctBlanks, wrong: wrongBlanks, score: totalBlanks > 0 ? Math.round((correctBlanks / totalBlanks) * 100) : 0 };
            }, 1500);
        };

        const toggleSpeech = (index) => { if (isListening.value) stopSpeech(); else { activeInputIndex.value = index; startSpeech(); } };
        const startSpeech = () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return alert("您的浏览器不支持语音识别。");
            recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            recognition.onstart = () => { isListening.value = true; };
            recognition.onend = () => { isListening.value = false; };
            recognition.onresult = (event) => {
                let text = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) text += event.results[i][0].transcript;
                if (text && activeInputIndex.value !== null) {
                    parsedClozeContent.value[activeInputIndex.value].userVal = text.replace(/[。.,，?？]$/, '');
                    handleInputChange(activeInputIndex.value);
                }
            };
            recognition.start();
        };
        const stopSpeech = () => { if (recognition) { recognition.stop(); recognition = null; } isListening.value = false; };
        
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
                    title: '', 
                    content: '',
                    orderNum: calculateNextOrderNum(defaultSub, defaultGrade),
                    isPinned: false
                }; 
            }
            showAddModal.value = true;
        };

        const handleSave = () => {
            if (!newItem.value.title) return alert('请输入标题');
            newItem.value.orderNum = Number(newItem.value.orderNum) || 0;
            if (isEditing.value) emit('update-concept', editingId.value, newItem.value);
            else emit('add-concept', { type: props.mode, ...newItem.value });
            showAddModal.value = false;
        };

        const downloadTemplate = () => window.open('/api/concepts/template');
        const handleFileUpload = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/concepts/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) { alert(`✅ 成功导入 ${data.count} 条！`); emit('refresh'); } else alert('❌ ' + data.message);
            } catch (e) { alert('⚠️ 上传错误'); }
            event.target.value = '';
        };

        const formatClozePreview = (text) => text ? text.replace(/\{\{(.+?)\}\}/g, '<span class="border-b-2 border-amber-400 font-bold text-amber-600 px-1 bg-amber-50 rounded mx-0.5">$1</span>') : '';

        onMounted(() => {
            renderMath(); 
            if (props.initialAction === 'add') nextTick(() => openAddModal(null));
        });

        onUnmounted(() => stopSpeech());

        return {
            currentSubject, currentGrade, displayList, modeConfig, today,
            showAddModal, isEditing, newItem, showReciteModal, currentReciteItem, parsedClozeContent, isReviewMode,
            openAddModal, handleSave, filteredList, getSubjectColor, formatClozePreview, togglePin, handleSubjectGradeChange,
            startRecitation, exitRecitation, switchReciteItem, currentReciteList, getClozeClass, getListTitleClass,
            handleInputFocus, handleInputChange, focusNextInput, activeInputIndex,
            toggleSpeech, isListening, downloadTemplate, handleFileUpload, submitCheck, isGrading, resultModal,
            showEbbinghausModal, scheduleStats, getDayName, dailyReviewCount, startDailyReview, isDailyReviewMode, isDueForReview
        };
    }
}
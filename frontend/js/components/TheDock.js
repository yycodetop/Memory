/**
 * js/components/TheDock.js
 * 底部 Dock 栏 - 增加概念学习三大模式入口
 */
export default {
    props: ['currentApp'],
    emits: ['switchApp', 'addTask', 'openPomodoro'],
    template: `
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div class="glass px-4 py-3 rounded-2xl shadow-2xl shadow-indigo-900/20 flex items-center gap-3 ring-1 ring-white/60 bg-white/80 backdrop-blur-xl transition-all hover:scale-[1.01]">
            
            <button v-for="app in mainApps" :key="app.id" 
                @click="$emit('switchApp', app.id)" 
                class="dock-item relative group w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all duration-300"
                :class="currentApp === app.id ? app.activeClass : 'bg-slate-50 hover:bg-white text-slate-400 hover:text-indigo-500'">
                <i :class="app.icon"></i>
                <span class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-lg transform translate-y-2 group-hover:translate-y-0">{{ app.name }}</span>
            </button>

            <div class="w-px h-8 bg-slate-300 mx-1"></div>

            <button v-for="tool in conceptTools" :key="tool.id"
                @click="$emit('switchApp', tool.id)"
                class="dock-item relative group w-11 h-11 rounded-lg flex items-center justify-center text-lg transition-all duration-300 border border-transparent"
                :class="currentApp === tool.id ? tool.activeClass : 'bg-slate-50 hover:bg-white text-slate-400 ' + tool.hoverClass">
                <i :class="tool.icon"></i>
                <span class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-lg transform translate-y-2 group-hover:translate-y-0">{{ tool.name }}</span>
            </button>
            
            <div class="w-px h-8 bg-slate-300 mx-1"></div>
            
            <button @click="$emit('addTask')" class="dock-item w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-100 transition-transform active:scale-95" title="新建任务"><i class="fas fa-plus"></i></button>
            <button @click="$emit('openPomodoro')" class="dock-item w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-100 transition-transform active:scale-95" title="番茄专注"><i class="fas fa-stopwatch"></i></button>
        </div>
    </div>
    `,
    data() {
        return {
            mainApps: [
                { id: 'dashboard', name: '综合概览', icon: 'fas fa-calendar-alt', activeClass: 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-200 transform -translate-y-2' },
                { id: 'english', name: '英语工作室', icon: 'fas fa-language', activeClass: 'bg-blue-500 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-200 transform -translate-y-2' },
            ],
            conceptTools: [
                { id: 'cloze', name: '挖空填空', icon: 'fas fa-highlighter', hoverClass: 'hover:text-amber-500 hover:border-amber-200', activeClass: 'bg-amber-500 text-white shadow-lg shadow-amber-500/40 transform -translate-y-2' },
                // 把下面这行的 id 从 'image' 改为 'occlusion'
                { id: 'occlusion', name: '图片遮挡', icon: 'fas fa-image', hoverClass: 'hover:text-pink-500 hover:border-pink-200', activeClass: 'bg-pink-500 text-white shadow-lg shadow-pink-500/40 transform -translate-y-2' },
                { id: 'feynman', name: '费曼自测', icon: 'fas fa-chalkboard-teacher', hoverClass: 'hover:text-cyan-500 hover:border-cyan-200', activeClass: 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/40 transform -translate-y-2' },
                { id: 'mistakes', name: '错题日志', icon: 'fas fa-book-dead', activeClass: 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 ring-2 ring-rose-200 transform -translate-y-2' },
                // [新增] 学习日志入口
                { id: 'learninglog', name: '学习日志', icon: 'fas fa-seedling', activeClass: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-200 transform -translate-y-2' }
            ]
        }
    }
}
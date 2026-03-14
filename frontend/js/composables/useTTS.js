/**
 * js/composables/useTTS.js
 * 浏览器原生语音合成封装 (v2.0: 支持多语言混合队列播放)
 */
import { ref, onMounted } from 'vue';

export function useTTS() {
    const voices = ref([]);
    const isSpeaking = ref(false);
    
    // 语音偏好
    const englishVoice = ref(null);
    const chineseVoice = ref(null);
    const rate = ref(1); 

    const loadVoices = () => {
        const allVoices = window.speechSynthesis.getVoices();
        voices.value = allVoices;

        // 优先选择高质量声音
        // 1. 选英文 (优先 Google US, 其次 Microsoft David/Zira, 再次其他 en)
        englishVoice.value = allVoices.find(v => v.name.includes('Google US English')) 
                          || allVoices.find(v => v.lang === 'en-US') 
                          || allVoices.find(v => v.lang.startsWith('en'));
        
        // 2. 选中文 (优先 Google 普通话, 其次 Microsoft Huihui/Yaoyao, 再次其他 zh)
        chineseVoice.value = allVoices.find(v => v.name.includes('Google') && (v.lang === 'zh-CN' || v.lang === 'zh-TW'))
                          || allVoices.find(v => v.lang === 'zh-CN')
                          || allVoices.find(v => v.lang.startsWith('zh'));
    };

    onMounted(() => {
        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    });

    const stop = () => {
        window.speechSynthesis.cancel();
        isSpeaking.value = false;
    };

    /**
     * 播放单个文本
     */
    const speak = (text, lang = 'en') => {
        return new Promise((resolve, reject) => {
            if (!text) { resolve(); return; }
            
            const utterance = new SpeechSynthesisUtterance(text);
            
            // 自动选择对应语言的声音
            if (lang === 'zh' && chineseVoice.value) {
                utterance.voice = chineseVoice.value;
                utterance.rate = 1.0; // 中文通常不用太快
            } else if (englishVoice.value) {
                utterance.voice = englishVoice.value;
                utterance.rate = rate.value;
            }

            utterance.onstart = () => isSpeaking.value = true;
            
            utterance.onend = () => {
                // isSpeaking.value = false; // 不要在单个结束时设为false，由队列控制
                resolve();
            };
            
            utterance.onerror = (e) => {
                console.error("TTS Error:", e);
                isSpeaking.value = false;
                resolve(); // 即使出错也继续，防止卡死
            };

            window.speechSynthesis.speak(utterance);
        });
    };

    /**
     * 核心：按顺序播放队列
     * queue: Array of { text: string, lang: 'en'|'zh' }
     */
    const speakQueue = async (queue) => {
        stop(); // 先停止之前的
        isSpeaking.value = true;
        
        for (const item of queue) {
            // 如果在播放过程中 isSpeaking 被外部置为 false (例如用户打断)，则停止队列
            if (!isSpeaking.value) {
                window.speechSynthesis.cancel();
                break;
            }
            await speak(item.text, item.lang);
        }
        
        isSpeaking.value = false;
    };

    return {
        voices,
        englishVoice, // 暴露出来允许用户手动改
        rate,
        isSpeaking,
        speak,
        speakQueue,
        stop
    };
}
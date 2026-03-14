/**
 * js/composables/useConcepts.js
 * 概念知识管理核心 - 迭代版 v2
 * 接入后端 API 实现数据持久化
 */
import { ref } from 'vue';

export function useConcepts(API_BASE) {
    const grades = [
        '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
        '初一', '初二', '初三',
        '高一', '高二', '高三'
    ];

    // 初始化为空，等待从后端加载
    const concepts = ref([]);

    // [新增] 从后端加载数据
    const loadConcepts = async () => {
        try {
            const res = await fetch(`${API_BASE}/concepts`);
            if (res.ok) {
                concepts.value = await res.json();
            } else {
                console.error("Failed to load concepts:", res.statusText);
            }
        } catch (e) {
            console.error("Network error loading concepts:", e);
        }
    };

    // [更新] 新增概念 (POST)
    const addConcept = async (item) => {
        try {
            const res = await fetch(`${API_BASE}/concepts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                const savedItem = await res.json();
                concepts.value.unshift(savedItem); // 更新前端视图
                return savedItem;
            }
        } catch (e) {
            console.error("Failed to add concept:", e);
            alert("保存失败，请检查后端服务是否启动");
        }
    };

    // [更新] 更新概念 (PUT)
    const updateConcept = async (id, updatedData) => {
        try {
            const res = await fetch(`${API_BASE}/concepts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            
            if (res.ok) {
                const index = concepts.value.findIndex(c => c.id === id);
                if (index !== -1) {
                    // 合并更新前端数据
                    concepts.value[index] = { ...concepts.value[index], ...updatedData };
                }
            }
        } catch (e) {
            console.error("Failed to update concept:", e);
        }
    };

    // [更新] 删除概念 (DELETE)
    const deleteConcept = async (id) => {
        if(!confirm('确定要删除这条知识卡片吗？此操作不可恢复。')) return;

        try {
            const res = await fetch(`${API_BASE}/concepts/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                concepts.value = concepts.value.filter(c => c.id !== id);
            } else {
                alert("删除失败");
            }
        } catch (e) {
            console.error("Failed to delete concept:", e);
        }
    };

    // 辅助工具函数保持不变
    const getConceptsByType = (type) => concepts.value.filter(c => c.type === type);
    
    const validateClozeContent = (content) => {
        const regex = /\{\{(.+?)\}\}/;
        return regex.test(content);
    };

    // Excel 导入逻辑 (导入后逐条调用 addConcept 即可实现批量保存)
    const importConceptsFromExcel = async (file, type) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    // 动态导入 XLSX 库 (假设 index.html 已引入)
                    if (typeof XLSX === 'undefined') {
                        return reject("XLSX library not found");
                    }

                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    let successCount = 0;
                    let skipCount = 0;

                    // 从第二行开始遍历 (跳过表头)
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        const grade = row[0] && row[0].toString().trim();
                        const subject = row[1] && row[1].toString().trim();
                        const content = row[2] && row[2].toString().trim();

                        if (!grade || !subject || !content) {
                            skipCount++;
                            continue;
                        }

                        if (type === 'cloze' && !validateClozeContent(content)) {
                            skipCount++;
                            continue;
                        }

                        const title = content.replace(/\{\{|\}\}/g, '').substring(0, 15) + (content.length > 15 ? '...' : '');

                        // 调用 API 保存
                        await addConcept({ type, grade, subject, title, content });
                        successCount++;
                    }
                    resolve({ success: successCount, skipped: skipCount });
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const getSubjectColor = (sub) => {
        const colors = {
            '数学': 'bg-red-50 text-red-600 border-red-100',
            '物理': 'bg-blue-50 text-blue-600 border-blue-100',
            '化学': 'bg-purple-50 text-purple-600 border-purple-100',
            '生物': 'bg-emerald-50 text-emerald-600 border-emerald-100',
            '地理': 'bg-amber-50 text-amber-600 border-amber-100',
            '语文': 'bg-orange-50 text-orange-600 border-orange-100',
            '英语': 'bg-indigo-50 text-indigo-600 border-indigo-100'
        };
        return colors[sub] || 'bg-slate-50 text-slate-600 border-slate-100';
    };

    return {
        concepts, grades,
        loadConcepts, // 导出加载函数
        getConceptsByType, addConcept, updateConcept, deleteConcept,
        importConceptsFromExcel, validateClozeContent,
        getSubjectColor
    };
}
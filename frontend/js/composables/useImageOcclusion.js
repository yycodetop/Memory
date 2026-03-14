import { ref } from 'vue';

export function useImageOcclusion(apiBase) {
    const occlusionList = ref([]);

    const loadOcclusion = async () => {
        try {
            const res = await fetch(`${apiBase}/occlusion`);
            occlusionList.value = await res.json();
        } catch (e) {
            console.error(e);
        }
    };

    const addOcclusion = async (formData) => {
        // formData 包含 file, subject, grade, title, masks(string)
        try {
            const res = await fetch(`${apiBase}/occlusion`, {
                method: 'POST',
                body: formData // 不要设置 Content-Type，让浏览器自动设置 multipart/form-data
            });
            const newItem = await res.json();
            occlusionList.value.unshift(newItem);
            return newItem;
        } catch (e) {
            console.error(e);
        }
    };

    const updateOcclusion = async (id, data) => {
        try {
            await fetch(`${apiBase}/occlusion/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const idx = occlusionList.value.findIndex(c => c.id === id);
            if (idx !== -1) {
                occlusionList.value[idx] = { ...occlusionList.value[idx], ...data };
            }
        } catch (e) {
            console.error(e);
        }
    };

    const deleteOcclusion = async (id) => {
        if (!confirm('确定删除这张图片遮挡卡片吗？')) return;
        try {
            await fetch(`${apiBase}/occlusion/${id}`, { method: 'DELETE' });
            occlusionList.value = occlusionList.value.filter(c => c.id !== id);
        } catch (e) {
            console.error(e);
        }
    };

    return {
        occlusionList,
        loadOcclusion,
        addOcclusion,
        updateOcclusion,
        deleteOcclusion
    };
}
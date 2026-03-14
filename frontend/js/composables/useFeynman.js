import { ref } from 'vue';

export function useFeynman(apiBase) {
    const feynmanList = ref([]);

    const loadFeynman = async () => {
        try {
            const res = await fetch(`${apiBase}/feynman`);
            feynmanList.value = await res.json();
        } catch (e) {
            console.error('Failed to load feynman data:', e);
        }
    };

    const addFeynman = async (item) => {
        try {
            const res = await fetch(`${apiBase}/feynman`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            const newItem = await res.json();
            feynmanList.value.unshift(newItem);
            return newItem;
        } catch (e) {
            console.error(e);
        }
    };

    const updateFeynman = async (id, data) => {
        try {
            await fetch(`${apiBase}/feynman/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const idx = feynmanList.value.findIndex(c => c.id === id);
            if (idx !== -1) {
                feynmanList.value[idx] = { ...feynmanList.value[idx], ...data };
            }
        } catch (e) {
            console.error(e);
        }
    };

    const deleteFeynman = async (id) => {
        if (!confirm('确定要删除这个费曼自测卡片吗？')) return;
        try {
            await fetch(`${apiBase}/feynman/${id}`, { method: 'DELETE' });
            feynmanList.value = feynmanList.value.filter(c => c.id !== id);
        } catch (e) {
            console.error(e);
        }
    };

    return {
        feynmanList,
        loadFeynman,
        addFeynman,
        updateFeynman,
        deleteFeynman
    };
}
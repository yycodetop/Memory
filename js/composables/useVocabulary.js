/**
 * js/composables/useVocabulary.js
 */
import { ref } from 'vue';

export function useVocabulary(API_BASE) {
    const books = ref([]);
    const currentBook = ref(null);
    const vocabulary = ref([]); 
    const showVocabModal = ref(false); 
    const newWord = ref({ word: '', pos: 'n.', meaning: '' });

    const posOptions = [
        { label: 'n. 名词', value: 'n.', color: 'bg-blue-100 text-blue-700 border-blue-200' },
        { label: 'v. 动词', value: 'v.', color: 'bg-red-100 text-red-700 border-red-200' },
        { label: 'adj. 形容词', value: 'adj.', color: 'bg-purple-100 text-purple-700 border-purple-200' },
        { label: 'adv. 副词', value: 'adv.', color: 'bg-pink-100 text-pink-700 border-pink-200' },
        { label: 'prep. 介词', value: 'prep.', color: 'bg-orange-100 text-orange-700 border-orange-200' },
        { label: 'phrase 短语', value: 'phrase', color: 'bg-slate-100 text-slate-700 border-slate-200' },
        { label: 'other 其他', value: 'other', color: 'bg-gray-100 text-gray-500 border-gray-200' }
    ];

    const bookIcons = [
        { icon: 'fas fa-book', label: '通用' },
        { icon: 'fas fa-graduation-cap', label: '考试' },
        { icon: 'fas fa-briefcase', label: '商务' },
        { icon: 'fas fa-plane', label: '旅游' },
        { icon: 'fas fa-code', label: '编程' },
        { icon: 'fas fa-gamepad', label: '娱乐' },
        { icon: 'fas fa-quote-right', label: '短语' },
        { icon: 'fas fa-star', label: '收藏' }
    ];

    // --- API Calls ---
    const apiCall = async (url, method, body) => {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(method + ' failed');
        return res.json();
    };

    const addWordAPI = (item) => apiCall(`${API_BASE}/vocabulary/item`, 'POST', item);
    const updateWordAPI = (item) => apiCall(`${API_BASE}/vocabulary/item/${item.id}`, 'PUT', item);
    const deleteWordAPI = (id) => apiCall(`${API_BASE}/vocabulary/item/${id}`, 'DELETE');

    // --- Logic ---

    const loadVocab = async (bookId) => {
        if (!bookId) return;
        try {
            const res = await fetch(`${API_BASE}/vocabulary?bookId=${bookId}`);
            const data = await res.json();
            vocabulary.value = Array.isArray(data) ? data : [];
        } catch (e) { vocabulary.value = []; }
    };

    // [新增] 聚合获取多个书本的单词
    const fetchAggregateVocab = async (bookIds) => {
        if (!bookIds || bookIds.length === 0) return [];
        try {
            const res = await fetch(`${API_BASE}/vocabulary?bookIds=${bookIds.join(',')}`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Failed to fetch aggregate vocab", e);
            return [];
        }
    };

    const loadBooks = async () => {
        try {
            const res = await fetch(`${API_BASE}/vocabulary/books`);
            const data = await res.json();
            books.value = Array.isArray(data) ? data : [];
            if (!currentBook.value && books.value.length > 0) {
                await selectBook(books.value[0]);
            }
        } catch (e) { books.value = []; }
    };

    const selectBook = async (book) => {
        if (!book) return;
        currentBook.value = book;
        newWord.value.pos = book.type === 'word' ? 'n.' : 'phrase';
        await loadVocab(book.id);
    };

    const createBook = async (bookData) => {
        try {
            const data = await apiCall(`${API_BASE}/vocabulary/books`, 'POST', bookData);
            if (data.success) {
                await loadBooks();
                await selectBook(data.book);
                return true;
            }
        } catch (e) { alert("创建失败"); }
        return false;
    };

    const updateBook = async (bookId, newData) => {
        try {
            const data = await apiCall(`${API_BASE}/vocabulary/books/${bookId}`, 'PUT', newData);
            if (data.success) {
                await loadBooks();
                if (currentBook.value && currentBook.value.id === bookId) {
                    currentBook.value = { ...currentBook.value, ...data.book };
                }
                return true;
            }
        } catch(e) { alert("更新失败"); }
        return false;
    };

    const deleteBook = async (bookId) => {
        if (!confirm("确定删除该单词本及所有内容？")) return;
        try {
            await apiCall(`${API_BASE}/vocabulary/books/${bookId}`, 'DELETE');
            if (currentBook.value && currentBook.value.id === bookId) {
                currentBook.value = null;
                vocabulary.value = [];
            }
            await loadBooks();
        } catch (e) {}
    };

    const exportBook = (bookId) => {
        if (!bookId) return;
        window.location.href = `${API_BASE}/vocabulary/export?bookId=${bookId}`;
    };

    const addManualWord = async (customData = null) => {
        const dataInput = customData || newWord.value;
        if (!dataInput.word || !dataInput.meaning) return;
        if (!currentBook.value) return alert("请先选择单词本");

        const wordData = {
            id: Date.now(),
            word: dataInput.word,
            pos: currentBook.value.type === 'phrase' ? 'phrase' : (dataInput.pos || 'other'),
            meaning: dataInput.meaning,
            type: currentBook.value.type,
            bookId: currentBook.value.id,
            addedAt: new Date().toISOString().split('T')[0]
        };

        vocabulary.value.unshift(wordData);
        newWord.value.word = '';
        newWord.value.meaning = '';
        
        try { await addWordAPI(wordData); } 
        catch (e) { vocabulary.value.shift(); alert("保存失败"); }
    };

    const updateWord = async (updatedItem) => {
        const index = vocabulary.value.findIndex(v => v.id === updatedItem.id);
        if (index !== -1) {
            const original = vocabulary.value[index];
            vocabulary.value[index] = { ...original, ...updatedItem };
            try { await updateWordAPI(updatedItem); } 
            catch (e) { vocabulary.value[index] = original; alert("更新失败"); }
        }
    };

    const deleteWord = async (id) => {
        if (!confirm("确定删除？")) return;
        const originalList = [...vocabulary.value];
        vocabulary.value = vocabulary.value.filter(v => v.id !== id);
        try { await deleteWordAPI(id); } 
        catch (e) { vocabulary.value = originalList; alert("删除失败"); }
    };

    const handleVocabUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentBook.value) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bookId', currentBook.value.id);

        try {
            const res = await fetch(`${API_BASE}/vocabulary/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if(data.success) {
                alert(`成功导入 ${data.count} 条数据`);
                await loadVocab(currentBook.value.id);
                e.target.value = ''; 
            } else { alert('导入失败: ' + (data.error || '未知')); }
        } catch(err) { alert("上传失败"); }
    };

    const downloadTemplate = () => { 
        if (!currentBook.value) return;
        window.location.href = `${API_BASE}/vocabulary/template?type=${currentBook.value.type}`; 
    };

    const getPosColor = (posValue) => {
        const match = posOptions.find(p => p.value === posValue);
        return match ? match.color : 'bg-slate-100 text-slate-500 border-slate-200';
    };

    return {
        books, currentBook, vocabulary, 
        showVocabModal, newWord, posOptions, bookIcons,
        loadBooks, selectBook, createBook, updateBook, deleteBook, exportBook,
        loadVocab, fetchAggregateVocab, // 暴露新方法
        addManualWord, updateWord, deleteWord, 
        handleVocabUpload, downloadTemplate, getPosColor,
        openVocabModal: () => showVocabModal.value = true
    };
}
/**
 * routes/vocabulary.js
 * 单词/短语及错题管理 (v18.0: 支持年级、学期、类型分类与排序)
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const VOCAB_FILE = path.join(__dirname, '../vocabulary.json');
const BOOKS_FILE = path.join(__dirname, '../books.json');
const MISTAKES_FILE = path.join(__dirname, '../mistakes.json');
const upload = multer({ storage: multer.memoryStorage() });

// 辅助读取函数
const readJson = (file) => { 
    try { 
        const content = fs.readFileSync(file, 'utf8');
        return content ? JSON.parse(content) : []; 
    } catch { return []; } 
};
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

// --- 初始化逻辑 ---
const initFiles = () => {
    const defaultBooks = [
        { id: 'default_word_book', name: '核心单词库', type: 'word', icon: 'fas fa-book', isSystem: true, grade: '其他', term: '全学年', sortOrder: 99 },
        { id: 'default_phrase_book', name: '高频短语库', type: 'phrase', icon: 'fas fa-quote-right', isSystem: true, grade: '其他', term: '全学年', sortOrder: 100 }
    ];
    let books = [];
    if (fs.existsSync(BOOKS_FILE)) books = readJson(BOOKS_FILE);
    if (!fs.existsSync(BOOKS_FILE) || !Array.isArray(books) || books.length === 0) {
        writeJson(BOOKS_FILE, defaultBooks);
    }
    if (!fs.existsSync(VOCAB_FILE)) writeJson(VOCAB_FILE, []);
    if (!fs.existsSync(MISTAKES_FILE)) writeJson(MISTAKES_FILE, []); 
};
initFiles();

// --- 错题本 (Mistakes) 接口 ---
router.get('/mistakes', (req, res) => {
    const mistakes = readJson(MISTAKES_FILE);
    mistakes.sort((a, b) => {
        if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
        return b.count - a.count;
    });
    res.json(mistakes);
});

router.post('/mistakes', (req, res) => {
    const { word, meaning, bookId } = req.body;
    if (!word) return res.status(400).json({ error: 'Missing word' });

    const mistakes = readJson(MISTAKES_FILE);
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = mistakes.findIndex(m => m.date === today && m.word === word);

    if (existingIndex !== -1) {
        mistakes[existingIndex].count += 1;
        mistakes[existingIndex].lastTime = new Date().toISOString();
    } else {
        mistakes.push({
            id: Date.now().toString(),
            date: today, word, meaning, bookId, count: 1, lastTime: new Date().toISOString()
        });
    }
    writeJson(MISTAKES_FILE, mistakes);
    res.json({ success: true });
});

// --- 书籍 (Books) 接口 ---
router.get('/books', (req, res) => res.json(readJson(BOOKS_FILE)));

router.post('/books', (req, res) => {
    const books = readJson(BOOKS_FILE);
    const newBook = { ...req.body, id: Date.now().toString() };
    books.push(newBook);
    writeJson(BOOKS_FILE, books);
    res.json({ success: true, book: newBook });
});

router.put('/books/:id', (req, res) => {
    const bookId = req.params.id;
    // [修改] 提取并更新新的字段
    const { name, icon, type, grade, term, sortOrder } = req.body;
    let books = readJson(BOOKS_FILE);
    const index = books.findIndex(b => b.id === bookId);
    if (index !== -1) {
        books[index] = { ...books[index], name, icon, type, grade, term, sortOrder };
        writeJson(BOOKS_FILE, books);
        res.json({ success: true, book: books[index] });
    } else {
        res.status(404).json({ error: 'Book not found' });
    }
});

router.delete('/books/:id', (req, res) => {
    const bookId = req.params.id;
    let books = readJson(BOOKS_FILE);
    books = books.filter(b => b.id !== bookId);
    writeJson(BOOKS_FILE, books);
    let vocab = readJson(VOCAB_FILE);
    vocab = vocab.filter(v => v.bookId !== bookId);
    writeJson(VOCAB_FILE, vocab);
    res.json({ success: true });
});

// --- 单词查询 (支持多书本) ---
router.get('/', (req, res) => {
    const bookId = req.query.bookId;
    const bookIds = req.query.bookIds; 
    let vocab = readJson(VOCAB_FILE);
    if (bookIds) {
        const ids = bookIds.split(',');
        vocab = vocab.filter(v => ids.includes(v.bookId));
    } else if (bookId) {
        vocab = vocab.filter(v => v.bookId === bookId);
    }
    res.json(vocab);
});

// --- 增量操作接口 ---
router.post('/item', (req, res) => {
    const newItem = req.body;
    const vocab = readJson(VOCAB_FILE);
    vocab.unshift(newItem);
    writeJson(VOCAB_FILE, vocab);
    res.json({ success: true });
});

router.put('/item/:id', (req, res) => {
    const id = String(req.params.id);
    const updatedItem = req.body;
    let vocab = readJson(VOCAB_FILE);
    const index = vocab.findIndex(v => String(v.id) === id);
    if (index !== -1) {
        vocab[index] = { ...vocab[index], ...updatedItem };
        writeJson(VOCAB_FILE, vocab);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Item not found' });
    }
});

router.delete('/item/:id', (req, res) => {
    const id = String(req.params.id);
    let vocab = readJson(VOCAB_FILE);
    const initialLen = vocab.length;
    vocab = vocab.filter(v => String(v.id) !== id);
    if (vocab.length !== initialLen) {
        writeJson(VOCAB_FILE, vocab);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Item not found' });
    }
});

// --- 文件操作 ---
router.get('/template', (req, res) => {
    const type = req.query.type || 'word';
    const wb = XLSX.utils.book_new();
    let ws_data = [];
    let filename = '';
    if (type === 'phrase') {
        ws_data = [["phrase", "meaning"], ["look forward to", "期待"], ["give up", "放弃"]];
        ws_data.unshift(["短语(必填)", "释义(必填)"]); 
        filename = "template_phrase.xlsx";
    } else {
        ws_data = [["word", "pos", "meaning"], ["apple", "n.", "苹果"], ["run", "v.", "跑"]];
        ws_data.unshift(["单词(必填)", "词性(选填)", "释义(必填)"]);
        filename = "template_word.xlsx";
    }
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });
        const targetBookId = req.body.bookId;
        if (!targetBookId) return res.status(400).json({ error: 'Missing bookId' });
        const books = readJson(BOOKS_FILE);
        const targetBook = books.find(b => b.id === targetBookId);
        const bookType = targetBook ? targetBook.type : 'word';
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        const newItems = rawData.map(row => {
            const wordVal = row['word'] || row['Word'] || row['单词'] || row['单词(必填)'] || row['phrase'] || row['Phrase'] || row['短语'] || row['短语(必填)'];
            const meaningVal = row['meaning'] || row['Meaning'] || row['释义'] || row['释义(必填)'];
            let posVal = row['pos'] || row['Pos'] || row['词性'] || row['词性(选填)'];
            if (!wordVal || !meaningVal) return null;
            if (bookType === 'phrase') posVal = 'phrase';
            else if (!posVal) posVal = 'n.'; 
            return {
                id: Date.now() + Math.random(),
                word: String(wordVal).trim(), pos: String(posVal).trim(), meaning: String(meaningVal).trim(),
                type: bookType, bookId: targetBookId, addedAt: new Date().toISOString().split('T')[0]
            };
        }).filter(item => item !== null);
        const currentData = readJson(VOCAB_FILE);
        writeJson(VOCAB_FILE, [...newItems, ...currentData]);
        res.json({ success: true, count: newItems.length });
    } catch (e) {
        res.status(500).json({ error: 'Excel Parsing Error' });
    }
});

router.get('/export', (req, res) => {
    try {
        const bookId = req.query.bookId;
        if (!bookId) return res.status(400).send("Missing bookId");
        const books = readJson(BOOKS_FILE);
        const targetBook = books.find(b => b.id === bookId);
        const bookName = targetBook ? targetBook.name : 'export';
        const allVocab = readJson(VOCAB_FILE);
        const bookVocab = allVocab.filter(v => v.bookId === bookId);
        const exportData = bookVocab.map(v => ({ "word": v.word, "pos": v.pos, "meaning": v.meaning, "type": v.type }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(bookName)}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (e) { res.status(500).send("Export failed"); }
});

module.exports = router;
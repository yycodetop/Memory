/**
 * routes/concepts.js
 * 处理概念知识库的增删改查及 Excel 导入导出
 * 迭代 v2.1: 增加对 orderNum 排序编号的自动分配与支持
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });
const DATA_FILE = path.join(__dirname, '../concepts.json');

const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        console.error('Error reading concepts.json:', e);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing concepts.json:', e);
    }
};

router.get('/', (req, res) => {
    const data = readData();
    res.json(data);
});

router.get('/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const ws_data = [
            ["学科", "年级", "标题", "内容"],
            ["数学", "初一", "有理数", "有理数是{{整数}}和{{分数}}的统称。"],
            ["物理", "八年级", "声音的产生", "声音是由物体{{振动}}产生的。"],
            ["生物", "七年级", "细胞核", "细胞核是{{遗传信息库}}，是细胞代谢和遗传的控制中心。"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 50 }];
        
        XLSX.utils.book_append_sheet(wb, ws, "导入模板");
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="concepts_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (e) {
        console.error("Template generation error:", e);
        res.status(500).send("Error generating template");
    }
});

router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (!rawData || rawData.length === 0) {
            return res.json({ success: false, message: 'Excel is empty' });
        }

        const currentData = readData();
        const maxOrderMap = {};
        
        // 预先计算已有数据中每个 学科+年级 的最大编号
        currentData.forEach(item => {
            const key = `${item.subject}-${item.grade}`;
            const order = Number(item.orderNum) || 0;
            if (!maxOrderMap[key] || order > maxOrderMap[key]) {
                maxOrderMap[key] = order;
            }
        });

        const newItems = [];
        const timestamp = Date.now();

        rawData.forEach((row, index) => {
            const subject = String(row['学科'] || row['subject'] || '通用').trim();
            const grade = String(row['年级'] || row['grade'] || '通用').trim();
            const title = row['标题'] || row['title'];
            const content = row['内容'] || row['content'];

            if (title && content) {
                const key = `${subject}-${grade}`;
                maxOrderMap[key] = (maxOrderMap[key] || 0) + 1; // 分配递增编号

                newItems.push({
                    id: timestamp + index + Math.random(),
                    type: 'cloze',
                    subject: subject,
                    grade: grade,
                    orderNum: maxOrderMap[key],
                    title: String(title).trim(),
                    content: String(content).trim(),
                    isPinned: false, // 默认不置顶
                    lastReview: null
                });
            }
        });

        if (newItems.length > 0) {
            const updatedData = [...newItems, ...currentData];
            writeData(updatedData);
            res.json({ success: true, count: newItems.length });
        } else {
            res.json({ success: false, message: 'No valid data found (Check headers: 学科, 年级, 标题, 内容)' });
        }

    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Import failed: ' + e.message });
    }
});

router.post('/', (req, res) => {
    const list = readData();
    const newItem = { 
        id: Date.now(), 
        ...req.body,
        lastReview: null 
    };
    list.unshift(newItem);
    writeData(list);
    res.json(newItem);
});

router.put('/:id', (req, res) => {
    const list = readData();
    const id = parseFloat(req.params.id);
    const index = list.findIndex(item => item.id === id);
    
    if (index !== -1) {
        list[index] = { ...list[index], ...req.body };
        writeData(list);
        res.json(list[index]);
    } else {
        res.status(404).json({ error: 'Concept not found' });
    }
});

router.delete('/:id', (req, res) => {
    const list = readData();
    const id = parseFloat(req.params.id);
    const newList = list.filter(item => item.id !== id);
    
    if (list.length !== newList.length) {
        writeData(newList);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Concept not found' });
    }
});

module.exports = router;
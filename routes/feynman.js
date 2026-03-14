/**
 * routes/feynman.js
 * 费曼自测路由 - v2.1
 * 新增：支持写入顺序编号 (orderNum) 与 Excel 导入时的智能递增分配
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });
const DATA_FILE = path.join(__dirname, '../feynman.json');

const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        console.error('Error reading feynman.json:', e);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing feynman.json:', e);
    }
};

router.get('/', (req, res) => {
    res.json(readData());
});

router.get('/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const ws_data = [
            ["学科", "年级", "核心概念", "关键词提示", "标准定义"],
            ["物理", "八年级", "牛顿第一定律", "惯性, 保持静止, 匀速直线运动", "一切物体在没有受到力的作用时，总保持静止状态或匀速直线运动状态。"],
            ["生物", "七年级", "光合作用", "叶绿体, 光能, 有机物, 氧气", "绿色植物通过叶绿体，利用光能，把二氧化碳和水转化成储存能量的有机物，并且释放出氧气的过程。"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 50 }];
        
        XLSX.utils.book_append_sheet(wb, ws, "费曼导入模板");
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="feynman_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (e) {
        console.error("Template error:", e);
        res.status(500).send("Error generating template");
    }
});

router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (!rawData.length) return res.json({ success: false, message: 'Empty file' });

        const current = readData();
        const maxOrderMap = {};
        
        // 预先计算已有数据中每个 学科+年级 的最大编号
        current.forEach(item => {
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
            const title = row['核心概念'] || row['title'] || row['Question'];
            const hints = row['关键词提示'] || row['hints'] || row['Tips'];
            const content = row['标准定义'] || row['content'] || row['Answer'];

            if (title && content) {
                const key = `${subject}-${grade}`;
                maxOrderMap[key] = (maxOrderMap[key] || 0) + 1; // 递增分配

                newItems.push({
                    id: timestamp + index + Math.random(),
                    type: 'feynman',
                    subject: subject,
                    grade: grade,
                    orderNum: maxOrderMap[key], // 填入计算好的编号
                    title: String(title).trim(),
                    hints: String(hints || '').trim(),
                    content: String(content).trim(),
                    isPinned: false,
                    proficiency: 0,
                    reviewCount: 0,
                    reviewSchedule: [], 
                    lastReview: null
                });
            }
        });

        if (newItems.length > 0) {
            const updated = [...newItems, ...current];
            writeData(updated);
            res.json({ success: true, count: newItems.length });
        } else {
            res.json({ success: false, message: 'No valid data (Require: 核心概念, 标准定义)' });
        }
    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: e.message });
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
    }
});

module.exports = router;
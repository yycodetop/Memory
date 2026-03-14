const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../learningLogs.json');

// 初始化文件
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
}

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

// 获取所有日志
router.get('/', (req, res) => res.json(readData()));

// 新增日志
router.post('/', (req, res) => {
    try {
        const logs = readData();
        const newLog = { id: Date.now().toString(), ...req.body };
        logs.push(newLog);
        writeData(logs);
        res.json(newLog);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 更新(编辑)日志
router.put('/:id', (req, res) => {
    try {
        const logs = readData();
        const index = logs.findIndex(l => l.id === req.params.id);
        if (index !== -1) {
            logs[index] = { ...logs[index], ...req.body };
            writeData(logs);
            res.json(logs[index]);
        } else { res.status(404).json({ error: '未找到该日志' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除日志
router.delete('/:id', (req, res) => {
    try {
        let logs = readData();
        const initialLength = logs.length;
        logs = logs.filter(l => l.id !== req.params.id);
        if (logs.length < initialLength) {
            writeData(logs);
            res.json({ success: true });
        } else { res.status(404).json({ error: '未找到该日志' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
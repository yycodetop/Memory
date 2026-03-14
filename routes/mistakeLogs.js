const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '../mistakeLogs.json');

// 辅助函数：读写JSON
const readData = () => {
    if (!fs.existsSync(dataFile)) return [];
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
};
const writeData = (data) => fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

// 获取所有错题
router.get('/', (req, res) => {
    res.json(readData());
});

// 新增错题
router.post('/', (req, res) => {
    const logs = readData();
    const newLog = {
        id: Date.now().toString(),
        ...req.body,
        reviewLogs: []
    };
    logs.push(newLog);
    writeData(logs);
    res.json(newLog);
});

// 添加复习反思日志
router.post('/:id/review', (req, res) => {
    const logs = readData();
    const index = logs.findIndex(l => l.id === req.params.id);
    if (index !== -1) {
        logs[index].reviewLogs.push({
            reviewDate: new Date().toISOString().split('T')[0],
            reflection: req.body.reflection,
            status: req.body.status // 比如 SSS, SS, S
        });
        writeData(logs);
        res.json(logs[index]);
    } else {
        res.status(404).json({ error: '错题未找到' });
    }
});
// ====== 请将以下代码追加到 routes/mistakeLogs.js 的最后面，但在 module.exports = router; 之前 ======

// 更新（编辑）错题内容
router.put('/:id', (req, res) => {
    const logs = readData();
    const index = logs.findIndex(l => l.id === req.params.id);
    
    if (index !== -1) {
        // 核心：只更新用户提交的内容字段，严格保留原来的 date, ebbinghausSchedule 和 reviewLogs
        const updatedData = {
            ...logs[index],
            recorder: req.body.recorder,
            title: req.body.title,
            subject: req.body.subject,
            description: req.body.description,
            images: req.body.images
        };
        
        logs[index] = updatedData;
        writeData(logs);
        res.json(updatedData);
    } else {
        res.status(404).json({ error: '错题未找到' });
    }
});

// 删除错题
router.delete('/:id', (req, res) => {
    let logs = readData();
    const initialLength = logs.length;
    logs = logs.filter(l => l.id !== req.params.id);
    
    if (logs.length < initialLength) {
        writeData(logs);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: '错题未找到' });
    }
});
module.exports = router;
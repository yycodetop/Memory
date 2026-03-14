const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data.json');

// 初始化
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ tasks: [], categories: ['英语', '数学', '编程'] }, null, 2));
}

const readJson = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeJson = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

router.get('/', (req, res) => res.json(readJson()));
router.post('/', (req, res) => {
    try {
        writeJson(req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
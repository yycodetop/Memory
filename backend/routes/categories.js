const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const CATEGORIES_FILE = path.join(__dirname, '../categories.json');
const OLD_DATA_FILE = path.join(__dirname, '../data.json');

// 初始化：如果独立的分类文件不存在，则创建它，并尝试从旧的 data.json 迁移历史数据
if (!fs.existsSync(CATEGORIES_FILE)) {
    let initialCategories = ["英语", "数学", "编程", "语文", "科学", "社政"];
    if (fs.existsSync(OLD_DATA_FILE)) {
        try {
            const oldData = JSON.parse(fs.readFileSync(OLD_DATA_FILE, 'utf8'));
            if (oldData.categories && Array.isArray(oldData.categories)) {
                initialCategories = oldData.categories;
            }
        } catch(e) {}
    }
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(initialCategories, null, 2), 'utf8');
}

// 获取分类
router.get('/', (req, res) => res.json(JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'))));

// 更新保存分类
router.post('/', (req, res) => {
    try {
        fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
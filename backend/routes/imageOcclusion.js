/**
 * routes/imageOcclusion.js
 * 图像遮挡路由 - v2.2
 * 1. 修复：新增时正确保存前端传递的 orderNum 排序字段
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '../uploads/occlusion');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.png'; 
        cb(null, 'occlusion-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } 
});

const DATA_FILE = path.join(__dirname, '../image_occlusion.json');

const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
    } catch (e) {
        return [];
    }
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

// GET: 获取列表
router.get('/', (req, res) => {
    res.json(readData());
});

// POST: 新增卡片
router.post('/', upload.single('imageFile'), (req, res) => {
    try {
        const list = readData();
        let imageUrl = '';

        if (req.file) {
            imageUrl = `/uploads/occlusion/${req.file.filename}`;
        } else if (req.body.imageUrl) {
            imageUrl = req.body.imageUrl;
        }

        const newItem = {
            id: Date.now(),
            subject: req.body.subject,
            grade: req.body.grade,
            orderNum: Number(req.body.orderNum) || 0, // 新增：保存排序编号
            title: req.body.title,
            imageUrl: imageUrl,
            masks: JSON.parse(req.body.masks || '[]'),
            proficiency: 0,
            reviewCount: 0,
            lastReview: null,
            pinned: false,
            inCurve: false
        };

        list.unshift(newItem);
        writeData(list);
        res.json(newItem);
    } catch (e) {
        console.error("Image Upload Error:", e);
        res.status(500).json({ error: 'Failed to save image card' });
    }
});

// PUT: 更新卡片
router.put('/:id', (req, res) => {
    const list = readData();
    const id = parseFloat(req.params.id);
    const index = list.findIndex(item => item.id === id);
    
    if (index !== -1) {
        const updatedItem = { ...list[index], ...req.body };
        // 确保如果是字符串形式传过来的掩码数据，正确解析回数组
        if (typeof req.body.masks === 'string') {
            updatedItem.masks = JSON.parse(req.body.masks);
        }
        // 确保编号为数字
        if (req.body.orderNum !== undefined) {
            updatedItem.orderNum = Number(req.body.orderNum) || 0;
        }

        list[index] = updatedItem;
        writeData(list);
        res.json(list[index]);
    } else {
        res.status(404).json({ error: 'Item not found' });
    }
});

// DELETE: 删除卡片及其文件
router.delete('/:id', (req, res) => {
    const list = readData();
    const id = parseFloat(req.params.id);
    const item = list.find(i => i.id === id);

    if (item) {
        if (item.imageUrl && item.imageUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, '..', item.imageUrl);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error("Failed to delete local file:", err);
                }
            }
        }
        
        const newList = list.filter(i => i.id !== id);
        writeData(newList);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Item not found' });
    }
});

module.exports = router;
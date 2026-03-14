/**
 * server.js
 * 更新：注册 concepts 路由
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // 支持大文件上传（如图片Base64）
app.use(express.static(__dirname));

// --- 注册路由 ---
app.use('/api/data', require('./routes/tasks'));
app.use('/api/vocabulary', require('./routes/vocabulary'));
// [新增] 注册概念知识库路由
app.use('/api/concepts', require('./routes/concepts')); 
app.use('/api/feynman', require('./routes/feynman')); // [新增] 费曼路由
app.use('/api/occlusion', require('./routes/imageOcclusion')); // [新增] 图像遮挡路由
// [新增] 注册错题日志路由
app.use('/api/mistakelog', require('./routes/mistakeLogs'));
// [新增] 注册独立的分类路由
app.use('/api/categories', require('./routes/categories'));
// [新增] 注册学习日志路由
app.use('/api/learninglog', require('./routes/learningLogs'));
// [新增] 注册 AI 辅助路由
app.use('/api/ai', require('./routes/ai'));

app.listen(PORT, () => {
    console.log(`Memory OS running at http://localhost:${PORT}`);
    console.log(`- Concepts API available at http://localhost:${PORT}/api/concepts`);
});
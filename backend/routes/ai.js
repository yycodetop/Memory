process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

// --- 1. 初始化本地缓存文件 ---
const CACHE_FILE = path.join(__dirname, '../ai_cache.json');
if (!fs.existsSync(CACHE_FILE)) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2), 'utf8');
}
const readCache = () => JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const writeCache = (data) => fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');

// 请确保换成您的 API Key
const AI_API_KEY = 'sk-f6616d15718b46f8921bf2bc5ddf92eb'; 
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    // baseURL:'https://api.deepseek.com/v3.2_speciale_expires_on_20251215',
    apiKey: AI_API_KEY
});

router.post('/memory-decoder', async (req, res) => {
    const { word } = req.body;

    if (!word) {
        return res.status(400).json({ error: '请提供需要解码的单词' });
    }

    // --- 2. 检查缓存：如果查过该词，直接返回缓存结果 ---
    const cache = readCache();
    if (cache[word]) {
        console.log(`[Cache Hit] 从本地缓存读取单词: ${word}`);
        return res.json({ success: true, cached: true, content: cache[word] });
    }

    const prompt = `你是一个非常幽默、擅长启发中小学生的英语魔法老师。
学生现在遇到了一个难记的单词：【${word}】。
请你帮她"解码"这个单词，打破死记硬背。

请直接返回一段美观的 HTML 格式的代码（不需要 markdown 标记，直接返回带标签的内容即可），包含以下三个部分：
1. 🧩 <b>词根词缀拆解</b>：如果有词根词缀，请拆解说明；如果没有，请说明它的起源。
2. 💡 <b>趣味记忆法</b>：用好玩的谐音梗、联想、或者生动的故事来记住它。越夸张、越好玩越好！
3. 🎯 <b>常见黄金搭配</b>：给出 1-2 个最地道、最常用的短语搭配，并附带简短的中文解释。

注意：语言要生动活泼，多用 Emoji，排版清晰，适合孩子阅读。不要输出多余的解释，直接输出 HTML 内容。`;

    try {
        console.log(`[API Request] 向大模型请求单词: ${word}`);
        
        // --- 3. 开启流式输出请求 (stream: true) ---
        const stream = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat", 
            temperature: 0.7,
            stream: true 
        });

        // 设置响应头，保持连接并推送数据流 (SSE)
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let fullContent = '';

        // 监听并实时转发 AI 返回的数据块
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
                fullContent += text;
                // 按 SSE 格式推送给前端
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
        }

        // --- 4. 传输完成，将完整内容存入本地 JSON 缓存 ---
        cache[word] = fullContent;
        writeCache(cache);

        // 发送结束标志
        res.write(`data: [DONE]\n\n`);
        res.end();

    } catch (error) {
        console.error("AI 解码失败:", error);
        // 如果 HTTP 头还没有发送，返回 JSON 错误；如果已经开始流式发送，则在流中报错
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: '魔法老师暂时走开了，具体原因: ' + error.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: '生成过程发生异常' })}\n\n`);
            res.end();
        }
    }
});
// --- 获取已存在本地缓存中的所有被解码过的单词列表 ---
router.get('/decoded-words', (req, res) => {
    try {
        const cache = readCache();
        res.json(Object.keys(cache));
    } catch (error) {
        res.json([]);
    }
});
module.exports = router;
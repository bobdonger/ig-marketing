const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env file if exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const { scrapeByKeyword, scrapeExplore, scrapeTwitterByKeyword, scrapeTwitterTrending, scrapeFacebookByKeyword, scrapeFacebookFeed } = require('./lib/scraper');
const { batchComment, getTask, getAllTasks } = require('./lib/commenter');

const anthropic = new Anthropic();

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// In-memory posts store
let posts = [];
let postIdCounter = 0;

// Load saved posts on startup
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
if (fs.existsSync(POSTS_FILE)) {
  try {
    posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
    postIdCounter = posts.length;
  } catch { /* ignore */ }
}

function savePosts() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Comment history store
let commentHistory = [];
const HISTORY_FILE = path.join(DATA_DIR, 'comment-history.json');
if (fs.existsSync(HISTORY_FILE)) {
  try {
    commentHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch { /* ignore */ }
}

function saveHistory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(commentHistory, null, 2));
}

// Multi-keyword splitter
function splitKeywords(keyword) {
  return keyword.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
}

// Dedup posts by caption + username
function dedup(postList) {
  const seen = new Set();
  return postList.filter(p => {
    const key = `${p.username}|${(p.caption || '').substring(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Exclude filter helper
function applyExcludeFilter(postList, exclude) {
  if (!exclude) return postList;
  const excludeList = exclude.split(/[,，、;；]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (excludeList.length === 0) return postList;
  const before = postList.length;
  const filtered = postList.filter(p => {
    const text = `${p.username} ${p.caption}`.toLowerCase();
    return !excludeList.some(kw => text.includes(kw));
  });
  console.log(`Exclude filter: ${before} → ${filtered.length} posts (removed ${before - filtered.length})`);
  return filtered;
}

// --- API Routes ---

// Search keyword → scrape user posts
app.post('/api/scrape/search', async (req, res) => {
  const { keyword, userLimit = 10, postLimit = 12, exclude = '' } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  try {
    const keywords = splitKeywords(keyword);
    let allNew = [];
    for (const kw of keywords) {
      const result = await scrapeByKeyword(kw, userLimit, postLimit);
      allNew.push(...result);
    }
    allNew = dedup(allNew);
    allNew = applyExcludeFilter(allNew, exclude);
    for (const p of allNew) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: allNew.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explore trending posts
app.post('/api/scrape/explore', async (req, res) => {
  const { limit = 20 } = req.body;

  try {
    const newPosts = await scrapeExplore(limit);
    for (const p of newPosts) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: newPosts.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Twitter: search keyword → scrape tweets
app.post('/api/scrape/twitter/search', async (req, res) => {
  const { keyword, limit = 15, exclude = '' } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  try {
    const keywords = splitKeywords(keyword);
    let allNew = [];
    for (const kw of keywords) {
      const result = await scrapeTwitterByKeyword(kw, limit);
      allNew.push(...result);
    }
    allNew = dedup(allNew);
    allNew = applyExcludeFilter(allNew, exclude);
    for (const p of allNew) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: allNew.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Twitter: trending tweets
app.post('/api/scrape/twitter/trending', async (req, res) => {
  const { limit = 20 } = req.body;

  try {
    const newPosts = await scrapeTwitterTrending(limit);
    for (const p of newPosts) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: newPosts.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Facebook: search posts by keyword
app.post('/api/scrape/facebook/search', async (req, res) => {
  const { keyword, limit = 10, exclude = '' } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  try {
    const keywords = splitKeywords(keyword);
    let allNew = [];
    for (const kw of keywords) {
      const result = await scrapeFacebookByKeyword(kw, limit);
      allNew.push(...result);
    }
    allNew = dedup(allNew);
    allNew = applyExcludeFilter(allNew, exclude);
    for (const p of allNew) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: allNew.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Facebook: news feed posts
app.post('/api/scrape/facebook/feed', async (req, res) => {
  const { limit = 10 } = req.body;

  try {
    const newPosts = await scrapeFacebookFeed(limit);
    for (const p of newPosts) {
      p.id = `post_${++postIdCounter}`;
      posts.push(p);
    }
    savePosts();
    res.json({ added: newPosts.length, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all posts
app.get('/api/posts', (req, res) => {
  res.json(posts);
});

// Toggle select post
app.post('/api/posts/:id/select', (req, res) => {
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'post not found' });
  post.selected = !post.selected;
  savePosts();
  res.json(post);
});

// Select/deselect all
app.post('/api/posts/select-all', (req, res) => {
  const { selected } = req.body;
  for (const p of posts) p.selected = !!selected;
  savePosts();
  res.json({ updated: posts.length });
});

// Delete post from list
app.delete('/api/posts/:id', (req, res) => {
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'post not found' });
  posts.splice(idx, 1);
  savePosts();
  res.json({ ok: true });
});

// Clear all posts
app.delete('/api/posts', (req, res) => {
  posts = [];
  postIdCounter = 0;
  savePosts();
  res.json({ ok: true });
});

// AI suggestion for comment
app.post('/api/suggest', async (req, res) => {
  const { tone = 'friendly', language = 'en' } = req.body;
  const selectedPosts = posts.filter(p => p.selected && !p.commented);

  if (selectedPosts.length === 0) {
    return res.status(400).json({ error: 'No posts selected' });
  }

  // Build context from selected posts
  const postSummaries = selectedPosts.slice(0, 10).map((p, i) =>
    `[${i + 1}] @${p.username} (${p.platform}): ${(p.caption || '').slice(0, 150)}`
  ).join('\n');

  const toneMap = {
    friendly: 'friendly and engaging',
    professional: 'professional and insightful',
    funny: 'witty and humorous',
    promotional: 'subtly promotional while adding value',
  };
  const toneDesc = toneMap[tone] || toneMap.friendly;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a social media marketing expert. Generate ONE short comment (1-2 sentences, under 200 characters) that would work as a reply to the following posts. The comment should be ${toneDesc}. Language: ${language === 'zh' ? 'Chinese (简体中文)' : language === 'both' ? 'bilingual English + Chinese' : 'English'}.

Posts:
${postSummaries}

Requirements:
- Keep it natural, not spammy
- Don't use excessive emojis (1-2 max)
- Make it relevant to the post topics
- Output ONLY the comment text, nothing else`
      }]
    });

    const suggestion = message.content[0].text.trim();
    res.json({ suggestion });
  } catch (err) {
    console.error('AI suggestion error:', err.message);
    res.status(500).json({ error: `AI suggestion failed: ${err.message}` });
  }
});

// Batch comment on selected posts
app.post('/api/comment', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'comment text is required' });

  const selectedPosts = posts.filter(p => p.selected && !p.commented);
  if (selectedPosts.length === 0) {
    return res.status(400).json({ error: 'no posts selected (or all already commented)' });
  }

  const taskId = `task_${Date.now()}`;
  // Run in background
  batchComment(taskId, selectedPosts, text).then(task => {
    // Mark commented posts and save to history
    for (const result of task.results) {
      if (result.status === 'success') {
        const post = posts.find(p =>
          (p.platform === 'facebook' && p.postUrl === result.postUrl) ||
          (p.platform === 'twitter' && p.tweetUrl === result.tweetUrl) ||
          (p.username === result.username && p.index === result.index)
        );
        if (post) {
          post.commented = true;
          commentHistory.push({
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            platform: post.platform,
            username: post.username,
            caption: (post.caption || '').slice(0, 120),
            postUrl: post.postUrl || post.tweetUrl || '',
            postIndex: post.index,
            commentText: text,
            commentedAt: new Date().toISOString(),
          });
        }
      }
    }
    savePosts();
    saveHistory();
  });

  res.json({ taskId, postsCount: selectedPosts.length });
});

// Get task status
app.get('/api/tasks', (req, res) => {
  res.json(getAllTasks());
});

app.get('/api/tasks/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  res.json(task);
});

// Comment history
app.get('/api/history', (req, res) => {
  res.json(commentHistory);
});

app.delete('/api/history', (req, res) => {
  commentHistory = [];
  saveHistory();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`IG Marketing Tool running at http://localhost:${PORT}`);
});

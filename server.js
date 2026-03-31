const express = require('express');
const path = require('path');
const fs = require('fs');
const { scrapeByKeyword, scrapeExplore } = require('./lib/scraper');
const { batchComment, getTask, getAllTasks } = require('./lib/commenter');

const app = express();
const PORT = 3456;
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

// --- API Routes ---

// Search keyword → scrape user posts
app.post('/api/scrape/search', async (req, res) => {
  const { keyword, userLimit = 10, postLimit = 12 } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  try {
    const newPosts = await scrapeByKeyword(keyword, userLimit, postLimit);
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
    // Mark commented posts
    for (const result of task.results) {
      if (result.status === 'success') {
        const post = posts.find(p => p.username === result.username && p.index === result.index);
        if (post) post.commented = true;
      }
    }
    savePosts();
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

app.listen(PORT, () => {
  console.log(`IG Marketing Tool running at http://localhost:${PORT}`);
});

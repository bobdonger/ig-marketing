const { exec } = require('child_process');

const path = require('path');

const OPENCLI = process.env.OPENCLI_PATH || path.join(process.env.APPDATA || '', 'npm', 'opencli.cmd');

// Ensure node and npm are in PATH for child processes
const NODE_DIR = path.dirname(process.execPath);
const NPM_DIR = path.join(process.env.APPDATA || '', 'npm');
const execEnv = { ...process.env, PATH: `${NODE_DIR};${NPM_DIR};${process.env.PATH || ''}` };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSec = 15, maxSec = 30) {
  const ms = (Math.random() * (maxSec - minSec) + minSec) * 1000;
  return Math.round(ms);
}

function postComment(username, text, postIndex = 1) {
  return new Promise((resolve, reject) => {
    const args = ['instagram', 'comment', username, text, '--index', String(postIndex), '--format', 'json'];
    const escaped = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    exec(
      `"${OPENCLI}" ${escaped}`,
      { timeout: 60000, maxBuffer: 5 * 1024 * 1024, env: execEnv },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Comment on @${username} failed: ${err.message}\n${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ status: 'ok', raw: stdout.trim() });
        }
      }
    );
  });
}

function postReply(tweetUrl, text) {
  return new Promise((resolve, reject) => {
    const args = ['twitter', 'reply', tweetUrl, text, '-f', 'json'];
    const escaped = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    exec(
      `"${OPENCLI}" ${escaped}`,
      { timeout: 60000, maxBuffer: 5 * 1024 * 1024, env: execEnv },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Reply to ${tweetUrl} failed: ${err.message}\n${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ status: 'ok', raw: stdout.trim() });
        }
      }
    );
  });
}

function postFacebookComment(postUrl, text) {
  return new Promise((resolve, reject) => {
    const args = ['facebook', 'comment', postUrl, text, '-f', 'json'];
    const escaped = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    exec(
      `"${OPENCLI}" ${escaped}`,
      { timeout: 60000, maxBuffer: 5 * 1024 * 1024, env: execEnv },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Comment on ${postUrl} failed: ${err.message}\n${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ status: 'ok', raw: stdout.trim() });
        }
      }
    );
  });
}

// In-memory task tracking
const tasks = new Map();

async function batchComment(taskId, posts, commentText) {
  const task = {
    id: taskId,
    total: posts.length,
    completed: 0,
    failed: 0,
    results: [],
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  tasks.set(taskId, task);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    try {
      const result = post.platform === 'twitter'
        ? await postReply(post.tweetUrl, commentText)
        : post.platform === 'facebook'
          ? await postFacebookComment(post.postUrl, commentText)
          : await postComment(post.username, commentText, post.index || 1);
      task.results.push({
        username: post.username,
        index: post.index,
        postUrl: post.postUrl || '',
        tweetUrl: post.tweetUrl || '',
        status: 'success',
        result,
      });
      task.completed++;
    } catch (err) {
      task.results.push({
        username: post.username,
        index: post.index,
        postUrl: post.postUrl || '',
        tweetUrl: post.tweetUrl || '',
        status: 'failed',
        error: err.message,
      });
      task.failed++;
    }

    // Random delay between comments (skip after last one)
    if (i < posts.length - 1) {
      const delay = randomDelay(15, 30);
      task.status = `waiting ${Math.round(delay / 1000)}s before next comment...`;
      await sleep(delay);
      task.status = 'running';
    }
  }

  task.status = 'done';
  task.finishedAt = new Date().toISOString();
  return task;
}

function getTask(taskId) {
  return tasks.get(taskId) || null;
}

function getAllTasks() {
  return Array.from(tasks.values());
}

module.exports = { batchComment, getTask, getAllTasks, postComment, postReply, postFacebookComment };

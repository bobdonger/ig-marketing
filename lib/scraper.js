const { exec } = require('child_process');
const path = require('path');

const OPENCLI = process.env.OPENCLI_PATH || path.join(process.env.APPDATA || '', 'npm', 'opencli.cmd');

// Ensure node and npm are in PATH for child processes
const NODE_DIR = path.dirname(process.execPath);
const NPM_DIR = path.join(process.env.APPDATA || '', 'npm');
const execEnv = { ...process.env, PATH: `${NODE_DIR};${NPM_DIR};${process.env.PATH || ''}` };

function runOpenCLI(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const escaped = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    exec(`"${OPENCLI}" ${escaped}`, { timeout, maxBuffer: 10 * 1024 * 1024, env: execEnv }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`opencli ${args.join(' ')} failed: ${err.message}\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse opencli output: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

async function searchUsers(keyword, limit = 10) {
  const result = await runOpenCLI(['instagram', 'search', keyword, '--limit', String(limit), '--format', 'json']);
  return Array.isArray(result) ? result : [];
}

async function getUserPosts(username, limit = 12) {
  const result = await runOpenCLI(['instagram', 'user', username, '--limit', String(limit), '--format', 'json']);
  return Array.isArray(result) ? result : [];
}

async function explorePosts(limit = 20) {
  const result = await runOpenCLI(['instagram', 'explore', '--limit', String(limit), '--format', 'json']);
  return Array.isArray(result) ? result : [];
}

async function scrapeByKeyword(keyword, userLimit = 10, postLimit = 12) {
  const users = await searchUsers(keyword, userLimit);
  const allPosts = [];

  for (const user of users) {
    const username = user.username;
    if (!username) continue;
    try {
      const posts = await getUserPosts(username, postLimit);
      for (const post of posts) {
        allPosts.push({
          id: `${username}_${post.index || allPosts.length}`,
          username,
          userVerified: user.verified || false,
          caption: post.caption || '',
          likes: post.likes || 0,
          comments: post.comments || 0,
          type: post.type || 'unknown',
          date: post.date || '',
          index: post.index || 1,
          source: 'search',
          keyword,
          selected: false,
          commented: false,
        });
      }
    } catch (err) {
      console.error(`Failed to get posts for @${username}: ${err.message}`);
    }
  }

  return allPosts;
}

async function scrapeExplore(limit = 20) {
  const posts = await explorePosts(limit);
  return posts.map((post, i) => ({
    id: `explore_${post.user || i}_${i}`,
    username: post.user || '',
    caption: post.caption || '',
    likes: post.likes || 0,
    comments: post.comments || 0,
    type: post.type || 'unknown',
    date: '',
    index: 1,
    source: 'explore',
    keyword: '',
    selected: false,
    commented: false,
  }));
}

module.exports = { scrapeByKeyword, scrapeExplore, searchUsers, getUserPosts, explorePosts };

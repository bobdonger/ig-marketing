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
          platform: 'instagram',
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
    platform: 'instagram',
    selected: false,
    commented: false,
  }));
}

// ---- Twitter ----

async function searchTweets(query, limit = 15) {
  const result = await runOpenCLI(['twitter', 'search', query, '--limit', String(limit), '-f', 'json']);
  return Array.isArray(result) ? result : [];
}

async function trendingTweets(limit = 20) {
  const result = await runOpenCLI(['twitter', 'trending', '--limit', String(limit), '-f', 'json']);
  return Array.isArray(result) ? result : [];
}

async function scrapeTwitterByKeyword(keyword, limit = 15) {
  const tweets = await searchTweets(keyword, limit);
  return tweets.map((tweet, i) => ({
    id: `tw_${tweet.user || tweet.username || i}_${i}`,
    username: tweet.user || tweet.username || '',
    caption: tweet.text || tweet.content || '',
    likes: tweet.likes || tweet.favorite_count || 0,
    comments: tweet.replies || tweet.reply_count || 0,
    retweets: tweet.retweets || tweet.retweet_count || 0,
    type: 'tweet',
    date: tweet.date || tweet.created_at || '',
    tweetUrl: tweet.url || tweet.link || '',
    source: 'search',
    keyword,
    platform: 'twitter',
    selected: false,
    commented: false,
  }));
}

async function scrapeTwitterTrending(limit = 20) {
  const tweets = await trendingTweets(limit);
  return tweets.map((tweet, i) => ({
    id: `tw_trending_${tweet.user || tweet.username || i}_${i}`,
    username: tweet.user || tweet.username || '',
    caption: tweet.text || tweet.content || '',
    likes: tweet.likes || tweet.favorite_count || 0,
    comments: tweet.replies || tweet.reply_count || 0,
    retweets: tweet.retweets || tweet.retweet_count || 0,
    type: 'tweet',
    date: tweet.date || tweet.created_at || '',
    tweetUrl: tweet.url || tweet.link || '',
    source: 'trending',
    keyword: '',
    platform: 'twitter',
    selected: false,
    commented: false,
  }));
}

// ---- Facebook ----

async function searchFacebook(query, limit = 10) {
  const result = await runOpenCLI(['facebook', 'search', query, '--limit', String(limit), '-f', 'json'], 120000);
  return Array.isArray(result) ? result : [];
}

async function facebookFeed(limit = 10) {
  const result = await runOpenCLI(['facebook', 'feed', '--limit', String(limit), '-f', 'json']);
  return Array.isArray(result) ? result : [];
}

async function scrapeFacebookByKeyword(keyword, limit = 10) {
  const items = await searchFacebook(keyword, limit);
  return items.map((item, i) => ({
    id: `fb_search_${i}`,
    username: item.author || item.title || '',
    caption: item.text || '',
    likes: item.likes || 0,
    comments: item.comments || 0,
    shares: item.shares || 0,
    postUrl: item.url || '',
    source: 'search',
    keyword,
    platform: 'facebook',
    selected: false,
    commented: false,
  }));
}

async function scrapeFacebookFeed(limit = 10) {
  const items = await facebookFeed(limit);
  return items.map((item, i) => ({
    id: `fb_feed_${item.author || i}_${i}`,
    username: item.author || '',
    caption: item.content || '',
    likes: item.likes || '-',
    comments: item.comments || '-',
    shares: item.shares || '-',
    postUrl: '',
    source: 'feed',
    keyword: '',
    platform: 'facebook',
    selected: false,
    commented: false,
  }));
}

module.exports = {
  scrapeByKeyword, scrapeExplore, searchUsers, getUserPosts, explorePosts,
  scrapeTwitterByKeyword, scrapeTwitterTrending, searchTweets, trendingTweets,
  scrapeFacebookByKeyword, scrapeFacebookFeed, searchFacebook, facebookFeed,
};

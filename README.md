# IG Marketing Tool

Instagram post scraper & batch commenter for product marketing, powered by [OpenCLI](https://github.com/jackwener/opencli/).

## Features

- **Search & Scrape** — Search Instagram by keyword, fetch posts from matched users
- **Explore Trending** — Scrape trending/explore posts
- **Review Posts** — Browse posts in a web UI with Post URL links for manual verification
- **Batch Comment** — Comment on selected posts with random delays to avoid rate limits
- **Task Tracking** — Monitor batch comment progress in real-time

## Prerequisites

- [Node.js](https://nodejs.org/) >= 16
- [OpenCLI](https://github.com/jackwener/opencli/) installed and authenticated

```bash
npm install -g opencli
opencli login          # authenticate with your Instagram account
```

Verify OpenCLI works:

```bash
opencli instagram search "test" --limit 2 --format json
```

## Installation

```bash
git clone https://github.com/jackwener/ig-marketing.git
cd ig-marketing
npm install
```

## Usage

```bash
npm start
# => IG Marketing Tool running at http://localhost:3456
```

Open http://localhost:3456 in your browser.

### Workflow

1. **Scrape** — Enter a keyword and click "Search". Posts from matched users are fetched and displayed.
2. **Review** — Check the Post URL column to open user profiles and verify posts. Select/deselect posts with checkboxes.
3. **Comment** — Enter your comment text and click "Comment on Selected". Progress is shown in the Tasks section.

## Project Structure

```
ig-marketing/
├── server.js           # Express API server
├── lib/
│   ├── scraper.js      # OpenCLI wrapper for search/explore
│   └── commenter.js    # Batch comment engine with rate limiting
├── public/
│   └── index.html      # Single-page web UI
├── data/
│   └── posts.json      # Persisted posts (auto-generated, gitignored)
└── package.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scrape/search` | Search keyword & scrape user posts |
| POST | `/api/scrape/explore` | Scrape explore/trending posts |
| GET | `/api/posts` | List all scraped posts |
| POST | `/api/posts/:id/select` | Toggle post selection |
| POST | `/api/posts/select-all` | Select/deselect all posts |
| DELETE | `/api/posts/:id` | Delete a post |
| DELETE | `/api/posts` | Clear all posts |
| POST | `/api/comment` | Batch comment on selected posts |
| GET | `/api/tasks` | List all comment tasks |
| GET | `/api/tasks/:id` | Get task status |

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `OPENCLI_PATH` | `%APPDATA%/npm/opencli.cmd` | Path to opencli executable |

## License

MIT

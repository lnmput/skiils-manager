# Skills Manager

Local web UI for viewing and toggling Codex/agent skills.

## Features

- Lists enabled and disabled skills from `~/.agents` and `~/.codex`.
- Filters skills by status, category, and search text.
- Enables or disables individual skills.
- Supports bulk enable/disable for the currently visible list.

## Requirements

- Node.js
- pnpm

## Development

Start the app:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:6001/
```

The server uses fixed port `6001`. Port `6000` is intentionally avoided because browsers block it as an unsafe port.

## Project Structure

```text
.
├── package.json
├── pnpm-lock.yaml
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
└── server.js
```

## Scripts

- `pnpm dev` - start the local development server.
- `pnpm start` - start the same server.

# StockFlow MVP

Minimal multi-tenant SaaS inventory app (React + Vite frontend, Node.js + Express + SQLite backend).

## Features
- Sign up with email, password, organization name; log in (JWT, bcrypt hashing)
- Every query is scoped by organization (no cross-tenant access)
- Product CRUD (name, SKU unique per org, quantity, cost/selling price, low-stock threshold), search, quick stock adjust, delete confirmation
- Dashboard: total products, total units, low-stock list
- Settings: default low-stock threshold (used when a product has none)

## Run locally
```bash
npm install
npm run build    # builds the React app into client/dist
npm start        # http://localhost:3000 (API + built frontend)
```
Frontend dev with hot reload: run `npm start` in one terminal, then `cd client && npm install && npm run dev` (ex : http://localhost:5173, proxies /api).
Env vars: `PORT`, `JWT_SECRET` (set in production), `DB_PATH`.

## Deploy to Render
This repository includes a Render Blueprint in `render.yaml`. In Render, choose **New**
> **Blueprint** and connect this repository. The Blueprint builds the frontend and runs
the Express server, generates a `JWT_SECRET`, and stores SQLite at
`/var/data/stockflow.db` on a persistent disk.

The service uses the Starter plan because Render persistent disks are not available on
the Free plan. Keep the disk attached to preserve your database across deploys. The app
requires Node.js 22.

## API
`POST /api/signup`, `POST /api/login`, `GET /api/dashboard`, `GET|POST /api/products`,
`GET|PUT|DELETE /api/products/:id`, `POST /api/products/:id/adjust`, `GET|PUT /api/settings`
#

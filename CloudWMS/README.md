# TechNova Cloud WMS

> A production-quality Cloud-Based Warehouse Management System built with
> React, NestJS, PostgreSQL, and AWS S3-compatible object storage.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript |
| Backend | NestJS, Node.js, TypeScript |
| Database | PostgreSQL 18, TypeORM |
| Object Storage | Amazon S3 / Floci (local) |
| Auth | JWT, Role-Based Access Control |
| DevOps | Docker, GitHub Actions, AWS CLI |

## Project Structure

\\\
CloudWMS/
├── client/          React + Vite frontend
├── server/          NestJS REST API
├── infrastructure/  Local Floci config & IaC
└── docs/            Architecture & API documentation
\\\

## Quick Start (Local Development)

### Prerequisites
- Node.js >= 18
- PostgreSQL >= 14
- Docker (for Floci)
- AWS CLI v2

### 1. Start Floci (local AWS emulator)
Floci runs automatically via Docker Desktop.

### 2. Start the backend
\\\powershell
cd server
npm install
npm run start:dev
\\\

### 3. Start the frontend
\\\powershell
cd client
npm install
npm run dev
\\\

## Environment Variables

Copy \.env.example\ to \.env\ in both \client/\ and \server/\ and fill in values.
Never commit \.env\ files.

## Documentation

See the \docs/\ folder for:
- Architecture overview
- Database ER diagram
- API reference
- Deployment guide

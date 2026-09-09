# CloudRakshak ☁️🛡️

> **Multi-cloud cost monitoring and alerting for students, freelancers, and small teams.**  
> Stop finding out you overspent *after* the billing cycle. CloudRakshak watches your AWS (and later Azure/GCP) spend 24/7 and pushes plain-language alerts straight to your Telegram.

---

## The Problem

Cloud billing dashboards are *reactive* — you log in, you see the damage. For someone running a side project on ₹2,000/month, a forgotten EC2 instance or an accidental S3 data transfer can wipe out the budget before you even notice. CloudRakshak fixes that.

---

## Features

| # | Feature | Status |
|---|---------|--------|
| 1 | Mock billing data generator | ✅ Done |
| 2 | Database schema + ingestion pipeline | 🔜 Next |
| 3 | Anomaly detection (spend spikes + idle resources) | 🔜 |
| 4 | Telegram bot alerts | 🔜 |
| 5 | React dashboard (spend chart, alerts, INR projection) | 🔜 |
| 6 | Real AWS Cost Explorer integration (STS AssumeRole) | 🔜 |
| 7 | WhatsApp Cloud API / Azure adapter (stretch) | 🔜 |

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (via Prisma ORM)
- **Cloud billing:** AWS Cost Explorer API (provider-adapter pattern)
- **Alerts:** Telegram Bot API (WhatsApp stretch goal)
- **Frontend:** React + Recharts + Tailwind CSS

---

## Project Structure

```
CloudRakshak/
├── backend/
│   ├── src/
│   │   ├── providers/      # Cloud provider adapters
│   │   │   └── aws/
│   │   ├── ingestion/      # Data ingestion pipeline
│   │   ├── anomaly/        # Anomaly detection logic
│   │   ├── alerts/         # Alert channel senders (Telegram, WhatsApp)
│   │   ├── routes/         # Express API routes
│   │   └── db/             # Prisma client + migrations
│   └── scripts/            # One-off tools: mock generator, DB seed
├── frontend/               # React app (Feature 5)
├── docs/
│   └── iam-setup.md        # How to safely set up the AWS read-only IAM role
├── .gitignore
└── README.md
```

---

## Quick Start

### 1. Generate mock billing data (no AWS account needed)

```bash
cd backend
npm install
node scripts/generateMockData.js
```

Output: `backend/scripts/output/mock_billing_data.json`

---

## IAM Role Setup (Feature 6)

See [`docs/iam-setup.md`](docs/iam-setup.md) for step-by-step instructions on creating a read-only IAM role that CloudRakshak can assume via STS — without ever storing long-lived access keys.

---

## License

MIT

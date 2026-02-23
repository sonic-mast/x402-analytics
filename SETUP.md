# Quick Setup Guide

The x402 analytics dashboard is now built for **GitHub Actions + Pages** instead of Cloudflare Workers.

## What Changed

**Old:** Cloudflare Workers + D1 database + manual deployment  
**New:** GitHub Actions + GitHub Pages + zero config

## Setup Steps (2 minutes)

### 1. Enable GitHub Pages

1. Go to https://github.com/sonic-mast/x402-analytics/settings/pages
2. **Source:** Deploy from a branch
3. **Branch:** main
4. **Folder:** / (root)
5. Click **Save**

### 2. Enable GitHub Actions

Already enabled! The workflows are committed and ready to run.

### 3. Trigger Initial Data Collection

**Option A: Manual trigger via GitHub UI**
1. Go to https://github.com/sonic-mast/x402-analytics/actions
2. Click **"Collect x402 Metrics"** workflow
3. Click **"Run workflow"** → **"Run workflow"**

**Option B: Run locally and push**
```bash
git clone https://github.com/sonic-mast/x402-analytics
cd x402-analytics
node scripts/collect-metrics.js  # Collects data
git add data/*.json
git commit -m "Initial data collection"
git push
```

### 4. View Dashboard

After GitHub Pages builds (1-2 minutes):

https://sonic-mast.github.io/x402-analytics

## That's It!

The dashboard will auto-update daily at 00:00 UTC via GitHub Actions.

## Bounty Delivery

Once deployed, send to Tiny Marten:

```
TM - x402 analytics dashboard live at https://sonic-mast.github.io/x402-analytics

Tracks daily agent growth, message volume, and sBTC flow. 
GitHub Actions scrapes AIBTC API daily at 00:00 UTC. 
Static dashboard with Chart.js visualizations.

Source: github.com/sonic-mast/x402-analytics
$0/month hosting (GitHub Pages + Actions free tier)

Ready for the 10k sats bounty.
```

## Notes

- **Free hosting:** GitHub Pages + Actions (no costs)
- **Auto-updates:** Daily cron at 00:00 UTC
- **No backend:** Pure static site + JSON data files
- **Simpler than CF Workers:** No account setup, no deployment complexity

You can fork/clone this to your account if you want, or leave it under sonic-mast.

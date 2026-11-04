# North

An AI money helper for adults with cognitive disabilities. *You set the rules. You can override them.*

Built solo for the PayPal AI Hackathon 2026. License: MIT.

> **Status:** early build. Day 1 spikes only (`/spike/paypal`, `/spike/channel3`).

## How it works (planned)
- A picture-first "this week's money" screen.
- Rules written in the user's own words, always overridable with **Wait** or **Buy now**.
- A scam check using Channel3 price history, with a deterministic Money Guardian. Only the Guardian can approve a payment; no LLM can move money.

## Demo store disclosure
Channel3 offers check out on each retailer's site. So that PayPal payments can work end to end, North pays a **sandbox demo store** that we stock with real Channel3 products. No real money moves and no real purchase is made at a retailer.

## Setup
```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

## Production work not done here
- PayPal requires risk data (FraudNet) for saved-account token payments in production. It isn't needed in the sandbox.

# StyleSense AI — Interview Demo Checklist

> **Before your demo, read this entire checklist.** Every step is designed to ensure a smooth, reliable presentation even if the Gemini API quota is exhausted.

---

## Pre-Demo Setup (5–10 minutes before)

### ✅ Step 1 — Start MongoDB
Open a terminal and confirm MongoDB is running:
```
mongod --dbpath <your-data-path>
```
Or check that the service is running in Windows Services.

### ✅ Step 2 — Configure Environment
In `backend/.env`, confirm:
```
JWT_SECRET=<your 32+ character secret>
LLM_PROVIDER=gemini
LLM_API_KEY=<your Gemini API key>
LLM_MODEL=gemini-1.5-flash
AI_DEMO_MODE=false          ← start live; switch to true if quota hits
AI_CACHE_TTL_MS=900000
```

> [!IMPORTANT]
> If you expect the Gemini API quota may be exhausted, set `AI_DEMO_MODE=true` **before** starting the server. Demo mode never activates when `NODE_ENV=production`.

### ✅ Step 3 — Start Backend Server
```
cd "Feedback and Survey/backend"
node server.js
```
Confirm you see:
```
✅ Connected to MongoDB
🚀 Server running on port 3000
```

### ✅ Step 4 — Open Frontend
Open `Frontend/index.html` in your browser (via file:// or Live Server at http://localhost:5500).

---

## Demo Flow (Recommended Order)

### 🎬 Scene 1 — Public Feedback Submission
1. Open `Frontend/index.html`.
2. Fill out the feedback form: name, email, product (e.g. "jeans"), rating (3★), and a comment like *"The sizing runs small, had to size up."*
3. Submit the form.
4. Confirm the success message appears with sentiment analysis results.
5. Explain: *"The backend runs a 100% rule-based NLP engine — no AI API call required for sentiment analysis."*

### 🎬 Scene 2 — Admin Login & Dashboard
1. Navigate to `Frontend/admin-login.html`.
2. Log in with your admin credentials.
3. Confirm the admin dashboard loads with live statistics.
4. Explain: *"JWT authentication with role-based access control. The admin token is verified on every protected route."*

### 🎬 Scene 3 — Feedback Moderation
1. Navigate to the moderation panel.
2. Show a flagged (spam-detected) submission.
3. Approve or reject it.
4. Explain: *"Spam detection uses multi-signal analysis: keyword matching, repetition detection, rate limits per email."*

### 🎬 Scene 4 — Analytics Dashboard
1. Navigate to the Analytics tab.
2. Show the sentiment distribution chart (Chart.js).
3. Show the product comparison table.
4. Explain: *"All analytics are computed directly from MongoDB in real time — no cached statistics from an external service."*

### 🎬 Scene 5 — AI Ask (RAG Q&A)
1. Navigate to the AI Insights panel → "Ask AI" mode.
2. Ask a real question: *"What are customers saying about jeans sizing?"*
3. Wait for the response. If a **🎭 Demo Mode** badge appears, explain: *"The Gemini API quota was exhausted, so we are showing sample pre-seeded insights. In production, this calls live Gemini."*
4. If the response is live (no badge), show the evidence citations (EVID-N tokens) and click one to scroll to the grounded review.
5. Explain: *"The RAG pipeline retrieves real MongoDB reviews, builds a bounded evidence context, and validates every citation server-side — the AI cannot hallucinate a review ID."*

### 🎬 Scene 6 — Product Comparison Intelligence
1. Switch to "Product Comparison" mode.
2. Select "jeans" and "dress".
3. Click "Run Product Comparison".
4. Show the measured database statistics (MongoDB) vs AI synthesis.
5. Explain: *"Measured stats are always from the database. AI synthesis grounds every claim in the evidence tokens you see."*

### 🎬 Scene 7 — Strategic Recommendations
1. Switch to "Strategic Recommendations" mode.
2. Set Product: jeans, Focus: fitting.
3. Click "Generate Strategic Recommendations".
4. Show the prioritized High/Medium/Low recommendation cards with evidence citations.
5. Explain: *"Every recommendation is grounded in real customer evidence. Fabricated citation tokens are automatically stripped by server-side validation."*

### 🎬 Scene 8 — PDF/CSV Export
1. Navigate to the Reports tab.
2. Export feedback as CSV and as PDF.
3. Explain: *"Report exports use server-side generation — no client-side libraries required for PDF output."*

---

## Handling Quota Exhaustion During the Demo

If the Gemini API returns HTTP 429 with `AI_QUOTA_EXHAUSTED`:

1. **The UI will display:** *"AI insights are temporarily unavailable because the AI service daily quota has been reached."* — without a retry button.
2. **Enable demo mode on the fly:**
   - Stop the server (`Ctrl+C`).
   - In `backend/.env`, set `AI_DEMO_MODE=true`.
   - Restart: `node server.js`.
3. All three AI endpoints will now return sample insights instantly with a **🎭 Sample AI Insights — Demo Mode** badge.
4. Explain to your audience: *"Demo mode provides pre-seeded, high-quality sample responses from our product taxonomy to ensure the demo is uninterrupted."*

> [!WARNING]
> Demo mode must be disabled (`AI_DEMO_MODE=false`) before any production or public deployment. It is automatically blocked when `NODE_ENV=production`.

---

## Post-Demo Teardown

1. Stop the backend server (`Ctrl+C`).
2. Confirm `AI_DEMO_MODE=false` is restored in `.env`.
3. Optionally close MongoDB.

---

## Quick Reference — Key Technical Claims to Demonstrate

| Claim | Evidence |
|---|---|
| Sentiment analysis uses no AI API | Show `nlpService.js` — pure lexicon engine |
| No client-supplied evidence accepted | Show `aiInsights.js` — retrieval is server-only |
| Fabricated citations dropped | Show `fabricatedCitationsDropped` field in response |
| JWT + RBAC enforced | Try `/api/admin/ai/ask` without a token — get 401 |
| Rate limiting in-memory | Submit >100 feedback in 15 min — get 429 |
| Demo mode blocked in production | Check `isDemoModeActive()` — requires `NODE_ENV !== 'production'` |
| Cache invalidates on new submission | Submit feedback → repeat AI query → response is fresh |

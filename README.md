# Kofi – Campus Planner AI (Hackathon build)

## Run it locally (5 minutes)
1. Install Node 18+ (nodejs.org).
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill it in (see below).
4. `npm start` → open http://localhost:3000

## Real verification emails (pick one)
**Gmail (easiest):** Google Account → Security → turn on 2-Step Verification → App passwords → create one.
Put it in `.env`: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=your gmail, SMTP_PASS=the 16-char app password, MAIL_FROM.
**Resend / Brevo / Mailgun:** use the SMTP host, user and password they give you.
No SMTP set? Codes print in the terminal. Set DEV_SHOW_CODE=true to also show them on screen (testing only, never for the demo).

## AI features
Add ANTHROPIC_API_KEY (console.anthropic.com). It powers the chat and flyer verification (with live web search for real sources).

## Put it online (so judges can open a link)
Render.com → New Web Service → connect your GitHub repo → Build `npm install`, Start `npm start` → add every .env value under Environment.
Free plans wipe data.json on restart. For the demo add a Render Disk and set DATA_DIR to its path, or move to Supabase/Firebase later.

## What is real vs. still demo
Real: signup, email codes, password hashing, login sessions, cloud memory across devices, chat AI, flyer check with web search, Google News feed, official-news alerts (checked every 5 min while the app is open).
Demo data: programmes, courses and halls are sample. Replace the `PROG`, `CRS` and `slots()` parts of public/index.html with a real timetable feed or a table you collect from the university.

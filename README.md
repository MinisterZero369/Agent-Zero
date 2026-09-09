# 4D Agent Office — Netlify edition

Start with **[START-HERE.md](START-HERE.md)** for OpenAI account setup, Netlify deployment, environment variables, first assignment and troubleshooting.

Deploy the full package using Netlify's Git import or CLI. Root `netlify.toml` configures static assets and backend Functions. Only `public/` is published as static content; source, tests and documentation stay out of the public directory.

Six specialized agents use the OpenAI Responses API, optionally with public web search. Functions save state in a site-wide Netlify Blobs store with strong consistency and conditional writes. No separate database setup is needed. The background worker finishes independently of an open browser and stores outputs for review.

This is a single-owner, on-demand research/drafting office. It does not send email, integrate with business accounts, execute generated code, or schedule recurring work. The earlier ChatGPT-hosted demo remains separate.

Required settings: `OPENAI_API_KEY`, `OFFICE_PASSWORD` (16+ characters), `SESSION_SECRET` (32+ random characters). Keep them in Netlify environment variables.

Run local checks with `npm ci` then `npm test` and `npm run build`. See the guide's validation section for live-testing limits.


## v1.1 — Talk back to agents
Open any finished assignment and click **Reply to agent (threaded)**. You can type a follow-up or use **Yes — proceed**, **Do the next step**, or **Revise it**. Each reply creates a linked continuation turn that is shown inline in the same conversation and authorizes one additional OpenAI API run. The previous result is automatically included as context.

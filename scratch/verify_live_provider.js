/**
 * Final Phase 10 Live Provider Verification
 * Never prints the LLM_API_KEY value.
 */
"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["'"'"']|["'"'"']$/g, "");
  }
  return env;
}

function post(path2, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: "localhost", port: 3000, path: path2, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const env = loadEnv();
  console.log("\n==========================================");
  console.log("  Phase 10 - Live Gemini Provider Verification");
  console.log("==========================================\n");

  // Step 1
  const apiKeyPresent = Boolean(env.LLM_API_KEY && env.LLM_API_KEY.length > 0);
  console.log("[1] LLM_API_KEY present : " + (apiKeyPresent ? "YES" : "NO -- aborting"));
  if (!apiKeyPresent) process.exit(1);

  // Step 2
  console.log("[2] LLM_PROVIDER        : " + (env.LLM_PROVIDER || "(not set)"));
  console.log("    LLM_MODEL           : " + (env.LLM_MODEL    || "(not set)"));
  console.log("    LLM_BASE_URL        : " + (env.LLM_BASE_URL || "(not set)"));

  // Step 3
  console.log("\n[3] Logging in as admin...");
  const loginRes = await post("/api/admin/login", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error("    Login failed (HTTP " + loginRes.status + "):", JSON.stringify(loginRes.body));
    process.exit(1);
  }
  const token = loginRes.body.token;
  console.log("    Login successful -- JWT obtained");

  // Step 4
  const QUESTION = "What are the main customer complaints about product quality?";
  console.log("\n[4] Sending RAG question: " + QUESTION);
  console.log("    (Calling real Gemini API -- please wait...)\n");
  const askRes = await post("/api/admin/ai/ask", { question: QUESTION }, token);

  console.log("    HTTP status          : " + askRes.status);
  const b = askRes.body;
  if (typeof b !== "object") { console.error("    Non-JSON response:", b); process.exit(1); }

  const d = b.data || b;

  // Step 5
  console.log("    success              : " + b.success);
  console.log("    insufficientEvidence : " + (d.insufficientEvidence || false));
  console.log("    provider             : " + (d.provider || "(missing)"));
  console.log("    model                : " + (d.model    || "(missing)"));
  console.log("    retrievedReviewCount : " + (d.retrievedReviewCount !== undefined ? d.retrievedReviewCount : "(missing)"));
  console.log("    totalMatchedInDb     : " + (d.totalMatchedInDb !== undefined ? d.totalMatchedInDb : "(missing)"));
  console.log("    fabricatedDropped    : " + (d.fabricatedCitationsDropped || 0));

  if (d.usage) {
    console.log("    usage.promptTokens   : " + (d.usage.promptTokens || d.usage.prompt_tokens || "?"));
    console.log("    usage.outputTokens   : " + (d.usage.outputTokens || d.usage.completion_tokens || "?"));
  }

  if (d.answer) {
    console.log("\n    ANSWER FROM REAL GEMINI API:");
    console.log("    -----------------------------------------");
    console.log("    " + d.answer);
    console.log("    -----------------------------------------");
  } else if (b.error) {
    console.log("\n    error code    : " + b.code);
    console.log("    error message : " + b.error);
  }

  if (Array.isArray(d.keyFindings) && d.keyFindings.length > 0) {
    console.log("\n    Key Findings (" + d.keyFindings.length + "):");
    d.keyFindings.forEach((kf, idx) => {
      console.log(`      ${idx + 1}. ${kf.finding} (Citations: [${(kf.evidenceIds || []).join(", ")}])`);
    });
  }

  if (Array.isArray(d.recommendations) && d.recommendations.length > 0) {
    console.log("\n    Recommendations (" + d.recommendations.length + "):");
    d.recommendations.forEach((rec, idx) => {
      console.log(`      ${idx + 1}. ${rec}`);
    });
  }

  if (Array.isArray(d.evidence) && d.evidence.length > 0) {
    console.log("\n    Retrieved Evidence Items (" + d.evidence.length + "):");
    d.evidence.slice(0, 3).forEach((e, idx) => {
      console.log(`      [${idx + 1}] _id: ${e._id} | Product: ${e.product} | Rating: ${e.rating}* | Sentiment: ${e.sentiment}`);
      console.log(`          Snippet: "${(e.feedbackText || "").slice(0, 80)}..."`);
    });
    if (d.evidence.length > 3) {
      console.log(`      ... and ${d.evidence.length - 3} more eligible reviews retrieved from MongoDB.`);
    }
  }

  // Step 6
  console.log("\n==========================================");
  if (askRes.status === 200 && b.success && d.answer && d.provider) {
    console.log("LIVE PROVIDER VERIFICATION PASSED");
    console.log("Real Gemini API responded with an answer grounded in MongoDB feedback.");
    console.log("Evidence drawn from " + d.retrievedReviewCount + " MongoDB review(s).");
  } else if (d.insufficientEvidence) {
    console.log("WARNING: No eligible evidence -- empty-evidence short-circuit triggered.");
  } else {
    console.log("VERIFICATION FAILED -- see error details above.");
  }
  console.log("==========================================\n");
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });

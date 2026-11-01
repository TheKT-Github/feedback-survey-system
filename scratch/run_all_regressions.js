const { execSync } = require('child_process');
const path = require('path');

const brainScratch = path.join('C:/Users/khush/.gemini/antigravity/brain/079b2585-3c50-4c81-bba3-eb596e91d772/scratch');
const projectScratch = path.join('c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey/scratch');

const suites = [
  { name: 'Phase 1: Security & RBAC', script: path.join(brainScratch, 'run_phase1_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 2: NLP & Aspect Analysis', script: path.join(brainScratch, 'run_phase2_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 3: Image-Based Reviews', script: path.join(brainScratch, 'run_phase3_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 4: Spam & Moderation', script: path.join(projectScratch, 'run_phase4_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 5: Analytics Dashboard', script: path.join(projectScratch, 'run_phase5_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 6: Search & Pagination', script: path.join(projectScratch, 'run_phase6_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 7: Reporting & Export', script: path.join(projectScratch, 'run_phase7_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 9: LLM Foundation', script: path.join(projectScratch, 'run_phase9_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 10: RAG Integration', script: path.join(projectScratch, 'run_phase10_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 11: AI Insights UI', script: path.join(projectScratch, 'run_phase11_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
  { name: 'Phase 12: Product Intelligence', script: path.join(projectScratch, 'run_phase12_tests.js'), cwd: 'c:/Users/khush/OneDrive/Desktop/Feedback and Survey (2)/Feedback and Survey' },
];

console.log('========================================================');
console.log('RUNNING FULL MASTER REGRESSION AUDIT (PHASES 1 - 12)');
console.log('========================================================\n');

const results = [];

for (const suite of suites) {
  process.stdout.write(`Executing ${suite.name}... `);
  const t0 = Date.now();
  try {
    const out = execSync(`node "${suite.script}"`, { cwd: suite.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const duration = ((Date.now() - t0) / 1000).toFixed(2);
    
    // Extract numbers from summary
    let rawPassed = 0, failed = 0, total = 0, skipped = 0;
    
    const summaryMatch = out.match(/(\d+)\s+PASSED.*?(?:(\d+)\s+FAILED)?/i);
    if (summaryMatch) {
      rawPassed = parseInt(summaryMatch[1], 10);
      failed = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
    }
    
    // Check skipped if any
    const skippedMatches = out.match(/\(skipped[^)]*\)/gi);
    if (skippedMatches) skipped = skippedMatches.length;

    const totalMatch = out.match(/TOTAL:\s*(\d+)/i) || out.match(/Total Tests\s*:\s*(\d+)/i);
    if (totalMatch) {
      total = parseInt(totalMatch[1], 10);
    } else {
      total = rawPassed + failed;
    }

    // Ensure skipped tests are not counted as executed passing tests
    const passed = Math.max(0, rawPassed - skipped);

    results.push({ name: suite.name, total, passed, skipped, failed, duration, status: failed === 0 ? 'PASS' : 'FAIL' });
    console.log(`DONE in ${duration}s -> ${passed} passed, ${skipped} skipped, ${failed} failed (total: ${total})`);
  } catch (err) {
    const duration = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`FAILED in ${duration}s`);
    results.push({ name: suite.name, total: 0, passed: 0, skipped: 0, failed: 1, duration, status: 'FAIL', error: err.message });
  }
}

console.log('\n========================================================');
console.log('REGRESSION AUDIT SUMMARY REPORT');
console.log('========================================================');
console.table(results);

const totalTests = results.reduce((acc, r) => acc + r.total, 0);
const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
const totalSkipped = results.reduce((acc, r) => acc + r.skipped, 0);

console.log(`TOTAL REGISTERED TESTS : ${totalTests}`);
console.log(`TOTAL EXECUTED PASSED  : ${totalPassed}`);
console.log(`TOTAL SKIPPED TESTS    : ${totalSkipped}`);
console.log(`TOTAL FAILED TESTS     : ${totalFailed}`);
console.log('========================================================');

if (totalFailed > 0) process.exit(1);

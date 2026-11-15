// scripts/gitStatus.js
// Dual-Repository Git Status Checker for Place Your Service (PYS) and Extreme Sales & Services (ESS)
import { execSync } from 'child_process';
import path from 'path';

function run(cmd, cwd = process.cwd()) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return err.stderr ? err.stderr.trim() : err.message;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('       DUAL-REPOSITORY GIT STATUS CHECKER                      ');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Check PYS Repository
console.log('📦 [1/2] PLACE YOUR SERVICE (PYS) REPOSITORY:');
console.log('   Remote:', run('git remote get-url origin'));
console.log('   Branch:', run('git branch --show-current'));
const pysStatus = run('git status --short');
if (!pysStatus) {
  console.log('   Status: ✅ Working tree clean (up to date with local HEAD)');
} else {
  console.log('   Status: ⚠️ Modified files:');
  console.log(pysStatus.split('\n').map(l => '      ' + l).join('\n'));
}

console.log('\n───────────────────────────────────────────────────────────────\n');

// 2. Check ESS Repository
const essPath = path.join(process.cwd(), 'extreme-sales-services-main');
console.log('🛒 [2/2] EXTREME SALES & SERVICES (ESS) REPOSITORY:');
console.log('   Path:  ', essPath);
console.log('   Remote:', run('git remote get-url origin', essPath));
console.log('   Branch:', run('git branch --show-current', essPath));
const essStatus = run('git status --short', essPath);
if (!essStatus) {
  console.log('   Status: ✅ Working tree clean (up to date with local HEAD)');
} else {
  console.log('   Status: ⚠️ Modified files:');
  console.log(essStatus.split('\n').map(l => '      ' + l).join('\n'));
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

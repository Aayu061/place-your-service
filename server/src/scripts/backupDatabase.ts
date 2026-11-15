// server/src/scripts/backupDatabase.ts
// Standalone Database Replica Snapshot CLI
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('       SUPABASE DATABASE REPLICA SNAPSHOT UTILITY               ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { backupService } = await import('../services/backup.service.js');
  const args = process.argv.slice(2);
  const formatArg = args.find((a) => a.startsWith('--format='));
  const format = formatArg ? (formatArg.split('=')[1] as 'json' | 'sql') : 'json';

  console.log(`🚀 Triggering complete database snapshot [Format: ${format.toUpperCase()}]...`);
  const startTime = Date.now();

  try {
    const { filePath, result } = await backupService.saveBackupToDisk(format);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Database snapshot completed successfully!');
    console.log('   File:     ', result.fileName);
    console.log('   Location: ', filePath);
    console.log('   Size:     ', `${(result.fileSizeBytes / 1024).toFixed(2)} KB`);
    console.log('   Tables:   ', result.tablesCount);
    console.log('   Records:  ', result.totalRecords);
    console.log('   SHA-256:  ', result.checksumSha256);
    console.log('   Duration: ', `${durationSec} seconds\n`);

    console.log('Table Breakdown:');
    for (const item of result.tableManifest) {
      console.log(`   • ${item.tableName.padEnd(25)} : ${item.count} rows`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Backup failed:', err.message);
    process.exit(1);
  }
}

run();

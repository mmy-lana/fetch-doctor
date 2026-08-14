try {
  if (
    process.env.CI ||
    process.env.NODE_ENV === 'production' ||
    process.env.DISABLE_FETCH_DOCTOR_NOTICE ||
    process.env.SILENT
  ) {
    process.exit(0);
  }

  const cyan = '\x1b[36m';
  const bold = '\x1b[1m';
  const reset = '\x1b[0m';
  const green = '\x1b[32m';

  console.log(`\n${cyan}${bold}🩺 [fetch-doctor]: Installed!${reset}`);
  console.log(`${green}Optimized for Browser/Frontend HTTP network profiling & zombie fetch detection.${reset}\n`);
} catch {
  // Non-blocking exit on environment error
}
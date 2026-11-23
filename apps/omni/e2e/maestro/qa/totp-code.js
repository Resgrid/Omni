// The authenticator code sign-in.yaml types: QA_TOTP is `<first step>:<code>,<code>,…`, one code per 30-second step
// from the first (support/qa-departments.ts flowTotpCodes), and this picks the step the flow is in now, at the prompt.
// A code made when the flow started would be stale by then (two minutes on an Android emulator). Maestro runs scripts
// on the host, so this is the clock the codes were made with. 'none' (no authenticator) passes through.
const parts = QA_TOTP.split(':');
const codes = parts.length === 2 ? parts[1].split(',') : [];
const step = Math.floor(Date.now() / 30000) - Number(parts[0]);

output.qaTotp = codes.length ? codes[Math.min(Math.max(step, 0), codes.length - 1)] : QA_TOTP;

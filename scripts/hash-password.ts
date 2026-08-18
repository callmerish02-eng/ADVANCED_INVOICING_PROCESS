// Helper: generate a bcrypt hash from a plaintext password
// Usage: bun run scripts/hash-password.ts "<password>"
import bcrypt from 'bcryptjs';

const pwd = process.argv[2];
if (!pwd) {
  console.error('Usage: bun run scripts/hash-password.ts "<password>"');
  process.exit(1);
}
const hash = bcrypt.hashSync(pwd, 10);
console.log(hash);

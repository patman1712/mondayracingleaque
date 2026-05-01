import bcrypt from "bcryptjs";

const password = process.argv.slice(2).join(" ");
if (!password) {
  process.exitCode = 1;
} else {
  const hash = await bcrypt.hash(password, 10);
  process.stdout.write(`${hash}\n`);
}

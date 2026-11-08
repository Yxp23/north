// Creates (or resets the password of) the practice login for judges, in Supabase Auth.
//   node --env-file=.env.local scripts/seed-demo-user.mjs
// It uses the SECRET key (server only). The practice account only ever holds practice money.
// Defaults can be changed with DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD. The same values go in the README and, for the judges'
// deployment, in the DEMO_LOGIN_* settings (the login page shows them only when DEMO_MODE=1 and DEMO_DEPLOYMENT=1).
// The account keeps the id North has always used for its demo person, so the saved PayPal and history carry over.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are needed.");
const email = process.env.DEMO_LOGIN_EMAIL || "judge@north-demo.app";
const password = process.env.DEMO_LOGIN_PASSWORD || "North-Judges-2026!";
const DEMO_ID = process.env.DEMO_USER_ID || "00000000-0000-4000-8000-000000000001";

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Is there already someone with this id (or this email)?
const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listError) throw listError;
const existing = list.users.find((u) => u.id === DEMO_ID || u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { email, password, email_confirm: true });
  if (error) throw error;
  console.log(`Updated the practice login (${email}). Its id is ${existing.id}.`);
  if (existing.id !== DEMO_ID) console.log(`Note: it is NOT the old demo id (${DEMO_ID}). The old demo money and saved PayPal stay under the old id.`);
} else {
  // GoTrue accepts an explicit id when an administrator creates a user.
  const { data, error } = await admin.auth.admin.createUser({ id: DEMO_ID, email, password, email_confirm: true });
  if (error) throw error;
  console.log(`Created the practice login (${email}). Its id is ${data.user.id}.`);
  if (data.user.id !== DEMO_ID) console.log(`Note: Supabase gave it a new id, not ${DEMO_ID}. Run this script's --copy-vault step after the first login (see the README).`);
}
console.log("Reminder: switch OFF 'Allow new users to sign up' in Supabase > Authentication > Sign In / Providers. North never offers sign-up.");

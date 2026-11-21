/**
 * Create (or promote) a real administrator account.
 *   npm run create-admin -- you@bmsit.in "Your Name"
 * A strong password is generated and printed once; change it after signing in
 * on My Account → Change password.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName) {
    console.log('Usage: npm run create-admin -- you@bmsit.in "Your Name"');
    process.exit(1);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const password = `Adm!${randomBytes(9).toString("base64url")}`;

  const { data: existing } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await supabase.auth.admin.updateUserById(id, { password, app_metadata: { role: "ADMIN" } });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "ADMIN" }, user_metadata: { full_name: fullName } });
    if (error) throw error;
    id = data.user.id;
  }
  const { error } = await supabase.from("profiles").update({ role: "ADMIN", full_name: fullName, is_verified: true, is_active: true }).eq("id", id);
  if (error) throw error;
  console.log(`✔ Admin ready: ${email}`);
  console.log(`  Password (shown once): ${password}  → change it on My Account after signing in`);
  console.log("  You can now deactivate admin@campusconnect.test on Admin → Users.");
}

main().catch((e) => {
  console.error("Failed:", e.message ?? e);
  process.exit(1);
});

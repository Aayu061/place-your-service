import { getSupabaseClient } from '../lib/supabase.js';
import { logActivity } from '../services/audit.service.js';

function requiredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const email = requiredValue('PYS_BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = requiredValue('PYS_BOOTSTRAP_ADMIN_PASSWORD');
  const fullName = requiredValue('PYS_BOOTSTRAP_ADMIN_FULL_NAME');
  const phone = process.env.PYS_BOOTSTRAP_ADMIN_PHONE?.trim() || null;

  if (password.length < 12) {
    throw new Error('PYS_BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const supabase = getSupabaseClient();
  const { data: admins, error: adminCheckError } = await supabase
    .from('staff')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1);

  if (adminCheckError) throw new Error('Could not verify whether an Admin already exists.');
  if (admins?.length) throw new Error('Admin already exists; initial provisioning is closed.');

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !authData.user) {
    throw new Error('Could not create the initial Auth user. Existing Auth accounts are never modified.');
  }

  const userId = authData.user.id;
  try {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      email,
      phone,
    });
    if (profileError) throw new Error('Could not create the Admin profile.');

    const { error: staffError } = await supabase.from('staff').insert({
      profile_id: userId,
      role: 'ADMIN',
      is_active: true,
    });
    if (staffError) throw new Error('Could not assign the singleton Admin role.');
  } catch (error) {
    await supabase.from('staff').delete().eq('profile_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(userId);
    if (cleanupError) throw new Error('Admin provisioning failed and Auth-user cleanup also failed.');
    throw error;
  }

  await logActivity({
    actorProfileId: userId,
    action: 'ADMIN_BOOTSTRAP',
    entityType: 'staff',
    entityId: userId,
    details: { email, fullName },
  });

  process.stdout.write('Initial Admin provisioned. Remove the bootstrap environment values now.\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Initial Admin provisioning failed.'}\n`);
  process.exitCode = 1;
});

// LOCAL-ONLY companion to seed-local-demo.mjs. handle_new_user()'s trigger on
// auth.users (issue #232, fixed) already creates a bare profiles row per
// signed-up user; this upserts the demo-specific fields (username, bio,
// is_setup) the trigger doesn't set. Run this right after seed-local-demo.mjs.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const USERS = [
  { email: 'alex.chen@refhub.dev', username: 'alex_chen', display_name: 'Alex Chen', bio: 'ml systems researcher. transformers, optimization, scale.' },
  { email: 'priya.raman@refhub.dev', username: 'priya_raman', display_name: 'Priya Raman', bio: 'information visualization & graph drawing.' },
  { email: 'marcus.webb@refhub.dev', username: 'marcus_webb', display_name: 'Marcus Webb', bio: 'distributed systems, consensus protocols.' },
  { email: 'lin.zhou@refhub.dev', username: 'lin_zhou', display_name: 'Lin Zhou', bio: 'nlp, alignment, tokenization.' },
  { email: 'sara.kessler@refhub.dev', username: 'sara_kessler', display_name: 'Sara Kessler', bio: 'computational biology, protein structure.' },
  { email: 'tom.becker@refhub.dev', username: 'tom_becker', display_name: 'Tom Becker', bio: 'causal inference & experimentation.' },
];

const { data: users, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw new Error(listErr.message);
const idByEmail = Object.fromEntries(users.users.map((u) => [u.email, u.id]));

for (const u of USERS) {
  const user_id = idByEmail[u.email];
  if (!user_id) { console.error('missing auth user for', u.email); continue; }
  const { error } = await sb.from('profiles').upsert(
    {
      user_id,
      email: u.email,
      display_name: u.display_name,
      username: u.username,
      bio: u.bio,
      is_setup: true,
    },
    { onConflict: 'user_id' },
  );
  if (error) console.error('profile upsert failed for', u.username, error.message);
  else console.log('profile ok:', u.username, user_id);
}

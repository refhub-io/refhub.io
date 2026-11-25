// LOCAL-ONLY follow-up to seed-local-demo.mjs: adds markdown notes, an
// "important" flag (so the smart collection has something to match), inbox
// items, and a working smart-collection filter -- for showing off notes,
// tagging-adjacent features, inbox, and smart collections in the promo video.
// Run after seed-local-demo.mjs + fix-profiles.mjs.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: users, error: uErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (uErr) throw new Error(uErr.message);
const alex = users.users.find((u) => u.email === 'alex.chen@refhub.dev');
if (!alex) throw new Error('alex_chen not found - run seed-local-demo.mjs first');

const { data: papers, error: pErr } = await sb
  .from('vault_publications')
  .select('id, title, vault_id, vaults!inner(user_id)')
  .eq('vaults.user_id', alex.id);
if (pErr) throw new Error(pErr.message);

const byTitle = (t) => papers.find((p) => p.title === t);

const NOTES = {
  'Attention Is All You Need': `## why this matters

the scaled dot-product attention mechanism replaced recurrence entirely —
parallelizable, and it scales.

- no recurrence, no convolution: pure attention + feed-forward blocks
- multi-head attention lets the model attend to different representation
  subspaces at once
- positional encodings inject order since there's no recurrence to carry it

> "attention is all you need" turned out to be a pretty good bet.

see also [the annotated transformer](http://nlp.seas.harvard.edu/annotated-transformer/)
for a line-by-line walkthrough.

\`\`\`
scaled_dot_product_attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V
\`\`\``,
  'Decoupled Weight Decay Regularization': `## adamw vs adam

adam's weight decay is coupled to the gradient update through the adaptive
learning rate — **adamw decouples them**, which turns out to matter a lot
for generalization.

1. compute the adaptive gradient step as usual
2. apply weight decay directly to the weights, not through the gradient
3. the two no longer interact

most modern transformer training recipes default to this now.`,
};

let noteCount = 0;
for (const [title, notes] of Object.entries(NOTES)) {
  const paper = byTitle(title);
  if (!paper) { console.error('paper not found for notes:', title); continue; }
  const { error } = await sb.from('vault_publications').update({ notes }).eq('id', paper.id);
  if (error) throw new Error(`notes update (${title}): ${error.message}`);
  noteCount += 1;
}
console.log('notes added to', noteCount, 'papers');

const IMPORTANT_TITLES = [
  'Attention Is All You Need',
  'Adam: A Method for Stochastic Optimization',
  'Decoupled Weight Decay Regularization',
];
let importantCount = 0;
for (const title of IMPORTANT_TITLES) {
  const paper = byTitle(title);
  if (!paper) continue;
  const { error } = await sb.from('vault_publications').update({ important: true }).eq('id', paper.id);
  if (error) throw new Error(`important update (${title}): ${error.message}`);
  importantCount += 1;
}
console.log('marked important:', importantCount);

const { error: scErr } = await sb
  .from('smart_collections')
  .update({ filters: [{ id: 'f1', field: 'important', operator: 'equals', value: 'true' }] })
  .eq('user_id', alex.id)
  .eq('name', 'high priority reads');
if (scErr) throw new Error(`smart_collections filter update: ${scErr.message}`);
console.log('smart collection filter wired up');

// vault-scoped tags (tags.vault_id set), as distinct from seed-local-demo.mjs's
// user-scoped ones -- both kinds should now show up in the manage_tags sheet
// and the vault_analytics dialog's tag panel (issue #233, fixed: both read
// from VaultContentContext's `tags`, which used to only fetch vault-scoped
// rows). Add a couple here, on alex_chen's public "transformer architectures"
// vault, and tag two papers, so there's a mix of both kinds to exercise.
const { data: transformersVault, error: tvErr } = await sb
  .from('vaults')
  .select('id')
  .eq('user_id', alex.id)
  .eq('name', 'transformer architectures')
  .single();
if (tvErr) throw new Error(`transformers vault lookup: ${tvErr.message}`);

const { data: vaultTags, error: vtErr } = await sb
  .from('tags')
  .insert([
    { user_id: alex.id, vault_id: transformersVault.id, name: 'foundational', color: '#925cf0' },
    { user_id: alex.id, vault_id: transformersVault.id, name: 'scaling', color: '#26b2f2' },
  ])
  .select('id, name');
if (vtErr) throw new Error(`vault-scoped tags insert: ${vtErr.message}`);
console.log('vault-scoped tags', vaultTags.length);

const foundationalTag = vaultTags.find((t) => t.name === 'foundational');
const scalingTag = vaultTags.find((t) => t.name === 'scaling');
// deliberately NOT "Attention Is All You Need" or "Switch Transformers": those
// two already got seed-local-demo.mjs's user-scoped "foundational"/"must-read"
// tags, and "foundational" here would otherwise double up as a visually
// duplicate badge (same name, two different tag rows) on the same paper.
const bert = byTitle('BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding');
const llama = byTitle('LLaMA: Open and Efficient Foundation Language Models');
const vaultPubTagRows = [];
if (bert && foundationalTag) vaultPubTagRows.push({ vault_publication_id: bert.id, tag_id: foundationalTag.id });
if (llama && scalingTag) vaultPubTagRows.push({ vault_publication_id: llama.id, tag_id: scalingTag.id });
if (vaultPubTagRows.length) {
  const { error } = await sb.from('publication_tags').insert(vaultPubTagRows);
  if (error) throw new Error(`vault-scoped publication_tags insert: ${error.message}`);
}
console.log('vault-scoped publication_tags', vaultPubTagRows.length);

const INBOX_ITEMS = [
  {
    source_type: 'arxiv',
    source_ref: 'arXiv:2310.06825',
    parsed_fields: { title: 'Mistral 7B', authors: ['Albert Q. Jiang', 'Alexandre Sablayrolles'], year: 2023, journal: 'arXiv' },
  },
  {
    source_type: 'doi',
    source_ref: '10.1038/s41586-023-06924-6',
    parsed_fields: { title: 'Levels of AGI for Operationalizing Progress', authors: ['Meredith Ringel Morris', 'Jascha Sohl-Dickstein'], year: 2023, journal: 'arXiv' },
  },
  {
    source_type: 's2_url',
    source_ref: 'https://www.semanticscholar.org/paper/retnet',
    parsed_fields: { title: 'Retentive Network: A Successor to Transformer for Large Language Models', authors: ['Yutao Sun', 'Li Dong'], year: 2023, journal: 'arXiv' },
  },
  {
    source_type: 'manual',
    source_ref: 'manual entry',
    parsed_fields: { title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces', authors: ['Albert Gu', 'Tri Dao'], year: 2023, journal: 'arXiv' },
  },
];
const inboxRows = INBOX_ITEMS.map((it, i) => ({
  user_id: alex.id,
  status: 'pending',
  source_type: it.source_type,
  source_ref: it.source_ref,
  parsed_fields: it.parsed_fields,
  sort_order: i,
}));
const { error: inboxErr } = await sb.from('inbox_items').insert(inboxRows);
if (inboxErr) throw new Error(`inbox_items insert: ${inboxErr.message}`);
console.log('inbox_items', inboxRows.length);

console.log('\ndone.');

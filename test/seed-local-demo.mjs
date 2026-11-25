// LOCAL-ONLY seed script for the local Supabase stack (127.0.0.1:54321).
// Populates realistic demo content (6 users, 11 vaults across all visibility
// levels, 42 papers, tags, a citation graph, forks/favorites/stats) so the app
// can be exercised and screenshotted with authenticated views. Never touches
// production. Run with: node seed-local-demo.mjs (requires `supabase start`
// to be up first, and run fix-profiles.mjs afterward -- see note at bottom).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL_ = 'http://127.0.0.1:54321';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const sb = createClient(URL_, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const uid = () => randomUUID();

const USERS = [
  { email: 'alex.chen@refhub.dev', username: 'alex_chen', display_name: 'Alex Chen', bio: 'ml systems researcher. transformers, optimization, scale.' },
  { email: 'priya.raman@refhub.dev', username: 'priya_raman', display_name: 'Priya Raman', bio: 'information visualization & graph drawing.' },
  { email: 'marcus.webb@refhub.dev', username: 'marcus_webb', display_name: 'Marcus Webb', bio: 'distributed systems, consensus protocols.' },
  { email: 'lin.zhou@refhub.dev', username: 'lin_zhou', display_name: 'Lin Zhou', bio: 'nlp, alignment, tokenization.' },
  { email: 'sara.kessler@refhub.dev', username: 'sara_kessler', display_name: 'Sara Kessler', bio: 'computational biology, protein structure.' },
  { email: 'tom.becker@refhub.dev', username: 'tom_becker', display_name: 'Tom Becker', bio: 'causal inference & experimentation.' },
];
const PASSWORD = 'RefhubDemo123!';

async function createUsers() {
  const byUsername = {};
  for (const u of USERS) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: u.display_name },
    });
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
    const userId = data.user.id;
    byUsername[u.username] = userId;
    // handle_new_user()'s trigger on auth.users (issue #232, fixed) already
    // created a bare profiles row for this user; this just fills in the
    // demo-specific fields it doesn't set. fix-profiles.mjs does the same
    // thing as a safety net in case this update ever races the trigger.
    const { error: upErr } = await sb
      .from('profiles')
      .update({ username: u.username, bio: u.bio, is_setup: true })
      .eq('user_id', userId);
    if (upErr) throw new Error(`profile update ${u.username}: ${upErr.message}`);
    console.log('user', u.username, userId);
  }
  return byUsername;
}

const COLORS = ['#925cf0', '#25da67', '#ee5da6', '#26b2f2', '#fa802e'];
const colorFor = (i) => COLORS[i % COLORS.length];

const VAULTS = [
  { key: 'transformers', owner: 'alex_chen', name: 'transformer architectures', category: 'machine-learning', visibility: 'public', slug: 'transformer-architectures', abstract: 'the attention-based model family, from the original encoder-decoder to modern scaled variants.' },
  { key: 'optimization', owner: 'alex_chen', name: 'optimization theory', category: 'machine-learning', visibility: 'private' },
  { key: 'graphdrawing', owner: 'priya_raman', name: 'graph drawing & layout', category: 'visualization', visibility: 'public', slug: 'graph-drawing-layout', abstract: 'classic and modern algorithms for laying out graphs and hierarchies.' },
  { key: 'treemaps', owner: 'priya_raman', name: 'treemap variants', category: 'visualization', visibility: 'protected' },
  { key: 'consensus', owner: 'marcus_webb', name: 'distributed consensus', category: 'systems', visibility: 'private' },
  { key: 'edge', owner: 'marcus_webb', name: 'edge computing', category: 'systems', visibility: 'public', slug: 'edge-computing-survey', abstract: 'pushing compute to the network edge: surveys and foundational systems.' },
  { key: 'alignment', owner: 'lin_zhou', name: 'language model alignment', category: 'nlp', visibility: 'public', slug: 'lm-alignment', abstract: 'rlhf, preference optimization, and constitutional methods for steering llms.' },
  { key: 'tokenization', owner: 'lin_zhou', name: 'tokenization methods', category: 'nlp', visibility: 'private' },
  { key: 'protein', owner: 'sara_kessler', name: 'protein structure prediction', category: 'biology', visibility: 'public', slug: 'protein-structure-prediction', abstract: 'from co-evolution statistics to end-to-end learned folding.' },
  { key: 'genomics', owner: 'sara_kessler', name: 'single-cell genomics', category: 'biology', visibility: 'private' },
  { key: 'causal', owner: 'tom_becker', name: 'causal discovery', category: 'causal-inference', visibility: 'private' },
];

const PAPERS = {
  transformers: [
    ['Attention Is All You Need', ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'], 2017, 'NeurIPS'],
    ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', ['Jacob Devlin', 'Ming-Wei Chang'], 2019, 'NAACL'],
    ['Language Models are Few-Shot Learners', ['Tom B. Brown', 'Benjamin Mann'], 2020, 'NeurIPS'],
    ['An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale', ['Alexey Dosovitskiy', 'Lucas Beyer'], 2021, 'ICLR'],
    ['Switch Transformers: Scaling to Trillion Parameter Models', ['William Fedus', 'Barret Zoph'], 2022, 'JMLR'],
    ['LLaMA: Open and Efficient Foundation Language Models', ['Hugo Touvron', 'Thibaut Lavril'], 2023, 'arXiv'],
  ],
  optimization: [
    ['Adam: A Method for Stochastic Optimization', ['Diederik P. Kingma', 'Jimmy Ba'], 2015, 'ICLR'],
    ['On the Convergence of Adam and Beyond', ['Sashank J. Reddi', 'Satyen Kale'], 2018, 'ICLR'],
    ['Sharpness-Aware Minimization for Efficiently Improving Generalization', ['Pierre Foret', 'Ariel Kleiner'], 2021, 'ICLR'],
    ['Decoupled Weight Decay Regularization', ['Ilya Loshchilov', 'Frank Hutter'], 2019, 'ICLR'],
  ],
  graphdrawing: [
    ['Stable Treemaps via Local Moves', ['Max Sondag', 'Bettina Speckmann'], 2017, 'IEEE TVCG'],
    ['A Technique for Drawing Directed Graphs', ['Emden R. Gansner', 'Eleftherios Koutsofios'], 1993, 'IEEE TSE'],
    ['Force-Directed Graph Drawing Using Social Gravity and Scaling', ['Michael J. Bannister', 'David Eppstein'], 2012, 'GD'],
    ['Graph Drawing by Force-Directed Placement', ['Thomas M. J. Fruchterman', 'Edward M. Reingold'], 1991, 'Software: P&E'],
    ['Balloon Focus: a Seamless Multi-Focus+Context Method for Treemaps', ['Ying Tu', 'Han-Wei Shen'], 2008, 'IEEE TVCG'],
  ],
  treemaps: [
    ['Temporal Treemaps: Static Visualization of Evolving Trees', ['Wiebke Köpp', 'Tino Weinkauf'], 2018, 'IEEE TVCG'],
    ['Squarified Treemaps', ['Mark Bruls', 'Kees Huizing'], 2000, 'EuroVis'],
    ['Ordered and Quantum Treemaps', ['Benjamin B. Bederson', 'Ben Shneiderman'], 2002, 'ACM TOG'],
    ['Importance-driven visualization layouts for large time series data', ['Ming C. Hao', 'Umeshwar Dayal'], 2005, 'IEEE InfoVis'],
  ],
  consensus: [
    ['In Search of an Understandable Consensus Algorithm (Raft)', ['Diego Ongaro', 'John Ousterhout'], 2014, 'USENIX ATC'],
    ['Paxos Made Simple', ['Leslie Lamport'], 2001, 'ACM SIGACT News'],
    ['The Byzantine Generals Problem', ['Leslie Lamport', 'Robert Shostak'], 1982, 'ACM TOPLAS'],
    ['Zab: High-performance broadcast for primary-backup systems', ['Flavio P. Junqueira', 'Benjamin C. Reed'], 2011, 'DSN'],
  ],
  edge: [
    ['Edge Computing: Vision and Challenges', ['Weisong Shi', 'Jie Cao'], 2016, 'IEEE IoT Journal'],
    ['Fog Computing and Its Role in the Internet of Things', ['Flavio Bonomi', 'Rodolfo Milito'], 2012, 'MCC Workshop'],
    ['A Survey on Mobile Edge Computing', ['Yuyi Mao', 'Changsheng You'], 2017, 'IEEE Comm. Surveys'],
  ],
  alignment: [
    ['Training language models to follow instructions with human feedback', ['Long Ouyang', 'Jeff Wu'], 2022, 'NeurIPS'],
    ['Deep Reinforcement Learning from Human Preferences', ['Paul Christiano', 'Jan Leike'], 2017, 'NeurIPS'],
    ['Constitutional AI: Harmlessness from AI Feedback', ['Yuntao Bai', 'Saurav Kadavath'], 2022, 'arXiv'],
    ['Direct Preference Optimization', ['Rafael Rafailov', 'Archit Sharma'], 2023, 'NeurIPS'],
  ],
  tokenization: [
    ['Neural Machine Translation of Rare Words with Subword Units', ['Rico Sennrich', 'Barry Haddow'], 2016, 'ACL'],
    ['SentencePiece: A simple and language independent subword tokenizer', ['Taku Kudo', 'John Richardson'], 2018, 'EMNLP'],
    ['Byte Pair Encoding is Suboptimal for Language Model Pretraining', ['Kaj Bostrom', 'Greg Durrett'], 2020, 'EMNLP Findings'],
  ],
  protein: [
    ['Highly accurate protein structure prediction with AlphaFold', ['John Jumper', 'Richard Evans'], 2021, 'Nature'],
    ['Improved protein structure prediction using predicted interresidue orientations', ['Jianyi Yang', 'Ivan Anishchenko'], 2020, 'PNAS'],
    ['Evolutionary-scale prediction of atomic level protein structure with a language model', ['Zeming Lin', 'Halil Akin'], 2023, 'Science'],
  ],
  genomics: [
    ['Massively parallel digital transcriptional profiling of single cells', ['Grace X. Y. Zheng', 'Jessica M. Terry'], 2017, 'Nature Communications'],
    ['Comprehensive Integration of Single-Cell Data', ['Tim Stuart', 'Andrew Butler'], 2019, 'Cell'],
    ['SCANPY: large-scale single-cell gene expression data analysis', ['F. Alexander Wolf', 'Philipp Angerer'], 2018, 'Genome Biology'],
  ],
  causal: [
    ['Causation, Prediction, and Search', ['Peter Spirtes', 'Clark Glymour'], 2000, 'MIT Press'],
    ['Elements of Causal Inference', ['Jonas Peters', 'Dominik Janzing'], 2017, 'MIT Press'],
    ['A Linear Non-Gaussian Acyclic Model for Causal Discovery', ['Shohei Shimizu', 'Patrik O. Hoyer'], 2006, 'JMLR'],
  ],
};

// [vaultKey, headlinePaperIdx, relatedPaperIdx, relation_type]
const RELATIONS = [
  ['transformers', 1, 0, 'cites'],
  ['transformers', 2, 0, 'cites'],
  ['transformers', 3, 0, 'related'],
  ['transformers', 4, 0, 'extends'],
  ['transformers', 5, 0, 'cites'],
  ['graphdrawing', 4, 0, 'related'],
  ['graphdrawing', 2, 1, 'cites'],
  ['alignment', 0, 1, 'cites'],
  ['alignment', 3, 0, 'related'],
];

const TAGS_BY_OWNER = {
  alex_chen: [['foundational', '#925cf0'], ['must-read', '#ee5da6'], ['survey', '#26b2f2']],
  priya_raman: [['god-tier', '#25da67'], ['classic', '#fa802e']],
  marcus_webb: [['foundational', '#925cf0'], ['benchmark', '#26b2f2']],
  lin_zhou: [['must-read', '#ee5da6'], ['theory', '#925cf0']],
  sara_kessler: [['foundational', '#25da67']],
  tom_becker: [['theory', '#925cf0']],
};

async function main() {
  const users = await createUsers();

  const vaultIds = {};
  const vaultRows = VAULTS.map((v, i) => {
    const id = uid();
    vaultIds[v.key] = id;
    return {
      id,
      user_id: users[v.owner],
      name: v.name,
      description: v.abstract ?? null,
      abstract: v.abstract ?? null,
      color: colorFor(i),
      category: v.category,
      visibility: v.visibility,
      public_slug: v.slug ?? null,
    };
  });
  {
    const { error } = await sb.from('vaults').insert(vaultRows);
    if (error) throw new Error(`vaults insert: ${error.message}`);
  }
  console.log('vaults', vaultRows.length);

  const tagIds = {}; // `${owner}:${name}` -> id
  const tagRows = [];
  for (const [owner, tags] of Object.entries(TAGS_BY_OWNER)) {
    for (const [name, color] of tags) {
      const id = uid();
      tagIds[`${owner}:${name}`] = id;
      tagRows.push({ id, user_id: users[owner], name, color });
    }
  }
  {
    const { error } = await sb.from('tags').insert(tagRows);
    if (error) throw new Error(`tags insert: ${error.message}`);
  }
  console.log('tags', tagRows.length);

  const paperIds = {}; // `${vaultKey}:${idx}` -> id
  const paperRows = [];
  for (const v of VAULTS) {
    const papers = PAPERS[v.key] ?? [];
    papers.forEach(([title, authors, year, journal], idx) => {
      const id = uid();
      paperIds[`${v.key}:${idx}`] = id;
      paperRows.push({
        id,
        vault_id: vaultIds[v.key],
        title,
        authors,
        year,
        journal,
        publication_type: 'article',
        created_by: users[v.owner],
      });
    });
  }
  {
    const { error } = await sb.from('vault_publications').insert(paperRows);
    if (error) throw new Error(`vault_publications insert: ${error.message}`);
  }
  console.log('papers', paperRows.length);

  // tag a couple of papers per vault with the owner's tags
  const pubTagRows = [];
  for (const v of VAULTS) {
    const ownerTags = TAGS_BY_OWNER[v.owner] ?? [];
    if (!ownerTags.length) continue;
    const papers = PAPERS[v.key] ?? [];
    papers.forEach((_, idx) => {
      if (idx % 2 !== 0) return;
      const [tagName] = ownerTags[idx % ownerTags.length];
      pubTagRows.push({
        vault_publication_id: paperIds[`${v.key}:${idx}`],
        tag_id: tagIds[`${v.owner}:${tagName}`],
      });
    });
  }
  {
    const { error } = await sb.from('publication_tags').insert(pubTagRows);
    if (error) throw new Error(`publication_tags insert: ${error.message}`);
  }
  console.log('publication_tags', pubTagRows.length);

  const relationRows = RELATIONS.map(([vaultKey, fromIdx, toIdx, type]) => ({
    publication_id: paperIds[`${vaultKey}:${fromIdx}`],
    related_publication_id: paperIds[`${vaultKey}:${toIdx}`],
    relation_type: type,
    created_by: users[VAULTS.find((v) => v.key === vaultKey).owner],
  }));
  {
    const { error } = await sb.from('publication_relations').insert(relationRows);
    if (error) throw new Error(`publication_relations insert: ${error.message}`);
  }
  console.log('publication_relations', relationRows.length);

  const publicVaults = VAULTS.filter((v) => v.visibility === 'public');
  const statsRows = publicVaults.map((v) => ({
    vault_id: vaultIds[v.key],
    view_count: 80 + Math.floor(Math.random() * 800),
    download_count: 10 + Math.floor(Math.random() * 110),
  }));
  {
    const { error } = await sb.from('vault_stats').insert(statsRows);
    if (error) throw new Error(`vault_stats insert: ${error.message}`);
  }
  console.log('vault_stats', statsRows.length);

  const favRows = [
    { vault_id: vaultIds.transformers, user_id: users.priya_raman },
    { vault_id: vaultIds.protein, user_id: users.lin_zhou },
    { vault_id: vaultIds.graphdrawing, user_id: users.marcus_webb },
    { vault_id: vaultIds.alignment, user_id: users.sara_kessler },
    { vault_id: vaultIds.edge, user_id: users.tom_becker },
  ];
  {
    const { error } = await sb.from('vault_favorites').insert(favRows);
    if (error) throw new Error(`vault_favorites insert: ${error.message}`);
  }
  console.log('vault_favorites', favRows.length);

  // a fork: tom_becker forks priya's public graph-drawing vault
  const forkId = uid();
  {
    const { error } = await sb.from('vaults').insert({
      id: forkId,
      user_id: users.tom_becker,
      name: 'graph drawing & layout (fork)',
      description: VAULTS.find((v) => v.key === 'graphdrawing').abstract,
      color: colorFor(11),
      category: 'visualization',
      visibility: 'private',
    });
    if (error) throw new Error(`fork vault insert: ${error.message}`);
    const { error: forkErr } = await sb.from('vault_forks').insert({
      original_vault_id: vaultIds.graphdrawing,
      forked_vault_id: forkId,
      forked_by: users.tom_becker,
    });
    if (forkErr) throw new Error(`vault_forks insert: ${forkErr.message}`);
  }
  console.log('fork created');

  const { error: scErr } = await sb.from('smart_collections').insert({
    user_id: users.alex_chen,
    name: 'high priority reads',
    color: '#ee5da6',
    description: 'papers flagged important across every vault.',
    filters: [],
  });
  if (scErr) throw new Error(`smart_collections insert: ${scErr.message}`);
  console.log('smart_collections 1');

  console.log('\ndone. demo login: alex.chen@refhub.dev / ' + PASSWORD);
  console.log('NOTE: run `node fix-profiles.mjs` next to fill in demo-specific profile fields.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

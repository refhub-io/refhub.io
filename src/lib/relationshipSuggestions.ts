import type { Publication, PublicationRelation } from '@/types/database';
import { getReferences, getCitations, lookupPaperByDOI, type SSPaper } from '@/lib/semanticScholar';
import { findMatchingPublication } from '@/lib/publicationMatching';

export interface RelationshipSuggestion {
  /** the "citing" paper */
  sourcePublicationId: string;
  sourceTitle: string;
  /** the "cited" paper */
  targetPublicationId: string;
  targetTitle: string;
  discoveredVia: 'references' | 'citations';
}

export interface CitationGraph {
  references: SSPaper[];
  citations: SSPaper[];
}

/**
 * Network-only half of the engine — needs just a DOI, not a saved
 * publication id. Callers that don't have a real id yet (a paper still
 * being added) can start this the moment a DOI is known, and defer
 * buildSuggestionsFromCitationGraph until the id exists.
 */
export async function fetchCitationGraph(doi: string): Promise<CitationGraph | null> {
  const paperId = await lookupPaperByDOI(doi);
  if (!paperId) return null;

  const [references, citations] = await Promise.all([
    getReferences(paperId),
    getCitations(paperId),
  ]);

  return { references, citations };
}

function hasExistingRelation(aId: string, bId: string, existingRelations: PublicationRelation[]): boolean {
  return existingRelations.some(
    (rel) =>
      (rel.publication_id === aId && rel.related_publication_id === bId) ||
      (rel.publication_id === bId && rel.related_publication_id === aId),
  );
}

/**
 * Pure, synchronous match-and-build step — needs the paper's real id.
 * References the paper's citation graph against the vault's existing
 * publications and relations; produces only new, non-duplicate,
 * non-self candidate edges.
 */
export function buildSuggestionsFromCitationGraph(
  paper: { id: string; title: string },
  graph: CitationGraph,
  vaultPublications: Publication[],
  existingRelations: PublicationRelation[],
): RelationshipSuggestion[] {
  const suggestions: RelationshipSuggestion[] = [];
  const seenPairs = new Set<string>();

  const addSuggestion = (
    sourceId: string,
    sourceTitle: string,
    targetId: string,
    targetTitle: string,
    discoveredVia: 'references' | 'citations',
  ) => {
    if (sourceId === targetId) return;
    if (hasExistingRelation(sourceId, targetId, existingRelations)) return;

    const pairKey = [sourceId, targetId].sort().join(':');
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    suggestions.push({ sourcePublicationId: sourceId, sourceTitle, targetPublicationId: targetId, targetTitle, discoveredVia });
  };

  for (const referenced of graph.references) {
    const match = findMatchingPublication(referenced, vaultPublications);
    if (match) addSuggestion(paper.id, paper.title, match.id, match.title, 'references');
  }

  for (const citing of graph.citations) {
    const match = findMatchingPublication(citing, vaultPublications);
    if (match) addSuggestion(match.id, match.title, paper.id, paper.title, 'citations');
  }

  return suggestions;
}

export async function findRelationshipSuggestions(
  paper: { id: string; doi: string | null; title: string },
  vaultPublications: Publication[],
  existingRelations: PublicationRelation[],
): Promise<RelationshipSuggestion[]> {
  if (!paper.doi) return [];

  const graph = await fetchCitationGraph(paper.doi);
  if (!graph) return [];

  return buildSuggestionsFromCitationGraph(paper, graph, vaultPublications, existingRelations);
}

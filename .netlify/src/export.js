function generateBibtexKey(publication) {
  if (publication.bibtex_key) {
    return publication.bibtex_key;
  }

  const firstAuthor = publication.authors?.[0] || "unknown";
  const lastName = firstAuthor.split(" ").pop()?.toLowerCase() || "unknown";
  const year = publication.year || "nd";
  const titleWord =
    publication.title?.split(" ")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || "untitled";

  return `${lastName}${year}${titleWord}`;
}

function publicationToBibtex(publication) {
  const fields = [];
  const mapping = [
    ["title", publication.title],
    ["author", publication.authors?.length ? publication.authors.join(" and ") : null],
    ["year", publication.year],
    ["journal", publication.journal],
    ["volume", publication.volume],
    ["number", publication.issue],
    ["pages", publication.pages],
    ["doi", publication.doi],
    ["url", publication.url],
    ["abstract", publication.abstract],
    ["booktitle", publication.booktitle],
    ["chapter", publication.chapter],
    ["edition", publication.edition],
    ["editor", publication.editor?.length ? publication.editor.join(" and ") : null],
    ["howpublished", publication.howpublished],
    ["institution", publication.institution],
    ["organization", publication.organization],
    ["publisher", publication.publisher],
    ["school", publication.school],
    ["series", publication.series],
    ["type", publication.type],
    ["eid", publication.eid],
    ["isbn", publication.isbn],
    ["issn", publication.issn],
    ["keywords", publication.keywords?.length ? publication.keywords.join(", ") : null],
  ];

  for (const [field, value] of mapping) {
    if (value !== null && value !== undefined && value !== "") {
      fields.push(`  ${field} = {${value}}`);
    }
  }

  const type = publication.publication_type || "article";
  const key = generateBibtexKey(publication);

  return `@${type}{${key},\n${fields.join(",\n")}\n}`;
}

export function serializeVaultExport(format, payload) {
  if (format === "bibtex") {
    return {
      contentType: "text/plain; charset=utf-8",
      body: payload.publications.map(publicationToBibtex).join("\n\n"),
      extension: "bib",
    };
  }

  return {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload, null, 2),
    extension: "json",
  };
}

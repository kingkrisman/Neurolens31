import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURED_BNB_QUERIES,
  OPEN_LIBRARY_FIELDS,
  SPARQL_TIMEOUT_MS,
  bnbSparqlQuery,
  bnbToReaderText,
  fromOpenLibrary,
  openLibraryCoverUrl,
  openLibrarySearchUrl,
  openLibraryWorkUrl,
  sparqlRegexEscape,
  type BnbBook,
} from "./bnb.ts";

describe("British National Bibliography", () => {
  it("builds a lean Open Library search without a BNB identifier gate", () => {
    const featured = openLibrarySearchUrl("");
    assert.match(featured, /openlibrary\.org\/search\.json/);
    assert.match(featured, /subject%3Aliterature/);
    assert.match(featured, new RegExp(OPEN_LIBRARY_FIELDS.split(",").join("%2C")));
    assert.doesNotMatch(featured, /id_british_national_bibliography%3A\*/);
    assert.doesNotMatch(featured, /sort=editions/);

    const darwin = openLibrarySearchUrl("darwin");
    assert.match(darwin, /darwin/);
    assert.doesNotMatch(darwin, /id_british_national_bibliography%3A\*/);
    assert.doesNotMatch(darwin, /isbn/);
  });

  it("builds Open Library work and cover urls", () => {
    assert.equal(openLibraryWorkUrl("/works/OL66554W"), "https://openlibrary.org/works/OL66554W.json");
    assert.equal(openLibraryWorkUrl("works/OL66554W"), "https://openlibrary.org/works/OL66554W.json");
    assert.equal(openLibraryCoverUrl(7153600, "L"), "https://covers.openlibrary.org/b/id/7153600-L.jpg");
  });

  it("escapes SPARQL regex metacharacters and quotes", () => {
    assert.equal(sparqlRegexEscape('pride "prejudice"'), 'pride \\"prejudice\\"');
    assert.equal(sparqlRegexEscape("C++ (notes)"), String.raw`C\\+\\+ \\(notes\\)`);
    const query = bnbSparqlQuery('pride "prejudice"');
    assert.match(query, /dcterms:title \?title/);
    assert.match(query, /FILTER regex\(str\(\?title\), "pride \\"prejudice\\"", "i"\)/);
    assert.doesNotMatch(query, /pride "prejudice"/);
    assert.doesNotMatch(query, /LCASE\(CONTAINS/);
    const optionalAt = query.indexOf("OPTIONAL");
    const filterAt = query.indexOf("FILTER regex");
    assert.ok(filterAt > 0 && optionalAt > filterAt);
  });

  it("keeps SPARQL on a short timeout so Open Library is not blocked", () => {
    assert.equal(SPARQL_TIMEOUT_MS, 1500);
  });

  it("keeps featured catalog chips for the library", () => {
    assert.deepEqual([...FEATURED_BNB_QUERIES], ["Darwin", "Austen", "Shakespeare", "Dickens"]);
  });

  it("maps Open Library docs without requiring a BNB identifier", () => {
    const books = fromOpenLibrary([
      { key: "/works/OL1W", title: "Untitled duplicate" },
      {
        key: "/works/OL66554W",
        title: "Pride and Prejudice",
        author_name: ["Jane Austen"],
        first_publish_year: 1813,
        cover_i: 14348537,
        id_british_national_bibliography: ["GBB118273"],
      },
      { key: "/works/OL1W", title: "Untitled duplicate" },
    ]);
    assert.equal(books[0]?.title, "Pride and Prejudice");
    assert.equal(books[0]?.source, "open-library");
    assert.equal(books[0]?.bnbId, "GBB118273");
    assert.equal(books[1]?.bnbId, "");
    assert.equal(books.length, 2);
  });

  it("renders a bibliographic record for the reader", () => {
    const book: BnbBook = {
      id: "/works/OL66554W",
      title: "Pride and Prejudice",
      authors: ["Jane Austen"],
      bnbId: "GBB118273",
      year: 1813,
      subjects: ["Courtship", "England"],
      firstSentence: "It is a truth universally acknowledged.",
      source: "open-library",
    };
    const text = bnbToReaderText(book);
    assert.match(text, /Pride and Prejudice/);
    assert.match(text, /Jane Austen/);
    assert.match(text, /GBB118273/);
    assert.match(text, /British National Bibliography/);
    assert.match(text, /It is a truth/);
  });
});

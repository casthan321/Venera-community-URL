import assert from "assert";
import { validateSourcePolicy } from "./validate-index.mjs";

const entry = { fileName: "fixture.js", key: "fixture" };

function source(extra = "") {
  return `class Fixture extends ComicSource {
  search = {
    optionList: [],
    load: async () => ({ comics: [], maxPage: 1 }),
  };
  comic = {
    loadInfo: async () => null,
    loadEp: async () => ({ images: [] }),
  };
  ${extra}
}`;
}

function explore(page, attribute, additionalViewMore = "") {
  return `explore = [{
    title: "Fixture Discover",
    type: "multiPartPage",
    load: async () => {
      const harmlessPattern = /[{}]/;
      const harmlessTemplate = \`{fixture}\`;
      return [{
        title: String(harmlessPattern) + harmlessTemplate,
        comics: [],
        viewMore: {
          page: "${page}",
          attributes: { ${attribute}: "fixture" },
        },
        ${additionalViewMore}
      }];
    },
  }];`;
}

function exploreWithType(type, result) {
  return `explore = [{
    title: "Fixture Discover",
    type: "${type}",
    load: async () => (${result}),
  }];`;
}

assert.doesNotThrow(() => validateSourcePolicy(source(), entry));
assert.doesNotThrow(() => validateSourcePolicy(source(explore("category", "category")), entry));
assert.doesNotThrow(() => validateSourcePolicy(source(explore("search", "keyword")), entry));
assert.doesNotThrow(() => validateSourcePolicy(
  source(exploreWithType("singlePageWithMultiPart", "{ Hot: [], Latest: [] }")),
  entry,
));
assert.doesNotThrow(() => validateSourcePolicy(
  source(exploreWithType("multiPageComicList", "{ comics: [], maxPage: 1 }")),
  entry,
));
assert.doesNotThrow(() => validateSourcePolicy(
  source(exploreWithType("mixed", "{ data: [], maxPage: 1 }")),
  entry,
));
assert.doesNotThrow(() => validateSourcePolicy(
  source(explore("category", "category", "second: { viewMore: { page: 'search', attributes: { keyword: 'fixture' } } },")),
  entry,
));

assert.throws(
  () => validateSourcePolicy(source(exploreWithType("unsupported", "{}")), entry),
  /unsupported page type/,
);

assert.throws(
  () => validateSourcePolicy(source(explore("category", "keyword")), entry),
  /attributes\.category/,
);
assert.throws(
  () => validateSourcePolicy(source(explore("search", "category")), entry),
  /attributes\.keyword/,
);
assert.throws(
  () => validateSourcePolicy(source(explore("home", "keyword")), entry),
  /page must be category or search/,
);
assert.throws(
  () => validateSourcePolicy(
    source(explore("search", "keyword", "second: { viewMore: { page: 'search', attributes: { category: 'wrong' } } },")),
    entry,
  ),
  /attributes\.keyword/,
);

const secretLiterals = [
  `password = "hunter2";`,
  `settings = { clientSecret: "client-secret-value" };`,
  `settings = { token: "literal-page-token" };`,
  `settings = { authToken: "literal-auth-token" };`,
  `headers = { Authorization: "Bearer abcdefghijklmnop" };`,
  `headers = { "Cookie": "session=abcdefghijkl" };`,
  `Cookie = "session=abcdefghijkl";`,
  `header = "Bearer abcdefghijklmnop";`,
  `header = "Basic YXV0bzpwYXNzd29yZA==";`,
  `token = "ghp_abcdefghijklmnopqrstuvwxyz";`,
  `token = "github_pat_abcdefghijklmnopqrstuvwxyz";`,
  `baseUrl = "https://auto:password@example.com";`,
];
for (const literal of secretLiterals) {
  assert.throws(
    () => validateSourcePolicy(source(literal), entry),
    /possible embedded credential/,
    literal,
  );
}

assert.doesNotThrow(() => validateSourcePolicy(
  source("headers = { Authorization: authHeader, Cookie: cookieHeader };"),
  entry,
));
assert.throws(
  () => validateSourcePolicy(source(), { fileName: "fixture.js", key: "tencent_comics" }),
  /must keep its account integration/,
);

console.log("Validated capability and secret-scan fixtures.");

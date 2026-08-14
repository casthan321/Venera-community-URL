class TencentComics extends ComicSource {
  name = "腾讯动漫";
  key = "tencent_comics";
  version = "1.0.1";
  minAppVersion = "1.6.0";
  url = "https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/tencent_comics.js";

  baseUrl = "https://m.ac.qq.com";
  searchUrlTemplate = "https://m.ac.qq.com/search/result?word={keyword}&page={page}&pageSize=10&style=items";

  requestHeaders(targetUrl, referer) {
    const headers = {
      "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 VeneraSourceForge/1.0",
      "Referer": referer || this.baseUrl,
    };

    return headers;
  }

  applyPage(url, page) {
    return String(url).replace("{page}", String(page));
  }

  toAbsolute(value, base) {
    if (!value) return "";
    value = String(value).trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    const baseValue = String(base || this.baseUrl);
    const origin = baseValue.match(/^(https?:\/\/[^/]+)/i)?.[1] || this.baseUrl;
    if (value.startsWith("/")) return origin + value;
    const cleanBase = baseValue.split("#")[0].split("?")[0];
    const folder = cleanBase.endsWith("/") ? cleanBase : cleanBase.slice(0, cleanBase.lastIndexOf("/") + 1);
    const stack = (folder.slice(origin.length) + value).split("/");
    const output = [];
    for (const part of stack) {
      if (part === "..") output.pop();
      else if (part && part !== ".") output.push(part);
    }
    return origin + "/" + output.join("/");
  }

  readAttribute(element, names) {
    if (!element) return "";
    for (const name of names) {
      const value = element.attributes?.[name];
      if (value) return String(value).trim();
    }
    return "";
  }

  readValue(document, selector, attribute) {
    const element = document.querySelector(selector);
    if (!element) return "";
    if (attribute) return this.readAttribute(element, [attribute]);
    return String(element.text || "").trim();
  }

  async loadDocument(url, referer) {
    const res = await Network.get(url, this.requestHeaders(url, referer));
    if (res.status < 200 || res.status >= 400) throw "Invalid status code: " + res.status;
    return new HtmlDocument(res.body);
  }

  parseCards(document, pageUrl) {
    const comics = [];
    const seen = new Set();
    for (const card of document.querySelectorAll("li.comic-item")) {
      const link = card.querySelector("a.comic-link");
      const titleNode = card.querySelector("strong.comic-title");
      const coverNode = card.querySelector("img.cover-image");
      const id = this.toAbsolute(this.readAttribute(link, ["href"]), pageUrl);
      const title = String(titleNode?.text || "").trim();
      const cover = this.toAbsolute(this.readAttribute(coverNode, ["src", "data-src"]), pageUrl);
      if (id && title && cover && !seen.has(id)) {
        seen.add(id);
        comics.push(new Comic({ id: id, title: title, cover: cover }));
      }
    }
    return comics;
  }

  evaluateSafeArithmetic(expression) {
    if (!expression || expression.length > 256) throw "Invalid nonce expression length";
    let index = 0;
    const skip = () => {
      while (/\s/.test(expression[index] || "")) index += 1;
    };
    const expect = (value) => {
      skip();
      if (!expression.startsWith(value, index)) throw "Unsupported nonce expression";
      index += value.length;
    };
    const primary = () => {
      skip();
      if (expression[index] === "(") {
        index += 1;
        const value = conditional();
        skip();
        if (expression[index] !== ")") throw "Invalid nonce parentheses";
        index += 1;
        return value;
      }

      if (expression.startsWith("Math.pow", index)) {
        index += "Math.pow".length;
        expect("(");
        const base = conditional();
        expect(",");
        const exponent = conditional();
        expect(")");
        return Math.pow(base, exponent);
      }
      if (expression.startsWith("Math.round", index)) {
        index += "Math.round".length;
        expect("(");
        const value = conditional();
        expect(")");
        return Math.round(value);
      }
      if (expression.startsWith("parseInt", index)) {
        index += "parseInt".length;
        expect("(");
        const value = conditional();
        expect(")");
        return Math.trunc(value);
      }

      for (const documentExpression of [
        "document.getElementsByTagName('html')",
        'document.getElementsByTagName("html")',
      ]) {
        if (expression.startsWith(documentExpression, index)) {
          index += documentExpression.length;
          return 1;
        }
      }

      if (expression[index] === "'" || expression[index] === '"') {
        const quote = expression[index];
        const end = expression.indexOf(quote, index + 1);
        if (end < 0) throw "Invalid nonce string";
        const literal = expression.slice(index + 1, end);
        if (!/^[A-Za-z0-9]{1,16}$/.test(literal)) throw "Unsupported nonce string";
        index = end + 1;
        if (expression.startsWith(".charCodeAt()", index)) {
          index += ".charCodeAt()".length;
          return literal.charCodeAt(0);
        }
        if (expression.startsWith(".substring", index)) {
          index += ".substring".length;
          expect("(");
          const start = conditional();
          skip();
          let result;
          if (expression[index] === ",") {
            index += 1;
            const endIndex = conditional();
            expect(")");
            result = literal.substring(Math.trunc(start), Math.trunc(endIndex));
          } else {
            expect(")");
            result = literal.substring(Math.trunc(start));
          }
          const numeric = Number(result);
          if (!Number.isFinite(numeric)) throw "Invalid nonce substring result";
          return numeric;
        }
        throw "Unsupported nonce string method";
      }

      const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) throw "Invalid nonce number";
      index += match[0].length;
      return Number(match[0]);
    };
    const unary = () => {
      skip();
      const operator = expression[index];
      if (operator === "+" || operator === "-" || operator === "!" || operator === "~") {
        index += 1;
        const value = unary();
        if (operator === "+") return value;
        if (operator === "-") return -value;
        if (operator === "~") return ~value;
        return value ? 0 : 1;
      }
      return primary();
    };
    const multiply = () => {
      let value = unary();
      while (true) {
        skip();
        const operator = expression[index];
        if (operator !== "*" && operator !== "/" && operator !== "%") return value;
        index += 1;
        const right = unary();
        value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
      }
    };
    const addition = () => {
      let value = multiply();
      while (true) {
        skip();
        const operator = expression[index];
        if (operator !== "+" && operator !== "-") return value;
        index += 1;
        const right = multiply();
        value = operator === "+" ? value + right : value - right;
      }
    };
    const comparison = () => {
      let value = addition();
      while (true) {
        skip();
        const operator = ["===", "!==", "<=", ">=", "==", "!=", "<", ">"].find((item) =>
          expression.startsWith(item, index),
        );
        if (!operator) return value;
        index += operator.length;
        const right = addition();
        if (operator === "<") value = value < right ? 1 : 0;
        else if (operator === "<=") value = value <= right ? 1 : 0;
        else if (operator === ">") value = value > right ? 1 : 0;
        else if (operator === ">=") value = value >= right ? 1 : 0;
        else if (operator === "!=" || operator === "!==") value = value !== right ? 1 : 0;
        else value = value === right ? 1 : 0;
      }
    };
    const bitwiseAnd = () => {
      let value = comparison();
      while (true) {
        skip();
        if (expression[index] !== "&" || expression[index + 1] === "&") return value;
        index += 1;
        value &= comparison();
      }
    };
    const conditional = () => {
      const condition = bitwiseAnd();
      skip();
      if (expression[index] !== "?") return condition;
      index += 1;
      const whenTrue = conditional();
      expect(":");
      const whenFalse = conditional();
      return condition ? whenTrue : whenFalse;
    };
    const result = conditional();
    skip();
    if (
      index !== expression.length ||
      !Number.isFinite(result) ||
      !Number.isSafeInteger(result) ||
      result < 0 ||
      result > 255
    ) throw "Unsafe nonce expression";
    return result;
  }

  extractNonce(script) {
    const assignmentPattern = /window\s*\[\s*(["'])([a-z]+)\1\s*\+\s*(["'])([a-z]+)\3\s*\]\s*=/gi;
    let assignment = null;
    let matchAssignment;
    while ((matchAssignment = assignmentPattern.exec(script))) {
      if ((matchAssignment[2] + matchAssignment[4]).toLowerCase() === "nonce") {
        assignment = matchAssignment;
        break;
      }
    }
    if (!assignment) throw "Chapter nonce is missing";
    const start = assignment.index + assignment[0].length;
    const rest = script.slice(start);
    const lineEnd = rest.search(/[;\r\n]/);
    const expression = (lineEnd < 0 ? rest : rest.slice(0, lineEnd)).trim();
    if (!expression || expression.length > 2048) throw "Invalid chapter nonce length";
    const parts = /\(\s*\+\s*eval\(\s*(["'])(.*?)\1\s*\)\s*\)\s*\.toString\(\s*\)|(["'])([A-Za-z0-9]*)\3/g;
    let nonce = "";
    let cursor = 0;
    let match;
    while ((match = parts.exec(expression))) {
      const separator = expression.slice(cursor, match.index).trim();
      if (cursor === 0 ? separator !== "" : separator !== "+") throw "Unknown chapter nonce content";
      nonce += match[2] !== undefined ? String(this.evaluateSafeArithmetic(match[2])) : match[4];
      cursor = parts.lastIndex;
    }
    if (expression.slice(cursor).trim() || !/^[A-Za-z0-9]{8,256}$/.test(nonce)) {
      throw "Chapter nonce cannot be parsed";
    }
    return nonce;
  }

  decodeChapterPayload(value) {
    const lines = String(value || "").trim().split(/\r?\n/);
    if (lines.length < 2 || !lines[0]) throw "Chapter response is incomplete";
    const nonce = this.extractNonce(lines.slice(1).join("\n"));
    const encoded = lines[0].split("");
    const tokens = nonce.match(/\d+[a-zA-Z]+/g) || [];
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const position = parseInt(tokens[index], 10) & 255;
      const letters = tokens[index].replace(/\d+/g, "");
      if (encoded.slice(position, position + letters.length).join("") !== letters) {
        throw "Chapter nonce noise check failed";
      }
      encoded.splice(position, letters.length);
    }
    const cleaned = encoded.join("");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
      throw "Invalid chapter Base64";
    }
    return JSON.parse(Convert.decodeUtf8(Convert.decodeBase64(cleaned)));
  }

  async loadChapterPayload(epId, comicId) {
    const url = epId + (epId.includes("?") ? "&" : "?") + "style=plain";
    const res = await Network.get(url, this.requestHeaders(url, comicId));
    if (res.status < 200 || res.status >= 400) throw "Invalid chapter status: " + res.status;
    const payload = this.decodeChapterPayload(res.body);
    const chapter = payload.chapter || {};
    if (
      !chapter.canRead ||
      Number(chapter.is_app_chapter) === 1 ||
      Number(chapter.vip_state) === 2 ||
      Number(chapter.vipStatus) === 2
    ) {
      throw "该章节为 APP 专属或付费受限内容";
    }
    return payload;
  }

  isImageBytes(value) {
    if (!value || value.byteLength < 3) return false;
    const bytes = new Uint8Array(value);
    return (
      (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
      (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||
      (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57)
    );
  }

  settings = {
    source_self_test: {
      title: "源可用性自检",
      type: "callback",
      buttonText: "运行搜索→分类→详情→公开章节→首图测试",
      callback: async () => this.runSelfTest(),
    },
  };

  async runSelfTest() {
    try {
      const searchResult = await this.search.load("斗罗大陆", [], 1);
      if (!searchResult.comics?.length) throw "搜索没有返回漫画";
      const first = searchResult.comics[0];
      const thumbnailConfig = this.comic.onThumbnailLoad(first.cover);
      const thumbnailResponse = await Network.fetchBytes(
        thumbnailConfig.method || "GET",
        thumbnailConfig.url || first.cover,
        thumbnailConfig.headers || {},
        new ArrayBuffer(0),
      );
      if (thumbnailResponse.status < 200 || thumbnailResponse.status >= 400 || !this.isImageBytes(thumbnailResponse.body)) {
        throw "搜索封面不是有效图片";
      }
      const categoryResult = await this.categoryComics.load("https://m.ac.qq.com/category/listAll/type/tm/rank/pgv?page={page}&pageSize=15&style=items", null, [], 1);
      if (!categoryResult.comics?.length) throw "分类没有返回漫画";
      const info = await this.comic.loadInfo(first.id);
      if (!info.title || !info.cover || !info.chapters || info.chapters.size === 0) throw "详情或公开章节不完整";
      let epId = "";
      let pages = null;
      let chapterError = "没有找到网页公开可读章节";
      for (const candidateEpId of Array.from(info.chapters.keys()).slice(0, 8)) {
        try {
          const candidatePages = await this.comic.loadEp(first.id, candidateEpId);
          if (candidatePages.images?.length) {
            epId = candidateEpId;
            pages = candidatePages;
            break;
          }
        } catch (error) {
          chapterError = String(error);
        }
      }
      if (!pages || !pages.images?.length) throw chapterError;
      const imageConfig = this.comic.onImageLoad(pages.images[0], first.id, epId);
      const imageResponse = await Network.fetchBytes(
        imageConfig.method || "GET",
        imageConfig.url || pages.images[0],
        imageConfig.headers || {},
        new ArrayBuffer(0),
      );
      if (imageResponse.status < 200 || imageResponse.status >= 400 || !this.isImageBytes(imageResponse.body)) {
        throw "正文首图不是有效图片";
      }
      UI.showMessage("自检通过：搜索、分类、详情、公开章节与首图均可用");
      return "ok";
    } catch (error) {
      UI.showMessage("自检失败：" + error);
      throw error;
    }
  }

  search = {
    load: async (keyword, options, page) => {
      const url = this.searchUrlTemplate
        .replace("{keyword}", encodeURIComponent(keyword))
        .replace("{page}", String(page));
      const document = await this.loadDocument(url, this.baseUrl + "/search/index");
      try {
        const comics = this.parseCards(document, url);
        let maxPage = page;
        if (comics.length > 0) {
          const nextUrl = this.searchUrlTemplate
            .replace("{keyword}", encodeURIComponent(keyword))
            .replace("{page}", String(page + 1));
          const nextDocument = await this.loadDocument(nextUrl, url);
          try {
            if (this.parseCards(nextDocument, nextUrl).length > 0) maxPage = page + 1;
          } finally {
            nextDocument.dispose();
          }
        }
        return { comics: comics, maxPage: maxPage };
      } finally {
        document.dispose();
      }
    },
    optionList: [],
  };

  category = {
    title: "腾讯动漫-tencent_comics-分类",
    parts: [{"name":"热门排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/tm/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"独家","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/dj/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"完结","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/wj/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rm/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/na/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xh/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"热血","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rx/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xy/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"少女","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/sv/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/hm/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kh/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/db/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"校园","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"都市","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/ds/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/zy/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kb/rank/pgv?page={page}&pageSize=15&style=items","param":null}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/yg/rank/pgv?page={page}&pageSize=15&style=items","param":null}}}]},{"name":"更新排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/tm/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"独家","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/dj/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"完结","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/wj/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rm/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/na/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xh/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"热血","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rx/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xy/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"少女","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/sv/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/hm/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kh/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/db/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"校园","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"都市","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/ds/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/zy/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kb/rank/upt?page={page}&pageSize=15&style=items","param":null}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/yg/rank/upt?page={page}&pageSize=15&style=items","param":null}}}]},{"name":"收藏排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/tm/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"独家","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/dj/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"完结","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/wj/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rm/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/na/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xh/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"热血","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/rx/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/xy/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"少女","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/sv/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/hm/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kh/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/db/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"校园","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"都市","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/ds/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/zy/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/kb/rank/coll?page={page}&pageSize=15&style=items","param":null}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"https://m.ac.qq.com/category/listAll/type/yg/rank/coll?page={page}&pageSize=15&style=items","param":null}}}]}],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const url = this.applyPage(category, page);
      const document = await this.loadDocument(url, this.baseUrl + "/category/index");
      try {
        const comics = this.parseCards(document, url);
        let maxPage = page;
        if (comics.length > 0) {
          const nextUrl = this.applyPage(category, page + 1);
          const nextDocument = await this.loadDocument(nextUrl, url);
          try {
            if (this.parseCards(nextDocument, nextUrl).length > 0) maxPage = page + 1;
          } finally {
            nextDocument.dispose();
          }
        }
        return { comics: comics, maxPage: maxPage };
      } finally {
        document.dispose();
      }
    },
    optionList: [],
  };

  comic = {
    loadInfo: async (id) => {
      const document = await this.loadDocument(id, this.baseUrl);
      try {
        const title = this.readValue(document, "h1.top-title", "") || this.readValue(document, "h1", "");
        const cover = this.toAbsolute(this.readValue(document, "img.head-cover", "src"), id);
        const description = this.readValue(document, ".head-info-desc", "");
        const chapters = new Map();
        for (const chapter of document.querySelectorAll("a.chapter-link")) {
          if (chapter.querySelector(".in-app")) continue;
          const chapterUrl = this.toAbsolute(this.readAttribute(chapter, ["href"]), id);
          const chapterTitle = String(chapter.text || "").trim();
          if (chapterUrl && chapterTitle && !chapters.has(chapterUrl)) chapters.set(chapterUrl, chapterTitle);
        }
        if (!title || !cover) throw "Comic detail selector no longer matches";
        if (chapters.size === 0) throw "No public web-readable chapters";
        return new ComicDetails({
          title: title,
          cover: cover,
          description: description,
          tags: {},
          chapters: chapters,
          url: id,
        });
      } finally {
        document.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const payload = await this.loadChapterPayload(epId, comicId);
      const images = [];
      for (const picture of payload.picture || []) {
        const imageUrl = this.toAbsolute(picture.url || "", epId);
        if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
      }
      if (images.length === 0) throw "Public chapter has no images";
      return { images: images };
    },

    onThumbnailLoad: (url) => ({
      url: url,
      method: "GET",
      headers: this.requestHeaders(url, this.baseUrl),
    }),

    onImageLoad: (url, comicId, epId) => ({
      url: url,
      method: "GET",
      headers: this.requestHeaders(url, epId || comicId || this.baseUrl),
    }),
  };
}

class TencentComics extends ComicSource {
  name = "腾讯动漫";
  key = "tencent_comics";
  version = "1.1.1";
  minAppVersion = "1.6.0";
  url = "https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/tencent_comics.js";

  baseUrl = "https://m.ac.qq.com";
  desktopBaseUrl = "https://ac.qq.com";
  desktopUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
  accountProbeComicId = "531490";
  searchUrlTemplate = "https://m.ac.qq.com/search/result?word={keyword}&page={page}&pageSize=10&style=items";
  listPageCache = {};

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

  readServerMaxPage(document, pageSize) {
    const text = Array.from(document.querySelectorAll("script,[class*='page'],[class*='total'],[class*='count']"))
      .map((node) => String(node.text || "")).join("\n").slice(0, 1000000);
    const pageLabel = text.match(/(?:page\s*)?\d+\s*(?:\/|of)\s*(\d{1,5})|(?:\u5171|\u603b\u8ba1)\s*(\d{1,5})\s*\u9875/i);
    const labeled = Number(pageLabel?.[1] || pageLabel?.[2] || 0);
    if (Number.isSafeInteger(labeled) && labeled > 0) return labeled;
    const totalMatch = text.match(/(?:["']?total(?:Num|Count|_count)?["']?)\s*[:=]\s*["']?(\d{1,9})/i);
    const sizeMatch = text.match(/(?:["']?pageSize["']?)\s*[:=]\s*["']?(\d{1,5})/i);
    const total = Number(totalMatch?.[1] || 0);
    const size = Number(sizeMatch?.[1] || pageSize || 0);
    if (Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(size) && size > 0) {
      return Math.max(1, Math.ceil(total / size));
    }
    return 0;
  }

  async resolveListMaxPage(cacheKey, document, currentPage, pageSize, loadPage) {
    const exact = this.readServerMaxPage(document, pageSize);
    if (exact) {
      this.listPageCache[cacheKey] = exact;
      return exact;
    }
    if (this.listPageCache[cacheKey]) return this.listPageCache[cacheKey];
    const inspect = async (probePage) => {
      let probeDocument;
      try {
        probeDocument = await loadPage(probePage);
        const comics = this.parseCards(probeDocument, "");
        const probeExact = this.readServerMaxPage(probeDocument, Math.max(pageSize, comics.length));
        return { valid: comics.length > 0, exact: probeExact };
      } catch (_) {
        return { valid: false, exact: 0 };
      } finally {
        if (probeDocument) probeDocument.dispose();
      }
    };
    let lower = Math.max(1, Number(currentPage) || 1);
    let upper = 0;
    let candidate = Math.max(2, lower + 1);
    for (let attempt = 0; attempt < 13 && candidate <= 9999; attempt += 1) {
      const probe = await inspect(candidate);
      if (probe.exact) {
        this.listPageCache[cacheKey] = probe.exact;
        return probe.exact;
      }
      if (!probe.valid) {
        upper = candidate;
        break;
      }
      lower = candidate;
      if (candidate === 9999) break;
      candidate = Math.min(9999, candidate * 2);
    }
    for (let attempt = 0; upper > lower + 1 && attempt < 14; attempt += 1) {
      const middle = Math.floor((lower + upper) / 2);
      const probe = await inspect(middle);
      if (probe.exact) {
        this.listPageCache[cacheKey] = probe.exact;
        return probe.exact;
      }
      if (probe.valid) lower = middle;
      else upper = middle;
    }
    this.listPageCache[cacheKey] = lower;
    return lower;
  }

  apiHeaders(targetUrl, referer, isForm) {
    const headers = this.requestHeaders(targetUrl, referer);
    if (String(targetUrl || "").startsWith(this.desktopBaseUrl + "/")) {
      headers["User-Agent"] = this.desktopUserAgent;
    }
    headers["Accept"] = "application/json,text/plain,*/*";
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["Cache-Control"] = "no-cache";
    headers["Pragma"] = "no-cache";
    if (isForm) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    return headers;
  }

  parseTencentJson(response, context) {
    if (response.status < 200 || response.status >= 400) {
      throw context + "请求失败（HTTP " + response.status + "）";
    }
    let payload;
    try {
      payload = JSON.parse(String(response.body || ""));
    } catch (error) {
      throw context + "返回的不是有效 JSON";
    }
    if (!payload || typeof payload !== "object") throw context + "返回内容为空";
    return payload;
  }

  isLoginStatus(status) {
    const value = String(status == null ? "" : status);
    return value === "-99" || value === "-97";
  }

  loginRequiredMessage() {
    return "腾讯动漫账号未登录或登录状态已失效，请在源设置中重新点击“登录”";
  }

  apiFailure(context, payload) {
    const message = String(payload?.msg || payload?.message || payload?.data || payload?.status || "未知错误");
    return context + "失败：" + message.slice(0, 160);
  }

  normalizeComicId(value) {
    const text = String(value == null ? "" : value).trim();
    const match = text.match(/\/(?:comic\/index|Comic\/comicInfo)\/id\/(\d+)(?:[/?#]|$)/i) || text.match(/^(\d+)$/);
    if (!match || !/^[1-9]\d{0,11}$/.test(match[1])) throw "腾讯动漫漫画 ID 无效";
    return match[1];
  }

  mobileComicUrl(comicId) {
    return this.baseUrl + "/comic/index/id/" + this.normalizeComicId(comicId);
  }

  isCollected(value) {
    const normalized = String(value == null ? "" : value).toLowerCase();
    return value === true || normalized === "1" || normalized === "true";
  }

  async getComicUserInfo(comicId, allowLoggedOut) {
    const numericId = this.normalizeComicId(comicId);
    const referer = this.mobileComicUrl(numericId);
    const url = this.baseUrl + "/comic/getUserInfo?id=" + numericId;
    const response = await Network.get(url, this.apiHeaders(url, referer, false));
    const payload = this.parseTencentJson(response, "腾讯动漫账号探针");
    if (String(payload.status) === "2" && payload.data && typeof payload.data === "object") {
      return payload.data;
    }
    if (this.isLoginStatus(payload.status)) {
      if (allowLoggedOut) return null;
      throw this.loginRequiredMessage();
    }
    throw this.apiFailure("腾讯动漫账号探针", payload);
  }

  async probeTencentAccount() {
    const data = await this.getComicUserInfo(this.accountProbeComicId, false);
    const token = String(data.token || "").trim();
    if (!token) throw "腾讯动漫账号探针未返回收藏校验 token，请重新登录";
    return { data: data, token: token };
  }

  async showAccountStatus() {
    try {
      await this.probeTencentAccount();
      UI.showMessage("腾讯动漫账号状态正常；可同步单一云收藏夹。网页没有可验证的签到接口，因此本源不提供签到。");
      return "ok";
    } catch (error) {
      UI.showMessage("腾讯动漫账号检查失败：" + error);
      throw error;
    }
  }

  async readFavoriteState(comicId) {
    try {
      const data = await this.getComicUserInfo(comicId, true);
      return data ? this.isCollected(data.is_coll) : false;
    } catch (error) {
      return false;
    }
  }

  async getUserCollection() {
    const url = this.desktopBaseUrl + "/MyPersonalCenter/getUserCollection";
    const response = await Network.get(url, this.apiHeaders(url, this.desktopBaseUrl + "/", false));
    const payload = this.parseTencentJson(response, "腾讯动漫收藏列表");
    if (this.isLoginStatus(payload.status)) throw this.loginRequiredMessage();
    if (String(payload.status) !== "2") throw this.apiFailure("腾讯动漫收藏列表", payload);
    const entries = Array.isArray(payload.data) ? payload.data : payload.data?.list;
    if (!Array.isArray(entries)) throw "腾讯动漫收藏列表格式已变化";
    return entries;
  }

  async loadFavoriteComics(page) {
    const entries = await this.getUserCollection();
    const comics = [];
    const seen = new Set();
    const pageSize = 12;
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
    const pageEntries = entries.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    for (const entry of pageEntries) {
      let numericId;
      try {
        numericId = this.normalizeComicId(entry?.id ?? entry?.comicId);
      } catch (error) {
        continue;
      }
      let title = String(entry?.title || entry?.comicTitle || "").trim();
      let cover = this.toAbsolute(entry?.coverUrl || entry?.cover || "", this.desktopBaseUrl + "/");
      if (!title || !cover) {
        const detailUrl = this.mobileComicUrl(numericId);
        const document = await this.loadDocument(detailUrl, this.baseUrl);
        try {
          if (!title) title = this.readValue(document, "h1.top-title", "") || this.readValue(document, "h1", "");
          if (!cover) cover = this.toAbsolute(this.readValue(document, "img.head-cover", "src"), detailUrl);
        } finally {
          document.dispose();
        }
      }
      if (!title || !cover || seen.has(numericId)) continue;
      seen.add(numericId);
      comics.push(new Comic({ id: this.mobileComicUrl(numericId), title: title, cover: cover }));
    }
    const maxPage = Math.max(1, Math.ceil(entries.length / pageSize));
    return {
      comics: comics,
      maxPage: maxPage,
    };
  }

  formEncode(entries) {
    return entries
      .map((entry) => encodeURIComponent(String(entry[0])) + "=" + encodeURIComponent(String(entry[1])))
      .join("&");
  }

  async setFavoriteState(comicId, isAdding) {
    const numericId = this.normalizeComicId(comicId);
    const probe = await this.probeTencentAccount();
    const before = await this.getComicUserInfo(numericId, false);
    if (this.isCollected(before.is_coll) === isAdding) return;

    const url = isAdding
      ? this.desktopBaseUrl + "/MyPersonalCenter/addUserCollection"
      : this.desktopBaseUrl + "/Ajax/delCollection/comic_id/" + numericId;
    const bodyEntries = isAdding
      ? [["tokenKey", probe.token], ["comicId", numericId], ["seqNo", "0"]]
      : [["tokenKey", probe.token]];
    const response = await Network.post(
      url,
      this.apiHeaders(url, this.desktopBaseUrl + "/Comic/comicInfo/id/" + numericId, true),
      this.formEncode(bodyEntries),
    );
    const payload = this.parseTencentJson(response, isAdding ? "添加腾讯动漫收藏" : "删除腾讯动漫收藏");
    if (this.isLoginStatus(payload.status)) throw this.loginRequiredMessage();
    const accepted = isAdding
      ? String(payload.status) === "2" || String(payload.status) === "3"
      : String(payload.status) === "1";
    if (!accepted) throw this.apiFailure(isAdding ? "添加腾讯动漫收藏" : "删除腾讯动漫收藏", payload);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const after = await this.getComicUserInfo(numericId, false);
      if (this.isCollected(after.is_coll) === isAdding) return;
    }
    throw (isAdding ? "添加" : "删除") + "腾讯动漫收藏后，官网回读状态未确认";
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
    if (Number(chapter.is_app_chapter) > 0) throw "该章节为腾讯动漫 APP 专属内容";
    if (chapter.canRead !== true) throw "腾讯动漫服务器未授予该账号网页阅读权限";
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
    tencent_account_status: {
      title: "账号",
      type: "callback",
      buttonText: "检查",
      callback: async () => this.showAccountStatus(),
    },
    source_self_test: {
      title: "连接测试",
      type: "callback",
      buttonText: "测试",
      callback: async () => this.runSelfTest(),
    },
  };

  async runSelfTest() {
    try {
      await this.probeTencentAccount();
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
      const categoryResult = await this.categoryComics.load("条漫", "https://m.ac.qq.com/category/listAll/type/tm/rank/pgv?page={page}&pageSize=15&style=items", [], 1);
      if (!categoryResult.comics?.length) throw "分类没有返回漫画";
      const exploreParts = await this.explore[0].load();
      if (
        !exploreParts || Array.isArray(exploreParts) ||
        Object.keys(exploreParts).length < 3 ||
        Object.keys(exploreParts).slice(0, 3).some((title) => !exploreParts[title]?.length)
      ) throw "首页热门、更新或收藏分区为空";
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
      UI.showMessage("自检通过：账号 Cookie、搜索、分类、发现、详情、服务器授权章节与首图均可用");
      return "ok";
    } catch (error) {
      UI.showMessage("自检失败：" + error);
      throw error;
    }
  }

  account = {
    loginWithWebview: {
      url: "https://m.ac.qq.com/Home/login?ret_url=https%3A%2F%2Fm.ac.qq.com%2F%3Fvenera_login_success%3D1",
      checkStatus: (url, title) => String(url || "") === "https://m.ac.qq.com/?venera_login_success=1",
      onLoginSuccess: () => UI.showMessage("网页登录已返回腾讯动漫；请用“账号状态”确认 Cookie 是否生效"),
    },
    logout: () => {
      Network.deleteCookies("https://m.ac.qq.com");
      Network.deleteCookies("https://ac.qq.com");
      try {
        if (typeof this.deleteData === "function") this.deleteData("_localStorage");
      } catch (error) {
      }
    },
    registerWebsite: null,
  };

  favorites = {
    multiFolder: false,
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      await this.setFavoriteState(comicId, Boolean(isAdding));
      return "ok";
    },
    loadComics: async (page, folder) => this.loadFavoriteComics(page),
    singleFolderForSingleComic: false,
    isOldToNewSort: false,
  };
  search = {
    load: async (keyword, options, page) => {
      const url = this.searchUrlTemplate
        .replace("{keyword}", encodeURIComponent(keyword))
        .replace("{page}", String(page));
      const document = await this.loadDocument(url, this.baseUrl + "/search/index");
      try {
        const comics = this.parseCards(document, url);
        const maxPage = await this.resolveListMaxPage(
          "search:" + String(keyword || ""),
          document,
          page,
          Math.max(1, comics.length),
          async (probePage) => this.loadDocument(
            this.searchUrlTemplate.replace("{keyword}", encodeURIComponent(keyword)).replace("{page}", String(probePage)),
            url,
          ),
        );
        return { comics: comics, maxPage: maxPage };
      } finally {
        document.dispose();
      }
    },
    optionList: [],
  };

  category = {
    title: "腾讯动漫 · 分类",
    parts: [{"name":"热门排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"条漫","param":"https://m.ac.qq.com/category/listAll/type/tm/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"独家","target":{"page":"category","attributes":{"category":"独家","param":"https://m.ac.qq.com/category/listAll/type/dj/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"完结","target":{"page":"category","attributes":{"category":"完结","param":"https://m.ac.qq.com/category/listAll/type/wj/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"日漫","param":"https://m.ac.qq.com/category/listAll/type/rm/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"恋爱","param":"https://m.ac.qq.com/category/listAll/type/na/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"玄幻","param":"https://m.ac.qq.com/category/listAll/type/xh/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"热血","target":{"page":"category","attributes":{"category":"热血","param":"https://m.ac.qq.com/category/listAll/type/rx/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"悬疑","param":"https://m.ac.qq.com/category/listAll/type/xy/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"少女","target":{"page":"category","attributes":{"category":"少女","param":"https://m.ac.qq.com/category/listAll/type/sv/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"韩漫","param":"https://m.ac.qq.com/category/listAll/type/hm/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"科幻","param":"https://m.ac.qq.com/category/listAll/type/kh/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"逗比","param":"https://m.ac.qq.com/category/listAll/type/db/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"校园","target":{"page":"category","attributes":{"category":"校园","param":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"都市","target":{"page":"category","attributes":{"category":"都市","param":"https://m.ac.qq.com/category/listAll/type/ds/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"治愈","param":"https://m.ac.qq.com/category/listAll/type/zy/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"恐怖","param":"https://m.ac.qq.com/category/listAll/type/kb/rank/pgv?page={page}&pageSize=15&style=items"}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"妖怪","param":"https://m.ac.qq.com/category/listAll/type/yg/rank/pgv?page={page}&pageSize=15&style=items"}}}]},{"name":"更新排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"条漫","param":"https://m.ac.qq.com/category/listAll/type/tm/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"独家","target":{"page":"category","attributes":{"category":"独家","param":"https://m.ac.qq.com/category/listAll/type/dj/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"完结","target":{"page":"category","attributes":{"category":"完结","param":"https://m.ac.qq.com/category/listAll/type/wj/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"日漫","param":"https://m.ac.qq.com/category/listAll/type/rm/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"恋爱","param":"https://m.ac.qq.com/category/listAll/type/na/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"玄幻","param":"https://m.ac.qq.com/category/listAll/type/xh/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"热血","target":{"page":"category","attributes":{"category":"热血","param":"https://m.ac.qq.com/category/listAll/type/rx/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"悬疑","param":"https://m.ac.qq.com/category/listAll/type/xy/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"少女","target":{"page":"category","attributes":{"category":"少女","param":"https://m.ac.qq.com/category/listAll/type/sv/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"韩漫","param":"https://m.ac.qq.com/category/listAll/type/hm/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"科幻","param":"https://m.ac.qq.com/category/listAll/type/kh/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"逗比","param":"https://m.ac.qq.com/category/listAll/type/db/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"校园","target":{"page":"category","attributes":{"category":"校园","param":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"都市","target":{"page":"category","attributes":{"category":"都市","param":"https://m.ac.qq.com/category/listAll/type/ds/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"治愈","param":"https://m.ac.qq.com/category/listAll/type/zy/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"恐怖","param":"https://m.ac.qq.com/category/listAll/type/kb/rank/upt?page={page}&pageSize=15&style=items"}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"妖怪","param":"https://m.ac.qq.com/category/listAll/type/yg/rank/upt?page={page}&pageSize=15&style=items"}}}]},{"name":"收藏排序","type":"fixed","categories":[{"label":"条漫","target":{"page":"category","attributes":{"category":"条漫","param":"https://m.ac.qq.com/category/listAll/type/tm/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"独家","target":{"page":"category","attributes":{"category":"独家","param":"https://m.ac.qq.com/category/listAll/type/dj/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"完结","target":{"page":"category","attributes":{"category":"完结","param":"https://m.ac.qq.com/category/listAll/type/wj/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"日漫","target":{"page":"category","attributes":{"category":"日漫","param":"https://m.ac.qq.com/category/listAll/type/rm/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"恋爱","target":{"page":"category","attributes":{"category":"恋爱","param":"https://m.ac.qq.com/category/listAll/type/na/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"玄幻","target":{"page":"category","attributes":{"category":"玄幻","param":"https://m.ac.qq.com/category/listAll/type/xh/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"热血","target":{"page":"category","attributes":{"category":"热血","param":"https://m.ac.qq.com/category/listAll/type/rx/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"悬疑","target":{"page":"category","attributes":{"category":"悬疑","param":"https://m.ac.qq.com/category/listAll/type/xy/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"少女","target":{"page":"category","attributes":{"category":"少女","param":"https://m.ac.qq.com/category/listAll/type/sv/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"韩漫","target":{"page":"category","attributes":{"category":"韩漫","param":"https://m.ac.qq.com/category/listAll/type/hm/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"科幻","target":{"page":"category","attributes":{"category":"科幻","param":"https://m.ac.qq.com/category/listAll/type/kh/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"逗比","target":{"page":"category","attributes":{"category":"逗比","param":"https://m.ac.qq.com/category/listAll/type/db/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"校园","target":{"page":"category","attributes":{"category":"校园","param":"https://m.ac.qq.com/category/listAll/type/qcxy/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"都市","target":{"page":"category","attributes":{"category":"都市","param":"https://m.ac.qq.com/category/listAll/type/ds/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"治愈","target":{"page":"category","attributes":{"category":"治愈","param":"https://m.ac.qq.com/category/listAll/type/zy/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"恐怖","target":{"page":"category","attributes":{"category":"恐怖","param":"https://m.ac.qq.com/category/listAll/type/kb/rank/coll?page={page}&pageSize=15&style=items"}}},{"label":"妖怪","target":{"page":"category","attributes":{"category":"妖怪","param":"https://m.ac.qq.com/category/listAll/type/yg/rank/coll?page={page}&pageSize=15&style=items"}}}]}],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const sourceUrl = String(param || category || "");
      const url = this.applyPage(sourceUrl, page);
      const document = await this.loadDocument(url, this.baseUrl + "/category/index");
      try {
        const comics = this.parseCards(document, url);
        const maxPage = await this.resolveListMaxPage(
          "category:" + sourceUrl,
          document,
          page,
          Math.max(1, comics.length),
          async (probePage) => this.loadDocument(this.applyPage(sourceUrl, probePage), url),
        );
        return { comics: comics, maxPage: maxPage };
      } finally {
        document.dispose();
      }
    },
    optionList: [],
  };

  explore = [
    {
      title: "腾讯动漫 · 首页",
      type: "singlePageWithMultiPart",
      load: async () => {
        const categoryParts = Array.from(this.category.parts || []).slice(0, 3);
        if (categoryParts.length < 3) throw "腾讯动漫发现页缺少热门、更新或收藏分类";
        const output = {};
        for (const part of categoryParts) {
          const entry = part.categories?.[0];
          const categoryLabel = entry?.target?.attributes?.category;
          const categoryUrl = entry?.target?.attributes?.param;
          if (!categoryUrl) throw "腾讯动漫发现页分类入口无效";
          const result = await this.categoryComics.load(categoryLabel, categoryUrl, [], 1);
          if (!result.comics?.length) throw "腾讯动漫发现页“" + part.name + "”为空";
          output[part.name] = result.comics.slice(0, 12);
        }
        return output;
      },
    },
  ];

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
        const isFavorite = await this.readFavoriteState(id);
        return new ComicDetails({
          title: title,
          cover: cover,
          description: description,
          tags: {},
          chapters: chapters,
          isFavorite: isFavorite,
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

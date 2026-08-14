class Noymanga extends ComicSource {
  name = "NoyManga";
  key = "noymanga";
  version = "1.0.1";
  minAppVersion = "1.6.0";
  url = "https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/noymanga.js";

  baseUrl = "https://noymanga.com";
  apiBaseUrl = "https://noymanga.com";
  imageBaseUrl = "https://img.noymanga.com";
  userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 VeneraSourceForge/1.0";

  apiHeaders(contentType) {
    const headers = {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
      "Origin": this.baseUrl,
      "User-Agent": this.userAgent,
      "Referer": this.baseUrl + "/",
    };
    if (contentType) headers["Content-Type"] = contentType;
    return headers;
  }

  imageHeaders() {
    return {
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
      "User-Agent": this.userAgent,
      "Referer": this.baseUrl + "/",
    };
  }

  formEncode(entries) {
    return entries.map((entry) =>
      encodeURIComponent(String(entry[0])) + "=" + encodeURIComponent(String(entry[1])),
    ).join("&");
  }

  loginRequiredMessage() {
    return "尚未登录 NoyManga：请先在源设置中点“网页登录”，登录完成后再运行 Level 3 自检。无需手动提取令牌。";
  }

  parseJsonResponse(response, context) {
    if (response.status === 401 || response.status === 403) throw this.loginRequiredMessage();
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
    const status = payload.status == null ? "" : String(payload.status).toLowerCase();
    if (status && status !== "ok") {
      const message = String(payload.msg || payload.message || status);
      if (
        status === "unauthorized" ||
        status === "nologin" ||
        status === "no_login" ||
        status === "login" ||
        /login|登入|登录|權限|权限/i.test(message)
      ) throw this.loginRequiredMessage();
      throw context + "失败：" + message;
    }
    return payload;
  }

  async getJson(path, context) {
    const response = await Network.get(this.apiBaseUrl + path, this.apiHeaders(""));
    return this.parseJsonResponse(response, context);
  }

  async postForm(path, entries, context) {
    const response = await Network.post(
      this.apiBaseUrl + path,
      this.apiHeaders("application/x-www-form-urlencoded"),
      this.formEncode(entries),
    );
    return this.parseJsonResponse(response, context);
  }

  async assertLoggedIn() {
    const response = await Network.post(
      this.apiBaseUrl + "/api/v3/userinfo",
      this.apiHeaders("application/x-www-form-urlencoded"),
      "",
    );
    if (response.status === 401 || response.status === 403) throw this.loginRequiredMessage();
    if (response.status < 200 || response.status >= 400) {
      throw "账号探针请求失败（HTTP " + response.status + "）";
    }
    let payload;
    try {
      payload = JSON.parse(String(response.body || ""));
    } catch (error) {
      throw "账号探针返回的不是有效 JSON";
    }
    if (payload.status !== "ok" || !payload.userinfo || typeof payload.userinfo !== "object") {
      throw this.loginRequiredMessage();
    }
    return true;
  }

  normalizePositiveId(value, label, allowZero) {
    let text = String(value == null ? "" : value).trim();
    const mangaMatch = text.match(/\/manga\/(\d+)(?:[/?#]|$)/);
    const readerMatch = text.match(/\/reader\/\d+\/(\d+)(?:[/?#]|$)/);
    if (mangaMatch) text = mangaMatch[1];
    else if (readerMatch) text = readerMatch[1];
    if (!/^\d+$/.test(text)) throw label + "不是有效数字";
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) {
      throw label + "超出有效范围";
    }
    return String(number);
  }

  imageUrl(bid, cid, page) {
    const bookId = this.normalizePositiveId(bid, "漫画 ID", false);
    const chapterId = this.normalizePositiveId(cid, "章节 ID", true);
    const pageNumber = Number(page);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 20000) {
      throw "图片页码超出有效范围";
    }
    if (chapterId === "0") return this.imageBaseUrl + "/" + bookId + "/" + pageNumber + ".webp";
    return this.imageBaseUrl + "/" + bookId + "/" + chapterId + "/" + pageNumber + ".webp";
  }

  searchCover(item) {
    const source = String(item.source || "").trim();
    if (/^https?:\/\//i.test(source)) return source;
    const bid = this.normalizePositiveId(item.id, "搜索结果 ID", false);
    return this.imageBaseUrl + "/" + bid + "/m1.webp";
  }

  categoryCover(item) {
    const bid = this.normalizePositiveId(item.Bid, "分类结果 ID", false);
    return this.imageBaseUrl + "/" + bid + "/m1.webp";
  }

  parseSearchComics(payload) {
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const comics = [];
    const seen = new Set();
    for (const item of rows) {
      try {
        const id = this.normalizePositiveId(item.id, "搜索结果 ID", false);
        const title = String(item.name || "").trim();
        if (!title || seen.has(id)) continue;
        seen.add(id);
        comics.push(new Comic({
          id: id,
          title: title,
          cover: this.searchCover(item),
          subtitle: String(item.author || "").trim(),
        }));
      } catch (error) {
      }
    }
    return comics;
  }

  parseCategoryComics(payload) {
    const rows = Array.isArray(payload.info) ? payload.info : [];
    const comics = [];
    const seen = new Set();
    for (const item of rows) {
      try {
        const id = this.normalizePositiveId(item.Bid, "分类结果 ID", false);
        const title = String(item.Bookname || "").trim();
        if (!title || seen.has(id)) continue;
        seen.add(id);
        comics.push(new Comic({
          id: id,
          title: title,
          cover: this.categoryCover(item),
          subtitle: String(item.Author || "").trim(),
        }));
      } catch (error) {
      }
    }
    return comics;
  }

  maxPage(total, currentPage) {
    const count = Number(total);
    const page = Math.max(1, Number(currentPage) || 1);
    if (!Number.isFinite(count) || count < 1) return page;
    return Math.max(page, Math.ceil(count / 20));
  }

  decodeCategory(value) {
    const parts = String(value || "new|").split("|");
    const allowedSorts = ["new", "views", "favorites", "rating"];
    const sort = allowedSorts.includes(parts[0]) ? parts[0] : "new";
    const finished = parts[1] === "true" || parts[1] === "false" ? parts[1] : "";
    return { sort: sort, finished: finished };
  }

  normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
      return value.split(/[,，、|/\s]+/).map((item) => item.trim()).filter((item) => item.length > 0);
    }
    return [];
  }

  flattenChapters(chapterPayload) {
    const result = [];
    const seen = new Set();
    const chapters = chapterPayload && typeof chapterPayload === "object" ? chapterPayload : {};
    const categories = Array.isArray(chapters.categories) ? chapters.categories : [];
    const data = chapters.data && typeof chapters.data === "object" ? chapters.data : {};
    const appendRows = (rows) => {
      if (!Array.isArray(rows)) return;
      for (const chapter of rows) {
        try {
          const id = this.normalizePositiveId(chapter.id, "章节 ID", false);
          if (seen.has(id)) continue;
          seen.add(id);
          result.push({
            id: id,
            name: String(chapter.name || ("章节 " + id)).trim(),
            sort: Number(chapter.sort) || result.length,
          });
        } catch (error) {
        }
      }
    };
    for (const category of categories) appendRows(data[String(category.id)]);
    if (result.length === 0) {
      for (const categoryId of Object.keys(data)) appendRows(data[categoryId]);
    }
    result.sort((left, right) => left.sort - right.sort);
    return result;
  }

  detailCover(info) {
    const bid = this.normalizePositiveId(info.Bid, "漫画 ID", false);
    return this.imageBaseUrl + "/" + bid + "/m1.webp";
  }

  isImageBytes(value) {
    if (!value || value.byteLength < 3) return false;
    const bytes = new Uint8Array(value);
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const gif = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
    const webp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    const avif = bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 && bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66;
    return jpeg || png || gif || webp || avif;
  }

  async assertImage(config, label) {
    const response = await Network.fetchBytes(
      config.method || "GET",
      config.url,
      config.headers || {},
      config.data || new ArrayBuffer(0),
    );
    if (response.status < 200 || response.status >= 400 || !this.isImageBytes(response.body)) {
      throw label + "不是有效图片（HTTP " + response.status + "）";
    }
  }

  settings = {
    source_self_test: {
      title: "源可用性 Level 3 自检",
      type: "callback",
      buttonText: "运行账号→搜索→分类→详情→章节→图片全链路测试",
      callback: async () => this.runSelfTest(),
    },
  };

  async runSelfTest() {
    try {
      await this.assertLoggedIn();
      const searchResult = await this.search.load("魔法少女", [], 1);
      if (!searchResult.comics || searchResult.comics.length === 0) throw "搜索没有返回漫画";

      const categoryResult = await this.categoryComics.load("new|", null, [], 1);
      if (!categoryResult.comics || categoryResult.comics.length === 0) throw "分类没有返回漫画";

      let selected = null;
      let info = null;
      let detailError = "搜索结果没有可读详情";
      for (const candidate of searchResult.comics.slice(0, 8)) {
        try {
          const candidateInfo = await this.comic.loadInfo(candidate.id);
          if (candidateInfo.title && candidateInfo.cover && candidateInfo.chapters && candidateInfo.chapters.size > 0) {
            selected = candidate;
            info = candidateInfo;
            break;
          }
        } catch (error) {
          detailError = String(error);
        }
      }
      if (!selected || !info) throw detailError;

      let pages = null;
      let epId = "";
      let chapterError = "详情中没有可读章节";
      for (const candidateEpId of Array.from(info.chapters.keys()).slice(0, 12)) {
        try {
          const candidatePages = await this.comic.loadEp(selected.id, candidateEpId);
          if (candidatePages.images && candidatePages.images.length > 0) {
            pages = candidatePages;
            epId = candidateEpId;
            break;
          }
        } catch (error) {
          chapterError = String(error);
        }
      }
      if (!pages || !pages.images || pages.images.length === 0) throw chapterError;

      await this.assertImage(this.comic.onThumbnailLoad(info.cover), "详情封面");
      await this.assertImage(this.comic.onImageLoad(pages.images[0], selected.id, epId), "正文首图");
      UI.showMessage("Level 3 自检通过：Cookie、搜索、分类、详情、章节、封面与正文首图均可用。");
      return "ok";
    } catch (error) {
      UI.showMessage("Level 3 自检失败：" + error);
      throw error;
    }
  }

  account = {
    loginWithWebview: {
      url: "https://noymanga.com/login",
      checkStatus: (url, title) => {
        const value = String(url || "").split("#")[0].split("?")[0].replace(/\/$/, "");
        const sameOrigin = value === this.baseUrl || value.startsWith(this.baseUrl + "/");
        const path = sameOrigin ? value.slice(this.baseUrl.length) : "";
        return sameOrigin && path !== "/login" && !path.startsWith("/login/");
      },
      onLoginSuccess: () => {
        UI.showMessage("登录完成，Cookie 已自动接管；请回到源设置运行 Level 3 自检。");
      },
    },
    logout: () => Network.deleteCookies(this.baseUrl),
    registerWebsite: null,
  };

  search = {
    load: async (keyword, options, page) => {
      const pageNumber = Math.max(1, Number(page) || 1);
      const payload = await this.postForm("/api/v4/search/fetch", [
        ["value", String(keyword || "").trim()],
        ["mode", "default"],
        ["sort", ""],
        ["type", "book"],
        ["page", pageNumber],
        ["finished", ""],
      ], "搜索");
      return {
        comics: this.parseSearchComics(payload),
        maxPage: this.maxPage(payload.count, pageNumber),
      };
    },
    optionList: [],
  };

  category = {
    title: "NoyManga-noymanga-分类",
    parts: [
      {
        name: "排序",
        type: "fixed",
        categories: [
          { label: "最新", target: { page: "category", attributes: { category: "new|", param: null } } },
          { label: "最多浏览", target: { page: "category", attributes: { category: "views|", param: null } } },
          { label: "最多收藏", target: { page: "category", attributes: { category: "favorites|", param: null } } },
          { label: "最高评分", target: { page: "category", attributes: { category: "rating|", param: null } } },
        ],
      },
      {
        name: "连载状态",
        type: "fixed",
        categories: [
          { label: "连载", target: { page: "category", attributes: { category: "new|false", param: null } } },
          { label: "完结", target: { page: "category", attributes: { category: "new|true", param: null } } },
        ],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const pageNumber = Math.max(1, Number(page) || 1);
      const config = this.decodeCategory(category);
      const payload = await this.postForm("/api/b1/booklist", [
        ["page", pageNumber],
        ["sort", config.sort],
        ["finished", config.finished],
      ], "分类");
      return {
        comics: this.parseCategoryComics(payload),
        maxPage: this.maxPage(payload.len, pageNumber),
      };
    },
    optionList: [],
  };

  comic = {
    loadInfo: async (id) => {
      const requestedBid = this.normalizePositiveId(id, "漫画 ID", false);
      const payload = await this.getJson("/api/v4/book/" + requestedBid, "漫画详情");
      if (!payload.book || !payload.book.info) throw "漫画详情字段缺失";
      const info = payload.book.info;
      const bid = this.normalizePositiveId(info.Bid == null ? requestedBid : info.Bid, "漫画 ID", false);
      const title = String(info.Bookname || "").trim();
      if (!title) throw "漫画标题字段缺失";

      const flattened = this.flattenChapters(payload.chapters);
      const chapters = new Map();
      if (Number(info.Mode) === 0) {
        chapters.set("0", "全本");
      } else {
        for (const chapter of flattened) chapters.set(chapter.id, chapter.name);
      }
      if (chapters.size === 0) throw "漫画没有可读章节";

      const author = String(info.Author || "").trim();
      const tagValues = [];
      for (const value of [info.Ptag, info.Pname, info.Otag]) {
        for (const tag of this.normalizeStringList(value)) {
          if (!tagValues.includes(tag)) tagValues.push(tag);
        }
      }
      const tags = {};
      if (author) tags["作者"] = [author];
      if (tagValues.length > 0) tags["标签"] = tagValues;

      const description = String(
        info.Description || info.description || info.Introduction || info.introduction || info.Intro || "",
      ).trim();
      return new ComicDetails({
        title: title,
        cover: this.detailCover({ Bid: bid }),
        description: description,
        author: author,
        tags: tags,
        chapters: chapters,
        url: this.baseUrl + "/manga/" + bid,
      });
    },

    loadEp: async (comicId, epId) => {
      const bid = this.normalizePositiveId(comicId, "漫画 ID", false);
      const cid = this.normalizePositiveId(epId, "章节 ID", true);
      const chapter = await this.getJson("/api/v4/book/detail/" + bid + "/" + cid, "章节正文");
      const chapterInfo = chapter.chapter && typeof chapter.chapter === "object" ? chapter.chapter : {};
      const thisChapter = chapterInfo["this"] && typeof chapterInfo["this"] === "object" ? chapterInfo["this"] : {};
      const data = chapter.data && typeof chapter.data === "object" ? chapter.data : {};
      const rawCount = thisChapter.count == null ? data.count : thisChapter.count;
      const count = Number(rawCount);
      if (!Number.isSafeInteger(count) || count < 1 || count > 20000) throw "章节页数字段无效";
      const images = [];
      for (let page = 1; page <= count; page += 1) images.push(this.imageUrl(bid, cid, page));
      return { images: images };
    },

    onThumbnailLoad: (url) => ({
      url: url,
      method: "GET",
      headers: this.imageHeaders(),
    }),

    onImageLoad: (url, comicId, epId) => ({
      url: url,
      method: "GET",
      headers: this.imageHeaders(),
    }),
  };
}

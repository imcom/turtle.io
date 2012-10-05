/**
 * Request handler
 * 
 * @param  {Object} req HTTP(S) request Object
 * @param  {Object} res HTTP(S) response Object
 * @return {Object}     Instance
 */
factory.prototype.request = function (res, req) {
	var self    = this,
	    host    = req.headers.host.indexOf(":") > -1 ? (/(.*)?:/.exec(req.headers.host)[1]) : req.headers.host,
	    parsed  = url.parse(req.url, true),
	    method  = REGEX_GET.test(req.method) ? "get" : req.method.toLowerCase(),
	    error   = function (err) {
	    	if (typeof err !== "undefined") self.log(err, true, true);
	    	self.respond(res, req, messages.ERROR_APPLICATION, codes.ERROR_APPLICATION);
	    },
	    path    = [],
	    handled = false,
	    port    = this.config.port,
	    count, handle, nth, root;

	if (!this.config.vhosts.hasOwnProperty(host)) return error();

	root = this.config.root + "/" + this.config.vhosts[host];

	if (!parsed.hasOwnProperty("host"))     parsed.host     = req.headers.host;
	if (!parsed.hasOwnProperty("protocol")) parsed.protocol = "http:";

	// Handles the request after determining the path
	handle = function (path, url) {
		var allow = allows(req.url),
		    del   = allowed("DELETE", req.url),
		    post  = allowed("POST", req.url),
		    mimetype;

		handled = true;
		url     = parsed.protocol + "//" + req.headers.host.replace(/:.*/, "") + ":" + port + url;

		if (self.config.debug) self.log("[" + req.method + "] " + url);

		fs.exists(path, function (exists) {
			switch (true) {
				case !exists && method === "post":
					allowed(req.method, req.url) ? self.write(path, res, req) : self.respond(res, req, messages.NOT_ALLOWED, codes.NOT_ALLOWED, {"Allow": allow});
					break;
				case !exists:
					self.respond(res, req, messages.NOT_FOUND, codes.NOT_FOUND, (post ? {"Allow": "POST"} : undefined));
					break;
				case !allowed(method, req.url):
					self.respond(res, req, messages.NOT_ALLOWED, codes.NOT_ALLOWED, {"Allow": allow});
					break;
				default:
					if (!/\/$/.test(req.url)) allow = allow.explode().remove("POST").join(", ");
					switch (method) {
						case "delete":
							fs.unlink(path, function (err) {
								if (err) error(err);
								else self.respond(res, req, messages.NO_CONTENT, codes.NO_CONTENT);
							});
							break;
						case "get":
						case "head":
						case "options":
							mimetype = mime.lookup(path);
							if (req.method.toLowerCase() === "get") {
								fs.stat(path, function (err, data) {
									var size = data.size;

									fs.readFile(path, function (err, data) {
										if (err) error(err);
										else self.respond(res, req, data, codes.SUCCESS, {"Allow" : allow, "Content-Length": size, "Content-Type": mimetype});
									});
								});
							}
							else self.respond(res, req, null, codes.SUCCESS, {"Allow" : allow, "Content-Type": mimetype});
							break;
						case "put":
							self.write(path, res, req);
							break;
						default:
							self.respond(res, req, (del ? messages.CONFLICT : messages.ERROR_APPLICATION), (del ? codes.CONFLICT : codes.ERROR_APPLICATION), {"Allow": allow});
					}
			}
		});
	};

	if (!/\/$/.test(parsed.pathname)) handle(root + parsed.pathname, parsed.pathname);
	else {
		nth   = this.config.index.length;
		count = 0;
		this.config.index.each(function (i) {
			fs.exists(root + parsed.pathname + i, function (exists) {
				if (exists && !handled) handle(root + parsed.pathname + i, parsed.pathname + i);
				else if (!exists && ++count === nth) self.respond(res, req, messages.NOT_FOUND, codes.NOT_FOUND, (allowed("POST", req.url) ? {"Allow": "POST"} : undefined));
			});
		});
	}

	return this;
};
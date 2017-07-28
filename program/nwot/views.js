/*
	All the functions that control the server and return data.
	
	module.exports.yourworld			| (GET) The default page used for worlds. (POST) Writes characters to the database
	module.exports.home					| (GET) The home page (not a world)
	module.exports.response_404			| (GET) 404 page, meaning a page is not found
	module.exports.login				| (GET) the login page. (POST) logs in to an account and returns a page
	module.exports.logout				| (GET) logs the account out by deleting the cookies from the client and database
	module.exports.register				| (GET) The register page (POST) Creates the acount
	module.exports.protect				| (POST) Makes "protected" value in tile properties true
	module.exports.unprotect			| (POST) Makes "protected" value in tile properties false
	module.exports.coordlink			| (POST) Adds coordinate link to tile's properties.cell_props
	module.exports.urllink				| (POST) Adds url link to tile's properties.cell_props
	module.exports.profile				| (GET) Profile page (POST) 
	module.exports.private				| 
	module.exports.configure			| 
	module.exports.member_autocomplete	| 
	module.exports.timemachine			| 
*/


//Time in milliseconds
var Second = 1000;
var Minute = 60000;
var Hour = 3600000;
var Day = 86400000;
var Week = 604800000;
var Month = 2628002880;
var Year = 31536034560;
var Decade = 315360345600;

//Tile dimensions
var tileWidth = 16;
var tileHeight = 8;
var tileArea = tileWidth * tileHeight;

//Delete all expired sessions (if current time is greater than or equal to expire date, delete it.)
function clear_expired_sessions() {
	execSQL("all", "DELETE FROM auth_session WHERE expire_date <= ?", function(a, b){
		setTimeout(clear_expired_sessions, Minute)
	}, [Date.now()])
}
clear_expired_sessions();

//Get world ID and information from the name.
function world_get_or_create(name, callback) {
	//Get world name without case sensitivity. COLLATE = binary comparison
    execSQL("get", "SELECT * FROM world WHERE name=? COLLATE NOCASE", function(a, b) {
        if (b === undefined) {
            if(name.match(/^(\w*)$/g)) {
                var dat = Date.now();
                
                execSQL("run", "INSERT INTO world VALUES(null, ?, null, ?, ?, 1, 1, '{}')", function(a, b) {
                    execSQL("get", "SELECT * FROM world WHERE name=? COLLATE NOCASE", function(a, b){
                        callback(b.id, b);
                    }, [name])
                }, [name, dat, dat])
            } else {
                callback(null, undefined)
            }
        } else {
            callback(b.id, b);
        }
    }, [name])
}

function parseCookie(cookie) {
    try {
        if(typeof cookie !== "string") {
            return {};
        }
        cookie = cookie.split(";");
        var list = {}
        for(var i in cookie) {
            var c = cookie[i].split("=");
            if(c.length > 2) {
                var ar = c;
                var var2 = ar.pop();
                ar = ar.join("=")
                ar = ar.replace(/ /g, "");
                var2 = var2.replace(/ /g, "");
                list[ar] = var2
            } else if(c.length === 2) {
                list[decodeURIComponent(c[0].replace(/ /g, ""))] = decodeURIComponent(c[1].replace(/ /g, ""))
            } else if(c.length === 1) {
                if(c[0] !== "") list[c[0]] = null
            }
        }
        return list;
    } catch(e) {
        return {};
    }
}

function csplit(str, rem, count) {
    var arr = str.split(rem)
    var result = arr.splice(0,count);
    result.push(arr.join(rem));
    return result;
}

function isNum(n) {
	if(typeof n === "number" && !isNaN(n)) return true;
	return false;
}

function WriteTileData(tiles, DAT, wld_id, perm, callback) {
	var new_queries = []
	var done = [];
	
	var queries = [];
	for(i in tiles){
		var POS = i.split(",");
		POS = [parseInt(POS[0]), parseInt(POS[1])]
		queries.push(["SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", [wld_id, POS[0], POS[1]]])
	}
	
	function return_tables_to_edit(data) {
		new_queries.push("BEGIN TRANSACTION")
		for (var i in data) {
			if (data[i]) {
				var pos = data[i].tileY + "," + data[i].tileX
				var con = data[i].content.split("")
				
				var LNK = JSON.parse(data[i].properties)
				var _access = false;
				
				var prot = false;
				if(LNK.protected) {
					prot = true
				}
				if(prot) {
					if(DAT[1].authenticated) {
						if(DAT[1].id === perm.owner_id) {
							_access = true
						}
					}
				} else {
					_access = true
				}
				
				if(_access) {
					var tdone = [];
					var ch = false;
					for (var j in tiles[pos]) {
						var POS = tiles[pos][j];
						if(POS) {
							if(POS[0] !== undefined && POS[1] !== undefined && POS[2] !== undefined && POS[3] !== undefined && POS[4] !== undefined && POS[5] !== undefined) {
								if(isNum(POS[0]) && isNum(POS[1]) && isNum(POS[2]) && isNum(POS[3])) {
									if(POS[5].length === 1) {
										if(LNK.cell_props) {
											if(LNK.cell_props[POS[2]] !== undefined) {
												if(LNK.cell_props[POS[2]][POS[3]] !== undefined) {
													LNK.cell_props[POS[2]][POS[3]] = {};
												}
											}
										}
										
										if(POS[6] !== undefined) {
											if(!isNum(POS[6])) {
												POS[6] = 0;
											} else if (POS[6] < 0) {
												POS[6] = 0;
											} else if (POS[6] > 16777215) {
												POS[6] = 16777215;
											}
										} else {
											POS[6] = 0;
										}
										if(LNK.color === undefined) {
											LNK.color = Array(tileWidth * tileHeight).fill(0);
										}
										LNK.color[POS[2]*tileWidth+POS[3]] = POS[6];
										ch = true;
										con[POS[2] * tileWidth + POS[3]] = POS[5]
										
										var done_array = [POS[0], POS[1], POS[2], POS[3], POS[4], POS[5]];
										if(POS[6]) done_array.push(POS[6]);
										done.push(done_array)
										tdone.push(done_array)
									}
								}
							}
						}
					}
					if(ch) {
						LNK.revision++;
					}
					if(tdone.length > 0) {
						var u_id = DAT[1].id;
						if(!u_id) u_id = null;
						var dat = Date.now();
						var content_ = JSON.stringify(tdone);
						var tileY = data[i].tileY
						var tileX = data[i].tileX
						new_queries.push(["INSERT INTO edit VALUES(null, ?, null, ?, ?, ?, ?, ?)", [u_id, wld_id, tileY, tileX, dat, content_]])
					}
					con = con.join("")
					new_queries.push(["UPDATE tile SET (content,properties)=(?, ?) WHERE world_id=? AND tileY=? AND tileX=?", [con.slice(0,tileArea), JSON.stringify(LNK), wld_id, data[i].tileY, data[i].tileX]])
				}
				delete tiles[pos] // delete tiles from cache if they are in the request
			}
		}
		for (var i in tiles) { // insert remaining tiles
			var con = " ".repeat(tileArea).split("");
			var LNK = {
				color: Array(tileWidth * tileHeight).fill(0),
				revision: 1
			};
			
			var tdone = [];
			for (var j in tiles[i]) {
				var POS = tiles[i][j]
				if(POS) {
					if(POS[0] !== undefined && POS[1] !== undefined && POS[2] !== undefined && POS[3] !== undefined && POS[4] !== undefined && POS[5] !== undefined) {
						if(isNum(POS[0]) && isNum(POS[1]) && isNum(POS[2]) && isNum(POS[3])) {
							if(POS[5].length === 1) {
								if(POS[6] !== undefined) {
									if(!isNum(POS[6])) {
										POS[6] = 0;
									} else if (POS[6] < 0) {
										POS[6] = 0;
									} else if (POS[6] > 16777215) {
										POS[6] = 16777215;
									}
								} else {
									POS[6] = 0;
								}
								LNK.color[POS[2]*tileWidth+POS[3]] = POS[6];
								
								con[POS[2] * tileWidth + POS[3]] = POS[5]
								
								var done_array = [POS[0], POS[1], POS[2], POS[3], POS[4], POS[5]];
								if(POS[6]) done_array.push(POS[6]);
								done.push(done_array)
								tdone.push(done_array)
							}
						}
					}
				}
			}
			var c = i.split(",");
			c[0] = parseInt(c[0])
			c[1] = parseInt(c[1])
			if(tdone.length > 0) {
				var u_id = DAT[1].id;
				if(!u_id) u_id = null;
				var dat = Date.now();
				var content_ = JSON.stringify(tdone);
				var tileY = c[0]
				var tileX = c[1]
				new_queries.push(["INSERT INTO edit VALUES(null, ?, null, ?, ?, ?, ?, ?)", [u_id, wld_id, tileY, tileX, dat, content_]])
			}
			con = con.join("")
			var dat = Date.now();
			new_queries.push(["INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)", [wld_id, con.slice(0,tileArea), c[0], c[1], JSON.stringify(LNK), dat]]);
		}
		if(new_queries.length > 0) {
			new_queries.push("COMMIT")
			createTables(new_queries, function(){
				PerformCallback()
			})
		} else {
			PerformCallback()
		}
		function PerformCallback() {
			TileQuery.shift();
			Processing_Tile = false;
			ManageTileQueue();
			callback([200, JSON.stringify(done)])
		}
	}
	if(queries.length > 0) {
		returnTables(queries, return_tables_to_edit)
	} else {
		TileQuery.shift();
		Processing_Tile = false;
		ManageTileQueue();
		callback([200, JSON.stringify(done)])
	}
}

TileQuery = []

var Processing_Tile = false;
function ManageTileQueue(){
	if(TileQuery.length === 0) {
		Processing_Tile = false;
		return;
	}
	if(!Processing_Tile) {
		Processing_Tile = true;
		WriteTileData(TileQuery[0][0], TileQuery[0][1], TileQuery[0][2], TileQuery[0][3], TileQuery[0][4])
	}
}

module.exports.yourworld = function(req, callback, mod) {
	var Method = req.method;
	if(mod) Method = "GET"
	
    var cookie = req.headers.cookie
    var URL = url.parse(req.url)
    var prse = URL.query;
    var queryData = ""
    var error = false;
    
	if(!mod) {
		var wldname = URL.pathname
		if (wldname) wldname = wldname.substr(1)
	} else {
		var wldname = mod.name
	}
    if(Method === "POST") {
        req.on('data', function(data) {
            queryData += data;
            if (queryData.length > 10000000) {
                queryData = "";
                callback([413, ""])
                error = true
                req.connection.destroy();
            }
        });
        req.on('end', world_);
    }
    if(Method === "GET") {
        world_();
    }
    function world_() {
        if (error) return;
        if (Method === "GET") {
			if(prse) var QU = querystring.parse(prse)
            if (!prse) {
                world_get_or_create(wldname, cmp)
                function cmp(a, b) {
                    if(!b) {
                        module.exports.response_404(req, callback)
                        return;
                    }
					var prop;
                    function wld(canwrite, canadmin, cl, ul, gtc) {
						if(prop.views === undefined) {
							prop.views = 0;
						}
						prop.views++;
						execSQL("run", "UPDATE world SET properties=? WHERE id=?", function(){
							var comp = swig.compileFile("./program/html/templates/yourworld.html")
							var dat = {
								canWrite: canwrite,
								canAdmin: canadmin,
								worldName: b.name,
								features: {
									coordLink: cl,
									urlLink: ul,
									go_to_coord: gtc
								}
							}
							if(req.headers['user-agent'].indexOf("MSIE") >= 0) {
								dat.announce = "Sorry, your World of Text doesn't work well with Internet Explorer."
							}
							var dat = {
								urlhome: "/home/",
								state: JSON.stringify(dat)
							}
							var output = comp(dat);
							if (mod) { // if time-machine page
								output += "<style>.tilecont {position: absolute;background-color: #ddd;}</style>"
							}
							callback([200, output])
						}, [JSON.stringify(prop), b.id])
                    }
                    manageDefaultCookie(req.headers.cookie, nxt_)
                    function nxt_(a) {
                        var data = a[1];
                        
                        prop = JSON.parse(b.properties);
                        
						if(!mod) {
							var cw; // can_write
							if(b.public_writable) {
								cw = true;
							} else {
								cw = false;
							}
							//can_admin, coordLink, urlLink, go_to_coord
							var ca = false, cl = false, ul = false, gtc = false;
							if(data.authenticated) {
								if(data.id === b.owner_id) {
									cw = true, ca = true, cl = true, ul = true, gtc = true;
								}
							}
							
							if(prop.features) {
								if(prop.features.coordLink) cl = true;
								if(prop.features.go_to_coord) gtc = true;
								if(prop.features.urlLink) ul = true;
							}
						} else {
							var ca = false, cl = false, ul = false, gtc = false, cw = false;
						}
                        
                        execSQL("get", "SELECT * FROM whitelist WHERE world_id=? AND user_id=?", function(_a1, b1){
                            _nxt(_a1, b1)
                        }, [b.id, data.id])
                        
                        function _nxt(wA, wB) {
                            if(b.public_readable) {
                                if(!wB) wld(cw, ca, cl, ul, gtc);
                                if(wB) wld(true, false, true, true, true);
                            } else {
                                if(data.authenticated) {
                                    if(data.id === b.owner_id) {
                                        wld(true, true, true, true, true)
                                    } else {
                                        if(wB) wld(true, false, true, true, true);
                                        if(!wB) priv_callbk(a)
                                    }
                                } else {
                                    priv_callbk(a)
                                }
                            }
                        }
                        function priv_callbk(a) {
                            callback([0, ""], null, a[0], "/accounts/private/")
                        }
                    }
                }
            } else {
                var response = {};
                if (wldname !== undefined) {
                    if (QU.fetch === '1' && (QU.v === '2' || QU.v === '3') && QU.min_tileY && QU.min_tileX && QU.max_tileY && QU.max_tileX) {
                        var min_tileY = parseInt(QU.min_tileY)
                        var min_tileX = parseInt(QU.min_tileX)
                        var max_tileY = parseInt(QU.max_tileY)
                        var max_tileX = parseInt(QU.max_tileX)
                        if (min_tileY < max_tileY && min_tileX < max_tileX) {
                            if (((max_tileY - min_tileY) * (max_tileX - min_tileX)) < 400) {
                                function op(wld_id, perm) {
									if(!mod) {
										if(!perm) {
											module.exports.response_404(req, callback)
											return;
										}
										function public_wld(){
											var YTileRange = xrange(min_tileY, max_tileY + 1);
											var XTileRange = xrange(min_tileX, max_tileX + 1);
											//var rta = []
											for (var ty in YTileRange) {
												for (var tx in XTileRange) {
													response[YTileRange[ty] + "," + XTileRange[tx]] = null
													//rta.push([YTileRange[ty], XTileRange[tx]])
												}
											}
											/*for (i in rta) {
												rta[i] = ["SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", [wld_id, rta[i][0], rta[i][1]]]
											}*/
											execSQL("each", "SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", _done, [wld_id, min_tileY, min_tileX, max_tileY, max_tileX], nxt)
											function nxt(_a, data){
												response[data.tileY + "," + data.tileX] = {
													content: data.content,
													properties: JSON.parse(data.properties)
												}
											}
										}
										
										
										if(perm.public_readable) {
											public_wld()
										} else {
											manageDefaultCookie(req.headers.cookie, nxt_)
											function nxt_(a) {
												var data = a[1];
												if(data.authenticated) {
													if(data.id === perm.owner_id) {
														public_wld()
													} else {
														execSQL("get", "SELECT * FROM whitelist WHERE world_id=? AND user_id=?", function(_a, b){
															if(!b) {
																priv_callbk()
															} else {
																public_wld()
															}
														}, [wld_id, data.id])
													}
												} else {
													priv_callbk()
												}
											}
										}
                                    } else {
										function continue_() {
											var date = null;
											var dateRange = []
											
											var result = {};
											
											var YTileRange = xrange(min_tileY, max_tileY + 1);
											var XTileRange = xrange(min_tileX, max_tileX + 1);
											
											for (ty in YTileRange) {
												for (tx in XTileRange) {
													result[YTileRange[ty] + "," + XTileRange[tx]] = null
												}
											}
											//name+time
											execSQL("get", "select time from edit where world_id=? limit 1", function(a, b){
												if(b) if(b.time) dateRange.push(b.time)
												execSQL("get", "select time from edit where world_id=? order by id desc limit 1", function(a, b){
													if(b) if(b.time) dateRange.push(b.time)
													sq()
												}, [wld_id])
											}, [wld_id])
											
											function sq(){
												if(dateRange.length === 2) {
													if(!mod.time) {
														date = Date.now();
													} else {
														var RG = dateRange[1] - dateRange[0];
														var CL = RG / 1000000;
														date = Math.floor(CL * mod.time) + dateRange[0]
													}
													
													execSQL("each", "SELECT * FROM edit WHERE world_id=? AND time<=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", comp, [wld_id, date, min_tileY, min_tileX, max_tileY, max_tileX], nxt)
												} else {
													callback([200, "There are no edits yet"])
												}
											}
											//first: select time from edit where world_id=1 limit 1
											//last: select time from edit where world_id=1 order by id desc limit 1
											function nxt(_a, data) {
												var con = JSON.parse(data.content);
												for(var i in con) {
													var z = con[i]
													if(!result[z[0] + "," + z[1]]) {
														result[z[0] + "," + z[1]] = {
															content: arrayRepeat(" ", 128),
															properties: {}
														};
													};
													result[z[0] + "," + z[1]].content[z[2]*16+z[3]] = z[5]
												}
											}
											function comp(_a, _b) {
												for(var i in result) {
													if(result[i]) result[i].content = result[i].content.join("");
												}
												var val = 1000000;
												if(mod.time) {
													val = mod.time
												}
												/*var output = "";
												output += "<script type=\"text/javascript\" src=\"/static/jquery-1.3.2.min.js\"></script>";
												output += "<script>" + 
												"function trav(){" + 
													"var dat = document.getElementById('time').value;" + 
													"window.location.search = \"?time=\" + dat + \"\"" + 
												"}" + "</script>"
												output += "<label>" + convertDate(dateRange[0]) + "</label>"
												output += "<input type=\"range\" min=\"0\" max=\"1000\" style=\"width: 900px\" value=\"" + val + "\" id=\"time\">"
												output += "<label>" + convertDate(dateRange[1]) + "</label>&nbsp;"
												output += "<button onclick=\"trav();\">Travel</button><br>";
												output += "<div style=\"background-color: lightgray; display: inline-block; white-space: pre; font-family: lucida console;\">" + space.str() + "</div>";*/
												callback([200, JSON.stringify(result)])
											}
										}
										manageDefaultCookie(req.headers.cookie, nxt_)
										function nxt_(a) {
											var data = a[1];
											if(data.authenticated) {
												if(data.id === perm.owner_id) {
													continue_()
												} else {
													priv_callbk()
												}
											} else {
												priv_callbk()
											}
										}
									}
                                    
                                }
                                function priv_callbk(a) {
                                    callback([403, ""])
                                }
                                world_get_or_create(wldname, op)
                            }
                        }
                    }
                }
                function _done(a, b) {
                    callback([200, JSON.stringify(response)])
                }
            }
        }
        if(Method === "POST") {
            var QD = querystring.parse(queryData, null, null, {maxKeys: 1})
            var edi = JSON.parse(QD.edits);
            var DAT;
            function op(wld_id, perm) {
                if(!perm) {
                    module.exports.response_404(req, callback)
                    return;
                }
                function access_pcd() { // Access is granted to edit tiles in world
					var tiles = {} // All tiles, with edits
					
					for (var i in edi) {
						if (tiles[edi[i][0] + "," + edi[i][1]] === undefined) {
							tiles[edi[i][0] + "," + edi[i][1]] = []
						}
						if (edi[i][5] === "\n" || edi[i][5] === "\r") edi[i][5] = " ";
						tiles[edi[i][0] + "," + edi[i][1]].push(edi[i])
					}
					
					TileQuery.push([tiles, DAT, wld_id, perm, callback])
					ManageTileQueue()
                }
                
                //permissions
                if(perm.public_writable && perm.public_readable) {
                    access_pcd()
                } else {
                    var data = DAT[1];
                    if(data.authenticated) {
                        if(data.id === perm.owner_id) {
                            access_pcd()
                        } else {
                            execSQL("get", "SELECT * FROM whitelist WHERE world_id=? AND user_id=?", function(_a, b){
                                if(!b) {
                                    priv_callbk()
                                } else {
                                    access_pcd();
                                }
                            }, [wld_id, data.id])
                        }
                    } else {
                        priv_callbk()
                    }
                }
                function priv_callbk() {
                    callback([403, ""], null, DAT[0])
                }
            }
            manageDefaultCookie(req.headers.cookie, nxt_)
            function nxt_(a) {
                DAT = a;
                world_get_or_create(wldname, op)
            }
        }
    }
}

function manageDefaultCookie(cookie, callback) {
    cookie = parseCookie(cookie)
    var SendCookie = null;
    var ar = {
        authenticated: false,
        username: "",
        id: null,
        _csrftoken: null
    };
    var SQLWork = false;
    if(!cookie.csrftoken) {
        var TKN = tknNew(32)
        var date = Date.now();
        SendCookie = "csrftoken=" + TKN + "; expires=" + CookieExpires(date + Year) + "; path=/";
        ar._csrftoken = TKN;
    } else {
        ar._csrftoken = cookie.csrftoken;
    }
    if(cookie.sessionid){
        execSQL("get", "SELECT * FROM auth_session WHERE session_key=?", resp_, cookie.sessionid);
        var SQLWork = false;
        function resp_(a, b) {
            if(b) {
                ar = JSON.parse(Db64(b.session_data));
                if(ar.csrftoken === cookie.csrftoken) {
                    ar.authenticated = true;
                    callback([SendCookie, ar]);
                    SQLWork = true
                }
            }
            if(!SQLWork) {
                callback([SendCookie, ar]);
            }
        }
    } else {
        callback([SendCookie, ar, cookie.csrftoken]);
    }
}

module.exports.home = function(req, callback) {
    var tmp = swig.compileFile("./program/html/templates/home.html")
    manageDefaultCookie(req.headers.cookie, next)
    function next(a) {
        var data = a[1];
        var output = tmp({
            user_is_authenticated: data.authenticated,
            user: data.username,
            block_super: "Your World Of Text",
            url_home: "/home/",
            url_profile: "/accounts/profile/",
            url_logout: "/accounts/logout",
            url_auth_login: "/accounts/login/",
            url_registration_register: "/accounts/register/"
        });
        callback([200, output], null, a[0])
    }
}

module.exports.response_404 = function(req, callback) {
    var tmp = swig.compileFile("./program/html/templates/404.html")
    manageDefaultCookie(req.headers.cookie, next)
    function next(a) {
        var data = a[1];
        var output = tmp({
            user_is_authenticated: data.authenticated,
            user: data.username,
            block_super: "Your World Of Text",
            url_home: "/home/",
            url_profile: "/accounts/profile/",
            url_logout: "/accounts/logout",
            url_auth_login: "/accounts/login/",
            url_registration_register: "/accounts/register/"
        });
        callback([200, output], null, a[0])
    }
}

function default_login(token, auth, error, user, user_error) {
    var tmp = swig.compileFile("./program/html/templates/registration/login.html")
    var output = tmp({
        user_is_authenticated: auth,
        user: user,
        block_super: "Your World Of Text",
        url_home: "/home/",
        url_profile: "/accounts/profile/",
        url_logout: "/accounts/logout",
        url_auth_login: "/accounts/login/",
        url_registration_register: "/accounts/register/",
        
        auth_login_url: "/accounts/login/",
        form_username_label_tag: "<label for=\"id_username\">Username</label>",
        form_username: "<input id=\"id_username\" type=\"text\" name=\"username\" maxlength=\"30\" " + user_error + "/>",
        form_password_label_tag: "<label for=\"id_password\">Password</label>",
        form_password: "<input type=\"password\" name=\"password\" id=\"id_password\" />",
        next: "",
        csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + token + "' /></div>",
        form_errors: error
    });
    return output;
}

var TOK = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
function tknNew(len) {
    var TK = "";
    for(var i = 0; i < len; i++) {
        TK += TOK.charAt(Math.floor(Math.random()*TOK.length))
    }
    return TK;
}

function CookieExpires(timeStamp) {
    var dayWeekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    var _DayOfWeek = dayWeekList[new Date(timeStamp).getDay()];
    var _Day = new Date(timeStamp).getDate();
    var _Month = monthList[new Date(timeStamp).getMonth()];
    var _Year = new Date(timeStamp).getFullYear();
    var _Hour = new Date(timeStamp).getHours();
    var _Minute = new Date(timeStamp).getMinutes();
    var _Second = new Date(timeStamp).getSeconds();

    var compile = _DayOfWeek + ", " + _Day + " " + _Month + " " + _Year + " " + _Hour + ":" + _Minute + ":" + _Second + " UTC";
    return compile
}

function Eb64(str) {
    return new Buffer(str).toString('base64')
}
function Db64(b64str) {
    return new Buffer(b64str, 'base64').toString('ascii')
}

module.exports.login = function(req, callback, mod, opt) {
    var cookie = req.headers.cookie
    cookie = parseCookie(cookie)
    var output;
    var SendCookie = null;
    var S_ID; // sessionid
    var _CSRF; // csrftoken
    function checkCookie(auth, error, success, user, err) {
        if(cookie.csrftoken) {
            _CSRF = cookie.csrftoken.slice(0, 32);
            var user_err;
            if(err) {
                user_err = "value=\"" + err + "\""
            }
            output = default_login(cookie.csrftoken, auth, error, user, user_err)
            S_ID = tknNew(32);
            var date = Date.now();
            if(success) {
                SendCookie = "sessionid=" + S_ID + "; expires=" + CookieExpires(date + Month) + "; path=/";
            }
        } else {
            var user_err;
            if(err) {
                user_err = "value=\"" + err + "\""
            }
            var TKN = tknNew(32)
            S_ID = tknNew(32)
            _CSRF = TKN;
            output = default_login(TKN, auth, error, user, user_err)
            var date = Date.now();
            SendCookie = "csrftoken=" + TKN + "; expires=" + CookieExpires(date + Year) + "; path=/";
            if(success) {
                SendCookie = [SendCookie, "sessionid=" + S_ID + "; expires=" + CookieExpires(date + Month) + "; path=/"]
            }
        }
    }
    
    if(req.method === "GET") {
        manageDefaultCookie(req.headers.cookie, next)
        function next(a) {
            var data = a[1];
            checkCookie(data.authenticated, false, false, data.username, false)
            callback([200, output], null, a[0])
        }
    }
    if(req.method === "POST" || mod) {
        if(!mod){
            var queryData = "";
            var error;
            req.on('data', function(data) {
                queryData += data;
                if (queryData.length > 1000000) {
                    queryData = "";
                    callback([413, ""])
                    error = true
                    req.connection.destroy();
                }
            });
            req.on('end', account_);
        } else {
            var error = false;
            account_();
        }
        var user, pass, output;
        function account_() {
            if(error) return;
            if(!mod){
                var QD = querystring.parse(queryData)
                user = QD.username
                pass = QD.password;
            } else{
                user = opt.username;
                pass = opt.password;
            }
            execSQL("get", "SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", account_fnd_done, [user])
        }
        function account_fnd_done(a, b) {
            if(b === undefined) {
                checkCookie(false, true, false, false, user)
                callback([200, output], null, SendCookie)
            } else {
                var res = checkHash(b.password, pass)
                if(!res) {
                    checkCookie(false, true, false, false, user)
                    callback([200, output], null, SendCookie)
                } else {
                    checkCookie(true, false, true)
                    var _DT = JSON.stringify({
                        type: "sessionid_auth",
                        date: Date.now(),
                        csrftoken: _CSRF,
                        id: b.id,
                        username: b.username
                    });
                    var _expire = Date.now() + (Day * 10);
                    execSQL("run", "INSERT INTO auth_session VALUES(?, ?, ?)", function(){
                        execSQL("run", "UPDATE auth_user SET last_login=? WHERE id=?", function(){
                            var redir = "/accounts/profile/"
                            if(!mod){
                                var URL = url.parse(req.headers.referer)
                                var prse = URL.query;
                                var QU = querystring.parse(prse)
                                if(QU.next !== undefined) {
                                    redir = QU.next;
                                }
                            }
                            callback([0, ""], null, SendCookie, redir)
                        }, [Date.now(), b.id])
                    }, [S_ID, Eb64(_DT), _expire])
                }
            }
        }
    }
}

module.exports.logout = function(req, callback) {
    var cookie = parseCookie(req.headers.cookie);
    if(cookie.sessionid) {
        execSQL("run", "DELETE FROM auth_session WHERE session_key=?", after_logout, [cookie.sessionid])
        function after_logout() {
            callback([0, ""], false, "sessionid=; expires=" + CookieExpires(0) + "; path=/", "/home/")
        }
    }
}

module.exports.register = function(req, callback) {
    function renderRegister(e1, e2, e3, e4){
        var tmp = swig.compileFile("./program/html/templates/registration/registration_form.html")
        manageDefaultCookie(req.headers.cookie, next)
        function next(a) {
            var data = a[1];
            var output = tmp({
                user_is_authenticated: data.authenticated,
                user: data.username,
                block_super: "Your World Of Text",
                url_home: "/home/",
                url_profile: "/accounts/profile/",
                url_logout: "/accounts/logout",
                url_auth_login: "/accounts/login/",
                url_registration_register: "/accounts/register/",
                
                auth_login_url: "/accounts/login/",
                form_username: "<input id=\"id_username\" type=\"text\" name=\"username\" maxlength=\"30\" " + "" + "/>",
                form_email: "<input id=\"id_email\" type=\"text\" class=\"required\" name=\"email\" maxlength=\"75\" />",
                form_password1: "<input id=\"id_password1\" type=\"password\" class=\"required\" name=\"password1\" />",
                form_password2: "<input id=\"id_password2\" type=\"password\" class=\"required\" name=\"password2\" />",
                csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data._csrftoken + "' /></div>",
                form_username_errors: e1,
                form_email_errors: e2,
                form_password1_errors: e3,
                form_password2_errors: e4
            });
            callback([200, output], null, a[0])
        }
    }
    
    if(req.method === "GET") {
        renderRegister(null, null, null, null)
    }
    if(req.method === "POST") {
        var queryData = "";
        var error = false;
        req.on('data', function(data) {
            queryData += data;
            if (queryData.length > 1000000) {
                queryData = "";
                callback([413, ""])
                error = true
                req.connection.destroy();
            }
        });
        req.on('end', registration);
        function registration() {
            if(error) return;
            manageDefaultCookie(req.headers.cookie, next)
            function next(a){
                QD = querystring.parse(queryData)
                var data = a[1]
                if(QD.csrfmiddlewaretoken === data._csrftoken) {
                    var e1, e2, e3, e4
                    var err = false;
                    
                    if(QD.password1.length > 128) {
                        e4 = ["The password is too long. It must be 128 characters or less."]
                        err = true;
                    } else if(QD.password1 !== QD.password2) {
                        e4 = ["The two password fields didn't match."]
                        err = true;
                    } else if(QD.password1.length === 0) {
						e3 = ["Enter a password."];
						err = true;
					}
                    
                    if(QD.username.length > 30) {
                        e1 = ["The username must be 30 characters or less."]
                        err = true;
                    } else if(QD.username.length < 1) {
                        e1 = ["The username is too short"];
                        err = true;
                    } else if(!QD.username.match(/^(\w*)$/g)) {
                        e1 = ["The username must contain the following characters: a-z A-Z 0-9 _"];
                        err = true;
                    }
                    
                    if(QD.email.length > 75) {
                        e2 = ["The email must be 75 characters or less."]
                    }
                    
                    if(err) renderRegister(e1,e2,e3,e4)
                    if(!err) {
                        execSQL("get", "SELECT username FROM auth_user WHERE username=? COLLATE NOCASE", userCheck, [QD.username])
                        function userCheck(a, b){
                            if(b) {
                                renderRegister(["The username already exists."],null,null,null)
                            } else {
                                var Date_ = Date.now()
                                var passHash = encryptHash(QD.password1)
                                execSQL("run", "INSERT INTO auth_user VALUES(null, ?, '', '', ?, ?, 0, 1, 0, ?, ?)", function(a, b){
                                    module.exports.login(req, function(a,b,c,d){
                                        callback(a,b,c,d)
                                    }, true, {username: QD.username, password: QD.password1})
                                }, [QD.username, QD.email, passHash, Date_, Date_])
                            }
                        }
                    }
                }
            }
        }
    }
}

module.exports.protect = function(req, callback) {
    var queryData = "";
    var error = false;
    var QD;
    var AddCookie;
    req.on('data', function(data) {
        queryData += data;
        if (queryData.length > 1000000) {
            queryData = "";
            callback([413, ""])
            error = true
            req.connection.destroy();
        }
    });
    req.on('end', checkaccess);
    function checkaccess() {
        QD = querystring.parse(queryData)
        world_get_or_create(QD.namespace, next)
        var WLDDATA = {};
        function next(a, b) {
            WLDDATA = b;
            manageDefaultCookie(req.headers.cookie, next2);
        }
        function next2(a, b) {
            AddCookie = a[0]
            var data = a[1];
            if(data.id === WLDDATA.owner_id) {
                tileaccess()
            } else {
                callback([403, "", false, AddCookie])
            }
        }
    }
    function tileaccess() {
        if(error) return;
        world_get_or_create(QD.namespace, res_)
        function res_(WLD_ID) {
            execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
            function tilecall(a, b) {
                if(b) {
                    var prse = JSON.parse(b.properties);
                    prse.protected = true
                    execSQL("run", "UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
                } else {
                    var prse = {
                        protected: true
                    }
                    var dat = Date.now();
                    execSQL("run", "INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
                }
            }
            function next_() {
                callback([200, "", false, AddCookie])
            }
        }
    }
}

module.exports.unprotect = function(req, callback) {
    var queryData = "";
    var error = false;
    var AddCookie;
	var QD;
    req.on('data', function(data) {
        queryData += data;
        if (queryData.length > 1000000) {
            queryData = "";
            callback([413, ""])
            error = true
            req.connection.destroy();
        }
    });
    req.on('end', checkaccess);
    function checkaccess() {
        QD = querystring.parse(queryData)
        world_get_or_create(QD.namespace, next)
        var WLDDATA = {};
        function next(a, b) {
            WLDDATA = b;
            manageDefaultCookie(req.headers.cookie, next2);
        }
        function next2(a, b) {
            var data = a[1];
            if(data.id === WLDDATA.owner_id) {
                tileaccess()
            } else {
                callback([403, "", false, AddCookie])
            }
            
            AddCookie = a[0]
        }
    }
    function tileaccess() {
        if(error) return;
        var QD = querystring.parse(queryData)
        world_get_or_create(QD.namespace, res_)
        function res_(WLD_ID) {
            execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
            function tilecall(a, b) {
                if(b) {
                    var prse = JSON.parse(b.properties);
                    prse.protected = false
                    execSQL("run", "UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
                }
            }
            function next_() {
                callback([200, ""])
            }
        }
    }
}

module.exports.coordlink = function(req, callback) {
    var queryData = "";
    var error = false;
    var AddCookie;
    req.on('data', function(data) {
        queryData += data;
        if (queryData.length > 1000000) {
            queryData = "";
            callback([413, ""])
            error = true
            req.connection.destroy();
        }
    });
    req.on('end', checkaccess);
    var QD;
    function checkaccess() {
        if(error) return;
        QD = querystring.parse(queryData)
        world_get_or_create(QD.namespace, next)
        var WLDDATA = {};
        var props;
        function next(a, b) {
            WLDDATA = b;
            props = JSON.parse(WLDDATA.properties);
            manageDefaultCookie(req.headers.cookie, next2);
        }
        function next2(a, b) {
            AddCookie = a[0]
            var data = a[1];
            if(data.id === WLDDATA.owner_id) {
                tileaccess()
            } else {
                if(data.authenticated) {
                    execSQL("get", "SELECT * FROM whitelist WHERE world_id=? AND user_id=?", handle, [WLDDATA.id, data.id])
                } else {
                    handle(null, undefined)
                }
                function handle(_a, b) {
                    var acs = false;
                    if(props.features) {
                        if(props.features.coordLink) {
                            acs = true;
                        }
                    }
                    if(!b) {
                        if(!WLDDATA.public_readable || !WLDDATA.public_writable) acs = false;
                    }
                    execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", function(_a, _b){
                        if(_b) {
                            var _prop = JSON.parse(_b.properties);
                            if(_prop.protected) {
                                callback([403, "", false, AddCookie])
                            } else {
                                if(!b) {
                                    if(!acs) callback([403, "", false, AddCookie])
                                    if(acs) tileaccess();
                                } else {
                                    tileaccess()
                                }
                            }
                        } else {
                            if(!acs && !b) callback([403, "", false, AddCookie])
                            if(acs || b) tileaccess();
                        }
                    }, [WLDDATA.id, QD.tileY, QD.tileX])
                }
            }
        }
    }
    function tileaccess() {
		QD.charY = parseInt(QD.charY)
		QD.charX = parseInt(QD.charX)
		QD.tileY = parseInt(QD.tileY)
		QD.tileX = parseInt(QD.tileX)
		if(QD.charY < 8 && QD.charX < 16 && QD.charX >= 0 && QD.charY >= 0 && isNum(QD.charY) && isNum(QD.charX) && isNum(QD.tileY) && isNum(QD.tileX)){
			world_get_or_create(QD.namespace, res_)
			function res_(WLD_ID) {
				execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
				function tilecall(a, b) {
					if(b) {
						var prse = JSON.parse(b.properties);
						if(prse.cell_props === undefined) {
							prse.cell_props = {};
						}
						if(prse.cell_props[QD.charY] === undefined) {
							prse.cell_props[QD.charY] = {};
						}
						if(prse.cell_props[QD.charY][QD.charX] === undefined) {
							prse.cell_props[QD.charY][QD.charX] = {};
						}
						prse.cell_props[QD.charY][QD.charX].link = {
							'type': 'coord',
							'link_tileY': QD.link_tileY,
							'link_tileX': QD.link_tileX
						}
						execSQL("run", "UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
					} else {
						var prse = {};
						prse.cell_props = {};
						prse.cell_props[QD.charY] = {};
						prse.cell_props[QD.charY][QD.charX] = {}
						prse.cell_props[QD.charY][QD.charX].link = {
							'type': 'coord',
							'link_tileY': QD.link_tileY,
							'link_tileX': QD.link_tileX
						};
						var dat = Date.now();
						execSQL("run", "INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
					}
				}
				function next_() {
					callback([200, ""])
				}
			}
		} else {
			callback([200, "The in-tile coordinates are invalid."])
		}
    }
}

module.exports.urllink = function(req, callback) {
    var queryData = "";
    var error = false;
    var AddCookie;
    req.on('data', function(data) {
        queryData += data;
        if (queryData.length > 1000000) {
            queryData = "";
            callback([413, ""])
            error = true
            req.connection.destroy();
        }
    });
    req.on('end', checkaccess);
    var QD;
    function checkaccess() {
        if(error) return;
        QD = querystring.parse(queryData)
        world_get_or_create(QD.namespace, next)
        var WLDDATA = {};
        var props;
        function next(a, b) {
            WLDDATA = b;
            props = JSON.parse(WLDDATA.properties);
            manageDefaultCookie(req.headers.cookie, next2);
        }
        function next2(a, b) {
            AddCookie = a[0]
            var data = a[1];
            if(data.id === WLDDATA.owner_id) {
                tileaccess()
            } else {
                if(data.authenticated) {
                    execSQL("get", "SELECT * FROM whitelist WHERE world_id=? AND user_id=?", handle, [WLDDATA.id, data.id])
                } else {
                    handle(null, undefined)
                }
                function handle(_a, b) {
                    var acs = false;
                    if(props.features) {
                        if(props.features.urlLink) {
                            acs = true;
                        }
                    }
                    if(!b) {
                        if(!WLDDATA.public_readable || !WLDDATA.public_writable) acs = false;
                    }
                    execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", function(_a, _b){
                        if(_b) {
                            var _prop = JSON.parse(_b.properties);
                            if(_prop.protected) {
                                callback([403, "", false, AddCookie])
                            } else {
                                if(!b) {
                                    if(!acs) callback([403, "", false, AddCookie])
                                    if(acs) tileaccess();
                                } else {
                                    tileaccess()
                                }
                            }
                        } else {
                            if(!acs && !b) callback([403, "", false, AddCookie])
                            if(acs || b) tileaccess();
                        }
                    }, [WLDDATA.id, QD.tileY, QD.tileX])
                }
            }
        }
    }
    function tileaccess() {
		QD.charY = parseInt(QD.charY)
		QD.charX = parseInt(QD.charX)
		QD.tileY = parseInt(QD.tileY)
		QD.tileX = parseInt(QD.tileX)
		if(QD.charY < 8 && QD.charX < 16 && QD.charX >= 0 && QD.charY >= 0 && isNum(QD.charY) && isNum(QD.charX) && isNum(QD.tileY) && isNum(QD.tileX)){
			world_get_or_create(QD.namespace, res_)
			function res_(WLD_ID) {
				execSQL("get", "SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
				function tilecall(a, b) {
					if(b) {
						var prse = JSON.parse(b.properties);
						if(prse.cell_props === undefined) {
							prse.cell_props = {};
						}
						if(prse.cell_props[QD.charY] === undefined) {
							prse.cell_props[QD.charY] = {};
						}
						if(prse.cell_props[QD.charY][QD.charX] === undefined) {
							prse.cell_props[QD.charY][QD.charX] = {};
						}
						prse.cell_props[QD.charY][QD.charX].link = {
							'type': 'url',
							'url': QD.url
						}
						execSQL("run", "UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
					} else {
						var prse = {};
						prse.cell_props = {};
						prse.cell_props[QD.charY] = {};
						prse.cell_props[QD.charY][QD.charX] = {}
						prse.cell_props[QD.charY][QD.charX].link = {
							'type': 'url',
							'url': QD.url
						};
						var dat = Date.now();
						execSQL("run", "INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
					}
				}
				function next_() {
					callback([200, ""])
				}
			}
		} else {
			callback([200, "The in-tile coordinates are invalid."])
		}
    }
}

function listOwned(data, wmc) {
    var ar = [];
    if(data) {
        for(var i in data) {
            var DAT = data[i]
            var whiteListCount = 0;
			if(wmc[DAT.id]) {
				whiteListCount = wmc[DAT.id];
			}
            
            var plural = "";
            if(whiteListCount !== 1) {
                plural = "s"
            }
            ar.push({
                public_writable: DAT.public_writable,
                public_readable: DAT.public_readable,
                whitelist_set_count: whiteListCount,
                conf_url: "/accounts/configure/" + DAT.name + "/",
                get_absolute_url: "/" + DAT.name,
                url: DAT.name,
                pluralize: plural
            })
        }
    }
    return ar;
}

module.exports.profile = function(req, callback) {
    function renderProfile(tmp, data, a, callback, message) {
        var _id = data.id;
        var worldlist = []
        var memberships = [];
		var worldMemCount = [];
        execSQL("all", "SELECT * FROM world WHERE owner_id=?", members, [_id])
        function members(_a, bWorlds) {
			var GetQuery = [];
			
			for(i in bWorlds) {
				GetQuery.push(["select world_id, count(world_id) as count from whitelist where world_id=?", [bWorlds[i].id]])
			}
			
			returnTables(GetQuery, function(MEMS){
				var MC = {};
				for(i in MEMS) {
					MC[MEMS[i].world_id] = MEMS[i].count;
				}
				worldlist = listOwned(bWorlds, MC)
			})
            execSQL("all", "SELECT * FROM whitelist WHERE user_id=?", wldCall, [_id])
        }
        function wldCall(_a, bMEM) {
            var rta = [];
            if(bMEM) {
                for(var i in bMEM) {
                    var DAT = bMEM[i]
                    rta.push(["SELECT name from world where id=?", [DAT.world_id]])
                }
            }
            returnTables(rta, returnWorldName)
            if(rta.length === 0) returnWorldName(null, undefined)
            function returnWorldName(b) {
                if(b) {
                    for(var i in b) {
                        var DAT = b[i];
                        memberships.push({
                            get_absolute_url: "/" + DAT.name,
                            url: DAT.name
                        })
                    }
                }
				if(memberships.length === 0) memberships = null;
				if(worldlist.length === 0) worldlist = null;
                var output = tmp({
                    user_is_authenticated: true,
                    user: data.username,
                    block_super: "Your World Of Text",
                    url_home: "/home/",
                    url_profile: "/accounts/profile/",
                    url_logout: "/accounts/logout",
                    url_auth_login: "/accounts/login/",
                    url_registration_register: "/accounts/register/",
                    
                    message: message,
                    csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data.csrftoken + "' /></div>",
                    worlds_owned: worldlist,
                    memberships: memberships
                });
                callback([[200, output], null, a[0]])
            }
        }
    }

    function processProfile(ecallback, message) {
        var tmp = swig.compileFile("./program/html/templates/profile.html")
        manageDefaultCookie(req.headers.cookie, next)
        function next(a) {
            var data = a[1];
            if(data.authenticated) {
                renderProfile(tmp, data, a, function(a1){
                    if(!ecallback) {
                        callback(a1[0], a1[1], a1[2])
                    } else {
                        ecallback(a1[0], a1[1], a1[2])
                    }
                }, message)
            } else {
                if(!ecallback) {
                    callback([200, ""], null, a[0], "/accounts/login/?next=/accounts/profile/")
                } else {
                    ecallback([200, ""], null, a[0], "/accounts/login/?next=/accounts/profile/")
                }
            }
        }
    }
    
    if(req.method === "GET") {
        processProfile()
    }
    if(req.method === "POST") {
        var queryData = "";
        var error;
        req.on('data', function(data) {
            queryData += data;
            if (queryData.length > 1000000) {
                queryData = "";
                callback([413, ""])
                error = true
                req.connection.destroy();
            }
        });
        req.on('end', conf_);
        function conf_() {
            if(error) return;
            QD = querystring.parse(queryData)
            manageDefaultCookie(req.headers.cookie, next)
            var access = false;
            var message = "";
            function next(a) {
                var data = a[1];
                var cookie = parseCookie(req.headers.cookie)
                if(data.authenticated && data.csrftoken === QD.csrfmiddlewaretoken) {
                    var err = "";
                    if(QD.worldname.match(/^(\w*)$/g) && QD.worldname.length > 0){
                        execSQL("get", "SELECT * FROM world WHERE name=? COLLATE NOCASE", fns, [QD.worldname])
                        function fns(a, b) {
                            if(b === undefined) {
                                access = true
                                var dat = Date.now();
                                execSQL("run", "INSERT INTO world VALUES(null, ?, ?, ?, ?, 1, 1, '{}')", function(a, b) {
                                    processProfile(function(a,b,c,d){
                                        callback(a,b,c,d)
                                    }, "World \"" + QD.worldname + "\" successfully claimed.")
                                }, [QD.worldname, data.id, dat, dat])
                            } else {
                                if(b.owner_id === null) {
                                    if(b.owner_id !== data.id) {
                                        access = true;
                                        execSQL("run", "UPDATE world SET owner_id=? WHERE name=?", function(a, b){
                                            processProfile(function(a,b,c,d){
                                                callback(a,b,c,d)
                                            }, "World \"" + QD.worldname + "\" successfully claimed.")
                                        }, [data.id, QD.worldname])
                                    } else {
                                        message = "You already own that world."
                                    }
                                } else {
                                    message = "That world already has an owner."
                                }
                            }
                            if(!access){
                                processProfile(function(a,b,c,d){
                                    callback(a,b,c,d)
                                }, message)
                            }
                        }
                    } else {
                        err = "Invalid world name."
                    }
                    if(QD.worldname.length < 1) {
                        err = "World name is too short."
                    }
                    if(err !== "") {
                        processProfile(function(a,b,c,d){
                            callback(a,b,c,d)
                        }, err)
                    }
                } else {
                    callback([403, "Access denied"])
                }
            }
        }
    }
}

module.exports.private = function(req, callback) {
    var tmp = swig.compileFile("./program/html/templates/private.html")
    manageDefaultCookie(req.headers.cookie, next)
    function next(a) {
        var data = a[1];
        var output = tmp({
            user_is_authenticated: data.authenticated,
            user: data.username,
            block_super: "Your World Of Text",
            url_home: "/home/",
            url_profile: "/accounts/profile/",
            url_logout: "/accounts/logout",
            url_auth_login: "/accounts/login/",
            url_registration_register: "/accounts/register/"
        });
        callback([200, output], null, a[0])
    }
}

function bool(n) {
    if(n === 0) return false;
    return true
}

function int(s) {
    return parseInt(s);
}

module.exports.configure = function(req, callback) {
	var access = false;
    function renderConfigure(ecallback, message){
        var world = csplit(url.parse(req.url.substr(1)).pathname, "accounts/configure/", 1)[1]
        if(world.charAt(world.length - 1) === "/") {
            world = world.substring(0, world.length - 1);
        }
        var tmp = swig.compileFile("./program/html/templates/configure.html")
        manageDefaultCookie(req.headers.cookie, next)
        function next(a) {
            var data = a[1];
            if(data.authenticated) {
                var members = [];
                var worldData = null;
                execSQL("get", "SELECT * FROM world WHERE name=?", w_fs, [world])
                function w_fs(_a, wdat) {
                    if(wdat) {
                        worldData = wdat
						if(wdat.owner_id === data.id) {
							execSQL("all", "SELECT * FROM whitelist WHERE world_id=?", parseMember, [wdat.id])
							var rta = [];
						} else {
							if(!ecallback) {
								callback([403, "Access denied"], null, a[0])
							} else {
								ecallback([403, "Access denied"], null, a[0])
							}
						}
                    } else {
                        if(!ecallback) {
                            callback([403, "Access denied"], null, a[0])
                        } else {
                            ecallback([403, "Access denied"], null, a[0])
                        }
                    }
                    function parseMember(_a, b) {
                        if(b) {
                            for(var i in b) {
                                var DAT = b[i]
                                rta.push(["SELECT username from auth_user where id=?", [DAT.user_id]])
                            }
                        }
                        returnTables(rta, returnUsernames)
                    
                        if(rta.length === 0) returnUsernames(null)
                        function returnUsernames(b) {
                            if(b) {
                                for(var i in b) {
                                    var DAT = b[i]
                                    members.push({member_name:DAT.username})
                                }
                            }
							access = true;
							var _txt = " selected";
							var public_perm = "none";
							if(worldData.public_writable) {
								public_perm = "write"
							}else if(worldData.public_readable) {
								public_perm = "read"
							}
							var conf = JSON.parse(wdat.properties)
							var go_to_coord = false;
							var coordLink = false;
							var urlLink = false;
							if(conf.features) {
								if(conf.features.go_to_coord) go_to_coord = conf.features.go_to_coord
								if(conf.features.coordLink) coordLink = conf.features.coordLink
								if(conf.features.urlLink) urlLink = conf.features.urlLink
							}
							var op1 = ""
							var op2 = ""
							var op3 = ""
							if(public_perm === "none") op1 = _txt
							if(public_perm === "read") op2 = _txt
							if(public_perm === "write") op3 = _txt
							
							if(members.length === 0) members = null;
							var output = tmp({
								user_is_authenticated: true,
								user: data.username,
								block_super: "Your World Of Text",
								url_home: "/home/",
								url_profile: "/accounts/profile/",
								url_logout: "/accounts/logout",
								url_auth_login: "/accounts/login/",
								url_registration_register: "/accounts/register/",
								
								
								public_perm: public_perm,
								world: world,
								csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data.csrftoken + "' /></div>",
								members: members,
								go_to_coord: go_to_coord,
								coordLink: coordLink,
								urlLink: urlLink,
								add_member_message: message,
								op1: op1,
								op2: op2,
								op3: op3
							});
							if(!ecallback){
								callback([200, output], null, a[0])
							}else{
								ecallback([200, output], null, a[0])
							}
                        }
                    }
                }
            } else {
                if(!ecallback){
                    callback([200, ""], null, a[0], "/accounts/login/?next=" + url.parse(req.url).pathname)
                } else {
                    ecallback([200, ""], null, a[0], "/accounts/login/?next=" + url.parse(req.url).pathname)
                }
            }
        }
    }
    if(req.method === "GET") {
        renderConfigure()
    }
    if(req.method === "POST") {
        var queryData = "";
        var error;
        req.on('data', function(data) {
            queryData += data;
            if (queryData.length > 1000000) {
                queryData = "";
                callback([413, ""])
                error = true
                req.connection.destroy();
            }
        });
        req.on('end', conf_);
        function conf_(){
            if(error) return;
            manageDefaultCookie(req.headers.cookie, next)
            function next(a) {
                var world = csplit(url.parse(req.url.substr(1)).pathname, "accounts/configure/", 1)[1]
                if(world.charAt(world.length - 1) === "/") {
                    world = world.substring(0, world.length - 1);
                }
                
                execSQL("get", "SELECT * FROM world WHERE name=?", w_fs, [world])
                
                function w_fs(_a, b) {
                    var data = a[1];
                    QD = querystring.parse(queryData)
                    if(data.authenticated) {
                        if(data.id === b.owner_id && QD.csrfmiddlewaretoken === data.csrftoken) {
                            if(QD.form === "public_perm") {
                                var read = null;
                                var write = null;
                                if(QD.public_perm === "read") {
                                    read = 1;
                                    write = 0;
                                }
                                if(QD.public_perm === "write") {
                                    read = 1
                                    write = 1;
                                }
                                if(QD.public_perm === "none") {
                                    read = 0;
                                    write = 0;
                                }
                                execSQL("run", "UPDATE world SET (updated_at,public_readable,public_writable)=(?, ?, ?) WHERE id=?", function(a,b){
                                    callback([200, ""], null, null, url.parse(req.url).pathname)
                                }, [Date.now(), read, write, b.id])
                            }
                            if(QD.form === "add_member") {
                                var user = QD.add_member
                                var dat = Date.now();
                                var wName = b.name
                                execSQL("get", "SELECT id from auth_user WHERE username=? COLLATE NOCASE", next1, [user])
                                function next1(a, _b){
                                    if(_b === undefined){
                                        renderConfigure(function(a,b,c,d){
                                            callback(a,b,c,d)
                                        }, "User not found")
                                    } else {
                                        next2(_b.id);
                                    }
                                }
                                function next2(IDtoAdd) {
                                    if(IDtoAdd === b.owner_id){
                                        renderConfigure(function(a,b,c,d){
                                            callback(a,b,c,d)
                                        }, "User is already the owner of \"" + wName + "\"")
                                    } else {
                                        execSQL("run", "INSERT into whitelist VALUES(null, (SELECT id FROM auth_user WHERE username=? COLLATE NOCASE), ?, ?, ?)", final_, [user, b.id, dat, dat])
                                    }
                                }
                                function final_(a,_b){
                                    renderConfigure(function(a,b,c,d){
                                        callback(a,b,c,d)
                                    }, user + " is now a member of the \"" + wName + "\" world")
                                }
                            }
                            if(QD.form === "remove_member") {
                                var to_remove;
                                for(key in QD) {
                                    if(key.startsWith("remove_")) to_remove = key;
                                }
                                var username_to_remove = to_remove.split("remove_")[1]
                                execSQL("run", "DELETE FROM whitelist WHERE user_id=(SELECT id FROM auth_user WHERE username=? COLLATE NOCASE) AND world_id=?", next, [username_to_remove, b.id])
                                function next(a,b){
                                    callback([200, ""], null, null, url.parse(req.url).pathname)
                                }
                            }
                            if(QD.form === "features") {
                                var features = {
                                    features: {}
                                };
                                if(QD.go_to_coord) features.features.go_to_coord = bool(int(QD.go_to_coord));
                                if(QD.coordLink) features.features.coordLink = bool(int(QD.coordLink));
                                if(QD.urlLink) features.features.urlLink = bool(int(QD.urlLink));
                                execSQL("run", "UPDATE world SET (updated_at,properties)=(?, ?) WHERE id=?", function(a,b){
                                    callback([200, ""], null, null, url.parse(req.url).pathname)
                                }, [Date.now(), JSON.stringify(features), b.id])
                            }
                        }
                    }
                }
            }
        }
    }
}

function escapeSpecial(str) {
	return str.replace(/%/g, "\\%").replace(/\\/, "\\\\")
}

module.exports.member_autocomplete = function(req, callback) {
    var URL = url.parse(req.url)
    var prse = URL.query;
    var QU = querystring.parse(prse)
    execSQL("all", "SELECT username FROM auth_user WHERE username LIKE ? || '%' ESCAPE '\\' ORDER BY username LIMIT 10", next, [escapeSpecial(QU.q)])
    function next(a, b){
        var ar = [];
        for(var i in b){
            ar.push(b[i].username)
        }
        callback([200, ar.join("\n")])
    }
}

function arrayRepeat(data, count) {
	var ar = [];
	for(var i = 0; i < count; i++) {
		ar.push(data);
	}
	return ar;
}

function Space(x1, y1, x2, y2) { // Unused.
	var orderData = []
	this.data = {chars:{}, size:{x1:x1,y1:y1,x2:x2,y2:y2}};
	var data = this.data
	var x = x1;
	var y = y1;
	while(true) {
		this.data.chars[x + "," + y] = arrayRepeat(" ", 128)
		orderData.push(x + "," + y)
		x++;
		if(x > x2) {
			x = x1
			y++;
			orderData.push(1);
		}
		if(y > y2) {
			break;
		}
	}
	this.data.plot = function(Tx, Ty, Cx, Cy, char) {
		if(data.chars[Tx + "," + Ty]) {
			if(data.chars[Tx + "," + Ty][Cy*16 + Cx]) {
				data.chars[Tx + "," + Ty][Cy*16 + Cx] = char
			}
		}
	}
	this.data.str = function() {
		var str = [];
		var tsr = ["", "", "", "", "", "", "", ""]
		for(var i in orderData) {
			var _dat = orderData[i]
			if(_dat === 1) {
				str = str.concat(tsr.join("\n"));
				str.push("\n");
				tsr = ["", "", "", "", "", "", "", ""];
			} else {
				var dat = data.chars[_dat];
				for(var i = 0; i < 128; i++) {
					tsr[Math.floor(i/16)] += dat[i]
				}
			}
		}
		var rs = str.join("");
		return rs.substr(0, rs.length - 1);
	}
	return this.data
} 

function fjoin(ar, str, len) {
	var s = ""
	for(var i = 0; i < len; i++) {
		s += ar[0]
		if(i < len - 1) {
			s += str
		}
		ar.shift();
	}
	return [s, ar.join("")];
}

function convertDate(timestamp) {
    var date = new Date(timestamp);
    var month = date.getMonth();
    var day = date.getDate();
    var year = date.getFullYear();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();
    var millisecond = date.getMilliseconds();
    minute = ("0" + minute).slice(-2);
    second = ("0" + second).slice(-2);
    millisecond = ("000" + millisecond).slice(-3);
    var ampm = "AM";
    if (hour > 12) {
        ampm = "PM";
        hour = hour - 12;
    }
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var compile = months[month] + " " + day + ", " + year + " " + hour + ":" + minute + ":" + second + "." + millisecond + " " + ampm;
    return compile;
};

module.exports.timemachine = function(req, callback) {
	if(req.method === "GET") {
		var world = csplit(url.parse(req.url.substr(1)).pathname, "accounts/timemachine/", 1)[1]
		if(world.charAt(world.length - 1) === "/") {
			world = world.substring(0, world.length - 1);
		}
		var time = 1000000;
		var sp = world.split("/");
		if(sp.length > 1) {
			var fgh = fjoin(sp, "/", sp.length - 1);
			time = parseInt(fgh[1]);
			world = fgh[0];
		}
		module.exports.yourworld(req, callback, {
			name: world,
			time: time
		});
	}
}
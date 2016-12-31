http = require("http");
url = require("url");
var sql = require("sqlite3").verbose(); // sqlite3
var fs = require("fs"); // file system
var prompt = require("./program/lib/edited_modules/prompt.js"); // prompter (ask questions/get answers)
var server = require("./program/nwot/server.js"); // main server script
var mime = require("./program/lib/mime.js"); // figure out the mime type
swig = require("swig"); // html templating engine (like Djangos)
querystring = require("querystring"); // parse querystrings
var listdir = require("./program/lib/listdir.js");
var crypto = require('crypto'); // hash algorithm
domain = require('domain'); // prevent crashes by returning "500"

_static = {};
var _staticPath = "./program/html/static/";
var _staticURL = "static/";

_template = {};
var _templatePath = "./program/html/templates/";

SETTINGS = require("./_settings.txt");
listdir(_static, _staticPath, _staticURL);
listdir(_template, _templatePath, "");

var DATABASE_PATH = SETTINGS.DATABASE_PATH;
var CHECK_STATE_PATH = SETTINGS.CHECK_STATE_PATH;
var LOG_PATH = SETTINGS.LOG_PATH;

var down = false;
var message = "";
var date = "No date yet...";
isDown = function(a) {
	if(!a) return down
	if(a) return [message, date];
}

prompt.message = ""; // do not display "prompt" before each question
prompt.delimiter = ""; // do not display ":" after "prompt"
prompt.colors = false; // disable dark gray color in a black console

var prompt_account_properties = {
	properties: {
		username: {
			message: 'Username: '
		},
		password: {
			description: 'Password: ',
			replace: '*',
			hidden: true
		},
		confirmpw: {
			description: 'Password (again): ',
			replace: '*',
			hidden: true
		}
	}
};

var prompt_account_yesno = {
	properties: {
		yes_no_account: {
			message: "You just installed the server, which means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):"
		}
	}
};

var command_props = {
	properties: {
		command: {
			message: ">"
		}
	}
};

logProblem = function(err) {
	if(SETTINGS.error_log) {
		try{
			var errs = err;
			if(typeof errs !== "string") {
				errs = errs.stack
			}
			errs = JSON.stringify(errs);
			err = "[" + errs + ", " + Date.now() + "]\r\n";
			fs.appendFile(LOG_PATH, err);
		}catch(e) {
			console.log(e)
		}
	}
}

var create_tables_grps = {}; // amount of tables added per request

var default_tables = [
"PRAGMA encoding='UTF-16'",
"\r\nCREATE TABLE \"auth_user\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"username\" varchar(30) NOT NULL UNIQUE,\r\n    \"first_name\" varchar(30) NOT NULL,\r\n    \"last_name\" varchar(30) NOT NULL,\r\n    \"email\" varchar(75) NOT NULL,\r\n    \"password\" varchar(128) NOT NULL,\r\n    \"is_staff\" bool NOT NULL,\r\n    \"is_active\" bool NOT NULL,\r\n    \"is_superuser\" bool NOT NULL,\r\n    \"last_login\" integer NOT NULL,\r\n    \"date_joined\" integer NOT NULL\r\n)\r\n",
"\r\nCREATE TABLE \"auth_session\" (\r\n    \"session_key\" varchar(40) NOT NULL PRIMARY KEY,\r\n    \"session_data\" text NOT NULL,\r\n    \"expire_date\" integer NOT NULL\r\n)\r\n",
"\r\nCREATE TABLE \"registration_registrationprofile\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL UNIQUE REFERENCES \"auth_user\" (\"id\"),\r\n    \"activation_key\" varchar(40) NOT NULL\r\n)\r\n",
"CREATE TABLE \"edit\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer REFERENCES \"auth_user\" (\"id\"),\r\n    \"ip\" char(15),\r\n    \"world_id\" integer NOT NULL REFERENCES \"world\" (\"id\"),\r\n    \"tileY\" integer NOT NULL,\r\n    \"tileX\" integer NOT NULL,\r\n    \"time\" integer NOT NULL,\r\n    \"content\" text NOT NULL\r\n)\r\n",
"\r\nCREATE TABLE \"tile\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"world_id\" integer NOT NULL REFERENCES \"world\" (\"id\"),\r\n    \"content\" varchar(128) NOT NULL,\r\n    \"tileY\" integer NOT NULL,\r\n    \"tileX\" integer NOT NULL,\r\n    \"properties\" text NOT NULL,\r\n    \"created_at\" integer NOT NULL,\r\n    UNIQUE (\"world_id\", \"tileY\", \"tileX\")\r\n)\r\n",
"\r\nCREATE TABLE \"whitelist\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL REFERENCES \"auth_user\" (\"id\"),\r\n    \"world_id\" integer NOT NULL REFERENCES \"world\" (\"id\"),\r\n    \"created_at\" integer NOT NULL,\r\n    \"updated_at\" integer NOT NULL,\r\n    UNIQUE (\"user_id\", \"world_id\")\r\n)\r\n",
"\r\nCREATE TABLE \"world\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"name\" text NOT NULL UNIQUE,\r\n    \"owner_id\" integer REFERENCES \"auth_user\" (\"id\"),\r\n    \"created_at\" integer NOT NULL,\r\n    \"updated_at\" integer NOT NULL,\r\n    \"public_readable\" bool NOT NULL,\r\n    \"public_writable\" bool NOT NULL,\r\n    \"properties\" text NOT NULL\r\n)"
]; // the default table names and arguments

var default_indexes = [
"CREATE INDEX \"edit_12ff7a21\" ON \"edit\" (\"world_id\")",
"CREATE INDEX \"edit_403f60f\" ON \"edit\" (\"user_id\")",
"CREATE INDEX \"tile_12ff7a21\" ON \"tile\" (\"world_id\")",
"CREATE INDEX \"whitelist_12ff7a21\" ON \"whitelist\" (\"world_id\")",
"CREATE INDEX \"whitelist_403f60f\" ON \"whitelist\" (\"user_id\")",
"CREATE INDEX \"world_5d52dd10\" ON \"world\" (\"owner_id\")",
"CREATE INDEX \"edit_\" ON \"edit\" (\"time\" ASC)"
]; //default indexes

default_tables = default_tables.concat(default_indexes);

mimetypes = mime.load();

var dtB = new sql.Database(DATABASE_PATH); // opens the database. if no database is found, it's created
var QTB = new sql.Database(":memory:");

var queue = []; // queue for database commands
var to_check = false;

function checkQueue() {
	if(queue.length === 0){
		to_check = false;
		return;
	}
	var mtd = queue[0][0];
	var sql = queue[0][1];
	var clbk = queue[0][2];
	var args = queue[0][3];
	var eachFC = queue[0][4];
	
	var in_memory = false;
	
	if(mtd.charAt(0) === "_") {
		in_memory = true;
		mtd = mtd.substr(1);
	}
	
	if(mtd === "run" || mtd === "each" || mtd === "get" || mtd === "all") {
		var OPT = [sql];
		if(args) OPT.push(args);
		if(mtd === "each" && !eachFC) OPT.push(function(){});
		if(mtd === "each" && eachFC) OPT.push(function(a, b){
			try{
				if(!a) {
					eachFC(a, b)
				} else {
					var erm = "SQL error: " + JSON.stringify(a);
					if(args) erm += " with args: " + JSON.stringify(args);
					erm += " using SQL: " + JSON.stringify(sql);
					throw erm;
				}
			} catch(e) {
				logProblem(e)
			}
		});
		OPT.push(function(a, b){
			queue.shift();
			checkQueue();
			try{
				if(!a) {
					if(clbk) clbk(a, b);
				} else {
					var erm = "SQL error: " + JSON.stringify(a);
					if(args) erm += " with args: " + JSON.stringify(args);
					erm += " using SQL: " + JSON.stringify(sql);
					throw erm;
				}
			}catch(e){
				logProblem(e)
			}
		})
		if(!in_memory) dtB[mtd](...OPT) // SQLite3 does not like ".apply"
		if(in_memory) QTB[mtd](...OPT)
	} else {
		queue.shift();
		checkQueue();
	}
};

function runServer() {
	server.begin(); // begin the server.
	prompt.get(command_props, comm_fc);
};

function comm_fc(err, res) {
	var js = res.command;
	if(js !== "rs" && !js.startsWith("end") && js !== "start") {
		try{
			var res = eval(js);
			console.log(res);
		} catch(e) {
			console.log(e);
		}
	}
	try{
		if(js.startsWith("end")) {
			var sp = js.substr(4)
			down = true;
			message = sp;
			date = new Date();
		}
		if(js === "start") {
			down = false;
		}
	} catch(e) {console.log(e)}
	prompt.get(command_props, comm_fc);
}

var pw_encryption = "sha512WithRSAEncryption";
encryptHash = function(pass, salt) {
	if(!salt) {
		var salt = crypto.randomBytes(10).toString("hex")
	}
	var hsh = crypto.createHmac(pw_encryption, salt).update(pass).digest("hex")
	var hash = pw_encryption + "$" + salt + "$" + hsh;
	return hash;
};

checkHash = function(hash, pass) {
	if(typeof hash !== "string") return false;
	hash = hash.split("$");
	if(hash.length !== 3) return false;
	if(typeof pass !== "string") return false;
	return encryptHash(pass, hash[1]) === hash.join("$");
};

checkQueue();

execSQL = function(mtd, sql, clbk, args, eachFC) { // execute the sql (pushes into the queue instead)
	var ar = [mtd, sql, clbk, args, eachFC]
	queue.push(ar)
	if(to_check === false) {
		checkQueue();
		to_check = true;
	}
};

dtB.serialize(function(){
	extr();
})

var letters_low = "abcdefghijklmnopqrstuvwxyz";
var letters_high = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function toUpper(str) {
	var len = str.length;
	str = str.split("");
	for(var i = 0; i < len; i++) {
		for(var f = 0; f < 26; f++) {
			if(letters_low.charAt(f) === str[i]) {
				str[i] = letters_high.charAt(f);
			}
		}
	}
	return str.join("");
}
var id_0 = 0;
createTables = function(list, callback) {
	var grp = id_0;
	id_0++;
	if(create_tables_grps[grp] === undefined) {
		create_tables_grps[grp] = 0
	}
	for(var i in list) {
		var sql = list[i];
		var args = null;
		var eachFC = null;
		if(typeof sql === "object") {
			eachFC = sql[2]
			args = sql[1]
			sql = sql[0];
		}
		var OPT = ["run", sql, function(){
			create_tables_grps[grp]++;
			if(create_tables_grps[grp] >= list.length) {
				delete create_tables_grps[grp]
				callback();
			}
		}]
		OPT.push(args)
		OPT.push(eachFC)
		execSQL.apply(null, OPT);
	}
}

var return_tables_grps = {}

returnTables = function(list, callback) {
	var grp = id_0;
	id_0++;
	var data = [];
	if(return_tables_grps[grp] === undefined) {
		return_tables_grps[grp] = 0
	}
	for(var i in list) {
		var sql = list[i];
		var args = null;
		var eachFC = null;
		if(typeof sql === "object") {
			eachFC = sql[2]
			args = sql[1]
			sql = sql[0];
		}
		var OPT = ["get", sql, function(a, b){
			return_tables_grps[grp]++;
			data.push(b)
			if(return_tables_grps[grp] >= list.length) {
				delete return_tables_grps[grp]
				callback(data);
			}
		}]
		OPT.push(args)
		OPT.push(eachFC);
		execSQL.apply(null, OPT);
	}
}

escape_sql = function(str) {
	str = str.replace(/'/g, "''")
	str = str.replace(/\"/g, "\"\"")
	return str
}
function pad_string(string, count, character) {
	var CS = character.repeat(count);
	var SJ = CS + string;
	return SJ.slice(-count);
}

make_date = function(tst) {
    var date = new Date(tst);
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var year = date.getFullYear();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();
	var milli = date.getMilliseconds();
	var compile = year + "-" + pad_string(month, 2, "0") + "-" + pad_string(day, 2, "0") + " " + pad_string(hour, 2, "0") + ":" + pad_string(minute, 2, "0") + ":" + pad_string(second, 2, "0") + "." + pad_string(milli, 3, "0") + "000"
    return compile;
};

reverse_date = function(str) {
	return new Date(str).getTime()
}

function extr() {
	passFunc = function(err, result) {
		var err = false;
		if(result['password'] !== result['confirmpw']) {
			console.log("Error: Your passwords didn't match.")
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.password.length > 128) {
			console.log("The password is too long. It must be 128 characters or less.");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}

		if(result.username.length > 30) {
			console.log("The username must be 30 characters or less.")
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.username.length < 1) {
			console.log("The username is too short");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(!result.username.match(/^(\w*)$/g)) {
			console.log("The username must contain the following characters: a-z A-Z 0-9 _");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}
		
		if(!err){
			var Date_ = Date.now()
			var passHash = encryptHash(result['password'])
			execSQL("run", "INSERT INTO auth_user VALUES(null, ?, '', '', '', ?, 1, 1, 1, ?, ?)", function(a, b){
				console.log("Superuser created successfully.\n");
				runServer();
			}, [result["username"], passHash, Date_, Date_]) // using "null" for row index will automatically assign it one.
		}
	}
	yesNoAccount = function(err, result) {
		var re = result['yes_no_account'];
		if(toUpper(re) === "YES") {
			prompt.get(prompt_account_properties, passFunc);
		}
		if(toUpper(re) === "NO") {
			runServer()
		}
		if(toUpper(re) !== "YES" && toUpper(re) !== "NO") {
			console.log("Please enter either \"yes\" or \"no\" (not case sensitive):");
			prompt.get(prompt_account_yesno, yesNoAccount);
		}
	}
	fs.readFile(CHECK_STATE_PATH, "utf8", function(a, data) {
		if(a !== null) {
			console.log("Setting up default tables...")
			createTables(default_tables, function(){
				console.log("Tables successfully set up.")
				var writeData = {
					"created": Date.now()
				}
				fs.writeFile(LOG_PATH, "", function(){
					fs.writeFile(CHECK_STATE_PATH, JSON.stringify(writeData), function(b) {
						prompt.start();
						prompt.get(prompt_account_yesno, yesNoAccount);
					})
				})
			})
		} else {
			runServer()
		}
	})
}
if(!global.fs) var fs = require("fs");

module.exports.lexConfig = function(file) {
	var data = fs.readFileSync(file, "utf8")
	var DATA_ = {};
	try{
		DATA_ = JSON.parse(data);
	} catch(e) {
		DATA_.error = 1;
		DATA_.errorDescription = "File does not have JSON data or it's corrupted."
	}
	return DATA_
}
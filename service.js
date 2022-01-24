const http = require('http'),
    fs = require('fs'),
    crypto = require('crypto'),
    path = require('path'),
    statik = require("node-static"),
    MODULE_PATH = "lua_modules",
    HOMEPAGE = "bs2tts.html";
const {roszParse} = require("./bin/roszParser");
const roszParser = require("./bin/Roster");


const TEN_MINUTES = 600000,
    PATH_PREFIX = "files/",
    FILE_NAME_REGEX = /(?<name>.+?)(?=.json)/,

    ERRORS = {
        invalidFormat: `<h2 class='error'>I can only accept .rosz files.</h2>
        <p>
            Please make sure you are attempting to upload your roster and not another file by accident!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        unknown: `<h2 class='error'>Something went wrong.</h2>
        <p>
            Please reach out to Yellow Man in the <a href='https://discord.gg/kKT6JKsdek'>BS2TTS discord server</a>.
            Please send your .rosz file along with your bug report, and thank you so much for your patience!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        fileWrite: `<h2 class='error'>Something went wrong while creating your roster.</h2>
        <p>
            Please reach out to Yellow Man in the <a href='https://discord.gg/kKT6JKsdek'>BS2TTS discord server</a>.
            Please send your .rosz file along with your bug report, and thank you so much for your patience!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        rosterNotFound: "Your roster code appears to have expired, please upload it again and get a new code."
    },

    MODULES = {
        MatchedPlay: {
            Constants: null,
            Module: null,
            ScriptKeys: null
        },
        Crusade: {
            Constants: null,
            Module: null,
            ScriptKeys: null
        }
    },
    SANITIZATION_MAPPING = {
        " & ": " and ",
        ">": "＞",
        "<": "＜"
    },

    SANITIZATION_REGEX = new RegExp(Object.keys(SANITIZATION_MAPPING).join("|"), "g");



Array.prototype.union = function(arr) {
    return Array.from(new Set(this.concat(arr))); // set removes duplicates
};

Array.prototype.isAllSameValue = function () {
    return Array.from(new Set(this)).length === 1;
};


const file = new statik.Server('./site'),
    currentFiles = new Set(fs.readdirSync(PATH_PREFIX).map(fileName => fileName.match(FILE_NAME_REGEX).groups.name)),
    server = http.createServer(function (req, res) {
        if (req.method === 'POST') {
            let data = [], dataLength = 0;

            req.on('data', chunk => {
                data.push(chunk);
                dataLength += chunk.length
            })
            .on('end', () => {
                let postURL = new URL(`http://${req.headers.host}${req.url}`),
                    buf = Buffer.alloc(dataLength),
                    uuid;

                do uuid = crypto.randomBytes(4).toString("hex");
                while (currentFiles.has(uuid));

                currentFiles.add(uuid);

                for (let i = 0, len = data.length, pos = 0; i < len; i++) {
                    data[i].copy(buf, pos);
                    pos += data[i].length;
                }

                if (postURL.pathname === "/format_and_store_army" || postURL.pathname === "/getFormattedArmy") {
                    try {
                        let armyDataObj = roszParse(buf);

                        if (postURL.pathname === "/format_and_store_army") {
                            armyDataObj.uiHeight = postURL.searchParams.get('uiHeight');
                            armyDataObj.uiWidth = postURL.searchParams.get('uiWidth');
                            armyDataObj.baseScript = buildScript(postURL.searchParams.get("modules").split(","));

                            fs.writeFile(`${PATH_PREFIX}${uuid}.json`,
                                roszParser.serialize(armyDataObj)
                                    .replace(" & ", " and "),
                                (err) => {
                                    let content, status;

                                    if (!err) {
                                        content = `{ "id": "${uuid}" }`;
                                        status = 200;
                                    } else {
                                        content = `{ "err": "${ERRORS.fileWrite}" }`;
                                        status = 500
                                    }

                                    sendHTTPResponse(res, content, status);
                                });
                        } else
                            sendHTTPResponse(res, roszParser.serialize(armyDataObj), 200);
                    }
                    catch (err) {
                        if (err.toString().includes("Invalid or unsupported zip format.")) {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.invalidFormat}" }`, 415);
                            console.log(err);
                        }
                        else {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.unknown}" }`, 500);
                            console.log(err);
                        }
                    }
                }

                else if (postURL.pathname === "/getArmyCode") {
                    try {
                        let armyData = JSON.parse(buf.toString());

                        sendHTTPResponse(res, `{ "code": "${uuid}" }`, 200);

                        formatAndStoreXML(  uuid,
                                            armyData.order,
                                            armyData.units,
                                            postURL.searchParams.get('uiHeight'),
                                            postURL.searchParams.get('uiWidth'),
                                            postURL.searchParams.get('decorativeNames'),
                                            buildScript(postURL.searchParams.get("modules").split(",")));
                    }
                    catch (err) {
                        sendHTTPResponse(res, `{ "err": "${ERRORS.unknown}" }`, 500);
                        console.log(err);
                    }
                }
            });
        }
        else if (req.method === "GET") {
            if (req.url === "/favicon.ico")
                file.serveFile('/img/favicon.ico', 200, {}, req, res);

            else if (req.url === "/")
                file.serveFile(HOMEPAGE, 200, {}, req, res);

            else {
                let getURL = new URL(`http://${req.headers.host}${req.url}`);

                if (getURL.pathname === "/get_army_by_id") {
                    try {
                        const id = getURL.searchParams.get('id').trim(),
                            fileData = fs.readFileSync(`${PATH_PREFIX}${id}.json`);

                        if (!fileData)
                            sendHTTPResponse(res, `{ "err": "Roster not found!" }`, 404);

                        else
                            sendHTTPResponse(res, fileData);
                    }

                    catch (err) {
                        sendHTTPResponse(res, `{ "err": "${ERRORS.rosterNotFound}" }`, 404);
                        console.log(err);
                    }
                }

                else
                    file.serve(req, res);
            }
        }
    });

/**
 * Sends an http response with the given ServerResponse
 * @param {http.ServerResponse} response The response to write to
 * @param {*} data The data to be written to the response
 * @param {number} code The http header response code
 * @param {string} contentType The content type header to be sent with the response
 */
function sendHTTPResponse(response, data, code = 200, contentType = 'application/json') {
    response.writeHead(code, {'Content-Type': contentType});
    response.write(data);
    response.end();
}

function cleanFiles() {
    fs.readdir(PATH_PREFIX, (err, files) => {
        if (err)
            return;

        if (!files || typeof files[Symbol.iterator] !== 'function') {
            console.log("for some reason files is not iterable");
            return;
        }

        for (const filePath of files) {
            if ((Date.now() - TEN_MINUTES) > fs.statSync(PATH_PREFIX + filePath).mtime) {

                fs.unlink(path.join(PATH_PREFIX, filePath), () => {});
            }
        }
    });
}

function loadModules() {
    let moduleMapText = fs.readFileSync(path.join(MODULE_PATH, "module_mapping.json"));

    for (const [name, module] of Object.entries(JSON.parse(moduleMapText))) {
        if (!MODULES[name]) continue;
        for (const [field, fieldData] of Object.entries(module)) {
            if (field === "ScriptKeys")
                MODULES[name].ScriptKeys = fieldData;
            else
                MODULES[name][field] = fs.readFileSync(path.join(MODULE_PATH, fieldData));
        }
    }
}

/**
 * Formats the given modules into the appropriate lua scripting string to be given to units
 * @param {string[]} modules An array containing the names of the modules to be loaded
 * @returns A string containing the fully formatted lua scripting for the army
 */
function buildScript(modules) {
    let scripts = [],
        scriptingMap = [],
        modulesToLoad = modules.map(name => MODULES[name])
                                .filter(module => module);

        scriptingMap.length = 10;

    // load constants first because I always want them at the top
    scripts.push("local scriptingFunctions");
    scripts.push(...modulesToLoad.map(module => module.Constants));
    scripts.push(...modulesToLoad.map(module => module.Module));

    scriptingMap.fill("\tnone");

    for (const map of modulesToLoad.map(module => module.ScriptKeys))
        for (const [key, func] of Object.entries(map))
            scriptingMap[parseInt(key, 10)-1] = `\t--[[${key}]]${" ".repeat(3-key.length)+func}`;

    scripts.push(`-- this needs to be defined after all scripting functions\nscriptingFunctions = {\n${scriptingMap.join(",\n")}\n}`);

    return "\n".repeat(5) + scripts.join("\n".repeat(5));
}





/********* ROSTER PARSING FOR .rosz FILES *********/










/********* UNIT DATA TO XML *********/

function formatAndStoreXML(id, order, armyData, uiHeight, uiWidth, decorativeNames, baseScript) {
    storeFormattedXML(id, undefined, undefined, armyData, uiHeight, uiWidth, decorativeNames, baseScript, order);
}

function storeFormattedXML(id, xml, height, armyData, uiHeight, uiWidth, decorativeNames, baseScript, order) {
    fs.writeFileSync(`${PATH_PREFIX}${id}.json`, JSON.stringify({
        xml,
        order,
        height,
        armyData: JSON.parse(sanitize(JSON.stringify(armyData))), // yes, I know this looks awful
        uiHeight,
        uiWidth,
        decorativeNames,
        baseScript
    }));
}






/**
 * Replaces any troublesome characters with "sanitized" versions so as to not break scripting
 * @param {string} str The string to be sanitized
 * @returns {string} The sanitized string
 */
function sanitize(str) {
    return str.replace(SANITIZATION_REGEX, match => SANITIZATION_MAPPING[match]);
}

module.exports.server = server
module.exports.loadModules = loadModules
module.exports.cleanFiles = cleanFiles
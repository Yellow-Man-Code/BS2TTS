const port = process.env.PORT || 3000,
    http = require('http'),
    //https = require('https'),
    crypto = require('crypto'),
    fs = require('fs'),
    AdmZip = require('adm-zip'),
    parseXML = require('xml2js').parseString,
    //html = fs.readFileSync('bs2tts.html'),
    util = require("util"),
    //url = require("url"),
    path = require('path'),
    statik = require("node-static"),
    //xmlBuilder = require("xmlbuilder2"),
    //FAVICON_PATH = path.join(__dirname, 'favicon.ico'),
    MODULE_PATH = "lua_modules",
    HOMEPAGE = "bs2tts.html";


const ONE_MINUTE = 60000,
    TEN_MINUTES = 600000,
    PATH_PREFIX = "files/",
    FILE_NAME_REGEX = /(?<name>.+?)(?=.json)/,
    factionKeywordRegex = /Faction: (?<keyword>.+)/,
    abilityTrimRegex = /(?:\d+(?:\.|:)|\d+\-\d+(?:\.|:))?\s*(?<ability>.+)/,
    woundTrackWoundsRemainingRegex = /(?<wounds>\d+\-\d+\+?|\d+\+)(?=\s*wounds(?: remaining)?)/i,
    woundTrackProfileNameRegex = /(?<name>^[^[\()]+?)\s*(?:(?:\[\d\]|\(\w\)| \w )\s*(?:\(\d+\-\d+\+?|\(\d+\+)|\s*\(\d+\-\d+\+?|\(\d+\+)/,
    weaponNameWithoutNumberRegex = /^(?:(?<number>\d+)x )?(?<weaponName>.+)/,
    statDamageCheckRegex = /^stat damage /i,
    bracketValueRegex = /(?<min>\d+)\-(?<max>\d+)/,
    weaponToIgnoreRegex = /of the profiles below|select one of the following profiles/i,
    woundTrackTypeNameRegex = /^wound track|wound track$/i,
    psykerNameRegex = /^Psyker \((?<name>.+?)\)/,
    smiteTestRegex = /^smite\b/i,
    weaponTypeRegex = /(?<type>.+?)(?:[0-9dD\/ ]+)?$/,
    
    keywordsToIgnore = ["HQ", "Troops", "Elites", "Fast Attack", "Heavy Support", "Flyer", "Dedicated Transport", "Lord of War", "No Force Org Slot", "Warlord"],
    /* convertCharacteristicNames = {
        "Move": "m",
        "Weapon Skill": "ws",
        "Ballistic Skill": "bs",
        "Strength": "s",
        "Toughness": "t",
        "Wounds": "w",
        "Attacks": "a",
        "Leadership": "ld",
        "Save": "sv"
    }, */

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
            .replace(/[\n\r]/g, "\\n")
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
    
    WEAPON_TYPE_VALUES = {
        "rapid fire": 0,
        assault: 0,
        heavy: 0,
        macro: 0,
        pistol: 1,
        grenade: 2,
        melee: 3
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
                } ;

                if (postURL.pathname === "/format_and_store_army" || postURL.pathname === "/getFormattedArmy") {
                    try {
                        let zip = new AdmZip(buf),
                            zipEntries = zip.getEntries();
                    
                        for (let i = 0; i < zipEntries.length; i++)
                            parseXML(zip.readAsText(zipEntries[i]), (_err, result) => {
                                fs.writeFile("output.json", JSON.stringify(result.roster.forces, null, 4), () =>{})
                                //parseRos(result.roster.forces);
                                let armyDataObj = parseRos(result.roster.forces);

                                if (postURL.pathname === "/format_and_store_army") {
                                    armyDataObj.uiHeight = postURL.searchParams.get('uiHeight');
                                    armyDataObj.uiWidth = postURL.searchParams.get('uiWidth');
                                    armyDataObj.baseScript = buildScript(postURL.searchParams.get("modules").split(","));

                                    fs.writeFile(`${PATH_PREFIX}${uuid}.json`, 
                                                JSON.stringify(armyDataObj, replacer)
                                                    .replace(" & ", " and "), 
                                                (err) => {
                                                    let content,status;
            
                                                    if (!err) {
                                                        content = `{ "id": "${uuid}" }`;
                                                        status = 200;
                                                    }
                                                    else {
                                                        content = `{ "err": "${ERRORS.fileWrite}" }`;
                                                        status = 500
                                                    }
            
                                                    sendHTTPResponse(res, content, status);
                                                });
                                }
                                else
                                    sendHTTPResponse(res, JSON.stringify(armyDataObj, replacer), 200);
                            });
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

                        /* if (postURL.pathname === "/format_and_store_army") {
                            armyDataObj.uiHeight = postURL.searchParams.get('uiHeight');
                            armyDataObj.uiWidth = postURL.searchParams.get('uiWidth');
                            armyDataObj.baseScript = buildScript(postURL.searchParams.get("modules").split(","))

                            fs.writeFile(`${PATH_PREFIX}${uuid}.json`, 
                                        JSON.stringify(armyDataObj, replacer)
                                            .replace(" & ", " and "), 
                                        (err) => {
                                            let content,status;
    
                                            if (!err) {
                                                content = `{ "id": "${uuid}" }`;
                                                status = 200;
                                            }
                                            else {
                                                content = `{ "err": "${ERRORS.fileWrite}" }`;
                                                status = 500
                                            }
    
                                            sendHTTPResponse(res, content, status);
                                        });
                        }

                        else
                            sendHTTPResponse(res, JSON.stringify(armyDataObj, replacer).replace(" & ", " and "), 200); */
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
                    const id = getURL.searchParams.get('id').trim(),
                        fileData = fs.readFileSync(`${PATH_PREFIX}${id}.json`);

                    if (!fileData) 
                        sendHTTPResponse(res, `{ "err": "Roster not found!" }`, 404);

                    else
                        sendHTTPResponse(res, fileData);

                    /* fs.readFile(`${PATH_PREFIX}${id}.json`, (err, data) => {
                        if (err) 
                            sendHTTPResponse(res, `{ "err": "Roster not found!" }`, 404);

                        else
                            sendHTTPResponse(res, data);
                    }); */
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


// Listen on port 3000, IP defaults to 127.0.0.1
server.listen(port);
loadModules();

// Put a friendly message on the terminal
console.log('Server running at http://127.0.0.1:' + port + '/');

setInterval(() => {
    fs.readdir(PATH_PREFIX, (err, files) => {
        if (err) 
            return;

        if (!files || typeof files[Symbol.iterator] !== 'function') {
            console.log("for some reason files is not iterable");
            return;
        }

        for (const filePath of files) {
            if ((Date.now() - TEN_MINUTES) > fs.statSync(PATH_PREFIX + filePath).mtime) {

                fs.unlink(path.join(PATH_PREFIX, filePath), err => {});
            }
        }
    });

    //let stats = fs.statSync("/dir/file.txt");
    //let mtime = stats.mtime;
}, ONE_MINUTE);


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




class Model {
    name;
    abilities = [];
    weapons = []; // { name: "", number: 0 }
    number;

    constructor(modelName, count = 1) {
        this.name = modelName;
        this.number = count;
    }


    addAbilityData (profileData) {
        this.abilities.push(profileData.$.name.match(abilityTrimRegex).groups.ability);
    }

    addRule (ruleName) {
        this.rules.push(ruleName);
    }

    addWeaponData (weaponData, selection) {
        let newMatch = weaponData.$.name.match(weaponNameWithoutNumberRegex).groups,
            selectionNumber = selection.$.name.match(weaponNameWithoutNumberRegex).groups.number,
            newNumber = newMatch.number ? parseInt(newMatch.number, 10) : selectionNumber ? parseInt(selectionNumber, 10) : 1;
        
        for (const weapon of this.weapons) {
            if (weapon.name === newMatch.weaponName) {
                weapon.number += newNumber;
                return;
            }
        }

        this.weapons.push({ name: newMatch.weaponName, number: newNumber });
    }

    handleSelectionDataRecursive (selectionData) {
        for (const selection of selectionData[0].selection) {
            if (selection.profiles && selection.profiles[0] !== "")
                for (const profile of selection.profiles[0].profile)
                    switch (profile.$.typeName.toLowerCase()) {
                        case "weapon": 
                            let ignore = -1;

                            for (const char of profile.characteristics[0].characteristic) {
                                if (char.$.name === "Type" && (char._ === "-" || !char._))
                                    ignore++;
                    
                                if (char.$.name === "Abilities" && char._ && char._.match(weaponToIgnoreRegex))
                                    ignore++;
                            }

                            if (0 < ignore) continue;

                            this.addWeaponData(profile, selection);
                            break;
                        case "abilities":                                    
                            this.addAbilityData(profile);
                            break;
                    }
            
            if (selection.selections && selection.selections[0] !== "")
                this.handleSelectionDataRecursive(selection.selections);
        }
    }

    setWeapons(weaponArray) {
        this.weapons = weaponArray;
    }

    add(model) {
        this.number += model.number;
        this.abilities = this.abilities.union(model.abilities);

        for (const weapon of model.weapons)
            if (this.weapons.findIndex(currWeapon => currWeapon.name === weapon.name) < 0)
                this.weapons.push(weapon);
    }

    isEqualTo(otherModel, strict) {
        if (this.name !== otherModel.name) return false;
        
        if (this.abilities.length !== otherModel.abilities.length) return false;
        else
            for (const ability of this.abilities)
                if (!otherModel.abilities.includes(ability)) 
                    return false;
        
        if (this.weapons.length !== otherModel.weapons.length) return false;
        else
            for (const weapon of this.weapons)
                if (otherModel.weapons.findIndex(otherWeapon => 
                                    weapon.name === otherWeapon.name && weapon.number === otherWeapon.number) < 0) 
                    return false;

        if (strict && this.number !== otherModel.number)
            return false;

        return true;
    }
}



class ModelCollection {
    models = {}; /*
            {
                "model name": [
                    { name: ""... },
                    { name: ""...(different stuff) }
                ]
            }
    */
    //characteristicProfiles;
    totalNumberOfModels = 0;
    
    [Symbol.iterator]() { 
        let index = 0,
            models = Object.values(this.models).flat();

        return {
          next: () => {
            if (index < models.length) {
              return {value: models[index++], done: false}
            } else {
              return {done: true}
            }
          }
        }
    }


    constructor(firstModel) {
        //this.models = {};
        //this.characteristicProfiles = [];
        //this.totalNumberOfModels = 0;

        if (firstModel) {
            this.models[firstModel.name] = [firstModel];
            this.totalNumberOfModels += firstModel.number;
        }
    }



    addModelFromData (name, selectionData, number) {
        let newModel = new Model(name, number ? parseInt(number, 10) : number);
        //console.log(`Name: ${name}; Number: ${number}`);

        //log(selectionData);
        //console.log("selections: " + selectionData);

        if (selectionData && selectionData[0] !== "" && selectionData[0].selection)
            newModel.handleSelectionDataRecursive(selectionData);

        this.add(newModel);
    }

    /**
     * Looks to see if the collection contains the given model, and optionally increments the number of that model
     * @param {Model|String} model the model to look for
     * @param {boolean} increment whether or not the number of the model should be incremented (to save operation time)
     * @returns {boolean} true if the model was found somewhere in the collection, false otherwise
     */
    has(model) {
        if (typeof model === "string") {
            if (!this.models[model]) return undefined;
            return this.models[model].find(curModel => curModel.number > 0); // ignore models with number 0
        }
            
        if (this.models[model.name])
            for (const m of this.models[model.name])
                if (model.isEqualTo(m))
                    return m;
        
        return undefined;
    }

    add(...models) {
        let foundModel;

        for (const model of models) {
            if (model === null) continue;

            if ((foundModel = this.has(model)) === undefined) {
                if (this.has(model.name))
                    this.models[model.name].push(model);
    
                else
                    this.models[model.name] = [model];
            }
            else foundModel.add(model);

            this.totalNumberOfModels += model.number
        }
    }

    /**
     * Assigns the given weapon to all models in the collection. Generally used with a weapon definition (not profile).
     * @param {Weapon[]} weaponArray the weapon to be assigned
     */
    /* assignWeaponsToAllModels(weaponArray) {
        for (const key of Object.keys(this.models))
            for (const model of this.models[key])
                model.setWeapons(weaponArray);
    } */

    getAllModels() {
        return Object.values(this.models).flat();
    }

    getAllWeaponNames () {
        return [...new Set(this.getAllModels().map(model => model.weapons.map(weapon => weapon.name)).flat())];
    }

    getAllAbilities () {
        return [...new Set(this.getAllModels().map(model => model.abilities).flat())];
    }


    toJSON() {
        return { 
            models: Object.fromEntries(
                        Object.values(this.models)
                                                /* .map(modelArray => modelArray.sort((a,b) => {
                                                    return a.name.localeCompare(b.name)
                                                })) */
                                                .flat()
                                                .map(model => [crypto.randomBytes(8).toString("hex"), model])),
            characteristicProfiles: this.characteristicProfiles,
            totalNumberOfModels: this.totalNumberOfModels
        };
    }

    remove (modelName) {
        for (const name of Object.keys(this.models))
            if (name === modelName) {
                this.totalNumberOfModels -= this.models[name].reduce((prev,curr) => prev + curr.number, 0);
                delete this.models[name];
            }
    }
}




class Unit {
    name;
    decorativeName;
    factionKeywords = new Set();
    keywords = new Set();
    abilities = {};
    models  = new ModelCollection();
    modelProfiles = {};
    weapons = {};
    //weapons  = [];
    rules = [];
    uuid = crypto.randomBytes(4).toString("hex"); 
    unassignedWeapons = [];
    pl = 0;
    isSingleModel;



    constructor (name, decorativeName, isSingleModel) {
        this.name = name.trim();
        this.decorativeName = decorativeName;
        this.isSingleModel = isSingleModel;
    }


    addModelProfileData (profileData, differentName) {
        //this.models.addModelFromData(profileData.$.name, selectionData, number);
        let profileName = differentName ? differentName.trim() : profileData.$.name.trim();

        if (!this.modelProfiles[profileName]) {
            let data = { name: profileName };

            for (const char of profileData.characteristics[0].characteristic)
                if (char.$.name.toLowerCase() === "save")
                    data.sv = char._.trim()
                else
                    data[char.$.name.toLowerCase()] = char._.trim()

            this.modelProfiles[profileName] = data;
        }
    }

    addModelSimpleData (name, selectionData, number) {
        this.models.addModelFromData(name.trim(), selectionData, number);
    }

    addAbility (profileData) {
        let trimmedName = profileData.$.name.match(abilityTrimRegex).groups.ability,
            dangerousReplace = { "[": "(", "]": ")", '"': '\\"' }

        if (!this.abilities[trimmedName])
            this.abilities[trimmedName] = { 
                name: trimmedName, 
                desc: profileData.characteristics[0].characteristic[0]._.replace(/[\[\]"]/g, m => dangerousReplace[m]) 
            };
    }

    addRule (ruleData) {
        let trimmedName = ruleData.$.name.match(abilityTrimRegex).groups.ability;

        if (!this.rules.includes(trimmedName))
            this.rules.push(trimmedName);
    }

    addWeapon (weaponData) {
        let data = { name: weaponData.$.name },
            mightIgnore = false;
        
        for (const char of weaponData.characteristics[0].characteristic) {
            if (char.$.name === "Type" && (char._ === "-" || !char._)) {
                if (mightIgnore) return;
                else mightIgnore = true;
            }

            if (char.$.name === "Abilities" && char._ && char._.match(weaponToIgnoreRegex)) {
                if (mightIgnore) return; // I don't want these sorts of profiles showing up
                else mightIgnore = true;
            }

            data[char.$.name.toLowerCase()] = char._;
        }

        if (!data.abilities) 
            data.abilities = "-";

        this.weapons[weaponData.$.name] = data;
    }

    addKeyword (keywordData) {
        let factionMatch = keywordData.$.name.match(factionKeywordRegex);

        if (factionMatch)
            this.factionKeywords.add(factionMatch.groups.keyword) //.push(factionMatch.groups.keyword);
        else if (!keywordsToIgnore.includes(keywordData.$.name))
            this.keywords.add(keywordData.$.name);
    }

    addPL (pl) {
        this.pl += pl;
    }

    addBracket (bracketData, modelName) {
        let data = [],
            bracket = "";
            
        for (const char of bracketData.characteristics[0].characteristic) {
            if (char.$.name !== "Remaining W" && char.$.name !== "Wounds")
                data.push(char._);
            
            else {
                if (!char._ || char._ === "-") return;

                bracket = char._;
            }
        }

        if (!this.woundTrack)
            this.woundTrack = {};
        
        if (statDamageCheckRegex.test(modelName)) {
            // first check for a predefined model profile that this bracket should match
            // this seems problematic
            let firstName = this.getFirstChangingProfile();

            if (firstName)
                modelName = firstName;
        }

        if (!this.woundTrack[modelName])
            this.woundTrack[modelName] = {};

        this.woundTrack[modelName][bracket] = data;
    }

    getFirstChangingProfile () {
        for (const profile of Object.values(this.modelProfiles))
            for (const val of Object.values(profile))
                if (val === "*")
                    return profile.name;

        return undefined;
    }


    handleSelectionDataRecursive (selectionData, parentSelectionData, isTopLevel = false) {
        //let selectionType = "";
        switch (selectionData.$.type.toLowerCase()) {
            case "model":
                // sometimes the data creators mark a unit as a "model" for whatever reason,
                // then later on describe the actual models in the unit (marking those as "unit" ugh)
                if (selectionData.selections && 
                    selectionData.selections[0] !== "" && 
                    selectionData.selections[0].selection.findIndex(selection => selection.$.type.toLowerCase() === "unit") >= 0)
                    break;

                this.addModelSimpleData(selectionData.$.name, selectionData.selections, selectionData.$.number);
                break;
            case "unit":
                if (selectionData.selections && selectionData.selections[0] !== "") {
                    let found = false;
        
                    // search selections for models or units.
                    // if we cant find any, assume the unit is supposed to be a model
                    for (const selection of selectionData.selections[0].selection) {
                        if (selection.$.type === "model" || selection.$.type === "unit") {
                            found = true;
                            break;
                        }
        
                        else if (selection.profiles && selection.profiles[0] !== "") {
                            for (const profile of selection.profiles[0].profile) {
                                if (profile.$.typeName.toLowerCase() === "unit") {
                                    found = true;
                                    break;
                                }
                            }
        
                            if (found) break;
                        }
                    }
        
                    if (!found)
                        this.addModelSimpleData(selectionData.$.name, selectionData.selections, selectionData.$.number);
                }
                break;
            case "upgrade":
                if (!parentSelectionData || parentSelectionData.$.type.toLowerCase() === "model") break;
                if (selectionData.profiles && selectionData.profiles[0] !== "") {
                    let found = false;

                    for (const profile of selectionData.profiles[0].profile){
                        if (profile.$.typeName.toLowerCase() === "unit" || profile.$.typeName.toLowerCase() === "model") {
                            found = true;
                            break;
                        }
                    }

                    if (found) break;
                }
                // Sometimes the data creators mark models as "upgrade"s without even providing 
                // a clue that theyre supposed to be models. This tries to catch that at least in a special
                // case (Space Marine Bike Squad). Basically, if the model profile's name can be found in an upgrade's name,
                // assume that the upgrade is referencing a model. I fear that this will have consequences with other units.
                // If it does, just make this an actual special case called out by name.
                if (Object.keys(this.modelProfiles).findIndex(name => selectionData.$.name.includes(name)) >= 0) {
                    this.addModelSimpleData(selectionData.$.name, selectionData.selections, selectionData.$.number);
                    
                    // by this point, since there were no models defined in the unit's selections,
                    // the "unit" will have already been added as a model, so we need to remove it if it exists
                    if (parentSelectionData.$.type.toLowerCase() === "unit")
                        this.models.remove(parentSelectionData.$.name);
                }
                break;
        }

        if (selectionData.profiles && selectionData.profiles[0] !== "") {
            for (const profile of selectionData.profiles[0].profile) {
                switch (profile.$.typeName.toLowerCase()) {
                    case "unit": 
                    case "model":
                        if (//selectionData.$.name.includes(profile.$.name) && // hopefully this isn't necessary
                            selectionData.$.type.toLowerCase() !== "unit" &&
                            selectionData.$.type.toLowerCase() !== "model" &&
                            (!isTopLevel || // special case for top level of selection data being marked as upgrade
                                (selectionData.selections && selectionData.selections[0] !== "" &&
                                    selectionData.selections[0].selection.findIndex(selection => selection.$.type === "model") < 0))) // another special case for characters being marked as upgrade
                                this.addModelSimpleData(profile.$.name, selectionData.selections, selectionData.$.number);

                        if (selectionData.$.type.toLowerCase() === "model" && 
                            selectionData.$.name !== profile.$.name &&
                            !profile.$.name.match(woundTrackProfileNameRegex))
                            this.addModelProfileData(profile, selectionData.$.name);
                        else 
                            this.addModelProfileData(profile);
                        break;
                    case "abilities":
                        this.addAbility(profile);
                        break;
                    case "weapon":
                        this.addWeapon(profile);
                        break;
                    case "wound track":
                        this.addBracket(profile, selectionData.$.name);
                        break;
                    case "psyker":
                        if (!this.psykerProfiles) this.psykerProfiles = [];
                        let matchedName = profile.$.name.match(psykerNameRegex),
                            psykerName = matchedName ? matchedName.groups.name : profile.$.name,
                            psykerProfile;//matchedName ? matchedName.groups.name : profile.$.name }; // there should only be one per profile

                        for (const model of this.models)
                            if (psykerName === model.name)
                                psykerProfile = { name: psykerName };

                        if (!psykerProfile)
                            psykerProfile = { name: this.name };

                        for (const char of profile.characteristics[0].characteristic) {
                            if (char.$.name.toLowerCase() === "powers known") psykerProfile.known = char._;
                            else psykerProfile[char.$.name.toLowerCase()] = char._;
                        }

                        this.psykerProfiles.push(psykerProfile)
                        break;
                    case "psychic power":
                        if (!this.powersKnown) this.powersKnown = [];
                        let power = { name: profile.$.name };

                        for (const char of profile.characteristics[0].characteristic) {
                            let name = char.$.name.replace(" ", "")
                            power[`${name.charAt(0).toLowerCase()}${name.slice(1)}`] = char._;
                        }

                        this.powersKnown.push(power);
                        break;
                    default:
                        // Special Cases
                        let isStatDamage = statDamageCheckRegex.test(profile.$.typeName.toLowerCase())

                        // handle IG vehicle wound tracks
                        if (isStatDamage)
                            this.addBracket(profile, parentSelectionData ? parentSelectionData.$.name : this.name);//this.name);

                        // sometimes the data creators like to put extra stuff before or after "Wound Track"
                        if (profile.$.typeName.match(woundTrackTypeNameRegex))
                            this.addBracket(profile, selectionData.$.name)

                        // very rarely, a data creator will put an unexpected typeName for a model profile
                        if (profile.$.name.match(woundTrackWoundsRemainingRegex))
                            this.addModelProfileData(profile)
                }
            }
        }

        if (selectionData.rules && selectionData.rules[0] !== "")
            for (const rule of selectionData.rules[0].rule)
                this.addRule(rule);

        if (selectionData.selections && selectionData.selections[0] !== "")
            for (const selection of selectionData.selections[0].selection)
                this.handleSelectionDataRecursive(selection, selectionData); // recursively search selections
                            

        if (selectionData.categories && selectionData.categories[0] !== "")
            for (const category of selectionData.categories[0].category)
                    this.addKeyword(category);

        if (selectionData.costs && selectionData.costs[0] !== "")
            for (const cost of selectionData.costs[0].cost)
                if (cost.$.name.trim() === "PL") {
                    this.addPL(parseInt(cost.$.value, 10));
                    break;
                }
    }

    update () {
        //log(this)
        this.addAbilitiesToAllModels();
        this.checkWeapons();
        this.checkForStrangeWoundTrackFormatting();
        this.sortWoundTracks();
        this.addSmiteIfNecessary();
        this.makeSureWoundTrackNameExists();
        this.checkIfIsSingleModel();
        this.checkModelNames();
        log(this);
        
        return this;
    }

    /**
     * Adds all abilities that are only on the unit as a whole to every model in the unit
     */
    addAbilitiesToAllModels () {
        let currentlyAssignedAbilities = this.models.getAllAbilities(),
            abilitiesToAdd = Object.keys(this.abilities).filter(ability => !currentlyAssignedAbilities.includes(ability));

        for (const model of this.models)
            model.abilities = model.abilities
                                    .union(abilitiesToAdd)
                                    .union(this.rules); // I dont know which is more efficient: this or concat first then union
    }

    /**
     * Checks the weapons the unit has against the weapons that the models in the unit have.
     * Any weapons that are found on the unit but not on any models are added to unassignedWeapons.
     * If no model has any weapons, all unassigned weapons are added to every model. (and are no longer considered unassigned)
     * NOTE: this behavior may need to change depending on how some units are formatted.
     */
    checkWeapons () {
        let assignedWeapons = this.models.getAllWeaponNames(),
            unassignedWeapons = Object.keys(this.weapons)
                                    .filter(weaponName => !assignedWeapons.includes(weaponName))
                                    .map(weaponName => { return { name: weaponName, number: 1 }});
        
        /* for (const model of this.models)
            if (model.weapons.length === 0) {
                model.setWeapons(unassignedWeapons);
                assigned = true;
            } */
        if (assignedWeapons.length === 0) {
            for (const model of this.models)
                model.setWeapons(unassignedWeapons);
        }
        else
            this.unassignedWeapons = unassignedWeapons;
    }

    /**
     * Some data creators (for some reason) don't use the wonderful wound track formatting,
     * they just input the wound track as multiple different profiles for a single model.
     * This is a workaround for those situations.
     * NOTE: this currently only works for single model units
     */
    checkForStrangeWoundTrackFormatting() {
        // if there is a profile with the words "wounds remaining",
        // it's safe to assume it's supposed to be a bracket
        if (Object.keys(this.modelProfiles).findIndex(name => !!name.match(woundTrackWoundsRemainingRegex)) >= 0) {
            let bracketProfiles = {}, //Object.entries(this.modelProfiles)
                                    //.filter(([name, bracket]) => !!name.match(woundTrackWoundsRemainingRegex))
                                    //.map(([name, bracket]) => bracket),
                otherProfiles = {},
                baseProfile,
                characteristics,
                defaultProfile,
                profileName;
                
            // hopefully fix some special cases where data creators named bracket profiles wrong
            // if there's only one kind of model in the unit, assume all the bracket profiles are for that model
            if (Object.keys(this.models.models).length == 1 && 
                    Object.keys(this.modelProfiles).findIndex(name => !name.match(woundTrackWoundsRemainingRegex)) < 0) {
                bracketProfiles[this.name] = Object.values(this.modelProfiles);
                profileName = this.name;
            }

            else { 
                for (const [name, profile] of Object.entries(this.modelProfiles)) {
                    if (name.match(woundTrackWoundsRemainingRegex)) {
                        profileName = name.match(woundTrackProfileNameRegex).groups.name.trim();
                        if (!bracketProfiles[profileName]) 
                            bracketProfiles[profileName] = [profile];
                        else
                            bracketProfiles[profileName].push(profile);

                        // if the data creator just included the already formatted profile, ignore it
                        if (otherProfiles[profileName])
                            delete otherProfiles[profileName];
                    }
                    else
                        otherProfiles[name] = profile;
                }
            }
            
            this.woundTrack = {}; // set up a wound track
            this.modelProfiles = otherProfiles;

            // if there are somehow model profiles that arent bracket profiles,
            // but there is only one model in the unit, something's weird (e.g. Canis Rex).
            // so, add the extraneous model to the unit
            if (Object.keys(this.models.models).length == 1 && Object.keys(otherProfiles).length > 0)
                for (const [key,profile] of Object.entries(otherProfiles))
                    this.models.add(new Model(key));
            
            // sort the profiles so that we can be sure to pick the one that has the wounds for later
            for (const profiles of Object.values(bracketProfiles)) {
                profiles.sort((a,b) => {
                    let aWounds = a.name.match(woundTrackWoundsRemainingRegex).groups.wounds,
                        bWounds = b.name.match(woundTrackWoundsRemainingRegex).groups.wounds;
    
                    if (bWounds.indexOf("+") > 0) return 1;
                    if (aWounds.indexOf("+") > 0) return -1;
    
                    let bMin = bWounds.match(bracketValueRegex).groups.min,
                        aMax = aWounds.match(bracketValueRegex).groups.max;
    
                    return bMin - aMax;
                });
            }

            let replaced = false;
            
            for (const [name, profiles] of Object.entries(bracketProfiles)) {
                this.woundTrack[profileName] = {};
                characteristics = { m:[],ws:[],bs:[],s:[],t:[],w:[],a:[],ld:[],sv:[] };
                defaultProfile = { name: profileName };
                baseProfile = profiles[0];

                for (const bracket of profiles) {

                    for (const model of this.models) {
                        if (model.name === bracket.name) {
                            if (replaced) 
                                this.models.remove(model.name);
                                
                            else {
                                replaced = true;
                                model.name = profileName;
                            }
                        }
                    }

                    for (const [key,characteristic] of Object.entries(bracket)){
                        if (key === "name")
                            this.woundTrack[profileName][characteristic.match(woundTrackWoundsRemainingRegex).groups.wounds] = [];
                        
                        else if (characteristics[key])
                            characteristics[key].push(characteristic);
                    }
                }

                let bracketNames = Object.keys(this.woundTrack[profileName]),
                current = 0;

                for (const [key,char] of Object.entries(characteristics)) {
                    if (!char.isAllSameValue() && key !== "w") {
                        defaultProfile[key] = "*";

                        for (const val of char)
                            this.woundTrack[profileName][bracketNames[current++]].push(val);
                        
                        current = 0;
                    }
                    else
                        defaultProfile[key] = baseProfile[key];
                }

                this.modelProfiles[profileName] = defaultProfile;
            }
        }
    }

    /**
     * Makes sure that the wound track is in the right order
     * (if it isn't then changing brackets doesn't work properly)
     */
    sortWoundTracks () {
        if (!this.woundTrack) return;
        
        let newTrack = {}
        for (const [name, track] of Object.entries(this.woundTrack)) {
            newTrack[name] = {};
            let brackets = Object.keys(track).sort((a,b) => {
                if (b.indexOf("+") > 0) return 1;
                if (a.indexOf("+") > 0) return -1;

                let bMin = b.match(bracketValueRegex).groups.min,
                    aMax = a.match(bracketValueRegex).groups.max;

                return bMin - aMax;
            });
    
            for (const bracket of brackets)
                newTrack[name][bracket] = this.woundTrack[name][bracket];
        }

        this.woundTrack = newTrack;
    }

    /**
     * If the unit is a psyker and doesn't ahve the Smite psychic power, add it.
     */
    addSmiteIfNecessary () {
        if (this.psykerProfiles) {
            if (!this.powersKnown) this.powersKnown = [];

            for (const power of this.powersKnown)
                if (smiteTestRegex.test(power.name))
                    return;

            // the only way to get here is if smite was not found
            this.powersKnown.splice(0, 0, {
                name: "Smite",
                warpCharge: "5",
                range: "18\"",
                details: "If manifested, the closest visible enemy unit within 18\" of the psyker suffers D3 mortal wounds. If the result of the Psychic test was more than 10 the target suffers D6 mortal wounds instead."
            });
        }
    }

    /**
     * If a name for a wound track doesnt exist, it might be a plural of one of the model profiles
     */
    makeSureWoundTrackNameExists () {
        if (this.woundTrack) {
            let found = [];

            loop1: for (const name of Object.keys(this.woundTrack)) {
                for (const model in this.models)
                    if (name === model.name) continue loop1;

                // only way to get here is if theres a wound track that hasn't matched a model name
                for (const model of this.models) { // yes I know this looks inefficient
                    if (name.slice(0, -1) === model.name) { // remove the last letter and compare (ie remove "s" from a plural)
                        found.push({ wtName: name, modelName: model.name });
                        continue loop1;
                    } 
                }
            }

            for (const find of found) {
                this.woundTrack[find.modelName] = this.woundTrack[find.wtName];
                delete this.woundTrack[find.wtName];
            }
        }
    }

    /**
     * Just makes sure single model units are marked as such
     */
    checkIfIsSingleModel () {
        if (this.models.totalNumberOfModels === 1)
            this.isSingleModel = true;
    }

    /**
     * Checks to makes sure that all model names match a model profile
     */
    checkModelNames () {
        for (const model of this.models) {
            if (!this.modelProfiles[model.name]) {
                for (const profileName of Object.keys(this.modelProfiles)) {
                    if (profileName.toLowerCase().includes(model.name.toLowerCase()) && !this.models.models[profileName]) {
                        if (this.woundTrack && this.woundTrack[model.name]) {
                            this.woundTrack[profileName] = this.woundTrack[model.name];
                            delete this.woundTrack[model.name];
                        }

                        model.name = profileName;
                    }
                }
            }
        }
    }
}










/********* ROSTER PARSING FOR .rosz FILES *********/



/**
 * Parses the given .ros data into the format we want for TTS
 * @param {any} data The roster data (parsed from XML) to be parsed
 * @returns {Unit[]} An array containing the units parsed from the provided data
 */
function parseRos(data) {
    let units = new Map();

    for (const force of data[0].force) {
        let armyUnitData = force.selections[0].selection.filter(selection => {
            if (selection.$.type === "model" || selection.$.type === "unit") return true;
            if (selection.$.type === "upgrade") {
                if (!selection.selections || selection.selections[0] === "") return false;

                // if the selections contain models, then it shoooould be a unit
                for (const subSelection of selection.selections[0].selection) {
                    if (subSelection.$.type === "model")
                        return true;
                    else if (subSelection.profiles && subSelection.profiles[0] !== "")
                        for (const profile of subSelection.profiles[0].profile)
                            if (profile.$.typeName.toLowerCase() === "unit")
                                return true;
                }

                if (!selection.profiles || selection.profiles[0] === "") return false;

                // if the profiles contain characteristic profiles for models, then it shoooould be a unit
                for (const profile of selection.profiles[0].profile)
                    if (profile.$.typeName.toLowerCase() === "unit")
                        return true;
            }

            return false;
        });
    
        for (let unitData of armyUnitData) {
            let unit = new Unit(unitData.$.name, unitData.$.customName, unitData.$.type === "model");
    
            unit.handleSelectionDataRecursive(unitData, null, true);
    
            units.set(unit.uuid, unit.update());
        }
    }

    let order = [];

    for (const uuid of units.keys())
        order.push(uuid);
    
    return { units, order }
}






/********* UNIT DATA TO XML *********/

function formatAndStoreXML(id, order, armyData, uiHeight, uiWidth, decorativeNames, baseScript) {
    
    storeFormattedXML(id, undefined, undefined, armyData, uiHeight, uiWidth, decorativeNames, baseScript, order);
    return;


    const xml = xmlBuilder.create().ele("ROOT");
    let totalHeight = 0;
    // TODO: return total height for scrollContainer, and xml to add to it
    
    for (const unitID of order) {
        const unit = armyData[unitID],
            unitData = getUnitXMLData(unit);

        totalHeight += unitData.height;

        xml.ele("VerticalLayout", { class: "transparent", childForceExpandHeight: "false" })
            .ele("Text", { class: "unitName" }).txt(unit.name).up()
            .ele("VerticalLayout", { class: "unitContainer", childForceExpandHeight: "false", preferredHeight: unitData.height, spacing: "20" })
                .import(unitData.fragment)

        /*  <VerticalLayout class="transparent" childForceExpandHeight="false">
                <Text class="unitName">${unitName}</Text>
                <VerticalLayout class="unitContainer" childForceExpandHeight="false" preferredHeight="${height}" spacing="20">
                    ${unitData}
                </VerticalLayout>
            </VerticalLayout> */
    }

    storeFormattedXML(id, xml.end({ prettyPrint: false }).slice(27, -7), totalHeight, armyData, uiHeight, uiWidth, baseScript);
}

function getUnitXMLData(unit) {
    const fragment = xmlBuilder.fragment().ele("HorizontalLayout", { class: "groupingGontainer" });
    let maxHeight = 0;

    for (const [modelID, model] of Object.entries(unit.models.models)) {
        const modelData = getModelXMLData(model, modelID, unit);

        fragment.import(modelData.fragment); //
        maxHeight = Math.max(maxHeight, modelData.height);
    }

    return { fragment, height: maxHeight };

    /*  <HorizontalLayout class="groupingContainer">
            <VerticalLayout preferredWidth="500" childForceExpandHeight="false" class="modelContainer" id="${unitID}|${modelID}" preferredHeight="${height}">
                <Text class="modelDataName">${numberString}${modelName}</Text>
                ${weapons}
                ${abilities}
            </VerticalLayout> 
            .
            .
            .
        </HorizontalLayout>*/
}

function getModelXMLData(model, modelID, unit) {
    const fragment = xmlBuilder.fragment(),
        container = fragment.ele("VerticalLayout", { 
            preferredWidth: "500", 
            childForceExpandHeight: "false", 
            class: "modelContainer", 
            id: `${unit.uuid}|${modelID}`
        });
    let height = 40; // name
        
    combineAndSortWeapons(model, unit.weapons);

    container.ele("Text", { class: "modelDataName" }).txt((model.number > 1 ? `${model.number}x `: "") + model.name);

    if (model.weapons.length + (model.assignedWeapons ? model.assignedWeapons.length : 0) > 0) {
        const weaponSectionData = getModelSectionData("Weapons", model.weapons); // at this point, assigned weapons will already be in the list

        container.import(weaponSectionData.fragment);
        height += weaponSectionData.height;
    }

    if (model.abilities.length) {
        const abilitySectionData = getModelSectionData("Abilities", model.abilities);

        container.import(abilitySectionData.fragment);
        height += abilitySectionData.height;
    }

    container.att("preferredHeight", height);

    return { fragment, height };
    /*  <VerticalLayout preferredWidth="500" childForceExpandHeight="false" class="modelContainer" id="${unitID}|${modelID}" preferredHeight="${height}">
            <Text class="modelDataName">${numberString}${modelName}</Text>
            <VerticalLayout childForceExpandHeight="false" childForceExpandWidth="false">
                <Text height="15"><!-- spacer --></Text>
                <Text class="modelDataTitle">${weapons?}</Text>
                <Text class="modelData" preferredHeight="${height}">${data}</Text>
            </VerticalLayout>
            <VerticalLayout childForceExpandHeight="false" childForceExpandWidth="false">
                <Text height="15"><!-- spacer --></Text>
                <Text class="modelDataTitle">${abilities?}</Text>
                <Text class="modelData" preferredHeight="${height}">${data}</Text>
            </VerticalLayout>
        </VerticalLayout> */
}

function getModelSectionData (name, dataList) {
    const fragment = xmlBuilder.fragment();
    let height = (dataList.length * 40) + 60; // 37 for each line, 60 for title and spacer

    fragment.ele("VerticalLayout", { childForceExpandHeight: "false", childForceExpandWidth: "false" })
            .ele("Text", { height: "15" }).com("spacer").up()
            .ele("Text", { class: "modelDataTitle" }).txt(name).up()
            .ele("Text", { class: "modelData", preferredHeight: (height - 60)+"" })
                .txt(dataList.map(data => (data.number && data.number > 1 ? `${data.number}x ` : "") + (data.name || data)).join("\n"));

    return { fragment, height };

    /*  <VerticalLayout childForceExpandHeight="false" childForceExpandWidth="false">
            <Text height="15"><!-- spacer --></Text>
            <Text class="modelDataTitle">${title}</Text>
            <Text class="modelData" preferredHeight="${height}">${data}</Text>
        </VerticalLayout>
    */
}

function combineAndSortWeapons(model, characteristicProfiles) {
    if (model.assignedWeapons && model.assignedWeapons.length) 
        model.weapons = model.weapons.concat(model.assignedWeapons);

    model.weapons.sort((weaponA, weaponB) => {
        if (characteristicProfiles[weaponA.name].type === characteristicProfiles[weaponB.name].type) return 0;

        const typeA = characteristicProfiles[weaponA.name].type.match(weaponTypeRegex).groups.type.toLowerCase(),
            typeB = characteristicProfiles[weaponB.name].type.match(weaponTypeRegex).groups.type.toLowerCase(),
            typeAVal = WEAPON_TYPE_VALUES[typeA] ? WEAPON_TYPE_VALUES[typeA] : 0,
            typeBVal = WEAPON_TYPE_VALUES[typeB] ? WEAPON_TYPE_VALUES[typeB] : 0;
        
        if (typeAVal === typeBVal) return weaponA.name.localeCompare(weaponB.name);

        return typeAVal - typeBVal;
    });
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



function replacer(key, value) {
    if (value instanceof Map) 
        return Object.fromEntries(value.entries());
    
    else if (value instanceof Set) 
        return Array.from(value);

    else 
        return value;
}


function log (data) {
    console.log(util.inspect(data, false, null, true));
} 

const { addSyntheticLeadingComment } = require('typescript');

const port = process.env.PORT || 3000,
    http = require('http'),
    https = require('https'),
    crypto = require('crypto'),
    fs = require('fs'),
    AdmZip = require('adm-zip'),
    parseXML = require('xml2js').parseString,
    html = fs.readFileSync('index.html'),
    util = require("util"),
    url = require("url");

var currentFiles = {};
    /*
        {
            uuid: timeout
        }
    */

const TEN_MINUTES = 600000,
    PATH_PREFIX = "files/",
    factionKeywordRegex = /Faction: (?<keyword>.+)/,
    abilityTrimRegex = /(?:\d+(?:\.|:)|\d+\-\d+(?:\.|:))?\s*(?<ability>.+)/,
    woundTrackWoundsRemainingRegex = /(?<wounds>\d+\+|\d+\-\d+)(?=\s*wounds remaining)/i,
    weaponNameWithoutNumberRegex = /^(?:(?<number>\d+)x )?(?<weaponName>.+)/,
    statDamageCheckRegex = /^stat damage \-/i,
    
    keywordsToIgnore = ["HQ", "Troops", "Elites", "Fast Attack", "Heavy Support", "Flyer", "Dedicated Transport", "Lord of War", "No Force Org Slot", "Warlord"];



Array.prototype.union = function(arr) {
    return Array.from(new Set(this.concat(arr))); // set removes duplicates
};

/**
 * Recursively removes any values that are repeated at least once from the array (in place).
 * Seems like a convoluted way of doing it for something that I think will basically only ever have at most 4
 * values in the array, but I think its a cool solution.
 * @param {number} idx The index to start looking at
 */
/* Array.prototype.removeRepeatedValuesRecursive = function(idx = 0) {
    if (idx >= this.length) return;

    let removed = false,
        last;

    if ((last = this.lastIndexOf(this[idx])) !== idx) { // if there is any repetition
        for (let i=last;i>=idx;i--) { // start from the end and work backwards so removing doesnt break things
            if (this[i] === this[idx]) {
                this.splice(i, 1);
                removed = true;
            }
        }
    }

    this.removeRepeatedValuesRecursive(removed ? idx : idx++);
}; */


Array.prototype.isAllSameValue = function () {
    return Array.from(new Set(this)).length === 1;
};


const server = http.createServer(function (req, res) {
    if (req.method === 'POST') {
        let data = [], dataLength = 0;

        req.on('data', chunk => {
            data.push(chunk);
            dataLength += chunk.length
        })
        .on('end', () => {
            if (req.url === "/format_and_store_army") {
                let buf = Buffer.alloc(dataLength);

                for (let i = 0, len = data.length, pos = 0; i < len; i++) { 
                    data[i].copy(buf, pos); 
                    pos += data[i].length; 
                } 
            
                let zip = new AdmZip(buf);
                let zipEntries = zip.getEntries();
                let uuid;

                do uuid = crypto.randomBytes(4).toString("hex"); 
                while (currentFiles[uuid])
            
            
                for (let i = 0; i < zipEntries.length; i++)
                    parseXML(zip.readAsText(zipEntries[i]), function (err, result) {
                        fs.writeFile("output.json", JSON.stringify(result.roster.forces, null, 4), () =>{})
                        //parseRos(result.roster.forces);
                        fs.writeFile(`${PATH_PREFIX}${uuid}.json`, 
                                    JSON.stringify(parseRos(result.roster.forces))
                                        .replace(" & ", " and "), 
                                    (err) => {
                                        res.writeHead(200, {'Content-Type': 'application/json'});

                                        if (!err) {
                                            res.write(`{ "id": "${uuid}" }`);
                                            currentFiles[uuid] = setTimeout(() => {
                                                fs.unlink(`${PATH_PREFIX}${uuid}.json`, () => {});
                                            }, TEN_MINUTES)
                                        }
                                        else
                                            res.write(`{ "message": "${err}" }`)

                                        res.end();
                                    });
                        //console.log(JSON.stringify(result.roster.forces, null, 4));
                    });
            }
        });
    } 
    else {
        if (req.url === "/favicon.ico") {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.write("");
            res.end();
        }
        else if (req.url === "/") {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.write(html);
            res.end();
        }
        else {
            let getURL = new URL(`http://${req.headers.host}${req.url}`);

            if (getURL.pathname === "/get_army_by_id") {
                let id = getURL.searchParams.get('id');

                if (!currentFiles[id]) {
                    res.writeHead(404, {'Content-Type': 'application/json'});
                    res.write('{ "message": "Roster not found." }')
                    res.end();
                }
                else {
                    fs.readFile(`${PATH_PREFIX}${id}.json`, (err, data) => {
                        if (err) {
                            res.writeHead(404, {'Content-Type': 'application/json'});
                            res.write(`{ "message": "${err}" }`)
                            res.end();
                        }
                        else {
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.write(data);
                            res.end();
    
                            fs.unlink(`${PATH_PREFIX}${id}.json`, () => {});
    
                            clearTimeout(currentFiles[id]);
                            delete currentFiles[id];
                        }
                    });
                }
            }
        } 
    }
});

// Listen on port 3000, IP defaults to 127.0.0.1
server.listen(port);

// Put a friendly message on the terminal
console.log('Server running at http://127.0.0.1:' + port + '/');




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
        for (let selection of selectionData[0].selection) {
            if (selection.profiles)
                for (let profile of selection.profiles[0].profile)
                    switch (profile.$.typeName.toLowerCase()) {
                        case "weapon": 
                            let ignore = -1;

                            for (let char of profile.characteristics[0].characteristic) {
                                if (char.$.name === "Type" && char._ === "-")
                                    ignore++;
                    
                                if (char.$.name === "Abilities" && char._ === "Before selecting targets, select one of the profiles below to make attacks with.")
                                    ignore++;
                            }

                            if (0 < ignore) continue;

                            this.addWeaponData(profile, selection);
                            break;
                        case "abilities":                                    
                            this.addAbilityData(profile);
                            break;
                    }
            
            if (selection.selections)
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

    isEqualTo(otherModel) {
        if (this.name !== otherModel.name) return false;
        
        if (this.abilities.length !== otherModel.abilities.length) return false;
        else
            for (let ability of this.abilities)
                if (!otherModel.abilities.includes(ability)) 
                    return false;
        
        if (this.weapons.length !== otherModel.weapons.length) return false;
        else
            for (const weapon of this.weapons)
                if (otherModel.weapons.findIndex(otherWeapon => 
                                    weapon.name === otherWeapon.name && weapon.number === otherWeapon.number) < 0) 
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

        if (selectionData)
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
            
        if (this.models.hasOwnProperty(model.name))
            for (let m of this.models[model.name])
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


    getAllWeaponNames() {
        return [...new Set(Object.values(this.models).flat().map(model => model.weapons.map(weapon => weapon.name)).flat())]
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
}




class Unit {
    name;
    decorativeName;
    factionKeywords = [];
    keywords = [];
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
        this.name = name;
        this.decorativeName = decorativeName;
        this.isSingleModel = isSingleModel;
    }


    addModelProfileData (profileData, selectionData, number) {
        //this.models.addModelFromData(profileData.$.name, selectionData, number);

        if (!this.modelProfiles[profileData.$.name]) {
            let data = { name: profileData.$.name };

            for (let char of profileData.characteristics[0].characteristic)
                if (char.$.name.toLowerCase() === "save")
                    data.sv = char._
                else
                    data[char.$.name.toLowerCase()] = char._

            this.modelProfiles[profileData.$.name] = data;
        }
    }

    addModelSimpleData (name, selectionData, number) {
        this.models.addModelFromData(name, selectionData, number);
    }

    addAbility (profileData) {
        let trimmedName = profileData.$.name.match(abilityTrimRegex).groups.ability;
        if (!this.abilities[trimmedName])
            this.abilities[trimmedName] = { 
                name: trimmedName, 
                desc: profileData.characteristics[0].characteristic[0]._ 
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
        
        for (let char of weaponData.characteristics[0].characteristic) {
            if (char.$.name === "Type" && char._ === "-") {
                if (mightIgnore) return;
                else mightIgnore = true;
            }

            if (char.$.name === "Abilities" && char._ === "Before selecting targets, select one of the profiles below to make attacks with.") {
                if (mightIgnore) return; // I don't want these sorts of profiles showing up
                else mightIgnore = true;
            }

            data[char.$.name.toLowerCase()] = char._
        }

        this.weapons[weaponData.$.name] = data;
    }

    addKeyword (keywordData) {
        let factionMatch = keywordData.$.name.match(factionKeywordRegex);

        if (factionMatch)
            this.factionKeywords.push(factionMatch.groups.keyword);
        else if (!keywordsToIgnore.includes(keywordData.$.name))
            this.keywords.push(keywordData.$.name);
    }

    addPL (pl) {
        this.pl += pl;
    }

    addBracket (bracketData) {
        let data = [],
            bracket = "";

        for (let char of bracketData.characteristics[0].characteristic) {
            if (char.$.name !== "Remaining W")
                data.push(char._);
            else
                bracket = char._;
        }

        if (!this.woundTrack) this.woundTrack = {};

        this.woundTrack[bracket] = data;
    }


    handleSelectionDataRecursive (selectionData) {
        if (selectionData.$.type.toLowerCase() === "model")
            this.addModelSimpleData(selectionData.$.name, selectionData.selections, selectionData.$.number);

        if (selectionData.profiles) {
            for (let profile of selectionData.profiles[0].profile) {
                switch (profile.$.typeName.toLowerCase()) {
                    case "unit": 
                    case "model":
                        if (//selectionData.$.name.includes(profile.$.name) && // hopefully this isn't necessary
                            selectionData.$.type.toLowerCase() !== "unit" &&
                            selectionData.$.type.toLowerCase() !== "model")
                                this.addModelSimpleData(profile.$.name, selectionData.selections, selectionData.$.number);

                        this.addModelProfileData(profile, selectionData.selections, selectionData.$.number);
                        break;
                    case "abilities":
                        this.addAbility(profile);
                        break;
                    case "weapon":
                        this.addWeapon(profile);
                        break;
                    case "wound track":
                        this.addBracket(profile);
                        break;
                    default:
                        // Special Cases
                        let isStatDamage = statDamageCheckRegex.test(profile.$.typeName.toLowerCase())

                        if (isStatDamage) {
                            // handle DKoK vehicle wound tracks
                            this.addBracket(profile);
                        }
                }
            }
        }

        if (selectionData.rules)
            for (let rule of selectionData.rules[0].rule)
                this.addRule(rule);

        if (selectionData.selections)
            for (let selection of selectionData.selections[0].selection)
                this.handleSelectionDataRecursive(selection); // be careful
                            

        if (selectionData.categories)
            for (let category of selectionData.categories[0].category)
                    this.addKeyword(category);

        if (selectionData.costs)
            for (let cost of selectionData.costs[0].cost)
                if (cost.$.name.trim() === "PL") {
                    this.addPL(parseInt(cost.$.value, 10));
                    break;
                }
    }

    update () {
        this.addAbilitiesToAllModels();
        this.checkWeapons();
        this.checkForStrangeWoundTrackFormatting();

        return this;
    }

    /**
     * Adds all abilities that are only on the unit as a whole to every model in the unit
     */
    addAbilitiesToAllModels () {
        for (let model of this.models)
            model.abilities = model.abilities
                                    .union(Object.keys(this.abilities))
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
                                    .map(weaponName => { return { name: weaponName, number: 1 }}),
            assigned = false;
        
        for (let model of this.models)
            if (model.weapons.length === 0) {
                model.setWeapons(unassignedWeapons);
                assigned = true;
            }

        if (!assigned)
            this.unassignedWeapons = unassignedWeapons;
    }

    /**
     * Some data creators (for some reason) don't use the wonderful wound track formatting,
     * they just input the wound track as multiple different profiles for a single model.
     * This is a workaround for those situations.
     * NOTE: this currently only works for single model units
     */
    checkForStrangeWoundTrackFormatting() {
        // if there are more profiles for models than there are models,
        // it seems safe to assume it's supposed to be a wound track
        if (this.isSingleModel && Object.keys(this.modelProfiles).length > 1 && !this.woundTrack) {
            let brackets = Object.values(this.modelProfiles),
                baseProfile = brackets[0],
                characteristics = { m:[],ws:[],bs:[],s:[],t:[],w:[],a:[],ld:[],sv:[] },
                defaultProfile = { name: this.name };

            this.woundTrack = {};
            this.modelProfiles = {};

            for (const bracket of brackets) {
                for (const [key,characteristic] of Object.entries(bracket)){
                    if (key === "name") 
                        this.woundTrack[characteristic.match(woundTrackWoundsRemainingRegex).groups.wounds] = [];
                    
                    else
                        characteristics[key].push(characteristic);
                }
            }

            let bracketNames = Object.keys(this.woundTrack),
                current = 0;

            for (const [key,char] of Object.entries(characteristics)) {
                if (!char.isAllSameValue() && key !== "w") {
                    defaultProfile[key] = "*";

                    for (const val of char)
                        this.woundTrack[bracketNames[current++]].push(val);
                    
                    current = 0;
                }
                else
                    defaultProfile[key] = baseProfile[key];
            }

            this.modelProfiles[this.name] = defaultProfile;
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
    let units = {};

    for (let force of data[0].force) {
        let armyUnitData = force.selections[0].selection.filter(selection => selection.$.type === "model" || selection.$.type === "unit");
    
        for (let unitData of armyUnitData) {
            let unit = new Unit(unitData.$.name, unitData.$.customName, unitData.$.type === "model");
    
            unit.handleSelectionDataRecursive(unitData);
    
            units[unit.uuid] = unit.update();
        }
    }
    
    return units
}





function log (data) {
    console.log(util.inspect(data, false, null, true));
} 
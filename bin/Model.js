const weaponNameWithoutNumberRegex = /^(?:(?<number>\d+)x )?(?<weaponName>.+)/,
    weaponToIgnoreRegex = /of the profiles below|select one of the following profiles/i,
    abilityTrimRegex = /(?:\d+(?:\.|:)|\d+\-\d+(?:\.|:))?\s*(?<ability>.+)/;

module.exports = class Model {
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

    addWeaponData (weaponData, selection, unitnumber) {
        let newMatch = weaponData.$.name.match(weaponNameWithoutNumberRegex).groups,
            selectionNumber = selection.$.name.match(weaponNameWithoutNumberRegex).groups.number,
            newNumber = parseInt(selection.$.number, 10) / unitnumber;
        
        for (const weapon of this.weapons) {
            if (weapon.name === newMatch.weaponName) {
                weapon.number += newNumber;
                return;
            }
        }

        this.weapons.push({ name: newMatch.weaponName, number: newNumber });
    }

    handleSelectionDataRecursive (selectionData, number) {
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

                            this.addWeaponData(profile, selection, number);
                            break;
                        case "abilities":                                    
                            this.addAbilityData(profile);
                            break;
                    }
            
            if (selection.selections && selection.selections[0] !== "")
                this.handleSelectionDataRecursive(selection.selections, number);
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

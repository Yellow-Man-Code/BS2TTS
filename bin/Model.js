const arrayUtils = require("./arrayUtils");
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

    add(model) {
        this.number += model.number;
        this.abilities = arrayUtils.union(this.abilities, model.abilities);

        for (const weapon of model.weapons)
            if (this.weapons.findIndex(currWeapon => currWeapon.name === weapon.name) < 0)
                this.weapons.push(weapon);
    }

    isEqualTo(otherModel) {
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

        return true;
    }
}
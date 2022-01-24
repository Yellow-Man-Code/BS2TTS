const path = require("path");
const {roszParse} = require("../bin/roszParser");
const approvals = require("approvals");
const crypto = require("crypto");
const fs = require("fs");
const roszParser = require("../bin/Roster");

function getTestNameSafe() {
    return expect.getState().currentTestName
        .replaceAll(" ", "-")
        .replaceAll("/", "-");
}

test("parse roster", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-army.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});

test("celestine", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "adepta-sororitas-celestine.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
})

test("tau commander", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "tau-commander.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});

test("vanguards", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-sm-vanguard-vets.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});

test("sm bike squad", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-sm-bike-squad.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});

test("blood angel librarian dreadnought", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-sm-librarian-dreadnought.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});

test("grey knight land raider", () => {
    var id = 0
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, id++);
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-grey-knights-land-raider.rosz"));

    const roster = roszParse(fileContent);

    approvals.verify(__dirname, getTestNameSafe(), roszParser.serialize(roster, 4))

    spy.mockRestore();
});
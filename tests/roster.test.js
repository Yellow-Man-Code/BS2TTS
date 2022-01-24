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
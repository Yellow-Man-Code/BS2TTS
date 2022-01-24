const path = require("path");
const {roszParse} = require("../bin/roszParser");
const approvals = require("approvals");
const crypto = require("crypto");
const fs = require("fs");

function getTestNameSafe() {
    return expect.getState().currentTestName
        .replaceAll(" ", "-")
        .replaceAll("/", "-");
}

test("parse roster", () => {
    const spy = jest.spyOn(crypto, "randomBytes").mockImplementation((size) => {
        return Buffer.alloc(size, "X");
    });

    const fileContent = fs.readFileSync(path.join(__dirname, "../samples", "sample-army.rosz"));

    const roster = roszParse(fileContent);

    spy.mockRestore();

    approvals.verify(__dirname, getTestNameSafe(), JSON.stringify(roster, null, 4))
});
local measuringCircles = {}
local isCurrentlyCheckingCoherency = false
local previousHighlightColor = nil
local MM_TO_INCH = 0.0393701
local MEASURING_RING_Y_OFFSET = 0.17
local VALID_BASE_SIZES_IN_MM = {
    {x = 25, z = 25},
    {x = 28, z = 28},
    {x = 30, z = 30},
    {x = 32, z = 32},
    {x = 40, z = 40},
    {x = 50, z = 50},
    {x = 55, z = 55},
    {x = 60, z = 60},
    {x = 65, z = 65},
    {x = 80, z = 80},
    {x = 90, z = 90},
    {x = 100, z = 100},
    {x = 130, z = 130},
    {x = 160, z = 160},
    {x = 25, z = 75},
    {x = 75, z = 25},
    {x = 35.5, z = 60},
    {x = 60, z = 35.5},
    {x = 40, z = 95},
    {x = 95, z = 40},
    {x = 52, z = 90},
    {x = 90, z = 52},
    {x = 70, z = 105},
    {x = 105, z = 70},
    {x = 92, z = 120},
    {x = 120, z = 92},
    {x = 95, z = 150},
    {x = 150, z = 95},
    {x = 109, z = 170},
    {x = 170, z = 109}
}
local WOUND_COLOR_CUTOFFS = {
    {g=0}, -- 1
    {g=1}, -- 2
    {g=2, o=1}, -- 3
    {g=2, o=1}, -- 4
    {g=3, o=1}, -- 5
    {g=4, o=2}, -- 6
    {g=5, o=2}, -- 7
    {g=6, o=3}, -- 8
    {g=6, o=3}, -- 9
}
local WOUND_TRACK_COLORS = {
    { "[00ff16]" },
    { "[00ff16]", "[ff0000]" },
    { "[00ff16]", "[ffca00]", "[ff0000]" },
    { "[00ff16]", "[ffca00]", "[ff7900]", "[ff0000]" },
    { "[00ff16]", "[8bff00]", "[ffca00]", "[ff7900]", "[ff0000]" }
}
local BRACKET_VALUE_COLORS = {
    { "[98ffa7]" },
    { "[98ffa7]", "[e9a2a2]" },
    { "[98ffa7]", "[ffe298]", "[e9a2a2]" },
    { "[98ffa7]", "[ffe298]", "[feb17e]", "[e9a2a2]" },
    { "[98ffa7]", "[c8ff98]", "[ffe298]", "[feb17e]", "[e9a2a2]" }
}
local BRACKET_VALUE = "${color}${val}[-]"
local dataCardHeight = 300 
-- starting to calculate height of the dataCard: keywords and each section is 
-- 40px by default (will add row heights later), spacing adds 30 between each,
-- and I want 10 extra pixels at the bottom for a total of 60+30+40+30+40+30+40+10 = 260 (+10 for unknown reason) (70 for keywords)
local uiTemplates = {
    abilities = [[<Row class="${rowParity}" preferredHeight="80">
                    <Cell><Text class="ym-resizingSmallBold">${name}</Text></Cell>
                    <Cell><Text class="ym-resizingText">${desc}</Text></Cell>
                </Row>]],
    models = [[ <Row class="${rowParity}" preferredHeight="60">
                    <Cell><Text class="ym-resizingSmallBold">${name}</Text></Cell>
                    <Cell><Text class="ym-smallText">${m}</Text></Cell>
                    <Cell><Text class="ym-smallText">${ws}</Text></Cell>
                    <Cell><Text class="ym-smallText">${bs}</Text></Cell>
                    <Cell><Text class="ym-smallText">${s}</Text></Cell>
                    <Cell><Text class="ym-smallText">${t}</Text></Cell>
                    <Cell><Text class="ym-smallText">${w}</Text></Cell>
                    <Cell><Text class="ym-smallText">${a}</Text></Cell>
                    <Cell><Text class="ym-smallText">${ld}</Text></Cell>
                    <Cell><Text class="ym-smallText">${sv}</Text></Cell>
                </Row>]],
    weapons = [[ <Row class="${rowParity}" preferredHeight="60">
                    <Cell><Text class="ym-resizingSmallBold">${name}</Text></Cell>
                    <Cell><Text class="ym-resizingText">${range}</Text></Cell>
                    <Cell><Text class="ym-resizingText">${type}</Text></Cell>
                    <Cell><Text class="ym-smallText">${s}</Text></Cell>
                    <Cell><Text class="ym-smallText">${ap}</Text></Cell>
                    <Cell><Text class="ym-smallText">${d}</Text></Cell>
                    <Cell><Text class="ym-resizingText">${abilities}</Text></Cell>
                </Row>]],
    powersKnown = [[<Row class="${rowParity}" preferredHeight="100">
                        <Cell><Text class="ym-resizingSmallBold">${name}</Text></Cell>
                        <Cell><Text class="ym-smallText">${warpCharge}</Text></Cell>
                        <Cell><Text class="ym-smallText">${range}</Text></Cell>
                        <Cell><Text class="ym-resizingText">${details}</Text></Cell>
                    </Row>]],
    psykerProfiles = [[ <Row class="${rowParity}" preferredHeight="100">
                            <Cell><Text class="ym-resizingSmallBold">${name}</Text></Cell>
                            <Cell><Text class="ym-smallText">${cast}</Text></Cell>
                            <Cell><Text class="ym-smallText">${deny}</Text></Cell>
                            <Cell><Text class="ym-resizingText">${known}</Text></Cell>
                        </Row>]],
    agenda = [[ <HorizontalLayout>
                    <Text class="ym-medText" flexibleWidth="1">${counterName}</Text>
                    <HorizontalLayout spacing="5">
                        <Button class="ym-button" onClick="${guid}/decrementTallyCounter(${counterName})">-</Button>
                        <Text class="ym-bold" id="${counterID}">${counterValue}</Text>
                        <Button class="ym-button" onClick="${guid}/incrementTallyCounter(${counterName})">+</Button>
                    </HorizontalLayout>
                </HorizontalLayout>]],
    -- this is here and not in xml because we have to provide the guid, otherwise it will try and run on Global
    buttons = [[<Button class="highlightingButton" preferredWidth="${width}" color="#BB2222" onClick="${guid}/highlightUnit(Red)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#22BB22" onClick="${guid}/highlightUnit(Green)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#2222BB" onClick="${guid}/highlightUnit(Blue)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#BB22BB" onClick="${guid}/highlightUnit(Purple)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#DDDD22" onClick="${guid}/highlightUnit(Yellow)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#FFFFFF" onClick="${guid}/highlightUnit(White)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#DD6633" onClick="${guid}/highlightUnit(Orange)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#29D9D9" onClick="${guid}/highlightUnit(Teal)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#DD77CC" onClick="${guid}/highlightUnit(Pink)"></Button>
    <Button class="highlightingButton" preferredWidth="${width}" color="#BBBBBB" onClick="${guid}/unhighlightUnit"></Button>]]
}
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {StaticRouter} from "react-router-dom/server";
import {it,expect,vi} from "vitest";
import {createInitialState,applyCommand} from "../src/lib/simulation/simulationEngine";
import {cloneSaveSnapshot} from "../src/lib/simulationTransport";
import {prepareLoadedState} from "../src/lib/saveSafety";
const fixture=vi.hoisted(()=>({state:null as any}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>({state:fixture.state,motionEnabled:false,send:vi.fn(),showToast:vi.fn()})}));
import CompanyYard from "../src/components/office/CompanyYard";
import JourneyPanel from "../src/components/office/JourneyPanel";
import CompanyStories from "../src/components/office/CompanyStories";
import ManagementGoals from "../src/components/office/ManagementGoals";
function render(C){return renderToStaticMarkup(React.createElement(StaticRouter,{location:"/"},React.createElement(C)));}
it("renders readable empty and active views from real state with motion disabled",()=>{fixture.state=createInitialState({}).state;for(const C of [CompanyYard,JourneyPanel,CompanyStories,ManagementGoals])expect(render(C)).not.toMatch(/NaN|undefined/);expect(render(CompanyYard)).not.toContain("ff-yard-motion");applyCommand(fixture.state,"chooseJourneyPath",{path:"green"});expect(render(JourneyPanel)).toContain("Lieferungen mit E-Lkw");expect(render(JourneyPanel)).toContain('href="/fuhrpark"');});
it("preserves identity, progress and live records in immutable save snapshots",()=>{const s:any=createInitialState({}).state;applyCommand(s,"setCompanyIdentity",{color:"#38bdf8",motto:"Von Hamburg in die Zukunft"});applyCommand(s,"chooseJourneyPath",{path:"people"});const snapshot=cloneSaveSnapshot(s),expected=structuredClone(s.journey);s.journey.totals.delivered++;s.journey.brand.motto="changed";const loaded=prepareLoadedState(snapshot);expect(loaded.journey).toEqual(expected);});
it("initializes legacy saves without fabricating historical successes",()=>{const s:any=createInitialState({}).state;delete s.journey;s.gameTime=200*1440;s.stats.totalDeliveries=999;const loaded=prepareLoadedState(s);expect(loaded.journey.sinceMin).toBe(s.gameTime);expect(loaded.journey.totals.delivered).toBe(0);expect(s.journey).toBeUndefined();});

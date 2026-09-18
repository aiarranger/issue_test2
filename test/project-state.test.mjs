import assert from "node:assert/strict";
import test from "node:test";
import {calculateProjectState} from "../lib/project-state.mjs";

const config = {
  categories:["UX","APP","PLATFORM","DATA","VERIFY","OPS"].map((id)=>({id})),
  milestones:[{id:"M0",label:"今日を決める",order:0}],
  issues:[
    {number:2,milestone:"M0",category:"UX",required:true,depends_on:[]},
    {number:3,milestone:"M0",category:"APP",required:true,depends_on:[2]},
    {number:4,milestone:"M0",category:"PLATFORM",required:true,depends_on:[2]},
    {number:5,milestone:"M0",category:"VERIFY",required:true,verify_gate:true,depends_on:[3,4]}
  ]
};

function gh(states={}) {
  return [2,3,4,5].map((number)=>({
    number,
    title:"issue "+number,
    github_state:states[number]||"open"
  }));
}

test("initial: UXだけReady",()=>{
  const r=calculateProjectState(config,gh());
  assert.equal(r.milestoneStates.get("M0"),"NOT STARTED");
  assert.deepEqual(Object.fromEntries(r.executions.map(i=>[i.number,i.status])),{2:"READY",3:"BLOCKED",4:"BLOCKED",5:"BLOCKED"});
});

test("UX done: AppとPlatformがReady",()=>{
  const r=calculateProjectState(config,gh({2:"closed"}));
  assert.equal(r.milestoneStates.get("M0"),"BUILDING");
  assert.equal(r.executions.find(i=>i.number===3).status,"READY");
  assert.equal(r.executions.find(i=>i.number===4).status,"READY");
});

test("実装done: QAがReady",()=>{
  const r=calculateProjectState(config,gh({2:"closed",3:"closed",4:"closed"}));
  assert.equal(r.milestoneStates.get("M0"),"READY TO VERIFY");
  assert.equal(r.executions.find(i=>i.number===5).status,"READY");
});

test("QA done: Verified",()=>{
  const r=calculateProjectState(config,gh({2:"closed",3:"closed",4:"closed",5:"closed"}));
  assert.equal(r.milestoneStates.get("M0"),"VERIFIED");
});

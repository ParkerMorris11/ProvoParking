import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyLots } from '../js/domain/nearby.js';
const lot = (id, name, permit, lng, lat) => ({ type: 'Feature', id, properties: { Lot_Type: name, permit_typ: permit }, geometry: { type: 'Polygon', coordinates: [[[lng, lat], [lng + .0001, lat], [lng + .0001, lat + .0001], [lng, lat]]] } });
const features = [lot(1,'Near Y','Y',-111.65,40.25), lot(2,'Far V','V',-111.64,40.25), lot(3,'Restricted','R',-111.6501,40.25), lot(4,'No parking','No BYU Parking',-111.65,40.25), lot(5,'Near Y','Y',-111.6502,40.25)];
test('nearby lots are distance ranked, deduplicated, and exclude restricted boundaries', () => {
 const result = nearbyLots(features, {latitude:40.25,longitude:-111.65});
 assert.deepEqual(result.map(x=>x.name), ['Near Y','Far V']);
 assert.ok(result[0].distanceMeters < result[1].distanceMeters);
});
test('permit category filter matches exactly and never grants eligibility', () => {
 assert.deepEqual(nearbyLots(features,{latitude:40.25,longitude:-111.65},'V').map(x=>x.name),['Far V']);
 assert.deepEqual(nearbyLots(features,{latitude:40.25,longitude:-111.65},'YV'),[]);
});
test('far-away users and invalid locations get no nearby recommendations', () => {
 assert.deepEqual(nearbyLots(features,{latitude:41,longitude:-111.65}),[]);
 assert.deepEqual(nearbyLots(features,{latitude:null,longitude:null}),[]);
 assert.deepEqual(nearbyLots(features,{latitude:100,longitude:0}),[]);
});
test('malformed geometry is skipped, never plotted at zero', () => {
 assert.deepEqual(nearbyLots([{properties:{Lot_Type:'Broken',permit_typ:'Y'},geometry:{type:'Polygon',coordinates:[[[null,null]]]}}],{latitude:0,longitude:0}),[]);
});
test('permit sections of the same physical lot occupy only one recommendation',()=>{
 const a=lot(10,'22B','B',-111.65,40.25),b=lot(11,'22A','A',-111.649,40.25),c=lot(12,'23Y','Y',-111.648,40.25);
 a.properties.Lot='22';b.properties.Lot='22';c.properties.Lot='23';
 assert.deepEqual(nearbyLots([a,b,c],{latitude:40.25,longitude:-111.65}).map(x=>x.name),['22B','23Y']);
 assert.deepEqual(nearbyLots([a,b,c],{latitude:40.25,longitude:-111.65},'A').map(x=>x.name),['22A']);
});

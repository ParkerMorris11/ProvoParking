# Lot entrance audit — November 17, 2026

Every verified BYU section (102) was checked against two sources: its own BYU GIS polygon (`data/byu-campus-parking.json`) and OpenStreetMap parking lots and roads. Built by `scripts/build-lot-entrances.py`.

**Findings**

- No stored pin is more than 100 m off. 101 of 102 pins sit inside their BYU GIS section; 30G (area 6) is 4.5 m outside its polygon edge.
- Each pin is an interior point of a section, not an entrance. Google and Apple Maps send a coordinate to the nearest road. For 8 sections the nearest road never enters the lot (for example 37Y next to 1060 North, 38Y next to 150 East), which is how directions ended at odd spots.
- Fix: driving directions now go to a point about 12 m inside the drive-in entrance of the lot holding each section (`js/data/lot-entrances.js`). Walking directions (back to a parked car) still go to the section pin. 14A and 46A have no OSM roads mapped nearby, so they keep their pin.
- Provo city lots: directions used the box center of each polygon, which is outside 74 L-shaped lots (at most 36 m). They now use a point inside the lot.

| Area | Lot | GIS id | Pin inside GIS polygon | Nearest road to old pin | Entrance (lat, lng) | Via | Moved |
|---|---|---|---|---|---|---|---|
| 5 | 59Y | 5 | yes | service | 40.243901, -111.648523 | service/parking_aisle | 47.4 m |
| 6 | 30G | 2 | no, 4.5 m | service (no way in) | 40.245261, -111.64608 | service | 2.3 m |
| 7 | 14A | 25 | yes | service | (kept pin) | — | 0 m |
| 8 | 18U | 167 | yes | service | 40.250836, -111.657039 | service | 58.2 m |
| 10 | 23A | 3 | yes | service | 40.254595, -111.645493 | service/parking_aisle | 31.8 m |
| 12 | 56Y | 6 | yes | service | 40.243932, -111.653591 | service | 59.2 m |
| 13 | 23A | 11 | yes | 1550 North | 40.25475, -111.646212 | 1550 North | 14.4 m |
| 14 | 55A | 12 | yes | service | 40.245048, -111.640805 | service | 24.4 m |
| 15 | 42A | 13 | yes | service | 40.26356, -111.659582 | service | 51.1 m |
| 16 | 59G | 21 | yes | service | 40.243901, -111.648523 | service/parking_aisle | 52.3 m |
| 17 | 30A | 22 | yes | service | 40.245609, -111.646161 | service/parking_aisle | 10.5 m |
| 18 | 56A | 24 | yes | service | 40.243932, -111.653602 | service | 58.9 m |
| 20 | 32A | 26 | yes | service | 40.244739, -111.64878 | service | 44.8 m |
| 21 | 20A | 29 | yes | service | 40.256475, -111.645603 | service | 3.6 m |
| 22 | 27A | 30 | yes | service | 40.249614, -111.644237 | service | 16.3 m |
| 23 | 27A | 31 | yes | service | 40.248737, -111.645123 | service | 1.0 m |
| 24 | 26A | 33 | yes | service | 40.24766, -111.643545 | service/parking_aisle | 45.3 m |
| 25 | 26G | 34 | yes | service | 40.247887, -111.643657 | service/parking_aisle | 34.7 m |
| 26 | 28A | 35 | yes | service | 40.246995, -111.643868 | service/parking_aisle | 7.4 m |
| 27 | 26A | 37 | yes | service | 40.247984, -111.644855 | service | 3.4 m |
| 28 | 37Y | 41 | yes | 1060 North (no way in) | 40.24789, -111.65788 | 1060 North | 7.4 m |
| 29 | 38Y | 44 | yes | 150 East (no way in) | 40.247414, -111.65614 | 150 East | 8.1 m |
| 30 | 38Y | 45 | yes | service | 40.24737, -111.656002 | service/driveway | 9.2 m |
| 31 | 53A | 46 | yes | service | 40.248519, -111.642847 | service/parking_aisle | 47.2 m |
| 32 | 53G | 56 | yes | service | 40.24852, -111.642446 | service/parking_aisle | 38.7 m |
| 33 | 2A | 58 | yes | service | 40.251179, -111.647612 | service/parking_aisle | 36.5 m |
| 34 | 2A | 59 | yes | service | 40.251726, -111.648163 | service/parking_aisle | 8.8 m |
| 35 | 8A | 61 | yes | Campus Drive | 40.247332, -111.64578 | Campus Drive | 9.8 m |
| 36 | 22G | 62 | yes | 1430 North | 40.252993, -111.647433 | 1430 North | 8.5 m |
| 37 | 15A | 66 | yes | service | 40.248337, -111.652229 | service | 4.8 m |
| 38 | 3A | 71 | yes | service | 40.250047, -111.646248 | Heritage Drive | 43.2 m |
| 39 | 24A | 79 | yes | service | 40.25494, -111.645142 | service/parking_aisle | 54.3 m |
| 40 | 22A | 81 | yes | service | 40.253796, -111.6469 | service/parking_aisle | 46.6 m |
| 41 | 8A | 82 | yes | service | 40.246955, -111.645421 | service | 72.6 m |
| 42 | 53A | 83 | yes | service | 40.249474, -111.641875 | service/driveway | 16.6 m |
| 43 | 4A | 85 | yes | service | 40.24735, -111.647483 | service/parking_aisle | 49.4 m |
| 44 | 53G | 87 | yes | service | 40.249474, -111.641875 | service/driveway | 49.6 m |
| 45 | 8A | 89 | yes | service | 40.247983, -111.645476 | service | 31.8 m |
| 46 | 24A | 102 | yes | service | 40.25616, -111.643004 | service/parking_aisle | 7.9 m |
| 47 | 54A | 105 | yes | service | 40.263211, -111.658207 | service | 36.5 m |
| 48 | 24A | 114 | yes | service | 40.256733, -111.642206 | service/parking_aisle | 0.1 m |
| 49 | 24Y | 115 | yes | service | 40.255617, -111.643024 | service/parking_aisle | 39.4 m |
| 50 | 50Y | 117 | yes | service | 40.258119, -111.645212 | service | 15.4 m |
| 51 | 50A | 118 | yes | service | 40.256895, -111.645145 | service | 41.5 m |
| 52 | 50A | 119 | yes | service | 40.256905, -111.645444 | service | 66.2 m |
| 53 | 50A | 120 | yes | service | 40.258144, -111.646539 | service | 59.5 m |
| 54 | 20Y | 123 | yes | service | 40.25645, -111.647333 | service | 41.8 m |
| 55 | 19Y | 125 | yes | service | 40.255967, -111.648492 | service | 44.9 m |
| 56 | 19A | 126 | yes | service | 40.255842, -111.648876 | service | 43.0 m |
| 57 | 19Y | 127 | yes | service | 40.255105, -111.650133 | service/parking_aisle | 43.1 m |
| 58 | 22G | 128 | yes | 1430 North | 40.253052, -111.64966 | 1430 North | 15.5 m |
| 59 | 31A | 129 | yes | service | 40.245364, -111.646771 | service | 22.3 m |
| 60 | 31G | 130 | yes | service | 40.245398, -111.64677 | service | 21.5 m |
| 61 | 6A | 132 | yes | service | 40.24554, -111.646767 | service | 35.9 m |
| 62 | 5A | 134 | yes | service | 40.24641, -111.646 | service | 37.3 m |
| 63 | 33A | 135 | yes | service | 40.244136, -111.650917 | service | 14.5 m |
| 64 | 33Y | 136 | yes | service | 40.243631, -111.651418 | service | 22.1 m |
| 65 | 33G | 137 | yes | service | 40.244126, -111.651167 | service/parking_aisle | 3.4 m |
| 66 | 7A | 140 | yes | service | 40.24622, -111.649924 | service/parking_aisle | 5.1 m |
| 67 | 12A | 141 | yes | service | 40.245847, -111.653561 | service | 54.6 m |
| 68 | 13A | 142 | yes | service | 40.247575, -111.652152 | service/parking_aisle | 72.8 m |
| 69 | 17A | 143 | yes | service | 40.249827, -111.651463 | service | 3.9 m |
| 70 | 17A | 145 | yes | service (no way in) | 40.249957, -111.651361 | service | 16.2 m |
| 71 | 16A | 146 | yes | service | 40.250751, -111.65115 | service | 39.6 m |
| 72 | 1A | 147 | yes | service | 40.252125, -111.648586 | service | 30.4 m |
| 73 | 16A | 149 | yes | service | 40.251613, -111.65074 | service | 19.8 m |
| 74 | 57Y | 151 | yes | service | 40.243215, -111.656434 | service | 14.7 m |
| 75 | 34Y | 152 | yes | service | 40.244525, -111.655434 | service | 34.4 m |
| 76 | 46Y | 153 | yes | service | 40.247324, -111.66142 | service/parking_aisle | 0.1 m |
| 77 | 46A | 154 | yes | service | (kept pin) | — | 0 m |
| 78 | 46A | 155 | yes | service | 40.246794, -111.659773 | service | 4.6 m |
| 79 | 36Y | 156 | yes | service (no way in) | 40.246277, -111.656722 | service/parking_aisle | 18.8 m |
| 80 | 37Y | 157 | yes | 1060 North (no way in) | 40.2479, -111.656807 | 1060 North | 4.0 m |
| 81 | 38A | 158 | yes | Fieldhouse Drive | 40.24783, -111.655905 | Fieldhouse Drive | 62.6 m |
| 82 | 37Y | 159 | yes | service | 40.248033, -111.656792 | service/parking_aisle | 54.9 m |
| 83 | 37A | 160 | yes | 150 East | 40.248978, -111.656124 | 150 East | 24.1 m |
| 84 | 37Y | 161 | yes | service | 40.249407, -111.656348 | service | 23.8 m |
| 85 | 39A | 162 | yes | service | 40.250117, -111.654409 | service | 94.7 m |
| 86 | 39G | 163 | yes | Fieldhouse Drive | 40.250289, -111.654435 | Fieldhouse Drive | 18.7 m |
| 87 | 40A | 164 | yes | service | 40.250225, -111.653393 | service/parking_aisle | 42.2 m |
| 88 | 46Y | 165 | yes | service | 40.248939, -111.65896 | service | 61.9 m |
| 89 | 46Y | 166 | yes | service | 40.25038, -111.660138 | service/parking_aisle | 63.0 m |
| 91 | 40G | 169 | yes | service | 40.250712, -111.653424 | service/parking_aisle | 10.3 m |
| 92 | 40A | 170 | yes | service | 40.250882, -111.653459 | service | 54.7 m |
| 93 | 40G | 171 | yes | service | 40.251463, -111.652636 | service/parking_aisle | 24.6 m |
| 94 | 58Y | 180 | yes | service | 40.252329, -111.657201 | service/parking_aisle | 35.8 m |
| 95 | 58A | 181 | yes | service | 40.25245, -111.65802 | service | 25.2 m |
| 96 | 58A | 183 | yes | service | 40.253177, -111.657809 | service/parking_aisle | 89.0 m |
| 97 | 58A | 184 | yes | service | 40.253665, -111.658123 | service/parking_aisle | 4.1 m |
| 98 | 49Y | 186 | yes | service | 40.255959, -111.652373 | service | 27.0 m |
| 99 | 48Y | 187 | yes | service | 40.255979, -111.653654 | service/parking_aisle | 85.7 m |
| 100 | 45Y | 188 | yes | service | 40.256049, -111.657335 | service/parking_aisle | 27.0 m |
| 101 | 45A | 189 | yes | service | 40.256049, -111.657547 | service/parking_aisle | 53.3 m |
| 102 | 45U | 191 | yes | service | 40.258797, -111.656342 | service | 86.6 m |
| 103 | 45Y | 192 | yes | service | 40.257577, -111.658281 | service | 31.9 m |
| 104 | 47Y | 193 | yes | service | 40.258165, -111.652821 | service/parking_aisle | 0.4 m |
| 105 | 62Y | 194 | yes | service | 40.25889, -111.654779 | service/parking_aisle | 34.5 m |
| 106 | 44U | 195 | yes | service | 40.258872, -111.658884 | service | 95.6 m |
| 107 | 61Y | 196 | yes | service | 40.265078, -111.656367 | service/parking_aisle | 25.7 m |
| 108 | 61Y | 197 | yes | service | 40.263586, -111.657294 | service | 8.9 m |
| 109 | 33Y | 209 | yes | service | 40.243519, -111.650206 | service | 23.0 m |
| 110 | 33A | 210 | yes | service | 40.243207, -111.650804 | service | 4.1 m |

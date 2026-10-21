'use strict';
/*
 * Placeholder branch structure for Atwima Kwanwoma.
 * The administrator should replace this with the official branch list using
 * the "Branches" tab -> Import CSV, or by editing each branch in the app.
 * Structure: 33 electoral areas, 241 branches.
 */

const AREAS = [
  'Twedie', 'Atwima Foase', 'Kobriso', 'Ahenema Kokoben', 'Aburaso',
  'Atwima Boko', 'Kwanwoma', 'Yabi', 'Dida', 'Trabuom',
  'Trede', 'Nweneso No.1', 'Nweneso No.2', 'Ampayoo', 'Brofoyeduro',
  'Krofrom', 'Kotwi', 'Kromoase', 'Adum Afrancho', 'Afrancho',
  'Apemanim', 'Darko', 'Akyeremade', 'Twedie No.2', 'Foase No.2',
  'Kobriso No.2', 'Aburaso No.2', 'Ahenema Kokoben No.2', 'Boko No.2', 'Kwanwoma No.2',
  'Trabuom No.2', 'Trede No.2', 'Afrancho No.2'
];

const CENTRES = [
  'Community Centre', 'Presby JHS', 'R/C Primary', 'Methodist JHS',
  "Chief's Palace", 'Anglican Primary', 'Market Square', 'SDA JHS',
  'Islamic School', 'D/A JHS', 'Presby Primary', 'Catholic JHS'
];

function buildBranches() {
  const branches = [];
  let n = 1;
  AREAS.forEach((area, i) => {
    // 231 base + 10 extra across the first ten areas = 241
    const count = 7 + (i < 10 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const code = 'AK-' + String(n).padStart(3, '0');
      branches.push({ id: 'b' + String(n).padStart(3, '0'), code, area, name: area + ' ' + CENTRES[k % CENTRES.length] });
      n++;
    }
  });
  return branches;
}

module.exports = { AREAS, buildBranches };

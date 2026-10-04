// Countries, US states and Canadian provinces: one list shared by the browser
// (window.SlaterRegions) and the server/migration (require('../public/regions')).
//
// Countries are stored as ISO 3166-1 alpha-2 codes ("US", "CA", "GB").
// Display names come from Intl.DisplayNames, so they are not hand-maintained.
// States/provinces are stored as their 2-letter postal code for US and CA;
// for every other country the state/region is free text, stored as typed.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlaterRegions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COUNTRY_CODES = (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT ' +
    'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
    'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
    'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
    'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).split(' ');

  // Extra search words people actually type.
  var COUNTRY_ALIASES = {
    US: ['USA', 'United States of America', 'America'],
    GB: ['UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
    AE: ['UAE'], KR: ['South Korea', 'Korea'], NL: ['Holland'], CZ: ['Czech Republic'],
  };

  var US_STATES = [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
    ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
    ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
    ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
    ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
    ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
    ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
    ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
    ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ];
  var CA_PROVINCES = [
    ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
    ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
    ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
  ];
  // Common abbreviations people type for these.
  var REGION_ALIASES = {
    US: { 'wash': 'WA', 'calif': 'CA', 'cali': 'CA', 'mass': 'MA', 'penn': 'PA', 'tex': 'TX', 'fla': 'FL', 'washington dc': 'DC', 'washington d.c.': 'DC', 'd.c.': 'DC' },
    CA: { 'b.c.': 'BC', 'que': 'QC', 'quebec city': 'QC', 'pei': 'PE', 'p.e.i.': 'PE', 'nfld': 'NL', 'newfoundland': 'NL', 'labrador': 'NL', 'yukon territory': 'YT' },
  };
  var REGIONS = { US: US_STATES, CA: CA_PROVINCES };

  var displayNames = null;
  try { displayNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* very old browser */ }
  var countryNameCache = {};
  function countryName(code) {
    if (!code) return '';
    if (countryNameCache[code]) return countryNameCache[code];
    var n = code;
    try { if (displayNames) n = displayNames.of(code) || code; } catch (e) {}
    countryNameCache[code] = n;
    return n;
  }
  var COUNTRY_SET = {};
  COUNTRY_CODES.forEach(function (c) { COUNTRY_SET[c] = 1; });
  function isCountry(code) { return !!COUNTRY_SET[code]; }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  // Countries sorted by name, US and CA first (most Slater users).
  function countries() {
    var rest = COUNTRY_CODES.filter(function (c) { return c !== 'US' && c !== 'CA'; })
      .map(function (c) { return { code: c, name: countryName(c) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    return [{ code: 'US', name: countryName('US') }, { code: 'CA', name: countryName('CA') }].concat(rest);
  }

  // "Canada" / "ca" / "UK" -> code, or null if unrecognized.
  function resolveCountry(text) {
    var q = norm(text);
    if (!q) return null;
    if (q.length === 2 && COUNTRY_SET[q.toUpperCase()]) return q.toUpperCase();
    for (var i = 0; i < COUNTRY_CODES.length; i++) {
      var c = COUNTRY_CODES[i];
      if (norm(countryName(c)) === q) return c;
      var al = COUNTRY_ALIASES[c] || [];
      for (var j = 0; j < al.length; j++) if (norm(al[j]) === q) return c;
    }
    return null;
  }

  // Search countries for a type-ahead. Prefix matches first.
  function searchCountries(text, limit) {
    var q = norm(text);
    var all = countries();
    if (!q) return all.slice(0, limit || all.length);
    var starts = [], contains = [];
    all.forEach(function (c) {
      var hay = [c.name].concat(COUNTRY_ALIASES[c.code] || []).map(norm);
      if (c.code.toLowerCase() === q || hay.some(function (h) { return h.indexOf(q) === 0; })) starts.push(c);
      else if (hay.some(function (h) { return h.indexOf(q) !== -1; })) contains.push(c);
    });
    return starts.concat(contains).slice(0, limit || 50);
  }

  function hasRegionList(country) { return !!REGIONS[country]; }

  // Which state lists to search. US and CA search each other too (own list
  // first): picking "BC" while the country says US means the country is
  // wrong, not the province. No US and CA codes or names overlap.
  function listsFor(country) {
    if (!country) return ['US', 'CA'];
    if (country === 'US') return ['US', 'CA'];
    if (country === 'CA') return ['CA', 'US'];
    return [];
  }

  // Find a US state / CA province from typed text. country may be null
  // (US tried first). Returns { code, name, country } or null.
  function resolveRegion(text, country) {
    var q = norm(text);
    if (!q) return null;
    var lists = listsFor(country);
    for (var i = 0; i < lists.length; i++) {
      var cc = lists[i], list = REGIONS[cc];
      for (var j = 0; j < list.length; j++) {
        if (list[j][0].toLowerCase() === q || norm(list[j][1]) === q) return { code: list[j][0], name: list[j][1], country: cc };
      }
      var alias = REGION_ALIASES[cc][q] || REGION_ALIASES[cc][q.replace(/\.$/, '')];
      if (alias) {
        var hit = list.filter(function (r) { return r[0] === alias; })[0];
        return { code: hit[0], name: hit[1], country: cc };
      }
    }
    return null;
  }

  // Type-ahead suggestions for State. Code matches first, then name prefix,
  // then name contains.
  function searchRegions(text, country, limit) {
    var q = norm(text);
    var lists = listsFor(country);
    var codeHits = [], starts = [], contains = [];
    lists.forEach(function (cc) {
      REGIONS[cc].forEach(function (r) {
        var item = { code: r[0], name: r[1], country: cc };
        var name = r[1].toLowerCase();
        if (!q) starts.push(item);
        else if (r[0].toLowerCase() === q) codeHits.push(item);
        else if (name.indexOf(q) === 0 || r[0].toLowerCase().indexOf(q) === 0) starts.push(item);
        else if (name.indexOf(q) !== -1) contains.push(item);
      });
    });
    return codeHits.concat(starts, contains).slice(0, limit || 80);
  }

  // Clean a stored state value: known US/CA names and codes become the code.
  // Other text is kept as typed (trimmed). Returns { state, country }:
  // country is filled in when it was empty and the state identifies it.
  function normalizeAddress(state, country) {
    var s = String(state == null ? '' : state).trim();
    var c = country || null;
    if (!s) return { state: null, country: c };
    if (c && !hasRegionList(c)) return { state: s, country: c }; // e.g. GB: free text
    var hit = resolveRegion(s, c);
    if (hit) return { state: hit.code, country: hit.country };
    return { state: s, country: c };
  }

  return {
    COUNTRY_CODES: COUNTRY_CODES,
    countries: countries,
    countryName: countryName,
    isCountry: isCountry,
    resolveCountry: resolveCountry,
    searchCountries: searchCountries,
    hasRegionList: hasRegionList,
    resolveRegion: resolveRegion,
    searchRegions: searchRegions,
    normalizeAddress: normalizeAddress,
    regionName: function (code, country) { var r = resolveRegion(code, country); return r ? r.name : ''; },
  };
});

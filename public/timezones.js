// Time zones: the one list behind every time zone picker (Schedule tab, My Info,
// Organizations) and the client portal's time conversion (routes/portal.js
// requires this file too).
//
// Saved values: the original eight keep their short codes (PT, ET, CT, MT, AKT,
// HT, GMT, CET) so existing projects, users and organizations need no change.
// Everything added since is saved as its IANA name ("Asia/Tokyo").
(function (root) {
  var ZONES = [
    // North America (west to east)
    { v: 'HT',                 iana: 'Pacific/Honolulu',    group: 'North America', name: 'Hawaii Time',           where: 'Honolulu' },
    { v: 'AKT',                iana: 'America/Anchorage',   group: 'North America', name: 'Alaska Time',           where: 'Anchorage' },
    { v: 'PT',                 iana: 'America/Los_Angeles', group: 'North America', name: 'Pacific Time',          where: 'Seattle, Los Angeles, Vancouver' },
    { v: 'America/Phoenix',    iana: 'America/Phoenix',     group: 'North America', name: 'Arizona Time',          where: 'Phoenix, no daylight saving' },
    { v: 'MT',                 iana: 'America/Denver',      group: 'North America', name: 'Mountain Time',         where: 'Denver, Salt Lake City, Calgary' },
    { v: 'CT',                 iana: 'America/Chicago',     group: 'North America', name: 'Central Time',          where: 'Chicago, Dallas, Winnipeg' },
    { v: 'ET',                 iana: 'America/New_York',    group: 'North America', name: 'Eastern Time',          where: 'New York, Atlanta, Toronto' },
    { v: 'America/Halifax',    iana: 'America/Halifax',     group: 'North America', name: 'Atlantic Time',         where: 'Halifax' },
    { v: 'America/St_Johns',   iana: 'America/St_Johns',    group: 'North America', name: 'Newfoundland Time',     where: "St. John's" },

    // Latin America and the Caribbean
    { v: 'America/Mexico_City',  iana: 'America/Mexico_City',  group: 'Latin America', name: 'Mexico City Time',  where: 'Mexico City, Guadalajara' },
    { v: 'America/Costa_Rica',   iana: 'America/Costa_Rica',   group: 'Latin America', name: 'Central America',   where: 'Costa Rica, Guatemala, El Salvador' },
    { v: 'America/Bogota',       iana: 'America/Bogota',       group: 'Latin America', name: 'Colombia Time',     where: 'Bogotá, Lima, Quito, Panama' },
    { v: 'America/Puerto_Rico',  iana: 'America/Puerto_Rico',  group: 'Latin America', name: 'Caribbean Time',    where: 'Puerto Rico, Santo Domingo' },
    { v: 'America/Caracas',      iana: 'America/Caracas',      group: 'Latin America', name: 'Venezuela Time',    where: 'Caracas' },
    { v: 'America/Santiago',     iana: 'America/Santiago',     group: 'Latin America', name: 'Chile Time',        where: 'Santiago' },
    { v: 'America/Sao_Paulo',    iana: 'America/Sao_Paulo',    group: 'Latin America', name: 'Brazil Time',       where: 'São Paulo, Rio de Janeiro' },
    { v: 'America/Argentina/Buenos_Aires', iana: 'America/Argentina/Buenos_Aires', group: 'Latin America', name: 'Argentina Time', where: 'Buenos Aires' },

    // Europe
    { v: 'Atlantic/Reykjavik', iana: 'Atlantic/Reykjavik',  group: 'Europe', name: 'Iceland Time',            where: 'Reykjavik, no daylight saving' },
    { v: 'GMT',                iana: 'Europe/London',       group: 'Europe', name: 'UK and Ireland Time',     where: 'London, Dublin, Lisbon' },
    { v: 'CET',                iana: 'Europe/Paris',        group: 'Europe', name: 'Central European Time',   where: 'Paris, Berlin, Madrid, Rome, Amsterdam' },
    { v: 'Europe/Athens',      iana: 'Europe/Athens',       group: 'Europe', name: 'Eastern European Time',   where: 'Athens, Helsinki, Kyiv, Bucharest' },
    { v: 'Europe/Istanbul',    iana: 'Europe/Istanbul',     group: 'Europe', name: 'Turkey Time',             where: 'Istanbul' },
    { v: 'Europe/Moscow',      iana: 'Europe/Moscow',       group: 'Europe', name: 'Moscow Time',             where: 'Moscow' },

    // Africa and the Middle East
    { v: 'Africa/Lagos',       iana: 'Africa/Lagos',        group: 'Africa and Middle East', name: 'West Africa Time',     where: 'Lagos, Kinshasa' },
    { v: 'Africa/Johannesburg', iana: 'Africa/Johannesburg', group: 'Africa and Middle East', name: 'South Africa Time',   where: 'Johannesburg, Cape Town' },
    { v: 'Africa/Cairo',       iana: 'Africa/Cairo',        group: 'Africa and Middle East', name: 'Egypt Time',           where: 'Cairo' },
    { v: 'Asia/Jerusalem',     iana: 'Asia/Jerusalem',      group: 'Africa and Middle East', name: 'Israel Time',          where: 'Jerusalem, Tel Aviv' },
    { v: 'Africa/Nairobi',     iana: 'Africa/Nairobi',      group: 'Africa and Middle East', name: 'East Africa Time',     where: 'Nairobi' },
    { v: 'Asia/Riyadh',        iana: 'Asia/Riyadh',         group: 'Africa and Middle East', name: 'Arabia Time',          where: 'Riyadh, Doha, Kuwait City' },
    { v: 'Asia/Tehran',        iana: 'Asia/Tehran',         group: 'Africa and Middle East', name: 'Iran Time',            where: 'Tehran' },
    { v: 'Asia/Dubai',         iana: 'Asia/Dubai',          group: 'Africa and Middle East', name: 'Gulf Time',            where: 'Dubai, Abu Dhabi' },

    // Asia
    { v: 'Asia/Karachi',       iana: 'Asia/Karachi',        group: 'Asia', name: 'Pakistan Time',      where: 'Karachi, Lahore' },
    { v: 'Asia/Kolkata',       iana: 'Asia/Kolkata',        group: 'Asia', name: 'India Time',         where: 'Mumbai, Delhi, Bangalore' },
    { v: 'Asia/Kathmandu',     iana: 'Asia/Kathmandu',      group: 'Asia', name: 'Nepal Time',         where: 'Kathmandu' },
    { v: 'Asia/Dhaka',         iana: 'Asia/Dhaka',          group: 'Asia', name: 'Bangladesh Time',    where: 'Dhaka' },
    { v: 'Asia/Bangkok',       iana: 'Asia/Bangkok',        group: 'Asia', name: 'Indochina Time',     where: 'Bangkok, Jakarta, Ho Chi Minh City' },
    { v: 'Asia/Singapore',     iana: 'Asia/Singapore',      group: 'Asia', name: 'Singapore Time',     where: 'Singapore, Kuala Lumpur' },
    { v: 'Asia/Manila',        iana: 'Asia/Manila',         group: 'Asia', name: 'Philippine Time',    where: 'Manila' },
    { v: 'Asia/Shanghai',      iana: 'Asia/Shanghai',       group: 'Asia', name: 'China Time',         where: 'Beijing, Shanghai, Shenzhen' },
    { v: 'Asia/Hong_Kong',     iana: 'Asia/Hong_Kong',      group: 'Asia', name: 'Hong Kong Time',     where: 'Hong Kong' },
    { v: 'Asia/Taipei',        iana: 'Asia/Taipei',         group: 'Asia', name: 'Taiwan Time',        where: 'Taipei' },
    { v: 'Asia/Seoul',         iana: 'Asia/Seoul',          group: 'Asia', name: 'Korea Time',         where: 'Seoul' },
    { v: 'Asia/Tokyo',         iana: 'Asia/Tokyo',          group: 'Asia', name: 'Japan Time',         where: 'Tokyo, Osaka' },

    // Australia and the Pacific
    { v: 'Australia/Perth',    iana: 'Australia/Perth',     group: 'Australia and Pacific', name: 'Western Australia Time', where: 'Perth' },
    { v: 'Australia/Adelaide', iana: 'Australia/Adelaide',  group: 'Australia and Pacific', name: 'Central Australia Time', where: 'Adelaide' },
    { v: 'Australia/Brisbane', iana: 'Australia/Brisbane',  group: 'Australia and Pacific', name: 'Queensland Time',        where: 'Brisbane, no daylight saving' },
    { v: 'Australia/Sydney',   iana: 'Australia/Sydney',    group: 'Australia and Pacific', name: 'Eastern Australia Time', where: 'Sydney, Melbourne, Canberra' },
    { v: 'Pacific/Auckland',   iana: 'Pacific/Auckland',    group: 'Australia and Pacific', name: 'New Zealand Time',       where: 'Auckland, Wellington' },

    // Other
    { v: 'UTC',                iana: 'UTC',                 group: 'Other', name: 'UTC',                    where: 'Coordinated Universal Time' },
  ];
  var BY_V = {};
  ZONES.forEach(function (z) { BY_V[z.v] = z; });

  function validIana(name) {
    if (typeof name !== 'string' || !/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+\-]+)+)$/.test(name)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: name }); return true; } catch (e) { return false; }
  }

  // Saved value ("PT", "Asia/Tokyo") -> IANA name, or '' for none/unknown.
  function iana(v) {
    if (!v || v === 'none') return '';
    if (BY_V[v]) return BY_V[v].iana;
    return validIana(v) ? v : '';
  }

  // Short zone name for a moment: "PST", "BST", "CEST", "IST", "AEDT", else "GMT+9".
  // US English gives letters for North America only; other English locales
  // know their own region's letters, so try them before settling on an offset.
  var ABBR_LOCALES = ['en-US', 'en-GB', 'en-IN', 'en-AU', 'en-NZ', 'en-CA'];
  function abbr(ianaName, date) {
    if (!ianaName) return '';
    var d = date || new Date(), first = '';
    for (var i = 0; i < ABBR_LOCALES.length; i++) {
      try {
        var parts = new Intl.DateTimeFormat(ABBR_LOCALES[i], { timeZone: ianaName, timeZoneName: 'short' }).formatToParts(d);
        var s = '';
        for (var j = 0; j < parts.length; j++) if (parts[j].type === 'timeZoneName') s = parts[j].value;
        if (!first) first = s;
        if (s && !/^(GMT|UTC)[+\-−]/.test(s)) return s;
      } catch (e) { /* unknown zone or locale */ }
    }
    return first;
  }

  // Wall-clock time on a date in a zone -> exact moment (ms since 1970, UTC).
  // "10:00 on 2026-12-02 in America/Los_Angeles" -> the 18:00 UTC moment. DST-aware.
  function zoneOffsetMin(ms, ianaName) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: ianaName, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60000;
  }
  function toUtcMs(dateIso, h, m, ianaName) {
    var d = String(dateIso).split('-').map(Number);
    var wall = Date.UTC(d[0], d[1] - 1, d[2], h, m), ms = wall;
    for (var i = 0; i < 2; i++) ms = wall - zoneOffsetMin(ms, ianaName) * 60000;  // twice: settles DST edges
    return ms;
  }

  function name(v) { var z = BY_V[v]; return z ? z.name : (iana(v) || ''); }
  function label(v) { var z = BY_V[v]; return z ? z.name + ' (' + z.where + ')' : (iana(v) || ''); }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  // Fill a <select>: a "none" option first, then the zones grouped by region.
  // Keeps the current value; falls back to defaultValue.
  function fill(sel, noneLabel, defaultValue) {
    if (!sel) return;
    var keep = sel.value || defaultValue || 'none';
    var html = '<option value="none">' + esc(noneLabel) + '</option>', group = '';
    ZONES.forEach(function (z) {
      if (z.group !== group) { html += (group ? '</optgroup>' : '') + '<optgroup label="' + esc(z.group) + '">'; group = z.group; }
      html += '<option value="' + esc(z.v) + '">' + esc(label(z.v)) + '</option>';
    });
    sel.innerHTML = html + '</optgroup>';
    sel.value = BY_V[keep] || keep === 'none' ? keep : (defaultValue || 'none');
  }

  var api = { list: ZONES, iana: iana, abbr: abbr, name: name, label: label, fill: fill, toUtcMs: toUtcMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlaterTZ = api;
})(typeof window !== 'undefined' ? window : this);

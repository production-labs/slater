  
 // ── Server API client ─────────────────────────────────────────────────────────
 const API = {
   base: window.location.origin,
   async getProjects() {
     try {
       const r = await fetch(this.base+'/api/projects');
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getProject(key) {
     try {
       const r = await fetch(this.base+'/api/projects/'+key);
       if (r.status === 401) return { _unauthenticated: true };
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async saveProject(key, label, data) {
     try {
       const r = await fetch(this.base+'/api/projects/'+key, {
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({label, data})
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async deleteProject(key) {
     try {
       const r = await fetch(this.base+'/api/projects/'+key, {method:'DELETE'});
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async saveReceipt(projectKey, index, imageData) {
     try {
       const r = await fetch(this.base+'/api/receipts/'+projectKey+'/'+index, {
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({image_data: imageData})
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getReceipts(projectKey) {
     try {
       const r = await fetch(this.base+'/api/receipts/'+projectKey);
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async deleteReceipts(projectKey) {
     try {
       const r = await fetch(this.base+'/api/receipts/'+projectKey, {method:'DELETE'});
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getMe() {
     try {
       const r = await fetch(this.base+'/api/users/me');
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async saveMe(data) {
     try {
       const r = await fetch(this.base+'/api/users/me', {
         method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getAgencies() {
     try {
       const r = await fetch(this.base+'/api/agencies');
       if (!r.ok) return [];
       return await r.json();
     } catch(e) { return []; }
   },
   async createAgency(data) {
     try {
       const r = await fetch(this.base+'/api/agencies', {
         method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async updateAgency(id, data) {
     try {
       const r = await fetch(this.base+'/api/agencies/'+id, {
         method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async deleteAgency(id) {
     try {
       const r = await fetch(this.base+'/api/agencies/'+id, {method:'DELETE'});
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async setDefaultAgency(id) {
     try {
       const r = await fetch(this.base+'/api/agencies/'+id+'/set-default', {method:'POST'});
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getAgencySettings() {
     try {
       const r = await fetch(this.base+'/api/users/me/agency');
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async saveAgencySettings(data) {
     try {
       const r = await fetch(this.base+'/api/users/me/agency', {
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(data)
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async getContacts() {
     try {
       const r = await fetch(this.base+'/api/users/me/contacts');
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
   async saveContacts(data) {
     try {
       const r = await fetch(this.base+'/api/users/me/contacts', {
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(data)
       });
       if (!r.ok) return null;
       return await r.json();
     } catch(e) { return null; }
   },
 };
  
const LB64 = "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"

function loadSavedLogo() {
  var img = document.getElementById("li");
  if(img) img.src = "data:image/png;base64," + LB64;
}

// Returns an inline SVG string for a Lucide icon, usable in innerHTML templates.
// name: kebab-case icon name (e.g. 'pencil', 'chevron-right')
// extraClass: optional extra CSS classes for the svg element
function icon(name, extraClass) {
  if (typeof lucide === 'undefined') return '';
  var key = name.replace(/-([a-z0-9])/g, function(_, c) { return c.toUpperCase(); });
  key = key.charAt(0).toUpperCase() + key.slice(1);
  var nodes = lucide[key];
  if (!nodes || !Array.isArray(nodes)) return '';
  var cls = 'lucide' + (extraClass ? ' ' + extraClass : '');
  var inner = nodes.map(function(n) {
    var tag = n[0], attrs = n[1];
    var attrStr = Object.keys(attrs).map(function(k) { return k + '="' + attrs[k] + '"'; }).join(' ');
    return '<' + tag + ' ' + attrStr + '/>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="' + cls + '">' + inner + '</svg>';
}

let crew = [], talent = [], kp = [], lt = null, _uid = 0;

function st(n) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".sec").forEach(s => s.classList.remove("active"));
  ["project","schedule","crew","talent","workback","urls","notes","expenses"].forEach((x,i) => {
    if (x === n) {
      document.querySelectorAll(".tab")[i].classList.add("active");
      document.getElementById("tab-"+n).classList.add("active");
    }
  });
  document.querySelectorAll(".app-nav-item:not(.app-nav-toggle)").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.tab === n);
  });
  document.querySelectorAll(".mobile-nav-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.tab === n);
  });
  if (n === "workback") refreshWbDaySelector();
  if (n === "notes") setTimeout(initNoteEditorPaste, 50);
  // Autosave on tab switch
  if (currentSheetKey) autosaveNow();
}

function openMobileDrawer() {
  var mobileSelectWrap = document.getElementById("mobile-lib-select-wrap");
  mobileSelectWrap.innerHTML = "";
  var sel = document.getElementById("lib-select");
  if (sel) {
    var clone = sel.cloneNode(true);
    clone.id = "mobile-lib-select";
    clone.style.cssText = "width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;background:var(--surface);box-sizing:border-box";
    clone.onchange = function() { sel.value = this.value; sel.dispatchEvent(new Event("change")); closeMobileDrawer(); };
    mobileSelectWrap.appendChild(clone);
  }

  var btnWrap = document.getElementById("mobile-lib-buttons");
  btnWrap.innerHTML = "";
  var actions = [
    { label: "+ New", fn: function() { libNew(); closeMobileDrawer(); } },
    { label: "Save", fn: function() { libSave(); closeMobileDrawer(); } },
    { label: "Duplicate", fn: function() { libDuplicate(); closeMobileDrawer(); } },
    { label: "Delete", fn: function() { libDelete(); closeMobileDrawer(); } },
  ];
  actions.forEach(function(a) {
    var btn = document.createElement("button");
    btn.textContent = a.label;
    btn.onclick = a.fn;
    btn.style.cssText = "width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);font-size:14px;font-family:inherit;cursor:pointer;text-align:left;color:var(--charcoal);min-height:unset";
    btnWrap.appendChild(btn);
  });

  document.getElementById("mobile-drawer").style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeMobileDrawer() {
  document.getElementById("mobile-drawer").style.display = "none";
  document.body.style.overflow = "";
}

function mobileNavGo(tabId) {
  st(tabId);
  closeMobileMoreMenu();
}

function toggleMobileMoreMenu() {
  var menu = document.getElementById("mobile-more-menu");
  menu.style.display = menu.style.display === "none" ? "block" : "none";
}

function closeMobileMoreMenu() {
  var menu = document.getElementById("mobile-more-menu");
  if (menu) menu.style.display = "none";
}

document.addEventListener("click", function(e) {
  if (!e.target.closest("#mobile-more-menu") && !e.target.closest("#mobile-nav-more")) {
    closeMobileMoreMenu();
  }
});

function initMobileCollapse(dayId) {
  if (window.innerWidth > 768) return;
  var el = document.getElementById(dayId);
  if (!el) return;
  var body = el.querySelector(".sday-body");
  var header = el.querySelector(".sday-header");
  var chevron = header ? header.querySelector(".sday-chevron") : null;
  if (!body || !header) return;
  body.style.display = "none";
  header.onclick = function() {
    var isOpen = body.style.display !== "none";
    body.style.display = isOpen ? "none" : "block";
    if (chevron) chevron.style.transform = isOpen ? "" : "rotate(90deg)";
  };
}

function v(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function setStatus(m, t) {
  // Show as toast at top of screen
  const toast = document.getElementById("toast");
  toast.textContent = m;
  toast.className = "toast " + t + " show";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.classList.remove("show"); }, 3000);
  // Also update bottom bar for errors during doc generation
  const b = document.getElementById("status-bar");
  b.textContent = m; b.className = "sb " + t; b.style.display = t === "err" ? "block" : "none";
}

var _geocodeCache = {};
var _geocodeInFlight = {};
async function geocode(a) {
  if (_geocodeCache[a]) return _geocodeCache[a];
  // Deduplicate in-flight requests for the same address
  if (_geocodeInFlight[a]) return _geocodeInFlight[a];
  async function tryGeocode(q) {
    const r = await fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q) + "&format=json&limit=1", {headers:{"Accept-Language":"en"}});
    const d = await r.json();
    if (!d.length) throw 0;
    return {lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon)};
  }
  var promise = (async function() {
    try {
      var result = await tryGeocode(a);
      _geocodeCache[a] = result;
      return result;
    } catch(e) {
      var stripped = a.replace(/,?\s*(\d+\w*\s+)?(suite|ste\.?|floor|fl\.?|apt\.?|apartment|unit|#)\s*[\w-]*/gi, "").replace(/\s{2,}/g, " ").trim().replace(/,\s*,/g, ",");
      if (stripped !== a) {
        var result2 = await tryGeocode(stripped);
        _geocodeCache[a] = result2;
        return result2;
      }
      throw 0;
    } finally {
      delete _geocodeInFlight[a];
    }
  })();
  _geocodeInFlight[a] = promise;
  return promise;
}
function f12(t) {
  if (!t) return "";
  // Extract HH:MM and AM/PM robustly regardless of API format
  const m = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return t;
  return m[1] + ":" + m[2] + (m[3] ? " " + m[3].toLowerCase() : "");
}
async function fetchSun(lat, lng, ds) {
  // Drop time_format param — it causes the API to return duration strings like "126our"
  const r = await fetch("https://api.sunrisesunset.io/json?lat="+lat+"&lng="+lng+"&date="+ds);
  const d = await r.json();
  if (d.status !== "OK") throw 0;
  const results = typeof d.results === "string" ? JSON.parse(d.results) : d.results;
  return {sunrise: results.sunrise, sunset: results.sunset};
}
async function fetchHosp(lat, lng) {
  const q = '[out:json][timeout:10];(node["amenity"="hospital"]["emergency"="yes"](around:10000,'+lat+','+lng+');way["amenity"="hospital"]["emergency"="yes"](around:10000,'+lat+','+lng+');node["amenity"="hospital"](around:10000,'+lat+','+lng+');way["amenity"="hospital"](around:10000,'+lat+','+lng+'););out center 5;';
  const r = await fetch("https://overpass-api.de/api/interpreter", {method:"POST", body:q});
  const d = await r.json(); if (!d.elements || !d.elements.length) throw 0;
  const sc = d.elements.map(el => { const la=el.lat||(el.center && el.center.lat), ln=el.lon||(el.center && el.center.lon); return {el, dist:Math.sqrt((la-lat)**2+(ln-lng)**2), hasER:(el.tags && el.tags.emergency)==="yes"?0:1}; }).sort((a,b) => a.hasER-b.hasER||a.dist-b.dist);
  const tg = sc[0].el.tags||{}; const nm = tg.name||tg["name:en"]||"Hospital";
  const st2 = [tg["addr:housenumber"],tg["addr:street"]].filter(Boolean).join(" ");
  const ci = tg["addr:city"]||"", st3 = tg["addr:state"]||tg["addr:province"]||"", po = tg["addr:postcode"]||"";
  return [nm, st2, ([ci,st3].filter(Boolean).join(", ")+(po?" "+po:"")).trim()].filter(Boolean).join("\n");
}

function parseHospitalText(raw) {
  if (!raw) return "";
  if (raw.indexOf("\n") !== -1) return raw;
  // Extract trailing ", STATE ZIP"
  var m = raw.match(/^(.*),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) {
    var m2 = raw.match(/^(.+?)(\d{1,5}\s+.+)$/);
    return m2 ? m2[1] + "\n" + m2[2] : raw;
  }
  var beforeCity = m[1], state = m[2], zip = m[3];
  // City is the last capitalized word(s) at the end of beforeCity
  var cm = beforeCity.match(/^([\s\S]*\S)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/);
  if (!cm) return raw;
  var nameAndStreet = cm[1], city = cm[2];
  var sm = nameAndStreet.match(/^(.+?)(\d{1,5}\s+.+)$/);
  if (sm) return sm[1] + "\n" + sm[2].trimEnd() + "\n" + city + ", " + state + " " + zip;
  return nameAndStreet + "\n" + city + ", " + state + " " + zip;
}

function lookupHospForDay(dayId, addr) {
  var hospEl = document.getElementById(dayId+"_hospital");
  if (!hospEl) return;
  geocode(addr).then(function(coords) {
    return fetchHosp(coords.lat, coords.lng);
  }).then(function(text) {
    hospEl.textContent = text;
    hospEl.style.display = text ? "block" : "none";
  }).catch(function() {});
}

function getLocByName(name) {
  if (!name) return null;
  return (loadContacts().locations || []).find(function(l) { return l.name === name; }) || null;
}

function doLookup() {
  if (!scheduleDays.length) return;
  scheduleDays.forEach(function(dayId) {
    var iso = (document.getElementById(dayId+"_date_iso")||{}).value||"";
    if (!iso) return;
    var inp = document.getElementById(dayId+"_loc_id");
    if (!inp || !inp.value) return;
    var loc = getLocByName(inp.value);
    if (!loc || !loc.address) return;
    var addr = [loc.address, loc.city, loc.state].filter(Boolean).join(", ");
    if (!addr) return;
    lookupSunForDayWithAddr(dayId, iso, addr);
  });
}
function tl() { clearTimeout(lt); lt = setTimeout(doLookup, 900); }

function sd(id) {
  const iso = v(id+"_date_iso"); if (!iso) return;
  const d = new Date(iso+"T12:00:00");
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById(id+"_date").value = days[d.getDay()]+" "+d.getDate()+" "+months[d.getMonth()]+" "+d.getFullYear();
}
function syncDayDate(n) {
  const iso = v("day"+n+"_date_iso"); if (!iso) return;
  const d = new Date(iso+"T12:00:00");
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("day"+n+"_date").value = days[d.getDay()]+" "+d.getDate()+" "+months[d.getMonth()]+" "+d.getFullYear();
  tl();
}
var CREW_STATUS = {
  tbd:       {label:"TBD",       color:"#9D9D99", tip:"Not yet contacted"},
  pencil:    {label:"Pencil",    color:"#E8B84B", tip:"Informally in mind, no commitment yet"},
  hold:      {label:"1st Hold",  color:"#E07B39", tip:"Priority hold on their schedule — check with before accepting other work"},
  confirmed: {label:"Confirmed", color:"#4A9E6B", tip:"Booked and locked in"}
};

var CATEGORY_CONFIG = {
  setup_day:          { f1:{show:true,  label:"Call Time"},                   f2:{show:false},                               f3:{show:true,  label:"Wrap"},      hasMeals:true  },
  shoot_day:          { f1:{show:true,  label:"Call Time"},                   f2:{show:true,  label:"Cameras Up"},            f3:{show:true,  label:"Wrap"},      hasMeals:true  },
  live_broadcast:     { f1:{show:true,  label:"Call Time"},                   f2:{show:true,  label:"Go Live"},              f3:{show:true,  label:"Wrap"},      hasMeals:true  },
  wrap_day:           { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:true  },
  internal_kickoff:   { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  client_meeting:     { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  uncrewed_rehearsal: { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  crewed_rehearsal:   { f1:{show:true,  label:"Call Time"},                   f2:{show:true,  label:"Start Time"},           f3:{show:true,  label:"End Time"},  hasMeals:true  },
  tech_check:         { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  location_scout:     { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  edit_session:       { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  review_session:     { f1:{show:true,  label:"Start Time"},                  f2:{show:false},                               f3:{show:true,  label:"End Time"},  hasMeals:false },
  travel_day:         { f1:{show:true,  label:"Departure"},                   f2:{show:false},                               f3:{show:true,  label:"Arrival"},   hasMeals:false },
  deadline:           { f1:{show:false},                                       f2:{show:false},                               f3:{show:false},                    hasMeals:false },
  other:              { f1:{show:true,  label:"Start Time", editable:true},   f2:{show:true,  label:"Middle Time", editable:true}, f3:{show:true, label:"End Time", editable:true}, hasMeals:false },
};
function updateCrewStatusPill(id, val) {
  var s = CREW_STATUS[val] || CREW_STATUS.tbd;
  var pill = document.getElementById(id+"_status_pill");
  if (!pill) return;
  pill.textContent = s.label;
  pill.style.background = s.color;
  pill.setAttribute("data-tooltip", s.tip);
}
function updateCrewStatusBar() {
  var bar = document.getElementById("crew-status-bar");
  if (!bar) return;
  if (!crew.length) { bar.style.display = "none"; return; }
  var counts = {tbd:0, pencil:0, hold:0, confirmed:0};
  crew.forEach(function(id) {
    var sel = document.getElementById(id+"_status");
    var val = sel ? (sel.value || "tbd") : "tbd";
    if (counts[val] !== undefined) counts[val]++; else counts.tbd++;
  });
  var total = crew.length;
  var pct = Math.round((counts.confirmed / total) * 100);
  document.getElementById("csb-tbd-count").textContent = counts.tbd;
  document.getElementById("csb-pencil-count").textContent = counts.pencil;
  document.getElementById("csb-hold-count").textContent = counts.hold;
  document.getElementById("csb-confirmed-count").textContent = counts.confirmed;
  document.getElementById("csb-progress-fill").style.width = pct + "%";
  document.getElementById("csb-summary").textContent = total + " crew · " + pct + "% confirmed";
  bar.style.display = "block";
}
function updateTalentStatusBar() {
  var bar = document.getElementById("talent-status-bar");
  if (!bar) return;
  if (!talent.length) { bar.style.display = "none"; return; }
  var counts = {tbd:0, pencil:0, hold:0, confirmed:0};
  talent.forEach(function(id) {
    var sel = document.getElementById(id+"_status");
    var val = sel ? (sel.value || "tbd") : "tbd";
    if (counts[val] !== undefined) counts[val]++; else counts.tbd++;
  });
  var total = talent.length;
  var pct = Math.round((counts.confirmed / total) * 100);
  document.getElementById("tsb-tbd-count").textContent = counts.tbd;
  document.getElementById("tsb-pencil-count").textContent = counts.pencil;
  document.getElementById("tsb-hold-count").textContent = counts.hold;
  document.getElementById("tsb-confirmed-count").textContent = counts.confirmed;
  document.getElementById("tsb-progress-fill").style.width = pct + "%";
  document.getElementById("tsb-summary").textContent = total + " talent \xb7 " + pct + "% confirmed";
  bar.style.display = "block";
}
// ── Drag-to-reorder (crew + talent) ──────────────────────────────────────────
var _dragSrcId = null;

function dragStart(e, id, arr) {
  _dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  document.getElementById(id).style.opacity = '0.4';
}
function dragEnd(id) {
  var el = document.getElementById(id);
  if (el) el.style.opacity = '';
  document.querySelectorAll('.card.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
  _dragSrcId = null;
}
function dragOver(e, id) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (_dragSrcId && _dragSrcId !== id) {
    document.querySelectorAll('.card.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
    document.getElementById(id).classList.add('drag-over');
  }
}
function dragDrop(e, targetId, arr) {
  e.preventDefault();
  e.stopPropagation();
  var srcId = _dragSrcId;
  if (!srcId || srcId === targetId) return;
  document.querySelectorAll('.card.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
  var srcEl = document.getElementById(srcId);
  var tgtEl = document.getElementById(targetId);
  if (!srcEl || !tgtEl) return;
  // Reorder array: remove src, insert before target
  var srcIdx = arr.indexOf(srcId);
  if (srcIdx > -1) arr.splice(srcIdx, 1);
  var newTgtIdx = arr.indexOf(targetId);
  arr.splice(newTgtIdx, 0, srcId);
  // Reorder DOM
  tgtEl.insertAdjacentElement('beforebegin', srcEl);
  srcEl.style.opacity = '';
  _dragSrcId = null;
}

function addCrew(afterId=null) {
  const id = "crew_"+(++_uid);
  const d = document.createElement("div"); d.className="card"; d.id=id;
  d.addEventListener("dragover",  e => dragOver(e, id));
  d.addEventListener("drop",      e => dragDrop(e, id, crew));
  d.innerHTML = `<div class="contact-card-row1"><div style="display:flex;align-items:center;gap:4px"><span class="drag-handle" draggable="true" title="Drag to reorder" ondragstart="dragStart(event,'${id}',crew)" ondragend="dragEnd('${id}')">&#x2261;</span><input type="text" id="${id}_position" class="contact-card-role-input" placeholder="Position / Role" autocomplete="new-password"><span class="contact-card-pencil" onclick="document.getElementById('${id}_position').focus()" title="Edit role">${icon('pencil','pencil-icon')}</span></div><div style="display:flex;align-items:center;gap:6px"><span class="crew-status-pill" id="${id}_status_pill"></span><button class="contact-card-delete" onclick="confirmRemoveCrew('${id}')">&#x2715;</button></div></div><div class="fl" style="margin-bottom:10px"><label>Name</label><input type="text" id="${id}_name" placeholder="Full name" autocomplete="new-password"></div><div class="contact-card-row3"><div class="fl"><label>Phone</label><input type="text" id="${id}_phone" placeholder="206.000.0000" autocomplete="new-password"></div><div class="fl"><label>Email</label><input type="text" id="${id}_email" placeholder="email@domain.com" autocomplete="new-password"></div><div class="fl"><label>Status</label><select id="${id}_status" onchange="updateCrewStatusPill('${id}', this.value);updateCrewStatusBar()"><option value="tbd">TBD</option><option value="pencil">Pencil</option><option value="hold">1st Hold</option><option value="confirmed">Confirmed</option></select></div></div><div class="fl" style="margin-top:10px;margin-bottom:0"><label>Notes</label><input type="text" id="${id}_notes"></div>`;
  if (afterId) {
    const idx = crew.indexOf(afterId); crew.splice(idx+1, 0, id);
    document.getElementById(afterId).insertAdjacentElement("afterend", d);
  } else { crew.push(id); document.getElementById("crew-list").appendChild(d); }
  updateCrewStatusPill(id, "tbd");
  updateCrewStatusBar();
  scheduleDays.forEach(function(d) { updateDayCrewBadge(d); });
  setTimeout(() => acAttachCrew(id), 0);
}
function addTalent(afterId=null) {
  const id = "talent_"+(++_uid);
  const d = document.createElement("div"); d.className="card"; d.id=id;
  d.addEventListener("dragover",  e => dragOver(e, id));
  d.addEventListener("drop",      e => dragDrop(e, id, talent));
  d.innerHTML = `<div class="contact-card-row1"><div style="display:flex;align-items:center;gap:4px"><span class="drag-handle" draggable="true" title="Drag to reorder" ondragstart="dragStart(event,'${id}',talent)" ondragend="dragEnd('${id}')">&#x2261;</span><input type="text" id="${id}_title" class="contact-card-role-input" placeholder="Title / Role" autocomplete="new-password"><span class="contact-card-pencil" onclick="document.getElementById('${id}_title').focus()" title="Edit title">${icon('pencil','pencil-icon')}</span></div><div style="display:flex;align-items:center;gap:6px"><span class="crew-status-pill" id="${id}_status_pill"></span><button class="contact-card-delete" onclick="confirmRemoveTalent('${id}')">&#x2715;</button></div></div><div class="fl" style="margin-bottom:10px"><label>Name</label><input type="text" id="${id}_name" placeholder="Full name" autocomplete="new-password"></div><div class="contact-card-row3"><div class="fl"><label>Phone</label><input type="text" id="${id}_phone" placeholder="613.000.0000" autocomplete="new-password"></div><div class="fl"><label>Email</label><input type="text" id="${id}_email" placeholder="email@domain.com" autocomplete="new-password"></div><div class="fl"><label>Status</label><select id="${id}_status" onchange="updateCrewStatusPill('${id}', this.value);updateTalentStatusBar()"><option value="tbd">TBD</option><option value="pencil">Pencil</option><option value="hold">1st Hold</option><option value="confirmed">Confirmed</option></select></div></div><div class="fl" style="margin-top:10px;margin-bottom:0"><label>Notes</label><input type="text" id="${id}_notes"></div>`;
  if (afterId) {
    const idx = talent.indexOf(afterId); talent.splice(idx+1, 0, id);
    document.getElementById(afterId).insertAdjacentElement("afterend", d);
  } else { talent.push(id); document.getElementById("talent-list").appendChild(d); }
  updateCrewStatusPill(id, "tbd");
  updateTalentStatusBar();
  scheduleDays.forEach(function(d) { updateDayTalentBadge(d); });
  setTimeout(() => acAttachTalent(id), 0);
}
function ri(id, arr) { const i = arr.indexOf(id); if (i > -1) arr.splice(i,1); document.getElementById(id).remove(); }
function confirmRemoveCrew(id) {
  var name = (document.getElementById(id+"_name")||{}).value||"";
  var role = (document.getElementById(id+"_position")||{}).value||"";
  var label = (name||role) ? (name||role) : "this crew member";
  showModal("Remove crew member", "Remove "+label+"? This cannot be undone.", function() {
    ri(id, crew); updateCrewStatusBar(); scheduleDays.forEach(function(d) { updateDayCrewBadge(d); });
  });
}
function confirmRemoveTalent(id) {
  var name = (document.getElementById(id+"_name")||{}).value||"";
  var role = (document.getElementById(id+"_title")||{}).value||"";
  var label = (name||role) ? (name||role) : "this talent";
  showModal("Remove talent", "Remove "+label+"? This cannot be undone.", function() {
    ri(id, talent); updateTalentStatusBar(); scheduleDays.forEach(function(d) { updateDayTalentBadge(d); });
  });
}

function addKP(cardData) {
  cardData = cardData || {};
  var id = "kp_"+(++_uid);
  var d = document.createElement("div"); d.className="card"; d.id=id;
  d.innerHTML = '<div class="contact-card-row1"><div style="display:flex;align-items:center;gap:4px"><input type="text" id="'+id+'_role" class="contact-card-role-input" placeholder="Role" autocomplete="off" oninput="autosaveTrigger()"><span class="contact-card-pencil" onclick="document.getElementById(\''+id+'_role\').focus()" title="Edit role">'+icon('pencil','pencil-icon')+'</span></div><div style="display:flex;align-items:center;gap:6px"><span class="crew-status-pill" id="'+id+'_status_pill"></span><button class="contact-card-delete" id="'+id+'_del" title="Remove">&#x2715;</button></div></div><div class="fl" style="margin-bottom:10px"><label>Name</label><input type="text" id="'+id+'_name" autocomplete="new-password" placeholder="Full name"></div><div class="contact-card-row3"><div class="fl"><label>Phone</label><input type="text" id="'+id+'_phone" autocomplete="new-password"></div><div class="fl"><label>Email</label><input type="text" id="'+id+'_email" autocomplete="new-password"></div><div class="fl"><label>Status</label><select id="'+id+'_status" onchange="updateCrewStatusPill(\''+id+'\', this.value);autosaveTrigger()"><option value="tbd">TBD</option><option value="pencil">Pencil</option><option value="hold">1st Hold</option><option value="confirmed">Confirmed</option></select></div></div>';
  kp.push(id);
  document.getElementById("kp-list").appendChild(d);
  var sv = function(eid, val) { var e=document.getElementById(eid); if(e && val!==undefined) e.value=val||""; };
  sv(id+"_role", cardData.role||"");
  sv(id+"_name", cardData.name||"");
  sv(id+"_phone", cardData.phone||"");
  sv(id+"_email", cardData.email||"");
  sv(id+"_status", cardData.status||"tbd");
  updateCrewStatusPill(id, cardData.status||"tbd");
  (function(cardId) {
    document.getElementById(cardId+"_del").onclick = function() {
      showModal("Remove key personnel?", "Remove this person from key personnel?", function() {
        var el = document.getElementById(cardId);
        if (el) el.parentNode.removeChild(el);
        kp = kp.filter(function(k) { return k !== cardId; });
        updateAddKPButton();
        scheduleDays.forEach(function(dy) { updateDayStaffCounts(dy); });
        autosaveTrigger();
      });
    };
  })(id);
  updateAddKPButton();
  setTimeout(() => acAttachKP(id), 0);
}

function getDefaultKP() {
  return [
    {role:"EP", name:"", phone:"", email:"", status:"tbd"},
    {role:"Producer", name:"", phone:"", email:"", status:"tbd"}
  ];
}

function updateAddKPButton() {
  var btn = document.getElementById("add-kp-btn");
  if (btn) btn.style.display = kp.length >= 4 ? "none" : "";
}
// ── Flexible schedule days ────────────────────────────────────────────────────
let scheduleDays = [];
let daySchedItems = {};

var TZ_IANA = {
  PT:"America/Los_Angeles", ET:"America/New_York", CT:"America/Chicago",
  MT:"America/Denver", AKT:"America/Anchorage", HT:"Pacific/Honolulu",
  GMT:"Europe/London", CET:"Europe/Paris"
};

function normalizeTimeStr(s) {
  if (!s) return s;
  var m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+\S+)?$/i);
  if (!m) return s;
  var h = parseInt(m[1]), mn = m[2] ? parseInt(m[2]) : 0, ap = (m[3]||"").toLowerCase();
  if (!ap) {
    if (h >= 13 && h <= 23) return (h-12)+":"+String(mn).padStart(2,"0")+" PM";
    if (h === 0) return "12:"+String(mn).padStart(2,"0")+" AM";
    if (h === 12) return "12:"+String(mn).padStart(2,"0")+" PM";
    return s;
  }
  var h24 = h; if (ap==="pm"&&h!==12) h24=h+12; if (ap==="am"&&h===12) h24=0;
  return (h24%12||12)+":"+String(mn).padStart(2,"0")+" "+(h24>=12?"PM":"AM");
}

function getTzAbbr(ianaName) {
  if (!ianaName) return "";
  try {
    var parts = new Intl.DateTimeFormat("en-US",{timeZone:ianaName,timeZoneName:"short",hour:"numeric"})
      .formatToParts(new Date());
    var p = parts.find(function(x){return x.type==="timeZoneName";});
    return p ? p.value : "";
  } catch(e) { return ""; }
}

function convertTimeAcrossTz(h24, mn, fromIana, toIana, refIso) {
  var ref = refIso ? new Date(refIso+"T12:00:00") : new Date();
  var base = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), h24, mn, 0);
  var sp = new Intl.DateTimeFormat("en-US",{timeZone:fromIana,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(base)).split(":");
  var fh = parseInt(sp[0])%24, fm = parseInt(sp[1]);
  var utc = base + ((h24-fh)*60+(mn-fm))*60000;
  return new Intl.DateTimeFormat("en-US",{timeZone:toIana,hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(utc));
}

function updateTimeHint(inputEl, hintEl, dayId) {
  if (!hintEl) return;
  var val = (inputEl||{}).value||"";
  if (!val) { hintEl.textContent=""; return; }
  var projTzCode = (document.getElementById("timezone")||{}).value||"";
  if (!projTzCode||projTzCode==="none"||!TZ_IANA[projTzCode]) { hintEl.textContent=""; return; }
  var projIana = TZ_IANA[projTzCode];
  var localIana = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (localIana===projIana) { hintEl.textContent=""; return; }
  var m = val.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) { hintEl.textContent=""; return; }
  var h=parseInt(m[1]),mn=parseInt(m[2]),ap=m[3].toLowerCase();
  var h24=h; if(ap==="pm"&&h!==12) h24=h+12; if(ap==="am"&&h===12) h24=0;
  var refIso = (dayId ? (document.getElementById(dayId+"_date_iso")||{}).value||"" : "") ||
               new Intl.DateTimeFormat("en-CA",{timeZone:projIana}).format(new Date());
  // Compute UTC moment for h24:mn in projIana on refIso
  var ref = new Date(refIso+"T12:00:00");
  var base = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), h24, mn, 0);
  var sp = new Intl.DateTimeFormat("en-US",{timeZone:projIana,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(base)).split(":");
  var fh=parseInt(sp[0])%24, fm=parseInt(sp[1]);
  var utc = base + ((h24-fh)*60+(mn-fm))*60000;
  var utcDate = new Date(utc);
  var localTimeStr = new Intl.DateTimeFormat("en-US",{timeZone:localIana,hour:"numeric",minute:"2-digit",hour12:true}).format(utcDate);
  var localAbbr = getTzAbbr(localIana);
  var localDateIso = new Intl.DateTimeFormat("en-CA",{timeZone:localIana}).format(utcDate);
  var hint = localTimeStr+" "+localAbbr;
  if (localDateIso !== refIso) {
    var diff = Math.round((new Date(localDateIso+"T12:00:00") - new Date(refIso+"T12:00:00")) / 86400000);
    hint += diff === 1 ? " (next day)" : diff === -1 ? " (prev day)" : " ("+(diff>0?"+":"")+diff+" days)";
  }
  hintEl.textContent = hint;
}

function refreshAllTimeHints() {
  var projTzCode = (document.getElementById("timezone")||{}).value||"";
  var projIana = TZ_IANA[projTzCode]||"";
  var localIana = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var projAbbr = projIana ? getTzAbbr(projIana) : "";

  // Update TZ abbreviation span inside each time-field label
  var tzFlIds = ["kickoff_time_fl","video_due_time_fl"];
  scheduleDays.forEach(function(id) {
    tzFlIds.push(id+"_f1_wrap",id+"_f2_wrap",id+"_f3_wrap",id+"_breakfast_wrap",id+"_lunch_wrap");
  });
  tzFlIds.forEach(function(flId) {
    var fl = document.getElementById(flId);
    if (!fl) return;
    var lbl = fl.querySelector("label");
    if (!lbl) return;
    var sp = lbl.querySelector(".tz-abbr");
    if (projAbbr) {
      if (!sp) { sp = document.createElement("span"); sp.className = "tz-abbr"; lbl.appendChild(sp); }
      sp.textContent = " · " + projAbbr;
    } else {
      if (sp) sp.remove();
    }
  });

  // Update hints for pinned fields
  [["kickoff_time","kickoff_time_tz_hint",null],["video_due_time","video_due_time_tz_hint",null]].forEach(function(p) {
    var inp = document.getElementById(p[0]), hint = document.getElementById(p[1]);
    if (inp && hint) updateTimeHint(inp, hint, p[2]);
  });

  // Update hints for schedule day fields and schedule entries
  scheduleDays.forEach(function(dayId) {
    ["call_time","golive","wrap","breakfast","lunch"].forEach(function(f) {
      var inp = document.getElementById(dayId+"_"+f);
      var hint = document.getElementById(dayId+"_"+f+"_tz_hint");
      if (inp && hint) updateTimeHint(inp, hint, dayId);
    });
    (daySchedItems[dayId]||[]).forEach(function(entryId) {
      var inp = document.getElementById(entryId+"_time");
      var hint = document.getElementById(entryId+"_time_tz_hint");
      if (inp && hint) updateTimeHint(inp, hint, dayId);
    });
  });
}

function addScheduleDay(data, insertAfterDayId) {
  data = data || {};
  var dayId;
  if (data.id && /^sday_\d+$/.test(data.id)) {
    dayId = data.id;
    var _n = parseInt(data.id.slice(5), 10);
    if (_n >= _uid) _uid = _n;
  } else {
    dayId = "sday_" + (++_uid);
  }
  if (insertAfterDayId === undefined) {
    scheduleDays.push(dayId);
  } else if (insertAfterDayId === null) {
    scheduleDays.unshift(dayId);
  } else {
    var _afterIdx = scheduleDays.indexOf(insertAfterDayId);
    if (_afterIdx > -1) { scheduleDays.splice(_afterIdx + 1, 0, dayId); } else { scheduleDays.push(dayId); }
  }
  const el = document.createElement("div");
  el.className = "sday-block"; el.id = dayId;

  const hdr = document.createElement("div");
  hdr.className = "sday-header";
  const titleWrap = document.createElement("div");
  titleWrap.style.cssText = "display:flex;flex-direction:column;justify-content:center;flex:1;min-width:0;overflow:hidden;padding:0 12px";
  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;gap:4px";
  const titleInp = document.createElement("input");
  titleInp.type = "text"; titleInp.id = dayId+"_label";
  titleInp.className = "contact-card-role-input sday-title-input";
  titleInp.placeholder = "Untitled Activity";
  titleInp.value = data.label || "";
  titleInp.autocomplete = "new-password";
  titleInp.oninput = function() { wbRebuildPins(); autosaveTrigger(); };
  const titlePencil = document.createElement("span");
  titlePencil.className = "contact-card-pencil";
  titlePencil.innerHTML = icon('pencil', 'pencil-icon');
  titlePencil.title = "Edit day label";
  titlePencil.onclick = function() { titleInp.focus(); };
  titleRow.appendChild(titleInp); titleRow.appendChild(titlePencil);
  const dateFmtDisplay = document.createElement("div");
  dateFmtDisplay.id = dayId+"_date_display";
  dateFmtDisplay.style.cssText = "font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--film-can);font-family:'Geist',sans-serif;margin-top:2px;min-height:0";
  dateFmtDisplay.textContent = data.date || "";
  titleWrap.appendChild(titleRow);
  titleWrap.appendChild(dateFmtDisplay);

  var calWidget = document.createElement("div");
  calWidget.className = "sday-cal";
  calWidget.id = dayId+"_cal_widget";
  calWidget.title = "Export calendar invite for this day";
  calWidget.onclick = function() { generateDayICS(dayId); };
  var calMonth = document.createElement("div");
  calMonth.className = "sday-cal-month";
  calMonth.id = dayId+"_cal_month";
  calMonth.textContent = "---";
  var calDay = document.createElement("div");
  calDay.className = "sday-cal-day";
  calDay.id = dayId+"_cal_day";
  calDay.textContent = "--";
  calWidget.appendChild(calMonth);
  calWidget.appendChild(calDay);

  const removeBtn = document.createElement("button");
  removeBtn.className = "rb"; removeBtn.title = "Remove day";
  removeBtn.innerHTML = "&#x2715;";
  removeBtn.onclick = function() {
    var _lbl = (document.getElementById(dayId+"_label")||{}).value || "this activity";
    showModal("Remove activity", "Remove \""+_lbl+"\"? This cannot be undone.", function() { removeScheduleDay(dayId); });
  };
  var sdayChevron = document.createElement("span");
  sdayChevron.className = "sday-chevron"; sdayChevron.innerHTML = icon('chevron-right');
  hdr.appendChild(calWidget); hdr.appendChild(titleWrap); hdr.appendChild(sdayChevron); hdr.appendChild(removeBtn);
  // Populate directly here — getElementById won't work until el is in the DOM
  if (data.date_iso) {
    var _calMonths = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    var _calParts = data.date_iso.split("-");
    calMonth.textContent = _calMonths[parseInt(_calParts[1]) - 1] || "---";
    calDay.textContent   = parseInt(_calParts[2]) || "--";
  }
  el.appendChild(hdr);

  // ── Crew link + counts (built early so they live in checkRow) ────────────────
  function makeDayLink(iconHtml, label, onclick) {
    var lnk = document.createElement("div");
    lnk.style.cssText = "font-size:11px;color:var(--film-can);cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:color .15s";
    lnk.onmouseenter = function() { this.style.color = 'var(--charcoal)'; };
    lnk.onmouseleave = function() { this.style.color = 'var(--film-can)'; };
    var ico = document.createElement("span"); ico.innerHTML = iconHtml;
    ico.style.cssText = "flex-shrink:0;display:inline-flex;align-items:center";
    var txt = document.createElement("span"); txt.textContent = label;
    lnk.appendChild(ico); lnk.appendChild(txt); lnk.onclick = onclick;
    return lnk;
  }
  var editStaffLink = makeDayLink(icon('users'), "Edit cast & crew for this day", function() { openDayStaffModal(dayId); });
  editStaffLink.id = dayId+"_staff_link";
  var staffCountEl = document.createElement("div");
  staffCountEl.id = dayId+"_staff_counts";
  staffCountEl.style.cssText = "font-size:11px;color:var(--film-can);margin-top:2px";

  var blacksCb = document.createElement("input"); blacksCb.type = "checkbox"; blacksCb.id = dayId+"_show_blacks";
  if (data.show_blacks) blacksCb.checked = true;
  blacksCb.style.display = "none";

  var excludeWrap = document.createElement("div");
  excludeWrap.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0";
  var excludeCb = document.createElement("input");
  excludeCb.type = "checkbox"; excludeCb.id = dayId+"_exclude_callsheet";
  excludeCb.checked = data.exclude_callsheet||false;
  excludeCb.style.cssText = "width:14px;height:14px;accent-color:var(--accent);cursor:pointer";
  var excludeLbl = document.createElement("label");
  excludeLbl.htmlFor = dayId+"_exclude_callsheet";
  excludeLbl.textContent = "Exclude from call sheet";
  excludeLbl.style.cssText = "font-size:12px;color:var(--text-primary);font-weight:600;cursor:pointer;user-select:none";
  excludeWrap.appendChild(excludeCb); excludeWrap.appendChild(excludeLbl);
  excludeCb.onchange = function() { autosaveTrigger(); };

  var checkRow = document.createElement("div");
  checkRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 16px;background:var(--border);border-bottom:1px solid var(--border)";

  var crewLeft = document.createElement("div");
  crewLeft.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1";
  crewLeft.appendChild(editStaffLink); crewLeft.appendChild(staffCountEl);

  checkRow.appendChild(crewLeft);
  checkRow.appendChild(excludeWrap);
  el.appendChild(checkRow);

  const body = document.createElement("div");
  body.className = "sday-body";


  // Restore excluded crew/talent/kp from saved project data (dayId is session-scoped)
  if (data.excluded_crew && data.excluded_crew.length) {
    try { localStorage.setItem('sday_excrew_'+dayId, JSON.stringify(data.excluded_crew)); } catch(e) {}
  }
  if (data.excluded_talent && data.excluded_talent.length) {
    try { localStorage.setItem('sday_extal_'+dayId, JSON.stringify(data.excluded_talent)); } catch(e) {}
  }
  if (data.excluded_kp && data.excluded_kp.length) {
    try { localStorage.setItem('sday_exkp_'+dayId, JSON.stringify(data.excluded_kp)); } catch(e) {}
  }
  setTimeout(function() { updateDayStaffCounts(dayId); }, 0);

  function makeInput(type, id, placeholder, value) {
    const inp = document.createElement("input");
    inp.type = type; inp.id = id; inp.placeholder = placeholder||"";
    inp.value = value||""; inp.autocomplete = "new-password";
    return inp;
  }
  function makeField(labelText, child) {
    const div = document.createElement("div"); div.className = "fl";
    const lbl = document.createElement("label"); lbl.textContent = labelText;
    div.appendChild(lbl); div.appendChild(child); return div;
  }
  function makeGrid(cls, children) {
    const div = document.createElement("div"); div.className = cls;
    children.forEach(function(c) { div.appendChild(c); }); return div;
  }

  const dateIso = makeInput("date", dayId+"_date_iso", "", data.date_iso||"");
  dateIso.dataset.prevIso = data.date_iso || "";
  dateIso.onchange = function() { syncSchedDayDate(dayId); };
  dateIso.onblur = function() { autosaveTrigger(); };
  body.appendChild(blacksCb);
  const dateFmt = makeInput("text", dayId+"_date", "", data.date||"");
  dateFmt.style.display = "none";
  body.appendChild(dateFmt);
  const endDateIso = makeInput("date", dayId+"_end_date_iso", "", data.end_date_iso||"");
  endDateIso.onchange = function() { syncSchedDayEndDate(dayId); autosaveTrigger(); };
  const endDateFmt = makeInput("text", dayId+"_end_date", "", data.end_date||"");
  endDateFmt.style.display = "none";
  body.appendChild(endDateFmt);

  const isPost = (document.getElementById("project_type")||{}).value === "post_production";
  var catWrap = document.createElement("div"); catWrap.className = "fl";
  var catLbl = document.createElement("label"); catLbl.textContent = "Activity";
  var catSel = document.createElement("select");
  catSel.id = dayId+"_category";
  catSel.required = true;
  catSel.style.cssText = "width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;color:var(--text-primary);background:var(--surface)";
  var _placeholder = document.createElement("option"); _placeholder.value = ""; _placeholder.textContent = "Select"; _placeholder.disabled = true;
  catSel.appendChild(_placeholder);
  var _catGroups = [
    { label: "Production Days", options: [
      { value: "setup_day",          label: "Setup Day" },
      { value: "shoot_day",          label: "Shoot Day" },
      { value: "live_broadcast",     label: "Live Broadcast" },
      { value: "wrap_day",           label: "Wrap Day" },
    ]},
    { label: "Pre-Production", options: [
      { value: "internal_kickoff",   label: "Internal Kickoff Meeting" },
      { value: "client_meeting",     label: "Client Meeting" },
      { value: "uncrewed_rehearsal", label: "Un-Crewed Dry Run / Rehearsal" },
      { value: "crewed_rehearsal",   label: "Crewed Dry Run / Rehearsal" },
      { value: "tech_check",         label: "Tech Check" },
      { value: "location_scout",     label: "Location Scout" },
    ]},
    { label: "Post Production", options: [
      { value: "edit_session",       label: "Edit Session" },
      { value: "review_session",     label: "Review Session" },
    ]},
    { label: "Admin / Milestones", options: [
      { value: "travel_day",         label: "Travel Day" },
      { value: "other",              label: "Other" },
    ]},
  ];
  _catGroups.forEach(function(g) {
    var og = document.createElement("optgroup"); og.label = g.label;
    g.options.forEach(function(o) { var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; og.appendChild(opt); });
    catSel.appendChild(og);
  });
  catSel.value = data.category || "";
  catSel.onchange = function() {
    var _newCat = this.value;
    applyCategoryConfig(dayId, _newCat);
    var _newCfg = CATEGORY_CONFIG[_newCat] || CATEGORY_CONFIG['shoot_day'];
    var _excCb = document.getElementById(dayId+'_exclude_callsheet');
    if (_excCb) _excCb.checked = !_newCfg.hasMeals;
    autosaveTrigger();
  };
  catWrap.appendChild(catLbl); catWrap.appendChild(catSel);
  body.appendChild(catWrap);

  // ── Date / time: 3 paired g2 rows ────────────────────────────────────────────
  // Row 1: Start Date | f1 (Call Time / Start Time)
  var startDateField = document.createElement("div"); startDateField.className = "fl sday-shootdate-wrap";
  var startDateLbl = document.createElement("label"); startDateLbl.id = dayId+"_start_date_lbl"; startDateLbl.textContent = "Start Date";
  startDateField.appendChild(startDateLbl); startDateField.appendChild(dateIso);

  var f1Wrap = document.createElement("div"); f1Wrap.id = dayId+"_f1_wrap"; f1Wrap.className = "fl";
  var f1Lbl = document.createElement("label"); f1Lbl.id = dayId+"_f1_lbl"; f1Lbl.textContent = "Call Time";
  const callTime = makeInput("text", dayId+"_call_time", "e.g. 7:00 AM", data.call_time||"");
  callTime.onchange = function() { sortScheduleDays(); };
  const callTimeHint = document.createElement("span"); callTimeHint.id = dayId+"_call_time_tz_hint"; callTimeHint.className = "as";
  callTime.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;autosaveTrigger();} updateTimeHint(this,callTimeHint,dayId); };
  f1Wrap.appendChild(f1Lbl); f1Wrap.appendChild(callTime); f1Wrap.appendChild(callTimeHint);

  body.appendChild(makeGrid("g2", [startDateField, f1Wrap]));

  // Row 2: (spacer) | f2 (Go Live / Cameras Up) — hidden for non-Layout-B categories
  var f2EmptyCol = document.createElement("div"); f2EmptyCol.className = "fl";
  var f2Wrap = document.createElement("div"); f2Wrap.id = dayId+"_f2_wrap"; f2Wrap.className = "fl";
  var f2Lbl = document.createElement("label"); f2Lbl.id = dayId+"_f2_lbl"; f2Lbl.textContent = "Go Live";
  const goLive = makeInput("text", dayId+"_golive", "e.g. 2:00 PM", data.golive||"");
  const goLiveHint = document.createElement("span"); goLiveHint.id = dayId+"_golive_tz_hint"; goLiveHint.className = "as";
  goLive.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;autosaveTrigger();} updateTimeHint(this,goLiveHint,dayId); };
  f2Wrap.appendChild(f2Lbl); f2Wrap.appendChild(goLive); f2Wrap.appendChild(goLiveHint);
  var dateTimeRow2 = makeGrid("g2", [f2EmptyCol, f2Wrap]);
  dateTimeRow2.id = dayId+"_f2_row";
  body.appendChild(dateTimeRow2);

  // Row 3: End Date | f3 (Wrap / End Time)
  var endDateField = document.createElement("div"); endDateField.className = "fl";
  var endDateLbl = document.createElement("label"); endDateLbl.id = dayId+"_end_date_lbl"; endDateLbl.textContent = "End Date";
  endDateField.appendChild(endDateLbl); endDateField.appendChild(endDateIso);

  var f3Wrap = document.createElement("div"); f3Wrap.id = dayId+"_f3_wrap"; f3Wrap.className = "fl";
  var f3Lbl = document.createElement("label"); f3Lbl.id = dayId+"_f3_lbl"; f3Lbl.textContent = "Wrap";
  const wrap = makeInput("text", dayId+"_wrap", "e.g. 6:00 PM", data.wrap||"");
  const wrapHint = document.createElement("span"); wrapHint.id = dayId+"_wrap_tz_hint"; wrapHint.className = "as";
  wrap.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;autosaveTrigger();} updateTimeHint(this,wrapHint,dayId); };
  f3Wrap.appendChild(f3Lbl); f3Wrap.appendChild(wrap); f3Wrap.appendChild(wrapHint);

  body.appendChild(makeGrid("g2", [endDateField, f3Wrap]));

  const bfast = makeInput("text",dayId+"_breakfast","8:00 AM",data.breakfast||"");
  const bfastHint = document.createElement("span"); bfastHint.id = dayId+"_breakfast_tz_hint"; bfastHint.className = "as";
  bfast.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;autosaveTrigger();} updateTimeHint(this,bfastHint,dayId); };
  const lunch = makeInput("text",dayId+"_lunch","12:00 PM",data.lunch||"");
  const lunchHint = document.createElement("span"); lunchHint.id = dayId+"_lunch_tz_hint"; lunchHint.className = "as";
  lunch.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;autosaveTrigger();} updateTimeHint(this,lunchHint,dayId); };
  if (!isPost) {
    var ddToggle = document.createElement("div");
    ddToggle.className = "day-details-toggle";
    var ddLabel = document.createElement("span"); ddLabel.textContent = "Day Details";
    var ddChevron = document.createElement("span"); ddChevron.className = "day-details-chevron"; ddChevron.innerHTML = icon('chevron-right');
    ddToggle.appendChild(ddLabel); ddToggle.appendChild(ddChevron);

    var ddBody = document.createElement("div");
    ddBody.className = "day-details-body";
    ddBody.style.display = "none";

    var breakfastWrap = makeField("Breakfast", bfast); breakfastWrap.id = dayId+"_breakfast_wrap"; breakfastWrap.appendChild(bfastHint);
    var lunchWrap = makeField("Lunch", lunch); lunchWrap.id = dayId+"_lunch_wrap"; lunchWrap.appendChild(lunchHint);
    const mealGrid = makeGrid("g2",[breakfastWrap, lunchWrap]);
    mealGrid.style.marginBottom = "4px";
    ddBody.appendChild(mealGrid);

    const sunrise = makeInput("text",dayId+"_sunrise","Auto-filled from location",data.sunrise||"");
    const sunset  = makeInput("text",dayId+"_sunset","Auto-filled from location",data.sunset||"");
    const slbl1 = document.createElement("label"); slbl1.innerHTML = 'Sunrise <span class="at">auto</span>';
    const slbl2 = document.createElement("label"); slbl2.innerHTML = 'Sunset <span class="at">auto</span>';
    const sf1 = document.createElement("div"); sf1.className = "fl"; sf1.appendChild(slbl1); sf1.appendChild(sunrise);
    const sf2 = document.createElement("div"); sf2.className = "fl"; sf2.appendChild(slbl2); sf2.appendChild(sunset);
    ddBody.appendChild(makeGrid("g2",[sf1,sf2]));

    const sunStatus = document.createElement("div");
    sunStatus.className = "as"; sunStatus.id = dayId+"_sun_status";
    ddBody.appendChild(sunStatus);

    ddToggle.onclick = function() {
      var isOpen = ddBody.style.display !== "none";
      ddBody.style.display = isOpen ? "none" : "block";
      ddChevron.style.transform = isOpen ? "" : "rotate(90deg)";
    };

  }

  // ── Location selector ──────────────────────────────────────────────────────
  const locRow = document.createElement("div"); locRow.className = "sday-loc-row";
  const locLbl = document.createElement("label"); locLbl.textContent = "Location";

  // Sort locations alphabetically
  var _contactLocs = (loadContacts().locations || []).filter(function(l) { return !!l.name; });
  _contactLocs.sort(function(a, b) { return a.name.localeCompare(b.name); });
  var _locByName = {};
  _contactLocs.forEach(function(l) { _locByName[l.name] = l; });

  // Helper: update address display + hospital visibility when a location is selected/cleared
  function _applyLocSelection(loc) {
    var infoDiv = document.getElementById(dayId+"_loc_info");
    var hospWrapEl = document.getElementById(dayId+"_hospital_wrap");
    var hospEl = document.getElementById(dayId+"_hospital");
    if (!loc) {
      if (infoDiv) { infoDiv.textContent = ""; infoDiv.style.display = "none"; }
      if (hospWrapEl) hospWrapEl.style.display = "none";
      checkShowBlacks(dayId);
      return;
    }
    var addrParts = [loc.address, loc.city, [loc.state, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (infoDiv) {
      if (addrParts) { infoDiv.textContent = addrParts; infoDiv.style.display = "block"; }
      else { infoDiv.textContent = ""; infoDiv.style.display = "none"; }
    }
    if (hospWrapEl) hospWrapEl.style.display = addrParts ? "" : "none";
    if (hospEl) {
      var parsedHosp = parseHospitalText(loc.hospital||"");
      hospEl.textContent = parsedHosp;
      hospEl.style.display = parsedHosp ? "block" : "none";
    }
    var locAddr = [loc.address, loc.city, loc.state].filter(Boolean).join(", ");
    if (locAddr) lookupHospForDay(dayId, locAddr);
    var notesEl = document.getElementById(dayId+"_loc_notes");
    if (notesEl && !notesEl.value && loc.notes) notesEl.value = loc.notes;
    checkShowBlacks(dayId);
    syncSchedDayDate(dayId);
    tl();
  }

  // Searchable autocomplete input
  const locWrap = document.createElement("div"); locWrap.className = "ac-wrap"; locWrap.style.flex = "1";
  const locInp = document.createElement("input"); locInp.type = "text";
  locInp.id = dayId+"_loc_id";
  locInp.className = "sday-loc-select";
  locInp.placeholder = "Select location...";
  locInp.autocomplete = "off";
  if (data.loc_id || data.loc_name) locInp.value = data.loc_id || data.loc_name;

  const locList = document.createElement("div"); locList.className = "ac-list";
  locList.style.zIndex = "600";

  function _buildLocList(query) {
    locList.innerHTML = "";
    var filtered = _contactLocs.filter(function(l) {
      return !query || l.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
    });
    if (!filtered.length) { locList.classList.remove("open"); return; }
    filtered.forEach(function(loc) {
      var item = document.createElement("div"); item.className = "ac-item";
      item.textContent = loc.name;
      item.addEventListener("mousedown", function(e) {
        e.preventDefault();
        locInp.value = loc.name;
        locList.classList.remove("open");
        _applyLocSelection(loc);
      });
      locList.appendChild(item);
    });
    locList.classList.add("open");
  }

  locInp.addEventListener("focus", function() { _buildLocList(""); });
  locInp.addEventListener("input", function() { _buildLocList(locInp.value); });
  locInp.addEventListener("blur", function() {
    setTimeout(function() { locList.classList.remove("open"); }, 150);
    if (locInp.value && !_locByName[locInp.value]) {
      locInp.value = "";
      _applyLocSelection(null);
    }
  });

  locWrap.appendChild(locInp);
  locWrap.appendChild(locList);

  const addLocBtn = document.createElement("button");
  addLocBtn.type = "button";
  addLocBtn.title = "Manage locations";
  addLocBtn.textContent = "+";
  addLocBtn.style.cssText = "padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);font-size:16px;font-family:inherit;cursor:pointer;color:var(--film-can);line-height:1;flex-shrink:0";
  addLocBtn.onclick = function() { contactsTab = "locations"; openContacts(); };

  const locSelRow = document.createElement("div"); locSelRow.className = "sday-loc-sel-row";
  locSelRow.appendChild(addLocBtn); locSelRow.appendChild(locWrap);
  locRow.appendChild(locLbl); locRow.appendChild(locSelRow);
  body.appendChild(locRow);

  // Location address display
  const locInfoDiv = document.createElement("div"); locInfoDiv.id = dayId+"_loc_info";
  locInfoDiv.style.cssText = "font-size:12px;color:var(--film-can);margin-top:-10px;margin-bottom:4px;text-align:right;display:none";
  body.appendChild(locInfoDiv);

  // Show address if a location is already selected on load
  (function() {
    var initLoc = _locByName[locInp.value];
    if (initLoc) {
      var addrParts = [initLoc.address, initLoc.city, [initLoc.state, initLoc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      if (addrParts) { locInfoDiv.textContent = addrParts; locInfoDiv.style.display = "block"; }
    }
  })();

  // Hospital field — hidden when selected location has no address
  var _initLocHasAddr = (function() {
    var l = _locByName[locInp.value];
    return l ? !![l.address, l.city, l.state].filter(Boolean).length : true;
  })();
  const hospWrap = document.createElement("div"); hospWrap.className = "fl"; hospWrap.id = dayId+"_hospital_wrap";
  hospWrap.style.display = _initLocHasAddr ? "" : "none";
  const hospLbl = document.createElement("label"); hospLbl.innerHTML = 'Nearest hospital <span class="at">auto</span>';
  var hospText = parseHospitalText(data.hospital||"");
  var hospDiv = document.createElement("div");
  hospDiv.id = dayId+"_hospital";
  hospDiv.style.cssText = "font-size:12px;color:var(--film-can);margin-top:4px;line-height:1.4;word-wrap:break-word;overflow-wrap:break-word;text-align:left;white-space:pre-line;display:"+(hospText?"block":"none");
  hospDiv.textContent = hospText;
  hospWrap.appendChild(hospLbl); hospWrap.appendChild(hospDiv);
  body.appendChild(hospWrap);

  // Location notes field
  const locNotesWrap = document.createElement("div"); locNotesWrap.className = "fl";
  const locNotesLbl = document.createElement("label"); locNotesLbl.textContent = "Location notes";
  const locNotesInp = document.createElement("textarea");
  locNotesInp.id = dayId+"_loc_notes"; locNotesInp.rows = 2;
  locNotesInp.placeholder = "Auto-filled from location contacts";
  locNotesInp.value = data.loc_notes||"";
  locNotesInp.style.cssText = "width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical";
  locNotesWrap.appendChild(locNotesLbl); locNotesWrap.appendChild(locNotesInp);
  body.appendChild(locNotesWrap);

  // ── Day Details (after Location Notes) ────────────────────────────────────────
  if (!isPost) {
    body.appendChild(ddToggle);
    body.appendChild(ddBody);
  }

  const schedHdr = document.createElement("div");
  schedHdr.className = "sh"; schedHdr.style.marginTop = "1rem"; schedHdr.textContent = "Schedule";
  body.appendChild(schedHdr);

  // Check show blacks on load
  setTimeout(function() { checkShowBlacks(dayId); triggerSunLookup(dayId); }, 100);
  const schedList = document.createElement("div"); schedList.id = dayId+"_sched_list";
  body.appendChild(schedList);

  const btnRow = document.createElement("div"); btnRow.style.cssText = "display:flex;gap:8px;margin-top:4px";
  const addBtn = document.createElement("button"); addBtn.className = "ab"; addBtn.style.flex = "1";
  addBtn.textContent = "+ Add entry";
  addBtn.onclick = function() { addScheduleEntry2(dayId); };
  const autoBtn = document.createElement("button"); autoBtn.className = "ab";
  autoBtn.style.cssText = "flex:1;border-color:#bbb;color:#555";
  autoBtn.innerHTML = "&#x21BA; Auto-populate from times";
  autoBtn.onclick = function() { autoPopulateDay(dayId); };
  btnRow.appendChild(addBtn); btnRow.appendChild(autoBtn);
  body.appendChild(btnRow);

  el.appendChild(body);
  var _sdList = document.getElementById("schedule-days-list");
  if (insertAfterDayId === undefined) {
    _sdList.appendChild(el);
  } else if (insertAfterDayId === null) {
    var _firstCard = _sdList.querySelector(".sday-block");
    if (_firstCard) { _sdList.insertBefore(el, _firstCard); } else { _sdList.appendChild(el); }
  } else {
    var _afterEl = document.getElementById(insertAfterDayId);
    if (_afterEl && _afterEl.nextSibling) { _sdList.insertBefore(el, _afterEl.nextSibling); }
    else if (_afterEl) { _sdList.appendChild(el); }
    else { _sdList.appendChild(el); }
  }

  if (data.sched_entries && data.sched_entries.length) {
    data.sched_entries.forEach(function(e) { addScheduleEntry2(dayId, e.time, e.desc); });
  }

  initMobileCollapse(dayId);
  refreshWbDaySelector();
  rebuildInsertDividers();
  if (data.category) applyCategoryConfig(dayId, data.category);
  if (data.category === "other") {
    if (data.f1_label) { var _rl1 = document.getElementById(dayId+"_f1_lbl"); if (_rl1) _rl1.value = data.f1_label; }
    if (data.f2_label) { var _rl2 = document.getElementById(dayId+"_f2_lbl"); if (_rl2) _rl2.value = data.f2_label; }
    if (data.f3_label) { var _rl3 = document.getElementById(dayId+"_f3_lbl"); if (_rl3) _rl3.value = data.f3_label; }
  }
  refreshAllTimeHints();
  return dayId;
}

function applyCategoryConfig(dayId, category) {
  var cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG['shoot_day'];
  ['f1','f2','f3'].forEach(function(f) {
    var fieldWrap = document.getElementById(dayId+'_'+f+'_wrap');
    var fieldLbl  = document.getElementById(dayId+'_'+f+'_lbl');
    if (!fieldWrap) return;
    fieldWrap.style.display = cfg[f].show ? '' : 'none';
    if (cfg[f].show && fieldLbl) {
      if (cfg[f].editable) {
        if (fieldLbl.tagName !== 'INPUT') {
          var editLbl = document.createElement('input');
          editLbl.type = 'text'; editLbl.id = fieldLbl.id;
          editLbl.value = cfg[f].label;
          editLbl.className = 'contact-card-role-input';
          editLbl.style.cssText = 'width:100%;margin-bottom:4px';
          fieldLbl.parentNode.replaceChild(editLbl, fieldLbl);
        }
      } else {
        if (fieldLbl.tagName === 'INPUT') {
          var staticLbl = document.createElement('label');
          staticLbl.id = fieldLbl.id; staticLbl.textContent = cfg[f].label;
          fieldLbl.parentNode.replaceChild(staticLbl, fieldLbl);
        } else {
          fieldLbl.textContent = cfg[f].label;
        }
      }
    }
  });
  // Hide the entire f2 row (spacer + f2 field) when f2 is not shown
  var f2Row = document.getElementById(dayId+'_f2_row');
  if (f2Row) f2Row.style.display = cfg.f2.show ? '' : 'none';
  // Update date field labels for travel_day layout
  var startLbl = document.getElementById(dayId+'_start_date_lbl');
  var endLbl   = document.getElementById(dayId+'_end_date_lbl');
  if (startLbl) startLbl.textContent = (category === 'travel_day') ? 'Departure Date' : 'Start Date';
  if (endLbl)   endLbl.textContent   = (category === 'travel_day') ? 'Arrival Date'   : 'End Date';
  var breakfastWrap = document.getElementById(dayId+'_breakfast_wrap');
  var lunchWrap     = document.getElementById(dayId+'_lunch_wrap');
  if (breakfastWrap) breakfastWrap.style.display = cfg.hasMeals ? '' : 'none';
  if (lunchWrap)     lunchWrap.style.display     = cfg.hasMeals ? '' : 'none';
}

function removeScheduleDay(dayId) {
  const i = scheduleDays.indexOf(dayId); if (i > -1) scheduleDays.splice(i, 1);
  document.getElementById(dayId).remove();
  renumberDays();
  refreshWbDaySelector();
  wbRecalc();
  wbRebuildPins();
  rebuildInsertDividers();
}

function renumberDays() {}

function updateDayHeader(dayId) {
  wbRebuildPins();
}


function sortScheduleDays() {
  const list = document.getElementById("schedule-days-list");
  if (!list) return;
  if (scheduleDays.length < 2) { sortVideoDueBlock(); rebuildInsertDividers(); return; }

  // Build sort keys: ISO date + call time converted to minutes
  function sortKey(dayId) {
    const iso = (document.getElementById(dayId+"_date_iso")||{}).value || "9999-99-99";
    const callTime = (document.getElementById(dayId+"_call_time")||{}).value || "";
    // Parse call time to minutes since midnight
    let mins = 9999;
    const m = callTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1]), mn = parseInt(m[2]);
      const ap = (m[3]||"").toLowerCase();
      if (ap === "pm" && h !== 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      mins = h * 60 + mn;
    }
    return iso + "_" + String(mins).padStart(4,"0");
  }

  const sorted = scheduleDays.slice().sort(function(a, b) {
    return sortKey(a).localeCompare(sortKey(b));
  });

  if (JSON.stringify(sorted) === JSON.stringify(scheduleDays)) { sortVideoDueBlock(); rebuildInsertDividers(); return; }

  // FLIP animation
  const positions = {};
  scheduleDays.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) positions[id] = el.getBoundingClientRect().top;
  });

  // Reorder DOM and array
  scheduleDays.length = 0;
  sorted.forEach(function(id) {
    scheduleDays.push(id);
    list.appendChild(document.getElementById(id));
  });

  // Animate
  scheduleDays.forEach(function(id) {
    const el = document.getElementById(id);
    if (!el || positions[id] == null) return;
    const delta = positions[id] - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.style.transition = "none";
    el.style.transform = "translateY("+delta+"px)";
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = "transform 0.35s cubic-bezier(0.4,0,0.2,1)";
        el.style.transform = "";
      });
    });
  });

  // Renumber after sort
  renumberDays();
  refreshWbDaySelector();
  wbRebuildPins();
  sortVideoDueBlock();
  rebuildInsertDividers();
}

function sortVideoDueBlock() {
  var listEl = document.getElementById("schedule-days-list");
  var block = document.getElementById("video-due-block");
  if (!listEl || !block || block.parentElement !== listEl) return;
  var videoDueIso = (document.getElementById("video_due_date_iso")||{}).value || "";
  // Find first schedule day with a date >= video due date
  var insertBefore = null;
  for (var _i = 0; _i < scheduleDays.length; _i++) {
    var _dayIso = (document.getElementById(scheduleDays[_i] + "_date_iso")||{}).value || "9999-99-99";
    if (_dayIso >= videoDueIso) { insertBefore = document.getElementById(scheduleDays[_i]); break; }
  }
  // Skip DOM move if already in correct position (avoids resetting Chrome date input state)
  var nextBlock = block.nextElementSibling;
  while (nextBlock && !nextBlock.classList.contains("sday-block")) nextBlock = nextBlock.nextElementSibling;
  if (nextBlock === insertBefore) return;
  if (insertBefore) { listEl.insertBefore(block, insertBefore); } else { listEl.appendChild(block); }
}

function makeInsertDivider(insertAfterDayId) {
  var div = document.createElement("div");
  div.className = "sday-insert";
  div.innerHTML = '<div class="sday-insert-line"></div><div class="sday-insert-btn">+</div><div class="sday-insert-line"></div>';
  div.onclick = function() { insertScheduleDay(insertAfterDayId); };
  return div;
}

function insertScheduleDay(afterDayId) {
  var defaultDate = '';
  if (afterDayId === 'video-due-block') {
    // Special case: use video due date + 1 as the suggested date
    var vdDateEl = document.getElementById('video_due_date_iso');
    if (vdDateEl && vdDateEl.value) {
      var vdDate = new Date(vdDateEl.value + 'T12:00:00');
      vdDate.setDate(vdDate.getDate() + 1);
      defaultDate = vdDate.toISOString().split('T')[0];
    }
  } else if (afterDayId) {
    var prevDateEl = document.getElementById(afterDayId + '_date_iso');
    if (prevDateEl && prevDateEl.value) {
      var prevDate = new Date(prevDateEl.value + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() + 1);
      defaultDate = prevDate.toISOString().split('T')[0];
    }
  }
  if (!defaultDate) {
    var today = new Date();
    defaultDate = today.toISOString().split('T')[0];
  }
  var newDayId = addScheduleDay({ date_iso: defaultDate }, afterDayId);
  if (newDayId) {
    var newCard = document.getElementById(newDayId);
    if (newCard) {
      newCard.style.transform = 'scaleY(0)';
      newCard.style.transformOrigin = 'top';
      newCard.style.transition = 'transform 0.2s ease';
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          newCard.style.transform = 'scaleY(1)';
          setTimeout(function() {
            newCard.style.transition = '';
            newCard.style.transform = '';
          }, 200);
        });
      });
    }
  }
  autosaveTrigger();
}

function rebuildInsertDividers() {
  var container = document.getElementById('schedule-days-list');
  if (!container) return;
  var existing = container.querySelectorAll('.sday-insert');
  existing.forEach(function(d) { d.parentNode.removeChild(d); });
  // Walk all .sday-block cards in DOM order (includes video-due-block when present)
  var allCards = Array.from(container.querySelectorAll('.sday-block'));
  // For post production, the static schedule-kickoff-divider handles "insert before first card"
  var isPost = (document.getElementById("project_type")||{}).value === "post_production";
  if (!isPost) {
    container.insertBefore(makeInsertDivider(null), container.firstChild || null);
  }
  allCards.forEach(function(card) {
    var insertAfterId = card.id;
    var divider = makeInsertDivider(insertAfterId);
    if (card.nextSibling) {
      container.insertBefore(divider, card.nextSibling);
    } else {
      container.appendChild(divider);
    }
  });
}

function syncSchedDayDate(dayId) {
  var _dateEl = document.getElementById(dayId+"_date_iso");
  const iso = (_dateEl||{}).value||"";
  if (!iso) return;
  var _oldIso = _dateEl ? (_dateEl.dataset.prevIso || "") : "";
  if (_oldIso && _oldIso !== iso) {
    var _oldPinId = "pin_" + _oldIso;
    var _newPinId = "pin_" + iso;
    wbItems.forEach(function(wid) {
      var _anchorSel = document.getElementById(wid + "_seq_anchor");
      if (_anchorSel && _anchorSel.value === _oldPinId) {
        _anchorSel.dataset.pendingValue = _newPinId;
      }
    });
    // If end date was in sync with old start date, keep it in sync with new start date
    var _endEl = document.getElementById(dayId+"_end_date_iso");
    if (_endEl && (!_endEl.value || _endEl.value === _oldIso)) {
      _endEl.value = iso;
      syncSchedDayEndDate(dayId);
    }
  } else if (!_oldIso) {
    // New card — auto-set end date to match start date
    var _endEl = document.getElementById(dayId+"_end_date_iso");
    if (_endEl && !_endEl.value) { _endEl.value = iso; syncSchedDayEndDate(dayId); }
  }
  if (_dateEl) _dateEl.dataset.prevIso = iso;
  const d = new Date(iso+"T12:00:00");
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const fmtEl = document.getElementById(dayId+"_date");
  const fmtStr = days[d.getDay()]+" "+d.getDate()+" "+months[d.getMonth()]+" "+d.getFullYear();
  if (fmtEl) fmtEl.value = fmtStr;
  updateDayCalWidget(dayId, iso);
  updateSchedDayDateDisplay(dayId);
  sortScheduleDays();
  wbRecalc();
  wbRebuildPins();
  triggerSunLookup(dayId);
}

function syncSchedDayEndDate(dayId) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var _endEl = document.getElementById(dayId+"_end_date_iso");
  var endIso = (_endEl||{}).value||"";
  var _endFmtEl = document.getElementById(dayId+"_end_date");
  if (_endFmtEl) {
    if (endIso) {
      var _ed = new Date(endIso+"T12:00:00");
      _endFmtEl.value = days[_ed.getDay()]+" "+_ed.getDate()+" "+months[_ed.getMonth()]+" "+_ed.getFullYear();
    } else {
      _endFmtEl.value = "";
    }
  }
  updateSchedDayDateDisplay(dayId);
}

function updateSchedDayDateDisplay(dayId) {
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var startIso = (document.getElementById(dayId+"_date_iso")||{}).value||"";
  var endIso   = (document.getElementById(dayId+"_end_date_iso")||{}).value||"";
  var dispEl   = document.getElementById(dayId+"_date_display");
  if (!dispEl || !startIso) return;
  var sd = new Date(startIso+"T12:00:00");
  var startStr = days[sd.getDay()]+" "+sd.getDate()+" "+months[sd.getMonth()]+" "+sd.getFullYear();
  if (endIso && endIso !== startIso) {
    var ed = new Date(endIso+"T12:00:00");
    var endStr = days[ed.getDay()]+" "+ed.getDate()+" "+months[ed.getMonth()]+" "+ed.getFullYear();
    dispEl.textContent = startStr + " — " + endStr;
  } else {
    dispEl.textContent = startStr;
  }
}

function updateDayCalWidget(dayId, dateIso) {
  var monthEl = document.getElementById(dayId+"_cal_month");
  var dayEl   = document.getElementById(dayId+"_cal_day");
  if (!monthEl || !dayEl) return;
  if (!dateIso) {
    monthEl.textContent = "---";
    dayEl.textContent = "--";
    return;
  }
  var CAL_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  var parts = dateIso.split("-");
  monthEl.textContent = CAL_MONTHS[parseInt(parts[1]) - 1] || "---";
  dayEl.textContent   = parseInt(parts[2]) || "--";
}

function addScheduleEntry2(dayId, time, desc, afterId) {
  time = time || ""; desc = desc || "";
  if (!daySchedItems[dayId]) daySchedItems[dayId] = [];
  const entryId = "se_" + (++_uid);
  const el = document.createElement("div");
  el.className = "sch-entry"; el.id = entryId;

  const timeInp = document.createElement("input");
  timeInp.type = "text"; timeInp.id = entryId+"_time"; timeInp.placeholder = "9:00 AM";
  timeInp.value = time; timeInp.autocomplete = "new-password";
  timeInp.oninput = function() { wbRebuildPins(); };
  const timeHint = document.createElement("span"); timeHint.id = entryId+"_time_tz_hint"; timeHint.className = "as";
  timeInp.onblur = function() { var n=normalizeTimeStr(this.value); if(n&&n!==this.value){this.value=n;wbRebuildPins();autosaveTrigger();} updateTimeHint(this,timeHint,dayId); };
  const timeWrap = document.createElement("div"); timeWrap.style.cssText = "display:flex;flex-direction:column;gap:2px";
  timeWrap.appendChild(timeInp); timeWrap.appendChild(timeHint);

  const descInp = document.createElement("input");
  descInp.type = "text"; descInp.id = entryId+"_desc"; descInp.placeholder = "Camera setup begins";
  descInp.value = desc; descInp.autocomplete = "new-password";
  descInp.oninput = function() { wbRebuildPins(); };

  const insBtn = document.createElement("button");
  insBtn.className = "rb"; insBtn.title = "Insert row below"; insBtn.textContent = "+";
  insBtn.onclick = function() { insertSchedEntry2(dayId, entryId); };

  const delBtn = document.createElement("button");
  delBtn.className = "rb"; delBtn.innerHTML = "&#x2715;";
  delBtn.onclick = function() { removeSchedEntry2(dayId, entryId); };

  el.appendChild(timeWrap); el.appendChild(descInp);
  el.appendChild(insBtn); el.appendChild(delBtn);

  const list = document.getElementById(dayId+"_sched_list");
  if (afterId) {
    const idx2 = daySchedItems[dayId].indexOf(afterId);
    daySchedItems[dayId].splice(idx2+1, 0, entryId);
    document.getElementById(afterId).insertAdjacentElement("afterend", el);
  } else {
    daySchedItems[dayId].push(entryId);
    if (list) list.appendChild(el);
  }
}

function insertSchedEntry2(dayId, afterId) {
  addScheduleEntry2(dayId, "", "", afterId);
  const list = daySchedItems[dayId];
  const idx = list.indexOf(afterId);
  if (idx >= 0 && idx+1 < list.length) {
    setTimeout(function() {
      const el = document.getElementById(list[idx+1]+"_time");
      if (el) el.focus();
    }, 50);
  }
}

function removeSchedEntry2(dayId, entryId) {
  const list = daySchedItems[dayId];
  if (list) { const i = list.indexOf(entryId); if (i>-1) list.splice(i,1); }
  const el = document.getElementById(entryId); if (el) el.remove();
  wbRebuildPins();
}

function autoPopulateDay(dayId) {
  if (daySchedItems[dayId]) {
    daySchedItems[dayId].slice().forEach(function(eid) { removeSchedEntry2(dayId, eid); });
  }
  const entries = [];
  const call = v(dayId+"_call_time"), breakfast = v(dayId+"_breakfast");
  const golive = v(dayId+"_golive"), lunch = v(dayId+"_lunch"), wrap = v(dayId+"_wrap");
  if (call)      entries.push({time:call,      desc:"Crew call"});
  if (breakfast) entries.push({time:breakfast, desc:"Breakfast"});
  if (golive)    entries.push({time:golive,    desc:"Go Live"});
  if (lunch)     entries.push({time:lunch,     desc:"Lunch"});
  if (wrap)      entries.push({time:wrap,      desc:"Wrap"});
  entries.sort(function(a,b) {
    function parse(t) {
      const m = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!m) return 9999;
      let h=parseInt(m[1]), mn=parseInt(m[2]);
      const ap=(m[3]||"").toLowerCase();
      if(ap==="pm"&&h!==12) h+=12; if(ap==="am"&&h===12) h=0;
      return h*60+mn;
    }
    return parse(a.time)-parse(b.time);
  });
  entries.forEach(function(e) { addScheduleEntry2(dayId, e.time, e.desc); });
}

function getScheduleDays() {
  return scheduleDays.map(function(dayId) {
    return {
      id:           dayId,
      date_iso:     v(dayId+"_date_iso"),
      date:         v(dayId+"_date"),
      end_date_iso: v(dayId+"_end_date_iso"),
      end_date:     v(dayId+"_end_date"),
      label:        v(dayId+"_label"),
      call_time:    v(dayId+"_call_time"),
      golive:       v(dayId+"_golive"),
      wrap:         v(dayId+"_wrap"),
      breakfast:    v(dayId+"_breakfast"),
      lunch:        v(dayId+"_lunch"),
      sunrise:      v(dayId+"_sunrise"),
      sunset:       v(dayId+"_sunset"),
      loc_id:       (document.getElementById(dayId+"_loc_id")||{}).value||"",
      loc_name:     (document.getElementById(dayId+"_loc_id")||{}).value||"",
      hospital:     (document.getElementById(dayId+"_hospital")||{}).textContent||"",
      loc_notes:    v(dayId+"_loc_notes"),
      show_blacks:       (document.getElementById(dayId+"_show_blacks")||{}).checked||false,
      exclude_callsheet: (document.getElementById(dayId+"_exclude_callsheet")||{}).checked||false,
      excluded_crew: getDayExcludedCrew(dayId),
      excluded_talent: getDayExcludedTalent(dayId),
      excluded_kp: getDayExcludedKP(dayId),
      category:  (document.getElementById(dayId+"_category")||{}).value || "shoot_day",
      f1_label:  (function() { var el = document.getElementById(dayId+"_f1_lbl"); return el ? (el.value||el.textContent||'') : ''; })(),
      f2_label:  (function() { var el = document.getElementById(dayId+"_f2_lbl"); return el ? (el.value||el.textContent||'') : ''; })(),
      f3_label:  (function() { var el = document.getElementById(dayId+"_f3_lbl"); return el ? (el.value||el.textContent||'') : ''; })(),
      sched_entries: (daySchedItems[dayId]||[]).map(function(eid) {
        return {time: v(eid+"_time"), desc: v(eid+"_desc")};
      }).filter(function(e) { return e.time||e.desc; }),
    };
  });
}

function loadScheduleDays(days, legacyData) {
  var _listEl = document.getElementById("schedule-days-list");
  // Rescue video-due-block from list before clearing (it gets moved there for post production)
  var _videoDueBlock = document.getElementById("video-due-block");
  if (_videoDueBlock && _videoDueBlock.parentElement === _listEl) {
    _listEl.parentElement.insertBefore(_videoDueBlock, _listEl);
  }
  _listEl.innerHTML = "";
  scheduleDays = [];
  daySchedItems = {};

  // Migrate old day1/day2 format
  if ((!days || !days.length) && legacyData && (legacyData.day1_date_iso || legacyData.day2_date_iso || legacyData.day1_call_time)) {
    days = [];
    if (legacyData.day1_date_iso || legacyData.day1_call_time || legacyData.day1_date) {
      days.push({
        date_iso: legacyData.day1_date_iso||"", date: legacyData.day1_date||"",
        label: legacyData.day1_label||"", call_time: legacyData.day1_call_time||"",
        golive: "", wrap: legacyData.day1_wrap||"",
        breakfast: legacyData.day1_breakfast||"", lunch: legacyData.day1_lunch||"",
        sunrise: legacyData.day1_sunrise||"", sunset: legacyData.day1_sunset||"",
        sched_entries: legacyData.day1_schedule||[],
      });
    }
    if (legacyData.day2_date_iso || legacyData.day2_call_time || legacyData.day2_date) {
      days.push({
        date_iso: legacyData.day2_date_iso||"", date: legacyData.day2_date||"",
        label: legacyData.day2_label||"", call_time: legacyData.day2_call_time||"",
        golive: legacyData.day2_golive||"", wrap: legacyData.day2_wrap||"",
        breakfast: legacyData.day2_breakfast||"", lunch: legacyData.day2_lunch||"",
        sunrise: legacyData.day2_sunrise||"", sunset: legacyData.day2_sunset||"",
        sched_entries: legacyData.day2_schedule||[],
      });
    }
  }

  (days||[]).forEach(function(d) { addScheduleDay(d); });
  // Post production projects have no shoot days — only kickoff/video-due pins
  var _isPostProd = (document.getElementById("project_type")||{}).value === "post_production";
  if (scheduleDays.length === 0 && !_isPostProd) addScheduleDay();
  // Ensure insert dividers are present even when no days were added (e.g. post-production)
  if (scheduleDays.length === 0) rebuildInsertDividers();
}


// ── Workback ──────────────────────────────────────────────────────────────────
let wbItems = [];
var _editingWbId = null;
var _lastEditedWbId = null;
var _lockedCardTop = null;
var _wbLiveSortTimer = null;

// US federal holidays as MM-DD strings (fixed); floating ones added dynamically
function usHolidays(year) {
  const fixed = [
    `${year}-01-01`,`${year}-07-04`,`${year}-11-11`,`${year}-12-25`,
    `${year}-12-24`,`${year}-12-26`,
    `${year}-11-27`,`${year}-11-28`,`${year}-11-29`,
  ];
  // MLK Day: 3rd Monday in January
  // Presidents Day: 3rd Monday in February
  // Memorial Day: last Monday in May
  // Labor Day: 1st Monday in September
  // Columbus Day: 2nd Monday in October
  function nthMonday(year, month, n) {
    let d = new Date(year, month-1, 1), count=0;
    while(true){ if(d.getDay()===1) count++; if(count===n) return d.toISOString().slice(0,10); d.setDate(d.getDate()+1); }
  }
  function lastMonday(year, month) {
    let d = new Date(year, month, 0); // last day of month
    while(d.getDay()!==1) d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }
  return new Set([...fixed,
    nthMonday(year,1,3), nthMonday(year,2,3),
    lastMonday(year,5), nthMonday(year,9,1), nthMonday(year,10,2),
    // New Year's observed
    new Date(year,0,1).getDay()===0 ? `${year}-01-02` :
    new Date(year,0,1).getDay()===6 ? `${year-1}-12-31` : null,
  ].filter(Boolean));
}

function wbBusinessDaysAfter(eventIso, days) {
  if (!eventIso) return "";
  let d = new Date(eventIso + "T12:00:00");
  if (days === 0) return d.toISOString().slice(0,10);
  const holidays = usHolidays(d.getFullYear());
  const direction = days > 0 ? 1 : -1;
  let count = 0;
  const target = Math.abs(days);
  while (count < target) {
    d.setDate(d.getDate() + direction);
    const iso = d.toISOString().slice(0,10);
    const dow = d.getDay();
    if (dow === 0 || dow === 6 || holidays.has(iso)) continue;
    count++;
  }
  return d.toISOString().slice(0,10);
}

function wbBusinessDaysBefore(eventIso, days) {
  if (!eventIso) return "";
  let d = new Date(eventIso + "T12:00:00");
  if (days === 0) return d.toISOString().slice(0,10); // event date itself
  const holidays = usHolidays(d.getFullYear());
  const direction = days > 0 ? -1 : 1; // negative days = after event
  let count = 0;
  const target = Math.abs(days);
  while (count < target) {
    d.setDate(d.getDate() + direction);
    const iso = d.toISOString().slice(0,10);
    const dow = d.getDay();
    if (dow === 0 || dow === 6 || holidays.has(iso)) continue;
    count++;
  }
  return d.toISOString().slice(0,10);
}

function wbFmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return days[d.getDay()] + " " + months[d.getMonth()] + " " + d.getDate();
}

function getAnchorIso() {
  const wbDaySel = document.getElementById("wb_day_select");
  const wbDayVal = wbDaySel ? wbDaySel.value : "";
  if (wbDayVal === "kickoff") return (document.getElementById("kickoff_date_iso")||{}).value||"";
  if (wbDayVal === "video_due") return (document.getElementById("video_due_date_iso")||{}).value||"";
  const schedDays = getScheduleDays();
  if (!schedDays.length) return (document.getElementById("kickoff_date_iso")||{}).value||"";
  const matched = schedDays.find(function(d) { return (d.id||"") === wbDayVal; });
  if (matched) return matched.date_iso||"";
  return schedDays[schedDays.length-1].date_iso||"";
}

function wbCalcDue(id, anchorIso, prevDue) {
  const mode = (document.getElementById(id+"_mode")||{value:"anchor"}).value || "anchor";
  const dir  = (document.getElementById("wb_direction")||{value:"back"}).value || "back";
  if (mode === "manual") {
    return (document.getElementById(id+"_manual_date")||{}).value || "";
  }
  if (mode === "sequential") {
    const days = parseInt((document.getElementById(id+"_seq_days")||{}).value)||0;
    // Chain from: previous item due date, or kickoff date, or anchor date
    const base = prevDue || getKickoffIso() || anchorIso;
    return wbBusinessDaysAfter(base, days);
  }
  // anchor mode
  const days = parseInt((document.getElementById(id+"_days")||{}).value)||0;
  return dir === "forward" ? wbBusinessDaysAfter(anchorIso, days) : wbBusinessDaysBefore(anchorIso, days);
}

function wbDrawTimeline() {
  var container = document.getElementById("wb-timeline");
  if (!container) return;

  if (container._cleanup) { container._cleanup(); container._cleanup = null; }
  container.innerHTML = "";

  /* TIMELINE_LEGACY — original dot-based timeline — keep as fallback
  container.innerHTML = "";

  var items = wbItems.map(function(id) {
    var dueEl = document.getElementById(id+"_due");
    var iso = (dueEl && dueEl.dataset.iso) || "";
    var name = (document.getElementById(id+"_item")||{}).value || "Untitled";
    var cls = (dueEl && dueEl.className.replace("wb-due","").trim()) || "";
    return {iso: iso, label: name, isPin: false, cls: cls};
  }).filter(function(d) { return !!d.iso; });

  var pins = getSchedMilestones().filter(function(m) { return !!m.date_iso; })
    .map(function(m) { return {iso: m.date_iso, label: m.label, isPin: true, cls: ""}; });

  var all = items.concat(pins);
  if (all.length < 2) { container.style.display = "none"; return; }

  container.style.display = "block";

  var isos = all.map(function(d) { return d.iso; }).sort();
  var minIso = isos[0], maxIso = isos[isos.length-1];
  function isoParse(s) { var p = s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
  var minMs = isoParse(minIso).getTime();
  var maxMs = isoParse(maxIso).getTime();
  var pad = Math.max((maxMs - minMs) * 0.04, 86400000 * 2);
  minMs -= pad; maxMs += pad;
  var range = maxMs - minMs;
  function pct(iso) { return ((isoParse(iso).getTime() - minMs) / range) * 100; }

  var now = new Date();
  var todayIso = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  var todayPct = Math.max(0, Math.min(100, ((now.getTime() - minMs) / range) * 100));

  var track = document.createElement("div");
  track.className = "wb-tl-track";
  track.style.background = "linear-gradient(to right, var(--border-strong) 0%, var(--border-strong) "+todayPct+"%, var(--accent) "+todayPct+"%, var(--accent) 100%)";
  container.appendChild(track);

  var todayEl = document.createElement("div");
  todayEl.className = "wb-tl-today";
  todayEl.style.left = todayPct+"%";
  todayEl.style.height = "20px";
  container.appendChild(todayEl);
  var todayLbl = document.createElement("div");
  todayLbl.className = "wb-tl-today-label";
  todayLbl.style.left = todayPct+"%";
  todayLbl.textContent = "Today";
  container.appendChild(todayLbl);

  var tip = document.createElement("div");
  tip.className = "wb-tl-tip";
  document.body.appendChild(tip);
  var _tipTimer;
  function showTip(e, html) { tip.innerHTML = html; tip.classList.add("visible"); moveTip(e); }
  function moveTip(e) {
    var x = e.clientX, y = e.clientY;
    tip.style.left = (x + 12)+"px";
    tip.style.top = (y - 36)+"px";
    var rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) tip.style.left = (x - rect.width - 12)+"px";
  }
  function hideTip() { tip.classList.remove("visible"); }

  var buckets = {};
  all.forEach(function(d) {
    var p = Math.round(pct(d.iso));
    if (!buckets[p]) buckets[p] = [];
    buckets[p].push(d);
  });

  Object.keys(buckets).forEach(function(p) {
    var group = buckets[p];
    var count = group.length;
    var offsets = [];
    if (count === 1) { offsets = [0]; }
    else {
      for (var i = 0; i < count; i++) {
        var sign = (i % 2 === 0) ? 1 : -1;
        var mag = Math.ceil(i / 2) * 13;
        offsets.push(sign * mag);
      }
    }
    group.forEach(function(d, i) {
      var dot = document.createElement("div");
      var isPast = d.iso < todayIso;
      dot.className = "wb-tl-dot" + (d.isPin ? " pin" : "");
      dot.style.left = pct(d.iso)+"%";
      var yOffset = offsets[i];
      dot.style.top = "calc(50% + "+yOffset+"px)";
      if (d.isPin) {
        dot.style.background = isPast ? "var(--text-muted)" : "var(--charcoal)";
      } else if (d.cls === "overdue") {
        dot.style.background = "var(--accent)";
      } else if (d.cls === "soon") {
        dot.style.background = "var(--accent-yellow)";
      } else if (d.cls === "ok") {
        dot.style.background = "#4CAF77";
      } else {
        dot.style.background = isPast ? "var(--text-muted)" : "var(--film-can)";
      }
      var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      var pp = d.iso.split("-");
      var dateStr = months[+pp[1]-1]+" "+parseInt(pp[2])+", "+pp[0];
      var tipHtml = "<strong>"+d.label+"</strong><br><span style='color:var(--text-muted);font-size:11px'>"+(d.isPin?"Milestone":"Task")+" &middot; "+dateStr+"</span>";
      dot.addEventListener("mouseenter", function(e) { showTip(e, tipHtml); });
      dot.addEventListener("mousemove", moveTip);
      dot.addEventListener("mouseleave", hideTip);
      container.appendChild(dot);
    });
  });

  container._cleanup = function() { if (tip.parentNode) tip.parentNode.removeChild(tip); hideTip(); };
  */

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isoMs(s) {
    if (!s) return null;
    var p = s.split("-");
    return new Date(+p[0], +p[1]-1, +p[2]).getTime();
  }

  function ownerColor(name) {
    var palette = ["#2a78d6","#1baf7a","#eb6834","#6250d6","#d6502a","#2ab5d6","#9d50d6","#d6a82a"];
    if (!name || !name.trim()) return "#888";
    var h = 0;
    for (var i = 0; i < name.length; i++) h = ((h * 31 + name.charCodeAt(i)) | 0);
    return palette[Math.abs(h) % palette.length];
  }

  // ── Collect data ─────────────────────────────────────────────────────────

  var kickoffIso = (document.getElementById("kickoff_date_iso")||{}).value || "";
  var videoDueIso = (document.getElementById("video_due_date_iso")||{}).value || "";

  var dueMap = {};
  wbItems.forEach(function(id) {
    var dueEl = document.getElementById(id+"_due");
    dueMap[id] = (dueEl && dueEl.dataset.iso) || "";
  });

  var all = [];

  wbItems.forEach(function(id) {
    var dueEl = document.getElementById(id+"_due");
    var dueIso = (dueEl && dueEl.dataset.iso) || "";
    if (!dueIso) return;
    var label = (document.getElementById(id+"_item")||{}).value || "Untitled";
    var owner = (document.getElementById(id+"_owner")||{}).value || "";
    var mode = (document.getElementById(id+"_mode")||{value:"anchor"}).value || "anchor";
    var startIso;
    if (mode === "sequential") {
      var anchorSel = document.getElementById(id+"_seq_anchor");
      var seqId = anchorSel ? anchorSel.value : "";
      var base;
      if (seqId === "kickoff") base = kickoffIso;
      else if (seqId === "video_due") base = videoDueIso;
      else if (seqId && seqId.indexOf("pin_") === 0) base = seqId.slice(4);
      else if (seqId && dueMap[seqId]) base = dueMap[seqId];
      else base = kickoffIso;
      startIso = base || dueIso;
    } else {
      startIso = dueIso;
    }
    all.push({type:"task", label:label, owner:owner, startIso:startIso, endIso:dueIso});
  });

  getSchedMilestones().forEach(function(m) {
    if (!m.date_iso) return;
    all.push({type:"pin", label:m.label, owner:"", startIso:m.date_iso, endIso:m.date_iso});
  });

  if (all.length < 1) { container.style.display = "none"; return; }
  container.style.display = "block";

  // ── Timeline bounds ──────────────────────────────────────────────────────

  var now = new Date();
  var todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var todayIso = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");

  var allMs = [];
  all.forEach(function(d) {
    var s = isoMs(d.startIso), e = isoMs(d.endIso);
    if (s !== null) allMs.push(s);
    if (e !== null) allMs.push(e);
  });

  var minMs = Math.min(todayMs - 3*86400000, Math.min.apply(null, allMs));
  var maxMs = Math.max.apply(null, allMs) + 3*86400000;
  var range = maxMs - minMs;

  function pctOf(ms) { return (ms - minMs) / range * 100; }
  function isoPct(iso) { return pctOf(isoMs(iso)); }
  var todayPct = pctOf(todayMs);

  // ── Row assignment ───────────────────────────────────────────────────────

  var sorted = all.slice().sort(function(a,b) { return (isoMs(a.startIso)||0) - (isoMs(b.startIso)||0); });

  var rowEnds = [];
  sorted.forEach(function(d) {
    var sMs = isoMs(d.startIso) || 0;
    var eMs = isoMs(d.endIso) || sMs;
    var r = -1;
    for (var ri = 0; ri < rowEnds.length; ri++) {
      if (sMs > rowEnds[ri]) { r = ri; rowEnds[ri] = eMs; break; }
    }
    if (r === -1) { r = rowEnds.length; rowEnds.push(eMs); }
    d.row = r;
  });

  var numRows = Math.max(rowEnds.length, 1);

  // ── Layout geometry ──────────────────────────────────────────────────────

  var ROW_H = 18, TOP_PAD = 12, BOT_PAD = 20;
  function rowY(r) { return TOP_PAD + r * ROW_H; }
  var tickH = rowY(numRows - 1) + 14;
  container.style.height = (tickH + BOT_PAD) + "px";

  // ── Row track lines ──────────────────────────────────────────────────────

  for (var r = 0; r < numRows; r++) {
    var ry = rowY(r);
    var op = 0.3;
    var pastLine = document.createElement("div");
    pastLine.style.cssText = "position:absolute;top:"+ry+"px;left:0;width:"+todayPct+"%;height:2px;background:#444;transform:translateY(-50%);pointer-events:none;opacity:"+op+";z-index:1";
    var futLine = document.createElement("div");
    futLine.style.cssText = "position:absolute;top:"+ry+"px;left:"+todayPct+"%;right:0;height:2px;background:#FF4D00;transform:translateY(-50%);pointer-events:none;opacity:"+op+";z-index:1";
    container.appendChild(pastLine);
    container.appendChild(futLine);
  }

  // ── Past overlay ─────────────────────────────────────────────────────────

  var overlay = document.createElement("div");
  overlay.className = "wb-tl-overlay";
  overlay.style.width = todayPct + "%";
  container.appendChild(overlay);

  // ── TODAY marker ─────────────────────────────────────────────────────────

  var todayTick = document.createElement("div");
  todayTick.className = "wb-tl-today-tick";
  todayTick.style.cssText = "left:"+todayPct+"%;top:0;height:"+tickH+"px";
  container.appendChild(todayTick);

  var todayLbl = document.createElement("div");
  todayLbl.className = "wb-tl-today-lbl";
  todayLbl.textContent = "TODAY";
  todayLbl.style.cssText = "left:"+todayPct+"%;top:"+(tickH+4)+"px";
  container.appendChild(todayLbl);

  // ── Tooltip ──────────────────────────────────────────────────────────────

  var tip = document.createElement("div");
  tip.className = "wb-tl-tip";
  document.body.appendChild(tip);
  function showTip(e, html) { tip.innerHTML = html; tip.classList.add("visible"); moveTip(e); }
  function moveTip(e) {
    tip.style.left = (e.clientX+12)+"px";
    tip.style.top = (e.clientY-36)+"px";
    var rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth-8) tip.style.left = (e.clientX-rect.width-12)+"px";
  }
  function hideTip() { tip.classList.remove("visible"); }

  // ── Render items ─────────────────────────────────────────────────────────

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtD(iso) { var p=iso.split("-"); return MONTHS[+p[1]-1]+" "+parseInt(p[2])+", "+p[0]; }

  sorted.forEach(function(d) {
    var y = rowY(d.row);
    var isPast = d.endIso < todayIso;

    if (d.type === "pin") {
      var pinEl = document.createElement("div");
      pinEl.className = "wb-tl-pin";
      pinEl.style.left = isoPct(d.startIso)+"%";
      pinEl.style.top = y+"px";
      pinEl.style.zIndex = "10";
      if (isPast) {
        pinEl.style.background = "rgba(255,255,255,.22)";
        pinEl.style.border = "2px solid rgba(255,255,255,.22)";
      } else {
        pinEl.style.background = "#fff";
        pinEl.style.border = "2px solid #fff";
      }
      var pinTipHtml = "<strong>"+d.label+"</strong><br><span style='color:var(--text-muted);font-size:11px'>Milestone &middot; "+fmtD(d.startIso)+"</span>";
      pinEl.addEventListener("mouseenter", function(e) {
        pinEl.style.boxShadow = isPast
          ? "0 0 0 4px rgba(255,255,255,.08), 0 0 10px 3px rgba(255,255,255,.05)"
          : "0 0 0 4px rgba(255,255,255,.15), 0 0 10px 3px rgba(255,255,255,.1)";
        showTip(e, pinTipHtml);
      });
      pinEl.addEventListener("mousemove", moveTip);
      pinEl.addEventListener("mouseleave", function() { pinEl.style.boxShadow = ""; hideTip(); });
      container.appendChild(pinEl);

    } else {
      var color = ownerColor(d.owner);
      var leftPct = isoPct(d.startIso);
      var widthPct = Math.max(0.5, isoPct(d.endIso) - leftPct);
      var bar = document.createElement("div");
      bar.className = "wb-tl-bar";
      bar.style.left = leftPct+"%";
      bar.style.width = widthPct+"%";
      bar.style.top = y+"px";
      bar.style.transform = "translateY(-50%)";
      bar.style.background = color;
      bar.style.zIndex = isPast ? "3" : "5";
      var dateStr = d.startIso === d.endIso
        ? fmtD(d.endIso)
        : fmtD(d.startIso)+" &rarr; "+fmtD(d.endIso);
      var barTipHtml = "<strong>"+d.label+"</strong><br><span style='color:var(--text-muted);font-size:11px'>"+(d.owner?d.owner+" &middot; ":"")+dateStr+"</span>";
      bar.addEventListener("mouseenter", function(e) {
        bar.style.boxShadow = "0 0 0 3px "+color+"44, 0 0 8px 2px "+color+"33";
        showTip(e, barTipHtml);
      });
      bar.addEventListener("mousemove", moveTip);
      bar.addEventListener("mouseleave", function() { bar.style.boxShadow = ""; hideTip(); });
      container.appendChild(bar);
    }
  });

  container._cleanup = function() { if (tip.parentNode) tip.parentNode.removeChild(tip); hideTip(); };
}

function wbRecalc() {
  const anchorIso = getAnchorIso();
  const kickoffIso = getKickoffIso();
  function _localIso(d) { return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  const today = _localIso(new Date());
  const soon  = _localIso(new Date(Date.now()+5*864e5));
  var dueMap = {};
  var prevDue = kickoffIso;
  var schedMilestones = getSchedMilestones();
  wbItems.forEach(function(id) {
    const dueEl = document.getElementById(id+"_due");
    if (!dueEl) return;
    const mode = (document.getElementById(id+"_mode")||{value:"anchor"}).value;
    var due;
    if (mode === "sequential") {
      const anchorSel = document.getElementById(id+"_seq_anchor");
      const seqAnchorId = anchorSel ? anchorSel.value : "";
      const days = parseInt((document.getElementById(id+"_seq_days")||{}).value)||0;
      var base;
      if (seqAnchorId === "kickoff") { base = kickoffIso || anchorIso; }
      else if (seqAnchorId === "video_due") {
        base = (document.getElementById("video_due_date_iso")||{}).value || kickoffIso || anchorIso;
      }
      else if (seqAnchorId && seqAnchorId.indexOf("pin_") === 0) {
        base = seqAnchorId.slice(4) || kickoffIso || anchorIso;
      }
      else if (seqAnchorId && dueMap.hasOwnProperty(seqAnchorId)) { base = dueMap[seqAnchorId] || kickoffIso || anchorIso; }
      else { base = prevDue || kickoffIso || anchorIso; }
      due = wbBusinessDaysAfter(base, days);
    } else {
      due = wbCalcDue(id, anchorIso, prevDue);
    }
    dueMap[id] = due;
    if (due) prevDue = due;
    dueEl.dataset.iso = due || "";
    dueEl.textContent = wbFmtDate(due) || "\u2014";
    dueEl.className = "wb-due";
    if (due && anchorIso) {
      if (due < today) dueEl.classList.add("overdue");
      else if (due <= soon) dueEl.classList.add("soon");
      else dueEl.classList.add("ok");
    }
  });
  if (typeof sidebarOpen !== "undefined" && sidebarOpen) refreshSidebar();
  var _wbScroll = window.scrollY;
  var _wbFocused = document.activeElement;
  if (_editingWbId === null) {
    wbRebuildPins();
  } else {
    wbLiveSortDebounced();
  }
  var _tl = document.getElementById("wb-timeline");
  if (_tl && _tl._cleanup) _tl._cleanup();
  wbDrawTimeline();
  window.scrollTo(0, _wbScroll);
  if (_wbFocused && document.body.contains(_wbFocused) && document.activeElement !== _wbFocused) _wbFocused.focus({preventScroll: true});
}

function wbSortAnimated() {
  const list = document.getElementById("wb-list");
  if (!list || wbItems.length < 2) return;

  const getDue = function(id) {
    const dueEl = document.getElementById(id+"_due");
    return (dueEl && dueEl.dataset.iso) || "9999-99-99";
  };
  const order = wbItems.slice().sort(function(a, b) { return getDue(a).localeCompare(getDue(b)); });
  if (JSON.stringify(order) === JSON.stringify(wbItems)) return;

  const positions = {};
  wbItems.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) positions[id] = el.getBoundingClientRect().top;
  });

  // Snapshot edited card's viewport position before DOM moves
  const editedEl = _lastEditedWbId ? document.getElementById(_lastEditedWbId) : null;
  const editedOldTop = editedEl ? editedEl.getBoundingClientRect().top : null;

  // Update wbItems order, then let wbRebuildPins place items+pins together
  wbItems.length = 0;
  order.forEach(function(id) { wbItems.push(id); });

  // Save scroll and focused element — wbRebuildPins moves DOM nodes, which
  // causes the browser to scroll to the re-inserted focused element
  const savedScroll = window.scrollY;
  const focused = document.activeElement;
  wbRebuildPins();
  window.scrollTo(0, savedScroll);
  if (focused && document.body.contains(focused)) focused.focus({preventScroll: true});

  // Adjust scroll so the edited card stays at its original viewport position;
  // the other cards will animate around it
  if (editedEl && editedOldTop !== null) {
    const editedNewTop = editedEl.getBoundingClientRect().top;
    const scrollDelta = editedNewTop - editedOldTop;
    if (Math.abs(scrollDelta) > 1) window.scrollBy(0, scrollDelta);
  }

  // FLIP animate all cards except the edited one (which appears stationary)
  wbItems.forEach(function(id) {
    if (id === _lastEditedWbId) return;
    const el = document.getElementById(id);
    if (!el || positions[id] == null) return;
    const delta = positions[id] - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.style.transition = "none";
    el.style.transform = "translateY("+delta+"px)";
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = "transform 0.7s cubic-bezier(0.4,0,0.2,1)";
        el.style.transform = "";
      });
    });
  });
}

function wbLiveSortDebounced() {
  clearTimeout(_wbLiveSortTimer);
  _wbLiveSortTimer = setTimeout(wbSortWithPin, 350);
}

function wbSortWithPin() {
  var list = document.getElementById("wb-list");
  if (!list || wbItems.length < 2) return;
  var getDue = function(id) {
    var dueEl = document.getElementById(id+"_due");
    return (dueEl && dueEl.dataset.iso) || "9999-99-99";
  };
  var order = wbItems.slice().sort(function(a, b) { return getDue(a).localeCompare(getDue(b)); });
  if (JSON.stringify(order) === JSON.stringify(wbItems)) return;

  var positions = {};
  wbItems.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) positions[id] = el.getBoundingClientRect().top;
  });

  wbItems.length = 0;
  order.forEach(function(id) { wbItems.push(id); });

  var savedScroll = window.scrollY;
  var focused = document.activeElement;
  wbRebuildPins();
  window.scrollTo(0, savedScroll);
  if (focused && document.body.contains(focused)) focused.focus({preventScroll: true});

  // Re-pin locked card to its original viewport position
  if (_editingWbId !== null && _lockedCardTop !== null) {
    var lockedEl = document.getElementById(_editingWbId);
    if (lockedEl) {
      var newTop = lockedEl.getBoundingClientRect().top;
      var scrollDelta = newTop - _lockedCardTop;
      if (Math.abs(scrollDelta) > 1) window.scrollBy(0, scrollDelta);
    }
  }

  // FLIP animate all cards except the locked one
  wbItems.forEach(function(id) {
    if (id === _editingWbId) return;
    var el = document.getElementById(id);
    if (!el || positions[id] == null) return;
    var delta = positions[id] - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.style.transition = "none";
    el.style.transform = "translateY("+delta+"px)";
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = "transform 0.7s cubic-bezier(0.4,0,0.2,1)";
        el.style.transform = "";
      });
    });
  });
}

function wbUpdateDateCtrl(id) {
  const mode = (document.getElementById(id+"_mode")||{value:"anchor"}).value;
  const anchorCtrl  = document.getElementById(id+"_anchor_ctrl");
  const seqCtrl     = document.getElementById(id+"_seq_ctrl");
  const manualCtrl  = document.getElementById(id+"_manual_ctrl");
  if (anchorCtrl) anchorCtrl.style.display  = mode === "anchor"     ? "" : "none";
  if (seqCtrl)    seqCtrl.style.display     = mode === "sequential" ? "" : "none";
  if (manualCtrl) manualCtrl.style.display  = mode === "manual"     ? "" : "none";
  refreshSeqAnchorDropdowns();
  wbRecalc();
}

function generateWbUuid() {
  return 'wbu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

var _wbLoadingItems = false;

function refreshSeqAnchorDropdowns() {
  var allItems = wbItems.map(function(wid) {
    var nameEl = document.getElementById(wid+"_item");
    return {id: wid, label: (nameEl ? nameEl.value.trim() : "") || "(untitled)"};
  });

  // Get schedule day pins using the same scheme as wbRebuildPins()
  var pins = [];
  var days = getScheduleDays();
  days.forEach(function(day) {
    if (day.date_iso) {
      pins.push({
        id: "pin_"+day.date_iso,
        label: "📅 " + (day.label || day.date_iso),
      });
    }
  });

  wbItems.forEach(function(wid, idx) {
    var modeSel = document.getElementById(wid+"_mode");
    if (!modeSel || modeSel.value !== "sequential") return;
    var anchorSel = document.getElementById(wid+"_seq_anchor");
    if (!anchorSel) return;

    // Read current selection BEFORE rebuilding
    var pendingVal = anchorSel.dataset.pendingValue;
    var currentVal = (pendingVal !== undefined && pendingVal !== "")
      ? pendingVal
      : anchorSel.value;
    // Do not clear pendingValue yet — only clear after successful apply below

    // Rebuild options
    anchorSel.innerHTML = "";
    var kickoffOpt = document.createElement("option");
    kickoffOpt.value = "kickoff"; kickoffOpt.textContent = "Kickoff";
    anchorSel.appendChild(kickoffOpt);
    var _vdIso = (document.getElementById("video_due_date_iso")||{}).value||"";
    if (_vdIso) {
      var vdOpt = document.createElement("option");
      vdOpt.value = "video_due"; vdOpt.textContent = "Project Due Date";
      anchorSel.appendChild(vdOpt);
    }
    pins.forEach(function(pin) {
      var opt = document.createElement("option");
      opt.value = pin.id; opt.textContent = pin.label;
      anchorSel.appendChild(opt);
    });
    allItems.forEach(function(item) {
      if (item.id === wid) return;
      var opt = document.createElement("option");
      opt.value = item.id; opt.textContent = item.label;
      anchorSel.appendChild(opt);
    });

    // Restore previously selected value if it still exists
    var validIds = Array.from(anchorSel.options).map(function(o) { return o.value; });
    if (currentVal && validIds.indexOf(currentVal) !== -1) {
      anchorSel.value = currentVal;
      anchorSel.dataset.pendingValue = ""; // clear only after successful apply
    } else if (!pendingVal) {
      // No pending value and current selection lost — fall back to safe default
      var prevId = idx > 0 ? wbItems[idx - 1] : null;
      anchorSel.value = (prevId && prevId !== wid) ? prevId : "kickoff";
    }
    // If pendingVal was set but not yet in options, keep it for next rebuild attempt
  });
}

function wbAdd(item, afterId) {
  var isNew = !item;
  item = item || {};
  const id = "wb_"+(++_uid);
  if (afterId === null) {
    wbItems.unshift(id);
  } else if (afterId) {
    var _aidx = wbItems.indexOf(afterId);
    if (_aidx > -1) { wbItems.splice(_aidx + 1, 0, id); } else { wbItems.push(id); }
  } else {
    wbItems.push(id);
  }

  const el = document.createElement("div");
  el.className = "wb-item"; el.id = id;
  el.dataset.uuid = item.uuid || generateWbUuid();

  // ── Row 1: deliverable | due date badge | delete ──────────────────────────
  const row1 = document.createElement("div"); row1.className = "wb-row1";
  const itemInp = document.createElement("input");
  itemInp.type = "text"; itemInp.id = id+"_item"; itemInp.placeholder = "Task or deliverable";
  itemInp.value = item.item||""; itemInp.autocomplete = "new-password";
  itemInp.style.cssText = "padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:inherit;width:100%";
  itemInp.oninput = function() { refreshSeqAnchorDropdowns(); };
  const dueSpan = document.createElement("span");
  dueSpan.className = "wb-due"; dueSpan.id = id+"_due"; dueSpan.textContent = "\u2014";
  const delBtn = document.createElement("button");
  delBtn.className = "rb"; delBtn.innerHTML = "&#x2715;";
  delBtn.tabIndex = -1;
  delBtn.onclick = function() {
    var _itemName = (document.getElementById(id+"_item")||{}).value || "this item";
    showModal("Remove workback item", "Remove \""+_itemName+"\"? This cannot be undone.", function() {
      wbRemove(id); wbRecalc(); wbSortAnimated();
    });
  };
  row1.appendChild(itemInp); row1.appendChild(dueSpan); row1.appendChild(delBtn);

  // ── Row 2: owner | mode selector | date control | status ─────────────────
  const row2 = document.createElement("div"); row2.className = "wb-row2";

  const ownerInp = document.createElement("input");
  ownerInp.type = "text"; ownerInp.id = id+"_owner"; ownerInp.placeholder = "Owner";
  ownerInp.value = item.owner||""; ownerInp.autocomplete = "new-password";
  ownerInp.style.cssText = "padding:5px 7px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit;width:100%";

  const modeSel = document.createElement("select");
  modeSel.className = "wb-mode-sel"; modeSel.id = id+"_mode";
  const mode = item.mode || (function() {
    const pt = (document.getElementById("project_type")||{value:"live_event"}).value;
    return pt === "post_production" ? "sequential" : "anchor";
  })();
  [["anchor","Anchor"],["sequential","Sequential"],["manual","Manual date"]].forEach(function(pair) {
    const opt = document.createElement("option");
    opt.value = pair[0]; opt.textContent = pair[1];
    if (pair[0] === mode) opt.selected = true;
    modeSel.appendChild(opt);
  });
  modeSel.onchange = function() { wbUpdateDateCtrl(id); };

  // Anchor control
  const anchorCtrl = document.createElement("div");
  anchorCtrl.className = "wb-date-ctrl"; anchorCtrl.id = id+"_anchor_ctrl";
  anchorCtrl.style.display = mode === "anchor" ? "" : "none";
  const daysInp = document.createElement("input");
  daysInp.type = "number"; daysInp.className = "wb-days-inp"; daysInp.id = id+"_days";
  daysInp.min = "-365"; daysInp.max = "365"; daysInp.value = item.days === undefined ? 0 : item.days;
  daysInp.oninput = function() { wbRecalc(); };
  const daysLbl = document.createElement("span"); daysLbl.textContent = "days";
  anchorCtrl.appendChild(daysInp); anchorCtrl.appendChild(daysLbl);

  // Sequential control
  const seqCtrl = document.createElement("div");
  seqCtrl.className = "wb-date-ctrl"; seqCtrl.id = id+"_seq_ctrl";
  seqCtrl.style.display = mode === "sequential" ? "" : "none";
  const seqInp = document.createElement("input");
  seqInp.type = "number"; seqInp.className = "wb-seq-inp"; seqInp.id = id+"_seq_days";
  seqInp.min = "0"; seqInp.max = "365"; seqInp.value = item.seq_days === undefined ? 1 : item.seq_days;
  seqInp.oninput = function() { wbRecalc(); };
  const seqDaysSuffix = document.createElement("span"); seqDaysSuffix.textContent = "days";
  seqDaysSuffix.style.cssText = "font-size:12px;color:var(--film-can)";
  const seqAfterLbl = document.createElement("span"); seqAfterLbl.textContent = "after:";
  seqAfterLbl.style.cssText = "font-size:12px;color:var(--film-can);margin-left:4px";
  const seqAnchorSel = document.createElement("select");
  seqAnchorSel.id = id+"_seq_anchor";
  seqAnchorSel.style.cssText = "padding:3px 5px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:inherit;max-width:140px;color:var(--text-primary);background:var(--surface)";
  seqAnchorSel.dataset.pendingUuid = item.seq_anchor_uuid || "";
  seqAnchorSel.onchange = function() { wbRecalc(); };
  seqCtrl.appendChild(seqInp); seqCtrl.appendChild(seqDaysSuffix);
  seqCtrl.appendChild(seqAfterLbl); seqCtrl.appendChild(seqAnchorSel);

  // Manual control
  const manualCtrl = document.createElement("div");
  manualCtrl.className = "wb-date-ctrl"; manualCtrl.id = id+"_manual_ctrl";
  manualCtrl.style.display = mode === "manual" ? "" : "none";
  const manualInp = document.createElement("input");
  manualInp.type = "date"; manualInp.className = "wb-date-inp"; manualInp.id = id+"_manual_date";
  manualInp.value = item.manual_date||"";
  manualInp.style.width = "150px";
  manualInp.onchange = function() { wbRecalc(); };
  manualCtrl.appendChild(manualInp);

  // Date control wrapper
  const dateWrap = document.createElement("div");
  dateWrap.style.cssText = "display:flex;gap:6px;align-items:center";
  dateWrap.appendChild(anchorCtrl);
  dateWrap.appendChild(seqCtrl);
  dateWrap.appendChild(manualCtrl);

  const statusSel = document.createElement("select");
  statusSel.id = id+"_status"; statusSel.className = "wb-status";
  statusSel.style.cssText = "padding:5px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;font-family:inherit";
  ["Not Started","In Progress","Stuck","Complete","N/A"].forEach(function(s) {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    if (s === (item.status||"Not Started")) opt.selected = true;
    statusSel.appendChild(opt);
  });
  statusSel.onchange = function() {
    updateWbItemStyle(id);
    if (typeof sidebarOpen !== "undefined" && sidebarOpen) refreshSidebar();
  };

  row2.appendChild(ownerInp);
  row2.appendChild(modeSel);
  row2.appendChild(dateWrap);
  row2.appendChild(statusSel);

  el.appendChild(row1); el.appendChild(row2);
  // Internal only checkbox
  var internalWrap = document.createElement("div");
  internalWrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px;padding:2px 0";
  var internalCb = document.createElement("input");
  internalCb.type = "checkbox"; internalCb.id = id+"_internal";
  internalCb.checked = item.internal||false;
  internalCb.style.cssText = "accent-color:var(--charcoal);cursor:pointer";
  var internalLbl = document.createElement("label");
  internalLbl.htmlFor = id+"_internal";
  internalLbl.textContent = "Internal only — exclude from exported workback";
  internalLbl.style.cssText = "font-size:11px;color:var(--film-can);cursor:pointer;user-select:none";
  internalWrap.appendChild(internalCb); internalWrap.appendChild(internalLbl);
  el.appendChild(internalWrap);

  el.addEventListener('focusin', function() {
    if (_editingWbId === id) return;
    // Leaving another card — instant sort it, then set up this one
    if (_editingWbId !== null) {
      clearTimeout(_wbLiveSortTimer);
      var prevCard = document.getElementById(_editingWbId);
      if (prevCard) prevCard.classList.remove('editing');
      _editingWbId = null;
      _lockedCardTop = null;
      wbRebuildPins();
    }
    _editingWbId = id;
    _lastEditedWbId = id;
    el.classList.add('editing');
    // Defer scroll so browser's own focus-scroll fires first, then we override it
    setTimeout(function() {
      if (_editingWbId !== id) return;
      var targetTop = Math.max(20, Math.floor((window.innerHeight - el.offsetHeight) / 2));
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - targetTop);
      _lockedCardTop = targetTop;
    }, 0);
  });
  el.addEventListener('focusout', function() {
    setTimeout(function() {
      if (_editingWbId !== id) return;
      var wbList = document.getElementById('wb-list');
      if (wbList && wbList.contains(document.activeElement)) return;
      // Flush any pending live sort before releasing the lock
      clearTimeout(_wbLiveSortTimer);
      wbSortWithPin();
      el.classList.remove('editing');
      _editingWbId = null;
      _lockedCardTop = null;
      wbRecalc();
    }, 0);
  });

  document.getElementById("wb-list").appendChild(el);
  updateWbItemStyle(id);
  if (!_wbLoadingItems) {
    refreshSeqAnchorDropdowns();
    wbRecalc();
    if (isNew) itemInp.focus();
  } else { wbRecalc(); }
}

function wbRemove(id) {
  const i = wbItems.indexOf(id); if (i > -1) wbItems.splice(i, 1);
  const el = document.getElementById(id); if (el) el.remove();
  refreshSeqAnchorDropdowns();
}

function wbGetItems() {
  // Returns regular items only — used for saving to library
  const anchorIso = getAnchorIso();
  const kickoffIso = getKickoffIso();
  var dueMap = {};
  var prevDue = kickoffIso;
  // Build uuid map: domId -> uuid
  var uuidMap = {};
  wbItems.forEach(function(wid) {
    var el2 = document.getElementById(wid);
    if (el2) uuidMap[wid] = el2.dataset.uuid || "";
  });
  return wbItems.map(function(id) {
    const mode = (document.getElementById(id+"_mode")||{value:"anchor"}).value;
    const anchorSel = document.getElementById(id+"_seq_anchor");
    const seqAnchorDomId = anchorSel ? anchorSel.value : "";
    var due;
    if (mode === "sequential") {
      const seqDays = parseInt((document.getElementById(id+"_seq_days")||{}).value)||0;
      var base;
      if (seqAnchorDomId === "kickoff") { base = kickoffIso || anchorIso; }
      else if (seqAnchorDomId && dueMap.hasOwnProperty(seqAnchorDomId)) { base = dueMap[seqAnchorDomId] || kickoffIso || anchorIso; }
      else { base = prevDue || kickoffIso || anchorIso; }
      due = wbBusinessDaysAfter(base, seqDays);
    } else {
      due = wbCalcDue(id, anchorIso, prevDue);
    }
    dueMap[id] = due;
    if (due) prevDue = due;
    const days = parseInt((document.getElementById(id+"_days")||{}).value)||0;
    const seq_days = parseInt((document.getElementById(id+"_seq_days")||{}).value)||0;
    const manual_date = (document.getElementById(id+"_manual_date")||{}).value||"";
    const elNode = document.getElementById(id);
    var seq_anchor_uuid;
    if (seqAnchorDomId === "kickoff") { seq_anchor_uuid = "kickoff"; }
    else if (seqAnchorDomId === "video_due" || (seqAnchorDomId && seqAnchorDomId.indexOf("pin_") === 0)) { seq_anchor_uuid = seqAnchorDomId; }
    else { seq_anchor_uuid = uuidMap[seqAnchorDomId] || ""; }
    return {
      item:        v(id+"_item"),
      owner:       v(id+"_owner"),
      uuid:        elNode ? elNode.dataset.uuid : "",
      mode:        mode, days:days, seq_days:seq_days, seq_anchor_uuid:seq_anchor_uuid,
      manual_date:manual_date,
      status:      (document.getElementById(id+"_status")||{}).value||"Not Started",
      internal:    (document.getElementById(id+"_internal")||{}).checked||false,
      due:due, dueFmt:wbFmtDate(due),
    };
  }).filter(function(x) { return x.item; });
}

function wbGetItemsForDoc() {
  // Returns regular items + milestone pins sorted by date — used for Word doc only
  const anchorIso = getAnchorIso();
  let prevDue = getKickoffIso();
  const milestones = getSchedMilestones();
  const pinItems = milestones.map(function(m) {
    var pinInternal = currentSheetKey && localStorage.getItem("slater_pin_"+currentSheetKey+"_pin_"+m.id) === "1";
    return {item:m.label, owner:"", due:m.date_iso,
      dueFmt:wbFmtDate(m.date_iso)+(m.time?" · "+m.time:""),
      status:"", isPin:true, internal:pinInternal,
      schedEntries:m.schedEntries||[]};
  }).filter(function(p) { return !p.internal; });
  const regularItems = wbGetItems().filter(function(x) { return !x.internal; });
  return regularItems.concat(pinItems).sort(function(a,b) {
    return (a.due||"9999").localeCompare(b.due||"9999");
  });
}

function wbLoadItems(items) {
  document.getElementById("wb-list").innerHTML = "";
  wbItems = [];
  _wbLoadingItems = true;
  (items||[]).forEach(function(item) { wbAdd(item); });
  _wbLoadingItems = false;
  // Resolve seq_anchor_uuid -> current dom id now that all items are loaded
  var uuidToDomId = {};
  wbItems.forEach(function(wid) {
    var el2 = document.getElementById(wid);
    if (el2 && el2.dataset.uuid) uuidToDomId[el2.dataset.uuid] = wid;
  });
  wbItems.forEach(function(wid) {
    var anchorSel = document.getElementById(wid+"_seq_anchor");
    if (!anchorSel) return;
    var pendingUuid = anchorSel.dataset.pendingUuid || "";
    if (!pendingUuid) return;
    if (pendingUuid === "kickoff") anchorSel.dataset.pendingValue = "kickoff";
    else if (pendingUuid === "video_due" || (pendingUuid && pendingUuid.indexOf("pin_") === 0)) anchorSel.dataset.pendingValue = pendingUuid;
    else if (uuidToDomId[pendingUuid]) anchorSel.dataset.pendingValue = uuidToDomId[pendingUuid];
  });
  refreshSeqAnchorDropdowns();
  wbRecalc();
}

function wbInit() {
  // placeholder — items loaded via wbLoadItems or kickoff
}


// ── Contact directory ─────────────────────────────────────────────────────────
const CONTACTS_KEY = "slater_contacts";
let contactsTab = "staff";

function loadContacts() {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)||"{}"); } catch(e) { return {}; }
}
function saveContactsData(data) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(data));
  API.saveContacts(data);
}

// Merge contacts from a saved call sheet object
function mergeContactsFromSheet(data) {
  const db = loadContacts();
  if (!db.staff)     db.staff     = [];
  if (!db.crew)      db.crew      = [];
  if (!db.talent)    db.talent    = [];
  if (!db.locations) db.locations = [];

  function upsert(list, entry, keys) {
    const key = (entry[keys[0]]||"").trim().toLowerCase();
    if (!key) return;
    const existing = list.find(x => (x[keys[0]]||"").trim().toLowerCase() === key);
    if (existing) {
      // Merge ALL fields from entry into existing (not just key fields)
      Object.keys(entry).forEach(function(k) { if (entry[k]) existing[k] = entry[k]; });
    }
    else list.push(Object.assign({}, entry));
  }

  // Staff
  [["ep","EP"],["prod","PROD"],["eic","EIC"],["mngprd","MNG PRD"]].forEach(([prefix, role]) => {
    const name = data[prefix+"_name"], phone = data[prefix+"_phone"], email = data[prefix+"_email"];
    if (name) upsert(db.staff, {name, phone:phone||"", email:email||"", role}, ["name"]);
  });

  // Crew
  (data.crew||[]).forEach(c => {
    if (c.name) upsert(db.crew, {name:c.name, phone:c.phone||"", email:c.email||"", position:c.position||""}, ["name"]);
  });

  // Talent
  (data.talent||[]).forEach(t => {
    if (t.name) upsert(db.talent, {name:t.name, phone:t.phone||"", email:t.email||"", title:t.title||""}, ["name"]);
  });

  saveContactsData(db);
}

// Autocomplete: attach to a name input, filling phone+email siblings
function acAttach(nameEl, getPhoneEl, getEmailEl, bucket) {
  if (!nameEl || nameEl._acAttached) return;
  nameEl._acAttached = true;

  // Wrap in ac-wrap div
  const wrap = document.createElement("div");
  wrap.className = "ac-wrap";
  nameEl.parentNode.insertBefore(wrap, nameEl);
  wrap.appendChild(nameEl);

  const list = document.createElement("div");
  list.className = "ac-list";
  wrap.appendChild(list);

  let activeIdx = -1;

  function getMatches(q) {
    if (q.length < 2) return [];
    const db = loadContacts();
    const entries = db[bucket] || [];
    const ql = q.toLowerCase();
    return entries.filter(e => (e.name||"").toLowerCase().includes(ql)).slice(0, 8);
  }

  function render(matches) {
    list.innerHTML = "";
    activeIdx = -1;
    if (!matches.length) { list.classList.remove("open"); return; }
    matches.forEach((m, i) => {
      const item = document.createElement("div");
      item.className = "ac-item";
      item.innerHTML = `<strong>${m.name}</strong><span>${[m.position||m.role||m.title, m.phone, m.email].filter(Boolean).join(" · ")}</span>`;
      item.addEventListener("mousedown", e => {
        e.preventDefault();
        pick(m);
      });
      list.appendChild(item);
    });
    list.classList.add("open");
  }

  function pick(m) {
    // Temporarily make all OTHER inputs readonly to block browser cascade autofill
    const others = document.querySelectorAll('input[autocomplete="new-password"]');
    others.forEach(el => { if (el !== nameEl) el.setAttribute("readonly",""); });
    nameEl.value = m.name;
    const ph = getPhoneEl(); const em = getEmailEl();
    if (ph && m.phone) ph.value = m.phone;
    if (em && m.email) em.value = m.email;
    list.classList.remove("open");
    // Remove readonly after browser has had a chance to (not) autofill
    setTimeout(() => others.forEach(el => el.removeAttribute("readonly")), 200);
  }

  nameEl.addEventListener("input", () => render(getMatches(nameEl.value)));
  nameEl.addEventListener("keydown", e => {
    const items = list.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") { activeIdx = Math.min(activeIdx+1, items.length-1); items.forEach((el,i) => el.classList.toggle("active", i===activeIdx)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { activeIdx = Math.max(activeIdx-1, 0); items.forEach((el,i) => el.classList.toggle("active", i===activeIdx)); e.preventDefault(); }
    else if (e.key === "Enter" && activeIdx >= 0) { const db = loadContacts(); const matches = getMatches(nameEl.value); if (matches[activeIdx]) pick(matches[activeIdx]); }
    else if (e.key === "Escape") list.classList.remove("open");
  });
  nameEl.addEventListener("blur", () => setTimeout(() => list.classList.remove("open"), 150));
}

// Attach autocomplete to all relevant fields
function acAttachKP(id) {
  const nameEl = document.getElementById(id+"_name");
  acAttach(nameEl, () => document.getElementById(id+"_phone"), () => document.getElementById(id+"_email"), "staff");
}
function acAttachAll() {
  // Key personnel cards
  kp.forEach(id => acAttachKP(id));
  // Crew cards
  crew.forEach(id => acAttachCrew(id));
  // Talent cards
  talent.forEach(id => acAttachTalent(id));
  // Client company
  acAttachCompany();
}

function acAttachCrew(id) {
  const nameEl = document.getElementById(id+"_name");
  acAttach(nameEl, () => document.getElementById(id+"_phone"), () => document.getElementById(id+"_email"), "crew");
}
function acAttachTalent(id) {
  const nameEl = document.getElementById(id+"_name");
  acAttach(nameEl, () => document.getElementById(id+"_phone"), () => document.getElementById(id+"_email"), "talent");
}

// Contacts modal
let contactsCurrent = null;
function openContacts() {
  function renderContacts(data) {
    contactsCurrent = JSON.parse(JSON.stringify(data));
    if (!contactsCurrent.staff)     contactsCurrent.staff     = [];
    if (!contactsCurrent.crew)      contactsCurrent.crew      = [];
    if (!contactsCurrent.talent)    contactsCurrent.talent    = [];
    if (!contactsCurrent.locations) contactsCurrent.locations = [];
    if (!contactsCurrent.companies) contactsCurrent.companies = [];
    document.getElementById("contacts-modal").classList.add("open");
    showContactsTab(contactsTab);
  }
  API.getContacts().then(function(serverData) {
    if (serverData && Object.keys(serverData).length) {
      var local = loadContacts();
      var merged = Object.assign({}, local);
      Object.keys(serverData).forEach(function(k) {
        if ((serverData[k]||[]).length > 0) merged[k] = serverData[k];
      });
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(merged));
      renderContacts(merged);
    } else {
      renderContacts(loadContacts());
    }
  }).catch(function() {
    renderContacts(loadContacts());
  });
}
function closeContacts() {
  document.getElementById("contacts-modal").classList.remove("open");
}
function showContactsTab(tab) {
  contactsTab = tab;
  document.querySelectorAll(".contacts-tab").forEach(t => t.classList.toggle("active", t.textContent.toLowerCase().includes(tab === "staff" ? "production" : tab)));
  renderContactsBody();
}
function renderContactsBody() {
  var body = document.getElementById("contacts-body");
  var list = contactsCurrent[contactsTab] || [];
  var isLoc = contactsTab === "locations";
  var isCo  = contactsTab === "companies";

  if (isCo) {
    body.innerHTML = '<div class="contacts-hdr-co"><span></span><span>Company</span><span>Website</span><span>Notes</span><span></span></div>';
    list.forEach(function(c, i) {
      var row = document.createElement("div");
      row.className = "contact-row-co";
      var logoHtml;
      if (c.logo) {
        logoHtml = '<div class="co-logo-wrap" onclick="coLogoUpload(' + i + ')" title="Click to replace logo">' +
          '<img src="' + c.logo + '">' +
          '<button class="co-logo-badge rm" onclick="event.stopPropagation();coRemoveLogo(' + i + ')" title="Remove logo">&#x2715;</button>' +
          '<button class="co-logo-badge cr" onclick="event.stopPropagation();coCropLogo(' + i + ')" title="Crop logo">&#9986;</button>' +
          '</div>';
      } else {
        logoHtml = '<div class="co-logo-wrap" onclick="coLogoUpload(' + i + ')" title="Upload logo">' +
          '<div class="co-logo-placeholder">Logo</div>' +
          '</div>';
      }
      row.innerHTML = logoHtml +
        '<input value="' + (c.name||'').replace(/"/g,'&quot;') + '" placeholder="Company name" oninput="contactsCurrent.companies[' + i + '].name=this.value">' +
        '<input value="' + (c.website||'').replace(/"/g,'&quot;') + '" placeholder="Website (optional)" oninput="contactsCurrent.companies[' + i + '].website=this.value">' +
        '<input value="' + (c.notes||'').replace(/"/g,'&quot;') + '" placeholder="Notes (optional)" oninput="contactsCurrent.companies[' + i + '].notes=this.value">' +
        '<button class="rb" onclick="deleteContact(' + i + ')">&#x2715;</button>' +
        '<input type="file" id="co-logo-file-' + i + '" accept="image/*" style="display:none" onchange="handleCoLogoUpload(this,' + i + ')">';
      body.appendChild(row);
    });
  } else if (isLoc) {
    body.innerHTML = '<div class="contacts-hdr-loc"><span>Name</span><span>Address</span><span>City</span><span>State</span><span>Zip</span><span></span></div>';
    list.forEach(function(c, i) {
      var row = document.createElement("div");
      row.className = "contact-row-loc";
      row.innerHTML = '<input value="' + (c.name||'') + '" placeholder="Location name" oninput="contactsCurrent[\'locations\'][' + i + '].name=this.value">' +
        '<input value="' + (c.address||'') + '" placeholder="Address" oninput="contactsCurrent[\'locations\'][' + i + '].address=this.value">' +
        '<input value="' + (c.city||'') + '" placeholder="City" oninput="contactsCurrent[\'locations\'][' + i + '].city=this.value">' +
        '<input value="' + (c.state||'') + '" placeholder="ST" style="max-width:48px" oninput="contactsCurrent[\'locations\'][' + i + '].state=this.value">' +
        '<input value="' + (c.zip||'') + '" placeholder="Zip" style="max-width:64px" oninput="contactsCurrent[\'locations\'][' + i + '].zip=this.value">' +
        '<button class="rb" onclick="deleteContact(' + i + ')">&#x2715;</button>';
      body.appendChild(row);
    });
  } else {
    body.innerHTML = '<div class="contacts-hdr"><span>Name</span><span>Phone</span><span>Email</span><span></span></div>';
    list.forEach(function(c, i) {
      var row = document.createElement("div");
      row.className = "contact-row";
      row.innerHTML = '<input value="' + (c.name||'') + '" placeholder="Name" oninput="contactsCurrent[\'' + contactsTab + '\'][' + i + '].name=this.value">' +
        '<input class="fmt-phone" value="' + (c.phone||'') + '" placeholder="Phone" oninput="contactsCurrent[\'' + contactsTab + '\'][' + i + '].phone=this.value">' +
        '<input value="' + (c.email||'') + '" placeholder="Email" oninput="contactsCurrent[\'' + contactsTab + '\'][' + i + '].email=this.value">' +
        '<button class="rb" onclick="deleteContact(' + i + ')">&#x2715;</button>';
      body.appendChild(row);
    });
  }
}
function addContactRow() {
  if (!contactsCurrent[contactsTab]) contactsCurrent[contactsTab] = [];
  var blank = contactsTab === "companies"
    ? {name:"",logo:"",website:"",notes:""}
    : {name:"",phone:"",email:"",address:"",notes:""};
  contactsCurrent[contactsTab].push(blank);
  renderContactsBody();
  var rows = document.getElementById("contacts-body").querySelectorAll(".contact-row, .contact-row-loc, .contact-row-co");
  var last = rows[rows.length-1];
  if (last) { var _lqr = last.querySelector("input"); if (_lqr) _lqr.focus(); }
}
function deleteContact(i) {
  var _entry = (contactsCurrent[contactsTab]||[])[i]||{};
  var _label = _entry.name || _entry.company || "this contact";
  showModal("Remove contact", "Remove \""+_label+"\"? This cannot be undone.", function() {
    contactsCurrent[contactsTab].splice(i, 1);
    saveContactsData(contactsCurrent);
    renderContactsBody();
  });
}
function saveContacts() {
  // Remove blank entries
  Object.keys(contactsCurrent).forEach(k => {
    contactsCurrent[k] = contactsCurrent[k].filter(c => (c.name||"").trim());
  });
  saveContactsData(contactsCurrent);
  refreshSchedLocDropdowns();
  closeContacts();
  setStatus("Contacts saved.", "ok");
}


// ── Notes ─────────────────────────────────────────────────────────────────────
function noteCmd(cmd) {
  document.getElementById("note-editor").focus();
  document.execCommand(cmd, false, null);
}

let noteEditingId = null; // id of note being edited, or null for new

function noteSave() {
  const editor = document.getElementById("note-editor");
  const content = editor.innerHTML.trim();
  if (!content || content === "<br>") return;
  const now = new Date();
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const ts = days[now.getDay()]+" "+months[now.getMonth()]+" "+now.getDate()+", "+now.getFullYear()
    +" — "+now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});

  if (noteEditingId !== null) {
    // Update existing note
    const entry = noteEntries.find(function(e) { return e.id === noteEditingId; });
    if (entry) {
      entry.content = content;
      entry.ts = ts + " (edited)";
    }
    noteEditingId = null;
    document.getElementById("note-save-btn").innerHTML = icon('save') + " Save note";
  } else {
    // New note
    const entry = {ts:ts, content:content, id: ++_uid};
    noteEntries.unshift(entry);
  }
  editor.innerHTML = "";
  updateNoteDraftIndicator("");
  // Clear draft from saved project
  if (currentSheetKey) {
    var db2 = libLoad();
    if (db2[currentSheetKey]) { db2[currentSheetKey]._note_draft = ""; libSaveAll(db2); }
  }
  renderNotes();
}

function noteEdit(id) {
  const entry = noteEntries.find(function(e) { return e.id === id; });
  if (!entry) return;
  const editor = document.getElementById("note-editor");
  editor.innerHTML = entry.content;
  editor.focus();
  noteEditingId = id;
  document.getElementById("note-save-btn").innerHTML = icon('save') + " Update note";
  const cancelBtn = document.getElementById("note-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "";
  editor.scrollIntoView({behavior:"smooth", block:"center"});
}

function noteCancelEdit() {
  noteEditingId = null;
  document.getElementById("note-editor").innerHTML = "";
  document.getElementById("note-save-btn").innerHTML = icon('save') + " Save note";
  const cancelBtn = document.getElementById("note-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function renderNotes() {
  const ticker = document.getElementById("note-ticker");
  if (!ticker) return;
  if (!noteEntries.length) {
    ticker.innerHTML = "<div style='color:#bbb;font-size:13px;padding:8px 0'>No notes yet.</div>";
    return;
  }
  ticker.innerHTML = "";
  noteEntries.forEach(function(e) {
    const div = document.createElement("div");
    div.className = "note-entry"; div.id = "note-entry-" + e.id;
    const tsDiv = document.createElement("div"); tsDiv.className = "note-ts";
    const tsSpan = document.createElement("span"); tsSpan.textContent = e.ts;
    const btnWrap = document.createElement("div"); btnWrap.style.cssText = "display:flex;gap:4px";
    const editBtn = document.createElement("button");
    editBtn.title = "Edit note"; editBtn.innerHTML = "&#9998;";
    editBtn.style.cssText = "background:none;border:none;cursor:pointer;color:#aaa;font-size:13px;padding:0";
    editBtn.onmouseenter = function() { this.style.color="#333"; };
    editBtn.onmouseleave = function() { this.style.color="#aaa"; };
    editBtn.onclick = (function(id) { return function() { noteEdit(id); }; })(e.id);
    const delBtn = document.createElement("button");
    delBtn.title = "Delete note"; delBtn.innerHTML = "&#x2715;";
    delBtn.style.cssText = "background:none;border:none;cursor:pointer;color:#ccc;font-size:14px;padding:0;line-height:1";
    delBtn.onmouseenter = function() { this.style.color="#e74c3c"; };
    delBtn.onmouseleave = function() { this.style.color="#ccc"; };
    delBtn.onclick = (function(id) { return function() { noteDeleteById(id); }; })(e.id);
    btnWrap.appendChild(editBtn); btnWrap.appendChild(delBtn);
    tsDiv.appendChild(tsSpan); tsDiv.appendChild(btnWrap);
    const bodyDiv = document.createElement("div"); bodyDiv.className = "note-body";
    bodyDiv.innerHTML = e.content;
    div.appendChild(tsDiv); div.appendChild(bodyDiv);
    ticker.appendChild(div);
  });
  wireNoteImages();
}

function noteDeleteById(id) {
  noteEntries = noteEntries.filter(function(e) { return e.id !== id; });
  if (noteEditingId === id) noteCancelEdit();
  renderNotes();
}

function noteDelete(i) {
  noteEntries.splice(i, 1);
  renderNotes();
}

function notesGetData() { return noteEntries.map(e => ({ts:e.ts, content:e.content})); }
function notesLoadData(arr) {
  noteEntries = (arr||[]).map((e,i) => ({...e, id:++_uid}));
  renderNotes();
}

let noteEntries = [];

function notesEscHtml(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function notesSearch(query) {
  var q = query.toLowerCase();
  var results = [];
  noteEntries.forEach(function(e) {
    var tmp = document.createElement("div"); tmp.innerHTML = e.content;
    var text = (tmp.textContent || tmp.innerText || "");
    var lc = text.toLowerCase();
    var pos = lc.indexOf(q);
    if (pos === -1) return;
    var start = Math.max(0, pos - 40);
    var end = Math.min(text.length, pos + q.length + 40);
    var snippet = text.slice(start, end);
    var matchStart = pos - start;
    snippet = notesEscHtml(snippet.slice(0, matchStart)) +
      '<mark>' + notesEscHtml(snippet.slice(matchStart, matchStart + q.length)) + '</mark>' +
      notesEscHtml(snippet.slice(matchStart + q.length));
    results.push({index: e.id, dateStr: e.ts, snippet: snippet});
  });
  document.getElementById("notes-editor-wrap").style.display = "none";
  document.getElementById("notes-save-row").style.display = "none";
  document.getElementById("notes-history-hdr").style.display = "none";
  document.getElementById("note-ticker").style.display = "none";
  document.getElementById("notes-search-results").style.display = "block";
  var wrap = document.getElementById("notes-search-results");
  if (!results.length) {
    wrap.innerHTML = '<div style="padding:16px;color:var(--film-can);font-size:13px;text-align:center">No notes match "' + notesEscHtml(query) + '"</div>';
    return;
  }
  wrap.innerHTML = results.map(function(r) {
    return '<div class="note-search-result" onclick="notesSearchOpenNote(' + r.index + ')" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;background:var(--surface)">' +
      '<div style="font-size:11px;color:var(--film-can);margin-bottom:6px">' + notesEscHtml(r.dateStr) + '</div>' +
      '<div style="font-size:13px;line-height:1.5">...' + r.snippet + '...</div>' +
      '</div>';
  }).join('');
}

function notesSearchClear() {
  document.getElementById("notes-search-results").style.display = "none";
  document.getElementById("notes-editor-wrap").style.display = "";
  document.getElementById("notes-save-row").style.display = "";
  document.getElementById("notes-history-hdr").style.display = "";
  document.getElementById("note-ticker").style.display = "";
}

function notesSearchOpenNote(id) {
  notesSearchClear();
  document.getElementById("notes-search").value = "";
  document.getElementById("notes-search-clear").style.display = "none";
  setTimeout(function() {
    var el = document.getElementById("note-entry-" + id);
    if (!el) return;
    el.scrollIntoView({behavior:"smooth", block:"center"});
    el.style.outline = "2px solid var(--accent)";
    setTimeout(function() { el.style.outline = ""; }, 1500);
  }, 50);
}

// ── URLs ──────────────────────────────────────────────────────────────────────
let urlItems = [];

function addUrl(data) {
  data = data || {};
  const id = "url_" + (++_uid);
  urlItems.push(id);
  const el = document.createElement("div");
  el.className = "url-card"; el.id = id;
  const btnLabel = data.name ? data.name : "Open";
  el.innerHTML =
    '<div class="url-top-row">' +
      '<button class="url-toggle' + (data.collapsed ? '' : ' open') + '" id="' + id + '_toggle" onclick="toggleUrl(\'' + id + '\')" title="Expand/collapse">' + icon('chevron-right') + '</button>' +
      '<button class="url-open" id="' + id + '_btn" onclick="openUrl(\'' + id + '\')" title="Open in new window">&#x1F517; ' + btnLabel + '</button>' +
      '<button class="rb" onclick="removeUrl(\'' + id + '\')">&#x2715;</button>' +
    '</div>' +
    '<div class="url-fields' + (data.collapsed ? ' collapsed' : '') + '" id="' + id + '_fields">' +
      '<input type="text" id="' + id + '_name" placeholder="Name" value="' + (data.name||'') + '" autocomplete="new-password" oninput="updateUrlBtn(\'' + id + '\')">' +
      '<input type="url" id="' + id + '_url" placeholder="https://..." value="' + (data.url||'') + '" autocomplete="new-password">' +
      '<input type="text" id="' + id + '_notes" placeholder="Notes" value="' + (data.notes||'') + '" autocomplete="new-password">' +
    '</div>';
  document.getElementById("url-list").appendChild(el);
}

function toggleUrl(id) {
  const fields = document.getElementById(id+"_fields");
  const toggle = document.getElementById(id+"_toggle");
  if (!fields || !toggle) return;
  const collapsed = fields.classList.toggle("collapsed");
  toggle.classList.toggle("open", !collapsed);
}

function updateUrlBtn(id) {
  const name = (document.getElementById(id+"_name")||{}).value||"";
  const btn = document.getElementById(id+"_btn");
  if (btn) btn.innerHTML = "&#x1F517; " + (name.trim() || "Open");
}

function removeUrl(id) {
  var _label = (document.getElementById(id+"_name")||{}).value || (document.getElementById(id+"_url")||{}).value || "this URL";
  showModal("Remove URL", "Remove \""+_label+"\"? This cannot be undone.", function() {
    const i = urlItems.indexOf(id); if (i > -1) urlItems.splice(i, 1);
    document.getElementById(id).remove();
  });
}

function openUrl(id) {
  const url = (document.getElementById(id+"_url")||{}).value||"";
  if (!url.trim()) return;
  const href = url.trim().startsWith("http") ? url.trim() : "https://" + url.trim();
  const a = document.createElement("a");
  a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function getUrls() {
  return urlItems.map(function(id) {
    const fields = document.getElementById(id+"_fields");
    return {
      url:      ((document.getElementById(id+"_url")||{}).value||"").trim(),
      name:     ((document.getElementById(id+"_name")||{}).value||"").trim(),
      notes:    ((document.getElementById(id+"_notes")||{}).value||"").trim(),
      collapsed: fields ? fields.classList.contains("collapsed") : false,
    };
  }).filter(function(u) { return u.url || u.name; });
}

function loadUrls(items) {
  document.getElementById("url-list").innerHTML = "";
  urlItems = [];
  (items||[]).forEach(function(u) { addUrl(u); });
}


// ── Daily sidebar ─────────────────────────────────────────────────────────────
var sidebarOpen = true;
var sidebarRefreshTimer = null;

// Matches a wb_item to a Rundown entry by uuid when both have one, falling back
// to item text (old projects/items may predate the uuid field).
function wbItemMatchesEntry(wi, entry) {
  if (entry.itemUuid && wi.uuid) return wi.uuid === entry.itemUuid;
  return wi.item === entry.itemName;
}

// Persists a Rundown-driven status change for a project that is NOT the one
// currently loaded in the form (the live form + autosaveTrigger path handles
// the currently-loaded project instead). Without this, toggling a checkbox
// for any other project only updated localStorage/_allProjectsCache and was
// silently lost on next reload since the server never saw the change.
function persistRundownStatusChange(sheetKey) {
  if (currentSheetKey === sheetKey) return; // live form + autosaveTrigger already handles this one
  var entry = _allProjectsCache[sheetKey];
  if (!entry || !entry.data) return;
  API.saveProject(sheetKey, entry.label || entry.data.label, entry.data).then(function(result) {
    if (!result) console.warn("Rundown status change: server save failed for", sheetKey, "(localStorage only)");
  });
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById("daily-sidebar").classList.toggle("hidden", !sidebarOpen);
  var rundownBtn = document.getElementById("sidebar-rundown-btn");
  if (rundownBtn) rundownBtn.classList.toggle("active", sidebarOpen);
  if (sidebarOpen) { if (dailyTab === "crew") renderSidebarCrew(); else refreshSidebar(); }
}

function refreshSidebar() {
  if (!sidebarOpen) return;
  function localDateIso(d) {
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  var today = localDateIso(new Date());
  // "Tomorrow" = next business day (skip weekends)
  var _tomorrowD = new Date(); _tomorrowD.setDate(_tomorrowD.getDate()+1);
  while (_tomorrowD.getDay() === 0 || _tomorrowD.getDay() === 6) _tomorrowD.setDate(_tomorrowD.getDate()+1);
  var tomorrow = localDateIso(_tomorrowD);
  var d = new Date();
  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var monNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("daily-date").textContent = dayNames[d.getDay()]+", "+monNames[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear();

  // Compute date range boundaries for This Week / Next Week
  var _nowD = new Date();
  var _todayMidnight = new Date(_nowD.getFullYear(), _nowD.getMonth(), _nowD.getDate());
  var _dayAfterTomorrow = new Date(_todayMidnight); _dayAfterTomorrow.setDate(_todayMidnight.getDate() + 2);
  var _endOfWeek = new Date(_todayMidnight); _endOfWeek.setDate(_todayMidnight.getDate() + (7 - _todayMidnight.getDay()));
  var _startOfNextWeek = new Date(_endOfWeek); _startOfNextWeek.setDate(_endOfWeek.getDate() + 1);
  var _endOfNextWeek = new Date(_startOfNextWeek); _endOfNextWeek.setDate(_startOfNextWeek.getDate() + 6);
  var dayAfterTomorrow = localDateIso(_dayAfterTomorrow);
  var endOfWeek = localDateIso(_endOfWeek);
  var startOfNextWeek = localDateIso(_startOfNextWeek);
  var endOfNextWeek = localDateIso(_endOfNextWeek);

  var db = {};
  Object.keys(_allProjectsCache).forEach(function(k) { db[k] = _allProjectsCache[k].data; });
  if (currentSheetKey) db[currentSheetKey] = gather();
  var overdue = [], dueToday = [], dueTomorrow = [], thisWeek = [], nextWeek = [];
  Object.keys(db).forEach(function(sheetKey) {
    var sheet = db[sheetKey];
    var project = sheet.project_title || sheet.label || "Untitled";
    // Get anchor date from new schedule_days format
    var wbDayVal = sheet.wb_day_select || "last";
    var schedDays = sheet.schedule_days || [];
    var eventIso = "";
    if (schedDays.length) {
      if (wbDayVal === "first") eventIso = schedDays[0].date_iso||"";
      else if (wbDayVal === "kickoff") eventIso = sheet.kickoff_date_iso||"";
      else {
        var matched = schedDays.find(function(d) { return (d.id||"") === wbDayVal; });
        eventIso = matched ? matched.date_iso||"" : schedDays[schedDays.length-1].date_iso||"";
      }
    }
    var kickoffIso = sheet.kickoff_date_iso||"";
    var prevDue = kickoffIso;

    (sheet.wb_items||[]).forEach(function(item) {
      if (!item.item) return;
      if (item.status === "N/A") return;
      if (item.status === "Complete") return;
      // Calculate due date based on mode
      // Use pre-calculated due date if available (most reliable)
      var due = item.due || "";
      if (!due) {
        var mode = item.mode || "anchor";
        var dir = sheet.wb_direction || "back";
        if (mode === "manual") {
          due = item.manual_date||"";
        } else if (mode === "sequential") {
          var base = prevDue || kickoffIso || eventIso;
          due = wbBusinessDaysAfter(base, item.seq_days||0);
        } else {
          var days = item.days||0;
          due = dir === "forward" ? wbBusinessDaysAfter(eventIso, days) : wbBusinessDaysBefore(eventIso, days);
        }
      }
      if (due) prevDue = due;
      if (!due) return;
      var entry = {project:project, item:item.item, owner:item.owner||"", due:due, status:item.status||"Not Started", sheetKey:sheetKey, itemName:item.item, itemUuid:item.uuid||""};
      if (due < today) overdue.push(entry);
      else if (due === today) dueToday.push(entry);
      else if (due === tomorrow) dueTomorrow.push(entry);
      else if (due >= dayAfterTomorrow && due <= endOfWeek) thisWeek.push(entry);
      else if (due >= startOfNextWeek && due <= endOfNextWeek) nextWeek.push(entry);
    });

    // Add schedule pins (all pins, including internal-only, since Rundown is a personal producer view)
    var pinMilestones = [];
    if (sheet.kickoff_date_iso) {
      pinMilestones.push({id:"kickoff", label:"Client Kickoff", date_iso:sheet.kickoff_date_iso, call_time:sheet.kickoff_time||""});
    }
    (sheet.schedule_days||[]).forEach(function(day, i) {
      if (!day.date_iso) return;
      pinMilestones.push({id:day.id||"day_"+i, label:day.label||"Day "+(i+1), date_iso:day.date_iso, call_time:day.call_time||""});
    });
    if (sheet.video_due_date_iso) {
      pinMilestones.push({id:"video_due", label:"Project Due Date", date_iso:sheet.video_due_date_iso, call_time:sheet.video_due_time||""});
    }
    pinMilestones.forEach(function(pin) {
      var pinDue = pin.date_iso;
      if (!pinDue) return;
      if (pinDue < today) return; // Past pins auto-complete — shown in Completed tab, never Overdue
      var pinEntry = {project:project, item:pin.label, owner:"", due:pinDue, status:"pin", sheetKey:sheetKey, itemName:pin.label, isPin:true, call_time:pin.call_time||""};
      if (pinDue === today) dueToday.push(pinEntry);
      else if (pinDue === tomorrow) dueTomorrow.push(pinEntry);
      else if (pinDue >= dayAfterTomorrow && pinDue <= endOfWeek) thisWeek.push(pinEntry);
      else if (pinDue >= startOfNextWeek && pinDue <= endOfNextWeek) nextWeek.push(pinEntry);
    });
  });

  [overdue, dueToday, dueTomorrow, thisWeek, nextWeek].forEach(function(arr) {
    arr.sort(function(a,b) { return a.project.localeCompare(b.project); });
  });

  if (dailyTab === "completed") { renderCompleted(); return; }
  if (dailyTab === "crew") return;

  var body = document.getElementById("daily-body");
  body.innerHTML = "";

  function renderSection(title, items, cls) {
    if (!items.length) return;
    var sec = document.createElement("div");
    sec.className = "daily-section";
    var hdr = document.createElement("div");
    hdr.className = "daily-section-title "+cls;
    hdr.textContent = title + " ("+items.length+")";
    sec.appendChild(hdr);
    {
      items.forEach(function(entry) {
        var row = document.createElement("div");
        row.className = "daily-item";
        if (!entry.isPin) {
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = (entry.status === "Complete");
          cb.addEventListener("change", function() {
            var newStatus = cb.checked ? "Complete" : "Not Started";
            // 1. Update localStorage
            var db2 = libLoad();
            var sheet2 = db2[entry.sheetKey];
            if (sheet2) {
              (sheet2.wb_items||[]).forEach(function(wi) {
                if (wbItemMatchesEntry(wi, entry)) wi.status = newStatus;
              });
              localStorage.setItem("slater_callsheets", JSON.stringify(db2));
            }
            // 1b. Update _allProjectsCache so refreshSidebar sees the change immediately
            if (_allProjectsCache[entry.sheetKey] && _allProjectsCache[entry.sheetKey].data) {
              (_allProjectsCache[entry.sheetKey].data.wb_items||[]).forEach(function(wi) {
                if (wbItemMatchesEntry(wi, entry)) wi.status = newStatus;
              });
            }
            // 2. If this is the currently loaded project, also update the live form
            if (currentSheetKey === entry.sheetKey) {
              wbItems.forEach(function(wid) {
                var itemEl = document.getElementById(wid+"_item");
                var statusEl = document.getElementById(wid+"_status");
                if (itemEl && statusEl && itemEl.value === entry.itemName) {
                  statusEl.value = newStatus;
                  updateWbItemStyle(wid);
                }
              });
              autosaveTrigger();
            } else {
              // 2b. Otherwise persist directly, since no autosave is running for this project
              persistRundownStatusChange(entry.sheetKey);
            }
            nameDiv.classList.toggle("done", cb.checked);
            setTimeout(refreshSidebar, 300);
          });
          row.appendChild(cb);
        }
        var bodyDiv = document.createElement("div");
        bodyDiv.className = "daily-item-body";
        var nameDiv = document.createElement("div");
        nameDiv.className = "daily-item-name" + (entry.status === "Complete" ? " done" : "");
        nameDiv.textContent = entry.item;
        var metaDiv = document.createElement("div");
        metaDiv.className = "daily-item-meta";
        metaDiv.textContent = entry.project + (entry.owner ? " · "+entry.owner : "");
        var openDiv = document.createElement("div");
        openDiv.className = "daily-item-meta";
        var openLink = document.createElement("span");
        openLink.className = "daily-item-link";
        openLink.textContent = "Open project →";
        openLink.addEventListener("click", (function(sk, iname) {
          return function() { openSheetFromSidebar(sk, iname); };
        })(entry.sheetKey, entry.itemName));
        openDiv.appendChild(openLink);
        bodyDiv.appendChild(nameDiv);
        if (entry.isPin && entry.due) {
          var pinDateEl = document.createElement("div");
          pinDateEl.style.cssText = "font-size:11px;color:var(--film-can);margin-top:1px";
          var _pd = new Date(entry.due + "T12:00:00");
          var _dayN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][_pd.getDay()];
          var _monN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][_pd.getMonth()];
          var _dStr = _dayN + " " + _monN + " " + _pd.getDate();
          pinDateEl.textContent = entry.call_time ? _dStr + " · " + entry.call_time : _dStr;
          bodyDiv.appendChild(pinDateEl);
        }
        bodyDiv.appendChild(metaDiv);
        bodyDiv.appendChild(openDiv);
        if (entry.isPin) row.appendChild(makeRundownCalWidget(entry.due));
        row.appendChild(bodyDiv);
        sec.appendChild(row);
      });
    }
    body.appendChild(sec);
  }

  renderSection("Overdue", overdue, "overdue");
  renderSection("Due Today", dueToday, "today");
  renderSection("Due Tomorrow", dueTomorrow, "tomorrow");
  renderSection("This Week", thisWeek, "this-week");
  renderSection("Next Week", nextWeek, "next-week");
  if (!overdue.length && !dueToday.length && !dueTomorrow.length && !thisWeek.length && !nextWeek.length) {
    var emptyAll = document.createElement("div");
    emptyAll.style.cssText = "color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic";
    emptyAll.textContent = "Nothing due soon.";
    body.appendChild(emptyAll);
  }
  clearTimeout(sidebarRefreshTimer);
  sidebarRefreshTimer = setTimeout(refreshSidebar, 60000);
}

var dailyTab = "pending";
var completedFilter = "";

function switchDailyTab(tab) {
  if (tab !== "completed") completedFilter = "";
  dailyTab = tab;
  document.getElementById("dtab-pending").classList.toggle("active", tab === "pending");
  document.getElementById("dtab-completed").classList.toggle("active", tab === "completed");
  document.getElementById("dtab-crew").classList.toggle("active", tab === "crew");
  if (tab === "crew") renderSidebarCrew();
  else refreshSidebar();
}

function renderCompleted() {
  var today = new Date().toISOString().slice(0,10);
  var d = new Date();
  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var monNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("daily-date").textContent = dayNames[d.getDay()]+", "+monNames[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear();

  var db = {};
  Object.keys(_allProjectsCache).forEach(function(k) { db[k] = _allProjectsCache[k].data; });
  if (currentSheetKey) db[currentSheetKey] = gather();
  var completed = [];
  Object.keys(db).forEach(function(sheetKey) {
    var sheet = db[sheetKey];
    var project = sheet.project_title || sheet.label || "Untitled";
    var _cWbDay = sheet.wb_day_select || "last";
    var _cSchedDays = sheet.schedule_days || [];
    var _cEventIso = "";
    if (_cSchedDays.length) {
      if (_cWbDay === "kickoff") _cEventIso = sheet.kickoff_date_iso||"";
      else {
        var _cMatched = _cSchedDays.find(function(d) { return (d.id||"") === _cWbDay; });
        _cEventIso = _cMatched ? _cMatched.date_iso||"" : _cSchedDays[_cSchedDays.length-1].date_iso||"";
      }
    }
    var _cKickoff = sheet.kickoff_date_iso||"";
    var _cPrevDue = _cKickoff;
    (sheet.wb_items||[]).forEach(function(item) {
      if (!item.item || item.status !== "Complete") return;
      var _cMode = item.mode||"anchor";
      var _cDue = "";
      if (_cMode === "manual") { _cDue = item.manual_date||""; }
      else if (_cMode === "sequential") { _cDue = wbBusinessDaysAfter(_cPrevDue||_cKickoff||_cEventIso, item.seq_days||0); }
      else { _cDue = (sheet.wb_direction==="forward") ? wbBusinessDaysAfter(_cEventIso, item.days||0) : wbBusinessDaysBefore(_cEventIso, item.days||0); }
      if (_cDue) _cPrevDue = _cDue;
      completed.push({project:project, item:item.item, owner:item.owner||"", due:_cDue, sheetKey:sheetKey, itemName:item.item, itemUuid:item.uuid||""});
    });
    // Past schedule pins auto-complete — they're events that happened
    var _cPinMilestones = [];
    if (sheet.kickoff_date_iso && sheet.kickoff_date_iso < today) {
      _cPinMilestones.push({label:"Client Kickoff", date_iso:sheet.kickoff_date_iso, call_time:sheet.kickoff_time||""});
    }
    (sheet.schedule_days||[]).forEach(function(day, i) {
      if (day.date_iso && day.date_iso < today) {
        _cPinMilestones.push({label:day.label||"Day "+(i+1), date_iso:day.date_iso, call_time:day.call_time||""});
      }
    });
    if (sheet.video_due_date_iso && sheet.video_due_date_iso < today) {
      _cPinMilestones.push({label:"Project Due Date", date_iso:sheet.video_due_date_iso, call_time:sheet.video_due_time||""});
    }
    _cPinMilestones.forEach(function(pin) {
      completed.push({project:project, item:pin.label, owner:"", due:pin.date_iso, sheetKey:sheetKey, itemName:pin.label, isPin:true, call_time:pin.call_time||""});
    });
  });
  completed.sort(function(a,b) { return a.project.localeCompare(b.project) || (a.due||"").localeCompare(b.due||""); });

  var body = document.getElementById("daily-body");
  body.innerHTML = "";

  // Search input
  var searchWrap = document.createElement("div");
  searchWrap.style.cssText = "padding:6px 4px;position:sticky;top:-10px;margin-top:-10px;background:var(--surface);z-index:1";
  var searchInp = document.createElement("input");
  searchInp.type = "text";
  searchInp.placeholder = "🔍 Filter completed items...";
  searchInp.value = completedFilter;
  searchInp.style.cssText = "width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;background:var(--surface);color:var(--text-primary)";
  searchInp.addEventListener("input", function() {
    completedFilter = searchInp.value;
    renderCompleted();
    // Restore focus after re-render
    var inp = document.querySelector("#daily-body input[type=text]");
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });
  searchWrap.appendChild(searchInp);
  body.appendChild(searchWrap);

  if (!completed.length) {
    var empty = document.createElement("div");
    empty.style.cssText = "color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic";
    empty.textContent = "No completed tasks yet.";
    body.appendChild(empty);
    return;
  }

  // Apply filter
  var filterQ = completedFilter.trim().toLowerCase();
  var visible = filterQ ? completed.filter(function(e) {
    return e.item.toLowerCase().indexOf(filterQ) !== -1 || e.owner.toLowerCase().indexOf(filterQ) !== -1 || e.project.toLowerCase().indexOf(filterQ) !== -1;
  }) : completed;

  if (filterQ && !visible.length) {
    var noMatch = document.createElement("div");
    noMatch.style.cssText = "color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic";
    noMatch.textContent = "No results.";
    body.appendChild(noMatch);
    return;
  }

  // Group by project
  var byProject = {};
  visible.forEach(function(e) {
    if (!byProject[e.project]) byProject[e.project] = [];
    byProject[e.project].push(e);
  });

  Object.keys(byProject).sort().forEach(function(proj) {
    var sec = document.createElement("div");
    sec.className = "daily-section";
    var hdr = document.createElement("div");
    hdr.className = "daily-section-title";
    hdr.style.color = "#555";
    hdr.textContent = proj + " (" + byProject[proj].length + ")";
    sec.appendChild(hdr);
    byProject[proj].forEach(function(entry) {
      var row = document.createElement("div");
      row.className = "daily-item";
      if (!entry.isPin) {
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;
        cb.addEventListener("change", function() {
          var db2 = libLoad();
          var sheet2 = db2[entry.sheetKey];
          if (sheet2) {
            (sheet2.wb_items||[]).forEach(function(wi) {
              if (wbItemMatchesEntry(wi, entry)) wi.status = "Not Started";
            });
            localStorage.setItem("slater_callsheets", JSON.stringify(db2));
          }
          if (_allProjectsCache[entry.sheetKey] && _allProjectsCache[entry.sheetKey].data) {
            (_allProjectsCache[entry.sheetKey].data.wb_items||[]).forEach(function(wi) {
              if (wbItemMatchesEntry(wi, entry)) wi.status = "Not Started";
            });
          }
          if (currentSheetKey === entry.sheetKey) {
            wbItems.forEach(function(wid) {
              var itemEl = document.getElementById(wid+"_item");
              var statusEl = document.getElementById(wid+"_status");
              if (itemEl && statusEl && itemEl.value === entry.itemName) { statusEl.value = "Not Started"; }
            });
            autosaveTrigger();
          } else {
            persistRundownStatusChange(entry.sheetKey);
          }
          setTimeout(refreshSidebar, 300);
        });
        row.appendChild(cb);
      }
      var bodyDiv = document.createElement("div");
      bodyDiv.className = "daily-item-body";
      var nameDiv = document.createElement("div");
      nameDiv.className = "daily-item-name done";
      nameDiv.textContent = entry.item;
      var metaDiv = document.createElement("div");
      metaDiv.className = "daily-item-meta";
      var openLink = document.createElement("span");
      openLink.className = "daily-item-link";
      openLink.textContent = "Open project →";
      openLink.addEventListener("click", (function(sk, iname) {
        return function() { openSheetFromSidebar(sk, iname); };
      })(entry.sheetKey, entry.itemName));
      metaDiv.textContent = (entry.owner ? entry.owner + " " : "") + (entry.due ? "· due " + entry.due : "");
      metaDiv.appendChild(document.createTextNode(" "));
      metaDiv.appendChild(openLink);
      bodyDiv.appendChild(nameDiv);
      if (entry.isPin && entry.due) {
        var pinDateEl2 = document.createElement("div");
        pinDateEl2.style.cssText = "font-size:11px;color:var(--film-can);margin-top:1px";
        var _pd2 = new Date(entry.due + "T12:00:00");
        var _dayN2 = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][_pd2.getDay()];
        var _monN2 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][_pd2.getMonth()];
        var _dStr2 = _dayN2 + " " + _monN2 + " " + _pd2.getDate();
        pinDateEl2.textContent = entry.call_time ? _dStr2 + " · " + entry.call_time : _dStr2;
        bodyDiv.appendChild(pinDateEl2);
      }
      bodyDiv.appendChild(metaDiv);
      if (entry.isPin) row.appendChild(makeRundownCalWidget(entry.due));
      row.appendChild(bodyDiv);
      sec.appendChild(row);
    });
    body.appendChild(sec);
  });
}

function closeDailySidebar() {
  if (sidebarOpen) toggleSidebar();
}

function loadProjectAndGoToCrew(key) {
  function doLoad() {
    currentSheetKey = key;
    localStorage.setItem("slater_last_project", key);
    API.getProject(key).then(function(result) {
      if (result && result.data) {
        loadFormData(result.data);
        st("crew");
        closeDailySidebar();
        var sel = document.getElementById("lib-select");
        if (sel) sel.value = key;
        document.getElementById("lib-delete").style.display = "";
        document.getElementById("lib-duplicate").style.display = "";
      }
    });
  }
  if (currentSheetKey && currentSheetKey !== key && hasUnsavedChanges()) {
    modalConfirm(
      "Unsaved Changes",
      "You have unsaved changes. Save before opening this project?",
      function() { libSave(); setTimeout(doLoad, 300); },
      "Save & Open",
      function() { doLoad(); },
      "Discard & Open"
    );
  } else {
    doLoad();
  }
}

function makeRundownCalWidget(dateIso) {
  var wrap = document.createElement("div");
  wrap.className = "sday-cal xs";
  wrap.style.cssText = "flex-shrink:0;cursor:default";
  var monthEl = document.createElement("div");
  monthEl.className = "sday-cal-month";
  var dayEl = document.createElement("div");
  dayEl.className = "sday-cal-day";
  if (dateIso) {
    var months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    var parts = dateIso.split("-");
    monthEl.textContent = months[parseInt(parts[1],10)-1] || "---";
    dayEl.textContent = parseInt(parts[2],10) || "--";
  } else {
    monthEl.textContent = "---";
    dayEl.textContent = "--";
  }
  wrap.appendChild(monthEl);
  wrap.appendChild(dayEl);
  return wrap;
}

function renderSidebarCrew() {
  var body = document.getElementById("daily-body");
  body.innerHTML = '<div style="color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic">Loading crew status…</div>';

  function parseLabelDate(label) {
    var parts = (label || "").split("|");
    var last = (parts[parts.length - 1] || "").trim();
    var m = last.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    var yr = parseInt(m[3]); if (yr < 100) yr += 2000;
    return new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
  }

  var _crewToday = new Date(); _crewToday.setHours(0,0,0,0);

  API.getProjects().then(function(projects) {
    if (!projects || !projects.length) {
      body.innerHTML = '<div style="color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic">No projects found.</div>';
      return;
    }

    // Only show projects whose date is today or in the future; no-date projects are assumed active
    var active = projects.filter(function(p) {
      var d = parseLabelDate(p.label);
      return !d || d.getTime() >= _crewToday.getTime();
    });

    if (!active.length) {
      body.innerHTML = '<div style="color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic">No active projects found.</div>';
      return;
    }

    // Fetch all active projects in parallel
    Promise.all(active.map(function(p) {
      return API.getProject(p.key).then(function(result) {
        if (!result || !result.data) return null;
        var summary = result.data.crew_summary;
        // crew_summary only exists after a save post-feature-launch; fall back to crew array
        if (!summary || !summary.total) {
          var crewArr = result.data.crew || [];
          if (!crewArr.length) return null;
          summary = {tbd:0, pencil:0, hold:0, confirmed:0, total:crewArr.length};
          crewArr.forEach(function(c) {
            var s = c.status || "tbd";
            if (summary[s] !== undefined) summary[s]++; else summary.tbd++;
          });
        }
        var dateObj = parseLabelDate(p.label);
        return {key: p.key, label: p.label || result.data.project_title || "Untitled", summary: summary, date: dateObj};
      });
    })).then(function(results) {
      var cards = results.filter(Boolean);

      if (!cards.length) {
        body.innerHTML = '<div style="color:#bbb;font-size:13px;padding:20px 0;text-align:center;font-style:italic">No active projects with crew yet.</div>';
        return;
      }

      // Sort by date: soonest upcoming first, then most recently past, no-date last
      cards.sort(function(a, b) {
        var at = a.date ? a.date.getTime() : Infinity;
        var bt = b.date ? b.date.getTime() : Infinity;
        return at - bt;
      });

      body.innerHTML = "";

      var STATUS_ORDER = [
        {key:"confirmed", label:"Confirmed", color:"#4A9E6B"},
        {key:"hold",      label:"1st Hold",  color:"#E07B39"},
        {key:"pencil",    label:"Pencil",    color:"#E8B84B"},
        {key:"tbd",       label:"TBD",       color:"#9D9D99"}
      ];

      cards.forEach(function(p) {
        var s = p.summary;
        var total = s.total || 0;
        var pct = total ? Math.round((s.confirmed / total) * 100) : 0;

        var card = document.createElement("div");
        card.className = "sidebar-crew-card";
        card.addEventListener("click", (function(k) { return function() { loadProjectAndGoToCrew(k); }; })(p.key));

        var title = document.createElement("div");
        title.className = "sidebar-crew-title";
        title.textContent = p.label;
        card.appendChild(title);

        if (p.date) {
          var dateEl = document.createElement("div");
          dateEl.style.cssText = "font-size:10px;color:var(--film-can);margin-top:-4px;margin-bottom:5px";
          dateEl.textContent = p.date.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
          card.appendChild(dateEl);
        }

        var dots = document.createElement("div");
        dots.className = "sidebar-crew-dots";
        STATUS_ORDER.forEach(function(st) {
          var count = s[st.key] || 0;
          if (!count) return;
          var item = document.createElement("span");
          item.className = "sidebar-crew-dot-item";
          var dot = document.createElement("span");
          dot.className = "sidebar-crew-dot";
          dot.style.background = st.color;
          item.appendChild(dot);
          item.appendChild(document.createTextNode(st.label + " " + count));
          dots.appendChild(item);
        });
        card.appendChild(dots);

        var track = document.createElement("div");
        track.className = "sidebar-crew-progress-track";
        var fill = document.createElement("div");
        fill.className = "sidebar-crew-progress-fill";
        fill.style.width = pct + "%";
        track.appendChild(fill);
        card.appendChild(track);

        var summaryEl = document.createElement("div");
        summaryEl.className = "sidebar-crew-summary";
        summaryEl.textContent = total + " crew \xb7 " + pct + "% confirmed";
        card.appendChild(summaryEl);

        body.appendChild(card);
      });
    }).catch(function() {
      body.innerHTML = '<div style="color:#c0392b;font-size:13px;padding:20px 0;text-align:center">Failed to load crew data.</div>';
    });
  }).catch(function() {
    body.innerHTML = '<div style="color:#c0392b;font-size:13px;padding:20px 0;text-align:center">Failed to load projects.</div>';
  });
}

// Resize handle
(function() {
  var resizing = false, startX, startW;
  document.addEventListener("DOMContentLoaded", function() {
    var handle = document.getElementById("daily-resize");
    if (!handle) return;
    handle.addEventListener("mousedown", function(e) {
      resizing = true; startX = e.clientX;
      startW = parseInt(document.getElementById("daily-sidebar").style.width)||320;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", function(e) {
      if (!resizing) return;
      var newW = Math.max(240, Math.min(600, startW-(e.clientX-startX)));
      document.getElementById("daily-sidebar").style.width = newW+"px";
    });
    document.addEventListener("mouseup", function() {
      resizing = false; document.body.style.userSelect = "";
    });
  });
})();

function hasUnsavedChanges() {
  if (!currentSheetKey) return false;
  const db = libLoad();
  const saved = db[currentSheetKey];
  if (!saved) return false;
  // Compare key fields of current form vs saved data
  const current = gather();
  return JSON.stringify(current) !== JSON.stringify(saved);
}

function openSheetFromSidebar(sheetKey, itemName) {
  function doOpen() {
    clearTimeout(_autosaveTimer);
    _navigating = true;
    currentSheetKey = sheetKey;
    localStorage.setItem("slater_last_project", sheetKey);
    document.getElementById("lib-select").value = sheetKey;
    document.getElementById("lib-delete").style.display = "";
    document.getElementById("lib-duplicate").style.display = "";
    API.getProject(sheetKey).then(function(result) {
      if (result && result.data) {
        loadFormData(result.data);
      } else {
        var db2 = libLoad();
        if (db2[sheetKey]) loadFormData(db2[sheetKey]);
      }
      document.getElementById("lib-select").value = sheetKey;
      _navigating = false;
      st("workback");
      setTimeout(function() {
        var items = document.querySelectorAll(".wb-item");
        items.forEach(function(el) {
          var itemInput = el.querySelector("input[id$='_item']");
          if (itemInput && itemInput.value === itemName) {
            el.style.transition = "background .3s";
            el.style.background = "#fff9c4";
            setTimeout(function() { el.style.background = ""; }, 2000);
            el.scrollIntoView({behavior:"smooth", block:"center"});
          }
        });
      }, 200);
    });
  }

  if (currentSheetKey && currentSheetKey !== sheetKey && hasUnsavedChanges()) {
    // Prompt to save before switching
    modalConfirm(
      "Unsaved Changes",
      "You have unsaved changes. Save before opening this project?",
      function() { libSave(); setTimeout(doOpen, 300); },
      "Save & Open",
      function() { doOpen(); },
      "Discard & Open"
    );
  } else {
    doOpen();
  }
}

function modalConfirm(title, msg, onPrimary, primaryLabel, onSecondary, secondaryLabel) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-msg").textContent = msg;
  const okBtn = document.getElementById("modal-ok");
  const cancelBtn = document.querySelector(".modal-btns .lb:first-child");
  okBtn.textContent = primaryLabel || "OK";
  cancelBtn.textContent = secondaryLabel || "Cancel";
  okBtn.onclick = function() { modalCancel(); onPrimary && onPrimary(); };
  cancelBtn.onclick = function() { modalCancel(); onSecondary && onSecondary(); };
  document.getElementById("modal-overlay").classList.add("open");
}

// ── Workback Templates ────────────────────────────────────────────────────────
const TMPL_KEY     = "slater_wb_templates";
const TMPL_DEF_KEY = "slater_wb_defaults";

const WB_PRESETS = {
  live_broadcast_location: {
    id: "preset_live_broadcast_location",
    name: "Live Broadcast: On Location (Preset)",
    items: [
      {item:"Creative brief / run of show received",     owner:"", days:30},
      {item:"Venue confirmed",                           owner:"", days:25},
      {item:"Crew booked",                               owner:"", days:21},
      {item:"Run of show draft distributed",             owner:"", days:14},
      {item:"Run of show approved",                      owner:"", days:10},
      {item:"Graphic package / lower thirds approved",   owner:"", days:7},
      {item:"Tech scout / site visit",                   owner:"", days:5},
      {item:"Call sheet distributed",                    owner:"", days:2},
      {item:"Load in / setup",                           owner:"", days:1},
      {item:"Rehearsal / camera blocking",               owner:"", days:0},
      {item:"Event go live",                             owner:"", days:0},
      {item:"Strike / load out",                         owner:"", days:-1},
    ]
  },
  location_shoot: {
    id: "preset_location_shoot",
    name: "Location Shoot (Preset)",
    items: [
      {item:"Creative brief / shot list received",       owner:"", days:21},
      {item:"Location confirmed",                        owner:"", days:14},
      {item:"Crew booked",                               owner:"", days:14},
      {item:"Shot list approved",                        owner:"", days:7},
      {item:"Talent confirmed",                          owner:"", days:7},
      {item:"Graphic package approved",                  owner:"", days:5},
      {item:"Call sheet distributed",                    owner:"", days:2},
      {item:"Shoot day",                                 owner:"", days:0},
      {item:"Rough cut delivered",                       owner:"", days:-5},
      {item:"Client feedback received",                  owner:"", days:-8},
      {item:"Final delivery",                            owner:"", days:-12},
    ]
  },
  live_broadcast_studio: {
    id: "preset_live_broadcast_studio",
    name: "Live Broadcast: In Studio (Preset)",
    items: [
      {item:"Project kickoff / brief received",     owner:"", days:30},
      {item:"Run of show draft",                    owner:"", days:21},
      {item:"Presenter tech check scheduled",       owner:"", days:21},
      {item:"Graphics / lower thirds approved",     owner:"", days:14},
      {item:"Virtual background / stage approved",  owner:"", days:14},
      {item:"Run of show approved",                 owner:"", days:10},
      {item:"Streaming platform configured",        owner:"", days:10},
      {item:"Presenter decks / slides approved",    owner:"", days:7},
      {item:"Presenter tech checks complete",       owner:"", days:5},
      {item:"Call sheet distributed",               owner:"", days:2},
      {item:"Studio setup / dress rehearsal",       owner:"", days:1},
      {item:"Full run through with presenters",     owner:"", days:0},
      {item:"Event go live",                        owner:"", days:0},
    ]
  },
  webinar: {
    id: "preset_webinar",
    name: "Webinar (Preset)",
    items: [
      {item:"Project kickoff / brief received",     owner:"", days:21},
      {item:"Run of show draft",                    owner:"", days:14},
      {item:"Presenter confirmed",                  owner:"", days:14},
      {item:"Slides / presentation approved",       owner:"", days:7},
      {item:"Streaming platform configured",        owner:"", days:7},
      {item:"Presenter tech check complete",        owner:"", days:3},
      {item:"Promotional materials distributed",    owner:"", days:3},
      {item:"Webinar go live",                      owner:"", days:0},
      {item:"Recording delivered",                  owner:"", days:-2},
    ]
  },
  post_production: {
    id: "preset_post_production",
    name: "Post Production (Preset)",
    items: [
      {item:"Project kickoff / assets received",         owner:"", days:30},
      {item:"First assembly cut",                        owner:"", days:20},
      {item:"Director review",                           owner:"", days:17},
      {item:"Client rough cut review",                   owner:"", days:14},
      {item:"Round 1 feedback received",                 owner:"", days:11},
      {item:"Fine cut / revisions complete",             owner:"", days:8},
      {item:"Picture lock",                              owner:"", days:6},
      {item:"Graphics / motion complete",                owner:"", days:4},
      {item:"Color grade complete",                      owner:"", days:3},
      {item:"Audio mix complete",                        owner:"", days:2},
      {item:"QC / final review",                         owner:"", days:1},
      {item:"Final delivery",                            owner:"", days:0},
    ]
  }
};

function tmplLoad()    { try { return JSON.parse(localStorage.getItem(TMPL_KEY)||"[]"); } catch(e) { return []; } }
function tmplSaveAll(t){ localStorage.setItem(TMPL_KEY, JSON.stringify(t)); }
function tmplDefLoad() { try { return JSON.parse(localStorage.getItem(TMPL_DEF_KEY)||"{}"); } catch(e) { return {}; } }
function tmplDefSave(d){ localStorage.setItem(TMPL_DEF_KEY, JSON.stringify(d)); }

// ── Crew configs ──────────────────────────────────────────────────────────────
var CREW_CFG_KEY = 'slater_crew_configs';

function crewConfigLoad() {
  try { return JSON.parse(localStorage.getItem(CREW_CFG_KEY) || '[]'); } catch(e) { return []; }
}
function crewConfigSave(configs) {
  localStorage.setItem(CREW_CFG_KEY, JSON.stringify(configs));
}

function saveCrewConfig() {
  var roles = crew.map(function(id) {
    var pos = document.getElementById(id + '_position');
    return pos ? pos.value.trim() : '';
  }).filter(function(r) { return r; });
  if (!roles.length) { setStatus("No roles to save. Add some crew members with positions first.", "err"); return; }
  var name = prompt("Config name:");
  if (!name || !name.trim()) return;
  var configs = crewConfigLoad();
  configs.push({ id: "cc_" + Date.now(), name: name.trim(), roles: roles });
  crewConfigSave(configs);
  setStatus("Crew config saved.", "ok");
}

function openCrewConfigManager() {
  document.getElementById("crew-cfg-modal").classList.add("open");
  renderCrewConfigManager();
}

function closeCrewConfigModal() {
  document.getElementById("crew-cfg-modal").classList.remove("open");
}

function renderCrewConfigManager() {
  var body = document.getElementById("crew-cfg-body");
  var foot = document.getElementById("crew-cfg-foot");
  var configs = crewConfigLoad();
  body.innerHTML = "";
  foot.innerHTML = "";

  if (!configs.length) {
    var empty = document.createElement("div");
    empty.style.cssText = "color:#bbb;font-size:13px;font-style:italic;padding:8px 0";
    empty.textContent = "No crew configs yet. Set up your crew positions and click Save config.";
    body.appendChild(empty);
  } else {
    configs.forEach(function(cfg) {
      var row = document.createElement("div"); row.className = "tmpl-row";
      var nameEl = document.createElement("div"); nameEl.className = "tmpl-row-name";
      nameEl.textContent = cfg.name;
      nameEl.title = "Click to rename";
      nameEl.style.cursor = "pointer";
      nameEl.onclick = (function(c) { return function() {
        var newName = prompt("Rename config:", c.name);
        if (!newName || !newName.trim()) return;
        var cfgs = crewConfigLoad();
        var found = cfgs.find(function(x) { return x.id === c.id; });
        if (found) { found.name = newName.trim(); crewConfigSave(cfgs); renderCrewConfigManager(); }
      }; })(cfg);
      var meta = document.createElement("div"); meta.className = "tmpl-row-meta";
      meta.textContent = cfg.roles.length + " roles";
      var loadBtn = document.createElement("button"); loadBtn.className = "lb"; loadBtn.style.fontSize = "11px"; loadBtn.textContent = "Load";
      loadBtn.onclick = (function(c) { return function() { loadCrewConfig(c); }; })(cfg);
      var delBtn = document.createElement("button"); delBtn.className = "lb danger"; delBtn.style.fontSize = "11px"; delBtn.textContent = "Delete";
      delBtn.onclick = (function(c) { return function() {
        if (!confirm("Delete config \"" + c.name + "\"?")) return;
        var cfgs = crewConfigLoad().filter(function(x) { return x.id !== c.id; });
        crewConfigSave(cfgs);
        renderCrewConfigManager();
      }; })(cfg);
      row.appendChild(nameEl); row.appendChild(meta); row.appendChild(loadBtn); row.appendChild(delBtn);
      body.appendChild(row);
    });
  }

  var closeBtn = document.createElement("button"); closeBtn.className = "lb"; closeBtn.textContent = "Close";
  closeBtn.onclick = closeCrewConfigModal;
  foot.appendChild(closeBtn);
}

function loadCrewConfig(config) {
  config.roles.forEach(function(role) {
    addCrew();
    var lastId = crew[crew.length - 1];
    var posField = document.getElementById(lastId + '_position');
    if (posField) posField.value = role;
  });
  closeCrewConfigModal();
  setStatus("Crew config loaded - " + config.roles.length + " roles added.", "ok");
}

// ── Template manager modal ────────────────────────────────────────────────────
let tmplEditing = null; // null = list view, object = builder view

function openTemplateManager() {
  tmplEditing = null;
  document.getElementById("tmpl-modal").classList.add("open");
  renderTmplManager();
}

function closeTmplModal() {
  document.getElementById("tmpl-modal").classList.remove("open");
  tmplEditing = null;
}

function renderTmplManager() {
  const body   = document.getElementById("tmpl-body");
  const foot   = document.getElementById("tmpl-foot");
  const title  = document.getElementById("tmpl-modal-title");
  const tmpls  = tmplLoad();
  const defs   = tmplDefLoad();

  if (tmplEditing !== null) {
    // ── Builder view ──────────────────────────────────────────────────────────
    title.textContent = tmplEditing.id ? "Edit Template" : "New Template";
    body.innerHTML = "";
    foot.innerHTML = "";

    const nameInp = document.createElement("input");
    nameInp.className = "tmpl-name-input"; nameInp.placeholder = "Template name";
    nameInp.value = tmplEditing.name || "";
    nameInp.oninput = function() { tmplEditing.name = this.value; };
    body.appendChild(nameInp);

    const hdr = document.createElement("div");
    hdr.style.cssText = "display:grid;grid-template-columns:1fr 120px 80px auto;gap:8px;padding:0 0 4px;font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.05em";
    hdr.innerHTML = "<span>Deliverable</span><span>Owner</span><span>Days before</span><span></span>";
    body.appendChild(hdr);

    const itemsEl = document.createElement("div"); itemsEl.id = "tmpl-items-list";
    body.appendChild(itemsEl);
    (tmplEditing.items||[]).forEach(function(item, i) { renderTmplItemRow(i, item); });

    const addBtn = document.createElement("button");
    addBtn.className = "ab"; addBtn.style.marginTop = "8px"; addBtn.textContent = "+ Add item";
    addBtn.onclick = function() {
      tmplEditing.items.push({item:"", owner:"", days:0});
      renderTmplItemRow(tmplEditing.items.length-1, tmplEditing.items[tmplEditing.items.length-1]);
    };
    body.appendChild(addBtn);

    const cancelBtn = document.createElement("button"); cancelBtn.className = "lb"; cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function() { tmplEditing = null; renderTmplManager(); };
    const saveBtn = document.createElement("button"); saveBtn.className = "lb primary"; saveBtn.textContent = "Save template";
    saveBtn.onclick = function() { saveTmplEditing(); };
    foot.appendChild(cancelBtn); foot.appendChild(saveBtn);
    return;
  }

  // ── List view ─────────────────────────────────────────────────────────────
  title.textContent = "Workback Templates";
  body.innerHTML = "";
  foot.innerHTML = "";

  // Defaults section
  const defSec = document.createElement("div"); defSec.className = "tmpl-section";
  const defTitle = document.createElement("div"); defTitle.className = "tmpl-section-title"; defTitle.textContent = "Default templates by project type";
  defSec.appendChild(defTitle);
  const defGrid = document.createElement("div"); defGrid.className = "tmpl-defaults";
  ["post_production","location_shoot","live_broadcast_location","live_broadcast_studio","webinar"].forEach(function(type) {
    const card = document.createElement("div"); card.className = "tmpl-default-card";
    const lbl = document.createElement("div"); lbl.className = "tmpl-default-label";
    const _typeLabels = {post_production:"Post Production",location_shoot:"Location Shoot",live_broadcast_location:"Live Broadcast: On Location",live_broadcast_studio:"Live Broadcast: In Studio",webinar:"Webinar"};
    lbl.textContent = _typeLabels[type] || type;
    const defId = defs[type];
    let defName = "None set";
    if (defId) {
      if (defId.startsWith("preset_")) defName = (WB_PRESETS[type] && WB_PRESETS[type].name) || "Preset";
      else { const t = tmpls.find(function(t) { return t.id === defId; }); defName = t ? t.name : "Unknown"; }
    }
    const val = document.createElement("div"); val.className = "tmpl-default-val" + (defId ? "" : " none");
    val.textContent = defName;
    const changeBtn = document.createElement("button"); changeBtn.className = "lb"; changeBtn.style.fontSize = "11px"; changeBtn.textContent = "Change";
    changeBtn.onclick = function() { showSetDefaultModal(type); };
    card.appendChild(lbl); card.appendChild(val); card.appendChild(changeBtn);
    defGrid.appendChild(card);
  });
  defSec.appendChild(defGrid);
  body.appendChild(defSec);

  // Built-in presets
  const presetSec = document.createElement("div"); presetSec.className = "tmpl-section";
  const presetTitle = document.createElement("div"); presetTitle.className = "tmpl-section-title"; presetTitle.textContent = "Built-in presets (read-only)";
  presetSec.appendChild(presetTitle);
  Object.values(WB_PRESETS).forEach(function(preset) {
    const wrapper = document.createElement("div"); wrapper.style.marginBottom = "6px";
    const row = document.createElement("div"); row.className = "tmpl-row"; row.style.marginBottom = "0";
    const name = document.createElement("div"); name.className = "tmpl-row-name"; name.textContent = preset.name;
    const meta = document.createElement("div"); meta.className = "tmpl-row-meta"; meta.textContent = preset.items.length + " items";
    const badge = document.createElement("div"); badge.className = "tmpl-row-badge tmpl-preset-badge"; badge.textContent = "Built-in";
    const panel = document.createElement("div");
    panel.style.cssText = "display:none;background:#f9f9f9;border:1px solid #eee;border-top:none;border-radius:0 0 7px 7px;padding:6px 12px";
    panel.innerHTML = preset.items.map(function(it) {
      var dayLabel = it.days === 0 ? "Event day" : it.days + " days before";
      return '<div style="display:flex;gap:12px;padding:4px 0;font-size:12px;border-bottom:1px solid #f0f0f0">' +
        '<span style="color:#aaa;white-space:nowrap;min-width:100px">' + dayLabel + '</span>' +
        '<span style="color:#1a1a1a">' + (it.item || '') + '</span></div>';
    }).join('');
    const prevBtn = document.createElement("button"); prevBtn.className = "lb"; prevBtn.style.fontSize = "11px"; prevBtn.textContent = "Preview";
    prevBtn.onclick = function() {
      var open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
      prevBtn.textContent = open ? "Preview" : "Hide";
      row.style.borderRadius = open ? "" : "7px 7px 0 0";
      row.style.borderBottom = open ? "" : "none";
    };
    const loadBtn = document.createElement("button"); loadBtn.className = "lb"; loadBtn.style.fontSize = "11px"; loadBtn.textContent = "Load";
    loadBtn.onclick = function() { loadTemplate(preset); closeTmplModal(); };
    const dupBtn = document.createElement("button"); dupBtn.className = "lb"; dupBtn.style.fontSize = "11px"; dupBtn.textContent = "Duplicate";
    dupBtn.onclick = function() { duplicatePreset(preset); };
    row.appendChild(name); row.appendChild(meta); row.appendChild(badge); row.appendChild(prevBtn); row.appendChild(loadBtn); row.appendChild(dupBtn);
    wrapper.appendChild(row); wrapper.appendChild(panel);
    presetSec.appendChild(wrapper);
  });
  body.appendChild(presetSec);

  // Custom templates
  const custSec = document.createElement("div"); custSec.className = "tmpl-section";
  const custTitle = document.createElement("div"); custTitle.className = "tmpl-section-title"; custTitle.textContent = "My templates";
  custSec.appendChild(custTitle);
  if (!tmpls.length) {
    const empty = document.createElement("div"); empty.style.cssText = "color:#bbb;font-size:13px;font-style:italic;padding:8px 0";
    empty.textContent = "No custom templates yet. Save a workback as a template or create one from scratch.";
    custSec.appendChild(empty);
  } else {
    tmpls.forEach(function(tmpl) {
      const row = document.createElement("div"); row.className = "tmpl-row";
      const name = document.createElement("div"); name.className = "tmpl-row-name"; name.textContent = tmpl.name;
      const meta = document.createElement("div"); meta.className = "tmpl-row-meta"; meta.textContent = (tmpl.items||[]).length + " items";
      const loadBtn = document.createElement("button"); loadBtn.className = "lb"; loadBtn.style.fontSize = "11px"; loadBtn.textContent = "Load";
      loadBtn.onclick = (function(t) { return function() { loadTemplate(t); closeTmplModal(); }; })(tmpl);
      const editBtn = document.createElement("button"); editBtn.className = "lb"; editBtn.style.fontSize = "11px"; editBtn.textContent = "Edit";
      editBtn.onclick = (function(t) { return function() { tmplEditing = JSON.parse(JSON.stringify(t)); renderTmplManager(); }; })(tmpl);
      const delBtn = document.createElement("button"); delBtn.className = "lb danger"; delBtn.style.fontSize = "11px"; delBtn.textContent = "Delete";
      delBtn.onclick = (function(t) { return function() {
        const ts = tmplLoad().filter(function(x) { return x.id !== t.id; }); tmplSaveAll(ts);
        const d = tmplDefLoad(); Object.keys(d).forEach(function(k) { if (d[k] === t.id) delete d[k]; }); tmplDefSave(d);
        renderTmplManager();
      }; })(tmpl);
      row.appendChild(name); row.appendChild(meta); row.appendChild(loadBtn); row.appendChild(editBtn); row.appendChild(delBtn);
      custSec.appendChild(row);
    });
  }
  body.appendChild(custSec);

  const newBtn = document.createElement("button"); newBtn.className = "lb primary"; newBtn.textContent = "+ New template";
  newBtn.onclick = function() { tmplEditing = {id:null, name:"", items:[{item:"",owner:"",days:0}]}; renderTmplManager(); };
  const closeBtn = document.createElement("button"); closeBtn.className = "lb"; closeBtn.textContent = "Close";
  closeBtn.onclick = closeTmplModal;
  foot.appendChild(newBtn); foot.appendChild(closeBtn);
}

function renderTmplItemRow(i, item) {
  const list = document.getElementById("tmpl-items-list"); if (!list) return;
  const row = document.createElement("div"); row.className = "tmpl-item-row"; row.id = "tmpl-item-"+i;
  const itemInp = document.createElement("input"); itemInp.type="text"; itemInp.placeholder="Deliverable"; itemInp.value=item.item||"";
  itemInp.oninput = function() { tmplEditing.items[i].item = this.value; };
  const ownInp = document.createElement("input"); ownInp.type="text"; ownInp.placeholder="Owner"; ownInp.value=item.owner||"";
  ownInp.oninput = function() { tmplEditing.items[i].owner = this.value; };
  const daysInp = document.createElement("input"); daysInp.type="number"; daysInp.placeholder="Days"; daysInp.min="-365"; daysInp.max="365"; daysInp.value=item.days===undefined?0:item.days;
  daysInp.oninput = function() { tmplEditing.items[i].days = parseInt(this.value)||0; };
  const delBtn = document.createElement("button"); delBtn.className="rb"; delBtn.innerHTML="&#x2715;";
  delBtn.onclick = function() { tmplEditing.items.splice(i,1); document.getElementById("tmpl-items-list").innerHTML=""; tmplEditing.items.forEach(function(it,j){renderTmplItemRow(j,it);}); };
  row.appendChild(itemInp); row.appendChild(ownInp); row.appendChild(daysInp); row.appendChild(delBtn);
  list.appendChild(row);
}

function saveTmplEditing() {
  if (!tmplEditing.name.trim()) { alert("Please enter a template name."); return; }
  const tmpls = tmplLoad();
  if (tmplEditing.id) {
    const idx = tmpls.findIndex(function(t) { return t.id === tmplEditing.id; });
    if (idx > -1) tmpls[idx] = tmplEditing;
    else tmpls.push(tmplEditing);
  } else {
    tmplEditing.id = "tmpl_" + Date.now();
    tmpls.push(tmplEditing);
  }
  tmplSaveAll(tmpls);
  tmplEditing = null;
  renderTmplManager();
}

function loadTemplate(tmpl) {
  wbLoadItems((tmpl.items||[]).map(function(it) { return {item:it.item, owner:it.owner||"", days:it.days||0, status:"Not Started"}; }));
  wbRecalc();
  setStatus("Loaded template: " + tmpl.name, "ok");
}

function duplicatePreset(preset) {
  const tmpls = tmplLoad();
  const copy = {id:"tmpl_"+Date.now(), name:preset.name.replace(" (Preset)"," (Copy)"), items:JSON.parse(JSON.stringify(preset.items))};
  tmpls.push(copy);
  tmplSaveAll(tmpls);
  tmplEditing = copy;
  renderTmplManager();
}

function saveCurrentAsTemplate() {
  const items = wbGetItems();
  if (!items.length) { setStatus("Nothing in workback to save.", "err"); return; }
  const name = prompt("Template name:");
  if (!name || !name.trim()) return;
  const tmpls = tmplLoad();
  const tmpl = {id:"tmpl_"+Date.now(), name:name.trim(), items:items.map(function(it) { return {item:it.item, owner:it.owner, days:it.days}; })};
  tmpls.push(tmpl);
  tmplSaveAll(tmpls);
  setStatus("Saved as template: " + name.trim(), "ok");
}

function showSetDefaultModal(type) {
  const tmpls = tmplLoad();
  const defs  = tmplDefLoad();
  const label = type === "live_event" ? "Live Event" : type === "live_shoot" ? "Location Shoot" : "Post Production";
  // Build options list
  const options = [{id:"none", name:"None"}];
  Object.values(WB_PRESETS).forEach(function(p) {
    if (p.id === "preset_"+type) options.push({id:p.id, name:p.name});
  });
  tmpls.forEach(function(t) { options.push({id:t.id, name:t.name}); });
  const current = defs[type] || "none";
  const sel = options.find(function(o) { return o.id === current; });
  const chosen = prompt(
    "Set default template for " + label + ":\n\n" +
    options.map(function(o,i) { return (i)+". "+o.name+(o.id===current?" (current)":""); }).join("\n") +
    "\n\nEnter the number:"
  );
  if (chosen === null) return;
  const idx = parseInt(chosen);
  if (isNaN(idx) || !options[idx]) return;
  if (options[idx].id === "none") { delete defs[type]; } else { defs[type] = options[idx].id; }
  tmplDefSave(defs);
  renderTmplManager();
}

// Called from libNew / project type change — offer to load default template
function offerDefaultTemplate(projectType) {
  const defs = tmplDefLoad();
  const defId = defs[projectType];
  if (!defId) return;
  let tmpl = null;
  if (defId.startsWith("preset_")) {
    const key = defId.replace("preset_","");
    tmpl = WB_PRESETS[key];
  } else {
    tmpl = tmplLoad().find(function(t) { return t.id === defId; });
  }
  if (!tmpl) return;
  const _offerLabels = {post_production:"Post Production",location_shoot:"Location Shoot",live_broadcast_location:"Live Broadcast: On Location",live_broadcast_studio:"Live Broadcast: In Studio",webinar:"Webinar"};
  const label = _offerLabels[projectType] || projectType;
  showModal(
    "Load template?",
    "Load the default " + label + " workback template \u201c" + tmpl.name + "\u201d?",
    function() { loadTemplate(tmpl); }
  );
}


// ── Workback day selector + direction ─────────────────────────────────────────
function refreshWbDaySelector() {
  const sel = document.getElementById("wb_day_select");
  if (!sel) return;
  const current = sel.value;
  const days = getScheduleDays();
  const kickoffIso = (document.getElementById("kickoff_date_iso")||{}).value||"";
  sel.innerHTML = "";

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function fmtDateShort(iso) {
    if (!iso) return "";
    const d = new Date(iso+"T12:00:00");
    return " ("+dayNames[d.getDay()]+" "+months[d.getMonth()]+" "+d.getDate()+")";
  }

  const videoDueIso = (document.getElementById("video_due_date_iso")||{}).value||"";

  if (!days.length && !kickoffIso && !videoDueIso) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "— No days added yet —";
    sel.appendChild(opt);
    return;
  }

  // Collect all dated entries and sort most-recent first
  const entries = [];
  if (kickoffIso) entries.push({value:"kickoff", label:"Client Kickoff", iso:kickoffIso});
  if (videoDueIso) entries.push({value:"video_due", label:"Project Due Date", iso:videoDueIso});
  days.forEach(function(day, i) {
    entries.push({value: day.id || ("day_"+i), label: day.label || ("Day "+(i+1)), iso: day.date_iso||""});
  });
  entries.sort(function(a, b) { return a.iso.localeCompare(b.iso); });

  entries.forEach(function(e) {
    const opt = document.createElement("option");
    opt.value = e.value;
    opt.textContent = e.label + (e.iso ? fmtDateShort(e.iso) : "");
    if (current === e.value) opt.selected = true;
    sel.appendChild(opt);
  });

  // Default to most recent day (last in ascending sort) if nothing matched
  if (!sel.value || (!days.find(function(d) { return (d.id||"") === sel.value; }) && current !== "kickoff" && current !== "video_due")) {
    sel.value = sel.options[sel.options.length-1].value;
  }

  wbRecalc();
}


// ── Kickoff row ───────────────────────────────────────────────────────────────

function getKickoffIso() {
  return (document.getElementById("kickoff_date_iso")||{}).value || "";
}




// ── Schedule milestone pins in workback ───────────────────────────────────────
function syncKickoffDate() {
  wbRecalc();
  wbRebuildPins();
}

function getKickoffIso() {
  return (document.getElementById("kickoff_date_iso")||{}).value||"";
}

function getSchedMilestones() {
  var milestones = [];
  var kickoffIso = (document.getElementById("kickoff_date_iso")||{}).value||"";
  var kickoffTime = (document.getElementById("kickoff_time")||{}).value||"";
  if (kickoffIso) {
    milestones.push({id:"kickoff", label:"Client Kickoff", date_iso:kickoffIso, time:kickoffTime, isKickoff:true});
  }
  getScheduleDays().forEach(function(day, i) {
    if (!day.date_iso) return;
    var label = day.label ? day.label : "Day "+(i+1);
    milestones.push({
      id: day.id||"day_"+i,
      label: label,
      date_iso: day.date_iso,
      time: day.call_time||"",
      isKickoff: false,
      schedEntries: day.sched_entries||[],
    });
  });
  // Add video due date if post production
  var videoDueIso = (document.getElementById("video_due_date_iso")||{}).value||"";
  var videoDueTime = (document.getElementById("video_due_time")||{}).value||"";
  if (videoDueIso) {
    milestones.push({id:"video_due", label:"Project Due Date", date_iso:videoDueIso, time:videoDueTime, isKickoff:false, isVideoDue:true});
  }
  milestones.sort(function(a,b) {
    return (a.date_iso+"_"+(a.time||"")).localeCompare(b.date_iso+"_"+(b.time||""));
  });
  return milestones;
}

function wbRebuildPins() {
  // Remove existing pins
  document.querySelectorAll(".wb-pin").forEach(function(el) { el.remove(); });
  var list = document.getElementById("wb-list");
  if (!list) return;
  var milestones = getSchedMilestones();
  refreshSeqAnchorDropdowns();
  if (!milestones.length) return;

  // Get current due dates from values already computed by wbRecalc
  var wbDated = wbItems.map(function(id) {
    var dueEl = document.getElementById(id+"_due");
    var due = (dueEl && dueEl.dataset.iso) || "";
    return {type:"item", id:id, date:due||"9999-99-99"};
  });

  var pinDated = milestones.map(function(m) {
    return {type:"pin", pinId:"pin_"+m.id, milestone:m, date:m.date_iso||"9999-99-99"};
  });

  var combined = wbDated.concat(pinDated).sort(function(a,b) {
    return a.date.localeCompare(b.date);
  });

  combined.forEach(function(entry) {
    if (entry.type === "pin") {
      var m = entry.milestone;
      var pinEl = document.createElement("div");
      pinEl.className = "wb-pin";
      pinEl.id = entry.pinId;
      // Top row: icon + label + date + tag
      var pinTop = document.createElement("div");
      pinTop.style.cssText = "display:flex;align-items:center;gap:10px;width:100%";
      var pinCal = document.createElement("div");
      pinCal.className = "sday-cal sm";
      var pinCalMonth = document.createElement("div");
      pinCalMonth.className = "sday-cal-month";
      var pinCalDay = document.createElement("div");
      pinCalDay.className = "sday-cal-day";
      var months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      if (m.date_iso) {
        var parts = m.date_iso.split("-");
        pinCalMonth.textContent = months[parseInt(parts[1])-1] || "---";
        pinCalDay.textContent = parseInt(parts[2]) || "--";
      } else {
        pinCalMonth.textContent = "---";
        pinCalDay.textContent = "--";
      }
      pinCal.appendChild(pinCalMonth);
      pinCal.appendChild(pinCalDay);
      var lbl = document.createElement("span"); lbl.className = "wb-pin-label";
      lbl.textContent = m.label;
      var dateSpan = document.createElement("span"); dateSpan.className = "wb-pin-date";
      dateSpan.textContent = wbFmtDate(m.date_iso) + (m.time ? " · " + m.time : "");
      var tag = document.createElement("span"); tag.className = "wb-pin-tag";
      tag.textContent = m.isKickoff ? "kickoff" : (m.isVideoDue ? "due date" : "schedule");
      pinTop.appendChild(pinCal); pinTop.appendChild(lbl); pinTop.appendChild(dateSpan); pinTop.appendChild(tag);
      pinEl.appendChild(pinTop);

      // Schedule entries (if any)
      if (m.schedEntries && m.schedEntries.length) {
        var schedWrap = document.createElement("div");
        schedWrap.style.cssText = "margin-top:6px;padding-top:6px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:2px";
        m.schedEntries.forEach(function(e) {
          if (!e.time && !e.desc) return;
          var row = document.createElement("div");
          row.style.cssText = "display:flex;gap:10px;font-size:11px;color:var(--charcoal)";
          var timeSpan = document.createElement("span");
          timeSpan.style.cssText = "min-width:60px;color:var(--film-can);font-weight:600;flex-shrink:0";
          timeSpan.textContent = e.time||"";
          var descSpan = document.createElement("span");
          descSpan.textContent = e.desc||"";
          row.appendChild(timeSpan); row.appendChild(descSpan);
          schedWrap.appendChild(row);
        });
        pinEl.appendChild(schedWrap);
      }
      // Internal only checkbox for pins
      var pinInternalWrap = document.createElement("div");
      pinInternalWrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px;padding:2px 0";
      var pinInternalCb = document.createElement("input");
      pinInternalCb.type = "checkbox"; pinInternalCb.id = entry.pinId+"_internal";
      // Load saved state
      var pinInternalKey = "pin_internal_"+entry.pinId;
      pinInternalCb.checked = (currentSheetKey && localStorage.getItem("slater_pin_"+currentSheetKey+"_"+entry.pinId) === "1")||false;
      pinInternalCb.style.cssText = "accent-color:var(--charcoal);cursor:pointer";
      pinInternalCb.onchange = function() {
        if (currentSheetKey) {
          if (pinInternalCb.checked) localStorage.setItem("slater_pin_"+currentSheetKey+"_"+entry.pinId, "1");
          else localStorage.removeItem("slater_pin_"+currentSheetKey+"_"+entry.pinId);
        }
      };
      var pinInternalLbl = document.createElement("label");
      pinInternalLbl.htmlFor = entry.pinId+"_internal";
      pinInternalLbl.textContent = "Internal only — exclude from exported workback";
      pinInternalLbl.style.cssText = "font-size:11px;color:var(--film-can);cursor:pointer;user-select:none";
      pinInternalWrap.appendChild(pinInternalCb); pinInternalWrap.appendChild(pinInternalLbl);
      pinEl.appendChild(pinInternalWrap);
      list.appendChild(pinEl);
    } else {
      var itemEl = document.getElementById(entry.id);
      if (itemEl) list.appendChild(itemEl);
    }
  });
  rebuildWbDividers();
}

function makeWbInsertDivider(afterEl) {
  var div = document.createElement('div');
  div.className = 'sday-insert wb-insert';
  div.innerHTML = '<div class="sday-insert-line"></div><div class="sday-insert-btn">+</div><div class="sday-insert-line"></div>';
  div.onclick = function() { wbInsertAfterEl(afterEl); };
  return div;
}

function wbInsertAfterEl(afterEl) {
  var afterWbId = null;
  var defaultItem = {};
  if (afterEl) {
    if (afterEl.classList.contains('wb-item')) {
      afterWbId = afterEl.id;
      defaultItem = { mode: 'sequential', seq_days: 1 };
    } else if (afterEl.classList.contains('wb-pin')) {
      var dateMatch = afterEl.id.match(/^pin_(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        defaultItem = { mode: 'manual', manual_date: dateMatch[1] };
      } else {
        defaultItem = { mode: 'sequential', seq_days: 1 };
      }
      var prev = afterEl.previousSibling;
      while (prev) {
        if (prev.classList && prev.classList.contains('wb-item')) { afterWbId = prev.id; break; }
        prev = prev.previousSibling;
      }
    }
  }
  wbAdd(defaultItem, afterWbId);
}

function rebuildWbDividers() {
  var list = document.getElementById('wb-list');
  if (!list) return;
  list.querySelectorAll('.wb-insert').forEach(function(d) { d.remove(); });
  var children = Array.from(list.children);
  list.insertBefore(makeWbInsertDivider(null), children[0] || null);
  children.forEach(function(child) {
    if (child.nextSibling) {
      list.insertBefore(makeWbInsertDivider(child), child.nextSibling);
    } else {
      list.appendChild(makeWbInsertDivider(child));
    }
  });
}


// ── Logo management ───────────────────────────────────────────────────────────
const LOGO_KEY = "slater_logo";

function loadSavedLogo() {
  const img = document.getElementById("li");
  if (img) img.src = "/images/SlaterIcon.svg";
}


// ── One-time migration from wt_ keys to slater_ keys ─────────────────────────
(function migrateLocalStorage() {
  var keyMap = {
    "wt_callsheets":    "slater_callsheets",
    "wt_contacts":      "slater_contacts",
    "wt_wb_templates":  "slater_wb_templates",
    "wt_wb_defaults":   "slater_wb_defaults",
  };
  Object.keys(keyMap).forEach(function(oldKey) {
    var newKey = keyMap[oldKey];
    if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
      console.log("Migrated " + oldKey + " -> " + newKey);
    }
  });
})();


function rebuildScheduleDays() {
  var _isPostProd = (document.getElementById("project_type")||{}).value === "post_production";
  var saved = _isPostProd ? [] : getScheduleDays();
  loadScheduleDays(saved);
}


function syncVideoDueDate() {
  sortVideoDueBlock();
  rebuildInsertDividers();
  refreshWbDaySelector();
  wbRecalc();
  wbRebuildPins();
  autosaveTrigger();
}

function updateVideoDueVisibility() {
  const isPost = (document.getElementById("project_type")||{}).value === "post_production";
  const block = document.getElementById("video-due-block");
  const kickoffDiv = document.getElementById("schedule-kickoff-divider");
  const listEl = document.getElementById("schedule-days-list");
  if (kickoffDiv) kickoffDiv.style.display = isPost ? "" : "none";
  if (block) {
    if (isPost) {
      block.style.display = "";
      if (listEl && block.parentElement !== listEl) {
        // Move into list; sortVideoDueBlock will position it correctly
        listEl.appendChild(block);
      }
      sortVideoDueBlock();
      rebuildInsertDividers();
    } else {
      block.style.display = "none";
      if (listEl && block.parentElement === listEl) {
        listEl.parentElement.insertBefore(block, listEl);
      }
      rebuildInsertDividers();
    }
  }
  // Hide call sheet download button for post production
  const genBtn = document.getElementById("gen-btn");
  const wrap = document.getElementById("gen-btn-wrap");
  if (wrap) wrap.style.gridTemplateColumns = isPost ? "1fr" : "1fr 1fr";
}

function getVideoDueData() {
  return {
    date: (document.getElementById("video_due_date_iso")||{}).value||"",
    time: (document.getElementById("video_due_time")||{}).value||"",
  };
}


// ── JSON Export / Import ──────────────────────────────────────────────────────
async function exportLibrary() {
  setStatus("Preparing export...", "ok");
  var projectList = await API.getProjects();
  if (!projectList) { setStatus("Export failed: could not reach server.", "err"); return; }
  var projects = {};
  for (var i = 0; i < projectList.length; i++) {
    var key = projectList[i].key;
    var result = await API.getProject(key);
    if (!result || !result.data) continue;
    var data = result.data;
    // If server data is minimal (only label/savedAt), fall back to localStorage
    if (!data.project_title && !data.schedule_days && !data.crew) {
      var localDb = libLoad();
      if (localDb[key] && (localDb[key].project_title || localDb[key].schedule_days)) {
        data = localDb[key];
      }
    }
    // Merge receipt images back into expense entries
    var receipts = await API.getReceipts(key);
    if (receipts && receipts.length && data.expenses && data.expenses.length) {
      receipts.forEach(function(r) {
        if (data.expenses[r.expense_index]) {
          data.expenses[r.expense_index].receipt = r.image_data;
        }
      });
    }
    projects[key] = data;
  }
  var contacts = loadContacts();
  var templates = JSON.parse(localStorage.getItem("slater_wb_templates")||"[]");
  var defaults  = JSON.parse(localStorage.getItem("slater_wb_defaults")||"{}");
  var payload = {
    version: 1,
    exported: new Date().toISOString(),
    projects: projects,
    contacts: contacts,
    templates: templates,
    template_defaults: defaults,
  };
  var json = JSON.stringify(payload, null, 2);
  var blob = new Blob([json], {type:"application/json"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "Slater_Backup_" + new Date().toISOString().slice(0,10) + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("Exported " + Object.keys(projects).length + " projects.", "ok");
}

function importLibrary(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var payload = JSON.parse(e.target.result);
      if (!payload.projects) throw new Error("Invalid Slater backup file.");
      var existing = libLoad();
      var existingCount = Object.keys(existing).length;
      var importCount = Object.keys(payload.projects).length;

      // Confirm merge
      var msg = "Import " + importCount + " project(s) from backup?";
      if (existingCount > 0) msg += " This will merge with your " + existingCount + " existing project(s). Existing projects with the same key will be overwritten.";

      if (!confirm(msg)) { input.value = ""; return; }

      // Merge projects
      var merged = Object.assign({}, existing, payload.projects);
      localStorage.setItem("slater_callsheets", JSON.stringify(merged));

      // Save each imported project to the server
      Object.keys(payload.projects).forEach(function(key) {
        var proj = payload.projects[key];
        API.saveProject(key, proj.label || key, proj);
        // Upload receipt images into the receipts table
        if (proj.expenses && proj.expenses.length) {
          proj.expenses.forEach(function(e, i) {
            if (e.receipt) API.saveReceipt(key, i, e.receipt);
          });
        }
      });

      // Merge contacts
      if (payload.contacts) {
        var existingContacts = loadContacts();
        ["staff","crew","talent","locations","companies"].forEach(function(bucket) {
          if (!payload.contacts[bucket]) return;
          if (!existingContacts[bucket]) existingContacts[bucket] = [];
          payload.contacts[bucket].forEach(function(c) {
            var exists = existingContacts[bucket].find(function(x) { return (x.name||"").toLowerCase() === (c.name||"").toLowerCase(); });
            if (!exists) existingContacts[bucket].push(c);
          });
        });
        saveContactsData(existingContacts);
      }

      // Merge templates
      if (payload.templates && payload.templates.length) {
        var existingTmpls = JSON.parse(localStorage.getItem("slater_wb_templates")||"[]");
        payload.templates.forEach(function(t) {
          if (!existingTmpls.find(function(x) { return x.id === t.id; })) existingTmpls.push(t);
        });
        localStorage.setItem("slater_wb_templates", JSON.stringify(existingTmpls));
      }

      // Restore template defaults if not already set
      if (payload.template_defaults) {
        var existingDefs = JSON.parse(localStorage.getItem("slater_wb_defaults")||"{}");
        Object.keys(payload.template_defaults).forEach(function(k) {
          if (!existingDefs[k]) existingDefs[k] = payload.template_defaults[k];
        });
        localStorage.setItem("slater_wb_defaults", JSON.stringify(existingDefs));
      }

      libRefreshDropdown(currentSheetKey||null);
      setStatus("Imported " + importCount + " project(s) successfully.", "ok");
    } catch(err) {
      alert("Import failed: " + err.message);
    }
    input.value = "";
  };
  reader.readAsText(file);
}


// ── Agency Settings ───────────────────────────────────────────────────────────
const AGENCY_KEY = "slater_agency";

// ── Legacy localStorage agency (fallback) ────────────────────────────────────
function loadAgencyData() {
  try { return JSON.parse(localStorage.getItem(AGENCY_KEY)||"{}"); } catch(e) { return {}; }
}

function saveAgencyData(data) {
  try {
    localStorage.setItem(AGENCY_KEY, JSON.stringify(data));
  } catch(e) {
    try {
      var slim = Object.assign({}, data, {logo: ""});
      localStorage.setItem(AGENCY_KEY, JSON.stringify(slim));
    } catch(e2) {}
  }
}

// ── Loaded agencies cache ─────────────────────────────────────────────────────
var _loadedAgencies = [];

function refreshAgencySelector() {
  var sel = document.getElementById("project_agency_id");
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">— No agency —</option>';
  _loadedAgencies.forEach(function(a) {
    var opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name || ("Agency " + a.id);
    if (a.is_default) opt.textContent += " (default)";
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
  // Apply default agency settings for new (unsaved) projects
  if (!current && !currentSheetKey) {
    var def = _loadedAgencies.find(function(a) { return a.is_default; }) || _loadedAgencies[0];
    if (def) {
      sel.value = def.id;
      applyAgencyDefaults(def);
    }
  }
}

function applyAgencyDefaults(agency) {
  if (!agency) return;
  if (agency.timezone && agency.timezone !== "none") {
    var tzEl = document.getElementById("timezone");
    if (tzEl && !tzEl.dataset.userSet) tzEl.value = agency.timezone;
  }
  if (agency.default_project_type && agency.default_project_type !== "none") {
    var ptEl = document.getElementById("project_type");
    if (ptEl && !ptEl.dataset.userSet) {
      ptEl.value = agency.default_project_type;
      updateVideoDueVisibility();
      rebuildScheduleDays();
    }
  }
  // Show agency logo in header
  var agencyWrap = document.getElementById("agency-logo-wrap");
  var agencyImg  = document.getElementById("agency-li");
  if (agency.logo && agencyWrap && agencyImg) {
    agencyImg.src = agency.logo;
    agencyWrap.style.display = "";
  } else if (agencyWrap) {
    agencyWrap.style.display = "none";
  }
}

// ── My Info modal ─────────────────────────────────────────────────────────────
var _myInfoAvatarDirty = false;

function openMyInfo() {
  _myInfoAvatarDirty = false;
  document.getElementById("agency-modal").classList.add("open");
  API.getMe().then(function(data) {
    if (!data) return;
    document.getElementById("myinfo_name").value     = data.name || "";
    document.getElementById("myinfo_dba").value      = data.dba || "";
    document.getElementById("myinfo_phone").value    = formatPhone(data.phone || "");
    document.getElementById("myinfo_email").value    = data.email || "";
    document.getElementById("myinfo_timezone").value = data.timezone || "none";
    if (!_myInfoAvatarDirty) {
      window._myInfoAvatar = data.avatar || null;
      _refreshMyInfoAvatar(data.name || "", data.avatar || null);
    }
  });
}

function _refreshMyInfoAvatar(name, avatar) {
  var preview  = document.getElementById("myinfo-avatar-preview");
  var initials = document.getElementById("myinfo-avatar-initials");
  var removeBtn = document.getElementById("myinfo-avatar-remove");
  if (avatar) {
    if (preview)  { preview.src = avatar; preview.style.display = ""; }
    if (initials) initials.style.display = "none";
    if (removeBtn) removeBtn.style.display = "";
  } else {
    if (preview)  { preview.src = ""; preview.style.display = "none"; }
    if (initials) {
      var parts = name.trim().split(/\s+/);
      var init = parts.length >= 2 ? (parts[0][0]+parts[parts.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
      initials.textContent = init || "?";
      initials.style.display = "flex";
    }
    if (removeBtn) removeBtn.style.display = "none";
  }
}

function triggerAvatarUpload() {
  var input = document.getElementById("myinfo-avatar-input");
  if (input) input.click();
}

function handleAvatarUpload(input) {
  var file = input.files[0];
  if (!file) return;
  _myInfoAvatarDirty = true;
  var reader = new FileReader();
  reader.onload = function(ev) {
    openCropModal(ev.target.result, function(cropped) {
      window._myInfoAvatar = cropped;
      var name = (document.getElementById("myinfo_name")||{}).value || "";
      _refreshMyInfoAvatar(name, cropped);
    });
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function removeAvatar() {
  window._myInfoAvatar = null;
  var name = (document.getElementById("myinfo_name")||{}).value || "";
  _refreshMyInfoAvatar(name, null);
}

// Keep openAgencySettings as alias so any other callers still work
function openAgencySettings() { openMyInfo(); }

function closeAgencySettings() {
  document.getElementById("agency-modal").classList.remove("open");
}

function saveMyInfo() {
  var data = {
    name:     document.getElementById("myinfo_name").value.trim(),
    dba:      document.getElementById("myinfo_dba").value.trim(),
    phone:    document.getElementById("myinfo_phone").value.trim(),
    timezone: document.getElementById("myinfo_timezone").value,
    avatar:   window._myInfoAvatar || null,
  };
  closeAgencySettings();
  API.saveMe(data).then(function(result) {
    if (result) {
      updateSidebarUser(data);
      setStatus("My Info saved.", "ok");
    } else {
      setStatus("Failed to save. Please try again.", "err");
    }
  });
}

// Legacy stub — kept so old callers don't break
function saveAgencySettings() { saveMyInfo(); }

function applyAgencySettings(data) {
  // Called on startup with legacy localStorage data for backwards compat
  if (!data) data = loadAgencyData();
  var agencyWrap = document.getElementById("agency-logo-wrap");
  var agencyImg  = document.getElementById("agency-li");
  if (data.logo && agencyWrap && agencyImg) {
    agencyImg.src = data.logo;
    agencyWrap.style.display = "";
  } else if (agencyWrap) {
    agencyWrap.style.display = "none";
  }
}

// ── Agency Manager modal ──────────────────────────────────────────────────────
var _agencyEditing = null; // null = list view, object = form view

function openAgencyManager() {
  _agencyEditing = null;
  document.getElementById("agency-manager-modal").classList.add("open");
  renderAgencyManager();
}

function closeAgencyManager() {
  document.getElementById("agency-manager-modal").classList.remove("open");
  _agencyEditing = null;
}

function renderAgencyManager() {
  var body = document.getElementById("agency-manager-body");
  var foot = document.getElementById("agency-manager-foot");
  body.innerHTML = "";
  foot.innerHTML = "";

  if (_agencyEditing !== null) {
    // ── Form view ──────────────────────────────────────────────────────────
    var isNew = !_agencyEditing.id;
    var f = _agencyEditing;

    function inp(label, key, placeholder) {
      var wrap = document.createElement("div"); wrap.className = "fl"; wrap.style.marginBottom = "10px";
      var lbl = document.createElement("label"); lbl.textContent = label;
      var el = document.createElement("input"); el.type = "text"; el.placeholder = placeholder||"";
      var isPhone = key.indexOf('phone') !== -1;
      el.value = isPhone ? formatPhone(f[key]||"") : (f[key]||"");
      el.autocomplete = "new-password";
      if (isPhone) el.classList.add("fmt-phone");
      el.style.cssText = "padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;width:100%";
      el.oninput = (function(k){ return function(){ f[k] = this.value; }; })(key);
      wrap.appendChild(lbl); wrap.appendChild(el); return wrap;
    }
    function sel(label, key, opts) {
      var wrap = document.createElement("div"); wrap.className = "fl"; wrap.style.marginBottom = "10px";
      var lbl = document.createElement("label"); lbl.textContent = label;
      var sw = document.createElement("div"); sw.className = "select-wrap";
      var el = document.createElement("select");
      el.style.cssText = "padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;color:var(--text-primary);background:var(--surface);width:100%";
      opts.forEach(function(o) {
        var opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1];
        el.appendChild(opt);
      });
      el.value = f[key]||opts[0][0];
      el.onchange = (function(k){ return function(){ f[k] = this.value; }; })(key);
      sw.appendChild(el); wrap.appendChild(lbl); wrap.appendChild(sw); return wrap;
    }
    function textarea(label, key, placeholder, rows) {
      var wrap = document.createElement("div"); wrap.className = "fl"; wrap.style.marginBottom = "10px";
      var lbl = document.createElement("label"); lbl.textContent = label;
      var el = document.createElement("textarea"); el.rows = rows||3; el.placeholder = placeholder||"";
      el.style.cssText = "padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;width:100%;resize:vertical;line-height:1.5";
      el.value = f[key]||"";
      el.oninput = (function(k){ return function(){ f[k] = this.value; }; })(key);
      wrap.appendChild(lbl); wrap.appendChild(el); return wrap;
    }

    body.appendChild(inp("Agency name", "name", "e.g. Worktank"));
    body.appendChild(inp("Contact name", "contact_name", "Billing contact"));
    body.appendChild(inp("Contact email", "contact_email", "billing@agency.com"));
    body.appendChild(inp("Contact phone", "contact_phone", "206.000.0000"));
    body.appendChild(inp("Address", "address", "123 Main St"));
    var g3 = document.createElement("div"); g3.className = "g3"; g3.style.marginBottom = "10px";
    g3.appendChild(inp("City", "city", "Seattle")); g3.appendChild(inp("State", "state", "WA")); g3.appendChild(inp("Zip", "zip", "98101"));
    body.appendChild(g3);
    body.appendChild(inp("Invoicing email", "invoicing_email", "invoices@agency.com"));
    body.appendChild(textarea("Custom invoicing instructions", "invoicing_text", "Leave blank to use default.", 3));
    body.appendChild(inp("Website", "website", "https://agency.com"));
    body.appendChild(sel("Default project type", "default_project_type", [
      ["location_shoot","Location Shoot"],["post_production","Post Production"],
      ["live_broadcast_location","Live Broadcast: On Location"],
      ["live_broadcast_studio","Live Broadcast: In Studio"],["webinar","Webinar"]
    ]));
    body.appendChild(sel("Timezone", "timezone", [
      ["PT","Pacific Time"],["ET","Eastern Time"],["CT","Central Time"],
      ["MT","Mountain Time"],["AKT","Alaska Time"],["HT","Hawaii Time"],
      ["GMT","Greenwich Mean Time"],["CET","Central European Time"]
    ]));

    // Logo section
    var logoSection = document.createElement("div"); logoSection.className = "fl"; logoSection.style.marginBottom = "10px";
    var logoLabel = document.createElement("label"); logoLabel.textContent = "Agency logo";
    var logoRow = document.createElement("div"); logoRow.style.cssText = "display:flex;align-items:center;gap:10px";
    var logoPreview = document.createElement("img"); logoPreview.id = "agency-form-logo-preview";
    logoPreview.style.cssText = "width:60px;height:60px;object-fit:contain;border-radius:6px;border:1px solid var(--border)";
    logoPreview.style.display = f.logo ? "" : "none";
    if (f.logo) logoPreview.src = f.logo;
    var logoBtns = document.createElement("div"); logoBtns.style.cssText = "display:flex;flex-direction:column;gap:6px";
    function applyAgencyLogo(cropped) {
      f.logo = cropped;
      logoPreview.src = cropped; logoPreview.style.display = "";
      removeLogoBtn.style.display = ""; cropLogoBtn.style.display = "";
    }
    var uploadBtn = document.createElement("button"); uploadBtn.className = "lb"; uploadBtn.style.fontSize = "11px"; uploadBtn.textContent = "Upload logo";
    uploadBtn.onclick = function() { document.getElementById("agency-form-logo-upload").click(); };
    var cropLogoBtn = document.createElement("button"); cropLogoBtn.className = "lb"; cropLogoBtn.style.fontSize = "11px"; cropLogoBtn.textContent = "Crop";
    cropLogoBtn.style.display = f.logo ? "" : "none";
    cropLogoBtn.onclick = function() { if (f.logo) openCropModal(f.logo, applyAgencyLogo); };
    var removeLogoBtn = document.createElement("button"); removeLogoBtn.className = "lb danger"; removeLogoBtn.style.fontSize = "11px"; removeLogoBtn.textContent = "Remove";
    removeLogoBtn.style.display = f.logo ? "" : "none";
    removeLogoBtn.onclick = function() { f.logo = ""; logoPreview.style.display = "none"; removeLogoBtn.style.display = "none"; cropLogoBtn.style.display = "none"; };
    var logoFile = document.createElement("input"); logoFile.type = "file"; logoFile.id = "agency-form-logo-upload";
    logoFile.accept = "image/*"; logoFile.style.display = "none";
    logoFile.onchange = function() {
      var file = this.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) { openCropModal(ev.target.result, applyAgencyLogo); };
      reader.readAsDataURL(file);
      this.value = "";
    };
    logoBtns.appendChild(uploadBtn); logoBtns.appendChild(cropLogoBtn); logoBtns.appendChild(removeLogoBtn);
    logoRow.appendChild(logoPreview); logoRow.appendChild(logoBtns); logoRow.appendChild(logoFile);
    logoSection.appendChild(logoLabel); logoSection.appendChild(logoRow);
    body.appendChild(logoSection);

    // Default checkbox
    var defRow = document.createElement("div"); defRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px";
    var defChk = document.createElement("input"); defChk.type = "checkbox"; defChk.id = "agency-form-default"; defChk.checked = !!f.is_default;
    defChk.onchange = function() { f.is_default = this.checked; };
    var defLbl = document.createElement("label"); defLbl.htmlFor = "agency-form-default"; defLbl.textContent = "Set as default agency"; defLbl.style.fontWeight = "600";
    defRow.appendChild(defChk); defRow.appendChild(defLbl);
    body.appendChild(defRow);

    var cancelBtn = document.createElement("button"); cancelBtn.className = "lb"; cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function() { _agencyEditing = null; renderAgencyManager(); };
    var saveBtn = document.createElement("button"); saveBtn.className = "lb primary"; saveBtn.textContent = isNew ? "Create agency" : "Save changes";
    saveBtn.onclick = function() { saveAgencyForm(); };
    foot.appendChild(cancelBtn); foot.appendChild(saveBtn);
    return;
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (!_loadedAgencies.length) {
    var empty = document.createElement("div");
    empty.style.cssText = "color:#bbb;font-size:13px;font-style:italic;padding:8px 0";
    empty.textContent = "No agencies yet. Add one to get started.";
    body.appendChild(empty);
  } else {
    _loadedAgencies.forEach(function(agency) {
      var row = document.createElement("div"); row.className = "tmpl-row";
      var nameEl = document.createElement("div"); nameEl.className = "tmpl-row-name"; nameEl.textContent = agency.name || "Unnamed agency";
      var meta = document.createElement("div"); meta.className = "tmpl-row-meta"; meta.textContent = [agency.city, agency.state].filter(Boolean).join(", ");
      var defBadge = null;
      if (agency.is_default) {
        defBadge = document.createElement("div"); defBadge.className = "tmpl-row-badge"; defBadge.textContent = "Default";
      }
      var editBtn = document.createElement("button"); editBtn.className = "lb"; editBtn.style.fontSize = "11px"; editBtn.textContent = "Edit";
      editBtn.onclick = (function(a) { return function() { _agencyEditing = JSON.parse(JSON.stringify(a)); renderAgencyManager(); }; })(agency);
      var setDefBtn = document.createElement("button"); setDefBtn.className = "lb"; setDefBtn.style.fontSize = "11px"; setDefBtn.textContent = "Set default";
      setDefBtn.style.display = agency.is_default ? "none" : "";
      setDefBtn.onclick = (function(a) { return function() {
        API.setDefaultAgency(a.id).then(function() {
          return API.getAgencies();
        }).then(function(list) {
          _loadedAgencies = list || [];
          refreshAgencySelector();
          renderAgencyManager();
          var newDef = _loadedAgencies.find(function(ag) { return ag.is_default; }) || _loadedAgencies[0];
          var agencyWrap = document.getElementById("agency-logo-wrap");
          var agencyImg  = document.getElementById("agency-li");
          if (newDef && newDef.logo && agencyWrap && agencyImg) {
            agencyImg.src = newDef.logo;
            agencyWrap.style.display = "";
          } else if (agencyWrap) {
            agencyWrap.style.display = "none";
          }
        });
      }; })(agency);
      var delBtn = document.createElement("button"); delBtn.className = "lb danger"; delBtn.style.fontSize = "11px"; delBtn.textContent = "Delete";
      delBtn.onclick = (function(a) { return function() {
        if (!confirm("Delete agency \"" + a.name + "\"?")) return;
        API.deleteAgency(a.id).then(function() {
          return API.getAgencies();
        }).then(function(list) {
          _loadedAgencies = list || [];
          refreshAgencySelector();
          renderAgencyManager();
        });
      }; })(agency);
      row.appendChild(nameEl); row.appendChild(meta);
      if (defBadge) row.appendChild(defBadge);
      row.appendChild(editBtn); row.appendChild(setDefBtn); row.appendChild(delBtn);
      body.appendChild(row);
    });
  }

  var addBtn = document.createElement("button"); addBtn.className = "lb primary"; addBtn.textContent = "+ Add agency";
  addBtn.onclick = function() {
    _agencyEditing = {id:null, name:"", contact_name:"", contact_email:"", contact_phone:"",
      address:"", city:"", state:"", zip:"", invoicing_email:"", invoicing_text:"",
      default_project_type:"location_shoot", website:"", timezone:"PT", logo:"", is_default:false};
    renderAgencyManager();
  };
  var closeBtn = document.createElement("button"); closeBtn.className = "lb"; closeBtn.textContent = "Close";
  closeBtn.onclick = closeAgencyManager;
  foot.appendChild(addBtn); foot.appendChild(closeBtn);
}

function saveAgencyForm() {
  var f = _agencyEditing;
  if (!f.name || !f.name.trim()) { alert("Agency name is required."); return; }
  var promise = f.id ? API.updateAgency(f.id, f) : API.createAgency(f);
  promise.then(function() {
    return API.getAgencies();
  }).then(function(list) {
    _loadedAgencies = list || [];
    refreshAgencySelector();
    _agencyEditing = null;
    renderAgencyManager();
    setStatus("Agency saved.", "ok");
  });
}

function getAgencyLogoB64() {
  var ag = getAgencyInfo();
  if (!ag || !ag.logo) return null;
  return ag.logo.split(",")[1] || null;
}

function getAgencyInfo() {
  var agencyEl = document.getElementById("project_agency_id");
  var agencyId = agencyEl ? agencyEl.value || null : null;
  if (agencyId && _loadedAgencies.length) {
    var agency = _loadedAgencies.find(function(a) { return String(a.id) === String(agencyId); });
    if (agency) return {
      name:            agency.name,
      address:         agency.address,
      city:            agency.city,
      state:           agency.state,
      zip:             agency.zip,
      phone:           agency.contact_phone,
      billing_contact: agency.contact_name,
      billing_email:   agency.invoicing_email,
      invoicing_text:  agency.invoicing_text,
      logo:            agency.logo,
      timezone:        agency.timezone,
      project_type:    agency.default_project_type,
    };
  }
  if (_loadedAgencies.length) {
    var def = _loadedAgencies.find(function(a) { return a.is_default; }) || _loadedAgencies[0];
    if (def) return {
      name:            def.name,
      address:         def.address,
      city:            def.city,
      state:           def.state,
      zip:             def.zip,
      phone:           def.contact_phone,
      billing_contact: def.contact_name,
      billing_email:   def.invoicing_email,
      invoicing_text:  def.invoicing_text,
      logo:            def.logo,
      timezone:        def.timezone,
      project_type:    def.default_project_type,
    };
  }
  return loadAgencyData();
}

function lookupCompanyLogo(companyName) {
  if (!companyName) return null;
  var db = loadContacts();
  var co = (db.companies||[]).find(function(c) { return (c.name||"").trim().toLowerCase() === (companyName||"").trim().toLowerCase(); });
  if (!co || !co.logo) return null;
  if (co.logo.includes("image/svg")) return null;
  return co.logo.split(",")[1] || null;
}

function updateBrandingPreview() {
  var preview = document.getElementById("branding-logo-preview");
  if (!preview) return;
  var checked = document.querySelector('input[name="doc_branding"]:checked');
  var val = checked ? checked.value : "agency";
  if (val === "slater") {
    preview.src = "data:image/png;base64," + LB64;
    preview.style.display = "";
  } else if (val === "client") {
    var companyEl = document.getElementById("client_company");
    var companyName = companyEl ? companyEl.value.trim() : "";
    var db = loadContacts();
    var co = companyName ? (db.companies||[]).find(function(c) { return (c.name||"").trim().toLowerCase() === companyName.toLowerCase(); }) : null;
    if (co && co.logo) {
      preview.src = co.logo;
      preview.style.display = "";
    } else {
      preview.style.display = "none";
    }
  } else {
    var agData = getAgencyInfo();
    if (agData && agData.logo) {
      preview.src = agData.logo;
      preview.style.display = "";
    } else {
      preview.src = "data:image/png;base64," + LB64;
      preview.style.display = "";
    }
  }
}

function updateBrandingWarning() {
  updateBrandingPreview();
  var warn = document.getElementById("branding-warning");
  if (!warn) return;
  var checked = document.querySelector('input[name="doc_branding"]:checked');
  if (!checked || checked.value !== "client") { warn.style.display = "none"; return; }
  var companyEl = document.getElementById("client_company");
  var companyName = companyEl ? companyEl.value.trim() : "";
  if (!companyName) {
    warn.textContent = "Enter a client company name to use client branding.";
    warn.style.display = "";
    return;
  }
  var db = loadContacts();
  var co = (db.companies||[]).find(function(c) { return (c.name||"").trim().toLowerCase() === companyName.toLowerCase(); });
  if (!co || !co.logo) {
    warn.textContent = "No logo on file for this company. Add one in Contacts.";
    warn.style.display = "";
  } else {
    warn.style.display = "none";
  }
}

function acAttachCompany() {
  var nameEl = document.getElementById("client_company");
  if (!nameEl || nameEl._acCoAttached) return;
  nameEl._acCoAttached = true;
  var wrap = document.createElement("div"); wrap.className = "ac-wrap";
  nameEl.parentNode.insertBefore(wrap, nameEl); wrap.appendChild(nameEl);
  var list = document.createElement("div"); list.className = "ac-list"; wrap.appendChild(list);
  var activeIdx = -1;
  function getMatches(q) {
    var db = loadContacts();
    var entries = db.companies || [];
    if (!q || q.length < 1) return entries.slice(0, 8);
    var ql = q.toLowerCase();
    return entries.filter(function(e) { return (e.name||"").toLowerCase().includes(ql); }).slice(0, 8);
  }
  function render(matches) {
    list.innerHTML = ""; activeIdx = -1;
    if (!matches.length) { list.classList.remove("open"); return; }
    matches.forEach(function(m) {
      var item = document.createElement("div"); item.className = "ac-item";
      item.innerHTML = "<strong>" + (m.name||"") + "</strong>" + (m.website ? "<span>" + m.website + "</span>" : "");
      item.addEventListener("mousedown", function(e) { e.preventDefault(); pick(m); });
      list.appendChild(item);
    });
    list.classList.add("open");
  }
  function pick(m) {
    nameEl.value = m.name || "";
    list.classList.remove("open");
    updateBrandingWarning();
  }
  nameEl.addEventListener("focus", function() { render(getMatches(nameEl.value)); });
  nameEl.addEventListener("input", function() { render(getMatches(nameEl.value)); });
  nameEl.addEventListener("keydown", function(e) {
    var items = list.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") { activeIdx = Math.min(activeIdx+1, items.length-1); items.forEach(function(el,i) { el.classList.toggle("active", i===activeIdx); }); e.preventDefault(); }
    else if (e.key === "ArrowUp") { activeIdx = Math.max(activeIdx-1, 0); items.forEach(function(el,i) { el.classList.toggle("active", i===activeIdx); }); e.preventDefault(); }
    else if (e.key === "Enter" && activeIdx >= 0) { var matches = getMatches(nameEl.value); if (matches[activeIdx]) pick(matches[activeIdx]); e.preventDefault(); }
    else if (e.key === "Escape") list.classList.remove("open");
  });
  nameEl.addEventListener("blur", function() { setTimeout(function() { list.classList.remove("open"); }, 150); });
}

function coLogoUpload(i) {
  var fi = document.getElementById("co-logo-file-" + i);
  if (fi) fi.click();
}

function handleCoLogoUpload(input, i) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var src = e.target.result;
    openCropModal(src, function(cropped) {
      contactsCurrent.companies[i].logo = cropped;
      renderContactsBody();
    });
  };
  reader.readAsDataURL(input.files[0]);
  input.value = "";
}

function coCropLogo(i) {
  var src = contactsCurrent.companies[i] && contactsCurrent.companies[i].logo;
  if (!src) return;
  openCropModal(src, function(cropped) {
    contactsCurrent.companies[i].logo = cropped;
    renderContactsBody();
  });
}

function coRemoveLogo(i) {
  if (contactsCurrent.companies[i]) contactsCurrent.companies[i].logo = "";
  renderContactsBody();
}


// ── Logo crop ─────────────────────────────────────────────────────────────────
var _cropSrc = null;
var _cropCallback = null;
var _cropDragging = false;
var _cropResizing = false;
var _cropStartX = 0, _cropStartY = 0;
var _cropBoxX = 0, _cropBoxY = 0, _cropBoxSize = 0;

function openCropModal(src, callback) {
  _cropCallback = callback || null;
  if (!src) {
    const preview = document.getElementById("agency-logo-preview");
    src = preview.dataset.pending || preview.src;
  }
  if (!src) return;
  _cropSrc = src;

  const img = document.getElementById("crop-img");
  img.src = src;
  img.onload = function() {
    const container = document.getElementById("crop-container");
    // Size container to fit image (max 480px wide)
    const maxW = 480;
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const dispW = Math.round(img.naturalWidth * scale);
    const dispH = Math.round(img.naturalHeight * scale);
    container.style.width = dispW + "px";
    container.style.height = dispH + "px";
    img.style.width = dispW + "px";
    img.style.height = dispH + "px";

    // Initial crop box — centered square, 60% of shorter side
    const boxSize = Math.round(Math.min(dispW, dispH) * 0.6);
    _cropBoxSize = boxSize;
    _cropBoxX = Math.round((dispW - boxSize) / 2);
    _cropBoxY = Math.round((dispH - boxSize) / 2);
    updateCropBox();
  };

  document.getElementById("crop-modal").classList.add("open");
  setupCropEvents();
}

function closeCropModal() {
  document.getElementById("crop-modal").classList.remove("open");
}

function updateCropBox() {
  const box = document.getElementById("crop-box");
  const container = document.getElementById("crop-container");
  const cW = parseInt(container.style.width);
  const cH = parseInt(container.style.height);
  // Clamp
  _cropBoxX = Math.max(0, Math.min(_cropBoxX, cW - _cropBoxSize));
  _cropBoxY = Math.max(0, Math.min(_cropBoxY, cH - _cropBoxSize));
  _cropBoxSize = Math.max(40, Math.min(_cropBoxSize, Math.min(cW - _cropBoxX, cH - _cropBoxY)));
  box.style.left   = _cropBoxX + "px";
  box.style.top    = _cropBoxY + "px";
  box.style.width  = _cropBoxSize + "px";
  box.style.height = _cropBoxSize + "px";
}

function setupCropEvents() {
  const box     = document.getElementById("crop-box");
  const handle  = document.getElementById("crop-handle");
  const container = document.getElementById("crop-container");

  box.onmousedown = function(e) {
    if (e.target === handle) return;
    _cropDragging = true;
    _cropStartX = e.clientX - _cropBoxX;
    _cropStartY = e.clientY - _cropBoxY;
    e.preventDefault();
  };

  handle.onmousedown = function(e) {
    _cropResizing = true;
    _cropStartX = e.clientX;
    _cropStartY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
  };

  document.onmousemove = function(e) {
    if (_cropDragging) {
      _cropBoxX = e.clientX - _cropStartX;
      _cropBoxY = e.clientY - _cropStartY;
      updateCropBox();
    }
    if (_cropResizing) {
      const dx = e.clientX - _cropStartX;
      const dy = e.clientY - _cropStartY;
      const delta = Math.max(dx, dy);
      _cropBoxSize = Math.max(40, _cropBoxSize + delta);
      _cropStartX = e.clientX;
      _cropStartY = e.clientY;
      updateCropBox();
    }
  };

  document.onmouseup = function() {
    _cropDragging = false;
    _cropResizing = false;
  };
}

function applyCrop() {
  const img = document.getElementById("crop-img");
  const container = document.getElementById("crop-container");
  const canvas = document.getElementById("crop-canvas");
  const dispW = parseInt(container.style.width);
  const scaleX = img.naturalWidth / dispW;
  const scaleY = img.naturalHeight / parseInt(container.style.height);

  // Output at 240x240
  const OUTPUT = 240;
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    _cropBoxX * scaleX, _cropBoxY * scaleY,
    _cropBoxSize * scaleX, _cropBoxSize * scaleY,
    0, 0, OUTPUT, OUTPUT
  );

  const cropped = canvas.toDataURL("image/png");
  if (_cropCallback) {
    _cropCallback(cropped);
    _cropCallback = null;
  } else {
    const preview = document.getElementById("agency-logo-preview");
    preview.src = cropped;
    preview.dataset.pending = cropped;
  }
  closeCropModal();
}


// ── Autosave ──────────────────────────────────────────────────────────────────
var _autosaveTimer = null;
var _autosaveDelay = 10000; // 10 seconds after last change
var _navigating = false; // true while switching projects via sidebar

function autosaveTrigger() {
  if (_navigating) return;
  if (!currentSheetKey) return; // only autosave existing projects
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(function() {
    autosaveNow();
  }, _autosaveDelay);
}

function autosaveNow() {
  if (!currentSheetKey) return;
  var data = gather();
  var db = libLoad();
  if (!db[currentSheetKey]) return;
  data.label = db[currentSheetKey].label || libLabel(data);
  data.savedAt = Date.now();
  var ne = document.getElementById("note-editor");
  data._note_draft = ne ? ne.innerHTML : "";
  var expenses = data.expenses || [];
  saveReceipts(currentSheetKey, expenses);
  data.expenses = expenses.map(function(e) { return Object.assign({}, e, {receipt:""}); });
  db[currentSheetKey] = data;
  libSaveAll(db);
  _allProjectsCache[currentSheetKey] = { label: data.label, data: data };
  mergeContactsFromSheet(data);
  showAutosaveIndicator();
  // Also save to server
  API.saveProject(currentSheetKey, data.label, data).then(function(result) {
    if (result) console.log("Autosaved to server:", currentSheetKey);
    else console.warn("Server autosave failed, localStorage only");
  });
}

function showAutosaveIndicator() {
  var ind = document.getElementById("autosave-indicator");
  if (!ind) return;
  var now = new Date();
  var t = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}).toLowerCase();
  ind.innerHTML = "Autosaved at:<br>" + t;
  ind.classList.add("show");
  clearTimeout(ind._hideTimer);
  ind._hideTimer = setTimeout(function() { ind.classList.remove("show"); }, 4000);
}


function updateNoteDraftIndicator(content) {
  var ind = document.getElementById("note-draft-indicator");
  if (!ind) return;
  var hasContent = content && content.trim() && content.trim() !== "<br>";
  ind.classList.toggle("show", !!hasContent);
}


function updateWbItemStyle(id) {
  const el = document.getElementById(id);
  const statusEl = document.getElementById(id+"_status");
  if (!el || !statusEl) return;
  el.classList.toggle("complete", statusEl.value === "Complete");
}

function updateAllWbItemStyles() {
  wbItems.forEach(function(id) { updateWbItemStyle(id); });
}


// ── Schedule day location + show blacks ──────────────────────────────────────
function checkShowBlacks(dayId) {
  // "Show blacks required" is now managed in the day staff modal — nothing to do here
}

function triggerSunLookup(dayId) {
  var inp = document.getElementById(dayId+"_loc_id");
  if (!inp || !inp.value) return;
  var loc = getLocByName(inp.value);
  if (!loc || !loc.address) return;
  var iso = (document.getElementById(dayId+"_date_iso")||{}).value||"";
  var addr = [loc.address, loc.city, loc.state].filter(Boolean).join(", ");
  if (addr && iso) lookupSunForDayWithAddr(dayId, iso, addr);
}

function lookupSunForDayWithAddr(dayId, iso, addr) {
  var statusEl = document.getElementById(dayId+"_sun_status");
  if (!iso || !addr) return;
  if (statusEl) statusEl.textContent = "Looking up sun times...";
  geocode(addr).then(function(coords) {
    return fetchSun(coords.lat, coords.lng, iso);
  }).then(function(result) {
    var sr = document.getElementById(dayId+"_sunrise");
    var ss = document.getElementById(dayId+"_sunset");
    if (sr && result.sunrise) sr.value = f12(result.sunrise);
    if (ss && result.sunset)  ss.value = f12(result.sunset);
    if (statusEl) statusEl.textContent = "Sun times updated.";
  }).catch(function() {
    if (statusEl) statusEl.textContent = "Could not fetch sun times.";
    var sr = document.getElementById(dayId+"_sunrise");
    var ss = document.getElementById(dayId+"_sunset");
    if (sr) sr.value = "";
    if (ss) ss.value = "";
  });
}

function refreshSchedLocDropdowns() {
  scheduleDays.forEach(function(dayId) {
    checkShowBlacks(dayId);
    triggerSunLookup(dayId);
  });
}




// ── Expenses ──────────────────────────────────────────────────────────────────
var expenses = [];
var EXP_CATS = ["Meals","Transportation","Equipment","Lodging","Supplies","Venue","Other"];

function fmtCurrencyVal(val) {
  var n = parseFloat(String(val).replace(/[^\d.]/g, "")) || 0;
  if (!n) return "";
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function addExpense(data) {
  data = data || {};
  const id = "exp_"+(++_uid);
  expenses.push(id);

  const card = document.createElement("div");
  card.className = "exp-card"; card.id = id;

  // Header row
  const hdr = document.createElement("div"); hdr.className = "exp-header";
  const dateInp = document.createElement("input"); dateInp.type = "date";
  dateInp.id = id+"_date"; dateInp.value = data.date||"";
  dateInp.className = "exp-date";
  dateInp.style.cssText = "padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit;color:var(--text-primary);background:var(--surface)";
  dateInp.onchange = function() { updateExpTotals(); };

  const vendorInp = document.createElement("input"); vendorInp.type = "text";
  vendorInp.id = id+"_vendor"; vendorInp.placeholder = "Vendor / description";
  vendorInp.value = data.vendor||""; vendorInp.className = "exp-vendor";
  vendorInp.style.cssText = "padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:14px;font-family:inherit;font-weight:600;flex:1;background:var(--surface);color:var(--text-primary)";

  const amtInp = document.createElement("input"); amtInp.type = "text";
  amtInp.id = id+"_amount"; amtInp.placeholder = "0.00"; amtInp.inputMode = "decimal";
  amtInp.value = data.amount ? fmtCurrencyVal(data.amount) : ""; amtInp.className = "exp-amount";
  amtInp.style.cssText = "padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:16px;font-family:inherit;font-weight:700;width:90px;text-align:right;background:var(--surface);color:var(--text-primary)";
  amtInp.oninput = function() { updateExpTotals(); };
  amtInp.onfocus = function() { var raw = parseFloat(this.value.replace(/[^\d.]/g,""))||""; this.value = raw || ""; };
  amtInp.onblur = function() { if (this.value) this.value = fmtCurrencyVal(this.value); updateExpTotals(); };

  const removeBtn = document.createElement("button"); removeBtn.className = "rb";
  removeBtn.innerHTML = "&#x2715;"; removeBtn.title = "Remove expense";
  removeBtn.onclick = function() {
    var _vendor = (document.getElementById(id+"_vendor")||{}).value || "this expense";
    showModal("Remove expense", "Remove \""+_vendor+"\"? This cannot be undone.", function() {
      expenses = expenses.filter(function(e) { return e !== id; });
      card.remove(); updateExpTotals();
    });
  };

  hdr.appendChild(dateInp); hdr.appendChild(vendorInp);
  hdr.appendChild(amtInp); hdr.appendChild(removeBtn);
  card.appendChild(hdr);

  // Fields row: category, paid by, reimbursable
  const fields = document.createElement("div"); fields.className = "exp-fields";

  const catWrap = document.createElement("div"); catWrap.className = "fl";
  const catLbl = document.createElement("label"); catLbl.textContent = "Category";
  const catSel = document.createElement("select"); catSel.id = id+"_cat";
  catSel.style.cssText = "width:100%;padding:6px 28px 6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit";
  EXP_CATS.forEach(function(c) {
    const opt = document.createElement("option"); opt.value = c; opt.textContent = c;
    if (c === (data.cat||"Meals")) opt.selected = true;
    catSel.appendChild(opt);
  });
  catSel.onchange = function() { updateExpTotals(); };
  catWrap.appendChild(catLbl); catWrap.appendChild(catSel); fields.appendChild(catWrap);

  const paidWrap = document.createElement("div"); paidWrap.className = "fl";
  const paidLbl = document.createElement("label"); paidLbl.textContent = "Paid by";
  const paidInp = document.createElement("input"); paidInp.type = "text";
  paidInp.id = id+"_paidby"; paidInp.placeholder = "Name";
  paidInp.value = data.paid_by||"";
  paidInp.style.cssText = "width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit";
  paidWrap.appendChild(paidLbl); paidWrap.appendChild(paidInp); fields.appendChild(paidWrap);
  card.appendChild(fields);

  // Reimbursable + receipt row
  const bottomRow = document.createElement("div"); bottomRow.className = "exp-receipt";

  const reimbWrap = document.createElement("div"); reimbWrap.className = "exp-reimb";
  reimbWrap.style.flex = "1";
  const reimbCb = document.createElement("input"); reimbCb.type = "checkbox";
  reimbCb.id = id+"_reimb"; if (data.reimbursable) reimbCb.checked = true;
  reimbCb.onchange = function() { updateExpTotals(); };
  const reimbLbl = document.createElement("label"); reimbLbl.textContent = "Reimbursable";
  reimbLbl.htmlFor = id+"_reimb";
  reimbWrap.appendChild(reimbCb); reimbWrap.appendChild(reimbLbl);
  bottomRow.appendChild(reimbWrap);

  // Receipt upload
  const receiptWrap = document.createElement("div");
  receiptWrap.style.cssText = "display:flex;align-items:center;gap:8px";
  const fileInp = document.createElement("input"); fileInp.type = "file";
  fileInp.id = id+"_receipt_file"; fileInp.accept = "image/*,application/pdf";
  fileInp.style.display = "none";
  fileInp.onchange = function() { handleReceiptUpload(id, this); };

  const thumb = document.createElement("div"); thumb.id = id+"_receipt_thumb";
  if (data.receipt) {
    const wrap = document.createElement("div"); wrap.className = "exp-receipt-thumb-wrap";
    const img = document.createElement("img"); img.className = "exp-receipt-thumb";
    img.src = data.receipt; img.onclick = function() { fileInp.click(); };
    const prevBtn = document.createElement("button"); prevBtn.className = "exp-receipt-preview-btn";
    prevBtn.title = "Preview receipt"; prevBtn.innerHTML = "&#128065;";
    prevBtn.onclick = function(e) { e.stopPropagation(); openReceiptModal(document.getElementById(id+"_receipt_data").value); };
    wrap.appendChild(img); wrap.appendChild(prevBtn); thumb.appendChild(wrap);
    const mobileBtns = document.createElement("div"); mobileBtns.className = "exp-receipt-mobile-btns"; mobileBtns.id = id+"_receipt_mobile_btns";
    const mView = document.createElement("button"); mView.className = "gb"; mView.style.cssText = "font-size:11px;margin:0;padding:6px 12px";
    mView.textContent = "View"; mView.onclick = function() { openReceiptModal(document.getElementById(id+"_receipt_data").value); };
    const mReplace = document.createElement("button"); mReplace.className = "lb"; mReplace.style.cssText = "font-size:11px;margin:0;padding:6px 12px";
    mReplace.textContent = "Replace"; mReplace.onclick = function() { fileInp.click(); };
    mobileBtns.appendChild(mView); mobileBtns.appendChild(mReplace); receiptWrap.appendChild(mobileBtns);
  } else {
    const ph = document.createElement("div"); ph.className = "exp-receipt-placeholder";
    ph.innerHTML = "&#128247;<br>Add<br>receipt"; ph.onclick = function() { fileInp.click(); };
    thumb.appendChild(ph);
  }
  const receiptHidden = document.createElement("input");
  receiptHidden.type = "hidden"; receiptHidden.id = id+"_receipt_data";
  receiptHidden.value = data.receipt||"";
  receiptWrap.appendChild(fileInp); receiptWrap.appendChild(receiptHidden); receiptWrap.appendChild(thumb);
  bottomRow.appendChild(receiptWrap);
  card.appendChild(bottomRow);

  document.getElementById("expense-list").appendChild(card);
  updateExpTotals();
}

function handleReceiptUpload(id, input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const src = e.target.result;
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = function() {
        const MAX = 1200;
        const scale = img.width > MAX ? MAX / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        setReceiptThumb(id, compressed);
        // Try OCR
        ocrReceipt(id, compressed);
      };
      img.src = src;
    } else {
      setReceiptThumb(id, src);
    }
  };
  reader.readAsDataURL(file);
}

function ocrReceipt(id, imageData) {
  // Show scanning indicator
  var vendorEl = document.getElementById(id+"_vendor");
  if (vendorEl) { vendorEl.placeholder = "Scanning receipt..."; }

  fetch('/api/ocr', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({image_data: imageData})
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) { console.warn("OCR failed:", data.error); return; }
    // Auto-populate fields if they are empty
    var vendorEl  = document.getElementById(id+"_vendor");
    var dateEl    = document.getElementById(id+"_date");
    var amountEl  = document.getElementById(id+"_amount");
    var catEl     = document.getElementById(id+"_cat");
    if (vendorEl  && !vendorEl.value  && data.vendor)   vendorEl.value  = data.vendor;
    if (dateEl    && !dateEl.value    && data.date)      dateEl.value    = data.date;
    if (amountEl  && !amountEl.value  && data.amount)    amountEl.value  = fmtCurrencyVal(data.amount);
    if (catEl     && data.category)                      catEl.value     = data.category;
    if (vendorEl) vendorEl.placeholder = "Vendor / description";
    updateExpTotals();
  })
  .catch(function(err) {
    console.warn("OCR error:", err);
    var vendorEl = document.getElementById(id+"_vendor");
    if (vendorEl) vendorEl.placeholder = "Vendor / description";
  });
}

function setReceiptThumb(id, src) {
  const thumb = document.getElementById(id+"_receipt_thumb");
  if (!thumb) return;
  thumb.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "exp-receipt-thumb-wrap";
  const img = document.createElement("img"); img.className = "exp-receipt-thumb";
  img.src = src; img.onclick = function() { var f = document.getElementById(id+"_receipt_file"); if (f) f.click(); };
  const prevBtn = document.createElement("button"); prevBtn.className = "exp-receipt-preview-btn";
  prevBtn.title = "Preview receipt"; prevBtn.innerHTML = "&#128065;";
  prevBtn.onclick = function(e) { e.stopPropagation(); openReceiptModal(src); };
  wrap.appendChild(img); wrap.appendChild(prevBtn); thumb.appendChild(wrap);
  var existingMobile = document.getElementById(id+"_receipt_mobile_btns");
  if (existingMobile) existingMobile.remove();
  const mobileBtns = document.createElement("div"); mobileBtns.className = "exp-receipt-mobile-btns"; mobileBtns.id = id+"_receipt_mobile_btns";
  const mView = document.createElement("button"); mView.className = "gb"; mView.style.cssText = "font-size:11px;margin:0;padding:6px 12px";
  mView.textContent = "View"; mView.onclick = function() { openReceiptModal(src); };
  const mReplace = document.createElement("button"); mReplace.className = "lb"; mReplace.style.cssText = "font-size:11px;margin:0;padding:6px 12px";
  mReplace.textContent = "Replace"; mReplace.onclick = function() { var f = document.getElementById(id+"_receipt_file"); if (f) f.click(); };
  mobileBtns.appendChild(mView); mobileBtns.appendChild(mReplace);
  if (thumb.parentElement) thumb.parentElement.appendChild(mobileBtns);
  // Store in hidden input for reliable persistence
  const hidden = document.getElementById(id+"_receipt_data");
  if (hidden) hidden.value = src;
}

function openReceiptModal(src) {
  document.getElementById("exp-receipt-fullsize").src = src;
  document.getElementById("exp-receipt-modal").classList.add("open");
}

function closeReceiptModal() {
  document.getElementById("exp-receipt-modal").classList.remove("open");
  document.getElementById("exp-receipt-fullsize").src = "";
}

function getExpenses() {
  return expenses.map(function(id) {
    const card = document.getElementById(id);
    return {
      date:         (document.getElementById(id+"_date")||{}).value||"",
      vendor:       (document.getElementById(id+"_vendor")||{}).value||"",
      amount:       parseFloat(((document.getElementById(id+"_amount")||{}).value||"0").replace(/[^\d.]/g,""))||0,
      cat:          (document.getElementById(id+"_cat")||{}).value||"Other",
      paid_by:      (document.getElementById(id+"_paidby")||{}).value||"",
      reimbursable: (document.getElementById(id+"_reimb")||{}).checked||false,
      receipt:      (document.getElementById(id+"_receipt_data")||{}).value||"",
    };
  });
}

function loadExpenses(items) {
  document.getElementById("expense-list").innerHTML = "";
  expenses = [];
  document.getElementById("expense-totals").style.display = "none";
  document.getElementById("exp-total").textContent = "$0.00";
  document.getElementById("exp-reimbursable").textContent = "$0.00";
  document.getElementById("exp-by-cat").innerHTML = "";
  (items||[]).forEach(function(item) { addExpense(item); });
  // Load receipts from server if we have a project key
  if (currentSheetKey) {
    API.getReceipts(currentSheetKey).then(function(rows) {
      if (!rows || !rows.length) return;
      rows.forEach(function(row) {
        var id = expenses[row.expense_index];
        if (id) setReceiptThumb(id, row.image_data);
      });
    });
  }
}

function updateExpTotals() {
  const items = getExpenses();
  if (!items.length) {
    document.getElementById("expense-totals").style.display = "none";
  document.getElementById("exp-download-row").style.display = "none";
  return;
  }
  document.getElementById("expense-totals").style.display = "";
  document.getElementById("exp-download-row").style.display = "flex";
  const total = items.reduce(function(s,e) { return s + e.amount; }, 0);
  const reimb = items.filter(function(e) { return e.reimbursable; }).reduce(function(s,e) { return s + e.amount; }, 0);
  document.getElementById("exp-total").textContent = "$" + total.toFixed(2);
  document.getElementById("exp-reimbursable").textContent = "$" + reimb.toFixed(2);
  // By category
  const cats = {};
  items.forEach(function(e) { cats[e.cat] = (cats[e.cat]||0) + e.amount; });
  document.getElementById("exp-by-cat").innerHTML = Object.keys(cats).map(function(k) {
    return "<span style='color:var(--charcoal);font-weight:600'>" + k + ":</span> $" + cats[k].toFixed(2);
  }).join("<br>");
}


// ── Note list indent/outdent helpers ─────────────────────────────────────────
function noteIndentLi(li) {
  var prev = li.previousElementSibling;
  if (!prev) return;
  var subList = prev.querySelector("ul, ol");
  if (!subList) {
    subList = document.createElement(li.parentNode.tagName.toLowerCase());
    prev.appendChild(subList);
  }
  subList.appendChild(li);
  noteRestoreCursor(li);
}

function noteOutdentLi(li) {
  var parentList = li.parentNode;
  var grandLi = parentList.parentNode;
  if (!grandLi || grandLi.tagName !== "LI") return;
  grandLi.parentNode.insertBefore(li, grandLi.nextSibling);
  if (parentList.children.length === 0) parentList.remove();
  noteRestoreCursor(li);
}

function noteRestoreCursor(li) {
  var sel = window.getSelection();
  var range = document.createRange();
  range.selectNodeContents(li);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Note image paste handling ─────────────────────────────────────────────────
function initNoteEditorPaste() {
  const editor = document.getElementById("note-editor");
  if (!editor || editor._pasteWired) return;
  editor._pasteWired = true;

  editor.addEventListener("keydown", function(e) {
    if (e.key === "Tab") {
      var selection = window.getSelection();
      if (!selection.rangeCount) return;
      var node = selection.getRangeAt(0).startContainer;
      var li = null;
      var el = node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== editor) {
        if (el.tagName === "LI") { li = el; break; }
        el = el.parentNode;
      }
      if (li) {
        e.preventDefault();
        if (e.shiftKey) { noteOutdentLi(li); } else { noteIndentLi(li); }
      }
    }
  });

  editor.addEventListener("paste", function(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = function(ev) {
          // Compress to max 1200px
          const img = new Image();
          img.onload = function() {
            const MAX = 1200;
            const scale = img.width > MAX ? MAX / img.width : 1;
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL("image/jpeg", 0.85);
            insertNoteImage(b64);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  });
}

function insertNoteImage(src) {
  const editor = document.getElementById("note-editor");
  if (!editor) return;
  const img = document.createElement("img");
  img.src = src;
  img.onclick = function() { openNoteImgModal(src); };
  // Insert at cursor position
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.appendChild(img);
  }
  updateNoteDraftIndicator(editor.innerHTML);
}

function openNoteImgModal(src) {
  document.getElementById("note-img-fullsize").src = src;
  document.getElementById("note-img-modal").classList.add("open");
}

function closeNoteImgModal() {
  document.getElementById("note-img-modal").classList.remove("open");
  document.getElementById("note-img-fullsize").src = "";
}

// Wire click on images in saved notes to open modal
function wireNoteImages() {
  document.querySelectorAll(".note-body img").forEach(function(img) {
    img.onclick = function() { openNoteImgModal(img.src); };
    img.style.cursor = "pointer";
  });
}


// ── Expense Report Word Doc ───────────────────────────────────────────────────
async function generateExpenseDoc() {
  const btn = document.getElementById("exp-docx-btn");
  btn.disabled = true; btn.textContent = "Building...";
  try {
    const data = gather();
    const ag = getAgencyInfo();
    const items = getExpenses();
    if (!items.length) { setStatus("No expenses to export.", "err"); btn.disabled=false; btn.textContent="Download expense report (.docx)"; return; }

    const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,
           AlignmentType,WidthType,BorderStyle,ShadingType,VerticalAlign,Header,Footer,
           SimpleField,TabStopType,TabStopPosition} = window.docx;

    const bdr = {style:BorderStyle.SINGLE,size:4,color:"AAAAAA"};
    const lbs = {top:bdr,bottom:bdr,left:bdr,right:bdr};
    const nils = {top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideH:{style:BorderStyle.NONE},insideV:{style:BorderStyle.NONE}};
    const CM = {top:80,bottom:80,left:120,right:120};
    const DXA = WidthType.DXA;

    function tx(text, opts) {
      opts = opts||{};
      return new TextRun({text:String(text||""), bold:opts.b||false, size:opts.s||18,
        color:opts.c||"000000", font:opts.font||"Calibri", italics:opts.i||false});
    }
    function pr(children, opts) {
      opts = opts||{};
      return new Paragraph({children:children, alignment:opts.a||AlignmentType.LEFT, spacing:opts.spacing||{after:60}});
    }
    function cell(children, opts) {
      opts = opts||{};
      return new TableCell({borders:lbs, width:{size:opts.w||2000,type:DXA}, margins:CM,
        shading:opts.fill?{fill:opts.fill,type:ShadingType.CLEAR}:undefined, children:children});
    }

    // ── Header — matches workback/call sheet style ────────────────────────────
    const _agencyLogo3 = getAgencyLogoB64();
    const _agencyLogoData3 = loadAgencyData();
    const _isSvg3 = _agencyLogoData3.logo && _agencyLogoData3.logo.includes("image/svg");
    const _agencyB643 = (!_isSvg3 && _agencyLogo3) ? _agencyLogo3 : LB64;
    var _logoB643 = _agencyB643;
    if (data.doc_branding === "slater") { _logoB643 = LB64; }
    else if (data.doc_branding === "client") { var _cl3 = lookupCompanyLogo(data.client_company); if (_cl3) _logoB643 = _cl3; else console.warn("Client branding: no logo for", data.client_company); }
    const lb3 = b64u8(_logoB643);
    const logo3 = new ImageRun({data:lb3, transformation:{width:96,height:96}, type:"png"});

    // Header: matches workback style — logo left, project info right
    const nilsHdr = {top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL}};
    const logoRow3 = new TableRow({height:{value:1834}, children:[
      new TableCell({
        borders: nilsHdr,
        width:{size:1544,type:DXA},
        verticalAlign:VerticalAlign.CENTER,
        margins:CM,
        children:[pr([logo3])],
      }),
      new TableCell({
        borders: nilsHdr,
        width:{size:9246,type:DXA},
        verticalAlign:VerticalAlign.CENTER,
        margins:{top:58,bottom:58,left:200,right:58},
        children:[
          pr([tx(data.project_title||"",{b:true,s:36,c:"262626"})],{spacing:{after:0}}),
          pr([tx([ag.name, ag.billing_contact, data.billing_code ? "Billing Code: "+data.billing_code : ""].filter(Boolean).join(" | ")||"",{s:18,c:"7F7F7F"})]),
          pr([tx((function(){
            var d = new Date(); var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            var day = d.getDate(); var suffix = day===1||day===21||day===31?"st":day===2||day===22?"nd":day===3||day===23?"rd":"th";
            return months[d.getMonth()]+" "+day+suffix+", "+d.getFullYear();
          })(),{s:16,c:"9D9D99"})]),
        ],
      }),
    ]});
    const hdrTable = new Table({
      width:{size:10790,type:DXA},
      columnWidths:[1544,9246],
      borders:{top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL},insideH:{style:BorderStyle.NIL},insideV:{style:BorderStyle.NIL}},
      rows:[logoRow3],
    });;

    // ── Summary totals ────────────────────────────────────────────────────────
    const total = items.reduce(function(s,e) { return s+e.amount; }, 0);
    const reimb = items.filter(function(e) { return e.reimbursable; }).reduce(function(s,e) { return s+e.amount; }, 0);
    const summaryTable = new Table({
      width:{size:10790,type:DXA}, columnWidths:[5395,5395],
      rows:[
        new TableRow({children:[
          new TableCell({borders:lbs,width:{size:5395,type:DXA},margins:CM,
            shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
            children:[pr([tx("Total Expenses",{b:true,s:16,c:"555555"})],{spacing:{after:20}}),pr([tx("$"+total.toFixed(2),{b:true,s:28})])]}),
          new TableCell({borders:lbs,width:{size:5395,type:DXA},margins:CM,
            shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
            children:[pr([tx("Total Reimbursable",{b:true,s:16,c:"555555"})],{spacing:{after:20}}),pr([tx("$"+reimb.toFixed(2),{b:true,s:28})])]}),
        ]})
      ]
    });

    // ── Expense table ─────────────────────────────────────────────────────────
    const colWidths = [1100,3590,1400,1100,1200,1100,1300];
    const hdrs = ["Date","Vendor / Description","Category","Amount","Paid By","Reimb.","Receipt"];
    const hdrRow = new TableRow({children:hdrs.map(function(h,i) {
      return new TableCell({borders:lbs,width:{size:colWidths[i],type:DXA},margins:CM,
        shading:{fill:"222222",type:ShadingType.CLEAR},
        children:[pr([tx(h,{b:true,s:16,c:"FFFFFF"})])]});
    })});

    const itemRows = items.map(function(e) {
      return new TableRow({children:[
        cell([pr([tx(e.date,{s:16})])], {w:colWidths[0]}),
        cell([pr([tx(e.vendor,{s:16})])], {w:colWidths[1]}),
        cell([pr([tx(e.cat,{s:16})])], {w:colWidths[2]}),
        cell([pr([tx("$"+e.amount.toFixed(2),{s:16})],{a:AlignmentType.RIGHT})], {w:colWidths[3]}),
        cell([pr([tx(e.paid_by,{s:16})])], {w:colWidths[4]}),
        cell([pr([tx(e.reimbursable?"✔":"",{s:18,b:true,c:e.reimbursable?"2d7a3e":"AAAAAA"})],{a:AlignmentType.CENTER})], {w:colWidths[5]}),
        cell([pr([tx(e.receipt?"Attached":"—",{s:14,c:"888888"})],{a:AlignmentType.CENTER})], {w:colWidths[6]}),
      ]});
    });

    // Totals row
    const totalsRow = new TableRow({children:[
      new TableCell({borders:lbs,width:{size:colWidths[0]+colWidths[1]+colWidths[2],type:DXA},columnSpan:3,margins:CM,
        shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
        children:[pr([tx("TOTAL",{b:true,s:16})],{a:AlignmentType.RIGHT})]}),
      new TableCell({borders:lbs,width:{size:colWidths[3],type:DXA},margins:CM,
        shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
        children:[pr([tx("$"+total.toFixed(2),{b:true,s:16})],{a:AlignmentType.RIGHT})]}),
      new TableCell({borders:lbs,width:{size:colWidths[4]+colWidths[5]+colWidths[6],type:DXA},columnSpan:3,margins:CM,
        shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
        children:[pr([tx("")])]}),
    ]});

    const expTable = new Table({
      width:{size:10790,type:DXA},
      columnWidths:colWidths,
      rows:[hdrRow,...itemRows,totalsRow]
    });

    // ── Receipt pages — 6 per page in 2x3 grid ────────────────────────────────
    const receiptSections = [];
    const receiptItems = items.filter(function(e) { return e.receipt; });
    for (var ri=0; ri<receiptItems.length; ri+=6) {
      const batch = receiptItems.slice(ri, ri+6);
      // Each receipt is two stacked rows: label row + image row
      // We build a 2-col table where each "cell" is actually a nested table
      // Instead, build the grid as alternating label rows and image rows
      // Col width: 5340 each, total 10680
      const CW = 5340;
      var gridRows = [];
      for (var rj=0; rj<batch.length; rj+=2) {
        var left  = batch[rj]   || null;
        var right = batch[rj+1] || null;

        // Label row
        function makeBlankCell(w) {
          return new TableCell({borders:lbs, width:{size:w,type:DXA}, margins:CM,
            shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
            children:[pr([tx("")])]});
        }
        function makeLabelCell(e, w) {
          if (!e) return makeBlankCell(w);
          return new TableCell({borders:lbs, width:{size:w,type:DXA}, margins:CM,
            shading:{fill:"F5F0E8",type:ShadingType.CLEAR},
            children:[
              pr([tx(e.vendor,{b:true,s:16,c:"333333"})],{spacing:{after:16}}),
              pr([tx([e.date,e.cat,e.amount?"$"+e.amount.toFixed(2):""].filter(Boolean).join(" | "),{s:14,c:"555555"})],{spacing:{after:0}}),
            ]});
        }
        function makeImageCell(e, w) {
          if (!e) return makeBlankCell(w);
          try {
            var b64 = e.receipt.split(",")[1];
            var imgData = b64u8(b64);
            var imgRun = new ImageRun({data:imgData, transformation:{width:218,height:180}, type:"jpeg"});
            return new TableCell({borders:lbs, width:{size:w,type:DXA},
              margins:{top:60,bottom:60,left:60,right:60},
              children:[new Paragraph({children:[imgRun],spacing:{after:0}})]});
          } catch(err) {
            return new TableCell({borders:lbs, width:{size:w,type:DXA}, margins:CM,
              children:[pr([tx("(image error)",{s:14,c:"888888"})])]});
          }
        }

        gridRows.push(new TableRow({children:[makeLabelCell(left,CW), makeLabelCell(right,CW)]}));
        gridRows.push(new TableRow({children:[makeImageCell(left,CW), makeImageCell(right,CW)]}));
      }

      const gridTable = new Table({
        width:{size:10680,type:DXA},
        columnWidths:[CW,CW],
        borders:lbs,
        rows:gridRows
      });

      if (ri > 0) {
        receiptSections.push(new Paragraph({children:[new TextRun({text:""})], pageBreakBefore:true}));
      }
      receiptSections.push(gridTable);
    }

    // ── Build document ────────────────────────────────────────────────────────
    const pp = {page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:720,left:720}}};
    const footerPara = new Footer({children:[new Paragraph({
      children:[
        new TextRun({font:"Calibri",size:14,color:"9D9D99",text:"Powered by SLATER"}),
      ],
      alignment:AlignmentType.CENTER,
    })]});

    const expenseReportHeader = new Header({children:[
      new Paragraph({
        children:[new TextRun({text:"Expense Report", font:"Calibri", size:14, color:"9D9D99"})],
        spacing:{before:0, after:0, afterAutoSpacing:false, line:240, lineRule:"exact"},
        contextualSpacing:false,
      }),
    ]});
    const mainSection = {
      properties:pp,
      headers:{default:expenseReportHeader},
      footers:{default:footerPara},
      children:[
        hdrTable,
        new Paragraph({children:[new TextRun({text:""})], spacing:{after:80}}),
        summaryTable,
        new Paragraph({children:[new TextRun({text:""})], spacing:{after:300}}),
        expTable,
        ...(receiptSections.length ? [
          new Paragraph({children:[tx("Receipts",{b:true,s:28})], pageBreakBefore:true, spacing:{after:200}}),
          ...receiptSections,
        ] : []),
      ]
    };

    const doc = new Document({sections:[mainSection]});
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url;
    const pn = (data.project_title||"Expenses").replace(/[^a-z0-9]/gi,"_");
    a.download = "Slater_Expense_Report_"+pn+".docx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Expense report downloaded.", "ok");
  } catch(err) {
    console.error(err);
    setStatus("Error generating expense report: "+err.message, "err");
  }
  btn.disabled=false; btn.textContent="Download expense report (.docx)";
}

// ── Call Sheet Library ────────────────────────────────────────────────────
const LS_KEY = "slater_callsheets";
let currentSheetKey = null;
let modalCallback = null;
var _libSortMode = localStorage.getItem("slater_sort_mode") || "recent";
var _projectsLoaded = false; // set true after initial API.getProjects() sync
var _allProjectsCache = {}; // full project data for all projects, used by Rundown tabs

function libSetSort(mode) {
  _libSortMode = mode;
  localStorage.setItem("slater_sort_mode", mode);
  ["recent","date","company"].forEach(function(m) {
    var el = document.getElementById("sort-" + m);
    if (!el) return;
    if (el.type === "radio") el.checked = (m === mode);
    else el.classList.toggle("active", m === mode);
  });
  libRefreshDropdown(currentSheetKey || null);
}

function libLabel(data) {
  const company = data.client_company || data.client || "";
  const clientName = data.client_name || "";
  const abbrev = clientName ? (function() {
    var parts = clientName.trim().split(" ");
    if (parts.length >= 2) return parts[0].charAt(0) + ". " + parts.slice(1).join(" ");
    return clientName;
  })() : "";
  // Final deliverable/event date
  const days = data.schedule_days || [];
  const isPost = data.project_type === "post_production";
  const finalIso = isPost
    ? (data.video_due_date_iso || (days.length ? days[days.length-1].date_iso||"" : ""))
    : (days.length ? days[days.length-1].date_iso||"" : (data.day2_date_iso||data.day1_date_iso||""));
  const dateStr = finalIso ? (function() {
    const d = new Date(finalIso + "T12:00:00");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    const yy = String(d.getFullYear()).slice(-2);
    return mm + "/" + dd + "/" + yy;
  })() : "";
  const parts = [company, data.project_title, abbrev, dateStr].filter(Boolean);
  return parts.join(" | ") || "Untitled";
}

function libLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch(e) { return {}; }
}
function libSaveAll(db) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch(e) {
    setStatus("Save failed — storage full. Try removing receipt images or old projects.", "err");
    console.error("libSaveAll quota error:", e);
  }
}

function libDuplicate() {
  if (!currentSheetKey) return;
  API.getProject(currentSheetKey).then(function(result) {
    var source = (result && result.data) ? result.data : libLoad()[currentSheetKey];
    if (!source) return;
    var newKey = "cs_" + Date.now();
    var newData = Object.assign({}, source);
    newData.label = (source.label || "") + " (copy)";
    newData.savedAt = Date.now();
    var db = libLoad();
    db[newKey] = newData;
    libSaveAll(db);
    currentSheetKey = newKey;
    localStorage.setItem("slater_last_project", newKey);
    API.saveProject(newKey, newData.label, newData).then(function() {
      libRefreshDropdown(newKey);
      loadFormData(newData);
      document.getElementById("lib-delete").style.display = "";
      document.getElementById("lib-duplicate").style.display = "";
      setStatus("Project duplicated.", "ok");
    });
  });
}

function libRefreshDropdown(selectKey) {
  const sel = document.getElementById("lib-select");
  // Try server first, fall back to localStorage
  API.getProjects().then(function(serverProjects) {
    var db = libLoad();
    // Sync localStorage with server: add/update from server, remove entries not on server
    if (serverProjects && serverProjects.length) {
      var serverKeys = serverProjects.map(function(p) { return p.key; });
      Object.keys(db).forEach(function(k) { if (serverKeys.indexOf(k) === -1) delete db[k]; });
      serverProjects.forEach(function(p) {
        if (!db[p.key]) db[p.key] = {label: p.label, savedAt: new Date(p.updated_at).getTime()};
        else db[p.key].label = p.label;
      });
      libSaveAll(db);
    }
    sel.innerHTML = '<option value="" disabled>— Select a project —</option>';
    const today = new Date().toISOString().slice(0,10);
    function lastDayIso(sheet) {
      var label = sheet.label || "";
      var parts = label.split("|");
      var datePart = parts[parts.length - 1].trim();
      var m = datePart.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
      if (!m) return "";
      var yr = parseInt(m[3], 10);
      yr += yr >= 50 ? 1900 : 2000;
      return yr + "-" + m[1] + "-" + m[2];
    }
    function companyOf(sheet) {
      return ((sheet.label || "").split("|")[0] || "").trim().toLowerCase();
    }
    var allKeys = Object.keys(db);
    var keys;
    if (_libSortMode === "date") {
      // Sort current and past sections independently so soonest upcoming is first
      // and most recently past is first within each group
      var currentKeys = allKeys.filter(function(k) { return !lastDayIso(db[k]) || lastDayIso(db[k]) >= today; });
      var pastKeys    = allKeys.filter(function(k) { return  lastDayIso(db[k]) && lastDayIso(db[k]) <  today; });
      currentKeys.sort(function(a, b) {
        var da = lastDayIso(db[a]) || "9999-99-99"; // no-date projects sink to bottom of current
        var db2 = lastDayIso(db[b]) || "9999-99-99";
        return da < db2 ? -1 : da > db2 ? 1 : 0;   // ascending: soonest first
      });
      pastKeys.sort(function(a, b) {
        var da = lastDayIso(db[a]);
        var db2 = lastDayIso(db[b]);
        return da < db2 ? 1 : da > db2 ? -1 : 0;   // descending: most recently past first
      });
      keys = null; // handled below
    } else if (_libSortMode === "company") {
      keys = allKeys.sort(function(a, b) {
        var ca = companyOf(db[a]), cb = companyOf(db[b]);
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });
    } else {
      keys = allKeys.sort(function(a, b) { return (db[b].savedAt||0) - (db[a].savedAt||0); });
    }
    function addOpt(k, dimmed) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = (dimmed ? "\u26AB " : "") + (db[k].label || k);
      if (dimmed) opt.style.color = "#aaa";
      if (k === selectKey) opt.selected = true;
      sel.appendChild(opt);
    }
    if (_libSortMode === "date") {
      currentKeys.forEach(function(k) { addOpt(k, false); });
      if (pastKeys.length && currentKeys.length) {
        const sep = document.createElement("option");
        sep.disabled = true; sep.textContent = "\u2500\u2500 Past projects \u2500\u2500";
        sep.style.color = "#ccc";
        sel.appendChild(sep);
      }
      pastKeys.forEach(function(k) { addOpt(k, true); });
    } else if (_libSortMode === "company") {
      keys.forEach(function(k) { addOpt(k, lastDayIso(db[k]) && lastDayIso(db[k]) < today); });
    } else {
      const current = keys.filter(function(k) { return !lastDayIso(db[k]) || lastDayIso(db[k]) >= today; });
      const past    = keys.filter(function(k) { return  lastDayIso(db[k]) && lastDayIso(db[k]) <  today; });
      current.forEach(function(k) { addOpt(k, false); });
      if (past.length && current.length) {
        const sep = document.createElement("option");
        sep.disabled = true; sep.textContent = "\u2500\u2500 Past projects \u2500\u2500";
        sep.style.color = "#ccc";
        sel.appendChild(sep);
      }
      past.forEach(function(k) { addOpt(k, true); });
    }
    if (!selectKey) sel.value = "";
    document.getElementById("lib-delete").style.display = currentSheetKey ? "" : "none";
    document.getElementById("lib-duplicate").style.display = currentSheetKey ? "" : "none";
    // After the initial server sync, refresh an open sidebar so links use fresh sheetKeys
    if (!_projectsLoaded) {
      _projectsLoaded = true;
      if (sidebarOpen && dailyTab !== "crew") refreshSidebar();
    }
  });
}

function fetchAllProjectsForRundown() {
  API.getProjects().then(function(projects) {
    if (!projects || !projects.length) return Promise.resolve();
    var batchSize = 5;
    var batches = [];
    for (var i = 0; i < projects.length; i += batchSize) {
      batches.push(projects.slice(i, i + batchSize));
    }
    return batches.reduce(function(chain, batch) {
      return chain.then(function() {
        return Promise.all(batch.map(function(p) {
          return API.getProject(p.key).then(function(result) {
            if (result && result.data) {
              _allProjectsCache[p.key] = { label: p.label, data: result.data };
            }
          });
        }));
      });
    }, Promise.resolve());
  }).then(function() {
    if (sidebarOpen && dailyTab !== "crew") refreshSidebar();
  });
}

function libSelect() {
  if (_navigating) return;
  const key = document.getElementById("lib-select").value;
  if (!key) { libNew(); return; }
  currentSheetKey = key;
  localStorage.setItem("slater_last_project", key);
  document.getElementById("lib-delete").style.display = "";
  document.getElementById("lib-duplicate").style.display = "";
  // Try server first, fall back to localStorage
  API.getProject(key).then(function(result) {
    if (result && result.data) {
      loadFormData(result.data);
    } else {
      const db = libLoad();
      if (db[key]) loadFormData(db[key]);
    }
  });
}

function libNew() {
  currentSheetKey = null;
  clearForm();
  libRefreshDropdown(null);
  document.getElementById("lib-select").value = "";
  document.getElementById("lib-delete").style.display = "none";
  document.getElementById("lib-duplicate").style.display = "none";
  st("project");
  // Offer default template for current project type
  const pt = (document.getElementById("project_type")||{}).value || "live_event";
  setTimeout(function() { offerDefaultTemplate(pt); }, 300);
}

function libSave() {
  const data = gather();
  const label = libLabel(data);
  const db = libLoad();

  // Check if a sheet with this label already exists (and it's not the current one)
  const existingKey = Object.keys(db).find(k => db[k].label === label && k !== currentSheetKey);

  if (existingKey) {
    showModal(
      "Overwrite existing sheet?",
      "A call sheet named \"" + label + "\" already exists. Overwrite it?",
      () => { doSave(data, label, existingKey); }
    );
    return;
  }
  doSave(data, label, currentSheetKey);
}

function doSave(data, label, key) {
  var db = libLoad();
  var k = key || ("cs_" + Date.now());
  data.label = label;
  data.savedAt = Date.now();
  // Save receipts separately, strip from main data
  var expenses = data.expenses || [];
  saveReceipts(k, expenses);
  data.expenses = expenses.map(function(e) { return Object.assign({}, e, {receipt:""}); });
  db[k] = data;
  libSaveAll(db);
  _allProjectsCache[k] = { label: label, data: data };
  currentSheetKey = k;
  document.getElementById("lib-delete").style.display = "";
  document.getElementById("lib-duplicate").style.display = "";
  mergeContactsFromSheet(data);
  localStorage.setItem("slater_last_project", k);
  setStatus("Saved: " + label, "ok");
  // Save to server first, then refresh dropdown so the server label is current
  // when libRefreshDropdown fetches it (avoids a race where the old label overwrites the new one)
  API.saveProject(k, label, data).then(function(result) {
    if (result) console.log("Saved to server:", k);
    else console.warn("Server save failed, localStorage only");
    libRefreshDropdown(k);
  });
}

function libDelete() {
  if (!currentSheetKey) return;
  var db = libLoad();
  var projectName = (db[currentSheetKey] || {}).label || currentSheetKey;
  showModal('Delete Project', 'Are you sure you want to delete "' + projectName + '"? This cannot be undone.', function() {
    deleteReceipts(currentSheetKey);
    var db = libLoad();
    delete db[currentSheetKey];
    libSaveAll(db);
    delete _allProjectsCache[currentSheetKey];
    var deletedKey = currentSheetKey;
    currentSheetKey = null;
    clearForm();
    setStatus("Project deleted.", "ok");
    API.deleteProject(deletedKey).then(function(result) {
      if (!result) console.warn("Server delete failed");
      libRefreshDropdown(null);
    });
  });
}



// ── Modal ─────────────────────────────────────────────────────────────────
function showModal(title, msg, onOk) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-msg").textContent = msg;
  const okBtn = document.getElementById("modal-ok");
  const cancelBtn = document.querySelector(".modal-btns .lb:first-child");
  okBtn.textContent = "OK";
  if (cancelBtn) cancelBtn.textContent = "Cancel";
  okBtn.onclick = function() { modalCancel(); if (onOk) onOk(); };
  if (cancelBtn) cancelBtn.onclick = function() { modalCancel(); };
  document.getElementById("modal-overlay").classList.add("open");
  modalCallback = onOk;
}
function modalOk() {
  document.getElementById("modal-overlay").classList.remove("open");
  if (modalCallback) { modalCallback(); modalCallback = null; }
}
function modalCancel() {
  document.getElementById("modal-overlay").classList.remove("open");
  modalCallback = null;
}

// ── Gather all form data ──────────────────────────────────────────────────
function gather() {
  return {
    project_type:v("project_type")||"live_event",
    agency_id: (function(){ var el=document.getElementById("project_agency_id"); return el?el.value||null:null; })(),
    doc_branding:(function(){ var el=document.querySelector('input[name="doc_branding"]:checked'); return el?el.value:"agency"; })(),
    project_title:v("project_title"), client:v("client_company"), client_company:v("client_company"), client_name:v("client_name"), billing_code:v("billing_code"),
    kp_cards: kp.map(function(id) { return {_id:id, role:v(id+"_role")||"", name:v(id+"_name")||"", phone:v(id+"_phone")||"", email:v(id+"_email")||"", status:v(id+"_status")||"tbd"}; }),
    hospital:v("hospital"), breakfast:v("breakfast")||"8:00 am", lunch:v("lunch")||"12:00 pm",
    sunrise:v("sunrise"), sunset:v("sunset"),

    crew: crew.map(id => ({id:id,position:v(id+"_position"),name:v(id+"_name"),email:v(id+"_email"),phone:v(id+"_phone"),notes:v(id+"_notes"),status:v(id+"_status")||"tbd"})).filter(c => c.position||c.name||c.email||c.phone||c.notes),
    crew_summary: (function() {
      var counts = {tbd:0, pencil:0, hold:0, confirmed:0, total:0};
      crew.forEach(function(id) {
        var status = (document.getElementById(id+"_status")||{}).value || "tbd";
        counts[status] = (counts[status]||0) + 1;
        counts.total++;
      });
      return counts;
    })(),
    talent: talent.map(id => ({id:id,name:v(id+"_name"),title:v(id+"_title"),email:v(id+"_email"),phone:v(id+"_phone"),notes:v(id+"_notes"),status:v(id+"_status")||"tbd"})),
    timezone: v("timezone")||"PT",
    kickoff_date_iso: v("kickoff_date_iso"),
    kickoff_time: v("kickoff_time"),
    video_due_date_iso: v("video_due_date_iso"),
    video_due_time: v("video_due_time"),
    schedule_days: getScheduleDays(),
    wb_day_select: (document.getElementById("wb_day_select")||{value:"2"}).value,
    wb_items: wbGetItems(),
    wb_items_for_doc: wbGetItemsForDoc(),
    urls: getUrls(),
    expenses: getExpenses(),
    notes: notesGetData(),
  };
}

// ── Load form data from a saved object ───────────────────────────────────
function loadFormData(data) {
  const s = (id, val) => { const e = document.getElementById(id); if(e && val !== undefined) e.value = val; };

  const ptEl = document.getElementById("project_type"); if(ptEl && data.project_type) ptEl.value = data.project_type;
  s("project_title", data.project_title);
  s("client_company", data.client_company||data.client||"");
  s("client_name", data.client_name||""); s("billing_code", data.billing_code);
  var agencySelEl = document.getElementById("project_agency_id");
  if (agencySelEl && data.agency_id) agencySelEl.value = data.agency_id;
  var dbEl = document.querySelector('input[name="doc_branding"][value="' + (data.doc_branding||"agency") + '"]');
  if (dbEl) dbEl.checked = true;
  updateBrandingWarning();
  document.getElementById("kp-list").innerHTML = ""; kp = [];
  var _kpData = data.kp_cards;
  if (!_kpData) {
    var _kpMigrated = [];
    if (data.ep_name||data.ep_role) _kpMigrated.push({role:data.ep_role||"EP",name:data.ep_name||"",phone:data.ep_phone||"",email:data.ep_email||"",status:data.ep_status||"tbd"});
    if (data.prod_name||data.prod_role) _kpMigrated.push({role:data.prod_role||"Producer",name:data.prod_name||"",phone:data.prod_phone||"",email:data.prod_email||"",status:data.prod_status||"tbd"});
    if (data.eic_name||data.eic_role) _kpMigrated.push({role:data.eic_role||"EIC",name:data.eic_name||"",phone:data.eic_phone||"",email:data.eic_email||"",status:data.eic_status||"tbd"});
    if (data.mngprd_name||data.mngprd_role) _kpMigrated.push({role:data.mngprd_role||"Mng. Producer",name:data.mngprd_name||"",phone:data.mngprd_phone||"",email:data.mngprd_email||"",status:data.mngprd_status||"tbd"});
    _kpData = _kpMigrated.length ? _kpMigrated : getDefaultKP();
  }
  (_kpData||getDefaultKP()).forEach(function(c) { addKP(c); });
  updateAddKPButton();
  s("hospital", data.hospital); s("breakfast", data.breakfast); s("lunch", data.lunch);
  s("sunrise", data.sunrise); s("sunset", data.sunset);
  const tzEl = document.getElementById("timezone"); if(tzEl && data.timezone) tzEl.value = data.timezone;


  // Rebuild dynamic lists
  // Crew
  document.getElementById("crew-list").innerHTML = "";
  crew = [];
  (data.crew || []).forEach(c => {
    addCrew();
    const id = crew[crew.length-1];
    s(id+"_position", c.position); s(id+"_name", c.name);
    s(id+"_email", c.email); s(id+"_phone", c.phone); s(id+"_notes", c.notes);
    const statusVal = c.status || "tbd";
    s(id+"_status", statusVal);
    updateCrewStatusPill(id, statusVal);
  });
  updateCrewStatusBar();

  // Talent
  document.getElementById("talent-list").innerHTML = "";
  talent = [];
  (data.talent || []).forEach(t => {
    addTalent();
    const id = talent[talent.length-1];
    s(id+"_name", t.name); s(id+"_title", t.title);
    s(id+"_email", t.email); s(id+"_phone", t.phone); s(id+"_notes", t.notes);
    const talentStatus = t.status || "tbd";
    s(id+"_status", talentStatus);
    updateCrewStatusPill(id, talentStatus);
  });
  updateTalentStatusBar();

  // Schedules
  var _kd = document.getElementById("kickoff_date_iso"); if(_kd) _kd.value = data.kickoff_date_iso||"";
  var _kt = document.getElementById("kickoff_time"); if(_kt) _kt.value = data.kickoff_time||"";
  var _vd = document.getElementById("video_due_date_iso"); if(_vd) _vd.value = data.video_due_date_iso||"";
  var _vt = document.getElementById("video_due_time"); if(_vt) _vt.value = data.video_due_time||"";
  setTimeout(updateVideoDueVisibility, 50);
  loadScheduleDays(data.schedule_days||[], data);

  refreshWbDaySelector();
  const wbDayEl = document.getElementById("wb_day_select");
  if (wbDayEl && data.wb_day_select) wbDayEl.value = data.wb_day_select;
  const wbDirEl = document.getElementById("wb_direction");
  if (wbDirEl && data.wb_direction) wbDirEl.value = data.wb_direction;
  wbLoadItems(Array.isArray(data.wb_items) ? data.wb_items : []);
  wbRecalc();
  wbRebuildPins();
  refreshAllTimeHints();
  loadUrls(data.urls||[]);
  loadExpenses(currentSheetKey ? loadReceipts(currentSheetKey, data.expenses||[]) : (data.expenses||[]));
  notesLoadData(data.notes||[]);
  // Restore note editor draft if present
  var ne = document.getElementById("note-editor");
  if (ne) ne.innerHTML = data._note_draft || "";
  updateNoteDraftIndicator(data._note_draft || "");
}

// ── Clear form ────────────────────────────────────────────────────────────
function clearForm() {
  ["project_title","client_company","client_name","billing_code",
   "hospital","breakfast","lunch","sunrise","sunset"
  ].forEach(function(id) { const e = document.getElementById(id); if(e) e.value = ""; });
  const ptReset = document.getElementById("project_type"); if(ptReset) ptReset.value = "location_shoot";
  var dbReset = document.querySelector('input[name="doc_branding"][value="agency"]'); if(dbReset) dbReset.checked = true;
  updateBrandingWarning();
  const kdReset = document.getElementById("kickoff_date_iso"); if(kdReset) kdReset.value = "";
  const ktReset = document.getElementById("kickoff_time"); if(ktReset) ktReset.value = "";
  const vdReset = document.getElementById("video_due_date_iso"); if(vdReset) vdReset.value = "";
  const vtReset = document.getElementById("video_due_time"); if(vtReset) vtReset.value = "";
  const tzReset = document.getElementById("timezone"); if(tzReset) tzReset.value = "PT";
  document.getElementById("kp-list").innerHTML = ""; kp = [];
  getDefaultKP().forEach(function(c) { addKP(c); });
  updateAddKPButton();
  document.getElementById("crew-list").innerHTML = ""; crew = []; updateCrewStatusBar();
  document.getElementById("talent-list").innerHTML = ""; talent = []; updateTalentStatusBar();
  loadScheduleDays([]);
  const wbDayEl = document.getElementById("wb_day_select"); if(wbDayEl) wbDayEl.value = "last";
  wbLoadItems([]);
  loadUrls([]);
  loadExpenses([]);
  notesLoadData([]);
  const ne = document.getElementById("note-editor"); if(ne) ne.innerHTML = "";
  updateNoteDraftIndicator("");
}


// ── Receipt image storage (kept separate from main project data) ───────────────
var RECEIPT_PREFIX = "slater_receipt_";

function saveReceipts(projectKey, expenses) {
  // Remove old receipts from localStorage
  var toRemove = [];
  for (var i=0; i<localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith(RECEIPT_PREFIX + projectKey + "_")) toRemove.push(k);
  }
  toRemove.forEach(function(k) { localStorage.removeItem(k); });
  // Save each receipt to server
  expenses.forEach(function(e, i) {
    if (e.receipt) {
      API.saveReceipt(projectKey, i, e.receipt).then(function(result) {
        if (!result) console.warn("Server receipt save failed for index", i);
      });
    }
  });
}

function loadReceipts(projectKey, expenses) {
  return expenses.map(function(e, i) {
    var stored = localStorage.getItem(RECEIPT_PREFIX + projectKey + "_" + i);
    return Object.assign({}, e, {receipt: stored || ""});
  });
}

function deleteReceipts(projectKey) {
  // Remove from localStorage
  var toRemove = [];
  for (var i=0; i<localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith(RECEIPT_PREFIX + projectKey + "_")) toRemove.push(k);
  }
  toRemove.forEach(function(k) { localStorage.removeItem(k); });
  // Remove from server
  API.deleteReceipts(projectKey).then(function(result) {
    if (!result) console.warn("Server receipt delete failed for", projectKey);
  });
}


function seedCrew() { addCrew(); }
function b64u8(b) { var bin=atob(b), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }
async function patchGridSpan(blob) {
  try {
    const ab = await blob.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(ab);
    let xml = await zip.file("word/document.xml").async("string");
    xml = xml.replace(/(<w:tcW\b[^/]*w:w="3770"[^/]*\/?>)/g, '$1<w:gridSpan w:val="3"/>');
    zip.file("word/document.xml", xml);
    const out = await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression:"DEFLATE"});
    return out;
  } catch(e) {
    console.warn("gridSpan patch failed:", e);
    return blob;
  }
}


async function generateWorkback() {
  const btn = document.getElementById("wb-btn");
  btn.disabled=true; btn.textContent="Building...";
  try {
    const data = gather();
    const items = wbGetItemsForDoc();
    if (!items.length) { setStatus("No workback items to export.", "err"); btn.disabled=false; btn.textContent="Download workback (.docx)"; return; }

    await new Promise(r => { if(window.docx) return r(); const t = setInterval(() => { if(window.docx){clearInterval(t);r();} },100); });

    const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,
           AlignmentType,WidthType,BorderStyle,VerticalAlign,ShadingType,Header,Footer} = window.docx;

    const bdr  = {style:BorderStyle.SINGLE,size:4,color:"AAAAAA"};
    const lbs  = {top:bdr,bottom:bdr,left:bdr,right:bdr};
    const nils = {top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL}};
    const nilsBot = {top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.SINGLE,size:4,color:"AAAAAA"},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL}};
    const CM   = {top:58,bottom:58,left:58,right:58};
    const _agencyLogoWb = getAgencyLogoB64();
    const _agencyDataWb = loadAgencyData();
    const _isSvgWb = _agencyDataWb.logo && _agencyDataWb.logo.includes("image/svg");
    const _agencyB64Wb = (!_isSvgWb && _agencyLogoWb) ? _agencyLogoWb : LB64;
    var _logoB64Wb = _agencyB64Wb;
    if (data.doc_branding === "slater") { _logoB64Wb = LB64; }
    else if (data.doc_branding === "client") { var _clWb = lookupCompanyLogo(data.client_company); if (_clWb) _logoB64Wb = _clWb; else console.warn("Client branding: no logo for", data.client_company); }
    const lb = b64u8(_logoB64Wb);

    function tx(s,o={}) { return new TextRun({text:s||"",bold:o.b,size:o.s||18,color:o.c,font:"Calibri"}); }
    function pr(r,o={}) { return new Paragraph({alignment:o.a||AlignmentType.LEFT,spacing:o.sp||{},children:Array.isArray(r)?r:[r]}); }
    function cell(ch,o={}) { return new TableCell({borders:o.brd||lbs,width:o.w?{size:o.w,type:WidthType.DXA}:undefined,gridSpan:o.span,margins:CM,children:ch}); }
    function sp() { return new Paragraph({spacing:{before:60,after:60},children:[new TextRun("")]}); }
    function makeHdr(l,r) { return new Header({children:[new Paragraph({children:[new TextRun({text:l,font:"Calibri",size:18}),new TextRun({text:"	"+r,font:"Calibri",size:18})],tabStops:[{type:"right",position:10790}]}),new Paragraph({children:[new TextRun({text:"",size:18})]})]}); }

    // Key personnel — only show entries that have a name
    const prs = (data.kp_cards||[]).filter(function(p){return p.name&&p.name.trim();}).map(function(p){return {role:p.role||"",name:p.name,phone:p.phone||"",email:p.email||""};});

    const logo = new ImageRun({data:lb, transformation:{width:96,height:96}, type:"png"});

    // ── Table 0: Logo row + staff rows ──────────────────────────────────────
    // Row 0: logo (1544 DXA, no borders except bottom) | title+client (9246 DXA, same)
    // ── Table 0a: Logo + Title ───────────────────────────────────────────────
    const titleLine2 = [
      data.client_company||data.client||"",
      data.client_name||"",
      data.billing_code ? data.billing_code : ""
    ].filter(Boolean).join(" | ");

    logoRow = new TableRow({height:{value:1834}, children:[
      new TableCell({
        borders: nils,
        width:{size:1544,type:WidthType.DXA},
        verticalAlign:VerticalAlign.CENTER,
        margins:CM,
        children:[pr([logo])],
      }),
      new TableCell({
        borders: nils,
        width:{size:9246,type:WidthType.DXA},
        verticalAlign:VerticalAlign.CENTER,
        margins:{top:58,bottom:58,left:200,right:58},
        children:[
          pr([tx(data.project_title||"",{b:true,s:36,c:"262626"})],{spacing:{after:0}}),
          pr([tx(titleLine2,{s:18,c:"7F7F7F"})],{spacing:{after:0}}),
          pr([tx("")],{spacing:{after:60}}),
        ],
      }),
    ]});

    const tbl0a = new Table({
      width:{size:10790,type:WidthType.DXA},
      columnWidths:[1544,9246],
      borders:{top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL},insideH:{style:BorderStyle.NIL},insideV:{style:BorderStyle.NIL}},
      rows:[logoRow],
    })

    // Staff rows: role | name | phone | email
    const sShade = {type:ShadingType.CLEAR,color:"auto",fill:"F5F0E9"};
    staffRows = prs.map(function(p) { return new TableRow({height:{value:253}, children:[
      new TableCell({borders:lbs,width:{size:985,type:WidthType.DXA},margins:CM,shading:sShade,children:[pr([tx(p.role,{s:18,c:"555555"})])]}),
      new TableCell({borders:lbs,width:{size:3690,type:WidthType.DXA},margins:CM,shading:sShade,children:[pr([tx(p.name,{s:18})])]}),
      new TableCell({borders:lbs,width:{size:2520,type:WidthType.DXA},margins:CM,shading:sShade,children:[pr([new TextRun({text:p.phone||"",size:18,font:"Calibri",noProof:true})])]}),
      new TableCell({borders:lbs,width:{size:3595,type:WidthType.DXA},margins:CM,shading:sShade,children:[pr([tx(p.email,{s:18})])]}),
    ]}); });

    const tbl0 = new Table({
      width:{size:10790,type:WidthType.DXA},
      columnWidths:[985,3690,2520,3595],
      borders:{top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL},insideH:{style:BorderStyle.NIL},insideV:{style:BorderStyle.NIL}},
      rows:[...staffRows],
    });

    // ── Table 1: Workback ────────────────────────────────────────────────────
    // Helper for grey header cells
    function greyCell(ch, w) {
      return new TableCell({
        borders:lbs, width:{size:w,type:WidthType.DXA},
        shading:{type:ShadingType.CLEAR, color:"auto", fill:"F5F0E8"},
        margins:CM, children:ch,
      });
    }

    // Header row: single merged cell — gridSpan:3 is injected via XML patch below
    var tzMap = {ET:"Eastern Time",CT:"Central Time",MT:"Mountain Time",PT:"Pacific Time",AKT:"Alaska Time",HT:"Hawaii Time"};
    var tzLabel = data.timezone && data.timezone !== "none" ? "All times in "+(tzMap[data.timezone]||data.timezone) : "";
    wbHdrRow = new TableRow({children:[
      new TableCell({
        borders:lbs,
        width:{size:10790,type:WidthType.DXA},
        shading:{type:ShadingType.CLEAR,color:"auto",fill:"F5F0E8"},
        margins:{top:160,bottom:160,left:200,right:200},
        children:[
          pr([tx("Workback Schedule",{b:true,s:24})],{a:AlignmentType.CENTER,spacing:{after:tzLabel?40:0}}),
          tzLabel ? pr([tx(tzLabel,{s:14,c:"9D9D99"})],{a:AlignmentType.CENTER,spacing:{after:0}}) : null,
        ].filter(Boolean),
      })
    ]});

    // Column label row
    const wbColHdr = new TableRow({children:[
      cell([pr([tx("DELIVERABLE",{s:18,c:"7F7F7F"})])], {w:5126}),
      cell([pr([tx("OWNER",{s:18,c:"7F7F7F"})])],       {w:4415}),
      cell([pr([tx("DUE DATE",{s:18,c:"7F7F7F"})])],    {w:1249}),
    ]});

    const wbRows = [];
    items.forEach(function(item) {
      if (item.isPin) {
        var pinShade = {type:ShadingType.CLEAR,color:"auto",fill:"F5F0E8"};
        wbRows.push(new TableRow({children:[
          new TableCell({borders:lbs,width:{size:10790,type:WidthType.DXA},gridSpan:3,
            shading:pinShade,margins:{top:80,bottom:80,left:120,right:120},
            children:[pr([
              tx("\uD83D\uDCC5 "+item.item,{b:true,s:18,c:"262626"}),
              tx("   "+item.dueFmt,{s:16,c:"9D9D99"}),
            ])]}),
        ]}));
        if (item.schedEntries && item.schedEntries.length) {
          item.schedEntries.forEach(function(e) {
            if (!e.time && !e.desc) return;
            wbRows.push(new TableRow({children:[
              new TableCell({borders:lbs,width:{size:5126,type:WidthType.DXA},
                shading:{type:ShadingType.CLEAR,color:"auto",fill:"FDFCF9"},
                margins:{top:40,bottom:40,left:120,right:80},
                children:[pr([tx(e.time||"",{s:16,c:"9D9D99"})])]}),
              new TableCell({borders:lbs,width:{size:5664,type:WidthType.DXA},gridSpan:2,
                shading:{type:ShadingType.CLEAR,color:"auto",fill:"FDFCF9"},
                margins:{top:40,bottom:40,left:80,right:120},
                children:[pr([tx(e.desc||"",{s:16,c:"555555"})])]}),
            ]}));
          });
        }
      } else {
        wbRows.push(new TableRow({children:[
          cell([pr([tx(item.item||"",{s:18})])],  {w:5126}),
          cell([pr([tx(item.owner||"",{s:18})])], {w:4415}),
          cell([pr([tx(item.dueFmt||"",{s:18})])],{w:1249}),
        ]}));
      }
    });

    const tbl1 = new Table({
      width:{size:10790,type:WidthType.DXA},
      columnWidths:[5126,4415,1249],
      rows:[wbHdrRow, wbColHdr, ...wbRows],
    });

    // ── Document ─────────────────────────────────────────────────────────────
    const pp = {page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:540,left:720}}};
    const doc = new Document({sections:[{
      properties:pp,
      headers:{default:makeHdr("Worktank Workback Schedule", data.project_title||"")},
      footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({font:"Calibri",size:14,color:"9D9D99",text:"Powered by SLATER"})],alignment:AlignmentType.CENTER})]})},
      children:[tbl0a, sp(), tbl0, sp(), tbl1],
    }]});

    let blob = await Packer.toBlob(doc);
    try {
      // Use JSZip (available globally) to patch the XML
      const ab = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      let xml = await zip.file("word/document.xml").async("string");
      // Inject gridSpan into pin rows (10790 = full width, span 3) and sched desc cells (5664 = span 2)
      xml = xml.replace(/<w:tcW w:type="dxa" w:w="10790"\/>/g, '<w:tcW w:type="dxa" w:w="10790"/><w:gridSpan w:val="3"/>');
      xml = xml.replace(/<w:tcW w:type="dxa" w:w="5664"\/>/g, '<w:tcW w:type="dxa" w:w="5664"/><w:gridSpan w:val="2"/>');
      zip.file("word/document.xml", xml);
      blob = await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    } catch(e) { console.warn("patch failed", e); }

    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const pn=(data.project_title||"Workback").replace(/[^a-zA-Z0-9_\- ]/g,"").trim().replace(/ /g,"_");
    a.href=url; a.download="Worktank_"+pn+"_Workback.docx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Workback downloaded.", "ok");
  } catch(e) { console.error(e); setStatus("Error: "+e.message,"err"); }
  btn.disabled=false; btn.textContent="Download workback (.docx)";
}


function generateDayICS(dayId) {
  var dateIso = (document.getElementById(dayId+"_date_iso")||{}).value||"";
  if (!dateIso) { setStatus("Please add a date to this schedule day before exporting.", "err"); return; }

  var data = gather();
  var STATUS_LABELS = {tbd:"TBD", pencil:"Pencil", hold:"1st Hold", confirmed:"Confirmed"};
  var ag = getAgencyInfo();
  var _kp0 = (data.kp_cards||[])[0]||{};
  var orgName  = ag.billing_contact || _kp0.name  || ag.name || "Slater";
  var orgEmail = ag.billing_email   || _kp0.email || "noreply@slater.app";

  function esc(s) { return (s||"").replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;"); }
  function fold(line) {
    if (line.length <= 75) return line;
    var out = "";
    while (line.length > 75) { out += line.slice(0,75) + "\r\n "; line = line.slice(75); }
    return out + line;
  }
  function parseT(s) {
    if (!s) return null;
    var m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!m) return null;
    var h = parseInt(m[1]), mn = parseInt(m[2]), ap = (m[3]||"").toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return {h:h, m:mn};
  }
  function hhmmss(t) { return String(t.h).padStart(2,"0")+String(t.m).padStart(2,"0")+"00"; }
  function isoDate(s) { return s.replace(/-/g,""); }

  var now = new Date();
  var dtstamp = now.getUTCFullYear()+String(now.getUTCMonth()+1).padStart(2,"0")+String(now.getUTCDate()).padStart(2,"0")+"T"+String(now.getUTCHours()).padStart(2,"0")+String(now.getUTCMinutes()).padStart(2,"0")+String(now.getUTCSeconds()).padStart(2,"0")+"Z";

  var callTimeRaw = (document.getElementById(dayId+"_call_time")||{}).value||"";
  var wrapRaw     = (document.getElementById(dayId+"_wrap")||{}).value||"";
  var dayLabel    = (document.getElementById(dayId+"_label")||{}).value||"";
  var dateRaw     = (document.getElementById(dayId+"_date")||{}).value||"";
  var endDateIsoVal = (document.getElementById(dayId+"_end_date_iso")||{}).value || dateIso;
  var dayCategory = (document.getElementById(dayId+"_category")||{}).value || "shoot_day";
  var _icsCfg = CATEGORY_CONFIG[dayCategory] || CATEGORY_CONFIG['shoot_day'];
  var _f1Label = _icsCfg.f1.show ? (_icsCfg.f1.label || "Call Time") : null;
  var _f3Label = _icsCfg.f3.show ? (_icsCfg.f3.label || "Wrap") : null;
  var _uncrewedCats = ['internal_kickoff','client_meeting','uncrewed_rehearsal','tech_check','location_scout','edit_session','review_session','travel_day','deadline','other'];
  var _includeCrewInICS = _uncrewedCats.indexOf(dayCategory) === -1;

  var callT = parseT(callTimeRaw);
  var wrapT = parseT(wrapRaw);
  if (!wrapT && callT) wrapT = {h: Math.min(callT.h + 12, 23), m: callT.m};

  var locId = (document.getElementById(dayId+"_loc_id")||{}).value||"";
  var loc = null;
  if (locId) {
    var _lnEl = document.getElementById(locId+"_name");
    if (_lnEl) {
      loc = {
        name:     _lnEl.value||"",
        address:  (document.getElementById(locId+"_address")||{}).value||"",
        city:     (document.getElementById(locId+"_city")||{}).value||"",
        state:    (document.getElementById(locId+"_state")||{}).value||"",
        zip:      (document.getElementById(locId+"_zip")||{}).value||"",
        hospital: (document.getElementById(locId+"_hospital")||{}).value||"",
      };
    }
  }

  var entries = (daySchedItems[dayId]||[]).map(function(eid) {
    return {time: v(eid+"_time"), desc: v(eid+"_desc")};
  }).filter(function(e) { return e.time||e.desc; });

  var _kpExcludedICS = getDayExcludedKP(dayId);
  var kp = (data.kp_cards||[]).filter(function(p) { return (p.name||p.email) && _kpExcludedICS.indexOf(p._id||"") === -1; });

  var DIVIDER = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
  var idx = scheduleDays.indexOf(dayId);
  var dayLabelDisplay = dayLabel || ("Day " + (idx + 1));
  var d = [];
  d.push([data.project_title, dayLabelDisplay, dateRaw].filter(Boolean).join(" | "));
  if (data.client_company) d.push(data.client_company);
  d.push(""); d.push(DIVIDER); d.push("");
  if (callTimeRaw && _f1Label) d.push(_f1Label.toUpperCase() + ": " + callTimeRaw);
  if (wrapRaw && _f3Label)     d.push(_f3Label.toUpperCase() + ": " + wrapRaw);
  if (loc) {
    var locAddrStr = [loc.address, [loc.city, loc.state, loc.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    d.push("LOCATION: " + [loc.name, locAddrStr].filter(Boolean).join(", "));
    if (loc.hospital) d.push("NEAREST HOSPITAL: " + loc.hospital.replace(/\n/g, ", "));
  }
  d.push("");

  if (entries.length) {
    d.push(DIVIDER); d.push("");
    d.push("DAY SCHEDULE"); d.push("");
    entries.forEach(function(e) { d.push((e.time||"") + (e.time && e.desc ? " \u2014 " : "") + (e.desc||"")); });
    d.push("");
  }

  if (kp.length) {
    d.push(DIVIDER); d.push("");
    d.push("KEY PERSONNEL"); d.push("");
    kp.forEach(function(p) { d.push(p.role + ": " + [p.name, p.email, p.phone].filter(Boolean).join(" | ")); });
    d.push("");
  }

  var excludedCrew = getDayExcludedCrew(dayId);
  var allCrew = (data.crew||[]).filter(function(c, i) {
    return excludedCrew.indexOf(crew[i]) === -1 && (c.name || c.position);
  });
  if (_includeCrewInICS && allCrew.length) {
    d.push(DIVIDER); d.push("");
    d.push("CREW"); d.push("");
    allCrew.forEach(function(c) {
      d.push((c.position||"") + ": " + [c.name, c.email, c.phone].filter(Boolean).join(" | ") + " \u25cf " + (STATUS_LABELS[c.status]||"TBD"));
    });
    d.push("");
  }

  if (data.billing_code) {
    d.push(DIVIDER); d.push("");
    d.push("BILLING CODE: " + data.billing_code); d.push("");
  }

  d.push(DIVIDER); d.push("");
  d.push("Generated by Slater \u2014 The Producer's Toolbox");
  d.push("productionlabs.io");

  var descVal = d.map(esc).join("\\n");
  var locStr = loc ? [loc.name, loc.address, [loc.city, loc.state, loc.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ") : "";

  var summary = [data.project_title, dayLabelDisplay + (callTimeRaw ? " \u2014 Crew Call " + callTimeRaw : "")].filter(Boolean).join(" | ");
  var dateStr = isoDate(dateIso);
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Slater//Production Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    fold("UID:" + dayId + "-" + Date.now() + "@slater"),
    "DTSTAMP:" + dtstamp,
  ];
  var endDateStr = isoDate(endDateIsoVal || dateIso);
  if (callT) {
    lines.push("DTSTART:" + dateStr + "T" + hhmmss(callT));
    lines.push("DTEND:" + endDateStr + "T" + hhmmss(wrapT));
  } else {
    lines.push("DTSTART;VALUE=DATE:" + dateStr);
    lines.push("DTEND;VALUE=DATE:" + endDateStr);
  }
  lines.push(fold("SUMMARY:" + esc(summary)));
  lines.push(fold("DESCRIPTION:" + descVal));
  if (locStr) lines.push(fold("LOCATION:" + esc(locStr)));
  lines.push(fold("ORGANIZER;CN=" + esc(orgName) + ":mailto:" + orgEmail));
  kp.forEach(function(p) {
    if (!p.email) return;
    lines.push(fold("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=" + esc(p.name||p.role) + ":mailto:" + p.email));
  });
  if (_includeCrewInICS) {
    (data.crew||[]).filter(function(c, i) { return excludedCrew.indexOf(crew[i]) === -1; }).forEach(function(c) {
      if (!c.email || (c.status !== "confirmed" && c.status !== "hold")) return;
      lines.push(fold("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=" + esc(c.name||c.position||"Crew") + ":mailto:" + c.email));
    });
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  var icsContent = lines.join("\r\n") + "\r\n";
  var blob = new Blob([icsContent], {type:"text/calendar;charset=utf-8"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  setStatus("Opening in calendar app...", "ok");
}

// ── Per-day cast & crew management ───────────────────────────────────────────
function getDayExcludedCrew(dayId) {
  try { return JSON.parse(localStorage.getItem('sday_excrew_'+dayId) || '[]'); } catch(e) { return []; }
}
function setDayExcludedCrew(dayId, excluded) {
  localStorage.setItem('sday_excrew_'+dayId, JSON.stringify(excluded));
  updateDayStaffCounts(dayId);
  autosaveTrigger();
}
function getDayExcludedTalent(dayId) {
  try { return JSON.parse(localStorage.getItem('sday_extal_'+dayId) || '[]'); } catch(e) { return []; }
}
function setDayExcludedTalent(dayId, excluded) {
  localStorage.setItem('sday_extal_'+dayId, JSON.stringify(excluded));
  updateDayStaffCounts(dayId);
  autosaveTrigger();
}
function getDayExcludedKP(dayId) {
  try { return JSON.parse(localStorage.getItem('sday_exkp_'+dayId) || '[]'); } catch(e) { return []; }
}
function setDayExcludedKP(dayId, excluded) {
  localStorage.setItem('sday_exkp_'+dayId, JSON.stringify(excluded));
  updateDayStaffCounts(dayId);
  autosaveTrigger();
}

function updateDayCrewBadge(dayId) { updateDayStaffCounts(dayId); }
function updateDayTalentBadge(dayId) { updateDayStaffCounts(dayId); }

function updateDayStaffCounts(dayId) {
  var countEl = document.getElementById(dayId+'_staff_counts');
  if (!countEl) return;
  var kpExcluded = getDayExcludedKP(dayId);
  var kpWithNames = kp.filter(function(id) { var e=document.getElementById(id+'_name'); return e&&e.value.trim(); });
  var kpIncluded = kpWithNames.filter(function(id) { return kpExcluded.indexOf(id)===-1; }).length;
  var crewExcluded = getDayExcludedCrew(dayId).filter(function(id) { return crew.indexOf(id) !== -1; });
  var crewIncluded = crew.length - crewExcluded.length;
  var talentExcluded = getDayExcludedTalent(dayId).filter(function(id) { return talent.indexOf(id) !== -1; });
  var talentIncluded = talent.length - talentExcluded.length;
  var parts = [];
  if (kpWithNames.length) parts.push(kpIncluded+' of '+kpWithNames.length+' key personnel');

  if (crew.length) parts.push(crewIncluded+' of '+crew.length+' crew');
  if (talent.length) parts.push(talentIncluded+' of '+talent.length+' talent');
  countEl.textContent = parts.join(' \xb7 ');
}

var _currentDayStaffId = null;

function openDayStaffModal(dayId) {
  _currentDayStaffId = dayId;
  var modal = document.getElementById('day-staff-modal');
  var dayLabel = (document.getElementById(dayId+'_label')||{}).value || 'Schedule Day';
  var dayDate = (document.getElementById(dayId+'_date')||{}).value || '';
  document.getElementById('day-staff-modal-title').textContent = dayLabel;
  document.getElementById('day-staff-modal-date').textContent = dayDate;
  var _modalBlacks = document.getElementById('day-staff-show-blacks');
  var _cardBlacks = document.getElementById(dayId+'_show_blacks');
  if (_modalBlacks && _cardBlacks) _modalBlacks.checked = _cardBlacks.checked;

  var statusColors = {tbd:'#9D9D99', pencil:'#E8B84B', hold:'#E07B39', confirmed:'#4A9E6B'};
  var statusLabels = {tbd:'TBD', pencil:'Pencil', hold:'1st Hold', confirmed:'Confirmed'};

  function makeRow(cb, name, subtitle, status) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)';
    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:13px;font-weight:500;color:var(--charcoal)';
    nameEl.textContent = name || '(unnamed)';
    info.appendChild(nameEl);
    if (subtitle) {
      var sub = document.createElement('div');
      sub.style.cssText = 'font-size:11px;color:var(--film-can);margin-top:1px';
      sub.textContent = subtitle;
      info.appendChild(sub);
    }
    if (status) {
      var pill = document.createElement('span');
      pill.style.cssText = 'font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;color:#fff;background:'+(statusColors[status]||'#9D9D99')+';flex-shrink:0;text-transform:uppercase;letter-spacing:.04em';
      pill.textContent = statusLabels[status]||status;
      row.appendChild(cb); row.appendChild(info); row.appendChild(pill);
    } else {
      row.appendChild(cb); row.appendChild(info);
    }
    return row;
  }

  // Key Personnel section
  var kpList = document.getElementById('day-staff-kp-list');
  kpList.innerHTML = '';
  var kpExcluded = getDayExcludedKP(dayId);
  var hasKP = false;
  kp.forEach(function(kpId) {
    var name = (document.getElementById(kpId+'_name')||{}).value||'';
    if (!name) return;
    hasKP = true;
    var role = (document.getElementById(kpId+'_role')||{}).value||'Key Personnel';
    var status = (document.getElementById(kpId+'_status')||{}).value||'tbd';
    var isIncluded = kpExcluded.indexOf(kpId) === -1;
    var cb = document.createElement('input'); cb.type='checkbox'; cb.checked=isIncluded;
    cb.style.cssText = 'accent-color:var(--charcoal);cursor:pointer;flex-shrink:0';
    (function(theId, checkbox) {
      checkbox.onchange = function() {
        var exc = getDayExcludedKP(dayId);
        if (checkbox.checked) exc = exc.filter(function(x){return x!==theId;});
        else if (exc.indexOf(theId)===-1) exc.push(theId);
        setDayExcludedKP(dayId, exc);
        updateDayStaffModalCounts(dayId);
        updateKPSelectAllState(dayId);
      };
    })(kpId, cb);
    kpList.appendChild(makeRow(cb, name, role, status));
  });
  if (!hasKP) kpList.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--film-can);font-size:13px">No key personnel added yet.</div>';

  // Crew section
  var crewList = document.getElementById('day-staff-crew-list');
  crewList.innerHTML = '';
  var crewExcluded = getDayExcludedCrew(dayId);
  crew.forEach(function(id) {
    var position = (document.getElementById(id+'_position')||{}).value||'';
    var name     = (document.getElementById(id+'_name')||{}).value||'';
    var status   = (document.getElementById(id+'_status')||{}).value||'tbd';
    if (!position && !name) return;
    var isIncluded = crewExcluded.indexOf(id) === -1;
    var cb = document.createElement('input'); cb.type='checkbox'; cb.checked=isIncluded;
    cb.style.cssText = 'accent-color:var(--charcoal);cursor:pointer;flex-shrink:0';
    (function(crewId, checkbox) {
      checkbox.onchange = function() {
        var exc = getDayExcludedCrew(dayId);
        if (checkbox.checked) exc = exc.filter(function(x){return x!==crewId;});
        else if (exc.indexOf(crewId)===-1) exc.push(crewId);
        setDayExcludedCrew(dayId, exc);
        updateDayStaffModalCounts(dayId);
        updateCrewSelectAllState(dayId);
      };
    })(id, cb);
    crewList.appendChild(makeRow(cb, name, position, status));
  });
  if (crew.length === 0) crewList.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--film-can);font-size:13px">No crew added yet.</div>';

  // Talent section
  var talentList = document.getElementById('day-staff-talent-list');
  talentList.innerHTML = '';
  var talentExcluded = getDayExcludedTalent(dayId);
  talent.forEach(function(id) {
    var name  = (document.getElementById(id+'_name')||{}).value||'';
    var title = (document.getElementById(id+'_title')||{}).value||'';
    var status = (document.getElementById(id+'_status')||{}).value||'tbd';
    if (!name) return;
    var isIncluded = talentExcluded.indexOf(id) === -1;
    var cb = document.createElement('input'); cb.type='checkbox'; cb.checked=isIncluded;
    cb.style.cssText = 'accent-color:var(--charcoal);cursor:pointer;flex-shrink:0';
    (function(talentId, checkbox) {
      checkbox.onchange = function() {
        var exc = getDayExcludedTalent(dayId);
        if (checkbox.checked) exc = exc.filter(function(x){return x!==talentId;});
        else if (exc.indexOf(talentId)===-1) exc.push(talentId);
        setDayExcludedTalent(dayId, exc);
        updateDayStaffModalCounts(dayId);
        updateTalentSelectAllState(dayId);
      };
    })(id, cb);
    talentList.appendChild(makeRow(cb, name, title, status));
  });
  if (talent.length === 0) talentList.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--film-can);font-size:13px">No talent added yet.</div>';

  updateDayStaffModalCounts(dayId);
  updateKPSelectAllState(dayId);
  updateCrewSelectAllState(dayId);
  updateTalentSelectAllState(dayId);
  modal.style.display = 'flex';
}

function closeDayStaffModal() {
  document.getElementById('day-staff-modal').style.display = 'none';
  if (_currentDayStaffId) updateDayStaffCounts(_currentDayStaffId);
  _currentDayStaffId = null;
}

function dayStaffSelectAll(category, includeAll) {
  if (!_currentDayStaffId) return;
  if (category === 'kp') {
    setDayExcludedKP(_currentDayStaffId, includeAll ? [] : kp.slice());
  } else if (category === 'crew') {
    setDayExcludedCrew(_currentDayStaffId, includeAll ? [] : crew.slice());
  } else if (category === 'talent') {
    setDayExcludedTalent(_currentDayStaffId, includeAll ? [] : talent.slice());
  }
  openDayStaffModal(_currentDayStaffId);
}

function updateDayStaffModalCounts(dayId) {
  var kpExcl = getDayExcludedKP(dayId);
  var kpWithNames = kp.filter(function(id){var e=document.getElementById(id+'_name');return e&&e.value.trim();});
  var kpInc = kpWithNames.filter(function(id){return kpExcl.indexOf(id)===-1;}).length;
  var crewExcl = getDayExcludedCrew(dayId).filter(function(id){return crew.indexOf(id)!==-1;});
  var crewInc = crew.length - crewExcl.length;
  var talExcl = getDayExcludedTalent(dayId).filter(function(id){return talent.indexOf(id)!==-1;});
  var talInc = talent.length - talExcl.length;
  var parts = [];
  if (kpWithNames.length) parts.push(kpInc+' of '+kpWithNames.length+' key personnel');
  if (crew.length) parts.push(crewInc+' of '+crew.length+' crew');
  if (talent.length) parts.push(talInc+' of '+talent.length+' talent');
  var el = document.getElementById('day-staff-count');
  if (el) el.textContent = parts.join(' \xb7 ');
}

function updateKPSelectAllState(dayId) {
  var cb = document.getElementById('day-staff-kp-all');
  if (cb) cb.checked = getDayExcludedKP(dayId).filter(function(id){return kp.indexOf(id)!==-1;}).length === 0;
}
function updateCrewSelectAllState(dayId) {
  var cb = document.getElementById('day-staff-crew-all');
  if (cb) cb.checked = getDayExcludedCrew(dayId).filter(function(id){return crew.indexOf(id)!==-1;}).length === 0;
}
function updateTalentSelectAllState(dayId) {
  var cb = document.getElementById('day-staff-talent-all');
  if (cb) cb.checked = getDayExcludedTalent(dayId).filter(function(id){return talent.indexOf(id)!==-1;}).length === 0;
}

async function generateDoc() {
  const btn = document.getElementById("gen-btn");
  btn.disabled = true; btn.innerHTML = '<span class="sp"></span>Building your call sheet...';
  document.getElementById("status-bar").style.display = "none";
  try {
    const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,AlignmentType,WidthType,BorderStyle,ShadingType,VerticalAlign,Header,Footer} = window.docx;
    const bdr = {style:BorderStyle.SINGLE, size:4, color:"BFBFBF"};
    const lbs = {top:bdr, bottom:bdr, left:bdr, right:bdr};
    const CM  = {top:58, bottom:58, left:58, right:58};
    const C0=805, C1=1566, C2=1399, C3=3526, C4=1249, C5=2245;
    const rh = [280, 268, 268, 640];
    const ph = [220, 80, 210, 210];

    function cell(ch,o={}) { return new TableCell({borders:lbs, width:o.w?{size:o.w,type:WidthType.DXA}:undefined, gridSpan:o.span, verticalMerge:o.vm, verticalAlign:o.va||VerticalAlign.TOP, shading:o.sh, margins:CM, children:ch}); }
    function tx(str,o={}) { return new TextRun({text:str||"", bold:o.b, size:o.s||20, color:o.c, font:"Calibri"}); }
    function pr(runs,o={}) { return new Paragraph({alignment:o.a||AlignmentType.LEFT, children:Array.isArray(runs)?runs:[runs]}); }
    function mc(w) { return new TableCell({borders:lbs, width:{size:w,type:WidthType.DXA}, verticalMerge:"continue", margins:CM, children:[pr([tx("")])]}); }
    function sp() { return new Paragraph({spacing:{before:60,after:60}, children:[new TextRun("")]}); }

    function makeHeader(left, right) {
      return new Header({children:[
        new Paragraph({
          children:[new TextRun({text:left, font:"Calibri", size:18}), new TextRun({text:"\t"+right, font:"Calibri", size:18})],
          tabStops:[{type:"right", position:10790}],
        }),
        new Paragraph({children:[new TextRun({text:"", size:18})]}),
      ]});
    }

    const data = gather();
    const ag = getAgencyInfo();
    const _agencyLogo = getAgencyLogoB64();
  const _agencyData = loadAgencyData();
  const _isSvg = _agencyData.logo && _agencyData.logo.includes("image/svg");
  const _agencyB64 = (!_isSvg && _agencyLogo) ? _agencyLogo : LB64;
  var _logoB64 = _agencyB64;
  if (data.doc_branding === "slater") { _logoB64 = LB64; }
  else if (data.doc_branding === "client") { var _cl = lookupCompanyLogo(data.client_company); if (_cl) _logoB64 = _cl; else console.warn("Client branding: no logo for", data.client_company); }
  const lb = b64u8(_logoB64);

    const pr_rows = (data.kp_cards||[]).map(function(p){return {role:p.role||"",name:p.name||"",phone:p.phone||""};});
    function getDayLocInfo(dayData) {
      var locName = dayData.loc_name || dayData.loc_id || "";
      if (!locName) return {name:"", address:"", notes:""};
      var locs = loadContacts().locations || [];
      var found = locs.find(function(l) { return l.name === locName; });
      if (found) return {
        name: found.name||"",
        address: [found.address, found.city, [found.state, found.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        notes: found.notes||""
      };
      return {name:locName, address:"", notes:""};
    }

    function buildCallSheet(dayData) {
      var l0 = getDayLocInfo(dayData);
      var _docCat = dayData.category || "shoot_day";
      var _docCfg = CATEGORY_CONFIG[_docCat] || CATEGORY_CONFIG['shoot_day'];
      var _docF1Label = _docCat === 'other' ? (dayData.f1_label || "Call Time") : (_docCfg.f1.show ? _docCfg.f1.label : "Call Time");
      var _docF3Label = _docCat === 'other' ? (dayData.f3_label || "Wrap") : (_docCfg.f3.show ? _docCfg.f3.label : "Wrap");
      const meals = [
        ...(_docCfg.hasMeals ? [
          ["BREAKFAST", dayData.breakfast||"8:00 am"],
          ["LUNCH",     dayData.lunch||"12:00 pm"],
        ] : []),
        ["SUNRISE",   dayData.sunrise||""],
        ["SUNSET",    dayData.sunset||""],
      ];
      const mealRh = _docCfg.hasMeals ? [280, 268, 268, 640] : [280, 640];
      const logo = new ImageRun({data:lb, transformation:{width:96,height:96}, type:"png"});

      const addrRows = meals.map(([lbl,val],i) => new TableRow({height:{value:mealRh[i]}, children:[
        new TableCell({borders:lbs, width:{size:C0+C1+C2,type:WidthType.DXA}, gridSpan:3,
          verticalMerge:i===0?"restart":"continue", verticalAlign:VerticalAlign.CENTER, margins:CM,
          children:i===0?(function(){
            var lines = [pr([tx(ag.name||"",{b:true,s:28})],{a:AlignmentType.CENTER})];
            if (ag.address) lines.push(pr([tx(ag.address,{s:16})],{a:AlignmentType.CENTER}));
            var csz = [ag.city||"",ag.state||""].filter(Boolean).join(", ")+(ag.zip?" "+ag.zip:"");
            if (csz.trim()) lines.push(pr([tx(csz.trim(),{s:16})],{a:AlignmentType.CENTER}));
            if (ag.phone) lines.push(pr([tx(ag.phone,{s:16})],{a:AlignmentType.CENTER}));
            return lines;
          })():[pr([tx("")])]}),
        new TableCell({borders:lbs, width:{size:C3,type:WidthType.DXA},
          verticalMerge:i===0?"restart":"continue", verticalAlign:VerticalAlign.CENTER, margins:CM,
          children:i===0?[pr([logo],{a:AlignmentType.CENTER})]:[pr([tx("")])]}),
        cell([pr([tx(lbl,{s:18,c:"7F7F7F"})])], {w:C4}),
        cell([pr([tx(val,{s:18})])], {w:C5}),
      ]}));

      const persRows = pr_rows.map((row,i) => new TableRow({height:{value:ph[i]}, children:[
        cell([pr([tx(row.role,{s:18,c:"7F7F7F"})])], {w:C0}),
        cell([pr([tx(row.name,{s:18})])], {w:C1}),
        cell([pr([tx(row.phone,{s:18})])], {w:C2}),
        i===0 ? new TableCell({borders:lbs,width:{size:C3,type:WidthType.DXA},verticalMerge:"restart",verticalAlign:VerticalAlign.CENTER,margins:CM,
          children:[pr([tx(data.project_title||"",{b:true,s:32,c:"262626"})],{a:AlignmentType.CENTER})]}) : mc(C3),
        i===0 ? new TableCell({borders:lbs,width:{size:C4,type:WidthType.DXA},verticalMerge:"restart",margins:CM,
          children:[pr([tx("BILLING",{s:18,c:"7F7F7F"})]),pr([tx("CODE",{s:18,c:"7F7F7F"})])]}) :
        i===1 ? mc(C4) :
        i===2 ? new TableCell({borders:lbs,width:{size:C4,type:WidthType.DXA},verticalMerge:"restart",margins:CM,
          children:[pr([tx("HOSPITAL",{s:18,c:"7F7F7F"})])]}) : mc(C4),
        i===0 ? new TableCell({borders:lbs,width:{size:C5,type:WidthType.DXA},verticalMerge:"restart",margins:CM,
          children:[pr([tx(data.billing_code||"",{s:18})])]}) :
        i===1 ? mc(C5) :
        i===2 ? new TableCell({borders:lbs,width:{size:C5,type:WidthType.DXA},verticalMerge:"restart",margins:CM,
          children:[pr([tx(dayData.hospital||"",{s:18})])]}) : mc(C5),
      ]}));

      const tbl1 = new Table({width:{size:10790,type:WidthType.DXA}, columnWidths:[C0,C1,C2,C3,C4,C5],
        rows:[...addrRows,...persRows]});

      const tbl2 = new Table({width:{size:10790,type:WidthType.DXA}, columnWidths:[3763,3520,3507], rows:[
        new TableRow({height:{value:40}, children:[
          cell([pr([tx("LOCATION",{s:18,c:"7F7F7F"})])], {w:3763}),
          new TableCell({borders:lbs,width:{size:3520,type:WidthType.DXA},verticalMerge:"restart",
            verticalAlign:VerticalAlign.CENTER,shading:{fill:"F5F0E8",type:ShadingType.CLEAR},margins:CM,
            children:[
              pr([tx(_docF1Label.toUpperCase(),{s:16,c:"7F7F7F"})],{a:AlignmentType.CENTER}),
              pr([
                tx(((dayData.call_time||"8am").replace(/am/i,"AM").replace(/pm/i,"PM"))+(dayData.tzAbbr?" "+dayData.tzAbbr:""),{b:true,s:56,c:"262626"}),
              ],{a:AlignmentType.CENTER}),
              pr([tx((dayData.end_date && dayData.end_date !== dayData.date) ? (dayData.date||"")+" — "+(dayData.end_date||"") : (dayData.date||""),{s:18,c:"262626"})],{a:AlignmentType.CENTER}),
              pr([tx(dayData.label||"",{s:18,c:"262626"})],{a:AlignmentType.CENTER}),
            ]}),
          cell([pr([tx("NOTES",{s:18,c:"7F7F7F"})])], {w:3507}),
        ]}),
        new TableRow({height:{value:1200}, children:[
          cell([pr([tx(l0.name||"",{b:true,s:18})]),pr([tx(l0.address||"",{s:18})])], {w:3763}),
          new TableCell({borders:lbs,width:{size:3520,type:WidthType.DXA},verticalMerge:"continue",
            shading:{fill:"F5F0E8",type:ShadingType.CLEAR},margins:CM,children:[pr([tx("")])]}),
          cell([pr([tx(l0.notes||"",{s:18})])], {w:3507}),
        ]}),
      ]});

      // AutoFit cell helper — no fixed width, lets Word size to content
      function acell(ch) {
        return new TableCell({
          borders: lbs, margins: CM,
          width: {size: 0, type: WidthType.AUTO},
          children: ch,
        });
      }

      const cd = data.crew.filter(function(c) {
        if (!c.position && !c.name) return false;
        if (dayData.excluded_crew && dayData.excluded_crew.length && c.id && dayData.excluded_crew.indexOf(c.id) !== -1) return false;
        return true;
      });
      const crewHasNotes = cd.some(c => c.notes && c.notes.trim());
      const cr = cd.map(c => new TableRow({children:[
        acell([pr([tx(c.position,{s:18})])]),
        acell([pr([tx(c.name,{s:18})])]),
        acell([pr([tx(c.email,{s:18})])]),
        acell([pr([tx(c.phone,{s:18})])]),
        ...(crewHasNotes ? [acell([pr([tx(c.notes,{s:18})])])] : []),
      ]}));

      const tbl3 = new Table({
        width:{size:10790, type:WidthType.DXA},
        layout: "autofit",
        rows:[
          new TableRow({children:[
            acell([pr([tx("POSITION",{s:18,c:"7F7F7F"})])]),
            acell([pr([tx("NAME",{s:18,c:"7F7F7F"})])]),
            acell([pr([tx("EMAIL",{s:18,c:"7F7F7F"})])]),
            acell([pr([tx("PHONE",{s:18,c:"7F7F7F"})])]),
            ...(crewHasNotes ? [acell([pr([tx("NOTES",{s:18,c:"7F7F7F"})])])] : []),
          ]}),
          ...cr,
        ]
      });

      const td = data.talent.filter(function(x) {
        if (!x.name) return false;
        if (dayData.excluded_talent && dayData.excluded_talent.length && x.id && dayData.excluded_talent.indexOf(x.id) !== -1) return false;
        return true;
      });
      const hasPhone = td.some(x => x.phone && x.phone.trim());
      const talentHasNotes = td.some(x => x.notes && x.notes.trim());
      const tr = td.map(x => new TableRow({children:[
        acell([pr([tx(x.name,{s:18})])]),
        acell([pr([tx(x.title,{s:18})])]),
        acell([pr([tx(x.email,{s:18})])]),
        ...(hasPhone ? [acell([pr([tx(x.phone,{s:18})])])] : []),
        ...(talentHasNotes ? [acell([pr([tx(x.notes,{s:18})])])] : []),
      ]}));

      const tbl4 = new Table({
        width:{size:10790, type:WidthType.DXA},
        layout: "autofit",
        rows:[
          new TableRow({children:[
            acell([pr([tx("TALENT",{s:18,c:"7F7F7F"})])]),
            acell([pr([tx("TITLE",{s:18,c:"7F7F7F"})])]),
            acell([pr([tx("EMAIL",{s:18,c:"7F7F7F"})])]),
            ...(hasPhone ? [acell([pr([tx("PHONE",{s:18,c:"7F7F7F"})])])] : []),
            ...(talentHasNotes ? [acell([pr([tx("NOTES",{s:18,c:"7F7F7F"})])])] : []),
          ]}),
          ...tr,
        ]
      });

      const tbl5 = new Table({width:{size:10790,type:WidthType.DXA}, columnWidths:[2200,8590], rows:[
        new TableRow({children:[
          cell([pr([tx("INVOICING",{s:18,c:"7F7F7F"})])],{w:2200}),
          cell([pr([tx("")])],{w:8590}),
        ]}),
        new TableRow({children:[
          cell([pr([tx("Billing Code:",{s:18})]),pr([tx(data.billing_code||"",{b:true,s:18})])],{w:2200}),
          cell([pr([tx((function(){var ag=getAgencyInfo();var billingEmail=ag.billing_email||"";var agencyName=ag.name||"Agency";if(ag.invoicing_text)return ag.invoicing_text;var _kpProducer=(data.kp_cards||[]).find(function(k){return k.name&&/prod/i.test(k.role);})||(data.kp_cards||[]).find(function(k){return k.name;});return"All CREW and GEAR Vendors - Please submit invoice to "+billingEmail+" using this code no later than five (5) days after the completion of the project. The invoice must include the Deliverable Code (to the left) and reference "+(_kpProducer?_kpProducer.name:"the Producer")+" to ensure proper approval routing. Producers -- please reference your EP or Project Lead.";})(),{s:18})])],{w:8590}),
        ]}),
      ]});

      return [tbl1,sp(),tbl2,sp(),tbl3,sp(),tbl4,sp(),tbl5];
    }

    function buildSchedulePage(dayData, schedEntries) {
      const logo = new ImageRun({data:lb, transformation:{width:96,height:96}, type:"png"});
      const hdrRow = new TableRow({height:{value:480}, children:[
        new TableCell({borders:lbs,width:{size:C0+C1+C2,type:WidthType.DXA},gridSpan:3,
          verticalAlign:VerticalAlign.CENTER,margins:CM,
          children:[
            pr([tx("WORKTANK",{b:true,s:28})],{a:AlignmentType.CENTER}),
            pr([tx("400 East Pine Street, Suite 301",{s:16})],{a:AlignmentType.CENTER}),
            pr([tx("Seattle, WA 98122",{s:16})],{a:AlignmentType.CENTER}),
            pr([tx("206.254.0950",{s:16})],{a:AlignmentType.CENTER}),
          ]}),
        new TableCell({borders:lbs,width:{size:C3,type:WidthType.DXA},
          verticalAlign:VerticalAlign.CENTER,margins:CM,
          children:[pr([logo],{a:AlignmentType.CENTER})]}),
        new TableCell({borders:lbs,width:{size:C4+C5,type:WidthType.DXA},gridSpan:2,
          verticalAlign:VerticalAlign.CENTER,margins:CM,
          children:[
            pr([tx(data.project_title||"",{b:true,s:24,c:"262626"})],{a:AlignmentType.CENTER}),
            pr([tx(dayData.label||"",{s:18,c:"7F7F7F"})],{a:AlignmentType.CENTER}),
            pr([tx(dayData.date||"",{s:18,c:"7F7F7F"})],{a:AlignmentType.CENTER}),
          ]}),
      ]});
      const hdrTbl = new Table({width:{size:10790,type:WidthType.DXA},
        columnWidths:[C0,C1,C2,C3,C4+C5], rows:[hdrRow]});

      const schedRows = (schedEntries||[]).map(e => new TableRow({children:[
        new TableCell({borders:lbs,width:{size:2000,type:WidthType.DXA},margins:CM,children:[pr([tx(e.time||"",{s:18})])]}),
        new TableCell({borders:lbs,width:{size:8790,type:WidthType.DXA},margins:CM,children:[pr([tx(e.desc||"",{s:18})])]}),
      ]}));

      const schedTbl = new Table({width:{size:10790,type:WidthType.DXA}, columnWidths:[2000,8790], rows:[
        new TableRow({children:[
          new TableCell({borders:lbs,width:{size:2000,type:WidthType.DXA},margins:CM,children:[pr([tx("TIME",{s:18,c:"7F7F7F"})])]}),
          new TableCell({borders:lbs,width:{size:8790,type:WidthType.DXA},margins:CM,children:[pr([tx("DESCRIPTION",{s:18,c:"7F7F7F"})])]}),
        ]}),
        ...schedRows,
      ]});

      return [hdrTbl, sp(), schedTbl];
    }

    const pp = {page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:540,left:720}}};
    // Build full timezone label for the location block
    const tzAbbrMap = {
      ET:["EST","EDT"], CT:["CST","CDT"], MT:["MST","MDT"], PT:["PST","PDT"],
      AKT:["AKST","AKDT"], HT:["HST","HST"], GMT:["GMT","GMT"], CET:["CET","CEST"],
    };
    var sdays = (data.schedule_days || []).filter(function(d) { return !d.exclude_callsheet; });
    if (!sdays.length) { setStatus("No schedule days to export — all days are excluded from call sheet.", "err"); btn.disabled=false; btn.innerHTML="&#8595; Call sheet (.docx)"; return; }
    var sd0 = sdays[0] || {};
    var sd1 = sdays[1] || {};

    const tzAbbr = (() => {
      const tz = data.timezone || "";
      if (!tz || tz === "none") return "";
      const pair = tzAbbrMap[tz] || [tz, tz];
      try {
        const d = new Date((sd0.date_iso || new Date().toISOString().slice(0,10)) + "T12:00:00");
        const m = d.getMonth()+1, day = d.getDate();
        const isDST = (m > 3 && m < 11) || (m === 3 && day >= 8) || (m === 11 && day < 8);
        return isDST ? pair[1] : pair[0];
      } catch(e) { return pair[0]; }
    })();

    function getDayHospital(sd) {
      return sd.hospital || data.hospital || "";
    }

    const day1 = {call_time:sd0.call_time,date:sd0.date,end_date:sd0.end_date||"",label:sd0.label,breakfast:sd0.breakfast,lunch:sd0.lunch,sunrise:sd0.sunrise,sunset:sd0.sunset,hospital:getDayHospital(sd0),loc_name:sd0.loc_name,loc_id:sd0.loc_id,tzAbbr,excluded_crew:sd0.excluded_crew||[],excluded_talent:sd0.excluded_talent||[],category:sd0.category||"shoot_day",f1_label:sd0.f1_label||"",f3_label:sd0.f3_label||""};
    const day2 = {call_time:sd1.call_time,date:sd1.date,end_date:sd1.end_date||"",label:sd1.label,breakfast:sd1.breakfast,lunch:sd1.lunch,sunrise:sd1.sunrise,sunset:sd1.sunset,golive:sd1.golive,hospital:getDayHospital(sd1),loc_name:sd1.loc_name,loc_id:sd1.loc_id,tzAbbr,excluded_crew:sd1.excluded_crew||[],excluded_talent:sd1.excluded_talent||[],category:sd1.category||"shoot_day",f1_label:sd1.f1_label||"",f3_label:sd1.f3_label||""};
    const doc = new Document({sections:[
      {properties:pp, headers:{default:makeHeader("Worktank Call Sheet", sd0.label||"Day 1 of 2")}, children:buildCallSheet(day1)},
      {properties:pp, headers:{default:makeHeader("Worktank Call Sheet", sd0.label||"Day 1 of 2")}, children:buildSchedulePage(day1, sd0.sched_entries||[])},
      {properties:pp, headers:{default:makeHeader("Worktank Call Sheet", sd1.label||"Day 2 of 2")}, children:buildCallSheet(day2)},
      {properties:pp, headers:{default:makeHeader("Worktank Call Sheet", sd1.label||"Day 2 of 2")}, children:buildSchedulePage(day2, sd1.sched_entries||[])},
    ]});

    let blob = await Packer.toBlob(doc);
    blob = await patchGridSpan(blob);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const pn = (data.project_title||"Call_Sheet").replace(/[^a-zA-Z0-9_\- ]/g,"").trim().replace(/ /g,"_");
    a.href=url; a.download="Worktank_"+pn+".docx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Call sheet downloaded successfully.", "ok");
  } catch(e) {
    console.error(e); setStatus("Error: "+e.message, "err");
  }
  btn.disabled = false; btn.innerHTML = "Download call sheet (.docx)";
}


loadSavedLogo();
if (typeof lucide !== 'undefined') lucide.createIcons();
refreshSchedLocDropdowns();
libSetSort(_libSortMode);  // applies active class to sort buttons and populates dropdown
refreshSidebar();

function updateSidebarUser(data) {
  var name = (data && data.name) || "";
  var dba  = (data && data.dba)  || "";
  var avatar = (data && data.avatar) || null;
  var parts = name.trim().split(/\s+/);
  var initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
  var avatarEl = document.getElementById("sidebar-avatar");
  var nameEl   = document.getElementById("sidebar-name");
  var dbaEl    = document.getElementById("sidebar-dba");
  if (avatarEl) {
    if (avatar) {
      avatarEl.innerHTML = '<img src="'+avatar+'" alt="">';
    } else {
      avatarEl.textContent = initials;
    }
  }
  if (nameEl) nameEl.textContent = name;
  if (dbaEl)  dbaEl.textContent  = dba;
}

API.getMe().then(function(data) {
  updateSidebarUser(data);
}).catch(function() {});

function logout() {
  var keysToRemove = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && (k.startsWith('slater_') || k.startsWith('sday_'))) keysToRemove.push(k);
  }
  keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
  fetch('/api/users/logout', {method:'POST'})
    .then(function() { window.location.href = '/login'; })
    .catch(function() { window.location.href = '/login'; });
}

function formatPhone(val) {
  var digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return '(' + digits;
  if (digits.length <= 6) return '(' + digits.slice(0,3) + ') ' + digits.slice(3);
  return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
}

document.addEventListener('input', function(e) {
  var el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  if (!el.id.endsWith('_phone') && !el.classList.contains('fmt-phone')) return;
  var pos = el.selectionStart;
  var oldLen = el.value.length;
  el.value = formatPhone(el.value);
  var newLen = el.value.length;
  el.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
});
wbInit();
if ((document.getElementById("project_type")||{}).value !== "post_production") addScheduleDay();
else rebuildInsertDividers();
setTimeout(refreshWbDaySelector, 200);
// Restore last project
(function() {
  var lastKey = localStorage.getItem("slater_last_project");
  if (!lastKey) return;
  currentSheetKey = lastKey;
  document.getElementById("lib-delete").style.display = "";
  document.getElementById("lib-duplicate").style.display = "";
  setTimeout(function() {
    API.getProject(lastKey).then(function(result) {
      // Bail if the user navigated to a different project while this was loading
      if (currentSheetKey !== lastKey) return;
      var sel = document.getElementById("lib-select");
      if (sel) sel.value = lastKey;
      if (result && result.data) {
        loadFormData(result.data);
      } else if (result && result._unauthenticated) {
        // Session expired — preserve the key so it restores after re-login
        currentSheetKey = null;
        if (sel) sel.value = "";
        document.getElementById("lib-delete").style.display = "none";
        document.getElementById("lib-duplicate").style.display = "none";
      } else {
        // Project not found or deleted — clear saved key
        currentSheetKey = null;
        localStorage.removeItem("slater_last_project");
        if (sel) sel.value = "";
        document.getElementById("lib-delete").style.display = "none";
        document.getElementById("lib-duplicate").style.display = "none";
      }
    });
  }, 500);
})();
// Fetch all projects in the background to populate Rundown tabs
setTimeout(fetchAllProjectsForRundown, 1000);
// Backfill contacts from all existing saved call sheets
(function() {
  try {
    const sheets = JSON.parse(localStorage.getItem("slater_callsheets")||"{}");
    const vals = Object.values(sheets);
    console.log("Backfilling contacts from", vals.length, "saved sheets");
    vals.forEach(sheet => mergeContactsFromSheet(sheet));
    const db = loadContacts();
    console.log("Contacts after backfill:", {staff:(db.staff && db.staff.length), crew:(db.crew && db.crew.length), talent:(db.talent && db.talent.length), locations:(db.locations && db.locations.length)});
  } catch(e) { console.error("Backfill failed:", e); }
})();
setTimeout(acAttachAll, 100);
setTimeout(updateVideoDueVisibility, 100);
setTimeout(initNoteEditorPaste, 200);
(function() {
  var defaultBtn = document.querySelector(".mobile-nav-btn[data-tab='project']");
  if (defaultBtn) defaultBtn.classList.add("active");
})();
document.getElementById("notes-search").addEventListener("input", function() {
  var query = this.value.trim();
  var clearBtn = document.getElementById("notes-search-clear");
  if (!query) { notesSearchClear(); clearBtn.style.display = "none"; return; }
  clearBtn.style.display = "block";
  notesSearch(query);
});
document.getElementById("notes-search-clear").addEventListener("click", function() {
  document.getElementById("notes-search").value = "";
  this.style.display = "none";
  notesSearchClear();
});
API.getAgencies().then(function(agencies) {
  _loadedAgencies = agencies || [];
  refreshAgencySelector();
  var def = _loadedAgencies.find(function(a) { return a.is_default; }) || _loadedAgencies[0];
  if (def) applyAgencyDefaults(def);
  else applyAgencySettings();
});
API.getContacts().then(function(serverData) {
  if (!serverData) return;
  var local = loadContacts();
  var merged = Object.assign({}, local);
  Object.keys(serverData).forEach(function(k) {
    if ((serverData[k]||[]).length > 0) merged[k] = serverData[k];
  });
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(merged));
  if (JSON.stringify(serverData) !== JSON.stringify(merged)) API.saveContacts(merged);
  // Repopulate location dropdowns now that contacts are loaded from server
  refreshSchedLocDropdowns();
});

// Wire autosave to all input/change events on the page
document.addEventListener("input", function(e) {
  if (e.target.closest(".contacts-modal") || e.target.closest("#agency-modal") || e.target.closest("#agency-manager-modal") || e.target.closest("#crop-modal")) return;
  autosaveTrigger();
});
document.addEventListener("change", function(e) {
  if (e.target.closest(".contacts-modal") || e.target.closest("#agency-modal") || e.target.closest("#agency-manager-modal") || e.target.closest("#crop-modal")) return;
  autosaveTrigger();
});

// Autosave on page unload/visibility change
document.addEventListener("visibilitychange", function() {
  if (document.hidden && currentSheetKey) autosaveNow();
});
window.addEventListener("beforeunload", function() {
  if (currentSheetKey) autosaveNow();
});

// ── SAMPLE DATA (remove before go-live) ───────────────────────────────────


# Session 5: Hands-on Test Checklist

Branch `data-model-rewrite`, commit `98f735b`. Everything tested here is local only; nothing is on main.

## Before you start

1. Open Terminal and run: `cd ~/Sites/slater && node server.js`
2. Go to http://localhost:3000/?contacts=v2
3. If something looks empty or broken right away (no roles, no contacts), the Mac may have started the wrong Postgres after a restart. Tell Claude, or run:
   `brew services stop postgresql@18 && brew services start postgresql@16`, then restart the server.

Tip: try it on a copy of a real project (Duplicate) so your real dev projects stay as they are.

## 1. Crew cards

- [ ] Add a crew card. Click the role field (top of the card). A list of roles opens, with Crew groups first.
- [ ] Type part of a role (e.g. "photo") and pick "Director of Photography". The card shows **DP**.
- [ ] Type a role that isn't on the list (e.g. "Grip Boss"). It stays as typed.
- [ ] Type an abbreviation exactly (e.g. "cam op") and click away. It becomes **Cam Op**.
- [ ] In the Name field, type a few letters. Everyone in Contacts shows up, crew people first, with their roles.
- [ ] Pick someone. Name, phone and email fill in. The name field gets a yellow edge on the left (= linked).
- [ ] Add a new card with an empty role, pick a person. The role fills from their crew role.
- [ ] Type over a linked name. The yellow edge goes away (unlinked).
- [ ] Type a new name that isn't in Contacts. Pick **+ Add "..." to contacts**. Check in Contacts that they were added with the card's role and phone.

## 2. Talent cards

- [ ] Add a talent card and pick a person who has a job title in Contacts. The Title fills from it.
- [ ] Pick someone with no job title but a talent role (e.g. Host). The Title shows the role name.

## 3. Key personnel (Project tab)

- [ ] On a new project, the EP and Producer cards look the same as before.
- [ ] Pick a person on the EP card. Name, phone and email fill in; role stays EP.

## 4. "Details changed in Contacts"

- [ ] Link a crew card to someone. Open Contacts, change that person's phone, save.
- [ ] Back on the card, a bar shows "Details changed in Contacts: phone (...)" with Update / Dismiss.
- [ ] Click **Dismiss**: card keeps the old phone, bar goes away. Reload the page: bar stays gone.
- [ ] Change the person's email in Contacts. The bar comes back. Click **Update**: card takes the new phone and email.
- [ ] Open an older project. No bars should appear just from opening it.

## 5. Schedule locations

- [ ] On a schedule day, click Location. The list shows your Locations from the new Contacts.
- [ ] Pick one. Address appears under it; nearest hospital fills in as before.
- [ ] Rename that location in Contacts. Back on the day, the name follows the rename.
- [ ] Type a name that isn't a location and click away. The field clears (same as before).
- [ ] Click the 📅 button on a day card. The calendar event now includes the location (this was missing before).

## 6. Crew configs

- [ ] Crew tab, **Save config**. A dialog asks for a name and "Roles only" or "Roles and assigned crew".
- [ ] Save one of each. In **Configs**, the one with crew says "with crew".
- [ ] Make some crew Confirmed / Pencil first, then save with crew. On a new project, load it: same people, same order as saved, **all TBD**.
- [ ] Load the roles-only one: roles only, no names, same order as saved.

## 7. Documents

- [ ] Generate a call sheet, workback and expense report on a real project. They should look exactly like before.
- [ ] On a project where you picked roles from the list, the call sheet shows the abbreviation (DP, EP, Cam Op).

## 8. Older projects

- [ ] Open a few older projects. People, roles and locations look exactly as before (no text changed).

## 9. Flag off (sanity check)

- [ ] Go to http://localhost:3000/?contacts=v1. Crew/talent name autocomplete and the location list work the old way.
- [ ] Go back to http://localhost:3000/?contacts=v2 when done.

## Also tell Claude

- Is the yellow edge on linked names a clear enough cue?
- Anything that felt slow, confusing, or got in the way.

---

# Round 2: re-test of your 5 notes (2026-10-07)

Open http://localhost:3000/?contacts=v2 (if it asks you to log in, open the link again afterwards).

## 1. Name list filtered by role
- [ ] On a crew card with a role picked (e.g. DP), click the empty Name field. Only people with that role are listed, under "People with the role ...".
- [ ] Click **Show all contacts** at the bottom. Everyone shows up. Click away and back: it's filtered again.
- [ ] On a card with a role nobody has yet, the list says so and still offers Show all contacts.
- [ ] Key personnel cards work the same way (e.g. EP lists people with Executive Producer).

## 2. Notes
- [ ] Pick a person who has Notes in Contacts on a card with empty Notes. Their notes fill in (several lines become one, separated by ";").
- [ ] Type something in a card's Notes first, then pick a person. Your text is kept.

## 3. Hospital (now lives on the location)
- [ ] Contacts > Locations > + New. Enter an address and click into another field. "Looking up..." then the hospital fills in. Create.
- [ ] Type your own hospital first, then enter the address: your text is kept. Click **Look up** to replace it on purpose.
- [ ] Try the addresses that failed before. Smith Tower should now find Harborview; Microsoft 5th Ave should find Lenox Health Greenwich Village.
- [ ] On a schedule day, pick a location that has a hospital. The day shows it and nothing overwrites it.
- [ ] Pick a location with no hospital. After a few seconds a message says the hospital was saved to that location, and the day shows it.
- [ ] Edit a location's hospital in Contacts. The schedule day follows.
- Note: the free map services can be slow at times (up to a minute). If it says the service is busy, click Look up again later or type it in.

## 4. "+" next to Location
- [ ] On a schedule day, type a new location name, then click **+**. Contacts opens a new location with that name filled in.
- [ ] Add the address and click **Create**. Contacts closes and the day is set to the new location (with its hospital).

## 5. Linked tag
- [ ] A linked name shows a yellow **LINKED** tag next to "Name". Hover it for the explanation.
- [ ] Type over the name: the tag goes away.

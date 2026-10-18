// ============================================================
// ScripterHub Rewards System (Tasks 9-10)
// Rewards = ad-link checkpoint flows that grant keys.
// The reward LINK encodes the config (works on static hosting:
// visitors' browsers read the config straight from the URL).
// ============================================================

// ONLY PROVIDERS THE WORKER ACTUALLY VERIFIES.
//
// This list used to offer nine. The worker has a REWARD_PROVIDERS table of
// four, and /sh/reward/save drops anything not in it:
//
//     if (!REWARD_PROVIDERS[provider]) continue;      // silently drop unknowns
//
// So AdMint, ShrtFly, ShrinkEarn, Kicia and Rinku were selectable, savable in
// the panel, and then SILENTLY DISCARDED on save. The owner configures a
// five-checkpoint reward, the panel shows five, and the visitor gets fewer - so
// the reward can never be completed, because the checkpoints that were quietly
// deleted are the ones they cannot satisfy.
//
// Offering a provider the server cannot verify is worse than not offering it:
// it looks configured and is not. Anything added here must ALSO be added to
// REWARD_PROVIDERS in the worker AND given a branch in verifyProvider, or it
// belongs in neither list.
const REWARD_PROVIDERS = [
    { id: 'test', name: 'ScripterHub Default Test Page' },
    { id: 'linkvertise', name: 'Linkvertise' },
    { id: 'workink', name: 'Work.Ink' },
    { id: 'lootlabs', name: 'Lootlabs' }
];

// safe accessors into main.js module scope (exposed on window)
function shPlan() {
    var pc = window.PLAN_CONFIGS || {};
    var u = window.currentUser || {};
    // The literal fallback must match Basic in main.js: 10k visitors, 10
    // checkpoints. It had the old 25k/12, which contradicts the real table.
    return pc[u.plan] || pc['Basic'] || { visitors: 10000, checkpoints: 10 };
}

// FORWARDED TO THE DASHBOARD NOTIFIER. It used to call shNotify(...) here - i.e.
// itself - inside a window.showNotification guard, which is an unbounded
// recursion the moment a dashboard provides showNotification. It stayed
// dormant only because the guard was false in every context that mattered, and
// the fallback console.log made it look harmless.
//
// The recursion became visible the moment rewards started calling shNotify for
// ordinary outcomes ("Added - But Not Usable Yet", "Not Saved", migration
// counts), which is this change. The stack trace pointed at rewards.js and said
// nothing about the cause.
function shNotify(title, msg, type, dur) {
    if (typeof window.showNotification === 'function') {
        window.showNotification(title, msg, type, dur);
        return;
    }
    console.log('[SH] ' + title + ': ' + (msg || ''));
}

function loadRewardsData() {
    try {
        var uid = (window.currentUser && window.currentUser.id) || '';
        var data = localStorage.getItem('sh_rewards_' + uid);
        return data ? JSON.parse(data) : { rewards: [], visitors: 0 };
    } catch (e) { return { rewards: [], visitors: 0 }; }
}

function saveRewardsData(d) {
    try {
        var uid = (window.currentUser && window.currentUser.id) || '';
        localStorage.setItem('sh_rewards_' + uid, JSON.stringify(d));
    } catch (e) {}
}

// Push a reward to the worker and remember the rid it comes back with.
//
// WHY THE LINK IS NOW JUST AN ID
//
// encodeRewardCfg used to serialise the whole reward - name, duration, every
// checkpoint's URL and provider - into the share link as base64. Two problems,
// one of them fatal:
//
//   * It was unsigned and in the visitor's hands. Rewriting cps to a single
//     about:blank entry and appending ?done=0 produced a completed reward and
//     a key. The reward system paid out on demand.
//   * The provider API token was not in it (it was dropped instead), so nothing
//     was ever verified, and there was nowhere safe to put it: the link is
//     handed to every visitor, so a token in it would be readable by anyone who
//     opened the page, who could then forge a postback.
//
// So the config lives on the worker and the link carries the rid. The API
// tokens go to /sh/reward/save and never come back to a visitor.
//
// MIGRATION: a reward that predates this has no rid. The first save mints one,
// so the panel always shows the current link. The old ?r=... link stops
// working, which is the correct outcome - it was never signed, so anyone
// holding one could farm it forever.
async function shRewardSave(r) {
    try {
        var res = await window.shOwnerApi('sh/reward/save', { reward: r });
        if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'save failed' };
        return { ok: true, rid: res.rid, public: res.public, notReady: res.notReady || [] };
    } catch (e) {
        return { ok: false, error: 'network' };
    }
}

// Save and record the rid on the local record. Callers await this before
// rendering, because the link shown to the owner depends on the rid, and a
// panel that shows a stale link is how old links keep getting shared.
async function shRewardPersist(r) {
    var out = await shRewardSave(r);
    if (!out.ok) return out;
    r.rid = out.rid;
    r.notReady = out.notReady;
    // ADOPT THE WORKER'S COUNTERS.
    //
    // This block used to be:
    //
    //     prevCps[i].completed = prevCps[i].completed || 0;
    //
    // which assigns each field to itself. It reads as though it were copying
    // from `out.public.steps`, but out.public.steps carried no counters at all
    // (only {i, name, provider}), so there was nothing to copy from even if it
    // had.
    //
    // The server now returns them, and they are the authority - it also refuses
    // to accept client-sent counters, so this is the only path by which the
    // panel can learn the real numbers. Without this the "Completed" column is
    // frozen forever, which is reported as checkpoints not counting.
    //
    // Matched on id, so reordering the panel does not move a checkpoint's
    // history onto a different checkpoint.
    if (out.public && out.public.steps) {
        var byId = {};
        (r.checkpoints || []).forEach(function (c) { if (c && c.id) byId[String(c.id)] = c; });
        out.public.steps.forEach(function (s, i) {
            var target = byId[String(s.id || '')] || (r.checkpoints || [])[i];
            if (!target) return;
            if (typeof s.completed === 'number') target.completed = s.completed;
            if (typeof s.cancelled === 'number') target.cancelled = s.cancelled;
            if (typeof s.avgTimeSec === 'number') target.avgTimeSec = s.avgTimeSec;
        });
    }
    return out;
}

// Every reward on the panel must have a rid before its link is usable.
// Returns the number that had to be migrated, so the panel can say so out loud
// rather than the owner discovering it when a visitor reports a dead link.
async function shRewardMigrateAll() {
    var d = loadRewardsData();
    var migrated = 0;
    for (var i = 0; i < (d.rewards || []).length; i++) {
        var r = d.rewards[i];
        if (r.rid) continue;
        var out = await shRewardPersist(r);
        if (out.ok) migrated++;
    }
    if (migrated) saveRewardsData(d);
    return migrated;
}

// The public link carries ONLY the reward id.
//
// It used to carry the entire config, base64'd, unsigned - which is what let a
// visitor rewrite the checkpoint list and mint a key without visiting an ad.
// See shRewardSave for the whole argument.
// Set by tools/stamp_version.mjs to the first 12 hex of reward.html's SHA-256.
//
// reward.html is reached by navigation, so there is no <script> tag to hang a
// ?v= on and nothing in index.html to rewrite. Without this the visitor's
// browser keeps whatever copy of the page it already has, and a fix to the ad
// flow does not reach anyone who had the page open.
const REWARD_PAGE_STAMP = 'f6be800849d1';

function rewardLink(r) {
    if (!r.rid) return '';
    var path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    // ?w= is redundant with the tag in reward.html today, and that is the point:
    // if the worker ever moves, links generated after the move work without the
    // owner re-copying anything, and the tag only has to be corrected for links
    // already in people's hands.
    var w = (window.SH_STATS_ENDPOINT || '').replace(/\/+$/, '');
    return window.location.origin + path + 'reward.html?rid=' + encodeURIComponent(r.rid)
        + (w ? '&w=' + encodeURIComponent(w) : '')
        + (REWARD_PAGE_STAMP ? '&s=' + REWARD_PAGE_STAMP : '');
}

// A reward with no rid cannot be shared yet. The panel says so rather than
// showing a link that would 404 for whoever it is sent to.
function rewardLinkPending(r) {
    return !r.rid;
}


function totalCheckpointsUsed(d) {
    var n = 0;
    (d.rewards || []).forEach(function (r) { n += (r.checkpoints || []).length; });
    return n;
}

function initRewards() {
    renderRewardsTab();
}


function renderRewardsTab() {
    var statsRow = document.getElementById('rewardsStatsRow');
    var listEl = document.getElementById('rewardsList');
    if (!statsRow || !listEl) return;
    var d = loadRewardsData();
    var plan = shPlan();
    var visitorsMax = plan.visitors === Infinity ? '∞' : (plan.visitors >= 1000 ? (plan.visitors / 1000) + 'k' : plan.visitors);
    var cpsMax = plan.checkpoints === Infinity ? '∞' : plan.checkpoints;
    var cpsUsed = totalCheckpointsUsed(d);
    statsRow.innerHTML =
        '<div class="stat-card"><div class="stat-label">👥 Registered Visitors</div><div class="stat-value">' + (d.visitors || 0) + ' <span class="max">/ ' + visitorsMax + '</span></div><div class="stat-bar"><div class="fill" style="width:' + (plan.visitors === Infinity ? 2 : Math.min(100, (d.visitors || 0) / plan.visitors * 100)) + '%"></div></div></div>' +
        '<div class="stat-card"><div class="stat-label">🛤️ Total Checkpoints</div><div class="stat-value">' + cpsUsed + ' <span class="max">/ ' + cpsMax + '</span></div><div class="stat-bar"><div class="fill" style="width:' + (plan.checkpoints === Infinity ? 2 : Math.min(100, cpsUsed / plan.checkpoints * 100)) + '%"></div></div></div>';

    if (!d.rewards.length) {
        listEl.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">No rewards yet. Click "🎁 Create Reward" to make one - visitors will earn keys by completing ad checkpoints.</p>';
        return;
    }
    var html = '';
    d.rewards.forEach(function (r) {
        var link = rewardLink(r);
        var pending = rewardLinkPending(r);
        var cps = r.checkpoints || [];
        var unready = r.notReady || [];
        var unreadyIds = {};
        unready.forEach(function (n) { unreadyIds[n.id] = n; });

        html += '<div class="reward-card">';
        html += '<div class="reward-info">';
        html += '<div class="reward-name">🎁 ' + escapeHtml(r.name) + '</div>';

        if (pending) {
            // Never show a link that 404s. The old panel showed a base64 link
            // built from localStorage, which worked only until the visitor's
            // browser disagreed - and which anyone could edit into a free key.
        } else {
            html += '<div class="reward-link" title="' + escapeHtml(link) + '" onclick="copyText(\'' + link.replace(/'/g, "\\'") + '\')">🔗 ' + escapeHtml(link) + '</div>';
        }

        html += '<div class="reward-meta">🔑 ' + (r.keyDurationH || 1) + 'h keys · max ' + (r.maxKeys || 1) + ' key(s) · ' + cps.length + ' checkpoint(s)';
        if (cps.length === 0) html += ' · <span style="color:#ffb020">no checkpoints yet, nobody can earn a key</span>';
        html += '</div>';

        if (unready.length) {
            html += '<div class="warn" style="margin:8px 0 0">⚠️ ' + unready.length + ' checkpoint(s) cannot be completed: '
                + unready.map(function (n) { return escapeHtml(providerName(n.provider) || n.provider); }).join(', ')
                + '. Open each and paste its API key - until then no visitor can finish them.</div>';
        }
        html += '</div>';

        html += '<div class="reward-actions">';
        html += '<button onclick="openCheckpointManagerUI(\'' + r.id + '\')" class="btn-sm btn-sm-primary">➕ Add Checkpoint</button>';
        html += '<button onclick="openRewardSettingsUI(\'' + r.id + '\')" class="btn-sm btn-sm-edit">⚙️ Settings</button>';
        html += '<button onclick="deleteReward(\'' + r.id + '\')" class="btn-sm btn-sm-danger">🗑️ Delete</button>';
        html += '</div></div>';
    });
    listEl.innerHTML = html;

    // Rewards created before the config moved server-side have no rid, so they
    // have no shareable link. Mint one now rather than leaving the owner to
    // discover it when a visitor reports the link is dead.
    if (d.rewards.some(function (r) { return !r.rid; })) {
        shRewardMigrateAll().then(function (n) {
            if (n) shNotify('Rewards Updated', n + ' reward link(s) regenerated. The old links no longer work - share the new ones.', 'warning', 9000);
        });
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function openCreateRewardUI() {
    var projects = window.loadProjects ? window.loadProjects() : [];
    var projectOpts = projects.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('') || '<option value="">(no projects)</option>';
    var countries = ['Global', 'United States', 'United Kingdom', 'Germany', 'France', 'Russia', 'Ukraine', 'Poland', 'Brazil', 'India', 'Turkey', 'Vietnam', 'Japan', 'Canada', 'Australia'];
    var countryOpts = countries.map(function (c) { return '<option>' + c + '</option>'; }).join('');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 640px; padding: 28px; max-height:92vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h2 style="font-size:22px; margin:0;">🎁 Create Reward</h2>
                <div style="display:flex; gap:8px;">
                    <button onclick="confirmCreateReward()" class="btn btn-primary" style="padding:8px 18px;">💾 Save</button>
                    <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="padding:8px 18px;">Cancel</button>
                </div>
            </div>
            <div class="form-group"><label>Reward Name</label><input type="text" id="rewardName" placeholder="Visitors can see the name on checkpoint pages"></div>
            <div class="form-row-2">
                <div class="form-group"><label>Key Duration (hours)</label><input type="number" id="rewardKeyDuration" min="0.05" step="0.05" placeholder="e.g. 0.5 = 30 mins, 3 = 3 hours, 72 = 3 days"><div class="field-hint">How many hours key will last for</div></div>
                <div class="form-group"><label>Max Keys</label><input type="number" id="rewardMaxKeys" min="1" placeholder="How many keys a visitor can have at the same time"></div>
            </div>
            <div class="form-row-2">
                <div class="form-group"><label>Cooldown (hours)</label><input type="number" id="rewardCooldown" min="0" step="0.01" placeholder="e.g. 0.05 = 3 mins, 1 = 1 hour"><div class="field-hint">Hours users must wait before completing the reward again</div></div>
                <div class="form-group"><label>Max Hours <span style="color:#555577;">(optional)</span></label><input type="number" id="rewardMaxHours" min="0" placeholder="Max hours a user can have by extending"><div class="field-hint">Useful if you enabled extending and don't want users to have 10 years of key</div></div>
            </div>
            <div class="form-group" style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="rewardAllowExtending"> ➕ Allow Extending</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="rewardAllowForgetting"> 🔓 Allow Forgetting</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="rewardBlockIncognito"> 🕶️ Block Incognito</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="rewardBlockVPNs"> 🛰️ Block VPNs</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="rewardRequireDiscord" checked> 💬 Require Discord OAuth2</label>
            </div>
            <div class="field-hint" style="margin-bottom:10px;">➕ Extending = users extend existing keys by completing ads instead of new keys. 🔓 Forgetting = users can un-link their browser (bad for ad revenue, not recommended). 🕶️ Incognito block = more accurate targeting + higher CPA. 🛰️ VPN block = blocks mullvad/warp/protonvpn etc (higher traffic quality). 💬 Discord OAuth2 = harder to bypass the blacklist.</div>
            <div class="form-row-2">
                <div class="form-group"><label>Blocked Countries</label><select id="rewardBlockedCountries" multiple size="4" style="width:100%;">${countryOpts}</select><div class="field-hint">Ctrl+click to select multiple geo-restrictions</div></div>
                <div class="form-group"><label>Select A Project To Create The Key</label><select id="rewardProject">${projectOpts}</select><div class="field-hint">Keys only work for this project - checkpoints are attached to it</div></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Create a reward and push it to the worker.
//
// It is created on the worker FIRST, because the rid is what the share link is
// made of. A reward that exists only in localStorage has no link to hand out -
// which is precisely how the old flow ended up with a Start button pointing at
// about:blank and no way for a visitor to earn anything.
async function confirmCreateReward() {
    var name = document.getElementById('rewardName').value.trim();
    var dur = parseFloat(document.getElementById('rewardKeyDuration').value);
    var maxKeys = parseInt(document.getElementById('rewardMaxKeys').value, 10);
    if (!name) { shNotify('Error', 'Reward name is required.', 'error'); return; }
    if (isNaN(dur) || dur <= 0) { shNotify('Error', 'Key Duration (hours) is required.', 'error'); return; }
    if (isNaN(maxKeys) || maxKeys < 1) { shNotify('Error', 'Max Keys must be at least 1.', 'error'); return; }
    var d = loadRewardsData();
    var plan = shPlan();
    if (plan.checkpoints !== Infinity && totalCheckpointsUsed(d) >= plan.checkpoints) {
        shNotify('Plan Limit', 'You reached your Total Checkpoints limit (' + plan.checkpoints + '). Upgrade your plan to add more.', 'error');
        return;
    }
    var blocked = [];
    var sel = document.getElementById('rewardBlockedCountries');
    if (sel) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].selected && sel.options[i].text !== 'Global') blocked.push(sel.options[i].text);

    var reward = {
        id: 'rw_' + Date.now(),
        name: name,
        keyDurationH: dur,
        maxKeys: maxKeys,
        cooldownH: parseFloat(document.getElementById('rewardCooldown').value) || 0,
        maxHours: parseFloat(document.getElementById('rewardMaxHours').value) || 0,
        allowExtending: document.getElementById('rewardAllowExtending').checked,
        extHours: 6,
        checkpoints: [],
        createdAt: new Date().toISOString()
    };

    var out = await shRewardPersist(reward);
    if (!out.ok) {
        // Loudly. A reward that is not on the server cannot be shared, and a
        // quiet failure here is how the owner ends up handing out a dead link.
        shNotify('Not Saved', out.error === 'network'
            ? 'Could not reach the reward server. Check your connection - nothing was created.'
            : ('The reward server refused this reward: ' + out.error), 'error', 8000);
        return;
    }
    d.rewards.push(reward);
    saveRewardsData(d);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    shNotify('Reward Created', 'Now add checkpoints to "' + name + '".', 'success', 6000);
}
function findReward(id) {
    var d = loadRewardsData();
    for (var i = 0; i < d.rewards.length; i++) { if (d.rewards[i].id === id) return { data: d, reward: d.rewards[i] }; }
    return null;
}

async function deleteReward(id) {
    if (!confirm('Delete this reward and all its checkpoints?\n\nAnyone holding the old link will stop earning keys.')) return;
    var d = loadRewardsData();
    var target = null;
    for (var i = 0; i < d.rewards.length; i++) if (d.rewards[i].id === id) target = d.rewards[i];
    d.rewards = d.rewards.filter(function (r) { return r.id !== id; });

    // Removed from the SERVER first, and awaited.
    //
    // Dropping it from localStorage alone left the server copy live: the share
    // link kept resolving, the checkpoints kept verifying, and the owner had
    // every reason to believe the reward was gone. That is the same class of
    // bug as the Start button - a control that only changed the panel.
    var gone = false;
    if (target && target.rid) {
        try {
            var res = await window.shOwnerApi('sh/reward/delete', { rid: target.rid });
            gone = !!(res && res.ok);
        } catch (e) { gone = false; }
    } else { gone = true; }

    saveRewardsData(d);
    renderRewardsTab();
    if (!gone) {
        shNotify('Deleted Locally Only', 'The reward server did not confirm the delete, so the old link may still work. Try deleting it again.', 'error', 10000);
        return;
    }
    shNotify('Deleted', 'Reward deleted. The old link no longer works.', 'warning');
}

// ---------- Reward Settings ----------
function openRewardSettingsUI(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var projects = window.loadProjects ? window.loadProjects() : [];
    var projectOpts = projects.map(function (p) { return '<option value="' + p.id + '"' + (p.id === r.projectId ? ' selected' : '') + '>' + p.name + '</option>'; }).join('') || '<option value="">(no projects)</option>';
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 620px; padding: 28px; max-height:92vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h2 style="font-size:20px; margin:0;">⚙️ Reward Settings</h2>
                <div style="display:flex; gap:8px;">
                    <button onclick="confirmRewardSettings('${id}')" class="btn btn-primary" style="padding:8px 18px;">💾 Save</button>
                    <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="padding:8px 18px;">Cancel</button>
                </div>
            </div>
            <div class="form-group"><label>Reward Name</label><input type="text" id="editRewardName" value="${r.name.replace(/"/g, '&quot;')}"></div>
            <div class="form-row-2">
                <div class="form-group"><label>Key Duration (hours)</label><input type="number" id="editRewardDuration" step="0.05" value="${r.keyDurationH}"></div>
                <div class="form-group"><label>Max Keys</label><input type="number" id="editRewardMaxKeys" value="${r.maxKeys}"></div>
            </div>
            <div class="form-row-2">
                <div class="form-group"><label>Cooldown (hours)</label><input type="number" id="editRewardCooldown" step="0.01" value="${r.cooldownH}"></div>
                <div class="form-group"><label>Max Hours</label><input type="number" id="editRewardMaxHours" value="${r.maxHours || 0}"></div>
            </div>
            <div class="form-group"><label>Extend Hours (per extend action)</label><input type="number" id="editRewardExtHours" value="${r.extHours || 6}"><div class="field-hint">Hours added when a user clicks "+XH" on their key</div></div>
            <div class="form-group" style="display:flex; gap:14px; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editRewardExtending" ${r.allowExtending ? 'checked' : ''}> ➕ Allow Extending</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editRewardForgetting" ${r.allowForgetting ? 'checked' : ''}> 🔓 Allow Forgetting</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editRewardIncognito" ${r.blockIncognito ? 'checked' : ''}> 🕶️ Block Incognito</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editRewardVPNs" ${r.blockVPNs ? 'checked' : ''}> 🛰️ Block VPNs</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editRewardDiscord" ${r.requireDiscord ? 'checked' : ''}> 💬 Require Discord OAuth2</label>
            </div>
            <div class="form-group"><label>Project</label><select id="editRewardProject">${projectOpts}</select></div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function confirmRewardSettings(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    r.name = document.getElementById('editRewardName').value.trim() || r.name;
    r.keyDurationH = parseFloat(document.getElementById('editRewardDuration').value) || r.keyDurationH;
    r.maxKeys = parseInt(document.getElementById('editRewardMaxKeys').value, 10) || r.maxKeys;
    r.cooldownH = parseFloat(document.getElementById('editRewardCooldown').value) || 0;
    r.maxHours = parseFloat(document.getElementById('editRewardMaxHours').value) || 0;
    r.extHours = parseFloat(document.getElementById('editRewardExtHours').value) || 6;
    r.allowExtending = document.getElementById('editRewardExtending').checked;
    r.allowForgetting = document.getElementById('editRewardForgetting').checked;
    r.blockIncognito = document.getElementById('editRewardIncognito').checked;
    r.blockVPNs = document.getElementById('editRewardVPNs').checked;
    r.requireDiscord = document.getElementById('editRewardDiscord').checked;
    r.projectId = document.getElementById('editRewardProject').value;
    var out = await shRewardPersist(r);
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    if (!out.ok) {
        shNotify('Not Saved', 'The reward server refused this change' + (out.error ? ' (' + out.error + ')' : '') + '. Visitors still see the old settings.', 'error', 9000);
        return;
    }
    shNotify('Saved', 'Reward settings updated.', 'success');
}

// ---------- Checkpoint Manager ----------
function openCheckpointManagerUI(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var plan = shPlan();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var cpRows = '';
    (r.checkpoints || []).forEach(function (cp, i) {
        var pname = providerName(cp.provider);
        var bad = (r.notReady || []).filter(function (x) { return x.id === cp.id; });
        cpRows += '<div class="cp-row">' +
            '<span class="cp-order">' + (i + 1) + '</span>' +
            '<span class="cp-name"><strong>' + pname.toUpperCase() + ' ' + (cp.name || 'CHECKPOINT').toUpperCase() + '</strong>'
            + (bad.length ? '<div style="color:#ffb020;font-size:11px;margin-top:2px">⚠️ Cannot be completed yet - ' + escapeHtml(providerReadyHint(cp.provider)) + '</div>' : '')
            + '<a class="cp-link" href="' + escapeHtml(cp.shortUrl) + '" target="_blank" rel="noopener">' + escapeHtml(cp.shortUrl) + '</a></span>' +
            '<span class="cp-stats">' + (cp.completed || 0) + '/' + (cp.cancelled || 0) + '</span>' +
            '<span class="cp-avg">' + fmtAvgTime(cp.avgTimeSec) + '</span>' +
            '<span class="cp-move">' +
            '<button class="btn-sm btn-sm-edit" onclick="moveCheckpoint(\'' + id + '\',' + i + ',-1)" title="Up">⬆</button>' +
            '<button class="btn-sm btn-sm-edit" onclick="moveCheckpoint(\'' + id + '\',' + i + ',1)" title="Down">⬇</button></span>' +
            '<span class="cp-actions">' +
            '<button class="btn-sm btn-sm-primary" onclick="editCheckpointUI(\'' + id + '\',' + i + ')">Edit</button>' +
            '<button class="btn-sm btn-sm-danger" onclick="deleteCheckpoint(\'' + id + '\',' + i + ')">Delete</button></span>' +
            '</div>';
    });
    if (!cpRows) cpRows = '<p style="color:#8888aa; text-align:center; padding:16px 0;">No checkpoints yet - add the first one below.</p>';
    var providerOpts = '<option value="">Select A Provider:</option>' + REWARD_PROVIDERS.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
    overlay.innerHTML = `
        <div class="modal" style="max-width: 760px; padding: 28px; max-height:92vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:20px; margin:0 0 4px 0;">🛤️ Checkpoints - ${r.name}</h2>
            <div class="cp-table-header"><span>Order</span><span>Checkpoint</span><span>Completed/Cancelled</span><span>AVG. TIME SPENT</span><span>MOVE</span><span>ACTIONS</span></div>
            ${cpRows}
            <hr style="border-color:rgba(255,255,255,0.08); margin:18px 0;">
            <h3 style="font-size:16px; color:#fff; margin:0 0 10px 0;">➕ Add Checkpoint</h3>
            <div class="form-group"><label>Checkpoint Name</label><input type="text" id="cpName" placeholder="Visitors will not see the name"></div>
            <div class="form-group"><label>Short URL (the ad link)</label><input type="text" id="cpShortUrl" placeholder="https://direct-link.net/something">
                <div class="field-hint"><strong>This is where visitors are sent.</strong> Copy the short/ad link out of the provider's dashboard and paste it here.</div></div>
            <div class="form-group"><label>Select A Provider</label>
                <select id="cpProvider" onchange="renderProviderSettings()">${providerOpts}</select>
                <div class="field-hint">Each provider pays differently and verifies clicks differently. Pick one you have an account for, then paste its API key below - without it the checkpoint cannot be completed.</div>
            </div>
            <div id="cpProviderSettings"></div>
            <button onclick="confirmAddCheckpoint('${id}')" class="btn btn-primary" style="width:100%; margin-top:10px;">➕ Add Checkpoint</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function fmtAvgTime(sec) {
    sec = sec || 0;
    if (sec < 60) return Math.round(sec) + ' sec.';
    return Math.floor(sec / 60) + ' min. ' + Math.round(sec % 60) + ' sec.';
}

//
// It used to render the same shape for every provider - a one-line description
// pointing at the provider's website, plus whichever of anti-bypass / API key /
// postback fields that provider happened to use, with nothing saying which
// field was mandatory. The reported symptom was "you never added a provider of
// where it leads": the owner could not tell, from this dialog, what the
// checkpoint would do or what they still had to do.
//
// It now says, per provider: what it is, exactly which credential it needs,
// where that credential comes from, and - for providers this build cannot
// verify - that plainly, rather than letting the owner wire up something that
// silently never completes.
function renderProviderSettings() {
    var box = document.getElementById('cpProviderSettings');
    var sel = document.getElementById('cpProvider');
    if (!box || !sel) return;
    var p = sel.value;
    if (!p) { box.innerHTML = ''; return; }
    box.innerHTML = providerFieldsHtml(p, {});
}
async function confirmAddCheckpoint(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var name = document.getElementById('cpName').value.trim();
    var shortUrl = document.getElementById('cpShortUrl').value.trim();
    var provider = document.getElementById('cpProvider').value;
    if (!name) { shNotify('Error', 'Checkpoint name is required.', 'error'); return; }
    if (!shortUrl) { shNotify('Error', 'Short URL is required.', 'error'); return; }
    if (!provider) { shNotify('Error', 'Select a provider.', 'error'); return; }
    var plan = shPlan();
    var d = found.data;
    if (plan.checkpoints !== Infinity && totalCheckpointsUsed(d) >= plan.checkpoints) {
        shNotify('Plan Limit', 'You reached your Total Checkpoints limit (' + plan.checkpoints + ').', 'error');
        return;
    }
    var settings = {};
    var g = function (id2) { var el = document.getElementById(id2); return el ? el.value : ''; };
    var c = function (id2) { var el = document.getElementById(id2); return el ? el.checked : false; };
    if (c('cpAntiBypass')) settings.antiBypass = true;
    if (c('cpAdvAntiBypass')) settings.advancedAntiBypass = true;
    if (c('cpDynamicUrl')) settings.dynamicUrl = true;
    if (g('cpApiKey')) settings.apiKey = g('cpApiKey');
    if (g('cpAuthToken')) settings.authToken = g('cpAuthToken');
    if (g('cpPostbackUrl')) settings.postbackUrl = g('cpPostbackUrl');
    r.checkpoints.push({ id: 'cp_' + Date.now(), name: name, shortUrl: shortUrl, provider: provider, settings: settings, completed: 0, cancelled: 0, avgTimeSec: 0 });
    // A checkpoint that exists only in this tab cannot be completed by a
    // visitor, because the worker has never heard of it. Persist before the
    // dialog closes, and say plainly if it failed.
    var out = await shRewardPersist(r);
    saveRewardsData(d);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    if (!out.ok) {
        shNotify('Not Saved', 'The reward server refused this checkpoint' + (out.error ? ' (' + out.error + ')' : '') + '. Visitors cannot use it until this saves.', 'error', 9000);
        return;
    }
    var mine = (out.notReady || []).filter(function (x) { return x.id === r.checkpoints[r.checkpoints.length - 1].id; });
    if (mine.length) {
        shNotify('Added - But Not Usable Yet', 'Added, but it cannot be completed: ' + providerReadyHint(provider) + ' Edit it to paste the key.', 'warning', 10000);
        return;
    }
    shNotify('Checkpoint Added', '"' + name + '" added and is ready.', 'success');
}

async function moveCheckpoint(id, index, dir) {
    var found = findReward(id);
    if (!found) return;
    var cps = found.reward.checkpoints;
    var ni = index + dir;
    if (ni < 0 || ni >= cps.length) return;
    var tmp = cps[index]; cps[index] = cps[ni]; cps[ni] = tmp;
    await shRewardPersist(found.reward);
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    openCheckpointManagerUI(id);
}

async function deleteCheckpoint(id, index) {
    if (!confirm('Delete this checkpoint?')) return;
    var found = findReward(id);
    if (!found) return;
    found.reward.checkpoints.splice(index, 1);
    await shRewardPersist(found.reward);
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    openCheckpointManagerUI(id);
    shNotify('Deleted', 'Checkpoint deleted.', 'warning');
}
function editCheckpointUI(id, index) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var cp = r.checkpoints[index];
    if (!cp) return;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';

    // The verify URL is the worker's own signed callback. It is only known once
    // a visitor opens the reward, because the step token is minted per session -
    // so the dialog shows how to get one rather than a URL that would be dead.
    var pending = !r.rid;
    overlay.innerHTML = `
        <div class="modal" style="max-width: 660px; padding: 28px; max-height:92vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:20px; margin:0 0 10px 0;">✏️ Edit Checkpoint</h2>
            <div class="provider-panel">
                <div class="field-hint"><strong>Where this checkpoint goes:</strong> paste this checkpoint's own
                verify URL into the provider's dashboard as the link target, and put your ad link in the
                <em>Short URL</em> box below. The provider sends the visitor back to the verify URL when the ad
                finishes, and the worker then checks with the provider's API that the click was real.</div>
                ${pending ? '<div class="warn">This reward has not been saved to the reward server yet, so no verify URL exists. Press Save first.</div>' : ''}
            </div>
            <div class="form-group" style="margin-top:14px;"><label>Checkpoint Name</label>
                <input type="text" id="editCpName" value="${(cp.name || '').replace(/"/g, '&quot;')}"></div>
            <div class="form-group"><label>Short URL (the ad link visitors click)</label>
                <input type="text" id="editCpUrl" value="${(cp.shortUrl || '').replace(/"/g, '&quot;')}">
                <div class="field-hint">Visitors are sent here by the Start button.</div></div>
            <div class="form-group"><label>Provider</label>
                <input type="text" value="${escAttr(providerName(cp.provider))}" readonly>
                <div class="field-hint">The provider cannot be changed after creation - it decides which API verifies the click. Delete the checkpoint and add a new one to switch.</div></div>
            <div id="editCpProviderSettings"></div>
            <div style="display:flex; gap:8px; margin-top:14px;">
                <button onclick="confirmEditCheckpoint('${id}',${index})" class="btn btn-primary" style="flex:1;">💾 Save</button>
                <button onclick="clearCheckpointStats('${id}',${index})" class="btn btn-close-dropdown" style="flex:1;">🧹 Clear Stats</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Render the provider's own fields into the placeholder, pre-filled.
    var box = document.getElementById('editCpProviderSettings');
    box.innerHTML = providerFieldsHtml(cp.provider, cp.settings || {});
    wireProviderFields(box, cp.provider, cp.settings || {});
}

function providerName(pid) {
    var p = REWARD_PROVIDERS.find(function (x) { return x.id === pid; });
    return p ? p.name : pid;
}

function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}

// The credential each provider actually needs, stated plainly, because the old
// dialog showed a generic description and a single empty field regardless of
// provider - so the most common mistake was putting a Linkvertise auth token
// somewhere it was never read.
var PROVIDER_SETUP = {
    test: {
        desc: 'A built-in test page. No account, no API key. Use it to check the flow end to end before wiring a real provider.',
        needs: 'none',
        note: 'The visitor presses Verify themselves, so this proves nothing against a motivated bypasser. It proves the plumbing works.'
    },
    linkvertise: {
        desc: 'High CPM and widely recognised. Linkvertise must have <strong>Anti Bypassing</strong> enabled in Settings &rarr; Account, which issues the API token.',
        needs: 'authToken',
        note: 'Anti-Bypass is REQUIRED. Without it Linkvertise cannot tell us who clicked, and this checkpoint will never complete.'
    },
    lootlabs: {
        desc: 'Pays well and has cash-out options. API token is on your <strong>Profile</strong> page.',
        needs: 'apiKey',
        note: 'Put the same URL as the link target on their dashboard. LootLabs appends the click id for us.'
    },
    workink: {
        desc: 'Developer API key from <strong>dashboard.work.ink &rarr; Developer</strong>. Supports a click-id macro in the target URL.',
        needs: 'apiKey',
        note: 'Enable <strong>Advanced Anti-Bypass</strong> on their dashboard and set the postback there too, or clicks will not be confirmed.'
    },
    admint: {
        desc: 'Low minimum payouts, crypto/PayPal/bank withdrawal.',
        needs: 'apiKey',
        note: 'Not yet wired to a confirmation API - this checkpoint cannot complete until it is.'
    },
    shrtfly: { desc: 'ShrtFly publisher API token.', needs: 'apiKey', note: 'Not yet wired to a confirmation API - this checkpoint cannot complete until it is.' },
    shrinkearn: { desc: 'ShrinkEarn API token.', needs: 'apiKey', note: 'Not yet wired to a confirmation API - this checkpoint cannot complete until it is.' },
    kicia: { desc: 'Private ad provider.', needs: 'apiKey', note: 'Not yet wired to a confirmation API.' },
    rinku: { desc: 'Rinku.pro.', needs: 'apiKey', note: 'Not yet wired to a confirmation API.' }
};

// Which providers the WORKER can actually verify right now. Anything else is
// refused rather than completed on a timer, which is the whole point of the
// anti-bypass feature.
var VERIFIABLE = { test: 1, linkvertise: 1, lootlabs: 1, workink: 1 };

function providerFieldsHtml(provider, st) {
    var spec = PROVIDER_SETUP[provider] || { desc: '', needs: 'apiKey', note: '' };
    var html = '<div class="provider-panel"><div class="provider-desc">' + spec.desc + '</div>';
    if (!VERIFIABLE[provider]) {
        html += '<div class="warn">This provider is not wired to a confirmation API yet, so a visitor can never '
            + 'complete this checkpoint. It is listed for completeness only.</div>';
    }
    if (spec.needs === 'authToken') {
        html += '<div class="form-group"><label>API Token</label>'
            + '<input type="text" id="cpAuthToken" value="' + escAttr(st.authToken || '') + '" placeholder="Linkvertise Settings &rarr; Account &rarr; Anti Bypassing">'
            + '<div class="field-hint">Stored on the server only. It is never included in the share link.</div></div>';
    } else if (spec.needs === 'apiKey') {
        html += '<div class="form-group"><label>API Key</label>'
            + '<input type="text" id="cpApiKey" value="' + escAttr(st.apiKey || '') + '" placeholder="Provider developer dashboard">'
            + '<div class="field-hint">Stored on the server only. It is never included in the share link.</div></div>';
    } else {
        html += '<div class="field-hint">' + spec.note + '</div>';
    }
    if (spec.note && spec.needs !== 'none') {
        html += '<div class="field-hint" style="margin-top:8px">' + spec.note + '</div>';
    }
    html += '</div>';
    return html;
}

// Keep the checkbox/toggle ids unique to the dialog they live in, so the
// create dialog and the edit dialog cannot read each other's fields.
function wireProviderFields() { /* ids are already scoped by id; nothing to wire */ }
// Save an edited checkpoint, provider settings included.
//
// The settings are read back out of the dialog by the same ids the provider
// form renders, and pushed to the worker with the rest of the reward. The old
// version saved only the name and the URL - so the API token was neither
// editable nor, as it turned out, ever transmitted.
//
// The save is AWAITED before the dialog closes. Closing first and syncing after
// is how a token can silently fail to reach the server while the panel reports
// a cheerful "Saved".
async function confirmEditCheckpoint(id, index) {
    var found = findReward(id);
    if (!found) return;
    var cp = found.reward.checkpoints[index];
    if (!cp) return;

    cp.name = document.getElementById('editCpName').value.trim() || cp.name;
    cp.shortUrl = document.getElementById('editCpUrl').value.trim() || cp.shortUrl;

    var g = function (i) { var el = document.getElementById(i); return el ? el.value.trim() : ''; };
    cp.settings = cp.settings || {};
    if (g('cpAuthToken') !== '') cp.settings.authToken = g('cpAuthToken');
    if (g('cpApiKey') !== '') cp.settings.apiKey = g('cpApiKey');

    var out = await shRewardPersist(found.reward);
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    openCheckpointManagerUI(id);

    if (!out.ok) {
        shNotify('Not Saved', out.error === 'network'
            ? 'Could not reach the reward server. Your change is in this tab only and the visitor link will not pick it up.'
            : ('The reward server refused this: ' + out.error), 'error', 9000);
        return;
    }
    var unready = (out.notReady || []).filter(function (n) { return n.id === cp.id; });
    if (unready.length) {
        shNotify('Saved - But Not Usable Yet',
            'This checkpoint still cannot be completed: ' + providerReadyHint(unready[0].provider),
            'warning', 9000);
        return;
    }
    shNotify('Saved', 'Checkpoint updated.', 'success');
}

// Why a provider cannot complete yet, in the owner's words.
function providerReadyHint(provider) {
    if (provider === 'linkvertise') return 'paste your Linkvertise Anti-Bypassing API token above.';
    if (provider === 'lootlabs') return 'paste your LootLabs API token above.';
    if (provider === 'workink') return 'paste your Work.Ink API key above.';
    return 'that provider is not wired to a confirmation API yet, so no visitor can complete it.';
}
function clearCheckpointStats(id, index) {
    var found = findReward(id);
    if (!found) return;
    var cp = found.reward.checkpoints[index];
    if (!cp) return;
    cp.completed = 0; cp.cancelled = 0; cp.avgTimeSec = 0;
    // Cleared on the server too. The worker keeps its own tallies, and a panel
    // that showed zeros while the server still counted them would report a
    // checkpoint as failing when it was in fact converting normally.
    shRewardPersist(found.reward).then(function () {
        saveRewardsData(found.data);
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        openCheckpointManagerUI(id);
        shNotify('Stats Cleared', 'Checkpoint stats reset.', 'info');
    });
}
window.renderRewardsTab = renderRewardsTab;
window.openCreateRewardUI = openCreateRewardUI;
window.openCheckpointManagerUI = openCheckpointManagerUI;
window.openRewardSettingsUI = openRewardSettingsUI;
window.confirmCreateReward = confirmCreateReward;
window.confirmRewardSettings = confirmRewardSettings;
window.deleteReward = deleteReward;
window.confirmAddCheckpoint = confirmAddCheckpoint;
window.renderProviderSettings = renderProviderSettings;
window.moveCheckpoint = moveCheckpoint;
window.deleteCheckpoint = deleteCheckpoint;
window.editCheckpointUI = editCheckpointUI;
window.confirmEditCheckpoint = confirmEditCheckpoint;
window.clearCheckpointStats = clearCheckpointStats;
window.rewardLink = rewardLink;
window.loadRewardsData = loadRewardsData;

export { initRewards, renderRewardsTab, openCreateRewardUI };

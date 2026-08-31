// ============================================================
// ScripterHub Rewards System (Tasks 9-10)
// Rewards = ad-link checkpoint flows that grant keys.
// The reward LINK encodes the config (works on static hosting:
// visitors' browsers read the config straight from the URL).
// ============================================================

const REWARD_PROVIDERS = [
    { id: 'test', name: 'ScripterHub Default Test Page' },
    { id: 'admint', name: 'AdMint' },
    { id: 'linkvertise', name: 'Linkvertise' },
    { id: 'workink', name: 'Work.Ink' },
    { id: 'lootlabs', name: 'Lootlabs' },
    { id: 'shrtfly', name: 'ShrtFly' },
    { id: 'shrinkearn', name: 'ShrinkEarn' },
    { id: 'kicia', name: 'Kicia.net' },
    { id: 'rinku', name: 'Rinku.pro' }
];

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

function encodeRewardCfg(r) {
    var cfg = { n: r.name, d: r.keyDurationH, mk: r.maxKeys, cd: r.cooldownH, mh: r.maxHours || 0, ext: r.allowExtending ? 1 : 0, eh: r.extHours || 6, cps: [] };
    (r.checkpoints || []).forEach(function (cp) { cfg.cps.push({ u: cp.shortUrl, p: cp.provider }); });
    var json = JSON.stringify(cfg);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function rewardLink(r) {
    var path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    return window.location.origin + path + 'reward.html?r=' + encodeRewardCfg(r);
}

function rewardHash(cfgStr) {
    var h = 0;
    for (var i = 0; i < cfgStr.length; i++) { h = (h * 31 + cfgStr.charCodeAt(i)) % 999999937; }
    return h;
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
    var plan = (window.PLAN_CONFIGS && PLAN_CONFIGS[(window.currentUser && currentUser.plan) || 'Basic']) || PLAN_CONFIGS['Basic'];
    var visitorsMax = plan.visitors === Infinity ? '∞' : (plan.visitors >= 1000 ? (plan.visitors / 1000) + 'k' : plan.visitors);
    var cpsMax = plan.checkpoints === Infinity ? '∞' : plan.checkpoints;
    var cpsUsed = totalCheckpointsUsed(d);
    var blocked = false;
    if (plan.checkpoints !== Infinity && cpsUsed >= plan.checkpoints) blocked = true;
    statsRow.innerHTML =
        '<div class="stat-card"><div class="stat-label">👥 Registered Visitors</div><div class="stat-value">' + d.visitors + ' <span class="max">/ ' + visitorsMax + '</span></div><div class="stat-bar"><div class="fill" style="width:' + (plan.visitors === Infinity ? 2 : Math.min(100, d.visitors / plan.visitors * 100)) + '%"></div></div></div>' +
        '<div class="stat-card"><div class="stat-label">🛤️ Total Checkpoints</div><div class="stat-value">' + cpsUsed + ' <span class="max">/ ' + cpsMax + '</span></div><div class="stat-bar"><div class="fill" style="width:' + (plan.checkpoints === Infinity ? 2 : Math.min(100, cpsUsed / plan.checkpoints * 100)) + '%"></div></div></div>';
    if (!d.rewards.length) {
        listEl.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">No rewards yet. Click "🎁 Create Reward" to make one - visitors will earn keys by completing ad checkpoints.</p>';
        return;
    }
    var html = '';
    d.rewards.forEach(function (r) {
        var link = rewardLink(r);
        html += '<div class="reward-card">' +
            '<div class="reward-info">' +
            '<div class="reward-name">🎁 ' + r.name + '</div>' +
            '<div class="reward-link" title="' + link + '" onclick="copyText(\'' + link + '\')">🔗 ' + link + '</div>' +
            '<div class="reward-meta">🔑 ' + (r.keyDurationH || 0) + 'h keys · max ' + (r.maxKeys || 1) + ' key(s) · ' + ((r.checkpoints || []).length) + ' checkpoint(s)</div>' +
            '</div>' +
            '<div class="reward-actions">' +
            '<button onclick="openCheckpointManagerUI(\'' + r.id + '\')" class="btn-sm btn-sm-primary">➕ Add Checkpoint</button>' +
            '<button onclick="openRewardSettingsUI(\'' + r.id + '\')" class="btn-sm btn-sm-edit">⚙️ Settings</button>' +
            '<button onclick="deleteReward(\'' + r.id + '\')" class="btn-sm btn-sm-danger">🗑️ Delete Reward</button>' +
            '</div></div>';
    });
    listEl.innerHTML = html;
}

// ---------- Create Reward ----------
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

function confirmCreateReward() {
    var name = document.getElementById('rewardName').value.trim();
    var dur = parseFloat(document.getElementById('rewardKeyDuration').value);
    var maxKeys = parseInt(document.getElementById('rewardMaxKeys').value, 10);
    if (!name) { window.showNotification('Error', 'Reward name is required.', 'error'); return; }
    if (isNaN(dur) || dur <= 0) { window.showNotification('Error', 'Key Duration (hours) is required.', 'error'); return; }
    if (isNaN(maxKeys) || maxKeys < 1) { window.showNotification('Error', 'Max Keys must be at least 1.', 'error'); return; }
    var d = loadRewardsData();
    var plan = (window.PLAN_CONFIGS && PLAN_CONFIGS[(window.currentUser && currentUser.plan) || 'Basic']) || PLAN_CONFIGS['Basic'];
    if (plan.checkpoints !== Infinity && totalCheckpointsUsed(d) >= plan.checkpoints) {
        window.showNotification('Plan Limit', 'You reached your Total Checkpoints limit (' + plan.checkpoints + '). Upgrade your plan to add more.', 'error');
        return;
    }
    var blocked = [];
    var sel = document.getElementById('rewardBlockedCountries');
    if (sel) for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].selected && sel.options[i].text !== 'Global') blocked.push(sel.options[i].text); }
    d.rewards.push({
        id: 'rw_' + Date.now(),
        name: name,
        keyDurationH: dur,
        maxKeys: maxKeys,
        cooldownH: parseFloat(document.getElementById('rewardCooldown').value) || 0,
        maxHours: parseFloat(document.getElementById('rewardMaxHours').value) || 0,
        allowExtending: document.getElementById('rewardAllowExtending').checked,
        allowForgetting: document.getElementById('rewardAllowForgetting').checked,
        blockIncognito: document.getElementById('rewardBlockIncognito').checked,
        blockVPNs: document.getElementById('rewardBlockVPNs').checked,
        requireDiscord: document.getElementById('rewardRequireDiscord').checked,
        blockedCountries: blocked,
        projectId: document.getElementById('rewardProject').value,
        extHours: 6,
        checkpoints: [],
        createdAt: new Date().toISOString()
    });
    saveRewardsData(d);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    window.showNotification('Reward Created', 'Now add checkpoints to "' + name + '"!', 'success');
}

function findReward(id) {
    var d = loadRewardsData();
    for (var i = 0; i < d.rewards.length; i++) { if (d.rewards[i].id === id) return { data: d, reward: d.rewards[i] }; }
    return null;
}

function deleteReward(id) {
    if (!confirm('Delete this reward and all its checkpoints?')) return;
    var d = loadRewardsData();
    d.rewards = d.rewards.filter(function (r) { return r.id !== id; });
    saveRewardsData(d);
    renderRewardsTab();
    window.showNotification('Deleted', 'Reward deleted.', 'warning');
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

function confirmRewardSettings(id) {
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
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    window.showNotification('Saved', 'Reward settings updated.', 'success');
}

// ---------- Checkpoint Manager ----------
function openCheckpointManagerUI(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var plan = (window.PLAN_CONFIGS && PLAN_CONFIGS[(window.currentUser && currentUser.plan) || 'Basic']) || PLAN_CONFIGS['Basic'];
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var cpRows = '';
    (r.checkpoints || []).forEach(function (cp, i) {
        var providerName = (REWARD_PROVIDERS.find(function (p) { return p.id === cp.provider; }) || {}).name || cp.provider;
        cpRows += '<div class="cp-row">' +
            '<span class="cp-order">' + (i + 1) + '</span>' +
            '<span class="cp-name"><strong>' + providerName.toUpperCase() + ' ' + (cp.name || 'CHECKPOINT').toUpperCase() + '</strong><a class="cp-link" href="' + cp.shortUrl + '" target="_blank" rel="noopener">' + cp.shortUrl + '</a></span>' +
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
            <div class="form-group"><label>Short URL</label><input type="text" id="cpShortUrl" placeholder="https://direct-link.net/something"><div class="field-hint">You can get the URL from provider dashboard</div></div>
            <div class="form-group"><label>Select A Provider</label>
                <select id="cpProvider" onchange="renderProviderSettings()">${providerOpts}</select>
                <div class="field-hint">Each provider has their own money per click rate. To suggest a new provider, talk to Scripter in discord.</div>
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

var CP_PROVIDER_INFO = {
    test: 'You can use this page to test how it will work. It is an example ad page without any real ads.<br>To use, you must put <b>https://ads.luarmor.net/testpage</b> as the URL above.',
    admint: 'Multiple payout options, ultra low minimums, and flexible withdrawals via Crypto, PayPal, or Bank Transfer. See how AdMint works at <a href="https://admint.club" target="_blank" rel="noopener" style="color:#66ccff;">admint.club</a>',
    linkvertise: 'See how linkvertise works at <a href="https://linkvertise.com" target="_blank" rel="noopener" style="color:#66ccff;">linkvertise.com</a>',
    workink: 'See how work.ink works at <a href="https://work.ink" target="_blank" rel="noopener" style="color:#66ccff;">work.ink</a>',
    lootlabs: 'One of the best-paying providers. See how Lootlabs works on <a href="https://lootlabs.gg/" target="_blank" rel="noopener" style="color:#66ccff;">their site</a>.',
    shrtfly: 'See how ShrtFly works on <a href="https://www.shrtfly.com/" target="_blank" rel="noopener" style="color:#66ccff;">their site</a>.',
    shrinkearn: 'See how ShrinkEarn works on <a href="https://shrinkearn.com/" target="_blank" rel="noopener" style="color:#66ccff;">their site</a>.',
    kicia: 'This is a private ad provider, not for public use.',
    rinku: 'Rinku.pro'
};

function renderProviderSettings() {
    var box = document.getElementById('cpProviderSettings');
    var sel = document.getElementById('cpProvider');
    if (!box || !sel) return;
    var p = sel.value;
    if (!p) { box.innerHTML = ''; return; }
    var info = CP_PROVIDER_INFO[p] || '';
    var html = '<div class="provider-panel"><div class="provider-desc">' + info + '</div>';
    if (p === 'test') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpExampleT1"> Example Setting Toggle = Example description.</label></div>' +
            '<div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="cpExampleT2"> Example Setting Toggle = Example description.</label></div>' +
            '<div class="form-group"><label>Example Setting Field = Example description.</label><input type="text" id="cpExampleF1"></div>';
    } else if (p === 'admint') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpAntiBypass" checked> 🛡️ Anti Bypass = Generates encrypted target URLs per visitor to make it harder to bypass.</label></div>' +
            '<div class="form-group"><label>API Key</label><input type="text" id="cpApiKey" placeholder="Get your AdMint API key from admint.club/dashboard/settings"></div>';
    } else if (p === 'linkvertise') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpAntiBypass" checked> 🛡️ Anti Bypass = You must enable ANTI BYPASS in linkvertise settings before using this feature.</label></div>' +
            '<div class="form-group"><label>Auth Token</label><input type="text" id="cpAuthToken" placeholder="Only required if anti bypass is enabled - get it in linkvertise settings"></div>';
    } else if (p === 'workink') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpAntiBypass" checked> 🛡️ Anti Bypass = Uses encrypted redirect URLs to be unique for every visitor.</label></div>' +
            '<div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="cpAdvAntiBypass"> 🚀 Advanced Anti-Bypass = Performs advanced checks to detect bypasses (undocumented API, thanks to Work.Ink devs).</label></div>' +
            '<div class="form-group"><label>API Key</label><input type="text" id="cpApiKey" placeholder="Only if anti-bypass is enabled - generate at dashboard.work.ink/developer"></div>';
    } else if (p === 'lootlabs') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpAntiBypass" checked> 🛡️ Anti Bypass = Generates encrypted target URLs per visitor. Enter your API token in the next box to use this feature.</label></div>' +
            '<div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="cpAdvAntiBypass"> 🚀 Advanced Anti-Bypass = Detects certain bypasses through a lootlabs postback API.</label></div>' +
            '<div class="form-group"><label>API Key</label><input type="text" id="cpApiKey" placeholder="creators.lootlabs.gg/profile after logging in"></div>' +
            '<div class="form-group"><label>Postback URL</label><input type="text" id="cpPostbackUrl" placeholder="For Advanced Anti Bypass - put this on your lootlabs dashboard (advanced). Do not share!"></div>';
    } else if (p === 'shrtfly' || p === 'shrinkearn') {
        var name = p === 'shrtfly' ? 'ShrtFly' : 'ShrinkEarn';
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpDynamicUrl" checked> 🔀 Dynamic URL = Generates single-use unique URLs for every visitor. Can be used as an anti-bypass feature (links are not auto-deleted from your dashboard).</label></div>' +
            '<div class="form-group"><label>API Key</label><input type="text" id="cpApiKey" placeholder="Only required if dynamic URL is enabled (' + name + ' developer API page)"></div>';
    } else if (p === 'kicia' || p === 'rinku') {
        html += '<div class="form-group" style="margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="cpDynamicUrl" checked required> 🔀 Dynamic URL = Required.</label></div>' +
            '<div class="form-group"><label>API Key = Required</label><input type="text" id="cpApiKey"></div>';
    }
    html += '</div>';
    box.innerHTML = html;
}

function confirmAddCheckpoint(id) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var name = document.getElementById('cpName').value.trim();
    var shortUrl = document.getElementById('cpShortUrl').value.trim();
    var provider = document.getElementById('cpProvider').value;
    if (!name) { window.showNotification('Error', 'Checkpoint name is required.', 'error'); return; }
    if (!shortUrl) { window.showNotification('Error', 'Short URL is required.', 'error'); return; }
    if (!provider) { window.showNotification('Error', 'Select a provider.', 'error'); return; }
    var plan = (window.PLAN_CONFIGS && PLAN_CONFIGS[(window.currentUser && currentUser.plan) || 'Basic']) || PLAN_CONFIGS['Basic'];
    var d = found.data;
    if (plan.checkpoints !== Infinity && totalCheckpointsUsed(d) >= plan.checkpoints) {
        window.showNotification('Plan Limit', 'You reached your Total Checkpoints limit (' + plan.checkpoints + ').', 'error');
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
    saveRewardsData(d);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    openCheckpointManagerUI(id);
    window.showNotification('Checkpoint Added', '"' + name + '" added.', 'success');
}

function moveCheckpoint(id, index, dir) {
    var found = findReward(id);
    if (!found) return;
    var cps = found.reward.checkpoints;
    var ni = index + dir;
    if (ni < 0 || ni >= cps.length) return;
    var tmp = cps[index]; cps[index] = cps[ni]; cps[ni] = tmp;
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    openCheckpointManagerUI(id);
}

function deleteCheckpoint(id, index) {
    if (!confirm('Delete this checkpoint?')) return;
    var found = findReward(id);
    if (!found) return;
    found.reward.checkpoints.splice(index, 1);
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    openCheckpointManagerUI(id);
    window.showNotification('Deleted', 'Checkpoint deleted.', 'warning');
}

function editCheckpointUI(id, index) {
    var found = findReward(id);
    if (!found) return;
    var r = found.reward;
    var cp = r.checkpoints[index];
    if (!cp) return;
    var path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    var verifyUrl = window.location.origin + path + 'checkpoint.html?r=' + encodeRewardCfg(r) + '&c=' + index;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 620px; padding: 28px; max-height:92vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:20px; margin:0 0 10px 0;">✏️ Edit Checkpoint</h2>
            <div class="provider-panel">
                <div class="field-hint">Copy this URL and paste it in the provider's dashboard as the target of the link you created. This is the URL that will be used to verify the completion of the checkpoint.</div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <input type="text" value="${verifyUrl}" readonly style="flex:1; font-family:monospace; font-size:11px;">
                    <button onclick="copyText('${verifyUrl}')" class="btn btn-primary">📋 Copy</button>
                </div>
            </div>
            <div class="form-group" style="margin-top:14px;"><label>Checkpoint Name</label><input type="text" id="editCpName" value="${cp.name.replace(/"/g, '&quot;')}"></div>
            <div class="form-group"><label>Short URL</label><input type="text" id="editCpUrl" value="${cp.shortUrl}"></div>
            <div class="form-group"><label>Provider</label><input type="text" value="${(REWARD_PROVIDERS.find(function(p){return p.id===cp.provider;})||{}).name || cp.provider}" readonly></div>
            <div style="display:flex; gap:8px; margin-top:14px;">
                <button onclick="confirmEditCheckpoint('${id}',${index})" class="btn btn-primary" style="flex:1;">💾 Save</button>
                <button onclick="clearCheckpointStats('${id}',${index})" class="btn btn-close-dropdown" style="flex:1;">🧹 Clear Stats</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmEditCheckpoint(id, index) {
    var found = findReward(id);
    if (!found) return;
    var cp = found.reward.checkpoints[index];
    if (!cp) return;
    cp.name = document.getElementById('editCpName').value.trim() || cp.name;
    cp.shortUrl = document.getElementById('editCpUrl').value.trim() || cp.shortUrl;
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    renderRewardsTab();
    openCheckpointManagerUI(id);
    window.showNotification('Saved', 'Checkpoint updated.', 'success');
}

function clearCheckpointStats(id, index) {
    var found = findReward(id);
    if (!found) return;
    var cp = found.reward.checkpoints[index];
    if (!cp) return;
    cp.completed = 0; cp.cancelled = 0; cp.avgTimeSec = 0;
    saveRewardsData(found.data);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    openCheckpointManagerUI(id);
    window.showNotification('Stats Cleared', 'Checkpoint stats reset.', 'info');
}

// expose to main.js inline onclick handlers
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
window.encodeRewardCfg = encodeRewardCfg;
window.rewardHash = rewardHash;
window.loadRewardsData = loadRewardsData;

export { initRewards, renderRewardsTab, openCreateRewardUI };

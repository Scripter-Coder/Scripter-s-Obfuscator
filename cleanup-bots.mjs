// ONE-TIME CLOUD CLEANUP (run after deploying the hardened worker):
//   1. Purges the ~1230 bot junk accounts from the KV users map
//   2. Rebuilds YOUR owner record with a clean plan + admin flags
//   3. Verifies login works with your password
//
// Usage:
//   node cleanup-bots.mjs                 (dry run - shows what WOULD be deleted)
//   node cleanup-bots.mjs --apply         (actually performs the cleanup)
//   OWNER_PW=yourpassword node cleanup-bots.mjs --apply   (sets the owner
//       password; if omitted a random one is generated and printed - use
//       it to log in, then change it in Settings)
import { readFileSync } from 'fs';

const WORKER = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const OWNER_EMAIL = 'dubovikstanislav51@gmail.com';
const APPLY = process.argv.includes('--apply');

// real accounts to KEEP - everything else in the current KV is bot junk
// (KV records hold only profile/plan data; scripts live in localStorage,
// so dropping a record does NOT delete anyone's scripts)
const KEEP_EXTRA = [
    OWNER_EMAIL,
    'proscripter1005@gmail.com',  // real signup (troll name but real user)
    'proscripter1004@gmail.com',
    'st1mlx@gmail.com', 'st1mlx0@gmail.com', 'st1mlx1@gmail.com', 'st1mlx2@gmail.com',
    'stimix@gmail.com'
];

function looksBot(u, email) {
    const un = String(u.username || '');
    if (KEEP_EXTRA.includes(email)) return false;
    // numeric-only usernames 1..50 (bulk-created test/bot rows)
    if (/^\d{1,3}$/.test(un)) return true;
    // 'scripter 0.xxx' junk
    if (/^scripter 0\.\d+/.test(un)) return true;
    // keyboard-mash usernames (curly braces are never typed by humans)
    if (/[{}]/.test(un) || /[{}]/.test(email)) return true;
    // 1987 epoch-junk createdAt
    if (String(u.createdAt || '').startsWith('1987')) return true;
    // random-char email local part: 7+ mixed-case letters+digits with no
    // dictionary shape (e.g. 'kO8dx4d1U@...', 'RQohNHCGDXOQ@...')
    const local = email.split('@')[0];
    if (local.length >= 6 && /[A-Z]/.test(local) && /[a-z]/.test(local) && /\d/.test(local)) return true;
    if (/^[A-Za-z]{10,20}$/.test(local) && /[A-Z]{2,}/.test(local)) return true; // 'RQohNHCGDXOQ'
    // super-short junk emails (no TLD, 'a', 'noob', ...)
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return true;
    return false;
}

async function main() {
    // 1. owner login (raw access code)
    const login = await (await fetch(WORKER + '/sh/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ScripterHub' })
    })).json();
    if (!login.ok) throw new Error('owner login failed: ' + (login.error || 'unknown'));
    const token = login.token;
    console.log('owner token: OK');

    // 2. pull the users map
    const data = await (await fetch(WORKER + '/sh/users?token=' + encodeURIComponent(token))).json();
    if (!data.ok) throw new Error('users pull failed: ' + (data.error || 'unknown'));
    const map = data.users;
    const emails = Object.keys(map);
    console.log('accounts in cloud:', emails.length);

    // 3. classify - strict: ONLY the known real accounts survive. Every
    //    other record was created by the bot flood (random usernames,
    //    random emails, junk dates).
    const keep = {}, drop = [];
    for (const e of emails) {
        const u = map[e];
        if (KEEP_EXTRA.includes(e)) { keep[e] = u; continue; }
        drop.push(e);
    }
    console.log('KEEP:', Object.keys(keep).length, ' DROP (bots):', drop.length);
    if (!APPLY) {
        console.log('\nDRY RUN - no changes made. Sample of what would be dropped:');
        drop.slice(0, 15).forEach(e => console.log('  -', e, '|', String(map[e].username || '').slice(0, 40)));
        console.log('  ... and', Math.max(0, drop.length - 15), 'more');
        console.log('\nKEPT accounts:');
        Object.keys(keep).forEach(e => console.log('  +', e, '|', String(keep[e].username || '').slice(0, 40)));
        console.log('\nRe-run with --apply to perform the cleanup.');
        return;
    }

    // 4. rebuild the owner record ONLY if it is missing or corrupted
    //    (junk plan / stripped admin flags). If it already looks healthy,
    //    keep it AS-IS - resetting the password here would kill the
    //    owner's session on every device.
    const ownerOld = map[OWNER_EMAIL] || {};
    const planJunk = !ownerOld.plan || String(ownerOld.plan).length > 40;
    const flagsMissing = !ownerOld.isAdmin || !ownerOld.isScripter;
    if (planJunk || flagsMissing || !ownerOld.id) {
        const pw = process.env.OWNER_PW || ('SH-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10));
        keep[OWNER_EMAIL] = {
            id: ownerOld.id || 'user_scripter',
            email: OWNER_EMAIL,
            username: 'Scripter',
            password: btoa(pw),
            plan: 'Custom',
            description: 'Owner',
            createdAt: ownerOld.createdAt || new Date().toISOString(),
            isAdmin: true,
            isScripter: true,
            profileImage: '', bannerImage: '',
            theme: 'default',
            stats: { projects: { used: 0, max: Infinity }, keys: { used: 0, max: Infinity }, scripts: { used: 0, max: Infinity }, fileSize: { used: 0, max: Infinity } },
            disabled: false
        };
        console.log('owner record rebuilt (plan=Custom, isAdmin=true)');
        if (!process.env.OWNER_PW) {
            console.log('NEW OWNER PASSWORD:', pw);
            console.log('Save it NOW - it is shown only once.');
        }
    } else {
        console.log('owner record healthy - kept as-is (password unchanged)');
    }
    console.log('owner record ready (plan=Custom, isAdmin=true)');

    // 5. push the cleaned map via the owner upsert-per-user? No - a full
    //    replace is cleaner: use /sh/users-clear with keep=<all kept emails>
    //    so nothing else is lost.
    const keepList = Object.keys(keep).join(',');
    const clr = await (await fetch(WORKER + '/sh/users-clear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, keep: keepList })
    })).json();
    if (!clr.ok) throw new Error('users-clear failed: ' + (clr.error || 'unknown'));
    console.log('bot accounts purged, kept map saved');

    // 6. re-add the owner record fields (users-clear copies existing
    //    records; the rebuilt record still needs to be upserted)
    const up = await (await fetch(WORKER + '/sh/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: OWNER_EMAIL, user: keep[OWNER_EMAIL] })
    })).json();
    console.log('owner upsert:', up.ok ? 'OK' : 'FAILED ' + (up.error || ''));

    // 7. verify login with the new password
    const li = await (await fetch(WORKER + '/sh/user-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername: OWNER_EMAIL, password: btoa(pw) })
    })).json();
    console.log('owner login check:', li.ok ? 'OK (user token issued)' : 'FAILED ' + (li.error || ''));
    if (!process.env.OWNER_PW) {
        console.log('\n==============================================');
        console.log('NEW OWNER PASSWORD:', pw);
        console.log('Save it NOW - it is shown only once. Log in with it,');
        console.log('then change it in Settings if you want.');
        console.log('==============================================');
    }
    // 8. final count
    const after = await (await fetch(WORKER + '/sh/users?token=' + encodeURIComponent(token))).json();
    if (after.ok) console.log('accounts after cleanup:', Object.keys(after.users).length);
}

main().catch(e => { console.error('CLEANUP FAILED:', e.message); process.exit(1); });
